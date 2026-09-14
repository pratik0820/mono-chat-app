import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import { AppState, AppStateStatus } from 'react-native';

import { API_URL, getStoredToken } from './client';

/**
 * Singleton STOMP client for real-time chat.
 *
 * Uses webSocketFactory with explicit STOMP sub-protocols so Spring's
 * STOMP handler activates. React Native's WebSocket needs the protocols
 * array as the 2nd constructor argument — brokerURL alone doesn't work.
 *
 * CRITICAL: forceBinaryWSFrames + appendMissingNULLonIncoming are required
 * because React Native's WebSocket strips NULL bytes (\0) from text frames,
 * breaking STOMP's null-terminated frame format.
 *
 * Sends JWT in STOMP CONNECT frame headers for authentication.
 */

let stompClient: Client | null = null;
let activeSubscriptions: Map<string, StompSubscription> = new Map();
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
let appStateListeners: Array<() => void> = [];

/** Guard to prevent multiple concurrent connectStomp calls */
let connecting = false;

/** Pending onConnect callbacks waiting for the connection */
let pendingConnectCallbacks: Array<() => void> = [];

/**
 * Register a listener that fires when the app comes to the foreground.
 * Used by hooks to reconnect/resubscribe after backgrounding.
 */
export function onAppForeground(listener: () => void): () => void {
  appStateListeners.push(listener);
  return () => {
    appStateListeners = appStateListeners.filter((l) => l !== listener);
  };
}

/**
 * Set up AppState listener for WebSocket reconnection.
 * Call once on app mount.
 */
export function setupAppStateListener(): void {
  if (appStateSubscription) return; // already set up

  appStateSubscription = AppState.addEventListener(
    'change',
    (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        console.log('[STOMP] App foregrounded — checking connection');
        appStateListeners.forEach((l) => l());

        if (stompClient && !stompClient.active) {
          console.log('[STOMP] Reconnecting after background...');
          stompClient.activate();
        }
      } else if (nextState === 'background') {
        console.log('[STOMP] App backgrounded');
      }
    }
  );
}

/**
 * Get the WebSocket URL from the API URL.
 * Converts http:// → ws:// and https:// → wss://
 */
function getWsUrl(): string {
  const base = API_URL.replace(/^http/, 'ws');
  return `${base}/ws`;
}

/**
 * Wait until the STOMP client is connected, or timeout after ms.
 * Returns true if connected, false if timed out.
 */
export function waitForConnected(timeoutMs = 10000): Promise<boolean> {
  return new Promise((resolve) => {
    if (stompClient?.connected) {
      resolve(true);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      if (stompClient?.connected) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        resolve(false);
      }
    }, 200);
  });
}

/**
 * Connect to the STOMP server.
 * @param onConnect - Callback when connected successfully
 * @param onDisconnect - Callback when disconnected
 * @param onError - Callback on connection error
 */
export async function connectStomp(
  onConnect?: () => void,
  onDisconnect?: () => void,
  onError?: (error: any) => void
): Promise<void> {
  // Already fully connected
  if (stompClient?.connected) {
    console.log('[STOMP] Already connected, invoking onConnect');
    onConnect?.();
    return;
  }

  // If a connection attempt is in progress, just queue the callback
  if (connecting) {
    console.log('[STOMP] Connection in progress — queuing onConnect callback');
    if (onConnect) pendingConnectCallbacks.push(onConnect);
    return;
  }

  // If activate() was called but STOMP handshake never completed, tear down and retry
  if (stompClient?.active && !stompClient?.connected) {
    console.log('[STOMP] Previous attempt stuck (active but not connected) — tearing down and retrying');
    stompClient.deactivate();
    stompClient = null;
    activeSubscriptions.clear();
  }

  const token = await getStoredToken();
  if (!token) {
    console.error('[STOMP] No auth token found — cannot connect');
    onError?.(new Error('No auth token found'));
    return;
  }

  const wsUrl = getWsUrl();
  console.log('[STOMP] Connecting to:', wsUrl);

  connecting = true;
  pendingConnectCallbacks = [];
  if (onConnect) pendingConnectCallbacks.push(onConnect);

  // Use webSocketFactory with explicit STOMP sub-protocols.
  // React Native's WebSocket requires the protocols array as the 2nd argument
  // to send Sec-WebSocket-Protocol headers. Without this, Spring's STOMP handler
  // never activates and the server silently ignores the CONNECT frame.
  stompClient = new Client({
    webSocketFactory: () => {
      console.log('[STOMP] Creating WebSocket to:', wsUrl);
      return new WebSocket(wsUrl, ['v12.stomp', 'v11.stomp', 'v10.stomp']);
    },
    connectHeaders: {
      Authorization: `Bearer ${token}`,
    },
    // CRITICAL for React Native: RN's WebSocket strips NULL bytes (\0) from
    // text frames. STOMP frames are null-terminated, so without these flags,
    // the server never sees complete STOMP frames and the CONNECT handshake
    // silently fails. forceBinaryWSFrames sends as ArrayBuffer (preserves \0).
    // appendMissingNULLonIncoming adds it back on the receiving side.
    forceBinaryWSFrames: true,
    appendMissingNULLonIncoming: true,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    reconnectDelay: 5000,
    debug: (str) => {
      console.log('[STOMP]', str);
    },
    onConnect: () => {
      console.log('[STOMP] Connected ✅');
      connecting = false;
      // Fire all pending callbacks
      const callbacks = [...pendingConnectCallbacks];
      pendingConnectCallbacks = [];
      callbacks.forEach((cb) => cb());
    },
    onDisconnect: () => {
      console.log('[STOMP] Disconnected');
      connecting = false;
      activeSubscriptions.clear();
      pendingConnectCallbacks = [];
      onDisconnect?.();
    },
    onStompError: (frame) => {
      console.error('[STOMP] Error:', frame.headers['message']);
      console.error('[STOMP] Details:', frame.body);
      connecting = false;
      pendingConnectCallbacks = [];
      onError?.(new Error(frame.headers['message']));
    },
    onWebSocketClose: (event) => {
      console.log('[STOMP] WebSocket closed:', event.code, event.reason);
      connecting = false;
    },
    onWebSocketError: (error) => {
      console.error('[STOMP] WebSocket error:', error);
      connecting = false;
      onError?.(error);
    },
  });

  console.log('[STOMP] Activating...');
  stompClient.activate();

  setupAppStateListener();
}

