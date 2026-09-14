package com.example.chat.security;

import com.example.chat.presence.PresenceListener;
import com.example.chat.user.User;
import com.example.chat.user.UserRepository;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Intercepts STOMP CONNECT frames to validate the JWT token.
 *
 * Client sends token in CONNECT frame headers:
 *   Authorization: Bearer <jwt>
 *
 * On success → sets Principal (user ID) on the session.
 * On failure → returns null to reject the connection.
 */
@Component
public class JwtChannelInterceptor implements ChannelInterceptor {

    private static final Logger log = LoggerFactory.getLogger(JwtChannelInterceptor.class);

    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final PresenceListener presenceListener;

    public JwtChannelInterceptor(JwtService jwtService,
                                 UserRepository userRepository,
                                 @Lazy PresenceListener presenceListener) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
        this.presenceListener = presenceListener;
    }

    @Override
    public @Nullable Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor =
                MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

        if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {
            log.info("[STOMP Auth] Received CONNECT frame, session={}", accessor.getSessionId());
            String authHeader = accessor.getFirstNativeHeader("Authorization");

            if (authHeader != null && authHeader.startsWith("Bearer ")) {
                String token = authHeader.substring(7);
                try {
                    String username = jwtService.parseUsername(token);
                    User user = userRepository.findByUsername(username).orElse(null);

                    if (user != null) {
                        log.info("[STOMP Auth] JWT valid for user '{}' (id={}), session={}",
                                username, user.getId(), accessor.getSessionId());
                        var auth = new UsernamePasswordAuthenticationToken(
                                user.getId(), null, List.of());
                        accessor.setUser(auth);
                        // Register user as online — wrap in try-catch so a presence error
                        // does not prevent the CONNECTED frame from being sent
                        try {
                            presenceListener.userConnected(accessor.getSessionId(), user.getId());
                        } catch (Exception ex) {
                            log.error("[STOMP Auth] Failed to register presence for user {}:",
                                    user.getId(), ex);
                        }
                    } else {
                        log.warn("[STOMP Auth] User not found for token, session={}",
                                accessor.getSessionId());
                        sendErrorFrame(accessor, channel, "User not found for token");
                        return null;
                    }
                } catch (Exception e) {
                    log.warn("[STOMP Auth] JWT validation failed: {}", e.getMessage());
                    sendErrorFrame(accessor, channel, "Invalid JWT token: " + e.getMessage());
                    return null;
                }
            } else {
                log.warn("[STOMP Auth] No Authorization header provided, session={}",
                        accessor.getSessionId());
                sendErrorFrame(accessor, channel, "No Authorization header provided");
                return null;
            }
        }

        return message;
    }

    private void sendErrorFrame(StompHeaderAccessor accessor, MessageChannel channel,
                                String errorMessage) {
        try {
            StompHeaderAccessor errorAccessor = StompHeaderAccessor.create(StompCommand.ERROR);
            errorAccessor.setMessage(errorMessage);
            errorAccessor.setSessionId(accessor.getSessionId());
            channel.send(org.springframework.messaging.support.MessageBuilder
                    .createMessage("", errorAccessor.getMessageHeaders()));
        } catch (Exception ex) {
            log.error("[STOMP Auth] Failed to send ERROR frame: {}", ex.getMessage());
        }
    }
}
