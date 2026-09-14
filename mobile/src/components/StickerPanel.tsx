import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  listStickerSets,
  getStickersInSet,
  type StickerSetDto,
  type StickerDto,
} from '@/api/client';

interface StickerPanelProps {
  /** Called when a sticker is selected — sends the image URL */
  onSelect: (imageUrl: string) => void;
  panelHeight?: number;
}

/**
 * Built-in local sticker set (no server needed).
 * These are emoji-style stickers using Unicode characters rendered large.
 */
const LOCAL_STICKERS: StickerDto[] = [
  { id: -1, setId: 0, imageUrl: '😀', sortOrder: 0 },
  { id: -2, setId: 0, imageUrl: '😂', sortOrder: 1 },
  { id: -3, setId: 0, imageUrl: '❤️', sortOrder: 2 },
  { id: -4, setId: 0, imageUrl: '🔥', sortOrder: 3 },
  { id: -5, setId: 0, imageUrl: '👍', sortOrder: 4 },
  { id: -6, setId: 0, imageUrl: '🎉', sortOrder: 5 },
  { id: -7, setId: 0, imageUrl: '😢', sortOrder: 6 },
  { id: -8, setId: 0, imageUrl: '😡', sortOrder: 7 },
  { id: -9, setId: 0, imageUrl: '🤔', sortOrder: 8 },
  { id: -10, setId: 0, imageUrl: '😎', sortOrder: 9 },
  { id: -11, setId: 0, imageUrl: '🙏', sortOrder: 10 },
  { id: -12, setId: 0, imageUrl: '💯', sortOrder: 11 },
  { id: -13, setId: 0, imageUrl: '✨', sortOrder: 12 },
  { id: -14, setId: 0, imageUrl: '👀', sortOrder: 13 },
  { id: -15, setId: 0, imageUrl: '🫡', sortOrder: 14 },
  { id: -16, setId: 0, imageUrl: '🤡', sortOrder: 15 },
  { id: -17, setId: 0, imageUrl: '💀', sortOrder: 16 },
  { id: -18, setId: 0, imageUrl: '🥳', sortOrder: 17 },
  { id: -19, setId: 0, imageUrl: '🫶', sortOrder: 18 },
  { id: -20, setId: 0, imageUrl: '💪', sortOrder: 19 },
];

const STICKER_COLUMNS = 4;
const STICKER_SIZE = 72;

