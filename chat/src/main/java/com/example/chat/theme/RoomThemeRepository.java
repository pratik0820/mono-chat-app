package com.example.chat.theme;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Data access for per-room chat themes.
 * The room id is the primary key, so findById(roomId) is all we need.
 */
public interface RoomThemeRepository extends JpaRepository<RoomTheme, Long> {
}
