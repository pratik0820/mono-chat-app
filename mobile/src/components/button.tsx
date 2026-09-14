import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type ButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** 'primary' = filled, 'secondary' = subtle/outlined. Default: primary */
  variant?: 'primary' | 'secondary';
};

export function Button({ title, onPress, disabled, loading, variant = 'primary' }: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const isSecondary = variant === 'secondary';

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        isSecondary
          ? [
              styles.secondary,
              { borderColor: theme.backgroundSelected },
              pressed && { backgroundColor: theme.backgroundSelected },
            ]
          : [
              { backgroundColor: pressed ? theme.backgroundSelected : theme.text },
            ],
        isDisabled && styles.disabled,
      ]}>
      {loading ? (
        <ActivityIndicator color={isSecondary ? theme.text : theme.background} />
      ) : (
        <Text
          style={[
            styles.label,
            { color: isSecondary ? theme.text : theme.background },
          ]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
});
