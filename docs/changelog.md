# Changelog

All notable changes to AI-GM Standalone will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-07-08

### 🎉 Initial Release

AI-GM Standalone v1.0.0 is the first stable release of the AI-powered visual novel RPG engine for desktop.

### ✨ Features

#### Core Engine
- **Visual Novel Engine** — Layered rendering system (Background, Sprite, Dialogue, Effect, Choice) with typewriter text animation, scene transitions, and real-time visual effects
- **Game State Machine** — Scene-to-scene flow control, event triggering, condition checks, and branching dialogue
- **Modular Module System** — JSON-based module format supporting scenes, NPCs, items, events, combat, and multiple endings

#### AI Integration
- **Multi-LLM Support** — Proxy support for OpenAI (GPT-4o / GPT-4o-mini), Claude (3.5 Sonnet), and Ollama (local models) via secure backend IPC
- **Streaming Chat** — Real-time streaming responses with SSE format parsing
- **Style Analyzer** — AI-powered text analysis to extract visual style configurations (palette, atmosphere, art style, lighting, mood keywords)
- **Module Generator** — Convert plain text stories into playable modules via AI text analysis and structured generation

#### Combat System
- **Turn-based Combat** — COC-style d100 check system with critical success (≤5), fumble (≥96), normal hit/miss
- **Action Types** — Attack, Skill, Item, Defend, Flee, Wait
- **Default Skill Library** — 8 built-in skills: Brawl, Firearm, Dodge, First Aid, Inspire, Aim, Desperate Strike, Intimidate
- **Status Effects** — Buff/debuff system with duration and stat modifiers
- **AI Enemy Behavior** — Priority targeting (lowest HP), random skill usage (30% chance)

#### Save System
- **Manual Save/Load** — Up to N slots with custom names and thumbnail screenshots
- **Auto-save** — Automatic save on scene transitions, combat starts, and key story events
- **Save Portability** — Complete campaign state preservation including player stats, inventory, scene history, NPC states, and VN engine snapshots

#### Image Management
- **Search** — Unsplash API integration with Picsum Photos fallback for royalty-free images
- **AI Generation** — DALL-E 3 integration for background (1792×1024) and sprite (1024×1792) generation
- **Local Upload** — Support for JPG, PNG, GIF, WebP, BMP via base64 encoding
- **Categorized Storage** — Automatic organization by type (bg / sprite / portrait / upload)

#### Module Management
- **Import/Export** — JSON format with file dialog support
- **CRUD Operations** — Create, read, update, delete modules via backend SQLite
- **Validation** — JSON structure validation on import

#### Settings & Customization
- **LLM Configuration** — Provider selection, model selection, API key secure storage (AES encrypted), base URL override
- **Image Configuration** — Unsplash API key, DALL-E key, default strategy selection
- **Game Settings** — Typewriter speed, font size, auto-advance delay, skip-unread toggle
- **Theme System** — Dark / Light / Auto mode with custom CSS variable support
- **Style Templates** — Save, load, and manage reusable visual style configurations

#### Desktop Integration
- **Electron Shell** — Cross-platform desktop app (Windows, macOS, Linux)
- **Auto-updater** — GitHub Releases-based automatic update checking and installation
- **Secure IPC** — Preload script isolation with contextIsolation enabled
- **User Data Directory** — Platform-specific data storage (`~/AI-GM` or system user data path)
- **Backend Auto-start** — Express server automatically launched and monitored by main process

#### UI/UX
- **Page Transitions** — Framer Motion powered slide animations between routes
- **Skeleton Loading** — Loading placeholders for async content
- **Toast Notifications** — Non-blocking status messages
- **Global Error Boundary** — Graceful error handling with recovery options
- **Responsive Layout** — Minimum window size 1000×600, supports fullscreen
- **In-Game Menu** — Pause overlay with Save, Load, Settings, Resume, Quit options

### 🛠️ Technical Stack

| Layer | Technology |
|-------|------------|
| Desktop | Electron 33+ |
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| State | Zustand with persist middleware |
| Animation | Framer Motion |
| Backend | Node.js + Express |
| Database | SQLite (better-sqlite3) |
| Auto-update | electron-updater |

### 📦 Distribution

- **Windows** — NSIS installer (.exe) + Portable (.exe)
- **macOS** — DMG (.dmg) + ZIP (.zip), Universal (x64 + arm64)
- **Linux** — AppImage + DEB package

### 📝 Documentation

- `docs/user-manual.md` — Complete user operation guide (installation, module import, gameplay, saves, settings)
- `docs/developer-guide.md` — Developer guide (architecture, API, extending combat skills)
- `docs/changelog.md` — This file

### 🚧 Known Issues

- Claude streaming is not yet supported (use non-streaming mode for Claude)
- macOS Gatekeeper may require manual approval on first launch (unsigned build)
- Large image files (>10MB) may cause memory pressure during gameplay
- Ollama requires local installation and manual model download (`ollama pull llama3.2`)

---

## Planned

### [1.1.0] — Audio & Polish
- Background music and SFX system
- Voice synthesis integration (TTS)
- Enhanced animation system (custom character animations)
- Module marketplace / sharing platform

### [1.2.0] — Advanced RPG
- Character creation wizard
- Inventory UI with drag-and-drop
- Skill tree / progression system
- Multi-language support (i18n)

### [2.0.0] — Multiplayer
- LAN multiplayer co-op mode
- Real-time GM assistant
- Shared session state synchronization

---

> Last updated: 2026-07-08
