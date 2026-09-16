# Feature 1 (Backend) — Chat Themes: Chunk-by-Chunk Implementation

> Companion to `docs/FEATURE-1-chat-themes.md`. The **frontend is already implemented** (ThemeSheet, chat background rendering, `THEME_UPDATED` handling, API helpers in `mobile/src/api/client.ts`) and gracefully falls back to the default theme while these endpoints don't exist yet — so chunks can ship in any order without breaking the app.
>
> Stack facts that constrain the design: Spring Boot (com.example.chat), JWT via `JwtAuthFilter` (stateless, `/api/**` authenticated except `/api/auth/**`), STOMP broker prefix `/topic`, app prefix `/app`, Redis pub/sub for cross-instance fan-out, JPA/Hibernate with `ddl-auto` (no Flyway yet).

---

## Chunk 1 — RoomTheme entity + repository + DB table

**Goal:** theme state persists. No endpoints yet.

**Files:**

- **CREATE** `chat/src/main/java/com/example/chat/theme/RoomTheme.java`

```java
package com.example.chat.theme;

import com.example.chat.room.Room;
import com.example.chat.user.User;
import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "room_theme")
public class RoomTheme {

    @Id
    @Column(name = "room_id")
    private Long roomId; // one-to-one with rooms; PK is the room id

    @Column(name = "theme_id", length = 32)
    private String themeId;   // built-in id ("sunset"), or null if image

    @Column(name = "image_url", columnDefinition = "TEXT")
    private String imageUrl;  // /files/... or absolute URL, or null if builtin

    @Column(name = "updated_by", nullable = false)
    private Long updatedBy;

    @Column(name = "updated_at", nullable = false, updatable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() { updatedAt = Instant.now(); }

    @PreUpdate
    void onUpdate() { updatedAt = Instant.now(); }

    // getters/setters for all fields
}
```

- **CREATE** `chat/src/main/java/com/example/chat/theme/RoomThemeRepository.java`

```java
package com.example.chat.theme;

import org.springframework.data.jpa.repository.JpaRepository;

public interface RoomThemeRepository extends JpaRepository<RoomTheme, Long> {
    // roomId is the PK, so findById(roomId) is all we need
}
```

**DB table** (apply once via psql, or rely on `ddl-auto=update`):

```sql
CREATE TABLE IF NOT EXISTS room_theme (
  room_id    BIGINT PRIMARY KEY,
  theme_id   VARCHAR(32),
  image_url  TEXT,
  updated_by BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT room_theme_theme_id_check CHECK (
    (theme_id IS NOT NULL AND image_url IS NULL) OR
    (theme_id IS NULL AND image_url IS NOT NULL))
);
```

Note: table is intentionally denormalized (roomId as PK instead of a FK Joinable to Room) to keep Chunk 1 dependency-free. If you prefer an association, make `roomId` a `@OneToOne @JoinColumn(name="room_id") Room room` — behavior is identical.

**Verify:** app boots, table exists, `SELECT * FROM room_theme;` works. (Optionally add a temporary `@PostConstruct` in a test config to save+read a row.)

**Estimate:** small. No risk to existing features.

---

## Chunk 2 — ThemeService + DTO + ThemeController (REST: GET/PUT builtin/DELETE)

**Goal:** built-in themes become fully functional end-to-end. Custom-image themes still return 501 until Chunk 4.

**Files:**

- **CREATE** `chat/src/main/java/com/example/chat/theme/dto/RoomThemeDto.java`

```java
package com.example.chat.theme.dto;

import com.example.chat.theme.RoomTheme;
import java.time.Instant;

public record RoomThemeDto(String themeId, String imageUrl, Long updatedBy, Instant updatedAt) {
    public static RoomThemeDto from(RoomTheme t) {
        return new RoomThemeDto(t.getThemeId(), t.getImageUrl(), t.getUpdatedBy(), t.getUpdatedAt());
    }
}
```

- **CREATE** `chat/src/main/java/com/example/chat/theme/ThemeService.java`

