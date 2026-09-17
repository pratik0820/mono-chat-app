package com.example.chat.push;

import com.example.chat.message.dto.MessageDto;
import com.example.chat.room.RoomMemberRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

@Service
public class PushDispatcher {

    private static final Logger log = LoggerFactory.getLogger(PushDispatcher.class);
    private static final String PRESENCE_KEY = "presence:online";
    private static final String RATE_KEY_PREFIX = "push:rate:";
    private static final Duration RATE_WINDOW = Duration.ofMinutes(1);

    private final RoomMemberRepository roomMemberRepository;
    private final PushTokenRepository pushTokenRepository;
    private final PushSender pushSender;
    private final RedisTemplate<String, Object> redisTemplate;
    private final StringRedisTemplate stringRedisTemplate;
    private final PushProperties props;

    public PushDispatcher(RoomMemberRepository roomMemberRepository, PushTokenRepository pushTokenRepository, PushSender pushSender, RedisTemplate<String, Object> redisTemplate, StringRedisTemplate stringRedisTemplate, PushProperties props) {
        this.roomMemberRepository = roomMemberRepository;
        this.pushTokenRepository = pushTokenRepository;
        this.pushSender = pushSender;
        this.redisTemplate = redisTemplate;
        this.stringRedisTemplate = stringRedisTemplate;
        this.props = props;
    }

    /**
     * Called AFTER the message is persisted and broadcast over STOMP/Redis.
     * Runs on the dedicated push executor — never blocks the STOMP/REST thread.
     */
    @Async("pushExecutor")
    public void dispatchNewMessage(MessageDto message, Long roomId, String roomName, String senderUserName) {

        if (!props.enabled()) return;

        try {
            List<Long> memberIds = roomMemberRepository.findUserIdsByRoomId(roomId);

            // Exclude the sender, anyone currently online (Redis set is shared
            // across instances, so the check is globally correct), and anyone
            // over the per-user rate cap.
            List<Long> targets = memberIds.stream()
                    .filter(id -> !id.equals(message.senderId()))
                    .filter(id -> !isOnline(id))
                    .filter(id -> !isRateLimited(id))
                    .toList();

            if (targets.isEmpty()) return;

            List<PushToken> tokens = pushTokenRepository.findByUserIdIn(targets);
            if (tokens.isEmpty()) return;

            String body = buildBody(senderUserName, message.content(), props.privacyMode());
            for (int i = 0; i < tokens.size(); i+= props.expoBatchSize()) {
                List<PushToken> batch =
                        tokens.subList(i, Math.min(i + props.expoBatchSize(), tokens.size()));
                pushSender.send(batch.stream()
                        .map(t -> PushMessage.of(t.getToken(), roomName, body, roomId, message.id()))
                        .toList());
            }

            log.info("Dispatched push for message {} in room {} to {} device(s)",
                    message.id(), roomId, tokens.size());
        } catch (Exception e) {
            // A push failure must never affect chat delivery — log and swallow.
            log.error("Push dispatch failed for message {} room {}: {}",
                    message.id(), roomId, e.getMessage(), e);
        }
    }

    private boolean isOnline(Long userId) {
        return Boolean.TRUE.equals(redisTemplate.opsForSet().isMember(PRESENCE_KEY, userId));
    }

    /**
     * Fixed-window rate limit: one Redis counter per user per minute
     * (INCR + TTL), capped by push.rate-limit-per-user-per-minute.
     *
     * Uses StringRedisTemplate (not the shared Object template) so the counter
     * is always a plain Redis string that INCR can operate on, regardless of
     * the value serializer configured on RedisTemplate<String, Object>.
     */
    private boolean isRateLimited(Long userId) {

        String minuteBucket = String.valueOf(Instant.now().getEpochSecond() / 60);
        String key = RATE_KEY_PREFIX + userId + ":" + minuteBucket;

        // SET NX EX guarantees the TTL even if two instances race on a fresh key
        stringRedisTemplate.opsForValue().setIfAbsent(key, "0", RATE_WINDOW);
        Long count = stringRedisTemplate.opsForValue().increment(key);

        return count != null && count > props.rateLimitPerUserPerMinute();
    }

    static String buildBody(String senderUserName, String content, boolean privacyMode) {
        if (privacyMode) return "You have a new message";
        String preview = content == null ? "" : content;
        if (preview.length() > 100) preview = preview.substring(0, 100) + "…";
        return senderUserName + ": " + preview;
    }
}
