# Real-Time Chat App with AI Assistant — Comprehensive Build Plan

> Source: `roadmap.txt` (Tier 1, Project 2 of 8). This document expands the roadmap into an actionable, step-by-step engineering plan: what the app includes, where to start, exact order of work, data model, API/STOMP contracts, milestones, and gotchas.
>
> **Client decision (updated):** the frontend is a **React Native (Expo) mobile app** (iOS + Android), replacing the web React client the roadmap assumed. The backend, data model, and STOMP contract are unchanged — WebSocket clients are transport-agnostic.

---

## 1. What This App Is

A **multi-user, real-time chat application** where people join rooms and exchange messages instantly over WebSockets. A special `@AI` assistant lives inside every room: you can mention it (`@AI what does the contract say about termination?`), and it retrieves relevant context from docs uploaded to that room (RAG pipeline), then streams/returns a grounded answer back into the chat as a regular participant.

**The whole point (per the roadmap):** this project moves you from *request/response* REST programming to *event-driven, push-based* systems. That is the skill gap between a 2-YOE backend dev and someone who can claim "I've built event-driven systems."

### 1.1 Feature Inventory (what the app will include)

| # | Feature | Type |
|---|---|---|
| 1 | User registration + login (JWT auth) | Core |
| 2 | Rooms: create, list, join (public + private/invite-only) | Core |
| 3 | Real-time messaging in rooms (WebSocket/STOMP, no refresh) | Core |
| 4 | Chat history with pagination (keyset cursor) | Core |
| 5 | Online/offline presence events | Core |
| 6 | `@AI` assistant with RAG over uploaded docs | Core |
| 7 | Doc upload per room (text ingest → chunks → embeddings) | Core |
| 8 | Redis Pub/Sub fan-out (multi-instance scaling) | Core |
| 9 | Typing indicators (ephemeral events) | Polish |
| 10 | AI rate limiting (per-user/per-room, Redis) | Polish |
| 11 | Graceful error handling (LLM failure mid-broadcast) | Polish |
| 12 | React Native (Expo) mobile app (iOS + Android) | Core |
| 13 | Integration tests (WebSocket flow + RAG retrieval) | Tests |
| 14 | Deploy: backend + Postgres + Redis, mobile app via EAS Build (APK/TestFlight) | Ship |
| 15 | Token-by-token AI streaming, multi-turn memory, seen receipts, docker-compose | Stretch |

---

## 2. Tech Stack (verified Aug 2026)

| Layer | Choice | Notes |
|---|---|---|
| Backend | **Spring Boot** | Roadmap says 3.x. **As of Aug 2026, 4.1.x is current; 3.5.x is the last 3.x line and EOL'd June 30, 2026.** Recommendation: **4.1.x if starting fresh**, 3.5.x only if you want to copy the Resume Screener's Spring Security config verbatim. The WebSocket/STOMP, Redis, JPA APIs used here are essentially identical across both. |
| WebSocket | `spring-boot-starter-websocket` + STOMP (in-memory broker first, Redis later) | `@EnableWebSocketMessageBroker`, `WebSocketMessageBrokerConfigurer` |
| Auth | Spring Security + JWT | Reuse/copy-adapt Resume Screener's `AuthService` + JWT filter, or use `spring-security-oauth2-resource-server` (less code, more idiomatic — see Open Decisions) |
| Persistence | PostgreSQL + **pgvector** extension | Docker image `pgvector/pgvector:pg16` |
| Messaging | Redis Pub/Sub (`spring-boot-starter-data-redis`) | `RedisMessageListenerContainer` |
| AI | OpenAI API (embeddings + chat) via OpenAI Java SDK or plain `RestClient` | Reuse the Resume Screener's HTTP integration pattern. Models: `text-embedding-3-small` (1536 dims — matches `vector(1536)`) + a chat model (e.g. `gpt-4o-mini`). Keep model names in `application.yml`. |
| Mobile client | **React Native (Expo)** — `@stomp/stompjs` over the native WebSocket (no SockJS — browser-only), axios, expo-router | One codebase for iOS + Android; reuses your React/JS skills from the Resume Screener |
| Java / Node | **JDK 21 (LTS)**, Node 20 LTS+ | |
| Deploy | Railway/Render (backend + Postgres + Redis), **EAS Build** for the mobile app | Same playbook as Resume Screener, minus the web host |

