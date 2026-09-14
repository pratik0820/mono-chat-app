import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { EmojiPicker } from '@/components/EmojiPicker';
import { StickerPanel } from '@/components/StickerPanel';
import { GifPanel } from '@/components/GifPanel';

export type MediaPanelType = 'emoji' | 'sticker' | 'gif' | null;

interface MediaInputBarProps {
  inputText: string;
  onInputChange: (text: string) => void;
  onSend: () => void;
  onSendMedia: (content: string, type: 'STICKER' | 'GIF') => void;
  sending: boolean;
  maxLength?: number;
}

const PANEL_HEIGHT = 340;
const SPRING_CONFIG = { damping: 22, stiffness: 250, mass: 0.9 };

export function MediaInputBar({
  inputText,
  onInputChange,
  onSend,
  onSendMedia,
  sending,
  maxLength = 2000,
}: MediaInputBarProps) {
  const theme = useTheme();
  const [activePanel, setActivePanel] = useState<MediaPanelType>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const panelHeight = useSharedValue(0);

  // Animate panel height
  const animatedPanelStyle = useAnimatedStyle(() => ({
    height: panelHeight.value,
    overflow: 'hidden' as const,
  }));

  // Toggle panel
  const togglePanel = useCallback((panel: MediaPanelType) => {
    if (activePanel === panel) {
      // Close panel
      setActivePanel(null);
      panelHeight.value = withSpring(0, SPRING_CONFIG);
    } else {
      // Open panel, close keyboard
      Keyboard.dismiss();
      setActivePanel(panel);
      panelHeight.value = withSpring(PANEL_HEIGHT, SPRING_CONFIG);
    }
  }, [activePanel, panelHeight]);

  // Handle emoji selection — insert at cursor
  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      onInputChange(inputText + emoji);
    },
    [inputText, onInputChange]
  );

  // Handle sticker selection — send immediately
  const handleStickerSelect = useCallback(
    (imageUrl: string) => {
      onSendMedia(imageUrl, 'STICKER');
    },
    [onSendMedia]
  );

  // Handle GIF selection — send immediately
  const handleGifSelect = useCallback(
    (gifUrl: string) => {
      onSendMedia(gifUrl, 'GIF');
    },
    [onSendMedia]
  );

  // Track keyboard visibility (panel is closed by onFocus on the main input)
  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setKeyboardVisible(true);
      }
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardVisible(false);
      }
    );
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return (
    <View>
      {/* Media panels */}
      <Animated.View style={animatedPanelStyle}>
        {activePanel === 'emoji' && (
          <EmojiPicker onSelect={handleEmojiSelect} panelHeight={PANEL_HEIGHT} />
        )}
        {activePanel === 'sticker' && (
          <StickerPanel onSelect={handleStickerSelect} panelHeight={PANEL_HEIGHT} />
        )}
        {activePanel === 'gif' && (
          <GifPanel onSelect={handleGifSelect} panelHeight={PANEL_HEIGHT} />
        )}
      </Animated.View>

      {/* Input bar */}
      <View
        style={[
          styles.inputBar,
          { backgroundColor: theme.backgroundElement, borderTopColor: theme.backgroundSelected },
        ]}>
        {/* Emoji button */}
        <Pressable
          onPress={() => togglePanel('emoji')}
          style={({ pressed }) => [
            styles.mediaButton,
            pressed && { opacity: 0.6 },
            activePanel === 'emoji' && { backgroundColor: theme.backgroundSelected },
          ]}>
          <ThemedText style={styles.mediaButtonText}>😊</ThemedText>
        </Pressable>

        {/* Sticker button */}
        <Pressable
          onPress={() => togglePanel('sticker')}
          style={({ pressed }) => [
            styles.mediaButton,
            pressed && { opacity: 0.6 },
            activePanel === 'sticker' && { backgroundColor: theme.backgroundSelected },
          ]}>
          <ThemedText style={styles.mediaButtonText}>🎨</ThemedText>
        </Pressable>

        {/* GIF button */}
        <Pressable
          onPress={() => togglePanel('gif')}
          style={({ pressed }) => [
            styles.mediaButton,
            pressed && { opacity: 0.6 },
            activePanel === 'gif' && { backgroundColor: theme.backgroundSelected },
          ]}>
          <ThemedText style={styles.mediaButtonText}>🎬</ThemedText>
        </Pressable>

        {/* Text input */}
        <TextInput
          ref={inputRef}
          value={inputText}
          onChangeText={onInputChange}
          placeholder="Type a message..."
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text }]}
          multiline
          maxLength={maxLength}
          onFocus={() => {
            if (activePanel) {
              setActivePanel(null);
              panelHeight.value = withSpring(0, SPRING_CONFIG);
            }
          }}
        />

        {/* Send button */}
        <Pressable
          onPress={() => {
            onSend();
            if (activePanel) {
              setActivePanel(null);
              panelHeight.value = withSpring(0, SPRING_CONFIG);
            }
          }}
          disabled={sending || !inputText.trim()}
          style={({ pressed }) => [
            styles.sendButton,
            {
              backgroundColor: pressed ? theme.backgroundSelected : theme.text,
              opacity: sending || !inputText.trim() ? 0.4 : 1,
            },
          ]}>
          <ThemedText style={[styles.sendText, { color: theme.background }]}>
            {sending ? '...' : '↑'}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.one,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  mediaButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaButtonText: {
    fontSize: 22,
  },
  input: {
    flex: 1,
    fontSize: 16,
    maxHeight: 100,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: {
    fontSize: 20,
    fontWeight: '700',
  },
});
