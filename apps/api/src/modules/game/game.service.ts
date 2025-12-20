import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Subject } from 'rxjs';

import { DbService } from '../db/db.service';
import type { AppendEventRequest, CreateGameRequest, GameEvent, GameMeta } from './game.types';

function nowIso() {
  return new Date().toISOString();
}

function makeId() {
  return crypto.randomUUID();
}

@Injectable()
export class GameService {
  private readonly db: DbService;

  constructor(@Inject(DbService) db: DbService) {
    // NOTE: Explicit injection token for tsx/esbuild setups where decorator metadata may be missing.
    this.db = db;
  }

  private readonly streams = new Map<string, Subject<GameEvent>>();

  async createGame(req: CreateGameRequest): Promise<GameMeta> {
    if (!req?.players?.length) throw new BadRequestException('players is required');
    if (req.players.length !== 10) throw new BadRequestException('players must have exactly 10 entries');

    const id = makeId();
    const createdAt = nowIso();
    const players = [...req.players].sort((a, b) => a.seatNumber - b.seatNumber);

    const meta: GameMeta = {
      id,
      createdAt,
      players,
      host: req.host
    };

    // Always create a GAME_CREATED event as the first event.
    const createdEvent: GameEvent = {
      id: makeId(),
      type: 'GAME_CREATED',
      kind: 'system',
      createdAt: nowIso(),
      payload: { text: 'Game created.' }
    };

    await this.dbPersistGameAndEvents(meta, [createdEvent]);
    this.emitEvent(id, createdEvent);
    return meta;
  }

  async getActiveGameAsync(): Promise<GameMeta | null> {
    if (!this.db.enabled()) return null;
    const res = await this.db.client.query(
      `SELECT id, created_at, ended_at, players_json, host_json
       FROM games
       WHERE ended_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`
    );
    if (res.rowCount === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      createdAt: new Date(row.created_at).toISOString(),
      endedAt: row.ended_at ? new Date(row.ended_at).toISOString() : undefined,
      players: row.players_json,
      host: row.host_json
    };
  }

  async getGameMetaAsync(id: string): Promise<GameMeta> {
    if (!this.db.enabled()) throw new NotFoundException('Game not found');
    const res = await this.db.client.query(
      `SELECT id, created_at, ended_at, players_json, host_json
       FROM games WHERE id = $1`,
      [id]
    );
    if (res.rowCount === 0) throw new NotFoundException('Game not found');
    const row = res.rows[0];
    return {
      id: row.id,
      createdAt: new Date(row.created_at).toISOString(),
      endedAt: row.ended_at ? new Date(row.ended_at).toISOString() : undefined,
      players: row.players_json,
      host: row.host_json
    };
  }

  async listEventsAsync(gameId: string): Promise<GameEvent[]> {
    if (!this.db.enabled()) throw new NotFoundException('DB not available');
    const res = await this.db.client.query(
      `SELECT id, created_at, type, kind, payload_json
       FROM game_events
       WHERE game_id = $1
       ORDER BY created_at ASC`,
      [gameId]
    );
    return res.rows.map((r) => ({
      id: r.id,
      createdAt: new Date(r.created_at).toISOString(),
      type: r.type,
      kind: r.kind,
      payload: r.payload_json
    }));
  }

  async appendEventAsync(gameId: string, req: AppendEventRequest): Promise<GameEvent> {
    const meta = await this.getGameMetaAsync(gameId);
    if (meta.endedAt) throw new BadRequestException('Game has ended');

    // Minimal validation only (loop is frontend-owned).
    if (!req?.type) throw new BadRequestException('type is required');
    if (!req?.kind) throw new BadRequestException('kind is required');

    const ev: GameEvent = {
      id: makeId(),
      type: req.type,
      kind: req.kind,
      createdAt: nowIso(),
      payload: req.payload ?? {}
    };

    await this.dbPersistGameAndEvents(meta, [ev]);
    this.emitEvent(gameId, ev);
    return ev;
  }

  async endGameAsync(gameId: string): Promise<{ game: GameMeta; event: GameEvent }> {
    const meta = await this.getGameMetaAsync(gameId);
    if (meta.endedAt) {
      return {
        game: meta,
        event: {
          id: makeId(),
          type: 'GAME_ENDED',
          kind: 'system',
          createdAt: nowIso(),
          payload: { text: 'Game already ended.' }
        }
      };
    }

    const endedAt = nowIso();
    const endedEvent: GameEvent = {
      id: makeId(),
      type: 'GAME_ENDED',
      kind: 'system',
      createdAt: endedAt,
      payload: { text: 'Game ended.' }
    };

    const updated: GameMeta = { ...meta, endedAt };
    await this.dbPersistGameAndEvents(updated, [endedEvent]);
    this.emitEvent(gameId, endedEvent);
    return { game: updated, event: endedEvent };
  }

  streamEvents(gameId: string): Subject<GameEvent> {
    let s = this.streams.get(gameId);
    if (!s) {
      s = new Subject<GameEvent>();
      this.streams.set(gameId, s);
    }
    return s;
  }

  private emitEvent(gameId: string, ev: GameEvent) {
    const s = this.streams.get(gameId);
    s?.next(ev);
  }

  private async dbPersistGameAndEvents(meta: GameMeta, newEvents: GameEvent[]) {
    if (!this.db.enabled()) return;
    try {
      const client = await this.db.client.connect();
      try {
        await client.query('BEGIN');

        // Keep schema backward compatible: we populate phase/day/current_speaker with defaults (frontend is authoritative).
        await client.query(
          `INSERT INTO games (id, created_at, ended_at, phase_id, day_number, current_speaker_seat, players_json, host_json)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
           ON CONFLICT (id) DO UPDATE SET
             ended_at = EXCLUDED.ended_at,
             players_json = EXCLUDED.players_json,
             host_json = EXCLUDED.host_json`,
          [
            meta.id,
            meta.createdAt,
            meta.endedAt ?? null,
            'DAY_DISCUSSION',
            1,
            1,
            JSON.stringify(meta.players),
            JSON.stringify(meta.host)
          ]
        );

        for (const ev of newEvents) {
          await client.query(
            `INSERT INTO game_events (id, game_id, created_at, type, kind, payload_json)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb)
             ON CONFLICT (id) DO NOTHING`,
            [ev.id, meta.id, ev.createdAt, ev.type, ev.kind, JSON.stringify(ev.payload ?? {})]
          );
        }

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[dbPersistGameAndEvents] failed', e);
    }
  }
}


