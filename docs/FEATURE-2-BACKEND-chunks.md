# Feature 2 (Backend) — Push Notifications: Chunk-by-Chunk Implementation

> Companion to `docs/FEATURE-2-push-notifications-BACKEND.md` (design) and `docs/FEATURE-2-push-notifications-FRONTEND.md` (already-implemented mobile side). The **frontend is already implemented** and fails silently while these endpoints don't exist — chunks can ship one at a time without breaking anything.
>
> Stack facts that constrain the design: Spring Boot 4.1 (`com.example.chat`), Java 21, JWT via `JwtAuthFilter` (`/api/**` authenticated except `/api/auth/**`), Redis (`RedisTemplate<String, Object>`, presence set key `presence:online` maintained by `PresenceListener`), JPA with `spring.jpa.hibernate.ddl-auto=none` (**manual SQL migration required** — no Flyway), Android-only push via the Expo Push Service (FCM V1 key already uploaded to Expo).

**Chunk order (each ends with a verifiable milestone):**

| # | Chunk | Depends on |
|---|---|---|
| 1 | `push_tokens` table + `PushToken` entity + repository | — |
| 2 | `PushProperties` config + async `pushExecutor` | — |
| 3 | `PushTokenService` + `PushTokenController` (REST register/unregister) | 1, 2 |
| 4 | `PushSender` + `PushMessage` + `ExpoPushSender` (Expo HTTP call) | 2, 3 |
| 5 | `PushDispatcher` + wire into `WebSocketChatController` (end-to-end) | 1, 2, 4 |
| 6 | *(optional hardening)* rate limit + retry | 5 |

---

## Chunk 1 — `push_tokens` table + entity + repository

**Goal:** token persistence exists. Nothing calls it yet.

**Files:**

- **CREATE** `chat/src/main/java/com/example/chat/push/PushToken.java`

```java
package com.example.chat.push;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "push_tokens",
       uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "token"}))
public class PushToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, columnDefinition = "text")
    private String token;             // ExponentPushToken[xxxxxxx]

    @Column(nullable = false, length = 10)
    private String platform;          // "android" (iOS later)

    @Column(name = "device_name", length = 120)
    private String deviceName;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "last_used_at", nullable = false)
    private Instant lastUsedAt = Instant.now();

    public PushToken() {}

    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }
    public String getPlatform() { return platform; }
    public void setPlatform(String platform) { this.platform = platform; }
    public String getDeviceName() { return deviceName; }
    public void setDeviceName(String deviceName) { this.deviceName = deviceName; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getLastUsedAt() { return lastUsedAt; }
    public void setLastUsedAt(Instant lastUsedAt) { this.lastUsedAt = lastUsedAt; }
}
```

- **CREATE** `chat/src/main/java/com/example/chat/push/PushTokenRepository.java`

```java
package com.example.chat.push;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface PushTokenRepository extends JpaRepository<PushToken, Long> {

    List<PushToken> findByUserIdIn(List<Long> userIds);

    void deleteByToken(String token);

    /** Idempotent registration — one row per (user_id, token). */
    @Modifying
    @Query(value = """
            INSERT INTO push_tokens (user_id, token, platform, device_name, created_at, last_used_at)
            VALUES (:userId, :token, :platform, :deviceName, now(), now())
            ON CONFLICT (user_id, token)
            DO UPDATE SET platform = :platform,
                          device_name = :deviceName,
                          last_used_at = now()
            """, nativeQuery = true)
    void upsert(@Param("userId") Long userId,
                @Param("token") String token,
                @Param("platform") String platform,
                @Param("deviceName") String deviceName);
}
```

**DB migration** (required — `ddl-auto=none`). Run once against the EC2 Postgres *and* locally:

```sql
CREATE TABLE IF NOT EXISTS push_tokens (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token        TEXT         NOT NULL,
  platform     VARCHAR(10)  NOT NULL,
  device_name  VARCHAR(120),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user  ON push_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_token ON push_tokens (token);
```

**Verify:** `mvn compile` passes; `SELECT * FROM push_tokens;` returns empty set.

**Estimate:** small. No risk to existing features.

---

## Chunk 2 — `PushProperties` + async executor

**Goal:** config + thread pool exist. `push.enabled=false` kill switch works from day one.

