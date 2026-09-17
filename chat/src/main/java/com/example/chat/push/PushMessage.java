package com.example.chat.push;

public record PushMessage(
        String to,
        String title,
        String body,
        Long roomId,
        Long messageId) {

    public static PushMessage of(String to, String title, String body, Long roomId, Long messageId) {
        return new PushMessage(to, title, body, roomId, messageId);
    }
}
