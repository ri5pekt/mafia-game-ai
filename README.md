# AI-Driven Mafia Game Simulator

This repository is a **scaffolded monorepo skeleton** for an AI-driven Mafia game. **Gameplay logic and AI are not implemented yet.**

---

## Full specification (as provided)

You are generating a monorepo skeleton for an AI-driven Mafia game.
Do NOT implement gameplay logic yet.
Only scaffold the project, Docker config, and a basic frontend screen that renders a game table background image with positioned player avatars and a chat window.

Use PrimeVue 4.4.1 with Aura theme for UI components (panels, dialogs, buttons, scroll areas).

Save this full specification into README.md at the repo root.

Project: AI-Driven Mafia Game Simulator
Goal

Build a web-based Mafia game simulator where 10 AI-controlled players play autonomously.
The frontend initially shows a game table view with avatars and a chat/event log.

Tech Stack
Frontend

Vue 3
Vite
TypeScript
PrimeVue 4.4.1
PrimeVue Aura theme
No other UI libraries

Backend

NestJS + TypeScript (skeleton only)

Infra

Redis (docker)
Postgres (docker)
Docker Compose
pnpm workspaces

Monorepo Structure

/apps
/web (Vue 3 + Vite + TS + PrimeVue)
/api (NestJS + TS)
/worker (NestJS or minimal TS worker)
/packages
/shared (shared types, placeholders)
/docker
docker-compose.yml
README.md

Package Manager

Use pnpm workspaces

Root scripts:

dev:web

dev:api

dev:worker

dev:infra

Docker Compose

Create docker/docker-compose.yml with:

postgres

port 5432

volume for data

redis

port 6379

Backend services may exist but are optional for first run

Frontend Requirements (IMPORTANT)
PrimeVue setup

Install PrimeVue 4.4.1

Use Aura theme

Configure globally in main.ts

Enable:

Button

Dialog

ScrollPanel

Card

InputText

Divider

Example components usage is encouraged but minimal.

Main Game Screen

When running apps/web with Vite, show a single screen:

Layout

Left sidebar (chat panel) – fixed width ~320px

Right main area – game table

Use CSS Grid or Flexbox.

Chat Panel (PrimeVue-based)

Use Card or styled container

Scrollable messages area (ScrollPanel)

Static mock messages (array in component)

Input field + Send button (non-functional placeholder)

Chat shows:

HOST messages

Player messages

System events

Game Table Area

Background image:
apps/web/src/assets/game-bg.png

Centered table image

position: relative container

Avatars

Create PlayerAvatar.vue

Circular avatar

Shows:

Initials (P1…P10, HOST)

Name label

HOST avatar:

Larger

Positioned bottom-center

Label “HOST”

Avatar positions (percent-based)

P1: top 12%, left 50%

P2: top 18%, left 70%

P3: top 35%, left 82%

P4: top 55%, left 82%

P5: top 72%, left 70%

P6: top 78%, left 50% (leave space for host)

P7: top 72%, left 30%

P8: top 55%, left 18%

P9: top 35%, left 18%

P10: top 18%, left 30%

HOST: top 90%, left 50%

Use absolute positioning relative to the table container.

Frontend Files to Create

GameScreen.vue (main view)

PlayerAvatar.vue

ChatPanel.vue

App.vue mounts GameScreen

main.ts sets up PrimeVue + Aura

Backend Skeleton
API (NestJS)

GET /health → { ok: true }

Modules:

GameModule

EventsModule

No logic yet

Worker

Logs \"worker alive\" on start

Placeholder service only

Shared Package

Create minimal placeholder types:

export type PlayerId = string;
export type Role = 'MAFIA' | 'SHERIFF' | 'TOWN';
export type GamePhase = 'DAY' | 'NIGHT';

export interface GameEvent {
id: string;
type: string;
payload: any;
}

README.md Must Include

Project overview

Stack

Folder structure

How to run:

pnpm install
pnpm dev:infra
pnpm dev:web

Note that gameplay & AI are not implemented yet

Constraints

Do NOT implement OpenAI calls

Do NOT implement game logic

UI must render even if backend is offline

Keep code clean and readable

Prefer composition API in Vue

Deliverable

Fully scaffolded monorepo

PrimeVue correctly installed and themed

Vite dev server shows:

Table background

Avatars

Chat panel with mock messages

Final note

Assume the image file exists at:

apps/web/src/assets/game-bg.png

Do not generate the image.

---

## Quickstart

### Prereqs

-   **Node.js 20+**
-   **pnpm** (install via `npm i -g pnpm`)
-   **Docker Desktop** (for Postgres/Redis)

### Install

```bash
pnpm install
```

### Run infra (Postgres + Redis)

```bash
pnpm dev:infra
```

### Run frontend

```bash
pnpm dev:web
```

### Notes

-   **Backend is optional for first run**; the UI renders even if API/worker are offline.
-   **No gameplay/AI/OpenAI logic is implemented** in this scaffold.

---

## Dev workflow note (Dockerized backend)

Recommended dev workflow:

-   Run **Postgres + Redis + API + Worker** in Docker Compose
-   Run **Vue (Vite) locally** for fast HMR
