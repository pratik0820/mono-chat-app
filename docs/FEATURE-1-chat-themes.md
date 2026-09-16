# Feature 1 — Chat Themes (Wallpapers)

> Status: **PROPOSAL — awaiting review before implementation**
> Scope: per-room chat background themes. Two sources: (a) a curated set of built-in themes, (b) any image picked from the user's device library.
> This is feature 1 of 5 (themes → push notifications → pinned messages → reactions → voice messages).

---

## 1. What the user gets

1. In a chat room, tap a new **theme button (🖼️) in the header** → a bottom sheet opens:
   - **Built-in themes**: ~10 curated gradients/patterns (e.g. "Sunset", "Ocean", "Midnight", "Paper") + **Default** (current solid background).
   - **From device**: opens the phone's photo library; user picks any image → it becomes the room background.
2. The chosen theme applies **per room** and is visible to **everyone in the room** (like WhatsApp group icons, theme is room state, not device state).
   - *Alternative (cheaper, see §7):* theme is **per-user per-room** (only you see it). No backend needed at all.
3. Everyone's chat screen re-renders with the new background in real time (via the existing STOMP broadcast).
4. Text bubbles keep high contrast: bubbles stay solid; a subtle scrim keeps text readable over busy images.

**Out of scope (v1):** per-message bubble colors, theme marketplace, animated/video backgrounds, dark-mode variants of image themes.

---

## 2. UX flow

```
Chat screen header
  └─ 🖼️ tap → bottom sheet "Chat theme"
       ├─ Grid: [Default] [Sunset] [Ocean] ... (built-ins, 2×5)
       ├─ Row:  [＋ Pick from device]  (expo-image-library picker)
       ├─ (if a custom image is set) [Remove custom image]
       └─ Confirm → POST theme → sheet closes → background animates in
```

- Preview: tapping a built-in previews it immediately; "Apply" commits, "Cancel" reverts.
- Loading state on the confirm button while the image uploads (device-image path).
- Failure → toast "Couldn't set theme. Try again." — no optimistic commit.

---

## 3. Data model

### Built-in themes — no storage, just IDs

```ts
// mobile/src/constants/chatThemes.ts
export type BuiltinThemeId =
  | 'default' | 'sunset' | 'ocean' | 'midnight' | 'forest'
  | 'paper' | 'candy' | 'mono' | 'peach' | 'aurora';

export interface BuiltinTheme {
  id: BuiltinThemeId;
  name: string;
  colors: [string, string];   // gradient stops (expo-linear-gradient)
  textOnTheme: string;        // header/typing text color for contrast
}
```

Built-ins ship as static gradient definitions (tiny, offline, no assets to download). If we later want patterned built-ins, we add local `assets/themes/*.png` files referenced by the same ID.

### Room theme state — backend (shared-theme variant)

New table:

```sql
CREATE TABLE room_theme (
  room_id     BIGINT PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  theme_id    VARCHAR(32),            -- set when a built-in is chosen
  image_url   TEXT,                   -- set when a device image is chosen
  updated_by  BIGINT NOT NULL,        -- user id
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_theme CHECK (theme_id IS NOT NULL OR image_url IS NOT NULL)
);
```

- Exactly one of `theme_id` / `image_url` is set. Row absent ⇒ `default`.
- Device image is **not** stored in Postgres as bytes — uploaded to storage (§5), DB keeps the URL.

---

## 4. API + realtime contract

REST (JWT-authenticated, membership-checked):

| Method | Path | Body | Response |
|---|---|---|---|
| `GET`  | `/api/rooms/{roomId}/theme` | — | `200 { themeId?: string, imageUrl?: string, updatedBy, updatedAt }` or `204` (default) |
| `PUT`  | `/api/rooms/{roomId}/theme` | `{ themeId }` **or** `multipart/form-data image=<file>` | `200` same as GET |
| `DELETE` | `/api/rooms/{roomId}/theme` | — | `204` (reset to default) |

Multipart note: `PUT` accepts either JSON (`themeId`) or multipart (`image`), mirroring how `Message.Type` already discriminates content kinds.

