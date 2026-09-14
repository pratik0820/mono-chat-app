import { useCallback, useEffect, useRef, useState } from 'react';

import { isStompConnected, onAppForeground, subscribeToPresence } from '@/api/stompClient';

/**
 * Hook that tracks online users via the presence topic.
 *
 * Subscribes to `/topic/presence` and maintains a set of online user IDs.
 * Broadcast by the backend's PresenceListener on connect/disconnect events.
 *
 * Only subscribes when STOMP is actually connected. If STOMP connects later
 * (e.g. after backgrounding), it will re-subscribe via the app foreground listener.
 */
export function usePresence() {
  const [onlineUserIds, setOnlineUserIds] = useState<Set<number>>(new Set());
  const subscribedRef = useRef(false);

  const handlePresenceMessage = useCallback((frame: any) => {
    try {
      const data = JSON.parse(frame.body);
      const ids: number[] = data.onlineUserIds ?? [];
      setOnlineUserIds(new Set(ids));
    } catch (err) {
      console.error('[usePresence] Failed to parse presence message:', err);
    }
  }, []);

  useEffect(() => {
    // Only subscribe if STOMP is already connected
    if (isStompConnected()) {
      subscribeToPresence(handlePresenceMessage);
      subscribedRef.current = true;
    }

    // When app comes to foreground, re-subscribe if needed
    const unsub = onAppForeground(() => {
      if (isStompConnected() && !subscribedRef.current) {
        subscribeToPresence(handlePresenceMessage);
        subscribedRef.current = true;
      }
    });

    return () => {
      unsub();
      subscribedRef.current = false;
    };
  }, [handlePresenceMessage]);

  const isOnline = useCallback(
    (userId: number) => onlineUserIds.has(userId),
    [onlineUserIds]
  );

  return { onlineUserIds, isOnline };
}
