import { Module } from "@nestjs/common";

import { HealthController } from "./health.controller";
import { AiModule } from "./modules/ai/ai.module";
import { DbModule } from "./modules/db/db.module";
import { EventsModule } from "./modules/events/events.module";
import { GameModule } from "./modules/game/game.module";
import { TtsModule } from "./modules/tts/tts.module";

@Module({
    imports: [DbModule, GameModule, EventsModule, AiModule, TtsModule],
    controllers: [HealthController],
})
export class AppModule {}
