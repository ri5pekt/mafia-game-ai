# Environment variables

Do **not** commit real secrets to git.

## OpenAI

- **`OPENAI_API_KEY`**: your OpenAI API key (keep it in a local `.env` / secret manager).

### Local (PowerShell)

Set for the current terminal session:

```powershell
$env:OPENAI_API_KEY="YOUR_KEY_HERE"
```

### Docker Compose

Prefer injecting secrets via your shell environment or a local `.env` file (gitignored), then reference it in `docker/docker-compose.yml` using Compose env var substitution.


