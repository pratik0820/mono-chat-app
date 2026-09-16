package com.example.chat.theme;

import java.util.Objects;

public class ThemeUpdatedEvent {

    public static final String TYPE = "THEME_UPDATED";

    private String type;
    private Long roomId;
    private String themeId;   // built-in id, "default", or null (image theme)
    private String imageUrl;  // custom image url, or null (builtin/cleared)
    private Long updatedBy;

    public ThemeUpdatedEvent() {
        this.type = TYPE;
    }

    public ThemeUpdatedEvent(Long roomId, String themeId, String imageUrl, Long updatedBy) {
        this.type = TYPE;
        this.roomId = roomId;
        this.themeId = themeId;
        this.imageUrl = imageUrl;
        this.updatedBy = updatedBy;
    }

    // ── Getters / Setters ──────────────────────────────────────

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
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

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        ThemeUpdatedEvent that = (ThemeUpdatedEvent) o;
        return Objects.equals(roomId, that.roomId)
                && Objects.equals(themeId, that.themeId)
                && Objects.equals(imageUrl, that.imageUrl)
                && Objects.equals(updatedBy, that.updatedBy);
    }

    @Override
    public int hashCode() {
        return Objects.hash(roomId, themeId, imageUrl, updatedBy);
    }

    @Override
    public String toString() {
        return "ThemeUpdatedEvent{" +
                "type='" + type + '\'' +
                ", roomId=" + roomId +
                ", themeId='" + themeId + '\'' +
                ", imageUrl='" + imageUrl + '\'' +
                ", updatedBy=" + updatedBy +
                '}';
    }
}
