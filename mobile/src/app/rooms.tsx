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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AxiosError } from 'axios';

import {
  clearAuth,
  createRoom,
  deleteRoom,
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
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<UserDto | null>(null);
  const [rooms, setRooms] = useState<RoomDto[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [stompConnected, setStompConnected] = useState(false);
  const { onlineUserIds } = usePresence();
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [myRoomIds, setMyRoomIds] = useState<Set<number>>(new Set());

  // Delete-room flow (owner only)
  const [menuRoom, setMenuRoom] = useState<RoomDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  async function handleDeleteRoom() {
    if (!menuRoom) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteRoom(menuRoom.id);
      removeRoomLocally(menuRoom.id);
      setMenuRoom(null);
    } catch (err) {
      const status = err instanceof AxiosError ? err.response?.status : undefined;
      if (status === 404) {
        // Room was already deleted — just remove it from the list locally.
        removeRoomLocally(menuRoom.id);
        setMenuRoom(null);
      } else if (status === 403) {
        setDeleteError('Only the room creator can delete this room.');
      } else {
        setDeleteError('Failed to delete room. Try again.');
      }
    } finally {
      setDeleting(false);
    }
  }

  function removeRoomLocally(roomId: number) {
    setRooms((prev) => prev.filter((r) => r.id !== roomId));
    setMyRoomIds((prev) => {
      const next = new Set(prev);
      next.delete(roomId);
      return next;
    });
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
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
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
          <Pressable
            onPress={() => {
              setError(null);
              setModalVisible(true);
            }}
            style={({ pressed }) => [
              styles.fab,
              { backgroundColor: theme.text },
              pressed && { opacity: 0.8 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Create a new room">
            <ThemedText style={[styles.fabIcon, { color: theme.background }]}>
              +
            </ThemedText>
          </Pressable>
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
            const isOwner = user != null && item.createdBy === user.id;
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
                  {isOwner && (
                    <Pressable
                      onPress={() => {
                        setDeleteError(null);
                        setMenuRoom(item);
                      }}
                      style={styles.moreButton}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Room options for ${item.name}`}>
                      <ThemedText style={styles.moreIcon}>⋮</ThemedText>
                    </Pressable>
                  )}
                </View>
              </Pressable>
            );
          }}
        />

        {/* marginBottom keeps the button above the system navigation bar
            (gesture bar or 3-button nav) — it used to be hidden behind it. */}
        <Button
          title="Log out"
          onPress={handleLogout}
          style={{ marginBottom: insets.bottom }}
        />
      </SafeAreaView>
      {/* Create Room Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <Pressable
            style={[
              styles.modalContent,
              { backgroundColor: theme.background, paddingBottom: Spacing.five + insets.bottom },
            ]}
            onPress={(e) => e.stopPropagation()}>
            <View style={[styles.modalHandle, { backgroundColor: theme.backgroundSelected }]} />
            <ThemedText type="title" style={styles.modalTitle}>
              New Room
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.modalSubtitle}>
              Pick a name people will recognise
            </ThemedText>
            <TextInput
              placeholder="e.g. Weekend Football"
              placeholderTextColor={theme.textSecondary}
              value={newRoomName}
              onChangeText={setNewRoomName}
              autoFocus
              onSubmitEditing={handleCreateRoom}
              returnKeyType="done"
              style={[styles.modalInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
            />
            {error && (
              <ThemedText themeColor="textSecondary" style={styles.error}>
                {error}
              </ThemedText>
            )}
            <View style={styles.modalButtons}>
              <View style={styles.modalButtonWrap}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setModalVisible(false)}
                  disabled={creating}
                />
              </View>
              <View style={styles.modalButtonWrap}>
                <Button
                  title="Create"
                  onPress={handleCreateRoom}
                  loading={creating}
                  disabled={!newRoomName.trim()}
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      {/* Delete Room Modal (owner only) */}
      <Modal
        visible={menuRoom !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuRoom(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setMenuRoom(null)}>
          <Pressable
            style={[
              styles.modalContent,
              { backgroundColor: theme.background, paddingBottom: Spacing.five + insets.bottom },
            ]}
            onPress={(e) => e.stopPropagation()}>
            <View style={[styles.modalHandle, { backgroundColor: theme.backgroundSelected }]} />
            <ThemedText type="title" style={styles.modalTitle}>
              Delete room
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.modalSubtitle}>
              “{menuRoom?.name ?? ''}” and all its messages will be permanently deleted. This
              cannot be undone.
            </ThemedText>
            {deleteError && (
              <ThemedText themeColor="textSecondary" style={styles.error}>
                {deleteError}
              </ThemedText>
            )}
            <View style={styles.modalButtons}>
              <View style={styles.modalButtonWrap}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setMenuRoom(null)}
                  disabled={deleting}
                />
              </View>
              <View style={styles.modalButtonWrap}>
                <Button
                  title="Delete"
                  variant="danger"
                  onPress={handleDeleteRoom}
                  loading={deleting}
                />
              </View>
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
    gap: Spacing.two,
  },
  roomName: {
    fontSize: 18,
    fontWeight: '600',
    flexShrink: 1,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  moreButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreIcon: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
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
  fab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  fabIcon: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '400',
    marginTop: -2,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.five,
    gap: Spacing.two,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.two,
  },
  modalTitle: {
    textAlign: 'center',
  },
  modalSubtitle: {
    textAlign: 'center',
    marginBottom: Spacing.two,
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
    marginTop: Spacing.two,
  },
  modalButtonWrap: {
    flex: 1,
  },
  error: {
    textAlign: 'center',
  },
});
