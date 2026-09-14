package com.example.chat.message;

import java.util.Objects;

/**
 * Ephemeral DTO for typing indicator cross-instance delivery via Redis Pub/Sub
 * Not persisted - fire-and-forget through Redis channels.
 */
public class TypingEvent {

    private Long userId;
    private Long roomId;
    private String username;
    private Boolean typing;

    public TypingEvent() {}

    public TypingEvent(Long userId, Long roomId, String username, Boolean typing) {
        this.userId = userId;
        this.roomId = roomId;
        this.username = username;
        this.typing = typing;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public Long getRoomId() {
        return roomId;
    }

    public void setRoomId(Long roomId) {
        this.roomId = roomId;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public Boolean getTyping() {
        return typing;
    }

    public void setTyping(Boolean typing) {
        this.typing = typing;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        TypingEvent that = (TypingEvent) o;
        return Objects.equals(userId, that.userId)
                && Objects.equals(roomId, that.roomId)
                && Objects.equals(typing, that.typing);
    }

    @Override
    public int hashCode() {
        return Objects.hash(userId, roomId, typing);
    }

    @Override
    public String toString() {
        return "TypingEvent{" +
                "userId=" + userId +
                ", roomId=" + roomId +
                ", username='" + username + '\'' +
                ", typing=" + typing +
                '}';
    }
}