```java
package com.example.chat.theme;

import com.example.chat.room.Room;
import com.example.chat.room.RoomMemberRepository;
import com.example.chat.theme.dto.RoomThemeDto;
import com.example.chat.user.User;
import com.example.chat.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ThemeService {

    private final RoomThemeRepository roomThemeRepository;
    private final RoomMemberRepository roomMemberRepository;
    private final UserRepository userRepository;

    public ThemeService(RoomThemeRepository roomThemeRepository,
                        RoomMemberRepository roomMemberRepository,
                        UserRepository userRepository) {
        this.roomThemeRepository = roomThemeRepository;
        this.roomMemberRepository = roomMemberRepository;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public RoomThemeDto get(Long roomId, Long userId) {
        requireMember(roomId, userId);
        return roomThemeRepository.findById(roomId).map(RoomThemeDto::from).orElse(null);
    }

    @Transactional
    public RoomThemeDto setBuiltinTheme(Long roomId, Long userId, String themeId) {
        requireMember(roomId, userId);
        validateThemeId(themeId); // whitelist check
        RoomTheme theme = roomThemeRepository.findById(roomId).orElseGet(RoomTheme::new);
        theme.setRoomId(roomId);
        theme.setThemeId(themeId);
        theme.setImageUrl(null); // builtin replaces any custom image
        theme.setUpdatedBy(userId);
        return RoomThemeDto.from(roomThemeRepository.save(theme));
    }

    @Transactional
    public RoomThemeDto clear(Long roomId, Long userId) {
        requireMember(roomId, userId);
        roomThemeRepository.findById(roomId).ifPresent(roomThemeRepository::delete);
        return null; // 204-style
    }

    void requireMember(Long roomId, Long userId) {
        var user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
        var room = new Room();
        room.setId(roomId);
        if (!roomMemberRepository.existsByRoomAndUser(room, user)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not a member of this room");
        }
    }

    // Keep in sync with mobile/src/constants/chatThemes.ts
    private static final java.util.Set<String> ALLOWED =
            java.util.Set.of("default", "sunset", "ocean", "midnight", "forest",
                             "paper", "candy", "peach", "aurora", "mono");

    private void validateThemeId(String themeId) {
        if (themeId == null || !ALLOWED.contains(themeId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown themeId");
        }
    }
}
```

- **CREATE** `chat/src/main/java/com/example/chat/theme/ThemeController.java`

```java
package com.example.chat.theme;

import com.example.chat.theme.dto.RoomThemeDto;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.Map;

@RestController
@RequestMapping("/api/rooms/{roomId}/theme")
public class ThemeController {

    private final ThemeService themeService;

    public ThemeController(ThemeService themeService) { this.themeService = themeService; }

    /** 200 with body, or 204 when the room uses the default theme. */
    @GetMapping
    public ResponseEntity<RoomThemeDto> get(@PathVariable Long roomId, Principal principal) {
        RoomThemeDto dto = themeService.get(roomId, Long.parseLong(principal.getName()));
        return dto == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(dto);
    }

    /** Built-in theme: {"themeId": "sunset"}. Image upload arrives in Chunk 4. */
    @PutMapping
    public RoomThemeDto put(@PathVariable Long roomId,
                            @RequestBody(required = false) Map<String, String> body,
                            Principal principal) {
        Long userId = Long.parseLong(principal.getName());
        String themeId = body == null ? null : body.get("themeId");
        if (themeId == null) {
            throw new org.springframework.web.server.ResponseStatusException(
                    HttpStatus.NOT_IMPLEMENTED, "Image themes arrive in a later chunk");
        }
        return themeService.setBuiltinTheme(roomId, userId, themeId);
    }

    @DeleteMapping
    public ResponseEntity<Void> delete(@PathVariable Long roomId, Principal principal) {
        themeService.clear(roomId, Long.parseLong(principal.getName()));
        return ResponseEntity.noContent().build();
    }
}
```

**Auth note:** no SecurityConfig change needed — `/api/**` is already authenticated and `Principal` is populated by `JwtAuthFilter`. Membership is enforced in `ThemeService.requireMember`, same pattern as `MessageService`/`RoomService`.

**Verify (curl):**

```bash
TOKEN=... # login token
curl -X PUT http://localhost:8085/api/rooms/1/theme -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"themeId":"sunset"}'
curl http://localhost:8085/api/rooms/1/theme -H "Authorization: Bearer $TOKEN"
curl -X DELETE http://localhost:8085/api/rooms/1/theme -H "Authorization: Bearer $TOKEN" -i
```