**Files:**

- **CREATE** `chat/src/main/java/com/example/chat/push/PushProperties.java`

```java
package com.example.chat.push;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "push")
public record PushProperties(
        boolean enabled,
        String expoApiUrl,
        int expoBatchSize,
        boolean privacyMode,
        int rateLimitPerUserPerMinute
) {
    public PushProperties {
        if (expoApiUrl == null || expoApiUrl.isBlank()) expoApiUrl = "https://exp.host/--/api/v2/push/send";
        if (expoBatchSize <= 0 || expoBatchSize > 100) expoBatchSize = 100;
        if (rateLimitPerUserPerMinute <= 0) rateLimitPerUserPerMinute = 30;
    }
}
```

- **CREATE** `chat/src/main/java/com/example/chat/push/AsyncPushConfig.java`

```java
package com.example.chat.push;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.ThreadPoolExecutor;

@Configuration
@EnableAsync
public class AsyncPushConfig {

    @Bean(name = "pushExecutor")
    public ThreadPoolTaskExecutor pushExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(500);
        executor.setThreadNamePrefix("push-");
        // Pushes are best-effort: on overflow, drop rather than stall the chat path.
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.DiscardPolicy());
        executor.initialize();
        return executor;
    }
}
```

- **MODIFY** `chat/src/main/java/com/example/chat/ChatApplication.java` — add the two annotations:

```java
@EnableConfigurationProperties(PushProperties.class)   // + import com.example.chat.push.PushProperties
```

- **MODIFY** `chat/src/main/resources/application.properties` — append:

```properties

# ─── PUSH NOTIFICATIONS (Android via Expo Push Service) ────────────
push.enabled=true
push.expo.api-url=https://exp.host/--/api/v2/push/send
push.expo.batch-size=100
push.privacy-mode=false
push.rate-limit-per-user-per-minute=30
```

**Verify:** app boots; setting `push.enabled=false` env var flips the property (check with a temporary log line or just trust the binder).

**Estimate:** small.

---

## Chunk 3 — `PushTokenService` + `PushTokenController` (REST)

**Goal:** `POST /api/push-tokens` and `DELETE /api/push-tokens/current` work — the mobile app stops silently 404-ing. JWT comes from the existing security config (no changes needed).

**Files:**

- **CREATE** `chat/src/main/java/com/example/chat/push/PushTokenService.java`

```java
package com.example.chat.push;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class PushTokenService {

    private static final Logger log = LoggerFactory.getLogger(PushTokenService.class);
    private static final String EXPO_TOKEN_PREFIX = "ExponentPushToken[";

    private final PushTokenRepository pushTokenRepository;

    public PushTokenService(PushTokenRepository pushTokenRepository) {
        this.pushTokenRepository = pushTokenRepository;
    }

    @Transactional
    public void register(Long userId, String token, String platform, String deviceName) {
        validateTokenFormat(token);
        pushTokenRepository.upsert(userId, token, platform, deviceName);
        log.info("Registered push token for user {} (...{})", userId,
                token.substring(token.length() - 6));
    }

    @Transactional
    public void deleteAllForUser(Long userId) {
        List<PushToken> tokens = pushTokenRepository.findByUserIdIn(List.of(userId));
        pushTokenRepository.deleteAll(tokens);
        log.info("Deleted {} push token(s) for user {}", tokens.size(), userId);
    }

    /** Called by ExpoPushSender when Expo reports the token is no longer valid. */
    @Transactional
    public void deleteInvalidToken(String token) {
        pushTokenRepository.deleteByToken(token);
        log.info("Deleted invalid push token (...{})",
                token.substring(Math.max(0, token.length() - 6)));
    }

    private void validateTokenFormat(String token) {
        if (token == null || !token.startsWith(EXPO_TOKEN_PREFIX) || !token.endsWith("]")) {
            throw new IllegalArgumentException("token must be a valid Expo push token");
        }
    }
}
```

- **CREATE** `chat/src/main/java/com/example/chat/push/PushTokenController.java`

