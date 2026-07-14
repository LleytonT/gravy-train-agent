import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { schema, type Schema } from "./schema.js";

const DEFAULT_DATABASE_URL = "file:./data/gravy-scout.db";

let dbInstance: (LibSQLDatabase<Schema> & { $client: Client }) | null = null;
let clientInstance: Client | null = null;

function resolveDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

function ensureDataDirectory(databaseUrl: string): void {
  if (!databaseUrl.startsWith("file:")) {
    return;
  }

  const filePath = databaseUrl.slice("file:".length);
  const absolutePath = resolve(process.cwd(), filePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
}

function createDbClient(): Client {
  const url = resolveDatabaseUrl();
  ensureDataDirectory(url);
  return createClient({ url });
}

export function getDb(): LibSQLDatabase<Schema> & { $client: Client } {
  if (!dbInstance) {
    clientInstance = createDbClient();
    dbInstance = drizzle(clientInstance, { schema });
  }
  return dbInstance;
}

export async function ensureSchema(): Promise<void> {
  const db = getDb();

  await db.$client.batch([
    `CREATE TABLE IF NOT EXISTS raw_items (
      id TEXT PRIMARY KEY NOT NULL,
      source TEXT NOT NULL,
      author TEXT NOT NULL,
      author_headline TEXT,
      excerpt TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      url_hash TEXT NOT NULL,
      posted_at TEXT,
      captured_at TEXT NOT NULL,
      processed INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      aliases TEXT NOT NULL DEFAULT '[]',
      website TEXT,
      category TEXT,
      watchlist_tier TEXT NOT NULL DEFAULT 'warm',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS signals (
      id TEXT PRIMARY KEY NOT NULL,
      company_id TEXT NOT NULL REFERENCES companies(id),
      type TEXT NOT NULL,
      direction TEXT NOT NULL,
      strength INTEGER NOT NULL,
      summary TEXT NOT NULL,
      source_url TEXT,
      excerpt TEXT,
      observed_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS people_watchlist (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      current_company TEXT,
      why_watched TEXT,
      source_url TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY NOT NULL,
      company_id TEXT NOT NULL REFERENCES companies(id),
      headline TEXT NOT NULL,
      score REAL NOT NULL,
      pinged_at TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS run_logs (
      id TEXT PRIMARY KEY NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      summary TEXT,
      items_processed INTEGER NOT NULL DEFAULT 0,
      signals_found INTEGER NOT NULL DEFAULT 0,
      pings_sent INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_raw_items_processed ON raw_items(processed)`,
    `CREATE INDEX IF NOT EXISTS idx_signals_company_id ON signals(company_id)`,
    `CREATE INDEX IF NOT EXISTS idx_signals_observed_at ON signals(observed_at)`,
    `CREATE INDEX IF NOT EXISTS idx_opportunities_company_id ON opportunities(company_id)`,
    `CREATE INDEX IF NOT EXISTS idx_companies_watchlist_tier ON companies(watchlist_tier)`,
  ]);
}
