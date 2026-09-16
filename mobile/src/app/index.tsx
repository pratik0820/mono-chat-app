import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getStoredToken, loginRequest, storeAuth, API_URL } from '@/api/client';
import { Button } from '@/components/button';
import { FormInput } from '@/components/form-input';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';

function errorMessage(e: unknown): string {
  const err = e as any;
  // Axios error with response
  if (err.response) {
    return err.response.data?.message ?? `HTTP ${err.response.status}: ${err.response.statusText}`;
  }
  // Network error (no response at all)
  if (err.request) {
    return `Network error: could not reach server at ${API_URL}`;
  }
  // Other errors
  return err.message ?? 'Something went wrong. Try again.';
}

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If already logged in, skip the login screen
  useEffect(() => {
    getStoredToken().then((token) => {
      if (token) {
        router.replace('/rooms');
      }
    });
  }, [router]);

  async function handleLogin() {
    if (!username.trim() || !password) {
      setError('Enter a username and password.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const auth = await loginRequest(username.trim(), password);
      await storeAuth(auth);
      router.replace('/rooms');
    } catch (e) {
      console.error('[Login] Error:', e);
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              // Manual keyboard avoidance (KeyboardAvoidingView is unreliable
              // with edge-to-edge). Also keeps the button clear of the nav bar.
              paddingBottom: keyboardHeight + insets.bottom + Spacing.six,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
            <Image source={require('../../assets/images/icon.png')} style={styles.logo} />
            <ThemedText type="title" style={styles.title}>
              Mono
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>
              Log in to join your rooms
            </ThemedText>

            <FormInput label="Username" value={username} onChangeText={setUsername} />
            <FormInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            {error && (
              <ThemedText themeColor="textSecondary" style={styles.error}>
                {error}
              </ThemedText>
            )}

            <Button title="Log in" onPress={handleLogin} loading={loading} />

            <Pressable onPress={() => router.push('/register')}>
              <ThemedText style={styles.link}>
                No account? <ThemedText type="linkPrimary">Create one</ThemedText>
              </ThemedText>
            </Pressable>
          </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  logo: {
    width: 120,
    height: 120,
    alignSelf: 'center',
    marginBottom: Spacing.two,
    borderRadius: 24,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: Spacing.three,
  },
  error: {
    textAlign: 'center',
  },
  link: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
});
