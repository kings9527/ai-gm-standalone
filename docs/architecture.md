# AI-GM Standalone Architecture

## Project: AI-Powered Visual Novel RPG Engine

A visual novel engine where players upload a story, an AI asks follow-up questions, and generates a complete TRPG module. The game plays like a visual novel with dynamic backgrounds, character sprites, and dialogue.

---

## Tech Stack

| Layer | Tech | Reason |
|-------|------|--------|
| Frontend | React 18 + Vite + TypeScript | Fast dev, component-based |
| State | Zustand | Lightweight, no boilerplate |
| Animation | framer-motion | Sprite transitions, dialogue effects |
| Styling | Tailwind CSS | Dynamic theme application |
| Storage | IndexedDB (localforage) | Pure frontend, offline capable |
| LLM | Direct API (OpenAI/Claude/Ollama) | Player provides key |
| Image | Unsplash/Pexels search (default) | Free, no API key needed |

---

## Architecture (Pure Frontend)

```
ai-gm-standalone/
├── frontend/
│   ├── src/
│   │   ├── engine/                 ← Visual Novel Engine Core
│   │   │   ├── dice.ts             ← Dice roller (from old project)
│   │   │   ├── rule-engine.ts      ← TRPG rules (from old project)
│   │   │   ├── state-machine.ts    ← Game state + scene transitions (from old project, ST decoupled)
│   │   │   └── npc-decision.ts     ← NPC AI behavior (from old project)
│   │   ├── components/engine/      ← Visual Novel UI Layers
│   │   │   ├── VisualNovelEngine.tsx    ← Main orchestrator (BG → Sprite → Dialogue → Effect)
│   │   │   ├── BackgroundLayer.tsx      ← Scene backgrounds + transitions
│   │   │   ├── SpriteLayer.tsx          ← Character sprites (position, expression, fade)
│   │   │   ├── DialogueLayer.tsx        ← Dialogue box + typewriter + choices
│   │   │   └── EffectLayer.tsx          ← Screen effects (shake, grain, vignette)
│   │   ├── components/generator/   ← Module Generator
│   │   │   ├── Uploader.tsx        ← Story upload (text/markdown/image)
│   │   │   ├── QuestionFlow.tsx    ← AI follow-up questions (visual novel style)
│   │   │   └── Preview.tsx         ← Module preview (scene tree + character cards)
│   │   ├── llm/                    ← LLM Client (from old project)
│   │   │   ├── client.ts           ← Unified LLM client (OpenAI/Claude/Ollama)
│   │   │   ├── prompts.ts          ← Prompt builder (from old project)
│   │   │   └── style-analyzer.ts   ← Text → style.json (AI analysis)
│   │   ├── utils/                  ← Utilities (from old project)
│   │   │   ├── sanitize.ts         ← XSS prevention + input validation
│   │   │   └── storage.ts          ← IndexedDB wrapper (modules/saves/images)
│   │   ├── modshare/               ← Module Import/Export
│   │   │   ├── exporter.ts         ← Export module → JSON file
│   │   │   └── importer.ts         ← Import JSON → playable module
│   │   ├── stores/                 ← Zustand Stores
│   │   │   ├── gameStore.ts        ← Game state (current scene, player, campaign)
│   │   │   ├── moduleStore.ts      ← Module data (scenes, NPCs, items)
│   │   │   └── settingsStore.ts    ← AI config, image preferences, theme
│   │   ├── types/                  ← TypeScript Types
│   │   │   ├── module.ts           ← Module JSON schema types
│   │   │   ├── engine.ts           ← Visual novel engine types
│   │   │   └── llm.ts              ← LLM client types
│   │   ├── App.tsx                 ← Main app (router: home/generator/play/settings)
│   │   └── main.tsx                ← Entry point
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── tailwind.config.js
└── docs/
    └── architecture.md               ← This file
```

---

## Module JSON Format

```typescript
interface Module {
  id: string;
  name: string;
  system: 'coc' | 'dnd5e' | 'custom';
  version: string;
  style: StyleConfig;           // ← AI-generated from text analysis
  start_scene: string;
  scenes: Record<string, Scene>;
  npcs: Record<string, NPC>;
  items: Record<string, Item>;
  events: Record<string, Event>;
}

interface StyleConfig {
  palette: {
    bg: string;          // Background gradient/color
    accent: string;      // UI accent
    text: string;        // Text color
    dialogue_bg: string; // Dialogue box background
  };
  atmosphere: string;     // 'horror', 'mystery', 'adventure', 'slice_of_life'
  era: string;           // 'victorian', 'modern', 'fantasy', 'sci-fi'
  art_style: string;     // 'dark_realistic', 'anime', 'pixel', 'watercolor'
  lighting: string;      // 'oil_lamp', 'neon', 'daylight', 'moonlight'
  mood_keywords: string[];
  font_family: string;
  effects: string[];     // 'grain', 'vignette', 'chromatic_aberration'
  image_strategy: {
    background: 'search' | 'generate' | 'upload';
    sprites: 'search' | 'generate' | 'upload';
    search_provider: 'unsplash' | 'pexels';
  };
}

interface Scene {
  id: string;
  title: string;
  description: string;
  bg: string;            // Background image URL or CSS gradient
  bg_music?: string;     // Optional music URL
  sprites: SpritePlacement[];
  dialogue: DialogueEntry;
  choices: Choice[];
  exits: Exit[];
  interactables: string[];
  npcs: string[];
  combat?: CombatConfig;
  ending?: EndingConfig;
  events?: string[];     // Event IDs to trigger
}

interface SpritePlacement {
  char_id: string;
  position: 'left' | 'center' | 'right';
  expression: string;    // 'normal', 'smile', 'serious', 'angry', 'scared'
  enter_animation: 'fade' | 'slide_left' | 'slide_right' | 'none';
}

interface DialogueEntry {
  speaker: string | null;  // null = narrator
  text: string;
  typewriter: boolean;     // true = character-by-character
  voice?: string;          // Optional TTS voice
}

interface Choice {
  id: string;
  text: string;
  condition?: Condition;   // Show only if condition met
  action: 'next' | 'scene' | 'dice_check' | 'combat' | 'custom';
  target?: string;         // scene_id or custom action data
  dice_check?: { skill: string; target: number };
}

interface Exit {
  target: string;          // scene_id
  label: string;
  description?: string;
  condition?: Condition;
}

interface Condition {
  [key: string]: number | boolean | string | [number, number];
}
```

