import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  API_URL,
  getRoom,
  getRoomTheme,
  getStoredUser,
  uploadRoomThemeImage,
  clearRoomTheme,
  setRoomTheme as apiSetRoomTheme,
  type MessageDto,
  type RoomDto,
  type UserDto,
} from '@/api/client';
import { MediaInputBar } from '@/components/MediaInputBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ThemeSheet } from '@/components/ThemeSheet';
import { Spacing } from '@/constants/theme';
import {
  type BuiltinThemeId,
  getBuiltinTheme,
  resolveRoomTheme,
} from '@/constants/chatThemes';
import { isSingleEmoji } from '@/data/emojis';
import { setCurrentRoomId } from '@/lib/notificationHandlers';
import { useChat } from '@/hooks/useChat';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useTheme } from '@/hooks/use-theme';

/** Prefix backend-relative theme image URLs (e.g. /files/xyz.jpg) with the API origin. */
function themeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  // Local (optimistic) or absolute URLs pass through untouched
  if (/^(http|file|content)/.test(url)) return url;
  // API_URL has no trailing slash and url starts with '/', so simple concat works
  return `${API_URL}${url}`;
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const roomId = Number(id);
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();

  const [user, setUser] = useState<UserDto | null>(null);
  const [room, setRoom] = useState<RoomDto | null>(null);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);

  // ─── Chat theme state ─────────────────────────────────
  const [themeSheetVisible, setThemeSheetVisible] = useState(false);
  const [roomTheme, setRoomTheme] = useState<{ themeId: string | null; imageUrl: string | null }>({
    themeId: null,
    imageUrl: null,
  });

  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track the room on screen so foreground push banners for THIS room can be
  // suppressed (its messages already arrive live via STOMP). Cleared on unmount.
  useEffect(() => {
    setCurrentRoomId(id);
    return () => setCurrentRoomId(null);
  }, [id]);

  // Get current user and room info
  useEffect(() => {
    (async () => {
      const currentUser = await getStoredUser();
      if (!currentUser) {
        router.replace('/');
        return;
      }
      setUser(currentUser);

      try {
        const roomData = await getRoom(roomId);
        setRoom(roomData);
      } catch {
        // Room not found or not a member — keep default title
      }
    })();
  }, [router, roomId]);

  // Load the room theme once the user is known
  const fetchRoomTheme = useCallback(async () => {
    try {
      const t = await getRoomTheme(roomId);
      setRoomTheme({ themeId: t?.themeId ?? null, imageUrl: t?.imageUrl ?? null });
    } catch {
      // Backend without theme endpoints yet — fall back to default silently
      setRoomTheme({ themeId: null, imageUrl: null });
    }
  }, [roomId]);

  useEffect(() => {
    if (user) fetchRoomTheme();
  }, [user, fetchRoomTheme]);

  // Use the useChat hook for real-time messaging
  const {
    messages,
    loading,
    loadingMore,
    hasMore,
    connected,
    typingUsers,
    sendMessage: wsSendMessage,
    sendMediaMessage,
    loadOlder,
    sendTyping,
  } = useChat({
    roomId,
    userId: user?.id ?? 0,
    onThemeUpdated: (t) => {
      // Someone (possibly us — ignore own echoes) changed the room theme
      setRoomTheme({ themeId: t.themeId ?? null, imageUrl: t.imageUrl ?? null });
    },
  });

  // ─── Chat theme handlers ──────────────────────────────
  const handleApplyBuiltinTheme = useCallback(
    async (id: BuiltinThemeId) => {
      // Optimistic update; revert on failure
      const prev = roomTheme;
      setRoomTheme({ themeId: id, imageUrl: null });
      try {
        await apiSetRoomTheme(roomId, id);
      } catch (e) {
        console.error('[ChatScreen] Failed to set theme:', e);
        setRoomTheme(prev);
        throw e; // let ThemeSheet show the error
      }
    },
    [roomId, roomTheme]
  );

  const handleApplyImageTheme = useCallback(
    async (localUri: string) => {
      const prev = roomTheme;
      // Optimistic: show the picked image immediately
      setRoomTheme({ themeId: null, imageUrl: localUri });
      try {
        const t = await uploadRoomThemeImage(roomId, localUri, `room-${roomId}-theme.jpg`);
        setRoomTheme({ themeId: t.themeId ?? null, imageUrl: t.imageUrl ?? localUri });
      } catch (e) {
        setRoomTheme(prev);
        throw e;
      }
    },
    [roomId, roomTheme]
  );

  const handleRemoveTheme = useCallback(async () => {
    const prev = roomTheme;
    setRoomTheme({ themeId: null, imageUrl: null });
    try {
      await clearRoomTheme(roomId);
    } catch (e) {
      setRoomTheme(prev);
      throw e;
    }
  }, [roomId, roomTheme]);

  // Send text message
  const handleSend = useCallback(async () => {
    const content = inputText.trim();
    if (!content || sending || !user) return;

    setInputText('');
    setSending(true);
    try {
      await wsSendMessage(content);
    } catch {
      setInputText(content); // restore on failure
    } finally {
      setSending(false);
    }
  }, [inputText, sending, user, wsSendMessage]);

  // Send media message (sticker or GIF)
  const handleSendMedia = useCallback(
    async (content: string, type: 'STICKER' | 'GIF') => {
      if (sending || !user) return;

      setSending(true);
      try {
        await sendMediaMessage(content, type);
      } catch (err) {
        console.error('[ChatScreen] Failed to send media:', err);
      } finally {
        setSending(false);
      }
    },
    [sending, user, sendMediaMessage]
  );

  // Handle typing indicator with debounce
  const handleInputChange = useCallback(
    (text: string) => {
      setInputText(text);

      // Send typing indicator (debounced)
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      sendTyping(true);
      typingTimeoutRef.current = setTimeout(() => {
        sendTyping(false);
      }, 2000);
    },
    [sendTyping]
  );

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // Render a single message bubble
  const renderMessage = useCallback(
    ({ item }: { item: MessageDto }) => {
      const isOwn = item.senderId === user?.id;

      // ─── Sticker message ────────────────────────────────
      if (item.type === 'STICKER') {
        return (
          <View
            style={[
              styles.mediaMessage,
              isOwn ? styles.ownMediaMessage : styles.otherMediaMessage,
            ]}>
            {!isOwn && (
              <ThemedText
                style={[styles.senderName, { color: theme.textSecondary }]}>
                {item.username}
              </ThemedText>
            )}
            {/* Check if it's an emoji sticker (short content) or image URL */}
            {item.content.startsWith('http') ? (
              <Image
                source={{ uri: item.content }}
                style={styles.stickerImage}
                resizeMode="contain"
              />
            ) : (
              <ThemedText style={styles.stickerEmoji}>{item.content}</ThemedText>
            )}
          </View>
        );
      }

      // ─── GIF message ────────────────────────────────────
      if (item.type === 'GIF') {
        return (
          <View
            style={[
              styles.mediaMessage,
              isOwn ? styles.ownMediaMessage : styles.otherMediaMessage,
            ]}>
            {!isOwn && (
              <ThemedText
                style={[styles.senderName, { color: theme.textSecondary }]}>
                {item.username}
              </ThemedText>
            )}
            <Image
              source={{ uri: item.content }}
              style={styles.gifImage}
              resizeMode="cover"
            />
          </View>
        );
      }

      // ─── Text message (with large emoji detection) ──────
      const content = item.content;
      const isLargeEmoji = isSingleEmoji(content);

      return (
        <View
          style={[
            styles.messageBubble,
            isOwn ? styles.ownMessage : styles.otherMessage,
            { backgroundColor: isOwn ? theme.text : theme.backgroundElement },
          ]}>
          {!isOwn && (
            <ThemedText
              style={[styles.senderName, { color: theme.textSecondary }]}>
              {item.username}
            </ThemedText>
          )}
          <ThemedText
            style={[
              styles.messageText,
              isLargeEmoji && styles.largeEmojiText,
              { color: isOwn ? theme.background : theme.text },
            ]}>
            {content}
          </ThemedText>
        </View>
      );
    },
    [user, theme]
  );

  if (loading || !user) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ActivityIndicator size="large" color={theme.text} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  // The keyboard overlaps the input because edge-to-edge Android disables
  // adjustResize (making KeyboardAvoidingView unreliable). Pad the layout
  // manually with the measured keyboard height instead.
  const keyboardPadding = Math.max(0, keyboardHeight - insets.bottom);

  // ─── Resolved room theme (background) ─────────────────
  const bg = resolveRoomTheme(roomTheme.themeId, roomTheme.imageUrl);
  const isCustomBg = bg.kind === 'image';
  const accentText =
    bg.kind === 'builtin' && bg.builtin && bg.builtin.id !== 'default'
      ? bg.builtin.textOnTheme
      : null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Room theme background layer (behind everything) */}
        {isCustomBg && bg.imageUrl ? (
          <ExpoImage
            source={{ uri: themeImageUrl(bg.imageUrl) ?? undefined }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <LinearGradient
            colors={
              bg.builtin && bg.builtin.id !== 'default'
                ? bg.builtin.colors
                : [theme.background, theme.background]
            }
            style={StyleSheet.absoluteFill}
          />
        )}
        {/* Scrim keeps text readable over busy custom photos */}
        {isCustomBg && <View style={[StyleSheet.absoluteFill, styles.themeScrim]} />}

        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ThemedText style={[styles.backText, accentText ? { color: accentText } : null]}>
              ←
            </ThemedText>
          </Pressable>
          <View style={styles.headerCenter}>
            <ThemedText type="title" style={[styles.title, accentText ? { color: accentText } : null]}>
              {room?.name ?? `Room #${roomId}`}
            </ThemedText>
            <View style={styles.connectionStatus}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: connected ? '#4ade80' : '#f87171' },
                ]}
              />
              <ThemedText
                themeColor="textSecondary"
                style={[styles.statusText, accentText ? { color: accentText } : null]}>
                {connected ? 'Connected' : 'Disconnected'}
              </ThemedText>
            </View>
          </View>
          {/* Theme picker button */}
          <Pressable
            onPress={() => setThemeSheetVisible(true)}
            style={({ pressed }) => [styles.themeButton, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Change chat theme">
            <ThemedText style={styles.themeButtonText}>🖼️</ThemedText>
          </Pressable>
        </View>

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <View style={styles.typingBar}>
            <ThemedText themeColor="textSecondary" style={styles.typingText}>
              {typingUsers.length === 1
                ? `${typingUsers[0].username} is typing...`
                : `${typingUsers.map((u) => u.username).join(', ')} are typing...`}
            </ThemedText>
          </View>
        )}

        {/* Messages */}
        <View style={styles.flex}>
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => String(item.id)}
            inverted
            contentContainerStyle={styles.messageList}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.5}
            renderItem={renderMessage}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            ListFooterComponent={
              loadingMore ? (
                <ActivityIndicator
                  size="small"
                  color={theme.textSecondary}
                  style={styles.loadingMore}
                />
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <ThemedText themeColor="textSecondary" style={styles.emptyText}>
                  No messages yet. Say hello!
                </ThemedText>
              </View>
            }
          />

          {/* Input bar with media buttons */}
          <MediaInputBar
            inputText={inputText}
            onInputChange={handleInputChange}
            onSend={handleSend}
            onSendMedia={handleSendMedia}
            sending={sending}
          />
          {/* Pad the bottom by the keyboard height so the input stays visible
              while typing, and by the nav-bar inset so nothing hides behind
              gesture/3-button navigation. */}
          <View style={{ height: keyboardPadding + insets.bottom }} />
        </View>
      </SafeAreaView>

      {/* Theme picker sheet */}
      <ThemeSheet
        visible={themeSheetVisible}
        current={roomTheme}
        onClose={() => setThemeSheetVisible(false)}
        onApplyBuiltin={handleApplyBuiltinTheme}
        onApplyImage={handleApplyImageTheme}
        onRemove={handleRemoveTheme}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    gap: Spacing.two,
  },
  backButton: {
    padding: Spacing.two,
  },
  themeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeButtonText: {
    fontSize: 20,
  },
  themeScrim: {
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  backText: {
    fontSize: 24,
  },
  headerCenter: {
    flex: 1,
  },
  title: {
    fontSize: 20,
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
  },
  typingBar: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.one,
  },
  typingText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  messageList: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  loadingMore: {
    paddingVertical: Spacing.three,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.six,
  },
  emptyText: {
    textAlign: 'center',
  },
  // ─── Text message bubble ──────────────────────────────
  messageBubble: {
    maxWidth: '80%',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 16,
    marginVertical: Spacing.one,
  },
  ownMessage: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  otherMessage: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  senderName: {
    fontSize: 12,
    marginBottom: Spacing.half,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  largeEmojiText: {
    fontSize: 48,
    lineHeight: 56,
  },
  // ─── Sticker message ──────────────────────────────────
  mediaMessage: {
    marginVertical: Spacing.one,
  },
  ownMediaMessage: {
    alignSelf: 'flex-end',
  },
  otherMediaMessage: {
    alignSelf: 'flex-start',
  },
  stickerEmoji: {
    fontSize: 80,
    lineHeight: 90,
  },
  stickerImage: {
    width: 150,
    height: 150,
    borderRadius: 12,
  },
  // ─── GIF message ──────────────────────────────────────
  gifImage: {
    width: 200,
    height: 160,
    borderRadius: 12,
  },
});
