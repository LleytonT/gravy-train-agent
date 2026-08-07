#!/usr/bin/env node
/**
 * CLI entry for read-only feed capture (LinkedIn + X).
 *
 * Usage:
 *   tsx capture/run-capture.ts [--dry-run] [--source=x|linkedin|all] [--headed]
 *
 * GUARDRAILS: Orchestrates scroll-only capture. Never posts or engages.
 */

import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './browser.js';
import { captureLinkedInFeed } from './linkedin-feed.js';
import { CaptureAbortError, type CapturedItem, type FeedSource } from './types.js';
import { captureXFeed } from './x-feed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

config({
  path: [
    path.join(__dirname, "..", ".env.local"),
    path.join(__dirname, "..", ".env"),
  ],
});

type SourceArg = 'x' | 'linkedin' | 'all';

interface CliOptions {
  dryRun: boolean;
  source: SourceArg;
  headed: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  let dryRun = false;
  let source: SourceArg = 'all';
  let headed = false;

  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--headed') headed = true;
    else if (arg.startsWith('--source=')) {
      const value = arg.slice('--source='.length) as SourceArg;
      if (value !== 'x' && value !== 'linkedin' && value !== 'all') {
        console.error(`Invalid --source value: ${value} (expected x, linkedin, or all)`);
        process.exit(1);
      }
      source = value;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return { dryRun, source, headed };
}

function printHelp(): void {
  console.log(`Gravy Scout feed capture (read-only)

Usage:
  tsx capture/run-capture.ts [options]

Options:
  --dry-run           Print captured items without writing to DB
  --source=x|linkedin|all   Which feed to capture (default: all)
  --headed            Run browser with UI (for first-time login)
  --help, -h          Show this help

Environment:
  CAPTURE_PROFILE_DIR   Persistent Chromium profile path (default: ./.browser-profile)
  CAPTURE_SYNC_URL      Optional remote sync endpoint
  CAPTURE_SYNC_TOKEN    Bearer token for sync endpoint
  SYNC_ONLY=1           Skip local DB write; POST to sync URL only
`);
}

async function persistItems(items: CapturedItem[]): Promise<number> {
  if (items.length === 0) return 0;

  const syncOnly = process.env.SYNC_ONLY === '1';
  let inserted = 0;

  if (!syncOnly) {
    const { ensureSchema } = await import('../agent/lib/db/client.js');
    const { repo } = await import('../agent/lib/db/repo.js');
    await ensureSchema();
    inserted = await repo.insertRawItems(
      items.map((item) => ({
        source: item.source,
        author: item.author,
        authorHeadline: item.authorHeadline ?? null,
        excerpt: item.excerpt,
        url: item.url,
        postedAt: item.postedAt ?? null,
      })),
    );
  }

  await syncItems(items);
  return inserted;
}

async function syncItems(items: CapturedItem[]): Promise<void> {
  const url = process.env.CAPTURE_SYNC_URL;
  const token = process.env.CAPTURE_SYNC_TOKEN;
  if (!url || !token || items.length === 0) return;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ items }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Sync failed (${res.status}): ${body.slice(0, 200)}`);
  }

  console.log(`[sync] Posted ${items.length} item(s) to ${url}`);
}

interface SourceResult {
  source: FeedSource;
  items: CapturedItem[];
  aborted?: CaptureAbortError;
}

async function runSource(
  source: FeedSource,
  opts: CliOptions,
  context: Awaited<ReturnType<typeof launchBrowser>>,
): Promise<SourceResult> {
  try {
    const captureOpts = {
      dryRun: opts.dryRun,
      context,
      headless: !opts.headed,
    };

    const items =
      source === 'linkedin'
        ? await captureLinkedInFeed(captureOpts)
        : await captureXFeed(captureOpts);

    return { source, items };
  } catch (err) {
    if (err instanceof CaptureAbortError) {
      console.error(`[${source}] ABORT: ${err.message}`);
      return { source, items: [], aborted: err };
    }
    throw err;
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const sources: FeedSource[] =
    opts.source === 'all' ? ['linkedin', 'x'] : [opts.source === 'linkedin' ? 'linkedin' : 'x'];

  console.log(
    `[capture] starting — sources=${sources.join(',')} dryRun=${opts.dryRun} headed=${opts.headed}`,
  );

  const context = await launchBrowser({ headless: !opts.headed });
  const results: SourceResult[] = [];

  try {
    for (const source of sources) {
      console.log(`[capture] ${source}…`);
      const result = await runSource(source, opts, context);
      results.push(result);

      if (!opts.dryRun && result.items.length > 0) {
        const inserted = await persistItems(result.items);
        console.log(`[capture] ${source}: saved ${inserted} item(s) locally`);
      }
    }
  } finally {
    await context.close().catch(() => undefined);
  }

  const totalCaptured = results.reduce((n, r) => n + r.items.length, 0);
  const aborts = results.filter((r) => r.aborted);

  console.log('\n--- capture summary ---');
  for (const r of results) {
    const status = r.aborted ? `ABORTED (${r.aborted.reason})` : 'ok';
    console.log(`  ${r.source}: ${r.items.length} item(s) [${status}]`);
  }
  console.log(`  total: ${totalCaptured} item(s)`);

  if (opts.dryRun) {
    console.log('\n[dry-run] items (not written to DB):');
    for (const r of results) {
      for (const item of r.items) {
        console.log(JSON.stringify(item));
      }
    }
  }

  if (aborts.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[capture] fatal:', err);
  process.exit(1);
});
