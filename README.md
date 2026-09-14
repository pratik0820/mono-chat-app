# Mono

A full-stack real-time chat application built with **Spring Boot**, **React Native (Expo)**, **PostgreSQL**, and **Redis**. Features include real-time messaging via WebSocket/STOMP, JWT authentication, room-based chat, online presence tracking, typing indicators, and Redis Pub/Sub for horizontal scaling.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Start Infrastructure (PostgreSQL + Redis)](#2-start-infrastructure-postgresql--redis)
  - [3. Enable pgvector Extension](#3-enable-pgvector-extension)
  - [4. Configure Backend](#4-configure-backend)
  - [5. Start the Backend](#5-start-the-backend)
  - [6. Configure Mobile App](#6-configure-mobile-app)
  - [7. Start the Mobile App](#7-start-the-mobile-app)
- [Running Multiple Instances](#running-multiple-instances)
- [API Reference](#api-reference)
  - [REST Endpoints](#rest-endpoints)
  - [WebSocket/STOMP Contract](#websocketstomp-contract)
- [Environment Variables](#environment-variables)
- [Data Model](#data-model)
- [Key Components](#key-components)
- [Interview Talking Points](#interview-talking-points)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

| Feature | Description |
|---------|-------------|
| **User Authentication** | JWT-based registration and login |
| **Real-Time Messaging** | Instant message delivery via WebSocket/STOMP |
| **Chat Rooms** | Create, list, and join rooms |
| **Online Presence** | See who's online in real-time |
| **Typing Indicators** | Know when someone is typing |
| **Redis Pub/Sub** | Horizontal scaling across multiple instances |
| **Keyset Pagination** | Efficient chat history loading |
| **Cross-Platform** | iOS + Android via React Native (Expo) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Spring Boot 4.1.x, Java 21 |
| **WebSocket** | Spring WebSocket + STOMP |
| **Authentication** | Spring Security + JWT (jjwt) |
| **Database** | PostgreSQL 16 + pgvector |
| **Caching/Pub-Sub** | Redis 7 |
| **Mobile Client** | React Native (Expo SDK 57) |
| **HTTP Client** | Axios |
| **WebSocket Client** | @stomp/stompjs |
| **Navigation** | Expo Router (file-based) |

---

## Architecture

```
┌─────────────────────┐     WebSocket/STOMP      ┌──────────────────┐
│   React Native App  │◄────────────────────────►│  Spring Boot App  │
│   (Expo + STOMP)    │                          │  (Chat Service)   │
└─────────────────────┘                          └────────┬─────────┘
                                                          │
                       ┌──────────────────────────────────┼──────────────────────────────────┐
                       ▼                                  ▼                                  ▼
               ┌───────────────┐                ┌──────────────────┐              ┌──────────────────┐
               │ Redis Pub/Sub  │                │   PostgreSQL      │              │   pgvector        │
               │ (fan-out msgs  │                │  (chat history,   │              │  (vector search   │
               │  across nodes) │                │   users, rooms)   │              │   for RAG)        │
               └───────────────┘                └──────────────────┘              └──────────────────┘
```

### Redis Pub/Sub for Horizontal Scaling

With a single Spring Boot instance, the in-memory STOMP broker works fine. But when you run **two instances** behind a load balancer:

- User A connects to Instance 1 → subscribes to `/topic/room.1`
- User B connects to Instance 2 → sends a message
- Instance 2 broadcasts to its **own** subscribers only
- User A **never sees the message** because they're on Instance 1

**Redis Pub/Sub fixes this:** every instance publishes messages to a shared Redis channel, and every instance subscribes. When a message arrives on Redis, each instance pushes it to its own local STOMP sessions.

```
Instance 1 (:8085)                    Instance 2 (:8086)
┌──────────────────────┐              ┌──────────────────────┐
│ User A (STOMP)       │              │ User B (STOMP)       │
│   ↕ local sessions   │              │   ↕ local sessions   │
│ SimpMessagingTemplate│              │ SimpMessagingTemplate│
│        ↕             │              │        ↕             │
│  ┌─────────────┐     │              │  ┌─────────────┐     │
│  │RedisPublisher│────┼──── Redis ───┼──│RedisSubscriber│   │
│  └─────────────┘     │   channel    │  └─────────────┘     │
│        ↕             │              │        ↕             │
│  SimpMessagingTemplate│              │ SimpMessagingTemplate│
│   (push to local A)  │              │   (push to local B)  │
└──────────────────────┘              └──────────────────────┘
```

---

## Prerequisites

- **Java 21+** (JDK 21 LTS)
- **Maven 3.6+** (or use the included Maven wrapper)
- **Node.js 20+** and **npm**
- **Docker Desktop** (for PostgreSQL + Redis)
- **Expo Go** app on a physical phone (or Android emulator / iOS Simulator)
- **OpenAI API Key** (optional, for AI features)

---

## Project Structure

```
Realtime-chat/
├── chat/                          # Spring Boot backend
│   ├── pom.xml                    # Maven dependencies
│   └── src/main/java/com/example/chat/
│       ├── ChatApplication.java   # Main entry point
│       ├── config/
│       │   ├── RedisConfig.java          # RedisTemplate + JSON serialization
│       │   └── WebSocketConfig.java      # STOMP broker + JWT interceptor
│       ├── security/
│       │   ├── JwtService.java           # JWT sign/verify
│       │   ├── JwtAuthFilter.java        # HTTP request JWT filter
│       │   ├── JwtChannelInterceptor.java # WebSocket CONNECT frame auth
│       │   └── SecurityConfig.java       # Spring Security config
│       ├── user/
│       │   ├── User.java                 # User entity
│       │   ├── UserRepository.java
│       │   ├── AuthController.java       # Register/Login endpoints
│       │   ├── AuthService.java
│       │   └── dto/                      # Request/Response DTOs
│       ├── room/
│       │   ├── Room.java                 # Room entity
│       │   ├── RoomMember.java           # Room membership
│       │   ├── RoomRepository.java
│       │   ├── RoomMemberRepository.java
│       │   ├── RoomService.java
│       │   ├── RoomController.java
│       │   └── dto/
│       ├── message/
│       │   ├── Message.java              # Message entity
│       │   ├── MessageRepository.java
│       │   ├── MessageService.java
│       │   ├── ChatController.java       # REST message endpoints
│       │   ├── WebSocketChatController.java # STOMP @MessageMapping
│       │   ├── ChatMessageEvent.java     # Cross-instance event DTO
│       │   ├── TypingEvent.java          # Typing indicator DTO
│       │   └── dto/
│       ├── redis/
│       │   ├── RedisPublisher.java       # Publish to Redis channels
│       │   └── RedisSubscriber.java      # Listen and push to local sessions
│       ├── presence/
│       │   └── PresenceListener.java     # Online/offline tracking
│       └── common/
│           ├── GlobalExceptionHandler.java
│           ├── LoggingAspect.java
│           ├── MdcFilter.java
│           └── RequestLoggingFilter.java
├── mobile/                        # React Native (Expo) app
│   ├── package.json               # Dependencies
│   ├── app.json                   # Expo configuration
│   ├── tsconfig.json              # TypeScript config
│   ├── .env.example               # Environment variable template
│   └── src/
│       ├── api/
│       │   ├── client.ts          # Axios client + auth helpers
│       │   └── stompClient.ts     # STOMP WebSocket client
│       ├── app/
│       │   ├── _layout.tsx        # Root layout (theme provider)
│       │   ├── index.tsx          # Login screen
│       │   ├── register.tsx       # Registration screen
│       │   ├── rooms.tsx          # Room list screen
│       │   └── rooms/
│       │       └── [id].tsx       # Chat screen (per room)
│       ├── components/            # Reusable UI components
│       ├── constants/             # Theme, spacing constants
│       └── hooks/                 # Custom React hooks
├── docker-compose.yml             # PostgreSQL + Redis
├── PLAN.md                        # Detailed build plan
└── README.md                      # This file
```

---

## Getting Started

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Realtime-chat
```

### 2. Start Infrastructure (PostgreSQL + Redis)

```bash
docker-compose up -d
```

This starts:
- **PostgreSQL** on port `5432` (with pgvector)
- **Redis** on port `6379`

### 3. Enable pgvector Extension

```bash
docker exec -it realtime-chat-postgres-1 psql -U postgres -d chat -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 4. Configure Backend

Edit `chat/src/main/resources/application.properties` if needed:

```properties
# Default values (already configured)
spring.datasource.url=jdbc:postgresql://localhost:5432/chat
spring.datasource.username=postgres
spring.datasource.password=root
spring.data.redis.host=localhost
spring.data.redis.port=6379

# IMPORTANT: Change this in production!
jwt.secret=change-me-to-a-long-random-string-at-least-32-chars
```

### 5. Start the Backend

```bash
cd chat
./mvnw spring-boot:run
```

Or on Windows:
```bash
cd chat
mvnw.cmd spring-boot:run
```

The backend starts on **port 8085** by default.

### 6. Configure Mobile App

```bash
cd mobile
cp .env.example .env.local
```

Edit `.env.local` with your backend URL:

```bash
# Android emulator (default)
EXPO_PUBLIC_API_URL=http://10.0.2.2:8085

# Physical device (use your computer's LAN IP)
EXPO_PUBLIC_API_URL=http://192.168.1.100:8085
```

### 7. Start the Mobile App

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go (iOS/Android) or press `a` for Android emulator / `i` for iOS simulator.

---

## Running Multiple Instances

To test Redis Pub/Sub horizontal scaling:

### Start Instance 1 (port 8085)

```bash
cd chat
./mvnw spring-boot:run
```

### Start Instance 2 (port 8086)

```bash
cd chat
./mvnw spring-boot:run -Dspring-boot.run.arguments="--server.port=8086"
```

### Connect Clients

- **Emulator 1** → Instance 1 (`http://10.0.2.2:8085`)
- **Emulator 2** → Instance 2 (`http://10.0.2.2:8086`)

### Verify Cross-Instance Delivery

1. Create a room on Emulator 1
2. Join the same room on Emulator 2
3. Send a message from Emulator 2 → it appears on Emulator 1 in real-time

---

## API Reference

### REST Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/api/auth/register` | Register a new user | No |
| `POST` | `/api/auth/login` | Login and get JWT token | No |
| `GET` | `/api/rooms` | List rooms the user belongs to | Yes |
| `GET` | `/api/rooms/all` | List all available rooms | Yes |
| `POST` | `/api/rooms` | Create a new room | Yes |
| `POST` | `/api/rooms/{id}/join` | Join a room | Yes |
| `GET` | `/api/rooms/{id}` | Get room details | Yes |
| `GET` | `/api/rooms/{id}/messages` | Get messages (keyset pagination) | Yes |
| `POST` | `/api/rooms/{id}/messages` | Send a message via REST | Yes |

#### Query Parameters for Messages

- `limit` (default: 50) - Number of messages to fetch
- `before` (optional) - Message ID for cursor-based pagination

### WebSocket/STOMP Contract

**Endpoint:** `ws://<host>:8085/ws`

**Authentication:** JWT token in STOMP CONNECT frame headers:
```
Authorization: Bearer <jwt-token>
```

| Direction | Destination | Payload | Notes |
|-----------|-------------|---------|-------|
| Client → Server | `CONNECT` | `Authorization: Bearer <jwt>` in headers | Validated by `JwtChannelInterceptor` |
| Client → Server | `/app/chat.sendMessage/{roomId}` | `{ content, type: "USER" }` | Persisted + broadcast |
| Client → Server | `/app/chat.typing/{roomId}` | `{ typing: true }` | Ephemeral, not persisted |
| Server → Client | `/topic/room.{roomId}` | `{ id, senderId, username, content, type, createdAt }` | All messages (USER/AI/SYSTEM) |
| Server → Client | `/topic/room.{roomId}.typing` | `{ username, typing }` | Typing indicator |
| Server → Client | `/topic/presence` | `{ onlineUserIds: [...] }` | Presence events |

---

## Environment Variables

### Backend (`chat/src/main/resources/application.properties`)

| Variable | Default | Description |
|----------|---------|-------------|
| `server.port` | `8085` | Backend server port |
| `server.address` | `0.0.0.0` | Bind address (0.0.0.0 for LAN access) |
| `spring.datasource.url` | `jdbc:postgresql://localhost:5432/chat` | PostgreSQL URL |
| `spring.datasource.username` | `postgres` | PostgreSQL username |
| `spring.datasource.password` | `root` | PostgreSQL password |
| `spring.data.redis.host` | `localhost` | Redis host |
| `spring.data.redis.port` | `6379` | Redis port |
| `jwt.secret` | (must be set) | JWT signing secret (min 32 chars) |
| `jwt.expiration-ms` | `86400000` | JWT expiration (24 hours) |
| `ai.api-key` | (optional) | OpenAI API key for AI features |

### Mobile (`mobile/.env.local`)

| Variable | Default | Description |
|----------|---------|-------------|
| `EXPO_PUBLIC_API_URL` | `http://192.168.1.135:8085` | Backend API URL |

---

## Data Model

```sql
-- Users table
users (
  id            BIGSERIAL PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Rooms table
rooms (
  id         BIGSERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  is_private BOOLEAN      NOT NULL DEFAULT false,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Room membership
room_members (
  room_id   BIGINT REFERENCES rooms(id)  ON DELETE CASCADE,
  user_id   BIGINT REFERENCES users(id)  ON DELETE CASCADE,
  role      VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

-- Messages
messages (
  id         BIGSERIAL PRIMARY KEY,
  room_id    BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender_id  BIGINT REFERENCES users(id),
  content    TEXT   NOT NULL,
  type       VARCHAR(10) NOT NULL DEFAULT 'USER',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for keyset pagination
CREATE INDEX idx_messages_room_id_id ON messages (room_id, id DESC);
```

---

## Key Components

### Backend

| Component | File | Purpose |
|-----------|------|---------|
| `WebSocketConfig` | `config/WebSocketConfig.java` | STOMP broker + JWT interceptor setup |
| `RedisConfig` | `config/RedisConfig.java` | RedisTemplate + JSON serialization |
| `JwtService` | `security/JwtService.java` | JWT token sign/verify |
| `JwtChannelInterceptor` | `security/JwtChannelInterceptor.java` | Validates JWT on WebSocket CONNECT |
| `RedisPublisher` | `redis/RedisPublisher.java` | Publishes events to Redis channels |
| `RedisSubscriber` | `redis/RedisSubscriber.java` | Listens to Redis, pushes to local sessions |
| `PresenceListener` | `presence/PresenceListener.java` | Tracks online/offline users |

### Mobile

| Component | File | Purpose |
|-----------|------|---------|
| `client.ts` | `api/client.ts` | Axios HTTP client + auth helpers |
| `stompClient.ts` | `api/stompClient.ts` | STOMP WebSocket connection management |
| `useChat` | `hooks/useChat.ts` | Chat state + message subscription |
| `usePresence` | `hooks/usePresence.ts` | Online user tracking |

---

## Interview Talking Points

1. **STOMP over WebSocket vs raw WebSocket** — STOMP provides a subprotocol with topics, queues, and frames, simplifying routing and message handling.

2. **Pub/Sub for Horizontal Scaling** — With 2+ instances behind a load balancer, messages only reach subscribers on the same JVM. Redis Pub/Sub enables cross-instance message delivery.

3. **Why Not RabbitMQ STOMP Relay?** — RabbitMQ provides persistence, queues, and replay, but Redis Pub/Sub is simpler and sufficient for chat where messages are fire-and-forget.

4. **Dual Path Broadcasting** — Co-located users get messages via direct local broadcast (zero latency). Redis path handles cross-instance delivery.

5. **JWT in WebSocket Handshake** — Neither browsers nor React Native can set HTTP headers on WebSocket handshake. Solution: send token in STOMP CONNECT frame headers, validated by a `ChannelInterceptor`.

6. **Never Block STOMP Dispatch Thread** — LLM calls and Redis publishes must go through a separate executor, or the whole broker stalls.

7. **Keyset Pagination** — More efficient than offset-based pagination for real-time data. Uses `WHERE id < ? ORDER BY id DESC LIMIT ?` with an index.

---

## Troubleshooting

### Backend won't start

- Ensure PostgreSQL and Redis are running: `docker-compose ps`
- Check if port 8085 is already in use
- Verify `application.properties` has correct database credentials

### Mobile app can't connect to backend

- **Android emulator**: Use `http://10.0.2.2:8085` (emulator's localhost alias)
- **Physical device**: Use your computer's LAN IP (e.g., `http://192.168.1.100:8085`)
- Ensure the backend is bound to `0.0.0.0` (default in this project)
- Check firewall isn't blocking the connection
- **CI-built APK**: The workflow writes `EXPO_PUBLIC_API_URL` into `mobile/.env.local` before `expo prebuild`, so release APKs point at the EC2 backend (`http://18.212.79.35:8085`). Locally, Expo loads `.env.local` before `.env`, so a local `.env.local` overrides the committed `mobile/.env` — don't commit your local override. Release builds also need cleartext HTTP enabled (`usesCleartextTraffic: true` via `expo-build-properties` in `app.json`); without it, Android blocks all `http://` requests in release builds while debug builds keep working.

### WebSocket connection fails

- Verify the backend is running on the correct port
- Check that the JWT token is valid (not expired)
- Ensure you're connecting to `ws://` (not `http://`) for WebSocket

### Messages not appearing cross-instance

- Verify Redis is running and both instances can connect
- Check Redis channel names match (`chat.room.{roomId}`)
- Look at backend logs for Redis publish/subscribe activity

### App backgrounding drops WebSocket

- This is expected behavior on iOS/Android
- The app automatically reconnects when foregrounded
- Check `stompClient.ts` AppState listener for reconnection logic

---

## License

This project is licensed under the MIT License - see the [LICENSE](mobile/LICENSE) file for details.

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Acknowledgments

- [Spring Boot](https://spring.io/projects/spring-boot) - Backend framework
- [Expo](https://expo.dev) - React Native development platform
- [pgvector](https://github.com/pgvector/pgvector) - Vector similarity search for PostgreSQL
- [STOMP.js](https://stomp-js.github.io/stomp-websocket/) - STOMP client for WebSocket
