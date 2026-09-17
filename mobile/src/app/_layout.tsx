import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { getStoredToken } from '@/api/client';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import {
  configureForegroundNotifications,
  useNotificationTapNavigation,
} from '@/lib/notificationHandlers';
import { registerForPushNotificationsAsync } from '@/lib/pushToken';

SplashScreen.preventAutoHideAsync();

// Must be configured at module scope so the foreground handler is in place
// before any notification can arrive (not just after the first render).
configureForegroundNotifications();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // Deep-link into a room when a push is tapped (handles cold + warm start)
  useNotificationTapNavigation();

  // Register the device for push once per session when a user is already
  // logged in (app relaunch). Fresh logins register from the auth screens;
  // the helper is idempotent.
  useEffect(() => {
    getStoredToken().then((token) => {
      if (token) void registerForPushNotificationsAsync();
    });
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
