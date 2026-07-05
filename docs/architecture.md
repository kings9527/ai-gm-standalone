# AI-GM Standalone Architecture

## Overview
AI-GM standalone — a browser-based RPG engine powered by LLM. Built for Cthulhu TRPG and extensible to other systems.

**Split from SillyTavern plugin**: engine logic preserved, UI rewritten, storage upgraded to PostgreSQL.

## Tech Stack

| Layer | Tech | Reason |
|-------|------|--------|
| Frontend | React 18 + Tailwind CSS + Zustand | Component-rich UI, fast styling, lightweight state |
| Backend | Node.js + Express | Engine code migrated from plugin, ESM modules |
| Database | PostgreSQL + pgvector | JSONB for flexible character cards, pgvector for context retrieval |
| LLM | Direct provider (OpenAI/Claude/Ollama) | Independence first; ST bridge as optional adapter |
| Dev | Docker Compose + Vite HMR | One-command start, fast frontend dev |

## Project Structure

```
ai-gm-standalone/
├── docker-compose.yml          # PostgreSQL + backend + frontend
├── .env.example                # Environment variables template
├── docs/
│   ├── architecture.md         # This file
│   ├── user-manual.md          # Player guide (TODO)
│   └── module-format.md        # Module/campaign schema (TODO)
├── backend/
│   ├── package.json
│   ├── src/
│   │   ├── index.js            # Express server entry
│   │   ├── config.js           # Environment + defaults
│   │   ├── routes/             # API routes
│   │   │   ├── health.js
│   │   │   ├── campaigns.js
│   │   │   ├── characters.js
│   │   │   ├── dice.js
│   │   │   ├── combat.js
│   │   │   ├── state.js
│   │   │   └── llm.js
│   │   ├── engine/             # Migrated from plugin/engine/
│   │   │   ├── dice.js
│   │   │   ├── rule-engine.js
│   │   │   ├── state-machine.js
│   │   │   ├── combat-tracker.js
│   │   │   ├── npc-decision.js
│   │   │   └── module-parser.js
│   │   ├── storage/            # PostgreSQL persistence
│   │   │   ├── campaign-pg.js
│   │   │   ├── character-pg.js
│   │   │   └── chat-pg.js
│   │   ├── models/             # Database schema + queries
│   │   │   └── schema.sql
│   │   ├── llm/                # Migrated from plugin/utils/llm-client.js
│   │   │   ├── client.js
│   │   │   ├── providers/
│   │   │   │   ├── openai.js
│   │   │   │   ├── claude.js
│   │   │   │   ├── ollama.js
│   │   │   │   └── st-bridge.js
│   │   │   └── cache.js
│   │   └── utils/              # Shared utilities
│   │       ├── sanitize.js     # Migrated from plugin/utils/
│   │       └── prompt-builder.js
│   └── test/                   # Engine + API tests
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── src/
│   │   ├── main.tsx            # React entry
│   │   ├── App.tsx             # Router + layout
│   │   ├── components/         # Game UI components
│   │   │   ├── SceneRenderer.tsx
│   │   │   ├── CombatPanel.tsx
│   │   │   ├── NpcCard.tsx
│   │   │   ├── DiceRoller.tsx
│   │   │   ├── ChatLog.tsx
│   │   │   ├── SaveSlot.tsx
│   │   │   └── LlmConfig.tsx
│   │   ├── stores/             # Zustand stores
│   │   │   ├── gameStore.ts
│   │   │   ├── combatStore.ts
│   │   │   └── llmStore.ts
│   │   ├── api/                # Backend API clients
│   │   │   └── client.ts
│   │   └── types/              # TypeScript interfaces
│   │       └── index.ts
│   └── public/
│       └── index.html
└── test/
    └── e2e/                    # End-to-end tests (TODO)
```

## Engine Migration Plan

| Source (plugin) | Target (standalone) | Action |
|-----------------|---------------------|--------|
| `plugin/engine/dice.js` | `backend/src/engine/dice.js` | Copy + adjust ESM imports |
| `plugin/engine/rule-engine.js` | `backend/src/engine/rule-engine.js` | Copy + adjust ESM imports |
| `plugin/engine/state-machine.js` | `backend/src/engine/state-machine.js` | Copy + remove ST bridge coupling |
| `plugin/engine/combat-tracker.js` | `backend/src/engine/combat-tracker.js` | Copy + adjust ESM imports |
| `plugin/engine/npc-decision.js` | `backend/src/engine/npc-decision.js` | Copy + adjust LLM client import |
| `plugin/engine/module-parser.js` | `backend/src/engine/module-parser.js` | Copy + adjust ESM imports |
| `plugin/utils/llm-client.js` | `backend/src/llm/client.js` | Copy + split providers into files |
| `plugin/utils/sanitize.js` | `backend/src/utils/sanitize.js` | Copy directly |
| `plugin/utils/prompt-builder.js` | `backend/src/utils/prompt-builder.js` | Copy directly |

