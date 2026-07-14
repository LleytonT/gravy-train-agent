/**
 * Read-only LinkedIn home feed capture.
 *
 * GUARDRAILS:
 * - Scroll only; never Like, Comment, Repost, Connect, or Message.
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

export interface CaptureLinkedInFeedOptions {
  dryRun?: boolean;
  maxItems?: number;
  context?: BrowserContext;
  headless?: boolean;
}

async function assertReadable(page: Page): Promise<void> {
  if (await detectCaptcha(page)) {
    throw new CaptureAbortError(
      'captcha',
      'linkedin',
      'Captcha detected on LinkedIn — aborting capture.',
    );
  }
  if (await detectLoginWall(page, 'linkedin')) {
    throw new CaptureAbortError(
      'login',
      'linkedin',
      'Login wall detected on LinkedIn — aborting capture.',
    );
  }
}

/**
 * Extract feed update cards from the current viewport.
 * LinkedIn class names change often — multiple fallback selectors.
 */
async function extractVisiblePosts(page: Page): Promise<CapturedItem[]> {
  const cards = page.locator(
    [
      'div.feed-shared-update-v2',
      'article[data-urn*="urn:li:activity"]',
      'div[data-urn*="urn:li:activity"]',
      'li.feed-shared-update-v2__commentary-content',
    ].join(', '),
  );

  const count = await cards.count();
  const items: CapturedItem[] = [];

  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);

    const author =
      (await card
        .locator('.update-components-actor__title span[aria-hidden="true"]')
        .first()
        .innerText()
        .catch(() => '')) ||
      (await card.locator('.feed-shared-actor__name span').first().innerText().catch(() => '')) ||
      (await card.locator('span.feed-shared-actor__name').first().innerText().catch(() => ''));

    const authorHeadline =
      (await card.locator('.update-components-actor__description').first().innerText().catch(() => null)) ||
      (await card.locator('.feed-shared-actor__description').first().innerText().catch(() => null));

    const rawText =
      (await card.locator('.feed-shared-update-v2__description').first().innerText().catch(() => '')) ||
      (await card.locator('.feed-shared-text').first().innerText().catch(() => '')) ||
      (await card.locator('span.break-words').first().innerText().catch(() => ''));

    const timeEl = card.locator('time').first();
    const postedAt =
      (await timeEl.getAttribute('datetime').catch(() => null)) ||
      (await card.locator('.update-components-actor__sub-description').first().innerText().catch(() => null));

    let url =
      (await card.locator('a[href*="/feed/update/"]').first().getAttribute('href').catch(() => null)) ||
      (await card.locator('a[href*="urn:li:activity"]').first().getAttribute('href').catch(() => null)) ||
      (await card.locator('a.app-aware-link[href*="linkedin.com"]').first().getAttribute('href').catch(() => null)) ||
      '';

    if (url.startsWith('/')) {
      url = `https://www.linkedin.com${url.split('?')[0]}`;
    }

    const authorClean = author.replace(/\s+/g, ' ').trim();
    const excerpt = truncateExcerpt(rawText);

    if (!authorClean && !excerpt && !url) continue;

    items.push({
      source: 'linkedin',
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
 * Gently scroll the LinkedIn feed once, collecting up to maxItems posts.
 */
export async function captureLinkedInFeed(
  opts: CaptureLinkedInFeedOptions = {},
): Promise<CapturedItem[]> {
  const maxItems = opts.maxItems ?? DEFAULT_MAX_ITEMS;
  const ownContext = !opts.context;
  const context = opts.context ?? (await launchBrowser({ headless: opts.headless }));
  const page = await getCapturePage(context);

  try {
    await page.goto('https://www.linkedin.com/feed/', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await randomDelay();
    await assertReadable(page);

    const collected: CapturedItem[] = [];
    let staleRounds = 0;

    while (collected.length < maxItems && staleRounds < 3) {
      const batch = dedupeItems(await extractVisiblePosts(page));
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
