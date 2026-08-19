/**
 * Telegram opportunity cards + digest inline keyboards.
 * Callback data stays under Telegram's 64-byte cap (`gs:` prefix, not Eve HITL `eve:`).
 */

import type { OpportunityCard, OpportunityDetail } from "./opportunities.js";

export const TELEGRAM_CALLBACK_PREFIX = "gs:";

export type OpportunityCallbackAction = "interested" | "dismiss" | "more";

export type DismissReasonCode = "jr" | "rg" | "st" | "rl" | "ot";

export const DISMISS_REASONS: Record<DismissReasonCode, string> = {
  jr: "Too junior / senior",
  rg: "Wrong region",
  st: "Wrong company stage",
  rl: "Not my role",
  ot: "Other",
};

export type ParsedCallback =
  | { kind: "cadence"; cadence: "realtime" | "daily" | "weekly" }
  | { kind: "region"; region: string }
  | { kind: "quiet"; preset: "off" | "syd" | "utc" }
  | {
      kind: "opportunity";
      action: OpportunityCallbackAction;
      opportunityId: string;
    }
  | {
      kind: "dismiss_why";
      opportunityId: string;
      reason: DismissReasonCode;
    };

function compactId(opportunityId: string): string {
  return opportunityId.replace(/-/g, "");
}

function expandId(compact: string): string {
  if (
    compact.length === 32 &&
    /^[0-9a-f]+$/i.test(compact)
  ) {
    return [
      compact.slice(0, 8),
      compact.slice(8, 12),
      compact.slice(12, 16),
      compact.slice(16, 20),
      compact.slice(20),
    ].join("-");
  }
  return compact;
}

export function opportunityKeyboard(opportunityId: string): Record<string, unknown> {
  const id = compactId(opportunityId);
  return {
    inline_keyboard: [
      [
        { text: "Interested", callback_data: `gs:o:i:${id}` },
        { text: "Dismiss", callback_data: `gs:o:d:${id}` },
        { text: "Tell me more", callback_data: `gs:o:m:${id}` },
      ],
    ],
  };
}

export function dismissWhyKeyboard(opportunityId: string): Record<string, unknown> {
  const id = compactId(opportunityId);
  return {
    inline_keyboard: [
      [
        { text: "Wrong region", callback_data: `gs:w:${id}:rg` },
        { text: "Not my role", callback_data: `gs:w:${id}:rl` },
      ],
      [
        { text: "Wrong stage", callback_data: `gs:w:${id}:st` },
        { text: "Level", callback_data: `gs:w:${id}:jr` },
        { text: "Other", callback_data: `gs:w:${id}:ot` },
      ],
    ],
  };
}

export function preferencesKeyboard(): Record<string, unknown> {
  return {
    inline_keyboard: [
      [
        { text: "Realtime", callback_data: "gs:c:rt" },
        { text: "Daily", callback_data: "gs:c:da" },
        { text: "Weekly", callback_data: "gs:c:we" },
      ],
      [
        { text: "Quiet off", callback_data: "gs:q:off" },
        { text: "22–07 AEST", callback_data: "gs:q:syd" },
        { text: "21–08 UTC", callback_data: "gs:q:utc" },
      ],
      [
        { text: "APAC/ANZ", callback_data: "gs:r:apac" },
        { text: "US", callback_data: "gs:r:us" },
        { text: "Europe", callback_data: "gs:r:eu" },
        { text: "Remote", callback_data: "gs:r:remote" },
      ],
    ],
  };
}

export function parseTelegramCallback(data: string | undefined): ParsedCallback | null {
  if (!data || !data.startsWith(TELEGRAM_CALLBACK_PREFIX)) return null;
  const parts = data.split(":");
  if (parts[1] === "c" && parts[2]) {
    const cadence =
      parts[2] === "rt" ? "realtime" : parts[2] === "da" ? "daily" : parts[2] === "we" ? "weekly" : null;
    return cadence ? { kind: "cadence", cadence } : null;
  }
  if (parts[1] === "r" && parts[2]) {
    const region =
      parts[2] === "apac"
        ? "APAC/ANZ"
        : parts[2] === "us"
          ? "US"
          : parts[2] === "eu"
            ? "Europe"
            : parts[2] === "remote"
              ? "Remote"
              : null;
    return region ? { kind: "region", region } : null;
  }
  if (parts[1] === "q" && (parts[2] === "off" || parts[2] === "syd" || parts[2] === "utc")) {
    return { kind: "quiet", preset: parts[2] };
  }
  if (parts[1] === "o" && parts[2] && parts[3]) {
    const action: OpportunityCallbackAction | null =
      parts[2] === "i" ? "interested" : parts[2] === "d" ? "dismiss" : parts[2] === "m" ? "more" : null;
    if (!action) return null;
    return {
      kind: "opportunity",
      action,
      opportunityId: expandId(parts[3]),
    };
  }
  if (parts[1] === "w" && parts[2] && parts[3]) {
    const reason = parts[3] as DismissReasonCode;
    if (!DISMISS_REASONS[reason]) return null;
    return {
      kind: "dismiss_why",
      opportunityId: expandId(parts[2]),
      reason,
    };
  }
  return null;
}

export function formatOpportunityCard(card: OpportunityCard): string {
  const score = Number.isFinite(card.score) ? card.score.toFixed(1) : "—";
  const why = (card.rationale ?? card.nextAction ?? "").slice(0, 280);
  return [
    card.headline,
    `${card.companyName} · score ${score}${card.roleTitle ? ` · ${card.roleTitle}` : ""}`,
    why,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatOpportunityMore(detail: OpportunityDetail): string {
  const evidence = detail.evidence.slice(0, 5).map((item) => {
    const cite = item.sourceUrl ? ` ${item.sourceUrl}` : "";
    return `• ${item.summary}${cite}`;
  });
  return [
    detail.headline,
    detail.rationale ?? "No stored rationale yet.",
    evidence.length ? `Evidence:\n${evidence.join("\n")}` : "No cited signals on this card.",
    detail.nextAction ? `Next: ${detail.nextAction}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function interestedCoachingStub(card: OpportunityCard): string {
  return `Saved ${card.companyName}. Next: find a hiring manager or peer in seat and draft a short note. Say the company name when you want help.`;
}
