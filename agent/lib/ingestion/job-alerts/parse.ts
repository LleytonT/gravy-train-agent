/**
 * Fixture-driven parsers for LinkedIn, Seek, Indeed, and generic job alerts.
 * Adapters emit ParsedJobListing only — never provider webhook shapes.
 */

import type {
  JobAlertParseResult,
  JobBoard,
  ParsedJobListing,
} from "../types.js";
import { clipExcerpt } from "../retention.js";

export type JobAlertMessage = {
  from: string;
  subject: string;
  text?: string | null;
  html?: string | null;
};

const LINKEDIN_FROM = /linkedin\.com|linkedin\.email|notifications-noreply@linkedin/i;
const SEEK_FROM = /seek\.com\.au|seek\.com|noreply@seek/i;
const INDEED_FROM = /indeed\.com|noreply@indeed/i;

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function bodyText(message: JobAlertMessage): string {
  if (message.text?.trim()) return message.text;
  if (message.html?.trim()) return stripTags(message.html);
  return "";
}

function extractUrls(raw: string): string[] {
  const matches = raw.match(/https?:\/\/[^\s"'<>]+/gi) ?? [];
  return matches.map((url) => url.replace(/[),.;]+$/, ""));
}

function detectBoard(message: JobAlertMessage): JobBoard {
  const from = message.from ?? "";
  const subject = message.subject ?? "";
  if (LINKEDIN_FROM.test(from) || /linkedin job|jobs for you/i.test(subject)) {
    return "linkedin";
  }
  if (SEEK_FROM.test(from) || /\bseek\b/i.test(subject)) {
    return "seek";
  }
  if (INDEED_FROM.test(from) || /\bindeed\b/i.test(subject)) {
    return "indeed";
  }
  return "generic";
}

function uniqueListings(listings: ParsedJobListing[]): ParsedJobListing[] {
  const seen = new Set<string>();
  const out: ParsedJobListing[] = [];
  for (const listing of listings) {
    const key = `${listing.url ?? ""}|${listing.title}|${listing.company ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(listing);
  }
  return out;
}

function parseLinkedIn(message: JobAlertMessage): ParsedJobListing[] {
  const html = message.html ?? "";
  const listings: ParsedJobListing[] = [];

  // LinkedIn alert cards often use job title anchors.
  const cardRe =
    /<a[^>]+href="(https?:\/\/(?:www\.)?linkedin\.com\/jobs\/view\/[^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,400}?(?:at|·)\s*([A-Za-z0-9][^<\n]{1,80})/gi;
  let match: RegExpExecArray | null;
  while ((match = cardRe.exec(html)) !== null) {
    const title = stripTags(match[2] ?? "").trim();
    const company = (match[3] ?? "").trim();
    if (!title) continue;
    listings.push({
      board: "linkedin",
      title,
      company: company || undefined,
      url: match[1],
      excerpt: clipExcerpt(`${title}${company ? ` at ${company}` : ""}`),
    });
  }

  if (listings.length > 0) return uniqueListings(listings);

  // Text fallback: "Title at Company" near a jobs/view URL.
  const text = bodyText(message);
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const urls = extractUrls(text).filter((url) => /linkedin\.com\/jobs\/view\//i.test(url));
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const atMatch = line.match(/^(.+?)\s+at\s+(.+)$/i);
    if (!atMatch) continue;
    const url = urls[listings.length] ?? urls[0];
    listings.push({
      board: "linkedin",
      title: atMatch[1]!.trim(),
      company: atMatch[2]!.trim(),
      url,
      excerpt: clipExcerpt(line),
    });
  }
  return uniqueListings(listings);
}

function parseSeek(message: JobAlertMessage): ParsedJobListing[] {
  const html = message.html ?? "";
  const listings: ParsedJobListing[] = [];
  const cardRe =
    /<a[^>]+href="(https?:\/\/(?:www\.)?seek\.[^"]+\/job\/[^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,500}?([A-Za-z0-9][^<\n]{1,80})\s*(?:-|·|\|)\s*([A-Za-z][^<\n]{1,80})/gi;
  let match: RegExpExecArray | null;
  while ((match = cardRe.exec(html)) !== null) {
    const title = stripTags(match[2] ?? "").trim();
    if (!title) continue;
    listings.push({
      board: "seek",
      title,
      company: (match[3] ?? "").trim() || undefined,
      location: (match[4] ?? "").trim() || undefined,
      url: match[1],
      excerpt: clipExcerpt(
        `${title}${(match[3] ? ` · ${match[3]}` : "")}${(match[4] ? ` · ${match[4]}` : "")}`,
      ),
    });
  }
  if (listings.length > 0) return uniqueListings(listings);

  const text = bodyText(message);
  const urls = extractUrls(text).filter((url) => /seek\./i.test(url) && /\/job\//i.test(url));
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const m = line.match(/^(.+?)\s+[·|-]\s+(.+?)\s+[·|-]\s+(.+)$/);
    if (!m) continue;
    listings.push({
      board: "seek",
      title: m[1]!.trim(),
      company: m[2]!.trim(),
      location: m[3]!.trim(),
      url: urls[listings.length],
      excerpt: clipExcerpt(line),
    });
  }
  return uniqueListings(listings);
}

function parseIndeed(message: JobAlertMessage): ParsedJobListing[] {
  const html = message.html ?? "";
  const listings: ParsedJobListing[] = [];
  const cardRe =
    /<a[^>]+href="(https?:\/\/(?:[\w-]+\.)?indeed\.[^"]+\/(?:viewjob|rc\/clk)[^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,400}?([A-Za-z0-9][^<\n]{1,60}?)\s*[-–]\s*([A-Za-z][^<\n]{1,80})/gi;
  let match: RegExpExecArray | null;
  while ((match = cardRe.exec(html)) !== null) {
    const title = stripTags(match[2] ?? "").trim();
    if (!title) continue;
    listings.push({
      board: "indeed",
      title,
      company: (match[3] ?? "").trim() || undefined,
      location: (match[4] ?? "").trim() || undefined,
      url: match[1],
      excerpt: clipExcerpt(
        `${title}${(match[3] ? ` — ${match[3]}` : "")}${(match[4] ? ` — ${match[4]}` : "")}`,
      ),
    });
  }
  if (listings.length > 0) return uniqueListings(listings);

  const text = bodyText(message);
  const urls = extractUrls(text).filter((url) => /indeed\./i.test(url));
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    // Prefer "Title" line followed by "Company – Location".
    const next = lines[i + 1];
    if (next && !/^https?:/i.test(line) && /[-–]/.test(next)) {
      const companyLoc = next.match(/^(.+?)\s+[-–]\s+(.+)$/);
      if (companyLoc && line.length < 80) {
        listings.push({
          board: "indeed",
          title: line,
          company: companyLoc[1]!.trim(),
          location: companyLoc[2]!.trim(),
          url: urls[listings.length],
          excerpt: clipExcerpt(`${line} — ${next}`),
        });
        i += 1;
        continue;
      }
    }
    const m = line.match(/^(.+?)\s+[-–]\s+(.+?)(?:\s+[-–]\s+(.+))?$/);
    if (!m || m[1]!.length > 80) continue;
    listings.push({
      board: "indeed",
      title: m[1]!.trim(),
      company: m[2]!.trim(),
      location: m[3]?.trim(),
      url: urls[listings.length],
      excerpt: clipExcerpt(line),
    });
  }
  return uniqueListings(listings);
}

function parseGeneric(message: JobAlertMessage): ParsedJobListing[] {
  const text = bodyText(message);
  const urls = extractUrls(text).filter((url) =>
    /job|careers|greenhouse|lever\.co|ashbyhq|workday|boards\./i.test(url),
  );
  const listings: ParsedJobListing[] = [];
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    const at = line.match(/^(.{3,80}?)\s+at\s+(.{2,80})$/i);
    if (at) {
      listings.push({
        board: "generic",
        title: at[1]!.trim(),
        company: at[2]!.trim(),
        url: urls[listings.length],
        excerpt: clipExcerpt(line),
      });
      continue;
    }
    const dash = line.match(/^(.{3,80}?)\s+[·|-]\s+(.{2,80})$/);
    if (dash && !/^https?:/i.test(dash[1]!)) {
      listings.push({
        board: "generic",
        title: dash[1]!.trim(),
        company: dash[2]!.trim(),
        url: urls[listings.length],
        excerpt: clipExcerpt(line),
      });
    }
  }

  // One URL per leftover listing when subject looks like a single role.
  if (listings.length === 0 && urls.length > 0) {
    const titleGuess =
      message.subject.replace(/^(re:|fwd:)\s*/i, "").trim() || "Job listing";
    for (const url of urls.slice(0, 10)) {
      listings.push({
        board: "generic",
        title: titleGuess,
        url,
        excerpt: clipExcerpt(`${titleGuess} ${url}`),
      });
    }
  }

  return uniqueListings(listings);
}

export function parseJobAlertEmail(message: JobAlertMessage): JobAlertParseResult {
  const from = message.from?.trim() ?? "";
  const subject = message.subject?.trim() ?? "";
  if (!from && !subject && !message.text && !message.html) {
    return { ok: false, reason: "empty_message" };
  }

  const board = detectBoard(message);
  let listings: ParsedJobListing[];
  switch (board) {
    case "linkedin":
      listings = parseLinkedIn(message);
      break;
    case "seek":
      listings = parseSeek(message);
      break;
    case "indeed":
      listings = parseIndeed(message);
      break;
    default:
      listings = parseGeneric(message);
  }

  if (listings.length === 0) {
    return { ok: false, reason: `no_listings_parsed:${board}` };
  }

  return { ok: true, board, listings };
}
