# Database Migrations (manual)

This project runs with `spring.jpa.hibernate.ddl-auto=none`, so schema changes are **applied by hand** — there is no Flyway/Liquibase yet.

## How to apply a migration

Local (Docker Postgres from `docker-compose.yml`):

```bash
psql -U postgres -h localhost -d chat -f chunk1-room-theme.sql
```

EC2 production: copy the file to the instance and run the same command with the production credentials.

## Order

| File | Chunk | Feature | Status |
|---|---|---|---|
| `chunk1-room-theme.sql` | Chunk 1 | Chat themes — `room_theme` table | pending |

## Recommendation

Five features are planned (themes, push, pins, reactions, voice). Consider adding Flyway (`spring-boot-starter-flyway`, move these files into `db/migration/` as `V1__...sql`) before Chunk 2 of any feature so migrations become versioned and automatic.
