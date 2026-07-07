# 🧠 Laura

Laura is a full-stack AI agent that understands natural language, reasons about user intent, remembers user preferences and autonomously uses tools like Gmail, Google Calendar, long-term memory and web search to complete real-world tasks.

Rather than simply generating text, Laura plans actions, selects the appropriate tools, executes them, and responds with grounded, context-aware answers.

---

## ✨ Features

- 🧠 Natural language understanding
- 🤖 Autonomous tool selection and orchestration
- 📧 Gmail integration (read, draft, send and search emails)
- 📅 Google Calendar integration
- 🌍 Live web search for up-to-date information
- 📍 Location-aware search for nearby places and businesses
- 💾 Long-term memory using semantic retrieval
- 💬 Persistent conversations and session management
- 🔐 Secure Google OAuth authentication
- ⚡ Structured LLM outputs for reliable tool execution

---

## 💬 Example Requests

Laura can understand requests like:

- "Email Sarah thanking her for yesterday's interview."
- "Schedule lunch with James next Tuesday at noon."
- "Find coffee shops near me that are open now."
- "Remember that I prefer React over Angular."
- "What's the latest news about OpenAI?"

Laura automatically determines which tools are required and executes them before responding.

---

## ⚙️ How Laura Works

Each message follows an AI reasoning pipeline before a response is generated.

```text
User Message
      │
      ▼
Conversation Context
      │
      ▼
Intent Detection
      │
      ▼
Planning
      │
      ▼
Tool Selection
      │
      ▼
Tool Execution
      │
      ▼
Memory Retrieval / Update
      │
      ▼
Final Response
```

---

## 🏗️ Architecture

```text
             Next.js Frontend
                    │
                    ▼
             NestJS Backend
                    │
                    ▼
              Agent Runtime
                    │
      ┌─────────────┼─────────────┐
      │             │             │
      ▼             ▼             ▼
 Intent Engine   Memory Engine  Tool Orchestrator
      │             │             │
      ▼             ▼             ▼
    Gemini      PostgreSQL    Gmail
                              Calendar
                              Web Search
```

---

## 🛠️ Tech Stack

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS

### Backend

- NestJS
- TypeScript
- PostgreSQL

### AI

- Gemini
- Embeddings
- Semantic Memory
- Tool Calling
- Structured Output

### Infrastructure

- Vercel
- Render
- Neon PostgreSQL

---

## 📂 Project Structure

```
frontend/     Next.js application
backend/      NestJS API and AI agent
README.md
```

---

## 🚀 Running Locally

### 1. Start the database

```bash
docker compose up -d
```

Run database migrations:

```bash
cd backend
npm run db:migrate
```

### 2. Start the backend

```bash
cd backend
cp .env.example .env
```

Configure:

- `DATABASE_URL`
- `GEMINI_API_KEY`
- `GOOGLE_OAUTH_*`
- `GOOGLE_REDIRECT_URI` 
- `TAVILY_API_KEY`


Start the server:

```bash
npm run start:dev
```

Backend runs on **http://localhost:4000**

---

### 3. Start the frontend

```bash
cd frontend
cp .env.local.example .env.local
```

Configure:

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

Start:

```bash
npm run dev
```

Frontend runs on **http://localhost:3000**

---

### 4. Google OAuth (Optional)

Enable the Gmail and Google Calendar APIs in Google Cloud, configure the Google OAuth environment variables, and connect your Google account to allow Laura to securely access Gmail and Google Calendar.

---

## 🚀 Deployment

| Layer | Platform |
|--------|----------|
| Frontend | Vercel |
| Backend | Render |
| Database | Neon PostgreSQL |

---