```java
package com.example.chat.push;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/push-tokens")
public class PushTokenController {

    private final PushTokenService pushTokenService;

    public PushTokenController(PushTokenService pushTokenService) {
        this.pushTokenService = pushTokenService;
    }

    public record RegisterRequest(
            @NotBlank String token,
            @Pattern(regexp = "android") String platform,   // Android-only for now
            String deviceName) {}

    @PostMapping
    public ResponseEntity<Map<String, String>> register(@Valid @RequestBody RegisterRequest body,
                                                        Authentication auth) {
        Long userId = Long.parseLong(auth.getName());   // NEVER take userId from the body
        pushTokenService.register(userId, body.token(), body.platform(), body.deviceName());
        return ResponseEntity.ok(Map.of("status", "registered"));
    }

    @DeleteMapping("/current")
    public ResponseEntity<Void> unregister(Authentication auth) {
        Long userId = Long.parseLong(auth.getName());
        pushTokenService.deleteAllForUser(userId);
        return ResponseEntity.noContent().build();
    }
}
```

**Verify:** app running → with a JWT from login:
```bash
curl -X POST http://localhost:8085/api/push-tokens \
  -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" \
  -d '{"token":"ExponentPushToken[test]","platform":"android","deviceName":"dev"}'
# → 200 {"status":"registered"} and a row appears in push_tokens
```
Then launch the mobile app against the backend and log in — the app's registration call now succeeds (check backend log for "Registered push token").

**Estimate:** small–medium. Touches no existing code.

---

## Chunk 4 — `PushSender` + `PushMessage` + `ExpoPushSender`

**Goal:** the backend can actually deliver a push to a device through the Expo Push API (ticket handling incl. invalid-token cleanup). Not yet triggered by chat.

**Files:**

- **CREATE** `chat/src/main/java/com/example/chat/push/PushMessage.java`

```java
package com.example.chat.push;

/** Platform-agnostic push payload. */
public record PushMessage(
        String to,          // Expo push token
        String title,       // room name
        String body,        // "Alice: message preview"
        Long roomId,        // deep-link target
        Long messageId) {

    public static PushMessage of(String to, String title, String body, Long roomId, Long messageId) {
        return new PushMessage(to, title, body, roomId, messageId);
    }
}
```

- **CREATE** `chat/src/main/java/com/example/chat/push/PushSender.java`

```java
package com.example.chat.push;

import java.util.List;

public interface PushSender {
    /**
     * Send a batch of push messages. Implementations must be non-blocking
     * (call sites already run on the push executor) and must never throw.
     */
    void send(List<PushMessage> messages);
}
```

- **CREATE** `chat/src/main/java/com/example/chat/push/ExpoPushSender.java`

```java
package com.example.chat.push;

import com.fasterxml.jackson.annotation.JsonProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class ExpoPushSender implements PushSender {

    private static final Logger log = LoggerFactory.getLogger(ExpoPushSender.class);

    private final RestClient restClient;
    private final PushProperties props;
    private final PushTokenService pushTokenService;

    public ExpoPushSender(PushProperties props, PushTokenService pushTokenService) {
        this.props = props;
        this.pushTokenService = pushTokenService;
        this.restClient = RestClient.create();
    }

    @Override
    public void send(List<PushMessage> messages) {
        List<Map<String, Object>> payload = new ArrayList<>(messages.size());
        for (PushMessage m : messages) {
            Map<String, Object> msg = new HashMap<>();
            msg.put("to", m.to());
            msg.put("sound", "default");
            msg.put("title", m.title());
            msg.put("body", m.body());
            msg.put("channelId", "messages");          // Android notification channel
            msg.put("data", Map.of(
                    "roomId", String.valueOf(m.roomId()),     // FCM data = strings only
                    "messageId", String.valueOf(m.messageId())));
            payload.add(msg);
        }

        try {
            ExpoPushResponse response = restClient.post()
                    .uri(props.expoApiUrl())
                    .header("Accept", "application/json")
                    .header("Accept-Encoding", "gzip, deflate")
                    .body(payload)
                    .retrieve()
                    .body(ExpoPushResponse.class);

            handleTicketErrors(messages, response);
        } catch (Exception e) {
            // Retry with backoff arrives in Chunk 6. For now: log and drop — never throw.
            log.error("Expo push request failed: {}", e.getMessage());
        }
    }

    /** Expo returns one ticket per message, in request order — zip by index. */
    private void handleTicketErrors(List<PushMessage> sent, ExpoPushResponse response) {
        if (response == null || response.data() == null) return;
        for (int i = 0; i < response.data().size() && i < sent.size(); i++) {
            Ticket ticket = response.data().get(i);
            if (!"error".equals(ticket.status())) continue;
            if (ticket.details() != null && "DeviceNotRegistered".equals(ticket.details().error())) {
                pushTokenService.deleteInvalidToken(sent.get(i).to());
            } else {
                log.warn("Expo push ticket error: {} {}", ticket.status(), ticket.message());
            }
        }
    }

    // ── Expo API response shape ─────────────────────────────────────────
    record ExpoPushResponse(List<Ticket> data) {}

    record Ticket(String status, String id, String message, TicketDetails details) {}

    record TicketDetails(@JsonProperty("error") String error) {}
}
```

