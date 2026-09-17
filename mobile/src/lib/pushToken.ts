import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { api } from '@/api/client';

let registeredThisSession = false;

/**
 * Registers the device for push notifications and syncs the Expo push token
 * with the backend (`POST /api/push-tokens`).
 *
 * Idempotent — safe to call on every app launch and after every login; the
 * backend upserts (user_id, token). Every failure path returns null so the
 * chat app remains fully usable without push (push is an enhancement, not a
 * requirement).
 *
 * Android-only for now: the backend rejects platform 'ios', and iOS push
 * would additionally need a dev build (Expo Go on iOS has no push support).
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS !== 'android') return null; // Android only for now
  if (!Device.isDevice) return null; // push needs a physical device (or Play-Services emulator)
  if (registeredThisSession) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    // Permission denied — never nag again this session; app works without push
    return null;
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    await api.post('/api/push-tokens', {
      token,
      platform: 'android',
      deviceName: Device.deviceName ?? 'unknown',
    });
    registeredThisSession = true;
    return token;
  } catch (e) {
    // Backend without push endpoints yet, no Firebase config in dev builds, or
    // no network — all non-fatal. Push retries on the next app launch.
    console.warn('[Push] Registration failed:', e);
    return null;
  }
}

/**
 * Removes this user's push token(s) from the backend
 * (`DELETE /api/push-tokens/current`). MUST be called while the JWT is still
 * stored — i.e. before clearing credentials — or the call returns 401 and the
 * stale token keeps receiving pushes for the previous user.
 */
export async function unregisterPushToken(): Promise<void> {
  try {
    await api.delete('/api/push-tokens/current');
  } catch (e) {
    // Non-fatal: backend may not have push endpoints yet, or we're offline.
    console.warn('[Push] Unregister failed:', e);
  }
  // Allow re-registering after the next login (new user on this device)
  registeredThisSession = false;
}
