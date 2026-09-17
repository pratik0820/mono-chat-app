package com.example.chat.push;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;

/**
 * Chunk 6 housekeeping: deletes push tokens not refreshed for 90 days.
 * last_used_at is bumped on every (re-)registration, so an untouched row
 * means a device that never came back (or an OS that dropped the token).
 */
@Component
public class PushTokenCleanupJob {

    private static final Logger log = LoggerFactory.getLogger(PushTokenCleanupJob.class);
    static final Duration TOKEN_TTL = Duration.ofDays(90);

    private final PushTokenRepository pushTokenRepository;

    public PushTokenCleanupJob(PushTokenRepository pushTokenRepository) {
        this.pushTokenRepository = pushTokenRepository;
    }

    /** Daily at 03:00 UTC. */
    @Scheduled(cron = "0 0 3 * * *", zone = "UTC")
    @Transactional
    public void cleanupStaleTokens() {
        Instant cutoff = Instant.now().minus(TOKEN_TTL);
        long deleted = pushTokenRepository.deleteByLastUsedAtBefore(cutoff);
        if (deleted > 0) {
            log.info("Push token cleanup: removed {} token(s) unused since {}", deleted, cutoff);
        }
    }
}
