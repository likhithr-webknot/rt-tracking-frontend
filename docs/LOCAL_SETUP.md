# Local setup (Pulse / RT Tracking)

Use this guide to run the same stack on another laptop or share it with a teammate.

## What you need

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 20+ | Frontend dev server |
| **Java** | 17 | Webtrak backend (`./gradlew bootRun`) |
| **PostgreSQL** | 14+ | Backend database |
| **Git** | any | Clone both repos |

## Repositories

Clone these side by side (sibling folders):

```text
Developer/
  rt-tracking-frontend/   ← this repo (Pulse UI)
  webtrak/                ← Spring Boot API
```

## 1. Database

Create a PostgreSQL database, for example:

```sql
CREATE DATABASE webtrak_dev;
CREATE USER webtrak WITH PASSWORD 'webtrak';
GRANT ALL PRIVILEGES ON DATABASE webtrak_dev TO webtrak;
```

## 2. Backend (`webtrak`)

Create `webtrak/.env` (never commit real passwords):

```env
ENVIRONMENT=dev
SPRING_PROFILES_ACTIVE=dev

DATASOURCE_URL=jdbc:postgresql://localhost:5432/webtrak_dev
DATASOURCE_USERNAME=webtrak
DATASOURCE_PASSWORD=webtrak

JWT_SECRET=change-me-to-a-long-random-string
JWT_COOKIE_SECURE=false

# Optional until you test email
SMTP_USERNAME=
SMTP_PASSWORD=

# Optional — Google OAuth (password login works without these)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT=http://localhost:8080/login/oauth2/code/google
```

Start the API:

```bash
cd webtrak
./gradlew bootRun
```

Verify: `curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/actuator/health`  
(401 is fine — it means the server is up.)

## 3. Frontend (`rt-tracking-frontend`)

```bash
cd rt-tracking-frontend
cp .env.example .env
npm install
npm run setup:check
npm run dev
```

Open **http://localhost:3000**

### Frontend `.env` essentials

```env
VITE_API_DEV_PROXY=http://localhost:8080
VITE_ENABLE_DEV_QA=true
VITE_ADMIN_EMAILS=your-super-admin@webknot.in
```

`VITE_API_DEV_PROXY` must point at the machine running Webtrak. On another PC, use that PC's backend URL (usually still `http://localhost:8080` if both run locally).

## 4. Seed QA data (optional)

On the login page (dev only, when `VITE_ENABLE_DEV_QA=true`):

1. Click **Seed QA users on backend**
2. Run minimal directory data:

```bash
SEED_API_BASE_URL=http://localhost:8080 \
SEED_ADMIN_EMAIL=your-super-admin@webknot.in \
SEED_ADMIN_PASSWORD='your-password' \
npm run seed:minimal
```

**QA test password:** `WebknotQA#Test1`

| Role | Email |
|------|-------|
| Employee | `qa.employee.one@webknot.in` |
| Manager | `qa.manager.one@webknot.in` |
| HR | `qa.hr.one@webknot.in` |

## 5. Access from another device on the same network

The Vite dev server binds to all interfaces (`host: true`), so teammates on the same Wi‑Fi can open:

```text
http://<your-laptop-ip>:3000
```

Find your IP: `ipconfig getifaddr en0` (macOS) or `hostname -I` (Linux).

**Important:** The browser still proxies API calls through your frontend dev server, so **Webtrak must be running on the same machine as `npm run dev`**, unless you change `VITE_API_DEV_PROXY` / `VITE_API_BASE_URL` to a shared backend URL.

## 6. Production-style preview

```bash
npm run build
npm run preview
```

Preview also listens on `0.0.0.0:4173` by default. Set `VITE_API_BASE_URL` to your deployed API when not using the dev proxy.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Data in Supabase but empty/wrong in app | Webtrak reads **its own Postgres**, not Supabase directly. Point `webtrak/.env` `DATASOURCE_URL` at your Supabase **database connection string** (Settings → Database → URI), then restart `./gradlew bootRun`. |
| Google sign-in then blank login / no profile | Use frontend OAuth: add `http://localhost:3000/auth/callback` to Google Cloud **Authorized redirect URIs**. Local dev uses code exchange (not `:8080` cookies). |
| Login cookies not kept | Backend `.env`: `JWT_COOKIE_SECURE=false` |
| 502 / proxy errors | Start Webtrak on port 8080; check `VITE_API_DEV_PROXY` |
| KPIs empty for employee | Band + department must match KPI definitions (see Admin → KPI registry) |
| `npm run setup:check` fails backend | Run `./gradlew bootRun` in `webtrak` first |

### Using the shared Supabase database

If your team roster lives in Supabase (Table Editor → `users`, ~200 rows):

1. In Supabase: **Project Settings → Database → Connection string** (URI mode).
2. Set in `webtrak/.env`:

```env
DATASOURCE_URL=jdbc:postgresql://db.<project-ref>.supabase.co:5432/postgres?sslmode=require
DATASOURCE_USERNAME=postgres
DATASOURCE_PASSWORD=<your-db-password>
```

3. Restart Webtrak. The Pulse UI calls `GET /api/v1/user/onboard` on that backend — it does **not** read Supabase from the browser unless `VITE_SUPABASE_URL` is set (cache only).

Optional frontend cache mirror:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon-key>
```

## Quick daily workflow

```bash
# Terminal 1
cd webtrak && ./gradlew bootRun

# Terminal 2
cd rt-tracking-frontend && npm run dev
```
