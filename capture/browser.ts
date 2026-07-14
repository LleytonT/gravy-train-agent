/**
 * Shared Playwright browser helpers for read-only feed capture.
 *
 * GUARDRAILS: This module only launches browsers and detects blockers.
 * It never posts, likes, comments, follows, connects, or sends DMs.
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type BrowserContext, type Page } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Persistent profile directory — reuse across runs to keep login sessions. */
export function getProfileDir(): string {
  return process.env.CAPTURE_PROFILE_DIR ?? path.join(__dirname, '..', '.browser-profile');
}

export interface LaunchBrowserOptions {
  headless?: boolean;
}

/**
 * Launch Chromium with a persistent profile so logins survive between runs.
 * Run once in headed mode to authenticate manually, then reuse the profile.
 */
export async function launchBrowser(
  opts: LaunchBrowserOptions = {},
): Promise<BrowserContext> {
  const profileDir = getProfileDir();
  await mkdir(profileDir, { recursive: true });

  const headless = opts.headless ?? process.env.CAPTURE_HEADLESS !== '0';

  return chromium.launchPersistentContext(profileDir, {
    headless,
    viewport: { width: 1280, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    // Reduce automation fingerprinting; still read-only.
    args: ['--disable-blink-features=AutomationControlled'],
  });
}

/** Human-like pause between scroll steps (2–6 seconds, randomized). */
export function randomDelay(): Promise<void> {
  const ms = 2000 + Math.floor(Math.random() * 4001);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function truncateExcerpt(text: string, maxLen = 200): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen - 1)}…`;
}

/**
 * Heuristic login-wall detection. DOM changes frequently — treat as best-effort.
 * Returns true when the page likely requires authentication.
 */
export async function detectLoginWall(
  page: Page,
  source: 'linkedin' | 'x',
): Promise<boolean> {
  const url = page.url();

  if (source === 'x') {
    if (/x\.com\/(i\/flow\/login|login)/i.test(url) || /twitter\.com\/login/i.test(url)) {
      return true;
    }

    const signInVisible = await page
      .locator(
        [
          'a[data-testid="loginButton"]',
          'a[href="/login"]',
          'div[data-testid="sheetDialog"] input[autocomplete="username"]',
        ].join(', '),
      )
      .first()
      .isVisible()
      .catch(() => false);

    if (signInVisible) return true;

    // Home without any tweet articles often means logged out.
    const onHome = /x\.com\/home/i.test(url);
    if (onHome) {
      const tweetCount = await page.locator('article[data-testid="tweet"]').count();
      const loginPrompt = await page.getByText(/sign in to/i).first().isVisible().catch(() => false);
      if (tweetCount === 0 && loginPrompt) return true;
    }

    return false;
  }

  // LinkedIn
  if (
    /linkedin\.com\/(login|checkpoint|authwall|uas\/login)/i.test(url) ||
    /linkedin\.com\/signup/i.test(url)
  ) {
    return true;
  }

  const authForm = await page
    .locator(
      [
        'form.login__form',
        '#username',
        'input[name="session_key"]',
        'button[data-litms-control-urn="login-submit"]',
      ].join(', '),
    )
    .first()
    .isVisible()
    .catch(() => false);

  if (authForm) return true;

  const joinPrompt = await page
    .getByRole('heading', { name: /sign in|join linkedin/i })
    .first()
    .isVisible()
    .catch(() => false);

  return joinPrompt;
}

/**
 * Heuristic captcha / bot-challenge detection.
 * Abort immediately when detected — never retry aggressively.
 */
export async function detectCaptcha(page: Page): Promise<boolean> {
  const url = page.url();
  if (/challenges\.cloudflare\.com|captcha|arkose|funcaptcha/i.test(url)) {
    return true;
  }

  const captchaFrame = await page
    .locator(
      [
        'iframe[src*="recaptcha"]',
        'iframe[src*="hcaptcha"]',
        'iframe[src*="arkose"]',
        'iframe[title*="captcha" i]',
        '#captcha-internal',
        'div.g-recaptcha',
        'div.h-captcha',
      ].join(', '),
    )
    .first()
    .isVisible()
    .catch(() => false);

  if (captchaFrame) return true;

  const challengeText = await page
    .getByText(/verify you are human|complete the security check|unusual activity/i)
    .first()
    .isVisible()
    .catch(() => false);

  return challengeText;
}

/** Open or reuse a single tab for capture. */
export async function getCapturePage(context: BrowserContext): Promise<Page> {
  const existing = context.pages()[0];
  if (existing) return existing;
  return context.newPage();
}
