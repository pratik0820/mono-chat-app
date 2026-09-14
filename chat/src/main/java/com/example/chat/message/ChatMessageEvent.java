package com.example.chat.message;

import com.example.chat.message.dto.MessageDto;

import java.time.Instant;
import java.util.Objects;

/**
 * Serializable DTO for cross-instance message delivery via Redis Pub/Sub.
 * NOT a JPA entity — this is a plain POJO serialized to JSON for Redis.
 */
public class ChatMessageEvent {

    private Long id;
    private Long roomId;
    private Long senderId;
    private String username;
    private String content;
    private String type;
    private Instant createdAt;

    public ChatMessageEvent() {}

    public ChatMessageEvent(Long id, Long roomId, Long senderId,
                            String username, String content, String type,
                            Instant createdAt) {
        this.id = id;
        this.roomId = roomId;
        this.senderId = senderId;
        this.username = username;
        this.content = content;
        this.type = type;
        this.createdAt = createdAt;
    }

    /**
     * Factory method — creates a ChatMessageEvent from a MessageDto.
     * Used when publishing to Redis after persisting a message.
     */
    public static ChatMessageEvent from(MessageDto dto) {
        return new ChatMessageEvent(
                dto.id(),
                dto.roomId(),
                dto.senderId(),
                dto.username(),
                dto.content(),
                dto.type() != null ? dto.type().name() : null,
                dto.createdAt()
        );
    }

    // -- Getters and Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getRoomId() {
        return roomId;
    }

    public void setRoomId(Long roomId) {
        this.roomId = roomId;
    }

    public Long getSenderId() {
        return senderId;
    }

    public void setSenderId(Long senderId) {
        this.senderId = senderId;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        ChatMessageEvent that = (ChatMessageEvent) o;
        return Objects.equals(id, that.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }

    @Override
    public String toString() {
        return "ChatMessageEvent{" +
                "id=" + id +
                ", roomId=" + roomId +
                ", senderId=" + senderId +
                ", username='" + username + '\'' +
                ", type='" + type + '\'' +
                '}';
    }
}
