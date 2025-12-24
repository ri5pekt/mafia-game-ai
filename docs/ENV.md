# Environment variables

Do **not** commit real secrets to git.

## OpenAI

- **`OPENAI_API_KEY`**: your OpenAI API key (keep it in a local `.env` / secret manager).

### Project-local `.env` (recommended)

1. Copy `ENV.example` to `.env` in the repo root.

PowerShell:

```powershell
Copy-Item ENV.example .env
```

2. Edit `.env` and set:

```bash
OPENAI_API_KEY=YOUR_KEY_HERE
OPENAI_MODEL=gpt-5-nano
```

### Local (PowerShell)

Set for the current terminal session:

```powershell
$env:OPENAI_API_KEY="YOUR_KEY_HERE"
```

### Docker Compose

This repo runs Compose with `-f docker/docker-compose.yml`, so we explicitly pass the repo-root `.env`:

```bash
docker compose --env-file .env -p mafia-game-ai -f docker/docker-compose.yml up -d
```

Prefer injecting secrets via your shell environment or a local `.env` file (gitignored), then reference it in `docker/docker-compose.yml` using Compose env var substitution.


