import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type ButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** 'primary' = filled, 'secondary' = subtle/outlined, 'danger' = destructive (red). Default: primary */
  variant?: 'primary' | 'secondary' | 'danger';
  /** Optional extra styling for the pressable container. */
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, onPress, disabled, loading, variant = 'primary', style }: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const isSecondary = variant === 'secondary';
  const isDanger = variant === 'danger';

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        style,
        isSecondary
          ? [
              styles.secondary,
              { borderColor: theme.backgroundSelected },
              pressed && { backgroundColor: theme.backgroundSelected },
            ]
          : isDanger
            ? [{ backgroundColor: pressed ? '#b91c1c' : '#dc2626' }]
            : [{ backgroundColor: pressed ? theme.backgroundSelected : theme.text }],
        isDisabled && styles.disabled,
      ]}>
      {loading ? (
        <ActivityIndicator color={isSecondary || isDanger ? '#ffffff' : theme.background} />
      ) : (
        <Text
          style={[
            styles.label,
            { color: isSecondary ? theme.text : isDanger ? '#ffffff' : theme.background },
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