---

## Game Flow

```
Player opens website
    │
    ├─→ [Home] Upload story / Import module / Continue saved game
    │
    ├─→ [Generator] Upload → AI text analysis → AI questions (5-10 rounds)
    │                    → Generate module.json → Preview → Play
    │
    └─→ [Play] Visual Novel Engine renders:
         - BackgroundLayer: scene.bg (search/generate/upload)
         - SpriteLayer: character sprites (position + expression + enter animation)
         - DialogueLayer: speaker name + typewriter text + choice buttons
         - EffectLayer: transitions + screen effects
```

---

## Image Strategy (Per Player Preference)

| Strategy | Backend | Cost | Quality |
|----------|---------|------|---------|
| **AI Search (default)** | Unsplash/Pexels API | Free | Generic but good |
| **AI Generate** | OpenAI DALL-E / SD | $0.02-0.04/image | Custom, perfect fit |
| **Player Upload** | None (IndexedDB) | Free | Best for custom characters |

AI analyzes text → generates keywords → searches/downloads → displays.
Player can override any image by uploading their own.

---

## LLM Integration

```
Player input (text upload)
    │
    ▼
[AI: Text Analysis] → style.json (atmosphere, era, palette, art_style)
    │
    ▼
[AI: Question Flow] → 5-10 rounds of follow-up questions
    │                    (visual novel style: BG + sprite + dialogue box)
    ▼
[AI: Module Generation] → module.json (scenes, NPCs, choices, exits)
    │
    ▼
[AI: Image Keywords] → background search prompts + sprite search prompts
    │
    ▼
[Visual Novel Engine] → renders module.json
```

LLM Providers: OpenAI (GPT-4o-mini default), Claude, Ollama (local, free).
Player configures API key in Settings. No backend required.

---

## 10-Day Development Timeline (7/6 → 7/16)

| Day | Date | Focus | Deliverable |
|-----|------|-------|-------------|
| 1 | 7/6 | Architecture + Engine Migration | Skeleton + 4 engine files ported |
| 2 | 7/7 | Visual Novel Layers | BG + Sprite + Dialogue + Effect layers working |
| 3 | 7/8 | State Machine Integration | Scene transitions, choices, exits working |
| 4 | 7/9 | Module Generator (Upload + AI Analysis) | Upload text → AI analyzes → style.json |
| 5 | 7/10 | AI Question Flow | Visual novel style Q&A → module.json preview |
| 6 | 7/11 | Image System | Search + generate + upload all working |
| 7 | 7/12 | Module Import/Export + Storage | JSON export/import, IndexedDB saves |
| 8 | 7/13 | Combat Plugin (optional) | Battle UI overlay |
| 9 | 7/14 | Polish + Animations | Smooth transitions, effects, typewriter polish |
| 10 | 7/15 | Testing + Bug Fixes | Full playthrough test |
| 11 | 7/16 | Buffer/Release | Final fixes, GitHub release |

---

## Reused from Old Project (sillytavern-ai-gm/plugin)

| File | Lines | Migration Effort | New Location |
|------|-------|------------------|--------------|
| `engine/dice.js` | ~150 | Direct copy (change import/export) | `engine/dice.ts` |
| `engine/rule-engine.js` | ~200 | Direct copy | `engine/rule-engine.ts` |
| `engine/state-machine.js` | ~600 | Remove ST bridge, keep core logic | `engine/state-machine.ts` |
| `engine/npc-decision.js` | ~500 | Direct copy (already decoupled) | `engine/npc-decision.ts` |
| `utils/llm-client.js` | ~450 | Remove ST proxy, keep OpenAI/Claude/Ollama | `llm/client.ts` |
| `utils/prompt-builder.js` | ~150 | Direct copy | `llm/prompts.ts` |
| `utils/sanitize.js` | ~100 | Direct copy | `utils/sanitize.ts` |
| **Total** | **~2,150** | **~1 day** | **7 files** |

New code to write: ~3,000 lines (Visual Novel UI + Generator + Storage + Types + App).

---

## Key Decisions

1. **Pure Frontend**: No backend, no Docker, no PostgreSQL. Everything in browser.
2. **AI Search Default**: Unsplash API is free, no key needed, works immediately.
3. **Player Upload**: Any image can be replaced by player upload (IndexedDB storage).
4. **Style from Text**: AI analyzes uploaded story to determine visual style automatically.
5. **Module JSON**: Portable format, can be shared as JSON file or URL hash.
6. **Combat as Plugin**: Not in core engine. Optional overlay for battle scenes.

---

*Last updated: 2026-07-06*
