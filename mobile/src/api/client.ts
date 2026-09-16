import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

/**
 * Backend base URL.
 * - Live AWS EC2 Instance: http://18.212.79.35:8085
 * - Override via mobile/.env.local -> EXPO_PUBLIC_API_URL=http://<LAN-IP>:8085
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://18.212.79.35:8085';

if (__DEV__) {
  console.log('[API] Base URL:', API_URL);
}

export const api = axios.create({ baseURL: API_URL });

const TOKEN_KEY = 'chat.token';
const USER_KEY = 'chat.user';

export interface UserDto {
  id: number;
  username: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: UserDto;
}

export async function getStoredToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function getStoredUser(): Promise<UserDto | null> {
  const raw = await AsyncStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as UserDto) : null;
}

export async function storeAuth(auth: AuthResponse): Promise<void> {
  await AsyncStorage.multiSet([
    [TOKEN_KEY, auth.token],
    [USER_KEY, JSON.stringify(auth.user)],
  ]);
}

export async function clearAuth(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
}

// Attach the JWT to every request automatically
api.interceptors.request.use(async (config) => {
  const token = await getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export async function loginRequest(username: string, password: string): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>('/api/auth/login', { username, password });
  return res.data;
}

export async function registerRequest(
  username: string,
  email: string,
  password: string
): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>('/api/auth/register', { username, email, password });
  return res.data;
}

// ─── Room helpers ───────────────────────────────────────────

export interface RoomDto {
  id: number;
  name: string;
  createdBy: number;
  createdAt: string;
}

export async function listRooms(): Promise<RoomDto[]> {
  const res = await api.get<RoomDto[]>('/api/rooms');
  return res.data;
}

export async function listAllRooms(): Promise<RoomDto[]> {
  const res = await api.get<RoomDto[]>('/api/rooms/all');
  return res.data;
}

export async function joinRoom(roomId: number): Promise<RoomDto> {
  const res = await api.post<RoomDto>(`/api/rooms/${roomId}/join`);
  return res.data;
}

export async function createRoom(name: string): Promise<RoomDto> {
  const res = await api.post<RoomDto>('/api/rooms', { name });
  return res.data;
}

export async function getRoom(roomId: number): Promise<RoomDto> {
  const res = await api.get<RoomDto>(`/api/rooms/${roomId}`);
  return res.data;
}

export async function deleteRoom(roomId: number): Promise<void> {
  await api.delete(`/api/rooms/${roomId}`);
}

// ─── Message helpers ────────────────────────────────────────

export type MessageType = 'USER' | 'AI' | 'SYSTEM' | 'STICKER' | 'GIF';

export interface MessageDto {
  id: number;
  roomId: number;
  senderId: number;
  username: string;
  content: string;
  type: MessageType;
  createdAt: string;
}

export async function getMessages(
  roomId: number,
  limit = 50,
  before?: number
): Promise<MessageDto[]> {
  const params: Record<string, string | number> = { limit };
  if (before !== undefined) params.before = before;
  const res = await api.get<MessageDto[]>(`/api/rooms/${roomId}/messages`, { params });
  return res.data;
}

export async function sendMessage(
  roomId: number,
  content: string,
  type: MessageType = 'USER'
): Promise<MessageDto> {
  const res = await api.post<MessageDto>(`/api/rooms/${roomId}/messages`, { content, type });
  return res.data;
}

// ─── GIF helpers ──────────────────────────────────────────────

export interface GifResult {
  id: string;
  title: string;
  previewUrl: string;
  gifUrl: string;
}

export interface GifSearchResponse {
  results: GifResult[];
  next: string;
}

export async function searchGifs(
  query: string,
  limit = 20,
  page = 1
): Promise<GifSearchResponse> {
  const res = await api.get<GifSearchResponse>('/api/gifs/search', {
    params: { q: query, limit, page },
  });
  return res.data;
}

export async function getTrendingGifs(
  limit = 20,
  page = 1
): Promise<GifSearchResponse> {
  const res = await api.get<GifSearchResponse>('/api/gifs/trending', {
    params: { limit, page },
  });
  return res.data;
}

// ─── Meme helpers ────────────────────────────────────────────

export async function searchMemes(
  query: string,
  limit = 20,
  page = 1
): Promise<GifSearchResponse> {
  const res = await api.get<GifSearchResponse>('/api/gifs/memes/search', {
    params: { q: query, limit, page },
  });
  return res.data;
}

export async function getTrendingMemes(
  limit = 20,
  page = 1
): Promise<GifSearchResponse> {
  const res = await api.get<GifSearchResponse>('/api/gifs/memes/trending', {
    params: { limit, page },
  });
  return res.data;
}

// ─── KLIPY Sticker helpers (better than local) ───────────────

export async function searchKlipyStickers(
  query: string,
  limit = 20,
  page = 1
): Promise<GifSearchResponse> {
  const res = await api.get<GifSearchResponse>('/api/gifs/stickers/search', {
    params: { q: query, limit, page },
  });
  return res.data;
}

export async function getTrendingKlipyStickers(
  limit = 20,
  page = 1
): Promise<GifSearchResponse> {
  const res = await api.get<GifSearchResponse>('/api/gifs/stickers/trending', {
    params: { limit, page },
  });
  return res.data;
}

// ─── Sticker helpers ──────────────────────────────────────────

export interface StickerSetDto {
  id: number;
  name: string;
  thumbnailUrl: string;
  createdBy: number;
}

export interface StickerDto {
  id: number;
  setId: number;
  imageUrl: string;
  sortOrder: number;
}

export async function listStickerSets(): Promise<StickerSetDto[]> {
  const res = await api.get<StickerSetDto[]>('/api/stickers/sets');
  return res.data;
}

export async function getStickersInSet(
  setId: number
): Promise<{ set: StickerSetDto; stickers: StickerDto[] }> {
  const res = await api.get(`/api/stickers/sets/${setId}`);
  return res.data;
}

// ─── Room theme helpers ─────────────────────────────────────

export interface RoomThemeDto {
  /** Built-in theme id, when a built-in is active. */
  themeId?: string;
  /** Absolute or backend-relative URL of a custom background image. */
  imageUrl?: string;
  updatedBy: number;
  updatedAt: string;
}

