package com.example.chat.push;

import java.util.List;

public interface PushSender {

    /**
     * Send a batch of push messages. Implementations must be non-blocking
     * (call sites already run on the push executor) and must never throw
     */
    void send(List<PushMessage> messages);
}
