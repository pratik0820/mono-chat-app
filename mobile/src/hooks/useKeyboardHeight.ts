import { useEffect, useState } from 'react';
import { Keyboard, KeyboardEvent, Platform } from 'react-native';

/**
 * Tracks the on-screen keyboard height without any native dependency.
 *
 * Why not KeyboardAvoidingView? The app runs edge-to-edge on Android
 * (edgeToEdgeEnabled=true), where `adjustResize` is disabled and KAV's
 * `height`/`padding` behaviors report the wrong offsets — the keyboard
 * ends up covering the input. Manually padding by the measured keyboard
 * height is reliable on both platforms.
 *
 * Returns 0 while the keyboard is closed. On Android, the reported height
 * may include the navigation bar (it sits behind the keyboard anyway).
 */
export function useKeyboardHeight(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return keyboardHeight;
}
