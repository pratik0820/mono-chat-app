package com.example.chat.room;

import com.example.chat.message.MessageRepository;
import com.example.chat.room.dto.CreateRoomRequest;
import com.example.chat.room.dto.RoomDto;
import com.example.chat.theme.ThemeService;
import com.example.chat.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class RoomService {

    private final RoomRepository roomRepository;
    private final RoomMemberRepository roomMemberRepository;
    private final UserRepository userRepository;
    private final MessageRepository messageRepository;
    private final ThemeService themeService;

    public RoomService(RoomRepository roomRepository,
                       RoomMemberRepository roomMemberRepository,
                       UserRepository userRepository,
                       MessageRepository messageRepository,
                       ThemeService themeService) {
        this.roomRepository = roomRepository;
        this.roomMemberRepository = roomMemberRepository;
        this.userRepository = userRepository;
        this.messageRepository = messageRepository;
        this.themeService = themeService;
    }

    @Transactional(readOnly = true)
    public List<RoomDto> getRoomByUser(Long userId) {
        var user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        return roomMemberRepository.findByUser(user).stream()
                .map(member -> RoomDto.from(member.getRoom()))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<RoomDto> getAllRooms() {
        return roomRepository.findAll().stream()
                .map(RoomDto::from)
                .collect(Collectors.toList());
    }

    @Transactional
    public RoomDto joinRoom(Long roomId, Long userId) {
        var user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        var room = roomRepository.findById(roomId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Room not found"));

        if (roomMemberRepository.existsByRoomAndUser(room, user)) {
            return RoomDto.from(room);
        }

        RoomMember member = new RoomMember();
        member.setRoom(room);
        member.setUser(user);
        member.setRole(RoomMember.Role.MEMBER);
        roomMemberRepository.save(member);

        return RoomDto.from(room);
    }

    @Transactional(readOnly = true)
    public RoomDto getRoomById(Long roomId, Long userId) {
        var user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        var room = roomRepository.findById(roomId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Room not found"));

        if (!roomMemberRepository.existsByRoomAndUser(room, user)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not a member of this room");
        }

        return RoomDto.from(room);
    }

    @Transactional
    public RoomDto createRoom(CreateRoomRequest request, Long userId) {
        var user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        Room room = new Room();
        room.setName(request.name());
        room.setCreatedBy(userId);
        roomRepository.save(room);

        RoomMember member = new RoomMember();
        member.setRoom(room);
        member.setUser(user);
        member.setRole(RoomMember.Role.OWNER);
        roomMemberRepository.save(member);

        return RoomDto.from(room);
    }

    @Transactional
    public void deleteRoom(Long roomId, Long userId) {
        var room = roomRepository.findById(roomId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Room not found"));

        if (!userId.equals(room.getCreatedBy())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the room creator can delete this room");
        }

        messageRepository.deleteByRoomId(roomId);   // 1. chat history
        roomMemberRepository.deleteByRoom(room);    // 2. memberships
        themeService.deleteForRoom(roomId);         // 3. theme row + uploaded file
        roomRepository.delete(room);                // 4. the room itself
    }
}

