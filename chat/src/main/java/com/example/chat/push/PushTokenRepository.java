package com.example.chat.push;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

public interface PushTokenRepository extends JpaRepository<PushToken, Long> {

    List<PushToken> findByUserIdIn(List<Long> userIds);

    void deleteByToken(String token);

    /** Idempotent registration — one row per (user_id, token). */
    @Modifying
    @Query(value = """
            INSERT INTO push_tokens (user_id, token, platform, device_name, created_at, last_used_at)
            VALUES (:userId, :token, :platform, :deviceName, now(), now())
            ON CONFLICT (user_id, token)
            DO UPDATE SET platform = :platform,
                          device_name = :deviceName,
                          last_used_at = now()
            """, nativeQuery = true)
    void upsert(@Param("userId") Long userId,
                @Param("token") String token,
                @Param("platform") String platform,
                @Param("deviceName") String deviceName);

    @Transactional
    long deleteByLastUsedAtBefore(Instant cutoff);
}