---

## 3. Prerequisites (install before Day 1)

- JDK 21 + Maven (or use the Maven wrapper)
- Node.js 20 LTS+ and npm
- Docker Desktop (for local Postgres + Redis)
- **Expo Go** on a physical phone (or an Android emulator / iOS Simulator) to run the mobile app
- An OpenAI API key (embedding + chat); keep it in an env var, never in code
- Optional: the Resume Screener repo to copy the JWT/auth code from

---

## 4. Repository Layout (monorepo — recommended)

```
chat-app/
├── PLAN.md                  ← this document
├── roadmap.txt
├── backend/                 ← Spring Boot app
│   ├── pom.xml
│   └── src/main/java/com/example/chat/
│       ├── ChatApplication.java
│       ├── config/          WebSocketConfig, SecurityConfig, RedisConfig, JwtProperties
│       ├── security/        JwtService, JwtAuthFilter, JwtChannelInterceptor
│       ├── user/            User entity, UserRepository, AuthController, AuthService, DTOs
│       ├── room/            Room, RoomMember, repositories, RoomService, RoomController
│       ├── message/         Message entity, MessageRepository, MessageService, ChatController (@MessageMapping)
│       ├── ai/              AiContextDocument, DocumentEmbedding, EmbeddingService, RagService, DocIngestionController
│       ├── redis/           RedisPublisher, RedisSubscriber (Phase 5)
│       └── presence/        WebSocketEventListener (connect/disconnect)
│   └── src/main/resources/application.yml
├── mobile/                  ← React Native (Expo) app
│   ├── app.json             (Expo config: name, scheme; cleartext flag for local dev builds)
│   ├── package.json
│   ├── app/ or src/         (expo-router file routes or react-navigation screens)
│   │   ├── api/             axios client (auth, rooms, messages, docs)
│   │   ├── ws/stompClient.ts (connect, subscribe, send, reconnect — native WebSocket, no SockJS)
│   │   ├── screens/         LoginScreen, RegisterScreen, RoomListScreen, ChatScreen, DocUploadScreen
│   │   ├── components/      MessageList (FlatList), MessageInput, TypingIndicator, MessageBubble
│   │   └── hooks/           useChat, usePresence
└── docker-compose.yml       (stretch: app + Postgres + Redis)
```

---

## 5. Where to Start — Build Strategy

**Golden rule: build one thin vertical slice end-to-end first, then widen.**

Do NOT build the full backend then the full frontend. Instead, get the *shortest path that proves the core idea* working:

> register/login → create a room → send a message over WebSocket → see it appear on a second device/emulator.

