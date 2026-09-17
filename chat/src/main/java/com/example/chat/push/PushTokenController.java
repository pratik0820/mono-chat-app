package com.example.chat.push;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/push-tokens")
public class PushTokenController {

    private final PushTokenService pushTokenService;

    public PushTokenController(PushTokenService pushTokenService) {
        this.pushTokenService = pushTokenService;
    }

    public record RegisterRequest(
            @NotBlank String token,
            @Pattern(regexp = "android") String platform,
            String deviceName) {}

    @PostMapping
    public ResponseEntity<Map<String, String>> register(@Valid @RequestBody RegisterRequest body,
                                                        Authentication auth) {
        Long userId = currentUserId(auth);   // NEVER take userId from the body
        pushTokenService.register(userId, body.token(), body.platform(), body.deviceName());
        return ResponseEntity.ok(Map.of("status", "registered"));
    }

    @DeleteMapping("/current")
    public ResponseEntity<Void> unregister(Authentication auth) {
        Long userId = currentUserId(auth);
        pushTokenService.deleteAllForUser(userId);
        return ResponseEntity.noContent().build();
    }

    private static Long currentUserId(Authentication auth) {
        if (auth == null || !(auth.getPrincipal() instanceof Long userId)) {
            throw new IllegalStateException("Not authenticated");
        }
        return userId;
    }
}
