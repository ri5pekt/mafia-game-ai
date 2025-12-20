import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  private pool: Pool | null = null;

  get client() {
    if (!this.pool) throw new Error('DB not initialized');
    return this.pool;
  }

  async onModuleInit() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      this.logger.warn('DATABASE_URL is not set; DB persistence will be disabled.');
      return;
    }

    this.pool = new Pool({ connectionString });
    await this.pool.query('SELECT 1');
    await this.ensureSchema();
    this.logger.log('DB connected and schema ensured.');
  }

  async onModuleDestroy() {
    if (this.pool) await this.pool.end().catch(() => undefined);
    this.pool = null;
  }

  enabled() {
    return Boolean(this.pool);
  }

  private async ensureSchema() {
    // Idempotent schema creation (lightweight, dev-friendly).
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL,
        ended_at TIMESTAMPTZ NULL,
        phase_id TEXT NOT NULL,
        day_number INT NOT NULL,
        current_speaker_seat INT NOT NULL,
        players_json JSONB NOT NULL,
        host_json JSONB NOT NULL
      );
    `);

    await this.client.query(`
      CREATE TABLE IF NOT EXISTS game_events (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL,
        type TEXT NOT NULL,
        kind TEXT NOT NULL,
        payload_json JSONB NOT NULL
      );
    `);

    await this.client.query(`CREATE INDEX IF NOT EXISTS game_events_game_id_created_at_idx ON game_events(game_id, created_at);`);
    await this.client.query(`CREATE INDEX IF NOT EXISTS games_created_at_idx ON games(created_at DESC);`);
    await this.client.query(`CREATE INDEX IF NOT EXISTS games_ended_at_idx ON games(ended_at);`);
  }
}


