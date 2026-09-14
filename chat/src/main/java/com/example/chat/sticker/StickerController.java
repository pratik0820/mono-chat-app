package com.example.chat.sticker;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/stickers")
public class StickerController {

    private final StickerSetRepository stickerSetRepository;
    private final StickerRepository stickerRepository;

    public StickerController(StickerSetRepository stickerSetRepository, StickerRepository stickerRepository) {
        this.stickerSetRepository = stickerSetRepository;
        this.stickerRepository = stickerRepository;
    }

    /** List all sticker sets **/
    @GetMapping("/sets")
    public List<StickerSet> listSets() {
        return stickerSetRepository.findAll();
    }

    /** Get stickers in a specific set */
    @GetMapping("/sets/{setId}")
    public ResponseEntity<?> getStickers(@PathVariable Long setId) {

        if (!stickerSetRepository.existsById(setId)) {
            return ResponseEntity.notFound().build();
        }

        List<Sticker> stickers = stickerRepository.findBySetIdOrderBySortOrderAsc(setId);
        StickerSet set = stickerSetRepository.findById(setId).orElseThrow();

        return ResponseEntity.ok(Map.of("set", set, "stickers", stickers));
    }
}
