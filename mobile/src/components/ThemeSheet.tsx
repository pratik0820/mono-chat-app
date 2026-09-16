import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { LinearGradient } from 'expo-linear-gradient';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  BUILTIN_THEMES,
  type BuiltinThemeId,
  isBuiltinThemeId,
  resolveRoomTheme,
} from '@/constants/chatThemes';

interface ThemeSheetProps {
  visible: boolean;
  /** Currently applied theme (id or image URL), or null for default. */
  current: { themeId: string | null; imageUrl: string | null };
  onClose: () => void;
  onApplyBuiltin: (themeId: BuiltinThemeId) => Promise<void>;
  onApplyImage: (localUri: string) => Promise<void>;
  onRemove: () => Promise<void>;
}

const PREVIEW = 64;

export function ThemeSheet({
  visible,
  current,
  onClose,
  onApplyBuiltin,
  onApplyImage,
  onRemove,
}: ThemeSheetProps) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [pendingBuiltin, setPendingBuiltin] = useState<BuiltinThemeId | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset transient state when the sheet re-opens
  useEffect(() => {
    if (visible) {
      setBusy(false);
      setPendingBuiltin(current.themeId && isBuiltinThemeId(current.themeId) ? current.themeId : null);
      setError(null);
    }
  }, [visible, current.themeId]);

  const isCustomImage = useMemo(() => !!current.imageUrl, [current.imageUrl]);

  const handlePickImage = useCallback(async () => {
    setError(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError('Photo library permission is needed to pick a theme.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
      });
      if (result.canceled || result.assets.length === 0) return;

      setBusy(true);
      // Downscale before upload: long edge 1440px, JPEG q0.75 → typically <400KB
      const asset = result.assets[0];
      const actions = asset.width && asset.width > 1440
        ? [{ resize: { width: 1440 } }]
        : asset.height && asset.height > 1440
          ? [{ resize: { height: 1440 } }]
          : [];

      const manipulated = actions.length
        ? await ImageManipulator.manipulateAsync(asset.uri, actions, {
            compress: 0.75,
            format: ImageManipulator.SaveFormat.JPEG,
          })
        : asset;

      await onApplyImage(manipulated.uri);
      onClose();
    } catch (e) {
      console.error('[ThemeSheet] Image pick/upload failed:', e);
      setError("Couldn't set image theme. Try again.");
    } finally {
      setBusy(false);
    }
  }, [onApplyImage, onClose]);

  const handleApplyBuiltin = useCallback(
    async (id: BuiltinThemeId) => {
      if (busy) return;
      setPendingBuiltin(id);
      setBusy(true);
      setError(null);
      try {
        await onApplyBuiltin(id);
        onClose();
      } catch (e) {
        console.error('[ThemeSheet] Failed to apply theme:', e);
        setError("Couldn't set theme. Try again.");
        setPendingBuiltin(null);
      } finally {
        setBusy(false);
      }
    },
    [busy, onApplyBuiltin, onClose]
  );

  const handleRemove = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onRemove();
      onClose();
    } catch (e) {
      console.error('[ThemeSheet] Failed to remove theme:', e);
      setError("Couldn't reset theme. Try again.");
    } finally {
      setBusy(false);
    }
  }, [busy, onRemove, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.background }]}
          onPress={(e) => e.stopPropagation()}>
          <View style={[styles.handle, { backgroundColor: theme.backgroundSelected }]} />
          <ThemedText type="title" style={styles.title}>
            Chat theme
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>
            Applies for everyone in this room
          </ThemedText>

          {/* Built-in theme grid */}
          <View style={styles.grid}>
            {BUILTIN_THEMES.map((t) => {
              const selected =
                (!current.imageUrl && current.themeId === t.id) ||
                (t.id === 'default' && !current.imageUrl && !current.themeId);
              const pending = busy && pendingBuiltin === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => handleApplyBuiltin(t.id)}
                  disabled={busy}
                  style={styles.cell}>
                  <LinearGradient
                    colors={t.colors}
                    style={[
                      styles.swatch,
                      selected && { borderWidth: 3, borderColor: theme.text },
                    ]}>
                    {pending && <ActivityIndicator color={t.textOnTheme} />}
                  </LinearGradient>
                  <ThemedText themeColor="textSecondary" style={styles.cellLabel}>
                    {t.name}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {/* Device image picker */}
          <Pressable
            onPress={handlePickImage}
            disabled={busy}
            style={({ pressed }) => [
              styles.pickButton,
              { backgroundColor: theme.backgroundElement, opacity: pressed || busy ? 0.6 : 1 },
            ]}>
            {busy && !pendingBuiltin ? (
              <ActivityIndicator color={theme.text} />
            ) : (
              <>
                <ThemedText style={styles.pickIcon}>🖼️</ThemedText>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.pickText}>Pick from device</ThemedText>
                  <ThemedText themeColor="textSecondary" style={styles.pickHint}>
                    Any photo from your library (auto-compressed)
                  </ThemedText>
                </View>
              </>
            )}
          </Pressable>

          {isCustomImage && (
            <Pressable
              onPress={handleRemove}
              disabled={busy}
              style={({ pressed }) => [
                styles.removeButton,
                { borderColor: theme.backgroundSelected, opacity: pressed || busy ? 0.6 : 1 },
              ]}>
              <ThemedText style={styles.removeText}>Remove custom image theme</ThemedText>
            </Pressable>
          )}

          {error && (
            <ThemedText style={styles.error}>{error}</ThemedText>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.five,
    gap: Spacing.two,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.one,
  },
  title: {
    textAlign: 'center',
    fontSize: 20,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: Spacing.one,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: Spacing.two,
    marginVertical: Spacing.one,
  },
  cell: {
    width: '19%',
    alignItems: 'center',
    gap: 4,
  },
  swatch: {
    width: PREVIEW * 0.6,
    height: PREVIEW * 0.6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellLabel: {
    fontSize: 10,
  },
  pickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 12,
  },
  pickIcon: {
    fontSize: 24,
  },
  pickText: {
    fontSize: 16,
    fontWeight: '600',
  },
  pickHint: {
    fontSize: 12,
  },
  removeButton: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  removeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  error: {
    textAlign: 'center',
  },
});
