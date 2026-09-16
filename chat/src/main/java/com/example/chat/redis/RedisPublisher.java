package com.example.chat.redis;

import com.example.chat.message.ChatMessageEvent;
import com.example.chat.message.TypingEvent;
import com.example.chat.theme.ThemeUpdatedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

/**
 * Publishes chat events to Redis Pub/Sub channels for cross-instance delivery.
 *
 * Channel naming:
 *      chat.room.{roomId}          - chat messages
 *      chat.room.{roomId}.typing   - typing indicators
 */
@Component
public class RedisPublisher {

    private static final Logger log = LoggerFactory.getLogger(RedisPublisher.class);

    private final RedisTemplate<String, Object> redisTemplate;

    public RedisPublisher(RedisTemplate<String, Object> redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    /**
     * Publish a chat message event to the Redis channel for the given room.
     *
     * @param roomId the room the message belongs to
     * @param event the serialized chat message payload
     */
    public void publishChatMessage(Long roomId, ChatMessageEvent event) {
        String channel = "chat.room." + roomId;
        redisTemplate.convertAndSend(channel, event);
        log.info("[Redis] Published to {}: {}", channel, event);
    }

    /**
     * Publish a typing indicator event to the Redis channel for the given room.
     *
     * @param roomId the room the typing indicator belongs to
     * @param event  the serialized typing payload
     */
    public void publishTypingIndicator(Long roomId, TypingEvent event) {
        String channel = "chat.room." + roomId + ".typing";
        redisTemplate.convertAndSend(channel, event);
        log.info("[Redis] Published to {}: {}", channel, event);
    }

    /**
     * Publish a theme update event to the Redis channel for the given room.
     *
     * @param roomId the room whose theme changed
     * @param event  the serialized theme update payload
     */
    public void publishThemeUpdated(Long roomId, ThemeUpdatedEvent event) {
        String channel = "chat.room." + roomId + ".theme";
        redisTemplate.convertAndSend(channel, event);
        log.info("[Redis] Published to {}: {}", channel, event);
    }
}