**No business logic changes** — all engine tests preserved.

## UI Rewrite Plan

| Source (plugin) | Target (standalone) | Framework |
|-----------------|---------------------|-----------|
| `plugin/ui/panel.js` | `frontend/src/components/CombatPanel.tsx` + `SceneRenderer.tsx` | React + Tailwind |
| `plugin/ui/game-controller.js` | `frontend/src/stores/gameStore.ts` + `api/client.ts` | Zustand + fetch |
| `plugin/ui/npc-card.js` | `frontend/src/components/NpcCard.tsx` | React + framer-motion |
| `plugin/ui/scene-renderer.js` | `frontend/src/components/SceneRenderer.tsx` | React + Tailwind gradients |
| `plugin/index.js` (frontend) | `frontend/src/App.tsx` | React Router |
| `plugin/index.js` (backend) | `backend/src/routes/*.js` | Express |

## Database Schema (Phase 1)

### Tables

- `campaigns` — campaign ID, name, module_id, player_stats, current_scene, state, created_at, updated_at
- `characters` — character ID, name, avatar_url, stats (JSONB), personality (JSONB), dialogue_style (JSONB)
- `chats` — chat ID, campaign_id, character_id, role, content, type, created_at
- `snapshots` — save slot, campaign_id, label, state (JSONB), created_at
- `vectors` — document_id, embedding (vector), content, metadata (JSONB) — for context retrieval
- `modules` — module_id, name, version, system, content (JSONB), created_at

### Vector Retrieval

Uses `pgvector` extension. Chunking strategy mirrors ST's approach: 512 tokens per chunk, 50 overlap.

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/health` | GET | Server status |
| `/campaigns` | POST/GET/PUT/DELETE | CRUD campaigns |
| `/characters` | POST/GET/PUT/DELETE | CRUD character cards |
| `/dice/roll` | POST | Roll dice via engine |
| `/combat/init` | POST | Initialize combat |
| `/combat/action` | POST | Combat action |
| `/state/action` | POST | Process player action |
| `/state/transition` | POST | Scene transition |
| `/llm/config` | GET/POST | LLM configuration |
| `/llm/test` | POST | Test LLM connectivity |
| `/llm/chat` | POST | Direct LLM chat |
| `/llm/complete` | POST | LLM completion |
| `/save` | POST | Save snapshot |
| `/save/list` | GET | List snapshots |
| `/load` | POST | Load snapshot |

## Environment Variables

```
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/aigm
LLM_PROVIDER=openai
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini
LLM_BASE_URL=https://api.openai.com/v1
LLM_TEMPERATURE=0.7
LLM_MAX_TOKENS=2048
LLM_TIMEOUT=30000
LLM_RETRIES=2
ST_BRIDGE_URL=             # Optional: SillyTavern proxy URL
```

## Development Workflow

```bash
# 1. Start infrastructure
cd ai-gm-standalone
docker-compose up -d db

# 2. Start backend (terminal 1)
cd backend
npm install
npm run dev

# 3. Start frontend (terminal 2)
cd frontend
npm install
npm run dev

# 4. Open browser
open http://localhost:5173
```

## Milestones

| Phase | Target | Date |
|-------|--------|------|
| Day 1 | Skeleton + engine migration + DB schema | 2026-07-06 |
| Day 2 | Backend API + frontend React skeleton | 2026-07-07 |
| Day 3 | Character system + LLM integration | 2026-07-08 |
| Day 4 | Scene renderer + combat UI | 2026-07-09 |
| Day 5 | Save/load + vector retrieval | 2026-07-10 |
| Day 6 | Module parser + campaign creation | 2026-07-11 |
| Day 7 | E2E test + documentation | 2026-07-12 |
| Day 8 | Polish + Docker production build | 2026-07-13 |

---
*Architecture v1.0 — 2026-07-06*
