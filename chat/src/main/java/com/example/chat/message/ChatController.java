package com.example.chat.message;

import com.example.chat.message.dto.MessageDto;
import com.example.chat.push.PushDispatcher;
import com.example.chat.redis.RedisPublisher;
import com.example.chat.room.Room;
import com.example.chat.room.RoomRepository;
import com.example.chat.user.User;
import com.example.chat.user.UserRepository;
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
    private final PushDispatcher pushDispatcher;
    private final UserRepository userRepository;
    private final RoomRepository roomRepository;

    public ChatController(MessageService messageService,
                          SimpMessagingTemplate messagingTemplate,
                          RedisPublisher redisPublisher,
                          PushDispatcher pushDispatcher,
                          UserRepository userRepository,
                          RoomRepository roomRepository) {
        this.messageService = messageService;
        this.messagingTemplate = messagingTemplate;
        this.redisPublisher = redisPublisher;
        this.pushDispatcher = pushDispatcher;
        this.userRepository = userRepository;
        this.roomRepository = roomRepository;
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

        // Push to OFFLINE members (async — returns immediately)
        pushDispatcher.dispatchNewMessage(saved, roomId, roomName(roomId), username(userId));

        return saved;
    }

    // ── helpers for push dispatch ────────────────────────────────────────

    private String username(Long userId) {
        return userRepository.findById(userId).map(User::getUsername).orElse("unknown");
    }

    private String roomName(Long roomId) {
        return roomRepository.findById(roomId).map(Room::getName).orElse("Room");
    }

    public record SendMessageRequest(String content) {}
}
