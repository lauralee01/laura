# laura – Personalized AI Agent

laura is a full‑stack web application that gives each user a **personal AI agent**. It can understand goals, plan tasks, use tools (email and calendar), and build long‑term memory to become more helpful over time.

---

## High‑Level Features (MVP)

- **Goal‑based chat** – natural language interface for requests like:
  - “Plan my week around these events…”
  - “Draft an email to my manager about our progress.”
  - “Set a reminder to prepare slides on Thursday at 4pm.”
- **Email integration**
  - Connect a user’s email account (e.g. Gmail via OAuth).
  - Draft emails (subject + body) from natural‑language prompts.
  - Optionally create drafts or send via the email provider.
- **Calendar integration**
  - Connect a calendar account (e.g. Google Calendar via OAuth).
  - Create events and reminders from natural‑language commands.
- **Long‑term memory**
  - Store important user facts and preferences in Postgres + embeddings.
  - Retrieve memories to personalize future responses.
- **Agent loop**
  - Simple **plan → act → respond** loop with tool calling.

---

## Tech Stack

- **Frontend**: Next.js (React) – chat UI and dashboard.
- **Backend**: NestJS – agent loop, tools, APIs.
- **LLM**: Gemini.
- **Database**: Postgres (Neon).
- **Embeddings**: used for semantic memory and personalization.
- **Integrations**:
  - Email API (e.g. Gmail).
  - Calendar API (e.g. Google Calendar).

---

## Project Structure

- `frontend/` – Next.js application (chat UI).
- `backend/` – NestJS application (agent, tools, APIs).
- `README.md` – this file.

---

## Documentation

| Doc | What it covers |
|-----|----------------|
| **Production deploy:** Neon (Postgres), Render (Nest API), Vercel (Next.js), env vars, migrations, smoke tests. |
| Google OAuth, cookie-based session, `GOOGLE_REDIRECT_URI`, tool routes. |
| `backend/.env.example` | Backend environment variables. |
| `frontend/.env.local.example` | Frontend env (`NEXT_PUBLIC_API_BASE_URL`). |

---

## Running locally

1. **Database** (optional for chat UI only; needed for memory): `docker compose up -d` from the repo root, then in `backend/` run `npm run db:migrate` with `DATABASE_URL` set.

2. **Backend** (`backend/`): copy `.env.example` → `.env`, set `GEMINI_API_KEY` and `DATABASE_URL` if using memory. Run `npm run start:dev` (default port **4000**).

3. **Frontend** (`frontend/`): copy `.env.local.example` → `.env.local` and set `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000`. Run `npm run dev` (default port **3000**).

Open [http://localhost:3000](http://localhost:3000). The backend issues an anonymous **HttpOnly cookie** (`laura_session`) after `GET /session`; the frontend calls the API with **`credentials: 'include'`** so memory, conversations, and Google OAuth stay tied to the same browser. **Chat messages** load from the API / database, not from browser cache. For split origins in production, configure **`CORS_ORIGIN`** and **`SESSION_COOKIE_SAME_SITE`** on the backend (see `backend/.env.example`).

4. **Google OAuth (optional)** — Create a Google Cloud project, OAuth client, and enabled APIs (Gmail, Calendar). Set the Google-related variables in `backend/.env` (see `backend/.env.example`), run `npm run db:migrate` so OAuth tables exist, then use **Connect Google** in the app.

---

## Deployment (MVP)

Stack in production:

| Layer | Platform | Role |
|--------|----------|------|
| UI | **Vercel** | Next.js from repo **`frontend/`** |
| API | **Render** | NestJS from repo **`backend/`** (root directory `backend`) |
| Database | **Neon** | Serverless Postgres; **`DATABASE_URL`** only on Render |


### Checklist (summary)

1. **Neon** — Create a project, copy the Postgres connection string (`sslmode=require` as needed).
2. **Render** — Web Service, **Root Directory** `backend`, build `npm install && npm run build`, start `npm run start:prod` (runs `node dist/src/main.js`). Set **`DATABASE_URL`**, **`GEMINI_*`**, **`GOOGLE_*`**, **`GOOGLE_REDIRECT_URI`** (`https://<your-service>.onrender.com/integrations/google/callback`), **`FRONTEND_URL`** (Vercel URL), **`CORS_ORIGIN`**, **`SESSION_COOKIE_SAME_SITE=none`** for cross-origin cookies.
3. **Vercel** — Import repo, **Root Directory** `frontend`, **`NEXT_PUBLIC_API_BASE_URL`** = your Render API origin (HTTPS, no trailing slash).
4. **Migrations** — From `backend/`: `DATABASE_URL='<neon-url>' npm run db:migrate` (does not run automatically on deploy unless you add it).
5. **Google Cloud** — OAuth client: **Authorized redirect URIs** = Render callback URL; **Authorized JavaScript origins** = Vercel URL (and `http://localhost:3000` for local dev).

---


