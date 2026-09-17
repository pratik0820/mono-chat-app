package com.example.chat.push;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;


@Service
public class PushTokenService {

    private static final Logger log = LoggerFactory.getLogger(PushTokenService.class);
    private static final String EXPO_TOKEN_PREFIX = "ExponentPushToken";

    private final PushTokenRepository pushTokenRepository;

    public PushTokenService(PushTokenRepository pushTokenRepository) {
        this.pushTokenRepository = pushTokenRepository;
    }

    @Transactional
    public void register(Long userId, String token, String platform, String deviceName) {
        validateTokenFormat(token);
        pushTokenRepository.upsert(userId, token, platform, deviceName);
        log.info("Registered push token for user {} (...{})", userId,
                token.substring(token.length() - 6));
    }

    @Transactional
    public void deleteAllForUser(Long userId) {
        List<PushToken> tokens = pushTokenRepository.findByUserIdIn(List.of(userId));
        pushTokenRepository.deleteAll(tokens);
        log.info("Deleted {} push token(s) for user {}", tokens.size(), userId);
    }

    /** Called by ExpoPushSender when Expo reports the token is no longer valid. */
    @Transactional
    public void deleteInvalidToken(String token) {
        pushTokenRepository.deleteByToken(token);
        log.info("Deleted invalid push token (...{})",
                token.substring(Math.max(0, token.length() - 6)));
    }

    private void validateTokenFormat(String token) {
        if (token == null || !token.startsWith(EXPO_TOKEN_PREFIX) || !token.endsWith("]")) {
            throw new IllegalArgumentException("token must be a valid Expo push token");
        }
    }
}
