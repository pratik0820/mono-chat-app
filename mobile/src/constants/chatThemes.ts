/**
 * Built-in chat background themes.
 * Each theme is a two-stop gradient — tiny, offline, no assets to download.
 * Custom device-image themes are handled separately (ThemeSheet → upload).
 */

export type BuiltinThemeId =
  | 'default'
  | 'sunset'
  | 'ocean'
  | 'midnight'
  | 'forest'
  | 'paper'
  | 'candy'
  | 'peach'
  | 'aurora'
  | 'mono';

export interface BuiltinTheme {
  id: BuiltinThemeId;
  name: string;
  /** Two gradient stops, top → bottom. */
  colors: [string, string];
  /** Text color used on the theme (header connection text, typing text). */
  textOnTheme: string;
}

export const BUILTIN_THEMES: BuiltinTheme[] = [
  { id: 'default',  name: 'Default',  colors: ['#FFFFFF', '#FFFFFF'], textOnTheme: '#60646C' },
  { id: 'sunset',   name: 'Sunset',   colors: ['#FF9966', '#FF5E62'], textOnTheme: '#FFFFFF' },
  { id: 'ocean',    name: 'Ocean',    colors: ['#2193B0', '#6DD5ED'], textOnTheme: '#FFFFFF' },
  { id: 'midnight', name: 'Midnight', colors: ['#0F2027', '#203A43'], textOnTheme: '#B0B4BA' },
  { id: 'forest',   name: 'Forest',   colors: ['#134E5E', '#71B280'], textOnTheme: '#FFFFFF' },
  { id: 'paper',    name: 'Paper',    colors: ['#E8E4DC', '#D6D0C4'], textOnTheme: '#4A463F' },
  { id: 'candy',    name: 'Candy',    colors: ['#FBC2EB', '#A6C1EE'], textOnTheme: '#5A4B6E' },
  { id: 'peach',    name: 'Peach',    colors: ['#FFE5B4', '#FFB088'], textOnTheme: '#7A4A2B' },
  { id: 'aurora',   name: 'Aurora',   colors: ['#00C9FF', '#92FE9D'], textOnTheme: '#0B4F5C' },
  { id: 'mono',     name: 'Mono',     colors: ['#3A3D42', '#1C1E22'], textOnTheme: '#E8E9EB' },
];

const THEME_MAP = new Map(BUILTIN_THEMES.map((t) => [t.id, t]));

export function getBuiltinTheme(id: string | null | undefined): BuiltinTheme | null {
  if (!id) return null;
  return THEME_MAP.get(id as BuiltinThemeId) ?? null;
}

export function isBuiltinThemeId(id: string | null | undefined): id is BuiltinThemeId {
  return THEME_MAP.has(id as BuiltinThemeId);
}

/**
 * Resolve the background to render for a room.
 * Priority: custom image URL > built-in theme > default.
 */
export function resolveRoomTheme(
  themeId: string | null | undefined,
  imageUrl: string | null | undefined
): { kind: 'image' | 'builtin'; builtin?: BuiltinTheme; imageUrl?: string } {
  if (imageUrl) return { kind: 'image', imageUrl };
  const builtin = getBuiltinTheme(themeId);
  if (builtin) return { kind: 'builtin', builtin };
  return { kind: 'builtin', builtin: THEME_MAP.get('default')! };
}
