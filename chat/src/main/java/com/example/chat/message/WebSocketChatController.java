package com.example.chat.message;

import com.example.chat.message.dto.MessageDto;
import com.example.chat.push.PushDispatcher;
import com.example.chat.redis.RedisPublisher;
import com.example.chat.room.Room;
import com.example.chat.room.RoomMemberRepository;
import com.example.chat.room.RoomRepository;
import com.example.chat.user.User;
import com.example.chat.user.UserRepository;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import java.util.Map;

@Controller
public class WebSocketChatController {

    private final SimpMessagingTemplate messagingTemplate;
    private final MessageService messageService;
    private final RoomMemberRepository roomMemberRepository;
    private final UserRepository userRepository;
    private final RedisPublisher redisPublisher;
    private final PushDispatcher pushDispatcher;
    private final RoomRepository roomRepository;

    public WebSocketChatController(SimpMessagingTemplate messagingTemplate,
                                   MessageService messageService,
                                   RoomMemberRepository roomMemberRepository,
                                   UserRepository userRepository,
                                   RedisPublisher redisPublisher,
                                   PushDispatcher pushDispatcher,
                                   RoomRepository roomRepository) {
        this.messagingTemplate = messagingTemplate;
        this.messageService = messageService;
        this.roomMemberRepository = roomMemberRepository;
        this.userRepository = userRepository;
        this.redisPublisher = redisPublisher;
        this.pushDispatcher = pushDispatcher;
        this.roomRepository = roomRepository;
    }

    /**
     * Handle incoming chat message via STOMP.
     * Client sends to: /app/chat.sendMessage/{roomId}
     * Payload: { "content": "hello", "type": "USER" }
     *
     * Validates room membership, persists message, and broadcasts to /topic/room.{roomId}
     */
    @MessageMapping("/chat.sendMessage/{roomId}")
    public void sendMessage(@DestinationVariable Long roomId,
                            @Payload Map<String, String> payload,
                            Principal principal) {

        Long userId = Long.parseLong(principal.getName());
        String content = payload.get("content");
        String typeStr = payload.getOrDefault("type", "USER");
        Message.Type type = Message.Type.valueOf(typeStr);

        // Validate user is a member of the room
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // Real Room (needed for the room name in push notifications)
        Room room = roomRepository.findById(roomId)
                .orElseThrow(() -> new RuntimeException("Room not found"));

        if (!roomMemberRepository.existsByRoomAndUser(room, user)) {
            throw new RuntimeException("User is not a member of this room");
        }

        // Persist the message
        MessageDto saved = messageService.saveMessage(roomId, userId, content, type);

        // Broadcast locally to all subscribers of this room
        messagingTemplate.convertAndSend("/topic/room." + roomId, saved);

        // Publish to Redis
        ChatMessageEvent chatEvent = ChatMessageEvent.from(saved);
        redisPublisher.publishChatMessage(roomId, chatEvent);

        // Push to OFFLINE members (async — returns immediately)
        pushDispatcher.dispatchNewMessage(saved, roomId, room.getName(), user.getUsername());
    }

    /**
     * Handle typing indicator via STOMP
     * Client sends to: /app/chat.typing/{roomId}
     * Payload: { "typing": true }
     *
     * Broadcasts ephemeral typing status to /topic/room.{roomId}.typing
     */
    @MessageMapping("/chat.typing/{roomId}")
    public void typingIndicator(@DestinationVariable Long roomId,
                                @Payload Map<String, Boolean> payload,
                                Principal principal) {

        Long userId = Long.parseLong(principal.getName());
        Boolean typing = payload.getOrDefault("typing", false);

        String username = userRepository.findById(userId)
                .map(User::getUsername)
                .orElse("unknown");

        // Broadcast locally typing indicator (ephemeral - not persisted)
        messagingTemplate.convertAndSend("/topic/room." + roomId + ".typing",
                (Object) Map.of("userId", userId, "username", username, "typing", typing));

        // Publish to Redis
        TypingEvent typingEvent = new TypingEvent(userId, roomId, username, typing);
        redisPublisher.publishTypingIndicator(roomId, typingEvent);
    }
}
