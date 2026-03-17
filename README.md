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


