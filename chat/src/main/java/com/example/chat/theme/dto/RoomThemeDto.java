package com.example.chat.theme.dto;

import com.example.chat.theme.RoomTheme;

import java.time.Instant;

/**
 * Theme state of a room. Both fields may be null in the JSON when the room
 * uses the default theme (GET returns 204 with no body in that case).
 */
public record RoomThemeDto(
        String themeId,
        String imageUrl,
        Long updatedBy,
        Instant updatedAt
) {
    public static RoomThemeDto from(RoomTheme t) {
        return new RoomThemeDto(t.getThemeId(), t.getImageUrl(), t.getUpdatedBy(), t.getUpdatedAt());
    }
}
