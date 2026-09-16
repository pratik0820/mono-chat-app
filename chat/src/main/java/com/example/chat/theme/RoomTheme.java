package com.example.chat.theme;

import jakarta.persistence.*;

import java.time.Instant;

/**
 * Per-room chat background theme.
 *
 * One row per room; the room id is the primary key (1:1 with rooms).
 * Exactly one of {@code themeId} (built-in gradient, e.g. "sunset") or
 * {@code imageUrl} (custom uploaded background) is set. A missing row
 * means the room uses the default theme.
 *
 * Chunk 1 of the chat-themes feature — see docs/FEATURE-1-BACKEND-chunks.md.
 * The table must be created manually (ddl-auto=none):
 * see db/chunk1-room-theme.sql.
 */
@Entity
@Table(name = "room_theme")
public class RoomTheme {

    @Id
    @Column(name = "room_id")
    private Long roomId;

    /** Built-in theme id ("sunset", "ocean", ...) — null when an image is set. */
    @Column(name = "theme_id", length = 32)
    private String themeId;

    /** Relative URL of the custom background image (e.g. /files/theme/x.jpg) — null when a built-in is set. */
    @Column(name = "image_url", columnDefinition = "TEXT")
    private String imageUrl;

    @Column(name = "updated_by", nullable = false)
    private Long updatedBy;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        updatedAt = Instant.now();
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public Long getRoomId() {
        return roomId;
    }

    public void setRoomId(Long roomId) {
        this.roomId = roomId;
    }

    public String getThemeId() {
        return themeId;
    }

    public void setThemeId(String themeId) {
        this.themeId = themeId;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public void setImageUrl(String imageUrl) {
        this.imageUrl = imageUrl;
    }

    public Long getUpdatedBy() {
        return updatedBy;
    }

    public void setUpdatedBy(Long updatedBy) {
        this.updatedBy = updatedBy;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