**Verify:** app boots (`mvn spring-boot:run`). Manual smoke test: grab the token row from Chunk 3 (real device registration), temporarily call the sender from a scratch `@PostConstruct`/test endpoint — **or simpler:** proceed to Chunk 5 and test end-to-end there.

**Estimate:** medium. Touches no existing code.

---

## Chunk 5 — `PushDispatcher` + wire into the send path (END-TO-END)

**Goal:** a message sent to a room while a member's app is offline → that member's device gets the OS banner; tapping it opens the room. This is the Phase 1 milestone.

**Files:**

- **MODIFY** `chat/src/main/java/com/example/chat/room/RoomMemberRepository.java` — add:

```java
@Query("select rm.user.id from RoomMember rm where rm.room.id = :roomId")
List<Long> findUserIdsByRoomId(@Param("roomId") Long roomId);
```

- **CREATE** `chat/src/main/java/com/example/chat/push/PushDispatcher.java`

```java
package com.example.chat.push;

import com.example.chat.message.dto.MessageDto;
import com.example.chat.room.RoomMemberRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class PushDispatcher {

    private static final Logger log = LoggerFactory.getLogger(PushDispatcher.class);
    private static final String PRESENCE_KEY = "presence:online";   // same key as PresenceListener

    private final RoomMemberRepository roomMemberRepository;
    private final PushTokenRepository pushTokenRepository;
    private final PushSender pushSender;
    private final RedisTemplate<String, Object> redisTemplate;
    private final PushProperties props;

    public PushDispatcher(RoomMemberRepository roomMemberRepository,
                          PushTokenRepository pushTokenRepository,
                          PushSender pushSender,
                          RedisTemplate<String, Object> redisTemplate,
                          PushProperties props) {
        this.roomMemberRepository = roomMemberRepository;
        this.pushTokenRepository = pushTokenRepository;
        this.pushSender = pushSender;
        this.redisTemplate = redisTemplate;
        this.props = props;
    }

    /**
     * Called AFTER the message is persisted and broadcast over STOMP/Redis.
     * Runs on the dedicated push executor — never blocks the STOMP thread.
     */
    @Async("pushExecutor")
    public void dispatchNewMessage(MessageDto message, Long roomId, String roomName, String senderUsername) {
        if (!props.enabled()) return;

        try {
            List<Long> memberIds = roomMemberRepository.findUserIdsByRoomId(roomId);

            // Exclude the sender and anyone currently online (Redis set is shared
            // across instances, so the check is globally correct)
            List<Long> targets = memberIds.stream()
                    .filter(id -> !id.equals(message.getSenderId()))
                    .filter(id -> !isOnline(id))
                    .toList();

            if (targets.isEmpty()) return;

            List<PushToken> tokens = pushTokenRepository.findByUserIdIn(targets);
            if (tokens.isEmpty()) return;

            String body = buildBody(senderUsername, message.getContent(), props.privacyMode());
            for (int i = 0; i < tokens.size(); i += props.expoBatchSize()) {
                List<PushToken> batch =
                        tokens.subList(i, Math.min(i + props.expoBatchSize(), tokens.size()));
                pushSender.send(batch.stream()
                        .map(t -> PushMessage.of(t.getToken(), roomName, body, roomId, message.getId()))
                        .toList());
            }
            log.info("Dispatched push for message {} in room {} to {} device(s)",
                    message.getId(), roomId, tokens.size());
        } catch (Exception e) {
            // A push failure must never affect chat delivery — log and swallow.
            log.error("Push dispatch failed for message {} room {}: {}",
                    message.getId(), roomId, e.getMessage(), e);
        }
    }

    private boolean isOnline(Long userId) {
        return Boolean.TRUE.equals(redisTemplate.opsForSet().isMember(PRESENCE_KEY, userId));
    }

    static String buildBody(String senderUsername, String content, boolean privacyMode) {
        if (privacyMode) return "You have a new message";
        String preview = content == null ? "" : content;
        if (preview.length() > 100) preview = preview.substring(0, 100) + "…";
        return senderUsername + ": " + preview;
    }
}
```

