# Pulse (RT Tracking Frontend)

React + Vite UI for employee reviews, manager evaluations, and admin workflows. Talks to the **Webtrak** Spring Boot API.

## Quick start

**Prerequisites:** Node 20+, Java 17, PostgreSQL, and the [webtrak](https://github.com/your-org/webtrak) backend cloned as a sibling folder.

```bash
cp .env.example .env
npm install
npm run setup:check   # verifies backend is reachable
npm run dev           # http://localhost:3000
```

Full setup for a **new machine** (database, backend `.env`, QA seeding, LAN access): **[docs/LOCAL_SETUP.md](./docs/LOCAL_SETUP.md)**

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server on port 3000 (proxies `/api` → Webtrak) |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run setup:check` | Health check (Node, deps, backend) |
| `npm run seed:minimal` | Seed QA users/project/KPIs (needs admin env vars) |

## Environment

Copy `.env.example` → `.env`. Key variables:

- `VITE_API_DEV_PROXY` — Webtrak URL (default `http://localhost:8080`)
- `VITE_ENABLE_DEV_QA=true` — QA seed button on login page
- `VITE_ADMIN_EMAILS` — comma-separated super-admin emails

## Stack

- React 19, Vite 7, Tailwind 4, React Router 7, TanStack Query
