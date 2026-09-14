import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  clearAuth,
  createRoom,
  getStoredToken,
  getStoredUser,
  joinRoom,
  listAllRooms,
  listRooms,
  logoutRequest,
  type RoomDto,
  type UserDto,
} from '@/api/client';
import { isStompConnected } from '@/api/stompClient';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { usePresence } from '@/hooks/usePresence';
import { useTheme } from '@/hooks/use-theme';

export default function RoomsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [user, setUser] = useState<UserDto | null>(null);
  const [rooms, setRooms] = useState<RoomDto[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [stompConnected, setStompConnected] = useState(false);
  const { onlineUserIds } = usePresence();
  const [loading, setLoading] = useState(true)
  const [modalVisible, setModalVisible] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

const [myRoomIds, setMyRoomIds] = useState<Set<number>>(new Set());

const fetchRooms = useCallback(async () => {
    try {
      const allRooms = await listAllRooms();
      setRooms(allRooms);
      const myRooms = await listRooms();
      setMyRoomIds(new Set(myRooms.map((r) => r.id)));
    } catch {
      // silently fail — user can pull to refresh
    }
  }, []);

  // Pull-to-refresh handler
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchRooms();
    } finally {
      setRefreshing(false);
    }
  }, [fetchRooms]);

useEffect(() => {
    (async () => {
      const token = await getStoredToken();
      if (!token) {
        router.replace('/');
        return;
      }
      setUser(await getStoredUser());
      await fetchRooms();
      setStompConnected(isStompConnected());
      setLoading(false);
    })();
  }, [router, fetchRooms]);

  async function handleLogout() {
    await logoutRequest();
    router.replace('/');
  }

  async function handleCreateRoom() {
    const name = newRoomName.trim();
    if (!name) {
      setError('Enter a room name.');
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const room = await createRoom(name);
      setRooms((prev) => [room, ...prev]);
      setMyRoomIds((prev) => new Set(prev).add(room.id));
      setNewRoomName('');
      setModalVisible(false);
    } catch {
      setError('Failed to create room. Try again.');
    } finally {
      setCreating(false);
    }
  }

  async function handleJoinRoom(roomId: number) {
    try {
      await joinRoom(roomId);
      setMyRoomIds((prev) => new Set(prev).add(roomId));
    } catch {
      // silently fail
    }
  }

  function handleOpenRoom(roomId: number) {
    router.push(`/rooms/${roomId}`);
  }

  if (loading) {
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
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View>
            <ThemedText type="title" style={styles.title}>
              Mono
            </ThemedText>
            {user && (
              <ThemedText themeColor="textSecondary" style={styles.subtitle}>
                Logged in as {user.username}
              </ThemedText>
            )}
          </View>
          <Button title="+" onPress={() => setModalVisible(true)} />
        </View>

        <FlatList
          data={rooms}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          ListEmptyComponent={
            <ThemedView type="backgroundElement" style={styles.empty}>
              <ThemedText themeColor="textSecondary" style={styles.center}>
                No rooms yet. Create one to get started!
              </ThemedText>
            </ThemedView>
          }
          renderItem={({ item }) => {
            const isMember = myRoomIds.has(item.id);
            return (
              <Pressable
                onPress={() => isMember && handleOpenRoom(item.id)}
                style={({ pressed }) => [
                  styles.roomItem,
                  { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
                ]}>
                <View style={styles.roomRow}>
                  <ThemedText style={styles.roomName}>{item.name}</ThemedText>
                  {isMember ? (
                    stompConnected && (
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: onlineUserIds.size > 0 ? '#4ade80' : '#9ca3af' },
                        ]}
                      />
                    )
                  ) : (
                    <Pressable
                      onPress={() => handleJoinRoom(item.id)}
                      style={styles.joinButton}>
                      <ThemedText style={styles.joinText}>Join</ThemedText>
                    </Pressable>
                  )}
                </View>
              </Pressable>
            );
          }}
        />

        <Button title="Log out" onPress={handleLogout} />
      </SafeAreaView>

      {/* Create Room Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <Pressable style={[styles.modalContent, { backgroundColor: theme.background }]} onPress={(e) => e.stopPropagation()}>
            <ThemedText type="title" style={styles.modalTitle}>
              New Room
            </ThemedText>
            <TextInput
              placeholder="Room name"
              placeholderTextColor={theme.textSecondary}
              value={newRoomName}
              onChangeText={setNewRoomName}
              autoFocus
              style={[styles.modalInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
            />
            {error && (
              <ThemedText themeColor="textSecondary" style={styles.error}>
                {error}
              </ThemedText>
            )}
            <View style={styles.modalButtons}>
              <Button title="Cancel" onPress={() => setModalVisible(false)} />
              <Button title="Create" onPress={handleCreateRoom} loading={creating} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 32,
    lineHeight: 40,
  },
  subtitle: {
    marginBottom: Spacing.one,
  },
  list: {
    flex: 1,
    gap: Spacing.two,
  },
  empty: {
    borderRadius: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.six,
  },
  center: {
    textAlign: 'center',
  },
  roomItem: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: 12,
  },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roomName: {
    fontSize: 18,
    fontWeight: '600',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  joinButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
  },
  joinText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '85%',
    borderRadius: 16,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  modalTitle: {
    textAlign: 'center',
  },
  modalInput: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  error: {
    textAlign: 'center',
  },
});