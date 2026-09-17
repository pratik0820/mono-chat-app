# FEATURE 2 — Push Notifications: Backend (Spring Boot)

> **Scope:** the service decision, architecture, database changes, REST API contract, and complete Spring Boot implementation for push notifications.
> **Companion doc:** [`docs/FEATURE-2-push-notifications-FRONTEND.md`](./FEATURE-2-push-notifications-FRONTEND.md) — mobile app changes, UI/UX design, and device testing.
> **Stack:** Spring Boot 4.1, Java 21, PostgreSQL, Redis. Grounded in the actual codebase: `WebSocketChatController`, `RedisPublisher`/`RedisSubscriber`, `PresenceListener`, `RoomMemberRepository`.
> **Platforms:** **Android only** — iOS is out of scope for now (see §2.1 and §11.2).

---

## Table of Contents

1. [Why Push Notifications](#1-why-push-notifications)
2. [Decision: External Service — Yes, and It's Free](#2-decision-external-service--yes-and-its-free)
3. [Architecture](#3-architecture)
4. [Database Changes](#4-database-changes)
5. [Backend Implementation (Spring Boot)](#5-backend-implementation-spring-boot)
6. [API Contract](#6-api-contract)
7. [Security & Privacy](#7-security--privacy)
8. [Testing Plan](#8-testing-plan)
9. [Phased Delivery Plan](#9-phased-delivery-plan)
10. [Risks & Gotchas](#10-risks--gotchas)
11. [Appendix A: DIY Path (No Expo Broker)](#11-appendix-a-diy-path-no-expo-broker)

---

## 1. Why Push Notifications

Today, Mono delivers messages only while the recipient's app is **foregrounded** with an active STOMP WebSocket. When the app is backgrounded, Android suspends the socket (documented in README Troubleshooting: "App backgrounding drops WebSocket"), and the user misses messages until they reopen the app.

Push notifications close that gap: when the recipient's app is **not connected**, the backend calls the OS push gateways, which show a banner/sound/badge even when the app is killed.

**Delivery rule used throughout this plan:**

- App **foregrounded / WebSocket connected** → deliver in-band via STOMP (existing path, instant, free).
- App **backgrounded / killed** → deliver out-of-band via push (FCM).

---

## 2. Decision: External Service — Yes, and It's Free

### 2.1 What is non-negotiable

There is no way to implement push "fully on our own." Android forces every app through its platform gateway:

| Platform | Gateway | Why it cannot be bypassed |
|---|---|---|
| Android | **FCM** (Firebase Cloud Messaging) | Only FCM holds the privileged persistent system connection on Play-certified devices; OEM battery killers (Xiaomi, Realme, OPPO) make direct sockets unreliable |

> **iOS (out of scope for now):** iOS would additionally require **APNs** (Apple Push Notification service) — only APNs can wake a killed iOS app, and Apple rejects apps that push outside APNs. If iOS ships later, see §11.2.

So "self-hosted push" in the strict sense is impossible. The real question is: **which broker layer sits between our Spring Boot server and the OS gateways?**

```
Spring Boot server
      │
      ▼
┌──────────────────────────────────────────┐
│ Layer 2 (the choice): broker/management  │
│   Expo Push Service  /  FCM HTTP v1 API  │
│   /  OneSignal                           │
└──────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────┐
│ Layer 1 (non-negotiable): OS gateway     │
│   FCM (Android)                          │
└──────────────────────────────────────────┘
```

### 2.2 Options compared (verified September 2026)

| Option | Cost | Notes |
|---|---|---|
| **Expo Push Service** | **Free** — no per-notification charges; documented rate limit ≈ 600 notifications/second per project; batches up to 100 messages per API request | First-party for Expo SDK 57; one uniform REST API for both platforms. ✅ **Recommended** |
| Direct FCM HTTP v1 | Free, unlimited | Requires Google service-account JSON + OAuth token management in Spring Boot; covers Android only |
| OneSignal | Free up to ~10,000 subscribers | Solid product, but adds an SDK and account for features Mono doesn't need (segmentation, A/B tests, journeys) |
| Amazon SNS | Free tier, then per-message | Overkill — more moving parts |

### 2.3 Chosen approach

> **Expo Push Service** (free) + **FCM** (Android).

Why it wins for Mono:

1. **$0 total cost.** FCM is free; the Expo broker is free. No Apple Developer account needed while iOS is out of scope.
2. **One uniform API.** The backend POSTs to `https://exp.host/--/api/v2/push/send` with Expo push tokens; Expo fans out to FCM. No FCM service-account OAuth in our backend.
3. **First-party.** `expo-notifications` is maintained by the Expo team and aligned with our SDK 57.
4. **No new secrets.** Unlike the DIY path (§11), the Expo path needs no service-account JSON on the backend.
5. **Clean escape hatch.** If we ever outgrow Expo's service, only one class changes (`ExpoPushSender` → a direct FCM sender); the DB schema, REST endpoints, and dispatch logic stay identical — see [§11 Appendix A](#11-appendix-a-diy-path-no-expo-broker).

### 2.4 Decision summary

| Question | Answer |
|---|---|
| External service needed? | **Yes** — the FCM gateway is mandatory on Android; on top we use the free **Expo Push Service** as broker |
| Best free service? | **Expo Push Service** — free, no per-notification charge, ≈600 msg/s, first-party for Expo |
| Fully self-hosted possible? | **No** at the FCM-gateway layer. DIY (direct FCM HTTP v1) is possible — see §11 — but is more work for zero cost savings (both are free) |
| Total cost | $0 (no Apple Developer fee while iOS is out of scope) |

---

## 3. Architecture

### 3.1 High-level flow

```
                       ┌────────────────────────────────────────────────────────────┐
                       │                     Spring Boot Backend                    │
                       │                                                            │
 User A (app open) ─STOMP─▶ WebSocketChatController.sendMessage()                 │
                       │    1. persist Message (Postgres)                           │
                       │    2. broadcast /topic/room.{id}        (local STOMP)      │
                       │    3. redisPublisher.publishChatMessage()  (cross-instance)│
                       │    4. NEW: pushDispatcher.dispatchNewMessage(msg, roomId)  │
                       │              └─ @Async — never blocks the STOMP thread     │
                       │                                                            │
                       │   PushDispatcher (async):                                  │
                       │     a. room members via RoomMemberRepository               │
                       │     b. exclude sender                                      │
                       │     c. exclude users in Redis "presence:online" set        │
                       │     d. look up Expo push tokens for remaining users        │
                       │     e. build payloads, hand to PushSender                  │
                       └──────────────────────────────┬─────────────────────────────┘
                                                      │ HTTPS POST (batches ≤ 100)
                                                      ▼
                                        ┌──────────────────────────┐
                                        │   Expo Push Service      │
                                        │ exp.host/--/api/v2/push/ │
                                        │         send             │
                                        └────────────┬─────────────┘
                                                     │ fans out
                                          ▼
                                   ┌──────────────┐
                                   │ FCM (Google) │
                                   └──────┬───────┘
                                          ▼
                                   User B's device
                                   (banner/sound/badge)
```

### 3.2 Where the trigger lives: backend-side

The backend triggers pushes, not the sender's client. Reasons:

1. The backend already owns room membership (`RoomMemberRepository`), presence (`PresenceListener` + Redis `presence:online`), and message persistence (`MessageService`).
2. Client-side triggering is a security hole — any authenticated user could spam pushes to whole rooms, bypassing server rate limits.
3. The OS gateways are designed for server-originated pushes; this is how production chat systems work.

### 3.3 Single-trigger rule across instances

Messages are already fanned out across backend instances via Redis Pub/Sub (`RedisPublisher` → `RedisSubscriber`). For push, we do **not** add a Redis hop for triggering:

> **Rule:** only the instance that received the inbound STOMP `SEND` (and persisted the message) dispatches the push — exactly once. Suppression of already-online users uses the Redis `presence:online` set, which is shared across all instances, so the check is globally correct.

(A Redis channel `push.room.{roomId}` is deferred to Phase 3, for server-originated events that are not tied to an inbound client message, e.g. "you were added to a room".)

### 3.4 Presence race — accepted trade-off

Redis presence is eventually consistent: a user who just backgrounded the app may still appear online for a short window (push suppressed — fine), and a user who just reopened the app may briefly appear offline (push sent — the banner appears over the open app).

We prefer **false positives (occasional redundant push) over false negatives (missed messages)**. A client-side guard suppresses banners for the room currently on screen (frontend doc §7.2).

### 3.5 What triggers a push

| Event | Push? | Notes |
|---|---|---|
| New chat message (`type = USER`) | ✅ Yes — to offline room members | The main case |
| New AI message (`type = AI`, `@AI` reply) | ✅ Yes — same dispatch path | |
| Typing indicator | ❌ Never | Ephemeral, high frequency — would be spam |
| Presence events | ❌ Never | Too noisy |
| Theme change | ❌ Never | Room-scoped cosmetic |
| Added to a room | 🔜 Phase 3 | Low volume, genuinely useful |

**Only USER and AI messages trigger pushes.** Everything else stays in-band.

### 3.6 New backend package

```
chat/src/main/java/com/example/chat/push/
├── PushToken.java                  # JPA entity
├── PushTokenRepository.java
├── PushTokenService.java           # Upsert, dedupe, cleanup of invalid tokens
├── PushTokenController.java        # REST: register / unregister tokens
├── dto/
│   ├── RegisterPushTokenRequest.java
│   └── RegisterPushTokenResponse.java
├── PushDispatcher.java             # Decides WHO gets a push for a new message
├── PushSender.java                 # Interface (swappable: Expo today, DIY FCM later)
├── ExpoPushSender.java             # Implementation: REST call to Expo Push API
└── AsyncPushConfig.java            # "pushExecutor" thread pool
```

---

## 4. Database Changes

### 4.1 New table: `push_tokens`

```sql
CREATE TABLE push_tokens (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token        TEXT         NOT NULL,              -- Expo push token: ExponentPushToken[xxxxxxx]
  platform     VARCHAR(10)  NOT NULL,              -- 'android' (column kept for a future iOS release)
  device_name  VARCHAR(120),                       -- e.g. "iPhone 15 Pro" (debug aid)
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE INDEX idx_push_tokens_user  ON push_tokens (user_id);
CREATE INDEX idx_push_tokens_token ON push_tokens (token);
```

Design notes:

- **Multi-device:** a user may be logged in on phone + tablet. One row per `(user_id, token)` pair; `UNIQUE (user_id, token)` makes re-registration idempotent.
- **Token movement between users:** when a device logs out and logs in as a different user, the app calls `DELETE /api/push-tokens/current` (removes the old user's row) before registering under the new account.
- `last_used_at` supports a Phase 3 cleanup job (delete tokens unused for 90+ days).

### 4.2 Migration

The project uses `spring.jpa.hibernate.ddl-auto=none` with a manually managed schema, so this is a manual migration:

```bash
docker exec -it realtime-chat-postgres-1 psql -U postgres -d chat -f migration_push_tokens.sql
```

(If the team later adopts Flyway: `V<next>__add_push_tokens.sql`.)

---

## 5. Backend Implementation (Spring Boot)

### 5.1 Dependencies — none new

The Expo Push API is a plain JSON REST call. Spring's `RestClient` (already on the classpath via `spring-boot-starter-webmvc`) handles it, and `@EnableAsync` comes from core Spring. The DIY path (§11) is what would add the Google auth library.

### 5.2 Configuration — `application.properties`

```properties
# ─── PUSH NOTIFICATIONS ─────────────────────────────────────────────
push.enabled=true
push.expo.api-url=https://exp.host/--/api/v2/push/send
push.expo.batch-size=100
push.privacy-mode=false
push.rate-limit-per-user-per-minute=30
```

All overridable via env vars at deploy time, same convention as `jwt.secret` / `ai.api-key`. `push.enabled=false` short-circuits dispatch for local development without network access.

### 5.3 `@ConfigurationProperties` class

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
    }
}
```

Enable it on the application class with `@EnableConfigurationProperties(PushProperties.class)` (and `@EnableAsync`).

### 5.4 Entity + repository

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
    private String token;

    @Column(nullable = false, length = 10)
    private String platform;          // "android" (column kept for a future iOS release)

    @Column(name = "device_name", length = 120)
    private String deviceName;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "last_used_at", nullable = false)
    private Instant lastUsedAt = Instant.now();

    // getters/setters omitted for brevity
}
```

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

    /** Idempotent registration. */
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

### 5.5 REST endpoints — `PushTokenController`

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

Notes:

- Both endpoints require JWT — they fall under the existing `SecurityConfig` authenticated-by-default rule. No new security config needed.
- `userId` always comes from the authenticated principal, never the request body (prevents registering someone else's device).

### 5.6 `PushTokenService`

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

### 5.7 Async executor — `AsyncPushConfig`

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

This enforces the existing project rule (PLAN.md §11.2): never block the STOMP dispatch thread — pushes run on their own executor, and overflow is dropped (a lost push is better than a stalled broker).

### 5.8 `PushDispatcher` — the brain

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
            // 1. Room members
            List<Long> memberIds = roomMemberRepository.findUserIdsByRoomId(roomId);

            // 2. Exclude the sender
            // 3. Exclude users currently online (Redis set shared across instances)
            List<Long> targets = memberIds.stream()
                    .filter(id -> !id.equals(message.getSenderId()))
                    .filter(id -> !isOnline(id))
                    .toList();

            if (targets.isEmpty()) return;

            // 4. Push tokens for the offline targets
            List<PushToken> tokens = pushTokenRepository.findByUserIdIn(targets);
            if (tokens.isEmpty()) return;

            // 5. Build + send in batches of up to 100
            String body = buildBody(senderUsername, message.getContent(), props.privacyMode());
            for (int i = 0; i < tokens.size(); i += props.expoBatchSize()) {
                List<PushToken> batch = tokens.subList(i, Math.min(i + props.expoBatchSize(), tokens.size()));
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

### 5.9 `PushSender` interface + message DTO

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

### 5.10 `ExpoPushSender` — the HTTP call

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
                    "roomId", String.valueOf(m.roomId()),     // strings only — see frontend doc §5
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
            // Retry policy (Phase 2): exponential backoff on 429/5xx. For now: log and drop.
            log.error("Expo push request failed: {}", e.getMessage());
        }
    }

    /**
     * Expo returns one ticket per message, in request order — zip by index.
     */
    private void handleTicketErrors(List<PushMessage> sent, ExpoPushResponse response) {
        if (response == null || response.data() == null) return;
        for (int i = 0; i < response.data().size() && i < sent.size(); i++) {
            Ticket ticket = response.data().get(i);
            if (!"error".equals(ticket.status())) continue;
            if (ticket.details() != null && "DeviceNotRegistered".equals(ticket.details().error())) {
                // Device uninstalled the app / token revoked → stop pushing to it.
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

### 5.11 Wire into the existing send path

In `WebSocketChatController.sendMessage()`, after the Redis publish:

```java
// after: redisPublisher.publishChatMessage(roomId, chatEvent);
pushDispatcher.dispatchNewMessage(saved, roomId, room.getName(), user.getUsername());
```

Two small notes:

- The controller currently constructs a bare `Room` for the membership check; fetch the real `Room` entity once (`roomRepository.findById(roomId)`) so the room name is available for the push title — this also simplifies the membership check against the loaded entity.
- Apply the same one-liner to the REST send path (`POST /api/rooms/{id}/messages`) if it shares `MessageService.saveMessage`, so REST-sent messages also produce pushes.

### 5.12 Repository method to add

`RoomMemberRepository` gains:

```java
@Query("select rm.user.id from RoomMember rm where rm.room.id = :roomId")
List<Long> findUserIdsByRoomId(@Param("roomId") Long roomId);
```

---

## 6. API Contract

### 6.1 New REST endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `POST` | `/api/push-tokens` | JWT | `{ "token": "ExponentPushToken[...]", "platform": "android", "deviceName": "Pixel 8" }` | `200 { "status": "registered" }` |
| `DELETE` | `/api/push-tokens/current` | JWT | — | `204 No Content` |

Validation: `token` must be non-blank and match `ExponentPushToken[...]` format; `platform` must be `android` (iOS is rejected until it ships). Errors follow the existing `GlobalExceptionHandler` behavior.

### 6.2 Outbound payload to the Expo Push API

Per message (batched up to 100 per request):

```json
{
  "to": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "sound": "default",
  "title": "General",
  "body": "Alice: hey, did you see the doc?",
  "channelId": "messages",
  "data": { "roomId": "42", "messageId": "999" }
}
```

Response contains one **ticket** per message, in request order:

```json
{ "data": [ { "status": "ok", "id": "aaa-bbb-ccc" },
            { "status": "error", "message": "...", "details": { "error": "DeviceNotRegistered" } } ] }
```

`DeviceNotRegistered` → delete that token from `push_tokens` (§5.10 handles the index-zip mapping).

### 6.3 Config/env summary to add at deploy

| Variable | Default | Notes |
|---|---|---|
| `push.enabled` | `true` | Kill switch |
| `push.expo.api-url` | `https://exp.host/--/api/v2/push/send` | Override for tests |
| `push.expo.batch-size` | `100` | Expo max per request |
| `push.privacy-mode` | `false` | Hide previews on lock screen |
| `push.rate-limit-per-user-per-minute` | `30` | Flood protection |

No new secrets are required for the Expo path (that's a key advantage over the DIY path in §11, which needs a Google service-account JSON).

---

## 7. Security & Privacy

| Concern | Mitigation |
|---|---|
| Registering someone else's device (harassment vector) | `userId` always taken from the JWT principal, never the request body; both endpoints require auth |
| Token theft/abuse | Validate Expo token format on register (`ExponentPushToken[...]`); never log full tokens (last 6 chars only) |
| Lock-screen content leak (shared phones) | `push.privacy-mode=true` → body becomes "You have a new message" (no sender/text preview); title stays room name |
| Push flooding (room with many messages while user offline) | Redis rate limit per user (reuse the AI rate-limit pattern from PLAN.md Step 8): default 30 pushes/user/minute; digest batching in Phase 3 |
| Backend outage of Expo service | Push is best-effort by design; chat is unaffected (STOMP + Redis path is independent); failures logged, optional retry queue in Phase 3 |
| Payload contents | `data` carries only `roomId`/`messageId` (strings) — no message content in `data`; preview text (optional, privacy-gated) lives in `body` |
| Stale tokens | `DeviceNotRegistered` ticket → token deleted; Phase 3: 90-day `last_used_at` cleanup job |

---

## 8. Testing Plan

### 8.1 Backend automated tests

| Test | Verifies |
|---|---|
| `PushTokenServiceTest` | Token-format validation; upsert idempotency; deletion on logout |
| `PushDispatcherTest` | Excludes sender; excludes online users (mocked Redis); privacy-mode body; 100-char truncation; batching at 100 |
| `ExpoPushSenderTest` | Mock REST server: correct URL/headers/body; parses tickets; `DeviceNotRegistered` → token deleted; network error → no throw |
| `PushTokenControllerTest` | JWT required; registers under principal's id; rejects bad platform/token |
| STOMP integration test (reuse the `WebSocketStompClient` pattern from PLAN.md Step 9) | Sender + one online user + one offline user with a token → push sent only to the offline user's token with the exact expected payload |

### 8.2 End-to-end verification

The frontend doc (§9) covers the device matrix; the quickest backend-side check is the Expo push tool at https://expo.dev/notifications with a token fetched from the `push_tokens` table.

---

## 9. Phased Delivery Plan

### Phase 1 — Android MVP (≈1 day)

1. DB migration `push_tokens` (§4).
2. Backend: `PushProperties`, `AsyncPushConfig`, entity+repo, `PushTokenController`/`Service`, `PushDispatcher`, `ExpoPushSender`, wire into `WebSocketChatController` (§5).
3. Frontend: dependency, plugin, registration, handlers (frontend doc §3–§6).
4. (Only for EAS dev builds / APKs) Firebase project + `google-services.json` — Expo Go on Android works without it.
5. Verify manual matrix scenarios 1–3 (frontend doc §9.2) on Android.

**✅ Milestone:** offline Android device receives a banner for a room message and tapping opens the right room.

### Phase 2 — Hardening (≈1 day)

1. Rate limiting per user (Redis INCR pattern, §7).
2. Retry with exponential backoff on Expo 429/5xx (simple in-memory retry, ≤3 attempts).
3. Backend tests from §8.1 green.
4. Build a release APK via EAS with the Firebase config wired (frontend doc §2) and re-verify the matrix.

**✅ Milestone:** token cleanup works; tests green; release APK receives pushes.

### Phase 3 — Polish (optional, ≈1 day)

1. Privacy mode toggle exposed in app settings.
2. Badge count via an unread-count endpoint (`setBadgeCountAsync`).
3. "Added to room" pushes via a `push.room.{roomId}` Redis channel for server-originated events.
4. 90-day stale-token cleanup job.
5. Digest batching ("5 new messages in General") for rate-limited users.

---

## 10. Risks & Gotchas

1. **`data` payload strings only** — FCM coerces non-string values; send `roomId` as `String.valueOf(...)`.
2. **Ticket→token mapping** — Expo returns tickets in request order; zip them by index with the outgoing batch (implemented in §5.10).
3. **Presence race** — occasional banner over a foregrounded app (§3.4); accepted, mitigated client-side (frontend doc §7.2).
4. **Never block the STOMP thread** — push runs on `pushExecutor` with `DiscardPolicy`; a dropped push beats a stalled broker.
5. **Rate limits** — Expo allows ≈600 notifications/second per project and 100 per request; our batching plus per-user rate limits keep us far below.
6. **Message persistence ordering** — the dispatch call must come **after** `messageService.saveMessage` so the `MessageDto.id` exists; keep it after the Redis publish for a clean "persist → broadcast → push" sequence.
7. **REST path parity** — if messages can also be sent via `POST /api/rooms/{id}/messages`, wire the same dispatch there or pushes only fire for STOMP sends.
8. **Package name** — `app.json` → `android.package` is currently `com.anonymous.mono`; set a real package id (e.g. `com.<you>.mono`) **before** creating the Firebase Android app, because FCM binds to it (frontend doc §2).

---

## 11. Appendix A: DIY Path (No Expo Broker)

If we ever drop the Expo broker, only `PushSender` changes — the schema, REST API, dispatcher, and frontend registration logic stay identical. The client-side change is also small: instead of `getExpoPushTokenAsync()`, request `getDevicePushTokenAsync()` (returns the raw FCM token) and store that.

### 11.1 Android — FCM HTTP v1 API directly

1. Firebase console → Project settings → Service accounts → generate a **service account JSON** with the `firebase-messaging` role.
2. Add `com.google.auth:google-auth-library-oauth2-http` to `pom.xml`.
3. Per request: obtain an OAuth2 access token (scope `https://www.googleapis.com/auth/firebase.messaging`), then POST to `https://fcm.googleapis.com/v1/projects/{project_id}/messages:send` per device:

```json
{
  "message": {
    "token": "<fcm-device-token>",
    "notification": { "title": "RoomName", "body": "Alice: text" },
    "data": { "roomId": "42", "messageId": "999" },
    "android": { "priority": "HIGH", "notification": { "channel_id": "messages" } }
  }
}
```

4. Handle responses: `UNREGISTERED` (404) → delete token; `QUOTA_EXCEEDED`/429/5xx → backoff and retry.

Operational burden: service-account secret management (env var / secret store), token refresh caching, and per-platform error handling.

### 11.2 iOS (when it ships later)

Android-only today means **no APNs work at all**. If iOS ships later, the DIY path adds a second sender: an APNs auth key (`.p8`), ES256 JWT signing, an HTTP/2 client (`pushy`), `410 Unregistered` handling, and dual environments (development/production). With the Expo broker (chosen path), iOS costs almost nothing extra — Expo abstracts APNs the same way it abstracts FCM; you'd only add the Apple Developer setup on the client side.

### 11.3 Comparison at a glance (Android)

| | Expo broker (chosen) | DIY (direct FCM) |
|---|---|---|
| Cost | Free | Free |
| New backend deps | None | Google auth library |
| New secrets | None | Google service-account JSON |
| Code surface | One sender class | Sender + OAuth token refresh + retry plumbing |
| Token lifecycle handling | Expo tickets (simple) | Manual (`UNREGISTERED` handling) |
| Vendor dependency | Expo service uptime | None (direct to Google) |

**Recommendation stands:** start with the Expo broker; keep the `PushSender` interface so the DIY swap is a contained refactor if requirements change (e.g., needing delivery receipts at scale, or removing the Expo dependency).
