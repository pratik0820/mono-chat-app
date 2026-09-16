package com.example.chat.message;

import io.lettuce.core.dynamic.annotation.Param;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.List;

public interface MessageRepository extends JpaRepository<Message, Long> {

    List<Message> findByRoomIdOrderByCreatedAtDesc(Long roomId);

    List<Message> findByRoomIdAndCreatedAtBeforeOrderByCreatedAtDesc(Long roomId, Instant before,
                                                                     Pageable pageable);

    List<Message> findByRoomIdOrderByCreatedAtDesc(Long roomId, Pageable pageable);

    @Modifying
    @Query("delete from Message m where m.roomId = :roomId")
    void deleteByRoomId(@Param("roomId") Long roomId);
}
