import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { registerRequest, storeAuth } from '@/api/client';
import { Button } from '@/components/button';
import { FormInput } from '@/components/form-input';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';

function errorMessage(e: unknown): string {
  const err = e as { response?: { data?: { message?: string } } };
  return err.response?.data?.message ?? 'Something went wrong. Try again.';
}

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!username.trim() || !email.trim() || !password) {
      setError('Fill in all fields.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const auth = await registerRequest(username.trim(), email.trim(), password);
      await storeAuth(auth);
      router.replace('/rooms');
    } catch (e) {
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
              Create an account to start chatting
            </ThemedText>

            <FormInput label="Username" value={username} onChangeText={setUsername} />
            <FormInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
            />
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

            <Button title="Create account" onPress={handleRegister} loading={loading} />

            <Pressable onPress={() => router.replace('/')}>
              <ThemedText style={styles.link}>
                Already have an account? <ThemedText type="linkPrimary">Log in</ThemedText>
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