Realtime: after a successful `PUT`, the backend broadcasts on the **existing room topic**:

```
/topic/room.{roomId}   →  { type: "THEME_UPDATED", themeId?, imageUrl?, updatedBy }
```

Clients that receive `THEME_UPDATED` re-fetch/apply the theme. Reusing the room topic avoids a new subscription path; the event is small and rare, so it doesn't pollute the message stream. Clients must ignore unknown `type` values for forward-compat.

---

## 5. Image upload — where does the picture live?

Two viable paths; decision needed (§7):

**Option A — free external storage (recommended to start):**
- **Supabase Storage (free tier: 1 GB files + 5 GB egress/mo, no credit card)** or **Cloudinary free tier (25 credits/mo ≈ 25 GB bandwidth + 25 GB storage)**.
- Upload flow: backend generates a short-lived signed upload URL → mobile uploads directly → mobile sends the resulting public URL in `PUT /theme`. Keeps image bytes off our EC2 and off Postgres.
- Supabase is the pick: simpler auth model (service key server-side), transformation params on URLs (`?width=1080&quality=70`) to auto-shrink downloads, and it doubles as the future home for voice-message files (feature 5) and push infra (feature 2) — one vendor for three features.

**Option B — self-host on the existing Spring Boot box (fully free, zero new vendor):**
- Add `spring-boot-starter-web` multipart handling + a `FileStorageService` writing to a local dir (e.g. `/var/chat-uploads/`) exposed via `GET /files/{id}`.
- EC2 disk is small and egress counts against AWS free tier, so add guardrails: cap upload at **5 MB**, downscale on the **client** before upload (see §6), and store only one current image per room (delete replaced files).
- Zero new moving parts; the risk is disk fill and bandwidth on a small instance.

**Recommendation:** start with **Option B** (no vendor, no signup, works today, volume is tiny for a personal app) and keep the `FileStorageService` interface narrow so swapping to Supabase later is a one-class change. The DB stores only the final URL either way, so migration is painless.

---

## 6. Mobile implementation plan

New/changed files (Expo SDK 57, expo-router, existing patterns):

| File | Purpose |
|---|---|
| `src/constants/chatThemes.ts` (new) | `BuiltinTheme[]` definitions + lookup helper |
| `src/api/client.ts` (edit) | `getRoomTheme`, `setRoomTheme` (JSON + multipart), `clearRoomTheme`; `ThemeDto` type |
| `src/components/ThemeSheet.tsx` (new) | bottom sheet: built-in grid + device picker + apply/remove |
| `src/app/rooms/[id].tsx` (edit) | 🖼️ header button; theme state; render background; handle `THEME_UPDATED` frames |
| `src/hooks/useChat.ts` (edit) | surface `THEME_UPDATED` events to the screen via callback |
| `app.json` (edit) | add `expo-image-picker` plugin config (photo permission string) |

Libraries to add:
- **expo-linear-gradient** — renders built-in gradients (first-party, no native pain).
- **expo-image-picker** — device library selection (first-party; already-ecosystem, config-plugin based so EAS/prebuild is unchanged). Use `mediaTypes: ['images']`, `allowsEditing: true` for square-ish crop.
- **expo-image** (already installed) — renders the chosen background image with `contentFit="cover"`, `recyclingKey` per URL.

Pre-upload downscale (keeps Option B viable): use `expo-image-manipulator` to resize to max **1440 px on the long edge, JPEG quality 0.75** — typically lands under ~400 KB, well under the 5 MB cap and fast on mobile data.

Rendering layers (chat screen, bottom of the view stack):

```
[absolute fill] gradient OR expo-image (cover) + optional rgba(0,0,0,0.25) scrim
[flex] header + typing bar + FlatList + input bar (existing, unchanged layout)
```

Bubbles already have solid `backgroundColor`, so readability is preserved. `FlatList` stays transparent; only the scrim + background sit behind it. Dark/light mode: built-ins look identical in both; image themes get the scrim in dark mode only.

