package com.example.chat.presence;

import org.springframework.context.event.EventListener;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tracks online users via WebSocket session connect/disconnect events.
 */
@Component
public class PresenceListener {

    private final SimpMessagingTemplate messagingTemplate;
    private final RedisTemplate<String, Object> redisTemplate;

    private final ConcurrentHashMap<String, Set<Long>> sessionUsers = new ConcurrentHashMap<>();

    public PresenceListener(SimpMessagingTemplate messagingTemplate, RedisTemplate<String, Object> redisTemplate) {
        this.messagingTemplate = messagingTemplate;
        this.redisTemplate = redisTemplate;
    }

    /**
     * Register a user as online when their STOMP session connects.
     * Called from JwtChannelInterceptor after successful authentication
     */
    public void userConnected(String sessionId, Long userId) {
        sessionUsers.computeIfAbsent(sessionId, k -> ConcurrentHashMap.newKeySet()).add(userId);
        redisTemplate.opsForSet().add("presence:online", userId);
        broadCastPresence();
    }

    /**
     * Handle WebSocket disconnect event.
     */
    @EventListener
    public void handleDisconnect(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String sessionId = accessor.getSessionId();

        Set<Long> userIds = sessionUsers.remove(sessionId);
        if (userIds != null) {
            for (Long userId : userIds) {
                boolean stillConnectedLocally = sessionUsers.values().stream()
                        .anyMatch(set -> set.contains(userId));

                if (!stillConnectedLocally) {
                    redisTemplate.opsForSet().remove("presence:online", userId);
                }
            }
        }

        broadCastPresence();
    }

    private void broadCastPresence() {
        Set<Object> raw = redisTemplate.opsForSet().members("presence:online");
        if (raw == null) raw = Set.of();

        Set<Long> snapshot = raw.stream()
                .filter(Long.class::isInstance)
                .map(Long.class::cast)
                .collect(java.util.stream.Collectors.toSet());

        messagingTemplate.convertAndSend("/topic/presence",
                (Object) Map.of("onlineUserIds", snapshot));
    }
}
