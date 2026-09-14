package com.example.chat.message.dto;

import com.example.chat.message.Message;

import java.time.Instant;

public record MessageDto(Long id, Long roomId, Long senderId, String username,
                         String content, Message.Type type, Instant createdAt) {

    public static MessageDto from(Message message) {
        return new MessageDto(
                message.getId(),
                message.getRoomId(),
                message.getSenderId(),
                null,
                message.getContent(),
                message.getType(),
                message.getCreatedAt()
        );
    }

    public static MessageDto from(Message message, String username) {
        return new MessageDto(
                message.getId(),
                message.getRoomId(),
                message.getSenderId(),
                username,
                message.getContent(),
                message.getType(),
                message.getCreatedAt()
        );
    }
}
