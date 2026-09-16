-- ═══════════════════════════════════════════════════════════════════
-- Chunk 1: room_theme table (chat themes feature)
-- Apply manually:  psql -U postgres -d chat -f chunk1-room-theme.sql
-- Safe to re-run (IF NOT EXISTS, idempotent).
-- ═══════════════════════════════════════════════════════════════════

-- Notes:
--  * ddl-auto=none in application.properties, so schema changes are applied by hand.
--  * room_id is the PRIMARY KEY (1:1 with rooms) — no FK on purpose, keeps
--    Chunk 1 dependency-free. Chunk 5 (housekeeping) can add cleanup logic.
--  * CHECK constraint guarantees exactly one of theme_id / image_url is set.

CREATE TABLE IF NOT EXISTS room_theme (
    room_id    BIGINT PRIMARY KEY,
    theme_id   VARCHAR(32),
    image_url  TEXT,
    updated_by BIGINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT room_theme_exclusive CHECK (
        (theme_id IS NOT NULL AND image_url IS NULL) OR
        (theme_id IS NULL AND image_url IS NOT NULL)
    )
);

-- Handy index if we later join rooms → themes for room listings
CREATE INDEX IF NOT EXISTS idx_room_theme_updated_at ON room_theme (updated_at DESC);
