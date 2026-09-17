# FEATURE 2 — Push Notifications: Frontend (Expo / React Native)

> **Scope:** everything that changes inside `mobile/` — dependencies, configuration, new files, UI/UX behavior, and the changes to existing screens.
> **Platforms:** **Android only** — iOS is out of scope for now (Expo Go on Android supports push; a dev build/APK is only needed for release testing).
> **Companion doc:** [`docs/FEATURE-2-push-notifications-BACKEND.md`](./FEATURE-2-push-notifications-BACKEND.md) — architecture decision, database, Spring Boot implementation, API contract, and phased delivery plan.
> **Stack:** Expo SDK 57, expo-router, `@stomp/stompjs`, axios. Grounded in the actual codebase: `mobile/src/api/stompClient.ts`, `mobile/src/hooks/useChat.ts`, `mobile/src/app/_layout.tsx`, `mobile/src/app/rooms/[id].tsx`.

---

## Table of Contents

1. [What the User Gets (UX Summary)](#1-what-the-user-gets-ux-summary)
2. [Prerequisites (one-time setup)](#2-prerequisites-one-time-setup)
3. [Dependency + app.json Changes](#3-dependency--appjson-changes)
4. [New File: `mobile/src/lib/pushToken.ts` — Registration](#4-new-file-mobilesrc-libpushtokents--registration)
5. [New File: `mobile/src/lib/notificationHandlers.ts` — Foreground Behavior + Tap Navigation](#5-new-file-mobilesrc-libnotificationhandlersts--foreground-behavior--tap-navigation)
6. [Changes to Existing Files](#6-changes-to-existing-files)
7. [UI / UX Design Details](#7-ui--ux-design-details)
8. [Runtime Behavior (Delivery Matrix)](#8-runtime-behavior-delivery-matrix)
9. [Frontend Testing](#9-frontend-testing)
10. [Risks & Gotchas (Frontend)](#10-risks--gotchas-frontend)
11. [Work Checklist](#11-work-checklist)

---

## 1. What the User Gets (UX Summary)

| Situation | What the user experiences |
|---|---|
| App open, inside the room | Message appears instantly via STOMP — **no push banner** (existing behavior, unchanged) |
| App open, different screen | Message arrives via STOMP; usually no banner (backend suppresses pushes to online users) |
| App backgrounded / killed | **OS notification banner**: title = room name, body = "Alice: message preview", sound + vibration |
| Tap on notification | App opens **directly into that room** (works from cold start and background) |
| Permission denied | App remains fully usable — push is a silent enhancement, no blocking dialogs after first ask |
| Logged out | No pushes; device token is removed from the backend |

The notification visual itself is **OS-rendered** (Android system UI) — we control its content (title, body, sound, channel, icon, color) but not its layout. There is **no custom in-app UI to design** beyond what's listed in §7.

---

## 2. Prerequisites (one-time setup)

| Step | Where | Notes |
|---|---|---|
| Firebase project + Android app registered | console.firebase.google.com | **Required only for EAS dev builds / release APKs** — Expo Go on Android works without it. Package name must match `app.json` → `android.package` (currently `com.anonymous.mono`). Download `google-services.json` → `mobile/google-services.json`. **Tip: set a real package id (e.g. `com.<you>.mono`) BEFORE creating the Firebase app** — FCM binds to it |
| Expo project ID | already present ✓ | `app.json` → `extra.eas.projectId` = `1cde9104-...` |
| Expo push token test tool | https://expo.dev/notifications | For verifying device-side setup before backend wiring (§9) |

> **iOS is out of scope.** When it ships later: Expo Go on iOS doesn't support push, so iOS would need a development build plus Apple Developer Program setup — none of that is needed for the Android-only rollout.

---

## 3. Dependency + app.json Changes

### 3.1 Install the package

```bash
npx expo install expo-notifications
```

(`expo-device` is already in `package.json` ✓. No axios changes — the existing `api/client.ts` interceptor attaches the JWT.)

### 3.2 `app.json` — add the config plugin

Add to the existing `plugins` array:

```json
["expo-notifications", { "color": "#208AEF", "defaultChannel": "messages" }]
```

Full resulting array:

```json
"plugins": [
  "expo-router",
  ["expo-image-picker", { "photosPermission": "Allows Mono to pick a photo as the chat background." }],
  ["expo-build-properties", { "android": { "usesCleartextTraffic": true } }],
  ["expo-splash-screen", { "backgroundColor": "#208AEF", "image": "./assets/images/splash-icon.png", "imageWidth": 76 }],
  ["expo-notifications", { "color": "#208AEF", "defaultChannel": "messages" }]
]
```

What the plugin does:

- Sets the small white notification icon and accent color (`#208AEF`, matching the splash background).
- Creates the default Android notification channel `messages` in the manifest.
- Android 13+ `POST_NOTIFICATIONS` runtime permission is requested by the JS API (`Notifications.requestPermissionsAsync()`) — no manifest hand-editing.

---

## 4. New File: `mobile/src/lib/pushToken.ts` — Registration

```ts
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import api from '@/api/client';

let registeredThisSession = false;

/**
 * Registers the device for push and syncs the token with the backend.
 * Idempotent — safe to call on every app launch and after every login.
 * Returns the Expo push token, or null if push is unavailable/declined.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') return null;          // no push on the web build
  if (!Device.isDevice) return null;               // push needs a physical device
  if (registeredThisSession) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return null;                                   // app remains fully usable without push
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    await api.post('/push-tokens', {
      token,
      platform: Platform.OS,                       // 'android' (iOS later — backend accepts 'android' only for now)
      deviceName: Device.deviceName ?? 'unknown',
    });
    registeredThisSession = true;
    return token;
  } catch (e) {
    console.warn('Push registration failed:', e);
    return null;
  }
}

/** Called on logout BEFORE clearing credentials. */
export async function unregisterPushToken(): Promise<void> {
  try {
    await api.delete('/push-tokens/current');
  } catch (e) {
    console.warn('Push unregister failed:', e);
  }
  registeredThisSession = false;
}
```

Design notes:

- **Idempotent by design** — the backend upserts `(user_id, token)`, so re-registering on every launch is cheap and handles token rotation after app updates.
- **Fail-open** — every failure path returns `null`; the chat app works fully without push.
- **One ask** — the OS permission dialog is requested once; if denied, we never nag (a settings hint could be added in Phase 3).
- **`deviceName`** is a debug aid stored with the token row (backend doc §4.1).

> **Android + Firebase note:** `getExpoPushTokenAsync()` on Android requires the Firebase linkage (`google-services.json` at `mobile/google-services.json`, package name matching `app.json` → `android.package`) and a development build. Without it the call throws — the `try/catch` keeps the app functional.

---

## 5. New File: `mobile/src/lib/notificationHandlers.ts` — Foreground Behavior + Tap Navigation

```ts
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { router } from 'expo-router';

/** How notifications behave while the app is FOREGROUND. */
export function configureForegroundNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,    // SDK 53+: replaces shouldShowAlert
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Suppresses banners for the room currently on screen (see §7.3). */
let currentRoomId: string | null = null;
export function setCurrentRoomId(roomId: string | null) {
  currentRoomId = roomId;
}

/**
 * Navigate into a room when a push is tapped.
 * Handles BOTH cold start (app killed → tap) and background tap.
 */
export function useNotificationTapNavigation() {
  // Cold start: the notification the user tapped to open the app
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (lastResponse?.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
      navigateToRoom(lastResponse.notification.request.content.data);
    }
  }, [lastResponse]);

  useEffect(() => {
    // Warm start: app already running in background → tap
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      navigateToRoom(response.notification.request.content.data);
    });
    return () => sub.remove();
  }, []);
}

function navigateToRoom(data: Record<string, unknown> | undefined) {
  const roomId = data?.roomId;
  if (typeof roomId === 'string' && roomId.length > 0) {
    router.push(`/rooms/${roomId}`);
  }
}
```

> **Why `roomId` must be a string in `data`:** FCM data payloads are string-only maps; anything else gets coerced or dropped. The backend sends `String.valueOf(roomId)` (backend doc §5.10) and the client treats it as a string.

---

## 6. Changes to Existing Files

| File | Change | Detail |
|---|---|---|
| `mobile/src/app/_layout.tsx` | **Wire-up** | After auth state confirms a logged-in user: call `configureForegroundNotifications()`, `registerForPushNotificationsAsync()`, and mount `useNotificationTapNavigation()` |
| `mobile/src/app/rooms/[id].tsx` | **1-line guard** | On mount: `setCurrentRoomId(id)`; on unmount: `setCurrentRoomId(null)` |
| `mobile/src/api/client.ts` (logout flow) | **Cleanup** | Call `await unregisterPushToken()` **before** clearing the stored JWT (order matters — the API call needs the token) |
| `mobile/src/hooks/useChat.ts` | **No change** | Live messages still arrive via STOMP; pushes are only for the disconnected case |
| `mobile/src/app/index.tsx` / `register.tsx` | **No change** | Registration is triggered from `_layout.tsx` after login state resolves, not from the auth screens |

---

## 7. UI / UX Design Details

### 7.1 Notification content (OS-rendered banner)

| Element | Value | Source |
|---|---|---|
| Title | Room name (e.g. "General") | Backend (`PushDispatcher`) |
| Body | `Alice: <first 100 chars of message>` (trailing `…` when truncated) | Backend |
| Privacy mode ON | Body becomes "You have a new message" (no sender/text preview on lock screen) | Backend config `push.privacy-mode` |
| Sound | `default` | Backend payload |
| Android channel | `messages` (name: "Messages", importance HIGH) | `app.json` plugin default |
| App icon / accent | Existing app icon, accent `#208AEF` | `app.json` plugin |
| Tap action | Deep link → `/rooms/{roomId}` | Client handler (§5) |

No custom in-app banner component is required — the OS renders everything. The only in-app behavioral UI is the suppression rule below.

### 7.2 Foreground suppression while viewing the room

- Module-scoped `currentRoomId` (§5) is updated by the chat screen on mount/unmount.
- If a push arrives whose `data.roomId` matches the room on screen, the foreground handler can skip showing the banner (the message is already visible via STOMP).
- The backend already excludes online users, so this guard only covers the small presence-race window (backend doc §3.4).

### 7.3 Deep-link navigation on tap

1. Push tapped (app killed or backgrounded).
2. Cold start: `useLastNotificationResponse()` fires after `_layout.tsx` mounts → `router.push('/rooms/{roomId}')`.
3. Warm start: `addNotificationResponseReceivedListener` fires immediately.
4. Chat screen mounts → `useChat` fetches REST history → STOMP subscribes → the missed message is in history.

### 7.4 What we deliberately do NOT build

- **No in-app notification list** — the OS notification tray covers it.
- **No badge count UI** — deferred to Phase 3 (needs an unread-count endpoint; backend doc §10).
- **No custom notification sounds/assets** — `default` sound; a custom `notification-icon.png` (white, transparent) can be added to the plugin config later as polish.
- **No iOS work** — no Info.plist/APNs/EAS iOS profile items anywhere in the checklist.
- **No settings UI for push** — Phase 3 nicety (toggle privacy mode / per-room mutes).

---

## 8. Runtime Behavior (Delivery Matrix)

| App state | Message delivery | Push? |
|---|---|---|
| Foreground, inside the room | STOMP, instant | Suppressed (backend + client guard) |
| Foreground, another screen | STOMP, instant | Banner allowed (usually suppressed — user is "online") |
| Backgrounded (socket dropped) | — | ✅ OS banner |
| Killed | — | ✅ OS banner |
| Push permission denied | STOMP only while open | ❌ — app remains fully functional |
| Logged out | — | ❌ — token removed on logout |

Double-display is impossible: the message list is fed by REST history + STOMP only; pushes never render as messages.

---

## 9. Frontend Testing

### 9.1 Quickest device-side verification (before any backend work)

1. Wire up §4–§6, run the app on a physical device, and copy the Expo push token (add a temporary `console.log(token)` or fetch it from the backend's `push_tokens` table once registered).
2. Open https://expo.dev/notifications, paste the token, send a test push.
3. If the banner appears, the device/credentials side is correct — then wire the backend (companion doc).

### 9.2 Manual test matrix (frontend side)

| # | Scenario | Expected |
|---|---|---|
| 1 | B's app open in room → A sends | B sees message in-app; **no** banner |
| 2 | B force-quits app → A sends | OS banner "RoomName — Alice: text"; tap cold-starts into room |
| 3 | B backgrounds app → A sends | OS banner; tap resumes app in room |
| 4 | B logs out → A sends | No push to B's old token |
| 5 | Same user on 2 devices, both offline | Both devices get the push |
| 6 | Permission denied → A sends | No push, no error; message visible after reopening |
| 7 | Privacy mode on → A sends | Banner shows "You have a new message", no preview |

Device notes (Android-only):

- **Android emulator:** works only on images *with Google Play* (FCM needs it); a physical device is ideal.
- **Expo Go (Android):** ✓ supported for development.
- **Release APK / EAS build:** requires the Firebase `google-services.json` wiring (§2) — Expo Go has Expo's own Firebase config built in.

---

## 10. Risks & Gotchas (Frontend)

1. **Aggressive OEM battery killers (Xiaomi, Realme, OPPO)** may delay or drop FCM delivery when the app is swiped away — test on at least one stock-Android device, and expect delayed pushes on aggressive OEMs.
2. **`data` payload strings only** — the client must treat `roomId` as a string (`typeof roomId === 'string'` guard in §5).
3. **Foreground handler keys changed in SDK 53+** — `shouldShowBanner`/`shouldShowList` replace `shouldShowAlert`; using the old key silently does nothing on SDK 57.
4. **Android requires Firebase linkage** — without `google-services.json` + matching package name, `getExpoPushTokenAsync()` throws on Android dev builds. (Expo Go on Android has Expo's own Firebase config and works without ours.)
5. **Logout ordering** — `unregisterPushToken()` must run while the JWT is still stored, or the `DELETE /api/push-tokens/current` call returns 401 and the stale token keeps receiving pushes for the previous user.
6. **`Device.isDevice` gate** — push silently no-ops on emulators without Play Services; that's intentional, not a bug.
7. **`usesCleartextTraffic: true` is dev-only** — unrelated to push, but note it when moving to `wss://` in production.

---

## 11. Work Checklist

- [ ] `npx expo install expo-notifications`
- [ ] Add `expo-notifications` plugin to `app.json` (§3.2)
- [ ] Firebase project + `google-services.json` (Android) (§2)
- [ ] Create `mobile/src/lib/pushToken.ts` (§4)
- [ ] Create `mobile/src/lib/notificationHandlers.ts` (§5)
- [ ] Wire `_layout.tsx` (register + foreground handler + tap navigation) (§6)
- [ ] Guard in `rooms/[id].tsx` (`setCurrentRoomId`) (§6)
- [ ] Logout flow: `unregisterPushToken()` before clearing JWT (§6)
- [ ] Device-side verification with the Expo push tool (§9.1)
- [ ] Run the manual matrix §9.2 on Android (Expo Go or dev build)
