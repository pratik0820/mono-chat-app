import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  searchGifs,
  getTrendingGifs,
  searchMemes,
  getTrendingMemes,
  type GifResult,
} from '@/api/client';

interface GifPanelProps {
  /** Called when a GIF/meme is selected — sends the URL */
  onSelect: (gifUrl: string) => void;
  panelHeight?: number;
}

type TabType = 'gifs' | 'memes';

const GIF_COLUMNS = 2;
const TRENDING_SEARCHES = ['funny', 'love', 'celebration', 'thumbs up', 'reaction', 'dance'];
const MEME_SEARCHES = ['bollywood', 'cricket', 'funny', 'anime', 'movie', 'cat'];

export function GifPanel({ onSelect, panelHeight = 340 }: GifPanelProps) {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('gifs');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextPage, setNextPage] = useState('0');
  const [hasSearched, setHasSearched] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load trending content on mount and when tab changes
  useEffect(() => {
    setLoading(true);
    setResults([]);
    setHasSearched(false);
    setSearch('');

    const fetchTrending = activeTab === 'gifs' ? getTrendingGifs : getTrendingMemes;
    fetchTrending(20, 1)
      .then((data) => {
        setResults(data.results);
        setNextPage(data.next);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeTab]);

  const doSearch = useCallback(
    async (query: string, page = 1, append = false) => {
      if (!query.trim()) return;
      setLoading(true);
      try {
        const data = activeTab === 'gifs'
        ? await searchGifs(query, 20, page)
        : await searchMemes(query, 20, page);
        if (append) {
          setResults((prev) => [...prev, ...data.results]);
        } else {
          setResults(data.results);
        }
        setNextPage(data.next);
        setHasSearched(true);
      } catch (err) {
        console.error('[GifPanel] Search failed:', err);
      } finally {
        setLoading(false);
      }
    },
    [activeTab]
  );

  const handleSearchChange = useCallback(
    (text: string) => {
      setSearch(text);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (text.trim().length > 0) {
        searchTimeoutRef.current = setTimeout(() => {
          doSearch(text);
        }, 500);
      } else {
        // Reset to trending
        setHasSearched(false);
        const fetchTrending = activeTab === 'gifs' ? getTrendingGifs : getTrendingMemes;
        fetchTrending(20, 1)
          .then((data) => {
            setResults(data.results);
            setNextPage(data.next);
          })
          .catch(() => {});
      }
    },
    [doSearch, activeTab]
  );

  const handleLoadMore = useCallback(() => {
    if (nextPage !== '0' && !loading && search.trim()) {
      doSearch(search, Number(nextPage), true);
    }
  }, [nextPage, loading, search, doSearch]);

  const handleSelect = useCallback(
    (gifUrl: string) => {
      onSelect(gifUrl);
    },
    [onSelect]
  );

  const renderGif = useCallback(
    ({ item }: { item: GifResult }) => (
      <Pressable
        onPress={() => handleSelect(item.gifUrl)}
        style={({ pressed }) => [
          styles.gifButton,
          pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] },
        ]}>
        <Image
          source={{ uri: item.previewUrl || item.gifUrl }}
          style={styles.gifImage}
          resizeMode="cover"
        />
      </Pressable>
    ),
    [handleSelect]
  );

  const trendingSearches = activeTab === 'gifs' ? TRENDING_SEARCHES : MEME_SEARCHES;

  return (
    <View
      style={[
        styles.container,
        { height: panelHeight, backgroundColor: theme.backgroundElement, borderTopColor: theme.backgroundSelected },
      ]}>
      {/* Tab bar */}
      <View style={styles.tabBar}>
        <Pressable
          onPress={() => setActiveTab('gifs')}
          style={[
            styles.tab,
            activeTab === 'gifs' && { borderBottomColor: theme.text },
          ]}>
          <ThemedText
            style={[
              styles.tabText,
              activeTab === 'gifs' && { color: theme.text },
            ]}>
            GIFs
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('memes')}
          style={[
            styles.tab,
            activeTab === 'memes' && { borderBottomColor: theme.text },
          ]}>
          <ThemedText
            style={[
              styles.tabText,
              activeTab === 'memes' && { color: theme.text },
            ]}>
            Memes 🔥
          </ThemedText>
        </Pressable>
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <View style={[styles.searchRow, { backgroundColor: theme.background }]}>
          <TextInput
            value={search}
            onChangeText={handleSearchChange}
            onSubmitEditing={() => {
              if (search.trim()) doSearch(search);
            }}
            placeholder={activeTab === 'gifs' ? 'Search GIFs...' : 'Search Memes...'}
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text }]}
            returnKeyType="search"
            blurOnSubmit={false}
          />
          <Pressable
            onPress={() => {
              if (search.trim()) doSearch(search);
            }}
            style={({ pressed }) => [
              styles.searchButton,
              pressed && { opacity: 0.6 },
            ]}>
            <ThemedText style={[styles.searchButtonText, { color: theme.textSecondary }]}>
              🔍
            </ThemedText>
          </Pressable>
        </View>
      </View>

      {/* Trending searches (shown when no search and no results) */}
      {!hasSearched && results.length === 0 && !loading && (
        <View style={styles.trendingContainer}>
          <ThemedText themeColor="textSecondary" style={styles.trendingTitle}>
            {activeTab === 'gifs' ? 'Trending searches' : 'Popular memes'}
          </ThemedText>
          <View style={styles.trendingRow}>
            {trendingSearches.map((term) => (
              <Pressable
                key={term}
                onPress={() => {
                  setSearch(term);
                  doSearch(term);
                }}
                style={[styles.trendingChip, { backgroundColor: theme.background }]}>
                <ThemedText style={[styles.trendingChipText, { color: theme.text }]}>
                  {term}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Loading indicator */}
      {loading && results.length === 0 && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.textSecondary} />
        </View>
      )}

      {/* GIF/Meme results grid */}
      {!loading || results.length > 0 ? (
        <FlatList
          data={results}
          renderItem={renderGif}
          keyExtractor={(item) => item.id}
          numColumns={GIF_COLUMNS}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.gifGrid}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loading && results.length > 0 ? (
              <ActivityIndicator size="small" color={theme.textSecondary} style={styles.loadingMore} />
            ) : null
          }
          ListEmptyComponent={
            hasSearched && !loading ? (
              <View style={styles.emptyContainer}>
                <ThemedText themeColor="textSecondary">
                  No {activeTab === 'gifs' ? 'GIFs' : 'memes'} found for "{search}"
                </ThemedText>
              </View>
            ) : null
          }
        />
      ) : null}
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
  searchContainer: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.one,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
  },
  searchInput: {
    flex: 1,
    height: 40,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  searchButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  searchButtonText: {
    fontSize: 18,
  },
  trendingContainer: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  trendingTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: Spacing.one,
  },
  trendingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  trendingChip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 16,
  },
  trendingChipText: {
    fontSize: 13,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gifGrid: {
    paddingHorizontal: Spacing.one,
    paddingBottom: Spacing.two,
  },
  gifButton: {
    flex: 1,
    margin: 2,
    borderRadius: 8,
    overflow: 'hidden',
    aspectRatio: 1,
  },
  gifImage: {
    width: '100%',
    height: '100%',
  },
  loadingMore: {
    paddingVertical: Spacing.three,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.six,
  },
});
