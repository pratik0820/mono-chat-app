import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { router } from 'expo-router';

/**
 * How notifications behave while the app is in the FOREGROUND.
 *
 * Note (SDK 53+): `shouldShowBanner`/`shouldShowList` replace the old
 * `shouldShowAlert`. Banner = transient heads-up overlay; list = notification
 * tray entry.
 *
 * A push for the room the user is currently VIEWING is suppressed entirely —
 * its messages already arrive live via STOMP. (The backend also skips online
 * users; this client-side guard only covers the small presence-race window.)
 */
export function configureForegroundNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const forCurrentRoom = isPushForCurrentRoom(
        notification.request.content.data as Record<string, unknown> | undefined
      );
      return {
        shouldShowBanner: !forCurrentRoom,
        shouldShowList: !forCurrentRoom,
        shouldPlaySound: !forCurrentRoom,
        shouldSetBadge: false,
      };
    },
  });
}

/**
 * The room currently on screen, if any. The chat screen sets this on mount
 * and clears it on unmount, so a push for the room the user is already
 * viewing can be suppressed (its content is already live via STOMP).
 */
let currentRoomId: string | null = null;

export function setCurrentRoomId(roomId: string | null) {
  currentRoomId = roomId;
}

/**
 * Navigate into a room when a push is tapped.
 * Handles BOTH cold start (app killed → tap opens the app) and warm start
 * (app running in background → tap resumes it).
 *
 * Mount once, from the root layout.
 */
export function useNotificationTapNavigation() {
  // Cold start: the notification the user tapped to open the app.
  // useLastNotificationResponse() resolves after this hook first mounts,
  // which is exactly the cold-start tap case.
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (lastResponse?.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
      navigateToRoom(lastResponse.notification.request.content.data);
    }
  }, [lastResponse]);

  useEffect(() => {
    // Warm start: app already running in background → tap event fires here.
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      navigateToRoom(response.notification.request.content.data);
    });
    return () => sub.remove();
  }, []);
}

/**
 * True when a push is for the room currently on screen (suppress it —
 * the user is already looking at the live conversation).
 */
export function isPushForCurrentRoom(data: Record<string, unknown> | undefined): boolean {
  const roomId = data?.roomId;
  return typeof roomId === 'string' && roomId.length > 0 && roomId === currentRoomId;
}

function navigateToRoom(data: Record<string, unknown> | undefined) {
  // FCM data payloads are string-only maps — roomId always arrives as a string.
  const roomId = data?.roomId;
  if (typeof roomId === 'string' && roomId.length > 0) {
    router.push(`/rooms/${roomId}`);
  }
}
