package com.example.chat.message;

import com.example.chat.message.dto.MessageDto;
import com.example.chat.room.Room;
import com.example.chat.room.RoomMemberRepository;
import com.example.chat.user.User;
import com.example.chat.user.UserRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;


@Service
public class MessageService {

    private final MessageRepository messageRepository;
    private final RoomMemberRepository roomMemberRepository;
    private final UserRepository userRepository;

    public MessageService(MessageRepository messageRepository, RoomMemberRepository roomMemberRepository, UserRepository userRepository) {
        this.messageRepository = messageRepository;
        this.roomMemberRepository = roomMemberRepository;
        this.userRepository = userRepository;
    }

    public List<MessageDto> getHistory(Long roomId, Long userId, int limit, Long beforeId) {
        // Validate membership
        var user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        var room = new Room();
        room.setId(roomId);

        if (!roomMemberRepository.existsByRoomAndUser(room, user)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not a member of this room");
        }

        // Keyset pagination: fetch messages before a given timestamp
        PageRequest pageRequest = PageRequest.of(0, limit);

        List<Message> messages;
        if (beforeId != null) {
            var cursor = messageRepository.findById(beforeId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Message not found"));

            messages = messageRepository.findByRoomIdAndCreatedAtBeforeOrderByCreatedAtDesc(
                    roomId, cursor.getCreatedAt(), pageRequest);
        } else {
            messages = messageRepository.findByRoomIdOrderByCreatedAtDesc(roomId, pageRequest);
        }

        // Resolve usernames for all senders
        var senderIds = messages.stream().map(Message::getSenderId).collect(Collectors.toSet());
        var users = userRepository.findAllById(senderIds);
        var usernameMap = users.stream().collect(Collectors.toMap(
                User::getId,
                User::getUsername
        ));

        // Convert to DTOs (oldest first for client display)
        return messages.stream()
                .map(m -> MessageDto.from(m, usernameMap.get(m.getSenderId())))
                .toList();
    }

    public MessageDto saveMessage(Long roomId, Long senderId, String content, Message.Type type) {
        Message message = new Message();
        message.setRoomId(roomId);
        message.setSenderId(senderId);
        message.setContent(content);
        message.setType(type);
        messageRepository.save(message);

        String username = userRepository.findById(senderId)
                .map(User::getUsername)
                .orElse("unknown");

        return MessageDto.from(message, username);
    }
}
