# TrekMate

A full-stack trek booking app for Karnataka's Western Ghats with a trip planner that
checks season and cost before recommending anything.

## How the planner works

Facts come from small, deterministic functions in `backend/planner.js`:

| Tool | What it does |
| --- | --- |
| `search_treks` | Filters treks by days available, fitness and region |
| `check_season` | Says whether a month is best, okay or to be avoided for a trek |
| `estimate_budget` | Adds entry fee, food and stay, and transport for the group |

- **With an OpenRouter key** (`OPENROUTER_API_KEY`), a language model decides which tools to
  call and writes the explanation. Every tool call is returned and shown in the UI.
- **Without a key**, a rule-based ranking calls the same tools directly, so the app works
  with no setup.

Trek details are approximate sample data and food, stay and transport are planning
allowances. Check current conditions and permits with the Karnataka Forest Department
before you go.

## Run locally

Requires Node.js 18 or newer.

```bash
# Terminal 1: API
cd backend
npm install
cp .env.example .env
npm start            # http://localhost:4000

# Terminal 2: web app
cd frontend
npm install
cp .env.example .env
npm run dev          # http://localhost:5173
```

## API

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/auth/signup` | no | `{ name, email, password }` |
| POST | `/api/auth/login` | no | `{ email, password }` |
| GET | `/api/treks` | no | Query: `difficulty`, `maxDays`, `month` |
| GET | `/api/treks/:id` | no | |
| POST | `/api/bookings` | yes | `{ trekId, startDate, travelers }` |
| GET | `/api/bookings/mine` | yes | |
| DELETE | `/api/bookings/:id` | yes | |
| POST | `/api/plan` | no | `{ days, fitness, budget, month, travelers, notes }` |

## Project layout

```
backend/   Express API, planner tools, JSON-file store
frontend/  React + Vite single-page app
```

## Ideas to extend

- Replace the JSON store with PostgreSQL or MongoDB
- Add a map view with Leaflet
- Add an admin page to manage treks
- Add stays near each trek and let the planner include them