export async function getRoomTheme(roomId: number): Promise<RoomThemeDto | null> {
  // Backend returns 204 (empty body) when the room uses the default theme
  const res = await api.get<RoomThemeDto | ''>(`/api/rooms/${roomId}/theme`);
  return res.data ? res.data : null;
}

/**
 * Set a built-in theme for the room.
 * Returns null when the backend reset the room to the default theme (204).
 */
export async function setRoomTheme(roomId: number, themeId: string): Promise<RoomThemeDto | null> {
  const res = await api.put<RoomThemeDto | ''>(`/api/rooms/${roomId}/theme`, { themeId });
  return res.data ? res.data : null;
}

/**
 * Set a custom image theme for the room.
 * @param localUri local file:// uri of the (already downscaled) image
 * @param fileName preferred file name for the upload
 */
export async function uploadRoomThemeImage(
  roomId: number,
  localUri: string,
  fileName = 'theme.jpg'
): Promise<RoomThemeDto> {
  const token = await getStoredToken();
  const form = new FormData();
  // RN FormData file part — expo/fetch or axios both accept this shape
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form.append('image', { uri: localUri, name: fileName, type: 'image/jpeg' } as any);
  const res = await api.put<RoomThemeDto>(`/api/rooms/${roomId}/theme`, form, {
    headers: {
      'Content-Type': 'multipart/form-data',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return res.data;
}

export async function clearRoomTheme(roomId: number): Promise<void> {
  await api.delete(`/api/rooms/${roomId}/theme`);
}

// ─── Logout ──────────────────────────────────────────────────

export async function logoutRequest(): Promise<void> {
  try {
    await api.post('/api/auth/logout');
  } catch {
    // Even if server call fails, we still clear local auth
  }
  await clearAuth();
}
