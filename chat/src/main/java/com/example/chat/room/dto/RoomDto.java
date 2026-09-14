package com.example.chat.room.dto;

import com.example.chat.room.Room;

import java.time.Instant;

public record RoomDto(Long id, String name, Long ownerId, Instant createdAt) {

    public static RoomDto from(Room room) {
        return new RoomDto(room.getId(), room.getName(), room.getCreatedBy(), room.getCreatedAt());
    }
}