Every phase below ends with a **milestone you can see working** — that's your definition of done for the step. The roadmap's phases (0–5) map to Steps 0–10 below, with the mobile client made explicit (the roadmap assumed a web client and didn't phase it).

**Estimated total: ~3 weeks at a sustainable pace** (roadmap §8). The two real learning curves are Step 3 (WebSocket + JWT handshake) and Step 6 (RAG) — budget extra time there.

---

## 6. Step-by-Step Build Plan

### Step 0 — Environment & Scaffolding (Day 1)

**Goal:** Both services boot, Postgres + Redis run locally.

1. Start Postgres with pgvector and Redis via Docker:
   ```bash
   docker run --name chat-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=chat -p 5432:5432 -d pgvector/pgvector:pg16
   docker run --name chat-redis -p 6379:6379 -d redis:7-alpine
   ```
2. Enable the extension: `psql -U postgres -d chat -c 'CREATE EXTENSION IF NOT EXISTS vector;'`
3. Scaffold the backend — use [start.spring.io](https://start.spring.io) with dependencies: `web, websocket, security, data-jpa, data-redis, postgresql, validation` (Java 21, Maven). Unzip into `backend/`.
4. Scaffold the mobile app: `npx create-expo-app@latest mobile` (default expo-router template), then `npm i @stomp/stompjs axios`. Install Expo Go on a phone (or use an Android emulator / iOS Simulator) to run it.
5. Wire `application.yml`: datasource URL `jdbc:postgresql://localhost:5432/chat`, Redis host `localhost:6379`, `jwt.secret`, `ai.api-key` (all overridable by env vars for later deploy).

**✅ Done when:** `mvn spring-boot:run` starts on :8080 and the Expo app boots in Expo Go / an emulator (Metro bundler on :8081).

---

### Step 1 — Auth (JWT) — REST register/login (Days 1–2)

**Goal:** Users can create an account and get a token — the foundation for both REST and the WebSocket handshake.

1. `User` entity + `UserRepository` (`username`, `email`, `password_hash`, `created_at`).
2. `AuthService`: register (validate unique username/email, encode password with BCrypt), login (verify + issue JWT).
3. `JwtService`: sign/verify HS256 tokens (`jjwt` or the Resume Screener's existing implementation — **copy-adapt, don't rebuild**).
4. `SecurityConfig`: permit `/api/auth/**` and `/ws/**`; everything else requires JWT; disable CSRF (stateless API). CORS is **optional** — native apps don't enforce it; add it only if you also run a web build for debugging.
5. `JwtAuthFilter`: OncePerRequestFilter that parses `Authorization: Bearer` and populates the SecurityContext.
6. Endpoints: `POST /api/auth/register`, `POST /api/auth/login`.

**✅ Done when:** `curl` register/login returns a token; `/api/rooms` without a token returns 401.

---

### Step 2 — Domain Model + REST APIs for Rooms & Messages (Days 2–3)

**Goal:** The persistence layer and REST surface exist before real-time arrives.

1. Entities: `Room`, `RoomMember`, `Message` (see §7 for the full schema). JPA relationships: Room 1—N Message, Room N—N User via RoomMember.
2. `RoomService` / `RoomController`: `GET /api/rooms` (rooms the user belongs to), `POST /api/rooms` (create, adds creator as OWNER).
3. `MessageService` / REST history: `GET /api/rooms/{id}/messages?limit=50&before=<id>` — **keyset pagination** (`WHERE room_id = ? AND id < ? ORDER BY id DESC LIMIT ?`), reuse the pattern from the Phiter CSV work.
4. JPA `@PrePersist` sets `created_at`; add an index on `messages(room_id, id)` for the cursor query.

**✅ Done when:** you can create a room via curl and fetch its (empty) message history with a cursor.

---

### Step 3 — Core WebSocket/STOMP Chat (Days 3–5) ⚠️ hardest phase

**Goal:** Two users chat in a room in real time, no AI yet. **This is the milestone the roadmap cares most about.**

1. **`WebSocketConfig`** — `@EnableWebSocketMessageBroker`:
   - STOMP endpoint `/ws` as a **raw WebSocket** (no SockJS — the mobile client uses the native `WebSocket`); optionally add a second endpoint `/ws-sockjs` with SockJS if you also want browser-based debugging
   - App prefix `/app`, broker prefix `/topic`
   - Start with the **simple in-memory broker** (`enableSimpleBroker("/topic")`) — Redis comes in Step 5
2. **`ChatController`** (`@Controller` + `@MessageMapping("/chat.sendMessage/{roomId}")`):
   - Validate the user is a member of the room
   - Persist the `Message` (type `USER`)
   - Broadcast via `SimpMessagingTemplate.convertAndSend("/topic/room." + roomId, dto)`
3. **JWT handshake authentication** — the trickiest part, budget real time:
   - Browsers can't set headers on the WebSocket handshake, so send the token as a **STOMP `CONNECT` frame header** (`Authorization: Bearer ...` via `connectHeaders` in the client) — this works over SockJS transports too. (Alternative: `?token=` query param on the connect URL.)
   - Implement a **`ChannelInterceptor` on `CONNECT` frames**: read the token from `StompHeaderAccessor`, validate with `JwtService`, set the `Principal`/user attributes on the session. Reject the CONNECT (return null) on failure.
4. **Presence** — `ApplicationListener<SessionConnectEvent/SessionDisconnectEvent>`: track online users (in-memory `ConcurrentHashMap` for now; Redis later) and broadcast `/topic/presence`.
5. **Minimal client smoke test** before building the real UI: a throwaway screen or debug button in the Expo app that connects, subscribes to a room topic, and sends a message.

**✅ Milestone:** Run the app on **two clients** — a physical phone via Expo Go plus an Android emulator (or two emulators) — log in as two users, join the same room, and see messages appear on both instantly. Two networking notes: a real phone must reach the backend via your machine's **LAN IP** (not `localhost`), and the Android emulator uses **`10.0.2.2`**. This is the roadmap's Phase 1 milestone; **do not proceed until this works.**

---

### Step 4 — React Native (Expo) Mobile App (Days 5–7)

**Goal:** A usable chat UI on iOS + Android — the two-client demo, presentable.

1. **Routing + auth screens:** Login, Register, Room list, Chat. Use expo-router (file-based, the Expo default) or React Navigation. Store the JWT in `AsyncStorage` (or `expo-secure-store` — extra credit); an axios interceptor adds the `Authorization` header.
2. **`stompClient.ts`**: singleton that connects with `brokerURL: 'ws://<host>:8080/ws'` over the **native WebSocket** React Native provides (no SockJS), sends the token in STOMP `connectHeaders`, exposes `subscribe(topic, cb)` and `send(destination, body)`. Handle **reconnect** on disconnect — backgrounding the app drops the socket (see Gotchas).
3. **ChatScreen:** `useChat` hook — on mount, subscribe to `/topic/room.{id}`, fetch history via REST (Step 2), merge old (REST) + new (WS) messages. Render with a **FlatList** (inverted data so new messages stick to the bottom), auto-scroll on new messages.
4. **RoomList + create-room form** wired to `GET/POST /api/rooms`.
5. **Presence UI:** subscribe to `/topic/presence`, show online users.

**✅ Done when:** the full flow works on device/emulator with a decent UI — login, room list, join, chat between two clients, history loads on join.

---

### Step 5 — Redis Pub/Sub for Horizontal Scale (Days 7–9)

**Goal:** Prove you understand *why* pub/sub is needed — not just how to use STOMP.

The problem: with 2+ app instances behind a load balancer, a user on Instance A and a user on Instance B can't see each other's messages unless messages are fanned out through a shared channel. STOMP sessions are per-instance; Redis makes them global.

1. Swap the in-memory broker for the **external Redis broker**:
   ```java
   @EnableWebSocketMessageBroker
   config.enableSimpleBroker("/topic"); // becomes: enableStompBrokerRelay → or keep simple broker + Redis fan-out below
   ```
   Two implementation options (roadmap favors the second):
   - **A. STOMP broker relay** to Redis (needs `spring-session-data-redis` style setup) — closest to production.
   - **B. Manual fan-out (recommended, more instructive):** keep the simple broker, but on every inbound message, `redisTemplate.convertAndSend("chat.room." + roomId, payload)`. Each instance runs a `RedisMessageListenerContainer` + `MessageListenerAdapter` subscribing to `chat.room.*`; when a listener receives an event, it pushes to its **own** connected sessions via `SimpMessagingTemplate`. Messages persist first (Postgres), then fan out.
2. Extract the broadcast into a `RedisPublisher` so both the direct path and the Redis path exist cleanly.
3. Run **two instances locally** (`mvn spring-boot:run` on :8080 and :8081 with `server.port=8081`), point a client at each (e.g., one emulator set to `:8080`, another to `:8081` — or a dev toggle for the backend URL), confirm cross-instance delivery.
4. **Prepare the interview answer:** "Why not just use a full STOMP broker relay to RabbitMQ?" — trade-off of simplicity vs. durability/replay. Redis Pub/Sub is fire-and-forget (a down node loses messages); RabbitMQ/STOMP relay gives queues, persistence, replay.

**✅ Milestone:** Two instances on different ports; messages fan out correctly across both via Redis (roadmap Phase 2 milestone).

---

### Step 6 — RAG Pipeline for the `@AI` Assistant (Days 9–14) ⚠️ second hardest phase

**Goal:** `@AI what does the contract say about termination?` retrieves the relevant doc chunks and returns a grounded answer into the room.

**Decision (from roadmap §4):** start with **documents-only RAG** (embed uploaded docs, not every message). Message-history RAG is a stretch goal.

**6a. Ingestion**
1. `AiContextDocument` + `DocumentEmbedding` entities (§7).
2. `POST /api/rooms/{id}/documents` — accept a text paste or uploaded `.txt`/`.pdf` (start with text/plain; PDF parsing is a stretch).
3. **Chunking:** simple fixed-size (~500–800 chars) or sentence-based chunks with small overlap.
4. `EmbeddingService`: call the embeddings API per chunk (`text-embedding-3-small`, 1536 dims), batch the requests to save cost.
5. Persist chunks + vectors in `document_embeddings`.

**6b. Retrieval**
1. In `ChatController`, detect `@AI` at the start of a message (or a dedicated `@MessageMapping("/chat.askAi/{roomId}")`).
2. Embed the user's query, then cosine search with pgvector:
   ```sql
   SELECT chunk_text, chunk_index
   FROM document_embeddings de
   JOIN ai_context_documents d ON d.id = de.document_id
   WHERE d.room_id = :roomId
   ORDER BY de.embedding <=> :queryVector
   LIMIT 5;
   ```
3. Create the **HNSW index** for scale: `CREATE INDEX ON document_embeddings USING hnsw (embedding vector_cosine_ops);`
4. Return no-context answer gracefully if the room has no docs (or top-k below a similarity threshold).

**6c. Generation**
1. Prompt: system instruction ("answer only from the provided context, cite it, say if the answer isn't in the context") + retrieved chunks + user question.
2. Call the chat model. **First version: send the full response when ready** (simpler). Token streaming is a stretch goal.
3. **Critical:** run the LLM call on a separate executor (`@Async` or a `TaskExecutor`) — never block the STOMP dispatch thread. On success, persist `Message(type = AI)` and broadcast to `/topic/room.{roomId}` like any other message. On failure, catch and send a SYSTEM/error message (see Step 8).
4. Cache embeddings of identical queries (Redis, short TTL) to control cost.

**✅ Milestone:** Upload a short doc to a room, ask a question about it via `@AI`, get an answer that reflects the doc — not a generic LLM answer. (Roadmap Phase 3 milestone.)

---

### Step 7 — AI in the UI + UX Polish (Days 14–16)

1. **AI UX:** render AI messages distinctly (avatar/label, "thinking…" indicator while waiting for the model).
2. **Typing indicators:** `@MessageMapping("/chat.typing/{roomId}")` → broadcast ephemeral `/topic/room.{roomId}.typing` (don't persist). Debounce on the client (send at most every ~2s).
3. **Presence polish:** join/leave events with friendly messages; "X is typing…" line in the header.

**✅ Done when:** the app feels like a real chat product: typing indicators, presence, AI messages styled, no jank on rapid sends.

---

### Step 8 — Production Concerns (Days 16–18)

1. **AI rate limiting:** Redis `INCR` + `EXPIRE` sliding window, per-user and per-room (e.g., 10 AI calls/min). Return a friendly SYSTEM message when exceeded — great cost control + interview point.
2. **Error handling:** LLM timeout/rate-limit/failure must never hang the WebSocket session — catch in the async task, push a SYSTEM message to the room or a per-user error to `/user/queue/errors`. Wrap WebSocket message handling in try/catch so a bad payload can't kill the connection.
3. **Message size limits:** raise `setMaxTextMessageBufferSize`/`setSendBufferSizeLimit` if AI responses or docs get large; keep AI responses chunked.
4. **Room permissions:** private rooms (membership required to join/subscribe and to read history), invite-only via `room_members.role`.
5. **Pagination hardening:** keyset cursor verified against concurrent inserts; limit maximum page size.
6. **Logging + observability basics:** structured logs for connect/disconnect/LLM calls; log AI cost per request (tokens in/out) — another great interview artifact.

**✅ Done when:** you can kill the LLM call (bad key, timeout) and the room keeps working with a graceful error message.

---

### Step 9 — Tests (Days 18–19)

1. **WebSocket integration tests** with Spring's `WebSocketStompClient`: connect with a valid/invalid JWT, send a message, assert it arrives on the subscribed topic (roadmap's suggested test).
2. **RAG retrieval test:** seed known chunks, assert the correct chunk is top-1 for a matching query.
3. **Auth tests:** register/login, wrong password, expired token.
4. **Service tests:** room membership rules, keyset pagination correctness.
5. **Mobile smoke tests:** Jest + React Native Testing Library (via the `jest-expo` preset) for component/hook tests, and optionally Maestro or Detox for a device-level happy path (login → join room → send).

**✅ Done when:** `mvn test` passes and the WebSocket + RAG integration tests are green.

---

### Step 10 — Deploy & Ship (Days 19–21)

1. **Backend:** Dockerfile (multi-stage Maven build → `eclipse-temurin:21-jre`). Deploy to Railway or Render with a managed **Postgres** (enable pgvector — both support it) and **Redis** (Railway has managed Redis; on Render you'll use Redis Cloud or an external instance — note this gotcha).
2. **Env vars:** `DB_URL`, `DB_USER`, `DB_PASSWORD`, `REDIS_URL`, `JWT_SECRET`, `OPENAI_API_KEY`, `AI_CHAT_MODEL`, `AI_EMBEDDING_MODEL` (+ `CORS_ORIGINS` only if you add a web debugging build). Run a migration on boot (`CREATE EXTENSION IF NOT EXISTS vector` + schema via JPA `ddl-auto: update` or Flyway).
3. **Mobile app:** build with **EAS Build** (`eas build -p android` / `-p ios`) → distributable APK / TestFlight, or share the APK directly for a portfolio demo. Point the app at the deployed backend with an `EXPO_PUBLIC_API_URL` env constant and use **`wss://`** for the WebSocket in production. Native clients need no CORS, but keep the backend's CORS config for optional web debugging.
4. **README:** architecture diagram (reuse roadmap §2), setup instructions, env var table, and a short screen recording of the two-client demo + `@AI` answer.
5. **Demo script:** login as two users, chat, upload a doc, ask `@AI` a grounded question, show presence + typing.

**✅ Done when:** the app is live on the public URLs and survives a fresh-browser demo.

---

### Step 11 — Stretch Goals (only after core is solid)

1. **Token-by-token AI streaming** (SSE-over-WebSocket relay or chunked STOMP frames) — big UX + interview win.
2. **Multi-turn conversational memory** for `@AI` (thread the last N messages into the prompt; keep retrieval single-turn).
3. **Message-history RAG** — embed every message, so `@AI` can also answer from past conversation.
4. **Seen receipts** ("read by X").
5. **`docker-compose.yml`** for the whole stack (app + Postgres + Redis) — strong portfolio signal.
6. **PDF/DOCX ingestion** and fancier chunking (recursive character splitter).

---

## 7. Data Model (full schema)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

users (
  id            BIGSERIAL PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

rooms (
  id         BIGSERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  is_private BOOLEAN      NOT NULL DEFAULT false,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

room_members (
  room_id   BIGINT REFERENCES rooms(id)  ON DELETE CASCADE,
  user_id   BIGINT REFERENCES users(id)  ON DELETE CASCADE,
  role      VARCHAR(20) NOT NULL DEFAULT 'MEMBER',   -- OWNER | MEMBER
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

messages (
  id         BIGSERIAL PRIMARY KEY,
  room_id    BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender_id  BIGINT REFERENCES users(id),            -- NULL for SYSTEM
  content    TEXT   NOT NULL,
  type       VARCHAR(10) NOT NULL DEFAULT 'USER',    -- USER | AI | SYSTEM
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_room_id_id ON messages (room_id, id DESC);  -- keyset pagination

ai_context_documents (          -- uploaded docs per room (RAG source)
  id          BIGSERIAL PRIMARY KEY,
  room_id     BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  title       VARCHAR(255),
  content     TEXT   NOT NULL,
  uploaded_by BIGINT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

document_embeddings (           -- one row per chunk
  id           BIGSERIAL PRIMARY KEY,
  document_id  BIGINT NOT NULL REFERENCES ai_context_documents(id) ON DELETE CASCADE,
  chunk_index  INT    NOT NULL,
  chunk_text   TEXT   NOT NULL,
  embedding    vector(1536) NOT NULL,   -- text-embedding-3-small
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_document_embeddings_hnsw ON document_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- Stretch (message-history RAG):
message_embeddings (
  id          BIGSERIAL PRIMARY KEY,
  message_id  BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  embedding   vector(1536) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 8. API & STOMP Contract Reference

### REST

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create account → `{ token, user }` |
| POST | `/api/auth/login` | Login → `{ token, user }` |
| GET | `/api/rooms` | Rooms the user belongs to |
| POST | `/api/rooms` | Create room (`{ name, isPrivate }`) |
| GET | `/api/rooms/{id}/messages?limit=50&before=<messageId>` | Keyset-paginated history |
| POST | `/api/rooms/{id}/documents` | Upload/paste a doc (multipart or JSON) |
| GET | `/api/rooms/{id}/documents` | List docs in a room |

### STOMP (WebSocket endpoint `/ws`, app prefix `/app`, broker prefix `/topic`)

| Direction | Destination | Payload | Notes |
|---|---|---|---|
| Client → Server | `CONNECT` (frame) | `Authorization: Bearer <jwt>` in connect headers | Validated by `ChannelInterceptor` |
| Client → Server | `/app/chat.sendMessage/{roomId}` | `{ content, type: "USER" }` | Persisted + broadcast |
| Client → Server | `/app/chat.typing/{roomId}` | `{ typing: true }` | Ephemeral, not persisted |
| Client → Server | `/app/chat.askAi/{roomId}` | `{ content: "@AI ..." }` | Triggers RAG pipeline |
| Server → Client | `/topic/room.{roomId}` | `{ id, sender, content, type, createdAt }` | All messages (USER/AI/SYSTEM) |
| Server → Client | `/topic/room.{roomId}.typing` | `{ username, typing }` | Typing indicator |
| Server → Client | `/topic/presence` | `{ onlineUserIds: [...] }` | Presence events |
| Server → Client | `/user/queue/errors` | `{ message }` | Per-user errors (e.g. rate limit, AI failure) |

> **Client note:** the mobile app connects with a **raw WebSocket** (no SockJS) to `/ws`, sending the JWT in the STOMP `CONNECT` frame headers — the contract is identical to the browser client the roadmap assumed.

---

## 9. Milestone Checklist (Definition of Done)

- [ ] **M0 (Step 0):** Postgres+pgvector and Redis running; backend and frontend boot locally.
- [ ] **M1 (Steps 1–2):** Register/login works; rooms + paginated history via REST.
- [ ] **M2 (Step 3):** Two devices/emulators, two users, real-time messages both ways — **the core milestone**.
- [ ] **M3 (Step 4):** Polished React Native app — login, room list, chat, history, presence (iOS + Android).
- [ ] **M4 (Step 5):** Two app instances on :8080/:8081, messages fan out via Redis.
- [ ] **M5 (Step 6):** Doc upload → `@AI` question → grounded, doc-reflecting answer.
- [ ] **M6 (Steps 7–8):** Typing indicators, rate limiting, LLM-failure resilience, private rooms.
- [ ] **M7 (Step 9):** WebSocket + RAG + auth integration tests green.
- [ ] **M8 (Step 10):** Deployed (backend + Postgres + Redis), mobile app built with EAS (APK/TestFlight), README with diagram + demo screen recording.

---

## 10. Suggested Schedule (from roadmap §8)

| Week | Focus | Steps |
|---|---|---|
| 1 | Environment, auth, REST, **WebSocket chat working end-to-end** | 0–4 |
| 2 | **Redis scaling + RAG MVP** | 5–6 |
| 3 | AI UX, polish, tests, deploy, README | 7–10 |

Front-load weekends on Steps 3 and 6 — they carry the real learning curve.

---

## 11. Risks & Gotchas

1. **JWT in the WebSocket handshake** — neither browsers nor React Native can set HTTP headers on the WS handshake. Use STOMP `CONNECT` frame headers (works with SockJS too) or a `?token=` query param. Validate in a `ChannelInterceptor`, not the HTTP filter.
2. **Never block the STOMP dispatch thread** — DB writes are fine, but LLM calls and Redis publishes must go through a separate executor/`@Async`, or the whole broker stalls.
3. **LLM failure mid-broadcast** — wrap in try/catch, push a SYSTEM/error message, never let it kill the session.
4. **Redis Pub/Sub is fire-and-forget** — a node that's down during a publish loses messages. That's the accepted trade-off vs. RabbitMQ (know this for interviews).
5. **App backgrounding drops the socket** — iOS/Android suspend WebSockets when the app backgrounds. Reconnect on foreground (via an `AppState` listener) and resubscribe; `@stomp/stompjs`'s `reconnectDelay` option helps.
6. **Local networking in dev** — native apps don't enforce CORS (no browser origin) and need no proxy; point the app at the machine's LAN IP (`http://192.168.x.x:8080`), or `10.0.2.2` from the Android emulator. Keep the backend's CORS config only for optional browser-based debugging.
7. **Embedding costs** — batch chunk embeddings, cache identical query embeddings in Redis, and rate-limit AI calls before you demo (a loop bug can burn money fast).
8. **Version drift (Aug 2026)** — Spring Boot 3.5 is EOL (June 30, 2026); Spring Boot 4.1 is current. The APIs in this plan are the same across both, but if you copy Resume Screener code, verify its Spring Security config against the Boot version you choose.
9. **Message size limits** — raise Spring's WebSocket buffer limits early if AI responses or doc content are large.
10. **Sticky sessions illusion** — the two-client demo works with one instance *without* Redis; the Redis phase exists precisely because that stops working at 2+ instances. Don't skip it thinking it's optional.
11. **No SockJS in React Native** — SockJS is a browser fallback and doesn't run in RN. Use the raw `/ws` endpoint with `@stomp/stompjs`'s native WebSocket support (register a separate `/ws-sockjs` endpoint only if you want browser debugging).
12. **Cleartext HTTP/WS on Android** — Android 9+ blocks plain `ws://` / `http://` by default. Expo Go allows it for development; for a standalone build pointed at a local server, enable cleartext via `expo-build-properties`, and use `wss://` in production.
13. **`localhost` is not your phone** — a physical device can't reach the backend at `localhost`; use the machine's LAN IP (and bind Spring to `0.0.0.0`), or `10.0.2.2` from the Android emulator.

---

## 12. Interview Talking Points (roadmap §6)

- **STOMP over WebSocket vs raw WebSocket** — why a subprotocol (topics, queues, frames) beats hand-rolled framing.
- **Pub/Sub for horizontal scaling** — the exact failure it fixes (sticky sessions break at 2 instances).
- **RAG vs fine-tuning** — retrieval is cheaper, updatable without retraining; limits are chunking quality and recall.
- **Vector similarity search** — cosine similarity, why embedding dimensionality matters, HNSW vs IVFFlat indexing.
- **Event-driven vs request-response** — when each fits and why chat forced the choice.
- **Bonus (from roadmap §5 Phase 2):** "Why not RabbitMQ STOMP relay?" — simplicity vs. durability/replay.
- **Cost engineering** — Redis rate limiting + token accounting for AI calls.

---

## 13. Open Decisions to Confirm Before Starting (roadmap's closing question)

1. **Spring Boot 4.1 vs 3.5** — 4.1 if starting fresh (supported); 3.5 only if copying Resume Screener config verbatim. **Recommendation: 4.1.x.**
2. **JWT implementation** — copy the Resume Screener `AuthService` (jjwt) vs. Spring's `oauth2-resource-server` JWT decoder (less code). Either is fine; pick for consistency with your portfolio.
3. **RAG source** — documents-only first (roadmap recommendation) vs. embedding every message from day one.
4. **AI response mode** — full response when ready first, token streaming as stretch (roadmap recommendation).
5. **Vector store** — pgvector (free, simplest) vs. Pinecone free tier (managed, worth mentioning in interviews).
6. **AI provider** — OpenAI (matches Resume Screener pattern) vs. Anthropic; model names live in config.
7. **Repo layout** — monorepo `backend/` + `mobile/` (recommended above) vs. two repos.

---

**Next action when you're ready:** start Step 0 (scaffold both services + local Postgres/Redis), or — if you'd rather nail the design first — lock decisions 1–7 above and write the data model + REST/STOMP contracts into code skeletons before the WebSocket work.
