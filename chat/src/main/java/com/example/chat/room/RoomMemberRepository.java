package com.example.chat.room;

import com.example.chat.user.User;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface RoomMemberRepository extends JpaRepository<RoomMember, Long> {

    List<RoomMember> findByRoom(Room room);

    List<RoomMember> findByUser(User user);

    Optional<RoomMember> findByRoomAndUser(Room room, User user);

    boolean existsByRoomAndUser(Room room, User user);

    void deleteByRoom(Room room);

    /** Ids of all members of a room — used by PushDispatcher to find push targets. */
    @Query("select rm.user.id from RoomMember rm where rm.room.id = :roomId")
    List<Long> findUserIdsByRoomId(@Param("roomId") Long roomId);
}
