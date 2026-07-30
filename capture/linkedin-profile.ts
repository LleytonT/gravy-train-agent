/**
 * Read-only LinkedIn *own profile* capture for personalization.
 *
 * GUARDRAILS (same as feed capture):
 * - Never Like, Comment, Connect, Message, or edit the profile.
 * - Abort on login wall / captcha.
 * - Store derived fields only (name, headline, title, company, location, URL).
 */

import type { BrowserContext, Page } from "playwright";
import {
  detectCaptcha,
  detectLoginWall,
  getCapturePage,
  launchBrowser,
  randomDelay,
} from "./browser.js";
import { CaptureAbortError } from "./types.js";

export type CapturedLinkedInProfile = {
  name: string | null;
  headline: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  location: string | null;
  linkedInUrl: string | null;
  summary: string | null;
};

export interface CaptureLinkedInProfileOptions {
  /** Profile URL; defaults to LinkedIn "me" redirect. */
  profileUrl?: string;
  dryRun?: boolean;
  context?: BrowserContext;
  headless?: boolean;
}

async function assertReadable(page: Page): Promise<void> {
  if (await detectCaptcha(page)) {
    throw new CaptureAbortError(
      "captcha",
      "linkedin",
      "Captcha detected on LinkedIn profile — aborting.",
    );
  }
  if (await detectLoginWall(page, "linkedin")) {
    throw new CaptureAbortError(
      "login",
      "linkedin",
      "Login wall detected on LinkedIn profile — aborting.",
    );
  }
}

function parseHeadline(headline: string | null): {
  currentTitle: string | null;
  currentCompany: string | null;
} {
  if (!headline) {
    return { currentTitle: null, currentCompany: null };
  }
  const cleaned = headline.replace(/\s+/g, " ").trim();
  const at = cleaned.match(/^(.+?)\s+at\s+(.+)$/i);
  if (at) {
    return {
      currentTitle: at[1]!.trim(),
      currentCompany: at[2]!.trim().split("|")[0]!.trim(),
    };
  }
  const pipe = cleaned.split("|")[0]?.trim() ?? cleaned;
  return { currentTitle: pipe || null, currentCompany: null };
}

/**
 * Scrape the logged-in user's LinkedIn profile (read-only).
 */
export async function captureLinkedInProfile(
  opts: CaptureLinkedInProfileOptions = {},
): Promise<CapturedLinkedInProfile> {
  const ownContext = !opts.context;
  const context =
    opts.context ?? (await launchBrowser({ headless: opts.headless }));
  const page = await getCapturePage(context);

  try {
    const startUrl = opts.profileUrl ?? "https://www.linkedin.com/in/me/";
    await page.goto(startUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await randomDelay();
    await assertReadable(page);

    // Experience section often has structured title/company if headline is vague
    const name =
      (await page
        .locator("h1")
        .first()
        .innerText()
        .catch(() => null)) ||
      (await page
        .locator(".text-heading-xlarge")
        .first()
        .innerText()
        .catch(() => null));

    const headline =
      (await page
        .locator(".text-body-medium.break-words")
        .first()
        .innerText()
        .catch(() => null)) ||
      (await page
        .locator("[data-generated-suggestion-target]")
        .first()
        .innerText()
        .catch(() => null));

    const location =
      (await page
        .locator(".text-body-small.inline.t-black--light.break-words")
        .first()
        .innerText()
        .catch(() => null)) ||
      (await page
        .locator("span.text-body-small.inline")
        .first()
        .innerText()
        .catch(() => null));

    const about =
      (await page
        .locator("#about ~ .display-flex .inline-show-more-text")
        .first()
        .innerText()
        .catch(() => null)) ||
      (await page
        .locator("section.pv-about-section")
        .first()
        .innerText()
        .catch(() => null));

    // First experience row
    const expTitle =
      (await page
        .locator("#experience ~ div .mr1.hoverable-link-text span[aria-hidden='true']")
        .first()
        .innerText()
        .catch(() => null)) ||
      (await page
        .locator("section#experience-section li .t-16.t-black.t-bold")
        .first()
        .innerText()
        .catch(() => null));

    const expCompany =
      (await page
        .locator("#experience ~ div .t-14.t-normal span[aria-hidden='true']")
        .first()
        .innerText()
        .catch(() => null)) || null;

    const fromHeadline = parseHeadline(headline);
    const currentTitle = expTitle?.trim() || fromHeadline.currentTitle;
    const currentCompany =
      expCompany?.split("·")[0]?.trim() || fromHeadline.currentCompany;

    const linkedInUrl = page.url().split("?")[0] ?? null;

    return {
      name: name?.replace(/\s+/g, " ").trim() || null,
      headline: headline?.replace(/\s+/g, " ").trim() || null,
      currentTitle: currentTitle?.replace(/\s+/g, " ").trim() || null,
      currentCompany: currentCompany?.replace(/\s+/g, " ").trim() || null,
      location: location?.replace(/\s+/g, " ").trim() || null,
      linkedInUrl,
      summary: about?.replace(/\s+/g, " ").trim().slice(0, 500) || null,
    };
  } finally {
    if (ownContext) {
      await context.close().catch(() => undefined);
    }
  }
}
