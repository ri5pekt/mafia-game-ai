import "reflect-metadata";

// Load repo-local .env for non-Docker dev runs.
// (Docker Compose injects env vars directly, so this is a no-op there unless you mount a .env file.)
import * as fs from "node:fs";
import * as path from "node:path";
import "dotenv/config";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";

// If running from apps/api, dotenv will look for apps/api/.env by default.
// We prefer the repo-root ".env" (gitignored) so one file works for the whole monorepo.
try {
    const repoRootEnv = path.resolve(process.cwd(), "../../.env");
    if (fs.existsSync(repoRootEnv)) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require("dotenv").config({ path: repoRootEnv, override: false });
    }
} catch {
    // ignore
}

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    // Dev-friendly CORS so the Vite frontend (localhost:5173) can call the API (localhost:3000).
    app.enableCors({
        origin: true,
        credentials: true,
    });
    const port = Number(process.env.PORT ?? 3000);
    await app.listen(port);
}

bootstrap();
