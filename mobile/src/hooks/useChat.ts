import { useCallback, useEffect, useRef, useState } from 'react';

import { getMessages, MessageDto, MessageType, sendMessage as apiSendMessage } from '@/api/client';
import {
  connectStomp,
  disconnectStomp,
  isStompConnected,
  sendChatMessage,
  sendTypingIndicator,
  subscribeToRoom,
  subscribeToTyping,
  unsubscribe,
} from '@/api/stompClient';

interface UseChatOptions {
  roomId: number;
  userId: number;
}

interface TypingUser {
  userId: number;
  username: string;
}

interface UseChatReturn {
  messages: MessageDto[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  connected: boolean;
  typingUsers: TypingUser[];
  sendMessage: (content: string) => Promise<void>;
  sendMediaMessage: (content: string, type: 'STICKER' | 'GIF') => Promise<void>;
  loadOlder: () => Promise<void>;
  sendTyping: (typing: boolean) => void;
}

/**
 * Hook for real-time chat in a room.
 *
 * - Fetches message history via REST on mount
 * - Connects to WebSocket and subscribes to room topic
 * - Merges REST history with live WebSocket messages
 * - Handles reconnection and cleanup
 */
export function useChat({ roomId, userId }: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [connected, setConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;

  // Track message IDs to avoid duplicates
  const messageIdsRef = useRef(new Set<number>());

  // Keep a ref to latest messages for use inside callbacks without re-subscribing
  const messagesRef = useRef<MessageDto[]>(messages);
  messagesRef.current = messages;

  // Fetch initial message history via REST
  // REST returns newest-first (ORDER BY created_at DESC) — correct for inverted FlatList
  const fetchHistory = useCallback(async () => {
    try {
      const data = await getMessages(roomId, 50);
      setMessages(data);
      data.forEach((m) => messageIdsRef.current.add(m.id));
      if (data.length < 50) setHasMore(false);
    } catch (err) {
      console.error('[useChat] Failed to fetch history:', err);
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  // Load older messages (keyset pagination)
  const loadOlder = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      // The oldest message is at the end of our array
      const oldestId = messages[messages.length - 1].id;
      const older = await getMessages(roomId, 50, oldestId);
      if (older.length === 0) {
        setHasMore(false);
      } else {
        // REST returns newest-first — append as-is for inverted FlatList
        setMessages((prev) => [...prev, ...older]);
        older.forEach((m) => messageIdsRef.current.add(m.id));
        if (older.length < 50) setHasMore(false);
      }
    } catch (err) {
      console.error('[useChat] Failed to load older messages:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [roomId, messages, loadingMore, hasMore]);

  // Send a message via WebSocket, falling back to REST API if not connected
  const sendMessage = useCallback(
    async (content: string, type: MessageType = 'USER') => {
      if (!content.trim()) return;

      // Optimistic update: add message to list immediately
      const optimisticMsg: MessageDto = {
        id: Date.now(), // Temporary ID
        roomId,
        senderId: userId,
        username: 'You',
        content: content.trim(),
        type,
        createdAt: new Date().toISOString(),
      };
      messageIdsRef.current.add(optimisticMsg.id);
      setMessages((prev) => [optimisticMsg, ...prev]);

      // Try WebSocket first; fall back to REST if not connected
      const sent = sendChatMessage(roomId, content.trim(), type);
      if (!sent) {
        console.log('[useChat] STOMP not connected — falling back to REST API');
        try {
          const saved = await apiSendMessage(roomId, content.trim(), type);
          // Replace optimistic message with server response
          messageIdsRef.current.add(saved.id);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === optimisticMsg.id ? saved : m
            )
          );
        } catch (err) {
          console.error('[useChat] REST fallback failed:', err);
          // Remove the optimistic message and its tracking ID on failure
          messageIdsRef.current.delete(optimisticMsg.id);
          setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
        }
      }
    },
    [roomId, userId]
  );

  // Send a media message (sticker or GIF)
  const sendMediaMessage = useCallback(
    async (content: string, type: 'STICKER' | 'GIF') => {
      await sendMessage(content, type);
    },
    [sendMessage]
  );

  // Send typing indicator
  const sendTyping = useCallback(
    (typing: boolean) => {
      sendTypingIndicator(roomId, typing);
    },
    [roomId]
  );

  // Handle incoming WebSocket message
  const handleWsMessage = useCallback(
    (frame: any) => {
      try {
        const msg: MessageDto = JSON.parse(frame.body);

        // Check if we already have this message by exact ID
        if (messageIdsRef.current.has(msg.id)) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msg.id ? msg : m
            )
          );
          return;
        }

        // Check if this matches a pending optimistic message (Date.now() ID > 1T)
        // by matching content + sender. Replace the optimistic with the real one.
        const optimisticMatch = (m: MessageDto) =>
          m.id > 1000000000000 && m.content === msg.content && m.senderId === msg.senderId;
        const matched = messagesRef.current.find(optimisticMatch);
        if (matched) {
          messageIdsRef.current.delete(matched.id);
          messageIdsRef.current.add(msg.id);
          setMessages((prev) =>
            prev.map((m) => (optimisticMatch(m) ? msg : m))
          );
          return;
        }

        messageIdsRef.current.add(msg.id);
        setMessages((prev) => [msg, ...prev]);
      } catch (err) {
        console.error('[useChat] Failed to parse message:', err);
      }
    },
    []
  );

  // Connect and subscribe on mount
  useEffect(() => {
    let mounted = true;

    async function setup() {
      // First fetch history
      await fetchHistory();

      if (!mounted) return;

      // Then connect WebSocket
      const onConnect = () => {
        if (!mounted) return;
        setConnected(true);

        // Subscribe to room messages
        const msgSub = subscribeToRoom(roomId, handleWsMessage);
        if (!msgSub) {
          console.warn('[useChat] Failed to subscribe to room messages — STOMP not connected');
        }

        // Subscribe to typing indicators
        subscribeToTyping(roomId, (frame) => {
          try {
            const data = JSON.parse(frame.body);
            const typingUserId: number = data.userId;
            const typingUsername: string = data.username;
            const isTyping: boolean = data.typing;

            // Don't show our own typing
            if (typingUserId === userId) return;

            if (isTyping) {
              // Add user to typing list
              setTypingUsers((prev) => {
                if (prev.some((u) => u.userId === typingUserId)) return prev;
                return [...prev, { userId: typingUserId, username: typingUsername }];
              });

              // Clear existing timeout for this user
              const existing = typingTimeoutsRef.current.get(typingUserId);
              if (existing) clearTimeout(existing);

              // Auto-remove after 3 seconds
              const timeout = setTimeout(() => {
                setTypingUsers((prev) => prev.filter((u) => u.userId !== typingUserId));
                typingTimeoutsRef.current.delete(typingUserId);
              }, 3000);
              typingTimeoutsRef.current.set(typingUserId, timeout);
            } else {
              // Remove user from typing list
              setTypingUsers((prev) => prev.filter((u) => u.userId !== typingUserId));
              const existing = typingTimeoutsRef.current.get(typingUserId);
              if (existing) {
                clearTimeout(existing);
                typingTimeoutsRef.current.delete(typingUserId);
              }
            }
          } catch {}
        });
      };

      const onDisconnect = () => {
        if (!mounted) return;
        setConnected(false);
      };

      const onError = (error: any) => {
        console.error('[useChat] Connection error:', error);
      };

      if (isStompConnected()) {
        // Already connected, just subscribe
        onConnect();
      } else {
        await new Promise<void>((resolve) => {
          connectStomp(
            () => {
              onConnect();
              resolve();
            },
            onDisconnect,
            (error) => {
              console.error('[useChat] Connection error:', error);
              resolve();
            }
          );
        });
      }
    }

    setup();

    return () => {
      mounted = false;
      // Unsubscribe from this room's topics
      unsubscribe(`/topic/room.${roomId}`);
      unsubscribe(`/topic/room.${roomId}.typing`);
      messageIdsRef.current.clear();
      // Clear typing timeouts
      typingTimeoutsRef.current.forEach((t) => clearTimeout(t));
      typingTimeoutsRef.current.clear();
    };
  }, [roomId, fetchHistory, handleWsMessage]);

  return {
    messages,
    loading,
    loadingMore,
    hasMore,
    connected,
    typingUsers,
    sendMessage,
    sendMediaMessage,
    loadOlder,
    sendTyping,
  };
}
