/**
 * Read-only X (Twitter) home timeline capture.
 *
 * GUARDRAILS:
 * - Scroll only; never click Like, Repost, Reply, Follow, or Post.
 * - Abort on login wall or captcha (no aggressive retries).
 * - Store derived fields + source URL + timestamp + excerpt ≤200 chars.
 */

import type { BrowserContext, Page } from 'playwright';
import {
  detectCaptcha,
  detectLoginWall,
  getCapturePage,
  launchBrowser,
  randomDelay,
  truncateExcerpt,
} from './browser.js';
import {
  CaptureAbortError,
  DEFAULT_MAX_ITEMS,
  type CapturedItem,
} from './types.js';

export interface CaptureXFeedOptions {
  dryRun?: boolean;
  maxItems?: number;
  /** Reuse an existing browser context (e.g. from run-capture orchestrator). */
  context?: BrowserContext;
  headless?: boolean;
  /** When true, try switching to the Following tab after loading home (read-only navigation). */
  includeFollowing?: boolean;
}

async function assertReadable(page: Page): Promise<void> {
  if (await detectCaptcha(page)) {
    throw new CaptureAbortError('captcha', 'x', 'Captcha detected on X — aborting capture.');
  }
  if (await detectLoginWall(page, 'x')) {
    throw new CaptureAbortError('login', 'x', 'Login wall detected on X — aborting capture.');
  }
}

/**
 * Optionally switch to the Following tab. Tab labels/DOM change often.
 * Failure is non-fatal — we continue with whatever timeline is visible.
 */
async function tryFollowingTab(page: Page): Promise<void> {
  const followingTab = page.locator(
    [
      'a[role="tab"]:has-text("Following")',
      'div[role="tablist"] a:has-text("Following")',
      '[data-testid="ScrollSnap-List"] a:has-text("Following")',
    ].join(', '),
  );

  if (await followingTab.first().isVisible().catch(() => false)) {
    await followingTab.first().click({ timeout: 5000 }).catch(() => undefined);
    await randomDelay();
  }
}

/**
 * Extract tweet cards currently in the DOM.
 * Selectors are best-effort — X changes data-testid attributes frequently.
 */
async function extractVisibleTweets(page: Page): Promise<CapturedItem[]> {
  // Primary: tweet articles; fallback: any article with a status link.
  const cards = page.locator('article[data-testid="tweet"], article:has(a[href*="/status/"])');
  const count = await cards.count();
  const items: CapturedItem[] = [];

  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);

    const author =
      (await card.locator('[data-testid="User-Name"] span').first().innerText().catch(() => '')) ||
      (await card.locator('div[data-testid="User-Names"] span').first().innerText().catch(() => '')) ||
      (await card.locator('a[role="link"] span').first().innerText().catch(() => ''));

    const authorHeadline =
      (await card.locator('[data-testid="User-Name"] + div span').first().innerText().catch(() => null)) ||
      (await card.locator('div[data-testid="User-Names"] ~ div span').first().innerText().catch(() => null));

    const rawText =
      (await card.locator('[data-testid="tweetText"]').first().innerText().catch(() => '')) ||
      (await card.locator('div[lang]').first().innerText().catch(() => ''));

    const timeEl = card.locator('time').first();
    const postedAt =
      (await timeEl.getAttribute('datetime').catch(() => null)) ||
      (await timeEl.innerText().catch(() => null));

    let url =
      (await card.locator('a[href*="/status/"]').first().getAttribute('href').catch(() => null)) ??
      '';

    if (url.startsWith('/')) {
      url = `https://x.com${url.split('?')[0]}`;
    }

    const authorClean = author.replace(/\s+/g, ' ').trim();
    const excerpt = truncateExcerpt(rawText);

    if (!authorClean && !excerpt && !url) continue;

    items.push({
      source: 'x',
      author: authorClean || 'unknown',
      authorHeadline: authorHeadline?.replace(/\s+/g, ' ').trim() || null,
      excerpt,
      url: url || page.url(),
      postedAt,
    });
  }

  return items;
}

function dedupeItems(items: CapturedItem[]): CapturedItem[] {
  const seen = new Set<string>();
  const out: CapturedItem[] = [];
  for (const item of items) {
    const key = item.url || `${item.author}::${item.excerpt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Gently scroll the home feed once, collecting up to maxItems tweet cards.
 */
export async function captureXFeed(opts: CaptureXFeedOptions = {}): Promise<CapturedItem[]> {
  const maxItems = opts.maxItems ?? DEFAULT_MAX_ITEMS;
  const ownContext = !opts.context;
  const context = opts.context ?? (await launchBrowser({ headless: opts.headless }));
  const page = await getCapturePage(context);

  try {
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await randomDelay();
    await assertReadable(page);

    if (opts.includeFollowing !== false) {
      await tryFollowingTab(page);
      await assertReadable(page);
    }

    const collected: CapturedItem[] = [];
    let staleRounds = 0;

    // One gentle scroll session: incremental scroll + pause until cap or no new items.
    while (collected.length < maxItems && staleRounds < 3) {
      const batch = dedupeItems(await extractVisibleTweets(page));
      const before = collected.length;

      for (const item of batch) {
        if (collected.length >= maxItems) break;
        const key = item.url || `${item.author}::${item.excerpt}`;
        if (!collected.some((c) => (c.url || `${c.author}::${c.excerpt}`) === key)) {
          collected.push(item);
        }
      }

      if (collected.length === before) {
        staleRounds += 1;
      } else {
        staleRounds = 0;
      }

      if (collected.length >= maxItems) break;

      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.85));
      await randomDelay();
      await assertReadable(page);
    }

    return collected.slice(0, maxItems);
  } finally {
    if (ownContext) {
      await context.close().catch(() => undefined);
    }
  }
}