Permission handling: `expo-image-picker` prompts the photo-library permission itself; on Android 13+ no runtime permission is needed for the picker. iOS `NSPhotoLibraryUsageDescription` goes in `app.json` via the plugin.

---

## 7. Backend implementation plan (Spring Boot 3.x, com.example.chat)

New package `com.example.chat.theme`:

| Class | Responsibility |
|---|---|
| `RoomTheme` (entity) | maps `room_theme` table (§3) |
| `RoomThemeRepository` | JPA repo, `findByRoomId` |
| `ThemeController` | `GET/PUT/DELETE /api/rooms/{roomId}/theme`; membership check via `RoomMemberRepository` (same as MessageService); JSON-vs-multipart branch |
| `ThemeService` | upsert logic, delete replaced custom image file, publish `THEME_UPDATED` |
| `FileStorageService` (interface) + `LocalFileStorageService` | Option B upload/store/serve under `/files/**`; `ThemeService` depends on the interface only |
| `WebMvcConfig` (edit) | serve `/files/**` as static resources with `Cache-Control: immutable` |
| `application.properties` (edit) | `chat.uploads.dir`, `spring.servlet.multipart.max-file-size=5MB`, `max-request-size=6MB` |

Broadcast: reuse the existing `SimpMessagingTemplate.convertAndSend("/topic/room." + roomId, payload)` used by `ChatController` for messages — payload `{"type":"THEME_UPDATED", "themeId":..., "imageUrl":..., "updatedBy":...}`.

DB migration: the project has no Flyway/Liquibase yet (schema appears to be auto-managed); add the table via a startup `schema.sql`/manual psql step consistent with how `messages` was created — flag: **introduce Flyway here if we want versioned migrations going forward** (5 features are coming; this is the right moment).

---

## 8. Prerequisites checklist

- [ ] Decision: **shared room theme** (backend, this doc) vs **per-user local theme** (client-only, ~1 hour of work, no backend) — §1.2.
- [ ] Decision: storage **Option B (self-host, recommended)** vs Option A (Supabase free tier).
- [ ] Decision: adopt **Flyway** for migrations now (recommended before 4 more features).
- [ ] `expo-linear-gradient`, `expo-image-picker`, `expo-image-manipulator` added to `mobile/package.json` (all first-party, free).
- [ ] No paid services anywhere in this plan. Option A's free tiers are only relevant if we outgrow EC2 disk.
- [ ] APK rebuild + reinstall required after adding the two expo plugins (native code changes); dev builds via `npx expo run:android`.

## 9. Milestones (each independently verifiable)

1. **M1 — built-in themes, client-only preview:** theme constants + gradient background + header button + ThemeSheet (no persistence). Verify: gradient renders behind messages, bubbles readable.
2. **M2 — persistence (built-ins):** backend table + GET/PUT/DELETE + `THEME_UPDATED` broadcast; client applies on room open + on realtime event. Verify: theme survives app restart; second device sees the change live.
3. **M3 — device image themes:** picker + manipulator downscale + `FileStorageService` upload + `/files/**` serving + scrim. Verify: pick photo → upload → background appears on both devices; replacing/deleting clears the old file.
4. **M4 — polish:** default theme resets, error toasts, dark/light check, low-end device perf check (image caching via expo-image), empty-room default.

## 10. Risks / gotchas

- **Readability** over arbitrary user photos → fixed scrim + solid bubbles; test with light photos.
- **EC2 disk/bandwidth** if many rooms upload → 5 MB cap + client downscale + delete-on-replace; swap to Supabase when needed.
- **Keyboard/edge-to-edge fixes just shipped** — the background must sit *behind* the new manual keyboard padding view (it will, since padding is layout, not an overlay).
- **STOMP frame stripping on RN** (forceBinaryWSFrames) — theme events are normal JSON text frames, same as chat messages; no special handling needed.
- **Image URL rot** if we later switch storage → store relative `/files/...` URLs and prefix with `API_URL` on the client, so switching vendors means changing one prefix.