/**
 * Disconnect from the STOMP server.
 */
export function disconnectStomp(): void {
  if (stompClient?.active) {
    connecting = false;
    pendingConnectCallbacks = [];
    stompClient.deactivate();
    stompClient = null;
    activeSubscriptions.clear();
    console.log('[STOMP] Disconnected by client');
  }
}

/**
 * Check if the STOMP client is connected.
 */
export function isStompConnected(): boolean {
  return stompClient?.connected === true;
}

/**
 * Subscribe to a STOMP topic.
 * @param topic - The topic to subscribe to (e.g., '/topic/room.1')
 * @param callback - Message handler
 * @returns Subscription ID for unsubscribing
 */
export function subscribe(
  topic: string,
  callback: (message: IMessage) => void
): string | null {
  if (!stompClient?.active || !stompClient.connected) {
    console.warn('[STOMP] Cannot subscribe — not connected. active:', stompClient?.active, 'connected:', stompClient?.connected);
    return null;
  }

  const existing = activeSubscriptions.get(topic);
  if (existing) {
    existing.unsubscribe();
    activeSubscriptions.delete(topic);
  }

  const subscription = stompClient.subscribe(topic, callback);
  activeSubscriptions.set(topic, subscription);
  console.log('[STOMP] Subscribed to', topic);

  return topic;
}

/**
 * Unsubscribe from a STOMP topic.
 */
export function unsubscribe(topic: string): void {
  const subscription = activeSubscriptions.get(topic);
  if (subscription) {
    subscription.unsubscribe();
    activeSubscriptions.delete(topic);
    console.log('[STOMP] Unsubscribed from', topic);
  }
}

/**
 * Send a message to a STOMP destination.
 * @param destination - The destination (e.g., '/app/chat.sendMessage.1')
 * @param body - The message body (will be JSON stringified)
 */
export function send(destination: string, body: Record<string, any>): boolean {
  if (!stompClient?.active || !stompClient.connected) {
    console.warn('[STOMP] Cannot send — not connected. active:', stompClient?.active, 'connected:', stompClient?.connected);
    return false;
  }

  stompClient.publish({
    destination,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  return true;
}

/**
 * Send a chat message to a room.
 */
export function sendChatMessage(
  roomId: number,
  content: string,
  type: string = 'USER',
): boolean {
  return send(`/app/chat.sendMessage/${roomId}`, {
    content,
    type,
  });
}

/**
 * Send a typing indicator to a room.
 */
export function sendTypingIndicator(roomId: number, typing: boolean): void {
  send(`/app/chat.typing/${roomId}`, { typing });
}

/**
 * Subscribe to a room's message topic.
 */
export function subscribeToRoom(
  roomId: number,
  callback: (message: IMessage) => void
): string | null {
  return subscribe(`/topic/room.${roomId}`, callback);
}

/**
 * Subscribe to a room's typing topic.
 */
export function subscribeToTyping(
  roomId: number,
  callback: (message: IMessage) => void
): string | null {
  return subscribe(`/topic/room.${roomId}.typing`, callback);
}

/**
 * Subscribe to presence updates.
 */
export function subscribeToPresence(
  callback: (message: IMessage) => void
): string | null {
  return subscribe('/topic/presence', callback);
}