- **MODIFY** `chat/src/main/java/com/example/chat/message/WebSocketChatController.java`:

1. Constructor: inject `PushDispatcher` and `RoomRepository` (fetch the real `Room` for its name instead of the bare `new Room()`):

```java
private final PushDispatcher pushDispatcher;
private final RoomRepository roomRepository;

public WebSocketChatController(..., PushDispatcher pushDispatcher, RoomRepository roomRepository) {
    ...
    this.pushDispatcher = pushDispatcher;
    this.roomRepository = roomRepository;
}
```

2. In `sendMessage(...)`, replace the bare-room membership check and add the dispatch call:

```java
Room room = roomRepository.findById(roomId)
        .orElseThrow(() -> new RuntimeException("Room not found"));

if (!roomMemberRepository.existsByRoomAndUser(room, user)) {
    throw new RuntimeException("User is not a member of this room");
}

MessageDto saved = messageService.saveMessage(roomId, userId, content, type);

messagingTemplate.convertAndSend("/topic/room." + roomId, saved);

ChatMessageEvent chatEvent = ChatMessageEvent.from(saved);
redisPublisher.publishChatMessage(roomId, chatEvent);

// Push to OFFLINE members (async — returns immediately)
pushDispatcher.dispatchNewMessage(saved, roomId, room.getName(), user.getUsername());
```

3. Apply the same one-liner in the REST path (`ChatController` / wherever `POST /api/rooms/{id}/messages` is handled) so REST-sent messages also produce pushes.

**Verify (end-to-end milestone):**
1. Device A: log in (token registers), then force-stop the app.
2. Device B (or emulator / second user): send a message to the shared room.
3. Device A shows the OS banner "RoomName — B: message" → tap opens the room.
4. Backend log shows `Dispatched push for message ... to 1 device(s)`.
5. Reverse check: with Device A's app **open**, a new message produces **no** push (presence suppression).

**Estimate:** medium — the only chunk that modifies existing send-path code.

---

## Chunk 6 — *(optional, Phase 2)* Hardening

**Goal:** flood protection + resilience. Ship after the milestone works.

1. **Rate limit** in `PushDispatcher` before sending (Redis INCR + EXPIRE, per user, `props.rateLimitPerUserPerMinute()`): skip the push when over the cap.
2. **Retry** in `ExpoPushSender`: on HTTP 429/5xx, retry ≤ 3 times with exponential backoff (in-memory; the push executor already isolates the wait).
3. **Cleanup job** (optional): delete tokens with `last_used_at` older than 90 days (`@Scheduled`).
4. **Digest batching** (optional): when a user's pushes get rate-limited, collapse into one "N new messages in <room>" push.

**Verify:** hammer N > limit messages while a device is offline → pushes stop at the cap; kill the network mid-send → retry logs appear, no exception escapes.

---

## Notes / risks per the design doc

- **Never block the STOMP thread** — dispatch is `@Async("pushExecutor")` with `DiscardPolicy` (Chunks 2+5).
- **Presence race** — a just-reopened app may briefly appear offline → occasional banner over the open app; accepted (client suppresses banners for the room on screen).
- **Ticket→token mapping** — Expo returns tickets in request order; `ExpoPushSender` zips by index (Chunk 4).
- **userId from principal only** — never from the request body (Chunk 3).
- **`MessageDto` accessors** — Chunk 5 assumes `getSenderId()/getId()/getContent()`; if `MessageDto` is a record, use the accessor names as-is (records use the same names).
