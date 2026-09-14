import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { EMOJI_CATEGORIES, QUICK_EMOJIS, type EmojiCategory } from '@/data/emojis';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface EmojiPickerProps {
  /** Called when an emoji is selected — inserts into the text input */
  onSelect: (emoji: string) => void;
  /** Height of the picker panel */
  panelHeight?: number;
}

const SPRING_CONFIG = { damping: 20, stiffness: 200, mass: 0.8 };
const EMOJI_SIZE = 42;
const EMOJI_COLUMNS = 8;

export function EmojiPicker({ onSelect, panelHeight = 320 }: EmojiPickerProps) {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(0);

  // Filter emojis by search query
  const filteredEmojis = useMemo(() => {
    if (!search.trim()) {
      return EMOJI_CATEGORIES[selectedCategory]?.emojis ?? [];
    }
    // Search across all categories
    const query = search.toLowerCase();
    return EMOJI_CATEGORIES.flatMap((cat) => cat.emojis).filter(
      (_, i) => true // We don't have names, just return all for now
    );
  }, [search, selectedCategory]);

  const handleSelect = useCallback(
    (emoji: string) => {
      onSelect(emoji);
    },
    [onSelect]
  );

  const renderEmoji = useCallback(
    ({ item }: { item: string }) => (
      <Pressable
        onPress={() => handleSelect(item)}
        style={({ pressed }) => [
          styles.emojiButton,
          pressed && { backgroundColor: theme.backgroundSelected },
        ]}>
        <ThemedText style={styles.emojiText}>{item}</ThemedText>
      </Pressable>
    ),
    [handleSelect, theme]
  );

  const keyExtractor = useCallback((item: string, index: number) => `${item}-${index}`, []);

  return (
    <View
      style={[
        styles.container,
        { height: panelHeight, backgroundColor: theme.backgroundElement, borderTopColor: theme.backgroundSelected },
      ]}>
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search emoji..."
          placeholderTextColor={theme.textSecondary}
          style={[styles.searchInput, { color: theme.text, backgroundColor: theme.background }]}
        />
      </View>

      {/* Category tabs */}
      {!search.trim() && (
        <View style={styles.categoryTabs}>
          <FlatList
            data={EMOJI_CATEGORIES}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.name}
            contentContainerStyle={styles.categoryTabsContent}
            renderItem={({ item, index }) => (
              <Pressable
                onPress={() => setSelectedCategory(index)}
                style={[
                  styles.categoryTab,
                  selectedCategory === index && {
                    backgroundColor: theme.backgroundSelected,
                    borderBottomColor: theme.text,
                  },
                ]}>
                <ThemedText style={styles.categoryTabIcon}>{item.icon}</ThemedText>
              </Pressable>
            )}
          />
        </View>
      )}

      {/* Quick access row */}
      {!search.trim() && selectedCategory === 0 && (
        <View style={styles.quickRow}>
          {QUICK_EMOJIS.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => handleSelect(emoji)}
              style={({ pressed }) => [
                styles.quickEmoji,
                pressed && { backgroundColor: theme.backgroundSelected },
              ]}>
              <ThemedText style={styles.quickEmojiText}>{emoji}</ThemedText>
            </Pressable>
          ))}
        </View>
      )}

      {/* Emoji grid */}
      <FlatList
        data={filteredEmojis}
        renderItem={renderEmoji}
        keyExtractor={keyExtractor}
        numColumns={EMOJI_COLUMNS}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.emojiGrid}
        style={styles.emojiList}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  searchContainer: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
  },
  searchInput: {
    height: 36,
    borderRadius: 18,
    paddingHorizontal: Spacing.three,
    fontSize: 15,
  },
  categoryTabs: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  categoryTabsContent: {
    gap: Spacing.one,
  },
  categoryTab: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  categoryTabIcon: {
    fontSize: 20,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.one,
    gap: 2,
  },
  quickEmoji: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  quickEmojiText: {
    fontSize: 20,
  },
  emojiList: {
    flex: 1,
  },
  emojiGrid: {
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.two,
  },
  emojiButton: {
    width: EMOJI_SIZE,
    height: EMOJI_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  emojiText: {
    fontSize: 26,
  },
});
