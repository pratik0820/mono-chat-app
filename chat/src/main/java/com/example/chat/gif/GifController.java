package com.example.chat.gif;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/gifs")
public class GifController {

    private static final Logger log = LoggerFactory.getLogger(GifController.class);

    @Value("${klipy.api-key:}")
    private String klipyApiKey;

    private final org.springframework.web.client.RestTemplate restTemplate =
            new org.springframework.web.client.RestTemplate();

    private static final String KLIPY_BASE_URL = "https://api.klipy.com/api/v1";

    // ═══════════════════════════════════════════════════════════════════
    // GIF ENDPOINTS
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Search GIFs via KLIPY API.
     * GET /api/gifs/search?q=funny&limit=20&page=1
     */
    @GetMapping("/search")
    public ResponseEntity<?> search(
            @RequestParam String q,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(defaultValue = "1") int page) {

        if (klipyApiKey == null || klipyApiKey.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "KLIPY API key not configured"));
        }

        String encodedQuery = java.net.URLEncoder.encode(q, java.nio.charset.StandardCharsets.UTF_8);
        String url = String.format("%s/%s/gifs/search?q=%s&per_page=%d&page=%d",
                KLIPY_BASE_URL, klipyApiKey, encodedQuery, limit, page);

        return fetchAndConvert(url);
    }

    /**
     * Get trending GIFs (localized to user's region).
     * GET /api/gifs/trending?limit=20&page=1
     */
    @GetMapping("/trending")
    public ResponseEntity<?> trending(
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(defaultValue = "1") int page) {

        if (klipyApiKey == null || klipyApiKey.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "KLIPY API key not configured"));
        }

        String url = String.format("%s/%s/gifs/trending?per_page=%d&page=%d",
                KLIPY_BASE_URL, klipyApiKey, limit, page);

        return fetchAndConvert(url);
    }

    // ═══════════════════════════════════════════════════════════════════
    // MEME ENDPOINTS
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Search Memes via KLIPY API.
     * GET /api/gifs/memes/search?q=bollywood&limit=20&page=1
     */
    @GetMapping("/memes/search")
    public ResponseEntity<?> searchMemes(
            @RequestParam String q,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(defaultValue = "1") int page) {

        if (klipyApiKey == null || klipyApiKey.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "KLIPY API key not configured"));
        }

        String encodedQuery = java.net.URLEncoder.encode(q, java.nio.charset.StandardCharsets.UTF_8);
        String url = String.format("%s/%s/static-memes/search?q=%s&per_page=%d&page=%d",
                KLIPY_BASE_URL, klipyApiKey, encodedQuery, limit, page);

        return fetchAndConvert(url);
    }

    /**
     * Get trending Memes (localized to user's region).
     * GET /api/gifs/memes/trending?limit=20&page=1
     */
    @GetMapping("/memes/trending")
    public ResponseEntity<?> trendingMemes(
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(defaultValue = "1") int page) {

        if (klipyApiKey == null || klipyApiKey.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "KLIPY API key not configured"));
        }

        String url = String.format("%s/%s/static-memes/trending?per_page=%d&page=%d",
                KLIPY_BASE_URL, klipyApiKey, limit, page);

        return fetchAndConvert(url);
    }

    // ═══════════════════════════════════════════════════════════════════
    // STICKER ENDPOINTS (KLIPY has better stickers than local ones)
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Search Stickers via KLIPY API.
     * GET /api/gifs/stickers/search?q=love&limit=20&page=1
     */
    @GetMapping("/stickers/search")
    public ResponseEntity<?> searchStickers(
            @RequestParam String q,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(defaultValue = "1") int page) {

        if (klipyApiKey == null || klipyApiKey.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "KLIPY API key not configured"));
        }

        String encodedQuery = java.net.URLEncoder.encode(q, java.nio.charset.StandardCharsets.UTF_8);
        String url = String.format("%s/%s/stickers/search?q=%s&per_page=%d&page=%d",
                KLIPY_BASE_URL, klipyApiKey, encodedQuery, limit, page);

        return fetchAndConvert(url);
    }

    /**
     * Get trending Stickers (localized to user's region).
     * GET /api/gifs/stickers/trending?limit=20&page=1
     */
    @GetMapping("/stickers/trending")
    public ResponseEntity<?> trendingStickers(
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(defaultValue = "1") int page) {

        if (klipyApiKey == null || klipyApiKey.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "KLIPY API key not configured"));
        }

        String url = String.format("%s/%s/stickers/trending?per_page=%d&page=%d",
                KLIPY_BASE_URL, klipyApiKey, limit, page);

        return fetchAndConvert(url);
    }

    // ═══════════════════════════════════════════════════════════════════
    // SHARED HELPER
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Fetch from KLIPY API and convert to our standard response format.
     * Works for GIFs, Memes, and Stickers since they share the same response structure.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private ResponseEntity<?> fetchAndConvert(String url) {
        try {
            log.debug("[KLIPY] Fetching: {}", url);
            Map<String, Object> response = restTemplate.getForObject(url, Map.class);
            log.debug("[KLIPY] Raw response keys: {}", response != null ? response.keySet() : "null");
            if (response == null) {
                return ResponseEntity.ok(Map.of("results", List.of(), "next", 0));
            }

            // KLIPY returns: { result: true, data: { data: [...items...] } }
            Map<String, Object> dataWrapper = (Map<String, Object>) response.get("data");
            if (dataWrapper == null) {
                log.warn("[KLIPY] No data wrapper found. Response: {}", response.keySet());
                return ResponseEntity.ok(Map.of("results", List.of(), "next", 0));
            }

            List items = (List) dataWrapper.get("data");
            log.debug("[KLIPY] Items count: {}", items != null ? items.size() : "null");
            if (items == null) items = List.of();

            // KLIPY doesn't return next_page in the same format — use item count for pagination
            int nextPage = items.size() >= 20 ? 1 : 0; // Simple heuristic

            java.util.ArrayList<Map<String, Object>> results = new java.util.ArrayList<>();
            for (Object obj : items) {
                Map<String, Object> item = (Map<String, Object>) obj;

                // KLIPY structure: item.file.hd.gif.url or item.file.sm.webp.url
                Map<String, Object> file = (Map<String, Object>) item.get("file");
                if (file == null) continue;

                // Get preview URL (small size)
                String previewUrl = extractUrlFromSizes(file, "sm", "xs");
                // Get full GIF URL (medium or hd size)
                String gifUrl = extractUrlFromSizes(file, "md", "hd");

                Map<String, Object> result = new java.util.HashMap<>();
                result.put("id", String.valueOf(item.get("id")));
                result.put("title", String.valueOf(item.getOrDefault("title", "")));
                result.put("previewUrl", previewUrl);
                result.put("gifUrl", gifUrl);
                results.add(result);
            }

            return ResponseEntity.ok(Map.of("results", results, "next", nextPage));

        } catch (Exception e) {
            log.error("[KLIPY] Error fetching: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to fetch from KLIPY: " + e.getMessage()));
        }
    }

    /**
     * Extract URL from KLIPY's file structure.
     * file.sm.gif.url or file.sm.webp.url
     */
    @SuppressWarnings("unchecked")
    private String extractUrlFromSizes(Map<String, Object> file, String... sizes) {
        for (String size : sizes) {
            Map<String, Object> sizeObj = (Map<String, Object>) file.get(size);
            if (sizeObj == null) continue;

            // Try gif first, then webp, then jpg
            for (String format : new String[]{"gif", "webp", "jpg"}) {
                Map<String, Object> formatObj = (Map<String, Object>) sizeObj.get(format);
                if (formatObj != null) {
                    Object url = formatObj.get("url");
                    if (url != null) return url.toString();
                }
            }
        }
        return "";
    }
}