Then in the app: open a room → 🖼️ → pick "Sunset" → background changes; kill + reopen → persists; second device updates live (already handled client-side once PUT works, because the sender refetches… actually the *other* device learns via Chunk 3's broadcast — until then it updates on next room open).

**Estimate:** medium. Zero changes to existing classes.

---

## Chunk 3 — Realtime broadcast (`THEME_UPDATED` over STOMP + Redis)

**Goal:** theme changes appear instantly for everyone in the room, on all app instances.

**Files:**

- **EDIT** `chat/src/main/java/com/example/chat/theme/ThemeService.java` — inject `SimpMessagingTemplate` and `RedisPublisher`; broadcast after a successful save/clear:

```java
// after roomThemeRepository.save(...)
java.util.Map<String, Object> event = new java.util.HashMap<>();
event.put("type", "THEME_UPDATED");
event.put("themeId", saved.getThemeId());   // may be null (image or cleared)
event.put("imageUrl", saved.getImageUrl()); // may be null
event.put("updatedBy", userId);
messagingTemplate.convertAndSend("/topic/room." + roomId, (Object) event);

// Redis fan-out for multi-instance (mirror ChatMessageEvent pattern):
// add a ThemeUpdatedEvent record + publishThemeUpdated(roomId, event) on RedisPublisher,
// with a matching handler in RedisSubscriber that re-broadcasts to /topic/room.{id}
```

- **EDIT** `chat/src/main/java/com/example/chat/redis/RedisPublisher.java` — add `publishThemeUpdated(Long roomId, ThemeUpdatedEvent event)` (copy the `publishChatMessage` shape).
- **EDIT** `chat/src/main/java/com/example/chat/redis/RedisSubscriber.java` — handle the new event type and `convertAndSend("/topic/room." + roomId, payload)`.
- **CREATE** `chat/src/main/java/com/example/chat/theme/ThemeUpdatedEvent.java` — small record: `(Long roomId, String themeId, String imageUrl, Long updatedBy)`.

**Client compatibility:** the mobile app already handles `THEME_UPDATED` frames in `useChat.handleWsMessage` (checks `type === 'THEME_UPDATED'` and skips message insertion) — no client change needed.

**Caveat:** payload shapes of chat messages and theme events share the topic. Existing clients are safe because they only check `type`; if you later add server-side consumers of `/topic/room.*`, keep discriminating on `type`.

**Verify:** two devices in one room; change theme on A → B updates within a heartbeat without reopening. Restart backend with two instances + Redis to confirm cross-instance fan-out.

**Estimate:** medium.

---

## Chunk 4 — FileStorageService + image theme upload + serving `/files/**`

**Goal:** "Pick from device" works end-to-end.

**Files:**

- **CREATE** `chat/src/main/java/com/example/chat/theme/FileStorageService.java` (interface)

```java
package com.example.chat.theme;

import org.springframework.web.multipart.MultipartFile;

public interface FileStorageService {
    /** Store the file, return the public relative URL (e.g. /files/theme/abc123.jpg). */
    String store(MultipartFile file, String subdir);

    /** Delete a previously stored file by its relative URL. No-op if missing. */
    void deleteByUrl(String relativeUrl);
}
```

- **CREATE** `chat/src/main/java/com/example/chat/theme/LocalFileStorageService.java`

```java
package com.example.chat.theme;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.*;
import java.util.UUID;

@Service
public class LocalFileStorageService implements FileStorageService {

    private final Path root;

    public LocalFileStorageService(@Value("${chat.uploads.dir:uploads}") String dir) throws IOException {
        this.root = Paths.get(dir).toAbsolutePath().normalize();
        Files.createDirectories(root);
    }

    @Override
    public String store(MultipartFile file, String subdir) {
        String ext = "";
        String name = file.getOriginalFilename();
        if (name != null && name.lastIndexOf('.') > -1) {
            ext = name.substring(name.lastIndexOf('.')).toLowerCase();
        }
        if (!ext.matches("\\.(jpg|jpeg|png|webp)")) {
            throw new IllegalArgumentException("Only jpg/png/webp allowed");
        }
        String key = "theme/" + UUID.randomUUID() + ext;
        try {
            Path target = root.resolve(key).normalize();
            if (!target.startsWith(root)) throw new IllegalArgumentException("Bad path");
            Files.createDirectories(target.getParent());
            file.transferTo(target);
            return "/files/" + key;
        } catch (IOException e) {
            throw new IllegalStateException("Failed to store file", e);
        }
    }

    @Override
    public void deleteByUrl(String relativeUrl) {
        if (relativeUrl == null || !relativeUrl.startsWith("/files/")) return;
        try {
            Path p = root.resolve(relativeUrl.substring("/files/".length())).normalize();
            if (p.startsWith(root)) Files.deleteIfExists(p);
        } catch (IOException ignored) { }
    }
}
```

- **CREATE** `chat/src/main/java/com/example/chat/config/FileServingConfig.java`

```java
package com.example.chat.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class FileServingConfig implements WebMvcConfigurer {

    private final String dir;

    public FileServingConfig(@Value("${chat.uploads.dir:uploads}") String dir) {
        this.dir = dir;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/files/**")
                .addResourceLocations("file:" + (dir.endsWith("/") ? dir : dir + "/"))
                .setCachePeriod(3600);
    }
}
```

- **EDIT** `chat/src/main/java/com/example/chat/theme/ThemeService.java` — add image path:

```java
private final FileStorageService fileStorageService; // add to constructor

@Transactional
public RoomThemeDto setImageTheme(Long roomId, Long userId,
                                  org.springframework.web.multipart.MultipartFile image) {
    requireMember(roomId, userId);
    if (image == null || image.isEmpty()) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "image file is required");
    }
    // Optional size guard (client already downscales to ~1440px/q0.75):
    if (image.getSize() > 5 * 1024 * 1024) {
        throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Max 5MB");
    }
    String url = fileStorageService.store(image, "theme");

    RoomTheme theme = roomThemeRepository.findById(roomId).orElseGet(RoomTheme::new);
    String oldImage = theme.getImageUrl();
    theme.setRoomId(roomId);
    theme.setImageUrl(url);
    theme.setThemeId(null);
    theme.setUpdatedBy(userId);
    RoomThemeDto saved = RoomThemeDto.from(roomThemeRepository.save(theme));

    // Best-effort cleanup of the replaced file
    if (oldImage != null) fileStorageService.deleteByUrl(oldImage);
    return saved;
}
```

- **EDIT** `chat/src/main/java/com/example/chat/theme/ThemeController.java` — branch JSON vs multipart:

```java
@PutMapping(consumes = { "multipart/form-data" })
public RoomThemeDto putImage(@PathVariable Long roomId,
                             @RequestPart("image") org.springframework.web.multipart.MultipartFile image,
                             Principal principal) {
    return themeService.setImageTheme(roomId, Long.parseLong(principal.getName()), image);
}
```

(Keep the existing JSON `@PutMapping` for built-ins; Spring routes by content type.)

- **EDIT** `chat/src/main/resources/application.properties`:

```properties
chat.uploads.dir=/var/chat-uploads
spring.servlet.multipart.max-file-size=6MB
spring.servlet.multipart.max-request-size=8MB
```

(Ensure the dir exists and is writable by the service user on EC2; on Windows dev, leave the default `uploads` relative path.)

**Security notes:**
- `SecurityConfig` currently `permitAll`s only `/error`, `/api/auth/**`, `/ws*` — `/files/**` will require auth. If you want theme images viewable without headers (e.g. OS-level image cache), add `.requestMatchers("/files/**").permitAll()` — URLs are unguessable UUIDs; otherwise keep auth and the RN client will send the JWT automatically via the axios interceptor... note: `expo-image` does NOT send the JWT, so **permitAll on `/files/**` is the pragmatic choice** (unguessable UUID path = capability URL).
- Validate content type + extension (done in `store`), cap size (done), path-traversal guarded (done).

**Verify:** app → 🖼️ → Pick from device → photo becomes background on this device and (with Chunk 3) on others; replacing an image removes the old file from disk; `curl -I http://localhost:8085/files/theme/<file>.jpg` returns 200 image/jpeg.

**Estimate:** largest chunk, but self-contained new classes + two small edits.

---

## Chunk 5 — Reset-to-default on room delete + housekeeping

**Goal:** no orphaned rows/files.

**Files:**
- **EDIT** `chat/src/main/java/com/example/chat/room/RoomService.java` (or a `RoomDeletedEvent` listener): when a room is deleted, `deleteByUrl(roomTheme.imageUrl)` then `roomThemeRepository.deleteById(roomId)`. If rooms are never deleted in this app, document that and skip.
- **EDIT** `chat/src/main/resources/application.properties` — confirm `chat.uploads.dir` on the EC2 deploy and add a note to back up the uploads dir alongside Postgres dumps.

**Verify:** delete a room with an image theme → row gone, file gone.

**Estimate:** small.

---

## Implementation order & cost summary

| Chunk | Ships | Depends on | Size |
|---|---|---|---|
| 1 | Persistence layer | — | S |
| 2 | Built-in themes end-to-end (REST) | 1 | M |
| 3 | Realtime broadcast | 2 | M |
| 4 | Image upload + serving | 2 (3 recommended) | L |
| 5 | Housekeeping | 4 | S |

**Frontend readiness per chunk:**
- After Chunk 2: built-in themes work; *other* devices see the theme on next room open (or after Chunk 3, instantly).
- After Chunk 3: everything live.
- After Chunk 4: device-image themes work.
- The client never needs further changes — `THEME_UPDATED` handling, upload multipart format, and relative-URL prefixing are already implemented.
