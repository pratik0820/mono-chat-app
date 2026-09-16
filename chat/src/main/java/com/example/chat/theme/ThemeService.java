package com.example.chat.theme;

import com.example.chat.file.FileStorageService;
import com.example.chat.room.Room;
import com.example.chat.room.RoomMemberRepository;
import com.example.chat.theme.dto.RoomThemeDto;
import com.example.chat.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.Set;

@Service
public class ThemeService {

    /**
     * Must match mobile/src/constants/chatThemes.ts — the client renders
     * gradients from this exact id list.
     */
    private static final Set<String> ALLOWED_THEME_IDS = Set.of(
            "default", "sunset", "ocean", "midnight", "forest",
            "paper", "candy", "peach", "aurora", "mono"
    );

    /** Keep below spring.servlet.multipart.max-file-size (6MB headroom). */
    private static final long MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

    private final RoomThemeRepository roomThemeRepository;
    private final RoomMemberRepository roomMemberRepository;
    private final UserRepository userRepository;
    private final FileStorageService fileStorageService;

    public ThemeService(RoomThemeRepository roomThemeRepository,
                        RoomMemberRepository roomMemberRepository,
                        UserRepository userRepository, FileStorageService fileStorageService) {
        this.roomThemeRepository = roomThemeRepository;
        this.roomMemberRepository = roomMemberRepository;
        this.userRepository = userRepository;
        this.fileStorageService = fileStorageService;
    }

    /** Returns the room's theme, or null when the room uses the default theme. */
    @Transactional(readOnly = true)
    public RoomThemeDto get(Long roomId, Long userId) {
        requireMember(roomId, userId);
        return roomThemeRepository.findById(roomId).map(RoomThemeDto::from).orElse(null);
    }

    /**
     * Sets a built-in theme (replaces any custom image).
     * Choosing "default" resets the room — no row is stored.
     */
    @Transactional
    public RoomThemeDto setBuiltinTheme(Long roomId, Long userId, String themeId) {
        requireMember(roomId, userId);
        validateThemeId(themeId);

        RoomTheme existing = roomThemeRepository.findById(roomId).orElse(null);
        String oldImage = existing == null ? null : existing.getImageUrl();

        if ("default".equals(themeId)) {
            if (existing != null) {
                roomThemeRepository.delete(existing);
            }
            deleteOldImageQuietly(oldImage);
            return null;
        }

        RoomTheme theme = existing != null ? existing : new RoomTheme();
        theme.setRoomId(roomId);
        theme.setThemeId(themeId);
        theme.setImageUrl(null); // built-in replaces any custom image
        theme.setUpdatedBy(userId);
        RoomThemeDto saved = RoomThemeDto.from(roomThemeRepository.save(theme));

        // Best-effort cleanup of the replaced custom image
        deleteOldImageQuietly(oldImage);
        return saved;
    }

    /**
     * Chunk 4: sets a custom background image. Stores the file, saves the
     * relative /files/... URL, and removes the previously uploaded image.
     */
    @Transactional
    public RoomThemeDto setImageTheme(Long roomId, Long userId, MultipartFile image) {
        requireMember(roomId, userId);
        if (image == null || image.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "image file is required");
        }
        if (image.getSize() > MAX_IMAGE_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Max 5MB");
        }

        String url = fileStorageService.store(image, "theme");

        RoomTheme theme = roomThemeRepository.findById(roomId).orElseGet(RoomTheme::new);
        String oldImage = theme.getImageUrl();
        theme.setRoomId(roomId);
        theme.setImageUrl(url);
        theme.setThemeId(null); // image replaces any built-in
        theme.setUpdatedBy(userId);
        RoomThemeDto saved = RoomThemeDto.from(roomThemeRepository.save(theme));

        // Best-effort cleanup of the replaced file (only if it actually changed)
        if (oldImage != null && !oldImage.equals(url)) {
            deleteOldImageQuietly(oldImage);
        }
        return saved;
    }

    /** Resets the room to the default theme (deletes the row). */
    @Transactional
    public void clear(Long roomId, Long userId) {
        requireMember(roomId, userId);
        roomThemeRepository.findById(roomId).ifPresent(roomThemeRepository::delete);
    }

    // Note: setBuiltinTheme returning null ("default" choice) maps to a
    // 204 in the controller, mirroring GET semantics.

    // ─── Helpers ────────────────────────────────────────────────

    /** Storage cleanup must never fail the request. */
    private void deleteOldImageQuietly(String imageUrl) {
        if (imageUrl == null) return;
        try {
            fileStorageService.deleteByUrl(imageUrl);
        } catch (RuntimeException ignored) {
            // logged downstream; a leftover file is acceptable
        }
    }

    private void requireMember(Long roomId, Long userId) {
        var user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        var room = new Room();
        room.setId(roomId);
        if (!roomMemberRepository.existsByRoomAndUser(room, user)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not a member of this room");
        }
    }

    private void validateThemeId(String themeId) {
        if (themeId == null || !ALLOWED_THEME_IDS.contains(themeId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown themeId: " + themeId);
        }
    }

    @Transactional
    public void deleteForRoom(Long roomId) {
        roomThemeRepository.findById(roomId).ifPresent(existing -> {
            roomThemeRepository.delete(existing);
            deleteOldImageQuietly(existing.getImageUrl());
        });
    }
}
