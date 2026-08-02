import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import {
  drizzle,
  type NeonHttpDatabase,
} from "drizzle-orm/neon-http";

import { schema, sourceItems, type Schema } from "./schema.js";

export type Database = NeonHttpDatabase<Schema> & {
  $client: NeonQueryFunction<false, false>;
};

let dbInstance: Database | null = null;

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required. Provision Neon through Vercel Marketplace and pull the project environment before using the database.",
    );
  }
  if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    throw new Error(
      "DATABASE_URL must be a Postgres connection string. Local SQLite/libSQL and /tmp database fallbacks are no longer supported.",
    );
  }
  return databaseUrl;
}

/**
 * Lazily creates the database client so `next build` and Eve discovery do not
 * require runtime credentials while evaluating modules.
 */
export function getDb(): Database {
  if (!dbInstance) {
    const client = neon(requireDatabaseUrl());
    dbInstance = drizzle(client, { schema });
  }
  return dbInstance;
}

/**
 * Transitional compatibility for existing tools. Schema creation is migration
 * managed; this function only verifies that the configured database is alive.
 */
export async function ensureSchema(): Promise<void> {
  const db = getDb();
  try {
    // `visibility` arrived in the latest structural migration and acts as a
    // sentinel for a fully migrated GS-001 schema.
    await db
      .select({ visibility: sourceItems.visibility })
      .from(sourceItems)
      .limit(0);
    const triggers = await db.execute<{ triggerName: string }>(
      sql`select tgname as "triggerName"
            from pg_trigger
           where tgname = 'trg_opportunity_evidence_ownership'
             and not tgisinternal`,
    );
    if (triggers.rows.length !== 1) {
      throw new Error("latest ownership migration is missing");
    }
  } catch (error) {
    throw new Error(
      "Database schema is unavailable or out of date. Run `pnpm db:migrate` before serving traffic.",
      { cause: error },
    );
  }
}
