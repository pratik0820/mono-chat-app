package com.example.chat.redis;

import com.example.chat.message.ChatMessageEvent;
import com.example.chat.message.TypingEvent;
import com.example.chat.theme.ThemeUpdatedEvent;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.listener.PatternTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;

/**
 * Subscribes to Redis Pub/Sub channels (chat.room.*) and pushes received
 * events to local STOMP sessions via SimpMessagingTemplate.
 *
 * Channel routing:
 *   chat.room.{roomId}         → ChatMessageEvent → /topic/room.{roomId}
 *   chat.room.{roomId}.typing  → TypingEvent      → /topic/room.{roomId}.typing
 */
@Component
public class RedisSubscriber {

    private final Logger log = LoggerFactory.getLogger(RedisSubscriber.class);

    private final RedisMessageListenerContainer container;
    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;

    public RedisSubscriber(RedisMessageListenerContainer container, SimpMessagingTemplate messagingTemplate, ObjectMapper objectMapper) {
        this.container = container;
        this.messagingTemplate = messagingTemplate;
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    public void subscribe() {
        container.addMessageListener((Message message, byte[] pattern) -> {

            String channel = new String(message.getChannel(), StandardCharsets.UTF_8);
            byte[] body = message.getBody();

            log.info("[Redis] Received from {}, publishing to local sessions", channel);

            try {
                // Strip the "chat.room." prefix to get the routing suffix
                // e.g. "chat.room.5" → "5", "chat.room.5.typing" → "5.typing"
                String channelSuffix = channel.replaceFirst("chat\\.room\\.", "");

                if (channelSuffix.endsWith(".typing")) {
                    // - Typing indicator -
                    Long roomId = Long.parseLong(channelSuffix.replace(".typing", ""));
                    TypingEvent event = objectMapper.readValue(body, TypingEvent.class);
                    messagingTemplate.convertAndSend(
                            "/topic/room." + roomId + ".typing",
                            event
                    );
                    log.debug("[Redis] Pushed typing event for room {} to local sessions", roomId);
                } else if (channelSuffix.endsWith(".theme")) {
                    // - Theme update -
                    Long roomId = Long.parseLong(channelSuffix.replace(".theme", ""));
                    ThemeUpdatedEvent event = objectMapper.readValue(body, ThemeUpdatedEvent.class);
                    messagingTemplate.convertAndSend(
                            "/topic/room." + roomId, event
                    );
                    log.debug("[Redis] Pushed theme update for room {} to local sessions", roomId);
                } else {
                    // - Chat message -
                    Long roomId = Long.parseLong(channelSuffix);
                    ChatMessageEvent event = objectMapper.readValue(body, ChatMessageEvent.class);
                    messagingTemplate.convertAndSend(
                            "/topic/room." + roomId,
                            event
                    );
                    log.debug("[Redis] Pushed chat message for room {} to local sessions", roomId);
                }
            } catch (Exception e) {
                log.error("[Redis] Failed to process message from {}: {}", channel, e.getMessage(), e);
            }
         }, new PatternTopic("chat.room.*"));
        log.info("[Redis] Subscribed to pattern: chat.room.*");
    }
}
