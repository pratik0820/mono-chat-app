import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type FormInputProps = TextInputProps & {
  label: string;
};

export function FormInput({ label, style, secureTextEntry, ...rest }: FormInputProps) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);
  const isPassword = !!secureTextEntry;

  return (
    <View
      style={[
        styles.wrapper,
        { backgroundColor: theme.backgroundElement },
      ]}>
      <TextInput
        placeholder={label}
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={isPassword && !visible}
        style={[styles.input, { color: theme.text }, style]}
        {...rest}
      />
      {isPassword && (
        <Pressable
          onPress={() => setVisible((v) => !v)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          style={({ pressed }) => [styles.eyeButton, pressed && { opacity: 0.5 }]}>
          <Text style={[styles.eyeIcon, { color: theme.textSecondary }]}>
            {visible ? '🙈' : '👁'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  eyeButton: {
    marginLeft: 8,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeIcon: {
    fontSize: 18,
  },
});
