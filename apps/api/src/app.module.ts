import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { DbModule } from './modules/db/db.module';
import { EventsModule } from './modules/events/events.module';
import { GameModule } from './modules/game/game.module';

@Module({
  imports: [DbModule, GameModule, EventsModule],
  controllers: [HealthController]
})
export class AppModule {}


