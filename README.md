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

Planned top‑level structure:

- `frontend/` – Next.js application (chat UI, auth, settings).
- `backend/` – NestJS application (agent, tools, APIs).
- `README.md` – this file.

---

## Running locally

1. **Database** (optional for chat UI only; needed for memory): `docker compose up -d` from the repo root, then in `backend/` run `npm run db:migrate` with `DATABASE_URL` set.

2. **Backend** (`backend/`): copy `.env.example` → `.env`, set `GEMINI_API_KEY` and `DATABASE_URL` if using memory. Run `npm run start:dev` (default port **4000**).

3. **Frontend** (`frontend/`): copy `.env.local.example` → `.env.local` and set `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000`. Run `npm run dev` (default port **3000**).

Open [http://localhost:3000](http://localhost:3000). The app stores a **session id** in `localStorage` (so the backend can tie memory + conversations to the same browser profile); **chat messages** are loaded from the API / database, not from the browser cache.

4. **Google OAuth (optional)** — To connect Gmail + Calendar for your session, follow **`docs/oauth-google-setup.md`**, set the Google vars in `backend/.env`, run `npm run db:migrate`, then use **Connect Google** on the chat screen.

---


