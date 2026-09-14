package com.example.chat.sticker;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface StickerRepository extends JpaRepository<Sticker, Long> {

    List<Sticker> findBySetIdOrderBySortOrderAsc(Long setId);
}
