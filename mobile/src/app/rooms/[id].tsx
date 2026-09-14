import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getRoom, getStoredUser, type MessageDto, type RoomDto, type UserDto } from '@/api/client';
import { MediaInputBar } from '@/components/MediaInputBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { isSingleEmoji } from '@/data/emojis';
import { useChat } from '@/hooks/useChat';
import { useTheme } from '@/hooks/use-theme';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const roomId = Number(id);
  const router = useRouter();
  const theme = useTheme();

  const [user, setUser] = useState<UserDto | null>(null);
  const [room, setRoom] = useState<RoomDto | null>(null);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  });

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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ThemedText style={styles.backText}>←</ThemedText>
          </Pressable>
          <View style={styles.headerCenter}>
            <ThemedText type="title" style={styles.title}>
              {room?.name ?? `Room #${roomId}`}
            </ThemedText>
            <View style={styles.connectionStatus}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: connected ? '#4ade80' : '#f87171' },
                ]}
              />
              <ThemedText themeColor="textSecondary" style={styles.statusText}>
                {connected ? 'Connected' : 'Disconnected'}
              </ThemedText>
            </View>
          </View>
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
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
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
        </KeyboardAvoidingView>
      </SafeAreaView>
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
