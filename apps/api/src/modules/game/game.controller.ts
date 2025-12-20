import { Body, Controller, Get, Inject, Param, Post, Query, Sse } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { map, merge, of, interval } from 'rxjs';

import type { AppendEventRequest, CreateGameRequest } from './game.types';
import { GameService } from './game.service';

@Controller('game')
export class GameController {
  private readonly game: GameService;

  constructor(@Inject(GameService) game: GameService) {
    // NOTE: Explicit assignment instead of TS "parameter properties".
    // In some tsx/esbuild decorator setups, parameter properties may not be initialized as expected at runtime.
    this.game = game;
  }

  @Post()
  async create(@Body() body: CreateGameRequest) {
    return await this.game.createGame(body);
  }

  @Get('active')
  async active() {
    return await this.game.getActiveGameAsync();
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return await this.game.getGameMetaAsync(id);
  }

  @Sse(':id/stream')
  stream(@Param('id') id: string) {
    // Push appended events as SSE "event" events.
    const updates$ = this.game.streamEvents(id).pipe(map((ev) => ({ type: 'event', event: ev })));
    const init$ = of({ type: 'hello', ts: Date.now() });
    const keepAlive$ = interval(15000).pipe(map(() => ({ type: 'ping', ts: Date.now() })));

    return merge(init$, updates$, keepAlive$).pipe(
      map((payload): MessageEvent => ({
        type: payload.type,
        data: payload
      }))
    );
  }

  @Get(':id/events')
  async events(@Param('id') id: string) {
    return await this.game.listEventsAsync(id);
  }

  @Post(':id/events')
  async append(@Param('id') id: string, @Body() body: AppendEventRequest) {
    return await this.game.appendEventAsync(id, body);
  }

  @Post(':id/end')
  async end(@Param('id') id: string) {
    return await this.game.endGameAsync(id);
  }
}


