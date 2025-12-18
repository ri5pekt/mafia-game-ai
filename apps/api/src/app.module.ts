import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { EventsModule } from './modules/events/events.module';
import { GameModule } from './modules/game/game.module';

@Module({
  imports: [GameModule, EventsModule],
  controllers: [HealthController]
})
export class AppModule {}


