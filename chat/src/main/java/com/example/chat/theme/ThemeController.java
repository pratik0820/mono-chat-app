package com.example.chat.theme;

import com.example.chat.redis.RedisPublisher;
import com.example.chat.theme.dto.RoomThemeDto;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

/**
 * REST endpoints for the per-room chat theme.
 *
 * Auth: /api/** requires a valid JWT (SecurityConfig); JwtAuthFilter puts the
 * userId (Long) into the SecurityContext, same pattern as RoomController.
 *
 * Image uploads (multipart PUT) are intentionally NOT handled here — they
 * arrive in Chunk 4 together with the file storage. Setting a theme without
 * a themeId returns 501 until then.
 */
@RestController
@RequestMapping("/api/rooms/{roomId}/theme")
public class ThemeController {

    private final ThemeService themeService;
    private final SimpMessagingTemplate messagingTemplate;
    private final RedisPublisher redisPublisher;

    public ThemeController(ThemeService themeService,
                           SimpMessagingTemplate messagingTemplate,
                           RedisPublisher redisPublisher) {
        this.themeService = themeService;
        this.messagingTemplate = messagingTemplate;
        this.redisPublisher = redisPublisher;
    }

    /** 200 with the theme, or 204 when the room uses the default theme. */
    @GetMapping
    public ResponseEntity<RoomThemeDto> get(@PathVariable Long roomId) {
        Long userId = currentUserId();
        RoomThemeDto dto = themeService.get(roomId, userId);
        return dto == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(dto);
    }

    /**
     * Built-in themes: {"themeId": "sunset"}.
     * Returns 200 with the theme, or 204 when the room was reset to default.
     */
    @PutMapping
    public ResponseEntity<RoomThemeDto> put(@PathVariable Long roomId,
                                            @RequestBody(required = false) Map<String, String> body) {
        Long userId = currentUserId();
        String themeId = body == null ? null : body.get("themeId");
        if (themeId == null || themeId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Send {\"themeId\": \"...\"} or a multipart image");
        }
        RoomThemeDto dto = themeService.setBuiltinTheme(roomId, userId, themeId);

        // dto == null ⇒ the room was reset to "default"
        broadcast(roomId, dto != null ? dto.themeId() : "default", null, userId);
        return dto == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(dto);
    }

    /** Chunk 4: custom image theme — multipart PUT with an "image" part. */
    @PutMapping(consumes = "multipart/form-data")
    public RoomThemeDto putImage(@PathVariable Long roomId,
                                 @RequestPart("image") MultipartFile image) {
        Long userId = currentUserId();
        RoomThemeDto dto = themeService.setImageTheme(roomId, userId, image);
        broadcast(roomId, null, dto.imageUrl(), userId);
        return dto;
    }

    /** Resets the room to the default theme. */
    @DeleteMapping
    public ResponseEntity<Void> delete(@PathVariable Long roomId) {
        Long userId = currentUserId();
        themeService.clear(roomId, userId);
        broadcast(roomId, null, null, userId);
        return ResponseEntity.noContent().build();
    }

    /**
     * Push the theme change to everyone in the room.
     * Local STOMP first (instant for clients on this instance), then Redis
     * so other instances relay to their clients.
     */
    private void broadcast(Long roomId, String themeId, String imageUrl, Long updatedBy) {
        ThemeUpdatedEvent event = new ThemeUpdatedEvent(roomId, themeId, imageUrl, updatedBy);
        messagingTemplate.convertAndSend("/topic/room." + roomId, event);
        redisPublisher.publishThemeUpdated(roomId, event);
    }

    private static Long currentUserId() {
        var auth = org.springframework.security.core.context.SecurityContextHolder
                .getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof Long userId)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        return userId;
    }
}
