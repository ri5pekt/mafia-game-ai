import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";

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
