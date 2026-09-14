package com.example.chat.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.serializer.GenericJacksonJsonRedisSerializer;
import org.springframework.data.redis.serializer.StringRedisSerializer;
import tools.jackson.databind.ObjectMapper;

@Configuration
public class RedisConfig {

    private static final Logger log = LoggerFactory.getLogger(RedisConfig.class);
    private final RedisConnectionFactory connectionFactory;

    public RedisConfig(RedisConnectionFactory connectionFactory) {
        this.connectionFactory = connectionFactory;
    }

    /**
     * RedisTemplate configured with JSON serialization for values
     * and String serialization for keys.
     *
     * This bean is used by both RedisPublisher and RedisSubscriber.
     * - Keys: "chat.room.1", "chat.room.1.typing" (plain strings)
     * - Values: JSON objects (ChatMessageEvent, TypingEvent, etc)
     */
    @Bean
    public RedisTemplate<String, Object> redisTemplate() {
        log.info("[Redis] Configuring RedisTemplate with JSON serialization...");
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(connectionFactory);

        // --- key serialization: plain UTF-8 strings ---
        StringRedisSerializer stringSerializer = new StringRedisSerializer();
        template.setStringSerializer(stringSerializer);
        template.setHashKeySerializer(stringSerializer);

        // --- Value serialization: JSON via Jackson ---
        ObjectMapper objectMapper = new ObjectMapper();
        GenericJacksonJsonRedisSerializer jsonSerializer = new GenericJacksonJsonRedisSerializer(objectMapper);

        template.setValueSerializer(jsonSerializer);
        template.setHashKeySerializer(jsonSerializer);

        template.afterPropertiesSet();
        log.info("[Redis] RedisTemplate configured successfully");
        return template;
    }

    /**
     * RedisMessageListenerContainer - manages Redis subscriptions.
     * The subscriber will register its listeners with this container.
     */
    @Bean
    public RedisMessageListenerContainer redisMessageListenerContainer() {
        log.info("[Redis] Configuring RedisMessageListenerContainer...");
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        log.info("[Redis] RedisMessageListenerContainer configured successfully");
        return container;
    }

    /**
     * Fires after the application is fully started.
     * Pings Redis to verify the connection is alive.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void verifyRedisConnection() {
        try {
            var connection = connectionFactory.getConnection();
            String pong = connection.ping();
            log.info("[Redis] Connected to Redis successfully — PING response: {}", pong);
            connection.close();
        } catch (Exception e) {
            log.error("[Redis] Failed to connect to Redis: {}", e.getMessage());
            log.error("[Redis] Make sure Redis is running on localhost:6379");
            log.error("[Redis] Start it with: docker run -d --name redis -p 6379:6379 redis:7-alpine");
        }
    }
}