export function StickerPanel({ onSelect, panelHeight = 320 }: StickerPanelProps) {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState<'local' | 'remote'>('local');
  const [remoteSets, setRemoteSets] = useState<StickerSetDto[]>([]);
  const [selectedSet, setSelectedSet] = useState<StickerSetDto | null>(null);
  const [remoteStickers, setRemoteStickers] = useState<StickerDto[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch remote sticker sets when switching to remote tab
  useEffect(() => {
    if (activeTab === 'remote' && remoteSets.length === 0) {
      setLoading(true);
      listStickerSets()
        .then(setRemoteSets)
        .catch(() => setRemoteSets([]))
        .finally(() => setLoading(false));
    }
  }, [activeTab, remoteSets.length]);

  // Fetch stickers in a set when selected
  useEffect(() => {
    if (selectedSet) {
      setLoading(true);
      getStickersInSet(selectedSet.id)
        .then((data) => setRemoteStickers(data.stickers))
        .catch(() => setRemoteStickers([]))
        .finally(() => setLoading(false));
    }
  }, [selectedSet]);

  const handleSelectSticker = useCallback(
    (imageUrl: string) => {
      onSelect(imageUrl);
    },
    [onSelect]
  );

  const renderLocalSticker = useCallback(
    ({ item }: { item: StickerDto }) => (
      <Pressable
        onPress={() => handleSelectSticker(item.imageUrl)}
        style={({ pressed }) => [
          styles.stickerButton,
          pressed && { backgroundColor: theme.backgroundSelected, transform: [{ scale: 1.1 }] },
        ]}>
        <ThemedText style={styles.stickerEmoji}>{item.imageUrl}</ThemedText>
      </Pressable>
    ),
    [handleSelectSticker, theme]
  );

  const renderRemoteSticker = useCallback(
    ({ item }: { item: StickerDto }) => (
      <Pressable
        onPress={() => handleSelectSticker(item.imageUrl)}
        style={({ pressed }) => [
          styles.stickerButton,
          pressed && { backgroundColor: theme.backgroundSelected, transform: [{ scale: 1.05 }] },
        ]}>
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.stickerImage}
          resizeMode="contain"
        />
      </Pressable>
    ),
    [handleSelectSticker, theme]
  );

  return (
    <View
      style={[
        styles.container,
        { height: panelHeight, backgroundColor: theme.backgroundElement, borderTopColor: theme.backgroundSelected },
      ]}>
      {/* Tab bar */}
      <View style={styles.tabBar}>
        <Pressable
          onPress={() => { setActiveTab('local'); setSelectedSet(null); }}
          style={[
            styles.tab,
            activeTab === 'local' && { borderBottomColor: theme.text },
          ]}>
          <ThemedText
            style={[
              styles.tabText,
              activeTab === 'local' && { color: theme.text },
            ]}>
            Stickers
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('remote')}
          style={[
            styles.tab,
            activeTab === 'remote' && { borderBottomColor: theme.text },
          ]}>
          <ThemedText
            style={[
              styles.tabText,
              activeTab === 'remote' && { color: theme.text },
            ]}>
            More
          </ThemedText>
        </Pressable>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.textSecondary} />
        </View>
      ) : activeTab === 'local' ? (
        /* Local stickers grid */
        <FlatList
          key="local-stickers"
          data={LOCAL_STICKERS}
          renderItem={renderLocalSticker}
          keyExtractor={(item) => String(item.id)}
          numColumns={STICKER_COLUMNS}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.stickerGrid}
        />
      ) : selectedSet ? (
        /* Stickers in the selected remote set */
        <View>
          <Pressable
            onPress={() => setSelectedSet(null)}
            style={styles.backButton}>
            <ThemedText style={[styles.backText, { color: theme.text }]}>
              ← {selectedSet.name}
            </ThemedText>
          </Pressable>
          <FlatList
            key={`remote-set-${selectedSet?.id}`}
            data={remoteStickers}
            renderItem={renderRemoteSticker}
            keyExtractor={(item) => String(item.id)}
            numColumns={STICKER_COLUMNS}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.stickerGrid}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <ThemedText themeColor="textSecondary">No stickers in this set</ThemedText>
              </View>
            }
          />
        </View>
      ) : (
        /* Remote sticker sets list */
        <FlatList
          key="remote-sets"
          data={remoteSets}
          keyExtractor={(item) => String(item.id)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.setsList}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setSelectedSet(item)}
              style={[styles.setCard, { backgroundColor: theme.background }]}>
              <Image
                source={{ uri: item.thumbnailUrl }}
                style={styles.setThumbnail}
                resizeMode="cover"
              />
              <ThemedText style={[styles.setName, { color: theme.text }]}>
                {item.name}
              </ThemedText>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <ThemedText themeColor="textSecondary">
                No remote sticker sets available yet.
              </ThemedText>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.three,
  },
  tab: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerGrid: {
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.two,
  },
  stickerButton: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 2,
    borderRadius: 12,
    maxWidth: STICKER_SIZE,
  },
  stickerEmoji: {
    fontSize: 36,
  },
  stickerImage: {
    width: STICKER_SIZE - 12,
    height: STICKER_SIZE - 12,
  },
  backButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  backText: {
    fontSize: 15,
    fontWeight: '500',
  },
  setsList: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  setCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two,
    borderRadius: 12,
    gap: Spacing.two,
  },
  setThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  setName: {
    fontSize: 15,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.six,
  },
});
