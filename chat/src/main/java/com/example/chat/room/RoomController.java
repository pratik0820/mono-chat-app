package com.example.chat.room;

import com.example.chat.room.dto.CreateRoomRequest;
import com.example.chat.room.dto.RoomDto;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/rooms")
public class RoomController {

    private final RoomService roomService;

    public RoomController(RoomService roomService) {
        this.roomService = roomService;
    }

    @GetMapping
    public List<RoomDto> listRooms() {
        Long userId = (Long) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return roomService.getRoomByUser(userId);
    }

    @GetMapping("/all")
    public List<RoomDto> listAllRooms() {
        return roomService.getAllRooms();
    }

    @GetMapping("/{roomId}")
    public RoomDto getRoom(@PathVariable Long roomId) {
        Long userId = (Long) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return roomService.getRoomById(roomId, userId);
    }

    @PostMapping
    public RoomDto createRoom(@Valid @RequestBody CreateRoomRequest request) {
        Long userId = (Long) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return roomService.createRoom(request, userId);
    }

    @PostMapping("/{roomId}/join")
    public RoomDto joinRoom(@PathVariable Long roomId) {
        Long userId = (Long) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return roomService.joinRoom(roomId, userId);
    }

    @DeleteMapping("/{roomId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteRoom(@PathVariable Long roomId) {
        Long userId = (Long) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        roomService.deleteRoom(roomId, userId);
    }
}
