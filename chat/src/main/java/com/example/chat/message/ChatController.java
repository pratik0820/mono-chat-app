package com.example.chat.message;

import com.example.chat.message.dto.MessageDto;
import com.example.chat.redis.RedisPublisher;
import jakarta.validation.Valid;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Objects;

@RestController
@RequestMapping("/api/rooms/{roomId}/messages")
public class ChatController {

    private final MessageService messageService;
    private final SimpMessagingTemplate messagingTemplate;
    private final RedisPublisher redisPublisher;

    public ChatController(MessageService messageService, SimpMessagingTemplate messagingTemplate, RedisPublisher redisPublisher) {
        this.messageService = messageService;
        this.messagingTemplate = messagingTemplate;
        this.redisPublisher = redisPublisher;
    }

    @GetMapping
    public List<MessageDto> getHistory(
            @PathVariable Long roomId,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(required = false) Long before) {

        Long userId = (Long) Objects.requireNonNull(SecurityContextHolder.getContext().getAuthentication()).getPrincipal();
        return messageService.getHistory(roomId, userId, limit, before);
    }

    @PostMapping
    public MessageDto sendMessage(
            @PathVariable Long roomId,
            @Valid @RequestBody SendMessageRequest request) {

        Long userId = (Long) Objects.requireNonNull(SecurityContextHolder.getContext().getAuthentication()).getPrincipal();
        MessageDto saved = messageService.saveMessage(roomId, userId, request.content(), com.example.chat.message.Message.Type.USER);

        // Broadcast locally via WebSocket so all connected clients receive the message in real-time
        messagingTemplate.convertAndSend("/topic/room." + roomId, saved);

        // Publish to Redis
        ChatMessageEvent chatEvent = ChatMessageEvent.from(saved);
        redisPublisher.publishChatMessage(roomId, chatEvent);

        return saved;
    }

    public record SendMessageRequest(String content) {}
}
