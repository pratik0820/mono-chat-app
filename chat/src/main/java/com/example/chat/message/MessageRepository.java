package com.example.chat.message;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;

public interface MessageRepository extends JpaRepository<Message, Long> {

    List<Message> findByRoomIdOrderByCreatedAtDesc(Long roomId);

    List<Message> findByRoomIdAndCreatedAtBeforeOrderByCreatedAtDesc(Long roomId, Instant before,
                                                                     Pageable pageable);

    List<Message> findByRoomIdOrderByCreatedAtDesc(Long roomId, Pageable pageable);
}
