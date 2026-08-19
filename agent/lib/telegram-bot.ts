/**
 * Telegram bot surface — command routing, intake, and digest callbacks.
 *
 * The channel adapter stays thin: it maps Eve inbound shapes onto this module
 * and posts replies. Commands never reach the LLM.
 */

import {
  applyExplicitProfileChanges,
  getMemberContextSnapshot,
  setExplicitPreference,
  type MemberContextSnapshot,
} from "./career-profile.js";
import {
  beginSurfaceTurn,
  completeSurfaceTurn,
  getOrCreateActiveConversation,
} from "./conversation.js";
import { repo } from "./db/repo.js";
import {
  ChannelLinkError,
  consumeTelegramDeepLink,
  findMemberByTelegramUserId,
  touchTelegramIdentityUsername,
  upsertMemberFromTelegramLogin,
  type MemberRecord,
} from "./identity.js";
import {
  getMessagingDestination,
  saveMessagingDestination,
  type DigestCadence,
} from "./messaging.js";
import {
  getMemberOpportunity,
  listMemberOpportunities,
  setOpportunityDisposition,
  type OpportunityCard,
} from "./opportunities.js";
import {
  DISMISS_REASONS,
  dismissWhyKeyboard,
  formatOpportunityCard,
  formatOpportunityMore,
  interestedCoachingStub,
  opportunityKeyboard,
  parseTelegramCallback,
  preferencesKeyboard,
  type DismissReasonCode,
} from "./telegram-cards.js";
import {
  downloadTelegramBotFile,
  extractDocumentText,
  looksLikeConnectionsCsv,
  type AttachmentFetch,
  type DownloadedTelegramFile,
} from "./telegram-documents.js";
import {
  applyCadenceAnswer,
  applyCompanyThesisAnswer,
  applyIdentityAnswer,
  applyRegionsAnswer,
  applyResumeAnswer,
  applyTargetRolesAnswer,
  cadenceKeyboard,
  confirmationSummary,
  intakeQuestion,
  isIntakeComplete,
  parseCadence,
  persistIntakeCursor,
  unresolvedIntakeStep,
} from "./telegram-intake.js";

export const BOT_COMMANDS = [
  "start",
  "profile",
  "preferences",
  "opportunities",
  "upload",
  "pause",
  "resume",
  "help",
] as const;
export type BotCommandName = (typeof BOT_COMMANDS)[number];

const START_COMMAND =
  /^\/start(?:@([A-Za-z0-9_]+))?(?:\s+([A-Za-z0-9_-]+))?\s*$/u;
const COMMAND =
  /^\/([a-z]+)(?:@([A-Za-z0-9_]+))?(?:\s+([\s\S]*))?$/iu;

export type TelegramBotAttachment = {
  fileId: string;
  fileName?: string;
  mediaType?: string;
  kind: "document" | "photo";
};

export type TelegramBotInbound = {
  kind: "message" | "callback";
  text: string;
  telegramUserId: string;
  chatId: string;
  username?: string | null;
  displayName?: string | null;
  messageId: string;
  attachments: TelegramBotAttachment[];
  callbackData?: string;
  callbackQueryId?: string;
};

export type TelegramBotReply = {
  text: string;
  replyMarkup?: Record<string, unknown>;
  extraMessages?: Array<{
    text: string;
    replyMarkup?: Record<string, unknown>;
  }>;
  /** When true, the channel should start an Eve session instead of dropping. */
  routeToAgent: boolean;
  memberId: string | null;
  conversationId?: string | null;
  contextPrefix?: string | null;
  skipDuplicate?: boolean;
};

export type ParsedStart = {
  isStart: boolean;
  token: string | null;
};

export function parseStartPayload(
  text: string,
  configuredBot?: string,
): ParsedStart {
  const match = START_COMMAND.exec(text.trim());
  if (!match) return { isStart: false, token: null };
  const target = match[1];
  if (
    target &&
    configuredBot &&
    target.toLowerCase() !== configuredBot.toLowerCase()
  ) {
    return { isStart: false, token: null };
  }
  const token = match[2] ?? null;
  if (token === "link") return { isStart: true, token: null };
  return { isStart: true, token };
}

export function parseBotCommand(
  text: string,
  configuredBot?: string,
): { name: BotCommandName; rest: string } | null {
  const match = COMMAND.exec(text.trim());
  if (!match) return null;
  const target = match[2];
  if (
    target &&
    configuredBot &&
    target.toLowerCase() !== configuredBot.toLowerCase()
  ) {
    return null;
  }
  const name = match[1]?.toLowerCase();
  if (!name || !BOT_COMMANDS.includes(name as BotCommandName)) return null;
  return { name: name as BotCommandName, rest: (match[3] ?? "").trim() };
}

function helpText(): string {
  return [
    "Gravy Scout watches gravy-train seats expanding into your territory and messages you when the evidence is real.",
    "",
    "/start — set up or status",
    "/profile — career profile",
    "/preferences — cadence, quiet hours, regions",
    "/opportunities — latest cards",
    "/upload — LinkedIn Connections.csv (matching soon)",
    "/pause / /resume — digest delivery",
    "/help — this list",
    "",
    "Usernames are display only. Username-only linking is not supported.",
  ].join("\n");
}

function displayNameOf(member: MemberRecord, fallback?: string | null): string {
  return member.displayName?.trim() || fallback?.trim() || "there";
}

export function nextDigestLabel(
  cadence: DigestCadence | null | undefined,
  now = new Date(),
): string {
  if (cadence === "realtime") {
    return "as soon as a scan finds something";
  }
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      13,
      0,
      0,
    ),
  );
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  if (cadence === "weekly") {
    const day = next.getUTCDay();
    const add = (1 - day + 7) % 7 || (day === 1 && next.getTime() > now.getTime() ? 0 : 7);
    if (!(day === 1 && next.getTime() > now.getTime())) {
      next.setUTCDate(next.getUTCDate() + (add === 0 ? 7 : add));
    }
  }
  return `${next.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function profileSummary(snapshot: MemberContextSnapshot): string {
  const identity = snapshot.identity;
  const titles = snapshot.document.goals?.targetTitles ?? [];
  const thesis =
    snapshot.document.companyThesis ??
    snapshot.document.goals?.ambitions?.[0] ??
    "—";
  const regions = snapshot.document.constraints?.locations ?? [];
  const cadence = snapshot.document.messaging?.digestCadence ?? "not set";
  const resume = snapshot.document.resume?.text
    ? `${snapshot.document.resume.text.length} chars`
    : "none";
  return [
    `${identity.name ?? "Unnamed"} — ${identity.currentTitle ?? "role unknown"} at ${identity.currentCompany ?? "company unknown"}`,
    `Goals: ${titles.join(", ") || "—"}`,
    `Thesis: ${thesis}`,
    `Regions: ${regions.join(", ") || "—"}`,
    `Cadence: ${cadence}. Résumé: ${resume}.`,
    "Reply with anything you want to change and I'll update the profile.",
  ].join("\n");
}

function completenessPct(snapshot: MemberContextSnapshot): number {
  const checks = [
    Boolean(snapshot.identity.name?.trim()),
    Boolean(snapshot.identity.currentTitle?.trim()),
    Boolean(snapshot.identity.currentCompany?.trim()),
    Boolean(snapshot.document.goals?.targetTitles?.length),
    Boolean(
      snapshot.document.companyThesis?.trim() ||
        snapshot.document.goals?.ambitions?.length,
    ),
    Boolean(snapshot.document.constraints?.locations?.length),
    Boolean(
      snapshot.document.resume?.text || snapshot.document.intake?.skippedResume,
    ),
    Boolean(snapshot.document.messaging?.digestCadence),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

async function watchlistSize(): Promise<number> {
  const companies = await repo.listCompanies();
  return companies.filter((company) => company.watchlistTier !== "ignore")
    .length;
}

async function welcomeBackText(
  member: MemberRecord,
  snapshot: MemberContextSnapshot,
  fallbackName?: string | null,
): Promise<string> {
  const dest = snapshot.document.messaging;
  const paused = dest?.digestPaused ? "paused" : "on";
  const size = await watchlistSize();
  const next = nextDigestLabel(dest?.digestCadence ?? null);
  return [
    `Welcome back, ${displayNameOf(member, fallbackName)}.`,
    `Profile ${completenessPct(snapshot)}% · watchlist ${size} · digests ${paused} · next ${next}.`,
    "Try /opportunities, /profile, or /preferences.",
  ].join("\n");
}

async function persistDestination(
  memberId: string,
  chatId: string,
  username?: string | null,
): Promise<void> {
  await saveMessagingDestination(memberId, {
    telegramChatId: chatId,
    telegramUsername: username,
    consentUpdates: true,
    markLinked: true,
  });
}

async function recordCommandTurn(input: {
  memberId: string;
  body: string;
  assistantBody: string;
  messageId: string;
  title?: string;
}): Promise<{ conversationId: string; created: boolean }> {
  const conversation = await getOrCreateActiveConversation(input.memberId, {
    title: input.title,
  });
  const turn = await beginSurfaceTurn({
    memberId: input.memberId,
    conversationId: conversation.id,
    surface: "telegram",
    body: input.body,
    idempotencyKey: `telegram:msg:${input.messageId}`,
    externalMessageId: input.messageId,
    titleFromBody: false,
  });
  if (turn.created) {
    await completeSurfaceTurn({
      memberId: input.memberId,
      conversationId: conversation.id,
      surface: "telegram",
      assistantBody: input.assistantBody,
      assistantIdempotencyKey: `telegram:cmd:${input.messageId}`,
      eveSessionId: `telegram-cmd:${input.messageId}`,
    });
  }
  return { conversationId: conversation.id, created: turn.created };
}

function reply(
  text: string,
  extras?: Partial<TelegramBotReply>,
): TelegramBotReply {
  return {
    text,
    routeToAgent: false,
    memberId: extras?.memberId ?? null,
    ...extras,
  };
}

async function ensureTelegramMember(input: {
  telegramUserId: string;
  username?: string | null;
  displayName?: string | null;
}): Promise<MemberRecord> {
  const existing = await findMemberByTelegramUserId(input.telegramUserId);
  if (existing) {
    await touchTelegramIdentityUsername(input.telegramUserId, input.username);
    if (input.displayName && input.displayName !== existing.displayName) {
      return existing;
    }
    return existing;
  }
  return upsertMemberFromTelegramLogin({
    telegramUserId: input.telegramUserId,
    username: input.username,
    displayName: input.displayName,
  });
}

async function intakePrompt(
  memberId: string,
  snapshot: MemberContextSnapshot,
): Promise<TelegramBotReply> {
  const step = unresolvedIntakeStep(snapshot);
  await persistIntakeCursor(memberId, snapshot);
  if (step === "complete") {
    return reply(confirmationSummary(snapshot), { memberId });
  }
  const question = intakeQuestion(step) ?? "You're set.";
  return reply(question, {
    memberId,
    replyMarkup: step === "cadence" ? cadenceKeyboard() : undefined,
  });
}

async function applyIntakeText(
  memberId: string,
  snapshot: MemberContextSnapshot,
  text: string,
): Promise<TelegramBotReply> {
  const step = unresolvedIntakeStep(snapshot);
  let next = snapshot;
  let error: string | undefined;
  switch (step) {
    case "identity": {
      const result = await applyIdentityAnswer(memberId, text);
      next = result.snapshot;
      error = result.error;
      break;
    }
    case "target_roles": {
      const result = await applyTargetRolesAnswer(memberId, text);
      next = result.snapshot;
      error = result.error;
      break;
    }
    case "company_thesis": {
      const result = await applyCompanyThesisAnswer(memberId, text);
      next = result.snapshot;
      error = result.error;
      break;
    }
    case "regions": {
      const result = await applyRegionsAnswer(memberId, text);
      next = result.snapshot;
      error = result.error;
      break;
    }
    case "resume": {
      const result = await applyResumeAnswer(memberId, { text, source: "paste" });
      next = result.snapshot;
      error = result.error;
      break;
    }
    case "cadence": {
      const cadence = parseCadence(text);
      if (!cadence) {
        return reply("Pick realtime, daily, or weekly.", {
          memberId,
          replyMarkup: cadenceKeyboard(),
        });
      }
      next = await applyCadenceAnswer(memberId, cadence);
      return reply(confirmationSummary(next), { memberId });
    }
    case "complete":
      return reply(confirmationSummary(snapshot), { memberId });
  }
  if (error) return reply(error, { memberId });
  if (unresolvedIntakeStep(next) === "complete") {
    return reply(confirmationSummary(next), { memberId });
  }
  return intakePrompt(memberId, next);
}

async function handleStart(input: {
  inbound: TelegramBotInbound;
  configuredBot?: string;
}): Promise<TelegramBotReply> {
  const start = parseStartPayload(input.inbound.text, input.configuredBot);
  const from = input.inbound;

  if (start.token) {
    try {
      const { kind, identity, member } = await consumeTelegramDeepLink({
        token: start.token,
        telegramUserId: from.telegramUserId,
        username: from.username,
        displayName: from.displayName,
      });
      await persistDestination(identity.memberId, from.chatId, from.username);
      const snapshot = await getMemberContextSnapshot(member.id);
      const text = await welcomeBackText(member, snapshot, from.displayName);
      const recorded = await recordCommandTurn({
        memberId: member.id,
        body: from.text,
        assistantBody: text,
        messageId: from.messageId,
        title: kind === "login" ? "Telegram login" : "Telegram link",
      });
      return reply(text, {
        memberId: member.id,
        conversationId: recorded.conversationId,
        skipDuplicate: !recorded.created,
      });
    } catch (err) {
      if (err instanceof ChannelLinkError) {
        const hints: Record<string, string> = {
          malformed:
            "That link looks invalid. Generate a fresh Telegram link from the web app.",
          not_found:
            "That link was not recognized. Generate a fresh Telegram link from the web app.",
          expired:
            "That link has expired. Generate a fresh Telegram link from the web app.",
          used: "That link was already used. Generate a fresh Telegram link from the web app.",
          conflict:
            "This Telegram account is already linked to a different Gravy Scout member. Disconnect it there first, or sign in as that member.",
        };
        return reply(
          hints[err.code] ??
            "Could not link Telegram. Generate a fresh link from the web app.",
        );
      }
      console.warn(
        "[telegram] link consume failed:",
        err instanceof Error ? err.message : err,
      );
      return reply(
        "Something went wrong while linking. Try a fresh link from the web app.",
      );
    }
  }

  const member = await ensureTelegramMember({
    telegramUserId: from.telegramUserId,
    username: from.username,
    displayName: from.displayName,
  });
  await persistDestination(member.id, from.chatId, from.username);
  const snapshot = await getMemberContextSnapshot(member.id);

  if (isIntakeComplete(snapshot)) {
    const text = await welcomeBackText(member, snapshot, from.displayName);
    const recorded = await recordCommandTurn({
      memberId: member.id,
      body: from.text || "/start",
      assistantBody: text,
      messageId: from.messageId,
    });
    return reply(text, {
      memberId: member.id,
      conversationId: recorded.conversationId,
      skipDuplicate: !recorded.created,
    });
  }

  const step = unresolvedIntakeStep(snapshot);
  const question = intakeQuestion(step) ?? "You're set.";
  const welcome =
    step === "identity"
      ? `I'm Gravy Scout — I spot gravy-train seats expanding into your territory before roles post.\n\n${question}`
      : question;
  await persistIntakeCursor(member.id, snapshot);
  const recorded = await recordCommandTurn({
    memberId: member.id,
    body: from.text || "/start",
    assistantBody: welcome,
    messageId: from.messageId,
    title: "Telegram intake",
  });
  return reply(welcome, {
    memberId: member.id,
    conversationId: recorded.conversationId,
    skipDuplicate: !recorded.created,
    replyMarkup: step === "cadence" ? cadenceKeyboard() : undefined,
  });
}

async function handleProfile(member: MemberRecord): Promise<TelegramBotReply> {
  const snapshot = await getMemberContextSnapshot(member.id);
  if (!isIntakeComplete(snapshot)) {
    const prompt = await intakePrompt(member.id, snapshot);
    return reply(`${profileSummary(snapshot)}\n\nLet's finish setup.\n${prompt.text}`, {
      memberId: member.id,
      replyMarkup: prompt.replyMarkup,
    });
  }
  return reply(profileSummary(snapshot), { memberId: member.id });
}

async function handlePreferences(
  member: MemberRecord,
): Promise<TelegramBotReply> {
  const dest = await getMessagingDestination(member.id);
  const snapshot = await getMemberContextSnapshot(member.id);
  const regions = snapshot.document.constraints?.locations ?? [];
  const text = [
    `Cadence: ${dest.digestCadence ?? "not set"}`,
    `Quiet hours: ${dest.quietHours.start ?? "off"}–${dest.quietHours.end ?? ""} ${dest.quietHours.timezone ?? ""}`.trim(),
    `Regions: ${regions.join(", ") || "not set"}`,
    dest.digestPaused ? "Digests are paused." : "Digests are on.",
  ].join("\n");
  return reply(text, {
    memberId: member.id,
    replyMarkup: preferencesKeyboard(),
  });
}

async function handleOpportunities(
  member: MemberRecord,
): Promise<TelegramBotReply> {
  const cards = (await listMemberOpportunities(member.id, { limit: 20 }))
    .filter(
      (card) =>
        card.status !== "dismissed" && card.disposition !== "not_interested",
    )
    .slice(0, 5);
  if (cards.length === 0) {
    return reply("No open opportunities yet. I'll message you when the next scan runs.", {
      memberId: member.id,
    });
  }
  const [first, ...rest] = cards as [OpportunityCard, ...OpportunityCard[]];
  return reply(formatOpportunityCard(first), {
    memberId: member.id,
    replyMarkup: opportunityKeyboard(first.id),
    extraMessages: rest.map((card) => ({
      text: formatOpportunityCard(card),
      replyMarkup: opportunityKeyboard(card.id),
    })),
  });
}

async function handleUploadPrompt(
  member: MemberRecord,
): Promise<TelegramBotReply> {
  const snapshot = await getMemberContextSnapshot(member.id);
  await persistIntakeCursor(member.id, snapshot, {
    awaitingUpload: "connections_csv",
  });
  return reply(
    "Send your LinkedIn Connections.csv as a document. I'll store it raw — connection matching is coming soon.",
    { memberId: member.id },
  );
}

async function handlePause(
  member: MemberRecord,
  paused: boolean,
): Promise<TelegramBotReply> {
  await saveMessagingDestination(member.id, {
    digestPaused: paused,
    consentUpdates: paused ? undefined : true,
  });
  return reply(
    paused
      ? "Digests paused. Send /resume when you want updates again."
      : "Digests resumed. I'll message you on your usual cadence.",
    { memberId: member.id },
  );
}

async function storeConnectionsCsv(
  memberId: string,
  file: DownloadedTelegramFile,
): Promise<TelegramBotReply> {
  const text = extractDocumentText(file.bytes, file.fileName, file.mediaType);
  const snapshot = await getMemberContextSnapshot(memberId);
  await applyExplicitProfileChanges(memberId, {
    connectionsCsv: {
      fileName: file.fileName,
      storedAt: new Date().toISOString(),
      text: text.slice(0, 200_000),
    },
    intake: {
      status: snapshot.document.intake?.status ?? "in_progress",
      currentStep: snapshot.document.intake?.currentStep ?? "identity",
      skippedResume: snapshot.document.intake?.skippedResume,
      awaitingUpload: null,
    },
  });
  return reply("Saved — connection matching coming soon.", { memberId });
}

async function maybeHandleDocument(input: {
  member: MemberRecord;
  inbound: TelegramBotInbound;
  fetchAttachment: AttachmentFetch;
}): Promise<TelegramBotReply | null> {
  const attachment = input.inbound.attachments[0];
  if (!attachment) return null;
  const snapshot = await getMemberContextSnapshot(input.member.id);
  const awaiting = snapshot.document.intake?.awaitingUpload;
  const step = unresolvedIntakeStep(snapshot);
  const wantResume = awaiting === "resume" || step === "resume";
  const wantCsv = awaiting === "connections_csv";
  if (!wantResume && !wantCsv) {
    return null;
  }

  const file = await input.fetchAttachment(attachment.fileId);
  if (!file) {
    return reply("I couldn't download that file. Try again?", {
      memberId: input.member.id,
    });
  }
  const text = extractDocumentText(
    file.bytes,
    file.fileName ?? attachment.fileName,
    file.mediaType ?? attachment.mediaType,
  );
  const name = file.fileName ?? attachment.fileName ?? null;

  if (wantCsv || looksLikeConnectionsCsv(name, text)) {
    return storeConnectionsCsv(input.member.id, { ...file, fileName: name });
  }

  if (wantResume) {
    const result = await applyResumeAnswer(input.member.id, {
      text,
      fileName: name,
      source: "upload",
    });
    if (result.error) {
      return reply(result.error, { memberId: input.member.id });
    }
    if (unresolvedIntakeStep(result.snapshot) === "complete") {
      return reply(confirmationSummary(result.snapshot), {
        memberId: input.member.id,
      });
    }
    return intakePrompt(input.member.id, result.snapshot);
  }

  return null;
}

export async function handleTelegramInbound(
  inbound: TelegramBotInbound,
  options?: {
    configuredBot?: string;
    fetchAttachment?: AttachmentFetch;
  },
): Promise<TelegramBotReply> {
  const fetchAttachment = options?.fetchAttachment ?? downloadTelegramBotFile;
  const configuredBot = options?.configuredBot;

  if (inbound.kind === "callback") {
    return handleCallback(inbound);
  }

  const command = parseBotCommand(inbound.text, configuredBot);
  const start = parseStartPayload(inbound.text, configuredBot);

  if (start.isStart || command?.name === "start") {
    return handleStart({ inbound, configuredBot });
  }

  let member = await findMemberByTelegramUserId(inbound.telegramUserId);
  if (!member) {
    if (command) {
      return reply("Send /start to set up Gravy Scout first.");
    }
    return reply("Send /start to set up Gravy Scout. I don't know this chat yet.");
  }

  try {
    await touchTelegramIdentityUsername(inbound.telegramUserId, inbound.username);
    await persistDestination(member.id, inbound.chatId, inbound.username);
  } catch (err) {
    console.warn(
      "[telegram] failed to persist messaging destination:",
      err instanceof Error ? err.message : err,
    );
  }

  if (command?.name === "help") return reply(helpText(), { memberId: member.id });
  if (command?.name === "profile") return handleProfile(member);
  if (command?.name === "preferences") return handlePreferences(member);
  if (command?.name === "opportunities") return handleOpportunities(member);
  if (command?.name === "upload") return handleUploadPrompt(member);
  if (command?.name === "pause") return handlePause(member, true);
  if (command?.name === "resume") return handlePause(member, false);

  const fromDoc = await maybeHandleDocument({
    member,
    inbound,
    fetchAttachment,
  });
  if (fromDoc) return fromDoc;

  const snapshot = await getMemberContextSnapshot(member.id);
  if (snapshot.document.intake?.awaitingUpload === "connections_csv" && inbound.text) {
    return reply("Please send Connections.csv as a document attachment.", {
      memberId: member.id,
    });
  }

  if (!isIntakeComplete(snapshot) && inbound.text.trim()) {
    return applyIntakeText(member.id, snapshot, inbound.text);
  }

  const conversation = await getOrCreateActiveConversation(member.id);
  const turn = await beginSurfaceTurn({
    memberId: member.id,
    conversationId: conversation.id,
    surface: "telegram",
    body: inbound.text || "[attachment]",
    idempotencyKey: `telegram:msg:${inbound.messageId}`,
    externalMessageId: inbound.messageId,
  });
  if (!turn.created) {
    return reply("", {
      routeToAgent: false,
      memberId: member.id,
      conversationId: conversation.id,
      skipDuplicate: true,
    });
  }

  return {
    text: "",
    routeToAgent: true,
    memberId: member.id,
    conversationId: conversation.id,
    contextPrefix: turn.shouldInjectContext ? turn.contextPrefix : null,
  };
}

async function handleCallback(
  inbound: TelegramBotInbound,
): Promise<TelegramBotReply> {
  const parsed = parseTelegramCallback(inbound.callbackData);
  const member = await findMemberByTelegramUserId(inbound.telegramUserId);
  if (!member) {
    return reply("Send /start to set up Gravy Scout first.");
  }
  await persistDestination(member.id, inbound.chatId, inbound.username);
  if (!parsed) {
    return reply("That button expired. Try /opportunities or /preferences.", {
      memberId: member.id,
    });
  }

  if (parsed.kind === "cadence") {
    const snapshot = await getMemberContextSnapshot(member.id);
    if (!isIntakeComplete(snapshot) && unresolvedIntakeStep(snapshot) === "cadence") {
      const next = await applyCadenceAnswer(member.id, parsed.cadence);
      return reply(confirmationSummary(next), { memberId: member.id });
    }
    await setExplicitPreference(
      member.id,
      "digestCadence",
      parsed.cadence,
      "telegram_preferences",
    );
    await saveMessagingDestination(member.id, { digestCadence: parsed.cadence });
    return reply(`Cadence set to ${parsed.cadence}.`, { memberId: member.id });
  }

  if (parsed.kind === "region") {
    const locations =
      parsed.region === "APAC/ANZ" ? ["APAC", "ANZ"] : [parsed.region];
    await applyExplicitProfileChanges(member.id, {
      constraints: { locations },
      location: locations.join(", "),
    });
    await setExplicitPreference(
      member.id,
      "regions",
      locations,
      "telegram_preferences",
    );
    return reply(`Regions set to ${locations.join(", ")}.`, {
      memberId: member.id,
    });
  }

  if (parsed.kind === "quiet") {
    if (parsed.preset === "off") {
      await saveMessagingDestination(member.id, {
        quietHours: { start: null, end: null, timezone: null },
      });
      return reply("Quiet hours off.", { memberId: member.id });
    }
    if (parsed.preset === "syd") {
      await saveMessagingDestination(member.id, {
        quietHours: { start: "22:00", end: "07:00", timezone: "Australia/Sydney" },
      });
      return reply("Quiet hours 22:00–07:00 Australia/Sydney.", {
        memberId: member.id,
      });
    }
    await saveMessagingDestination(member.id, {
      quietHours: { start: "21:00", end: "08:00", timezone: "UTC" },
    });
    return reply("Quiet hours 21:00–08:00 UTC.", { memberId: member.id });
  }

  if (parsed.kind === "opportunity") {
    if (parsed.action === "interested") {
      const detail = await setOpportunityDisposition({
        memberId: member.id,
        opportunityId: parsed.opportunityId,
        disposition: "saved",
      });
      if (!detail) {
        return reply("I couldn't find that opportunity.", { memberId: member.id });
      }
      return reply(interestedCoachingStub(detail), { memberId: member.id });
    }
    if (parsed.action === "dismiss") {
      const detail = await setOpportunityDisposition({
        memberId: member.id,
        opportunityId: parsed.opportunityId,
        disposition: "dismissed",
      });
      if (!detail) {
        return reply("I couldn't find that opportunity.", { memberId: member.id });
      }
      return reply("Dismissed. Why, if you want to say?", {
        memberId: member.id,
        replyMarkup: dismissWhyKeyboard(parsed.opportunityId),
      });
    }
    const detail = await getMemberOpportunity(member.id, parsed.opportunityId);
    if (!detail) {
      return reply("I couldn't find that opportunity.", { memberId: member.id });
    }
    return reply(formatOpportunityMore(detail), { memberId: member.id });
  }

  const label = DISMISS_REASONS[parsed.reason as DismissReasonCode];
  await setExplicitPreference(
    member.id,
    `dismiss_reason:${parsed.opportunityId}`,
    parsed.reason,
    "telegram_dismiss",
  );
  return reply(`Noted: ${label}. I'll weigh that next time.`, {
    memberId: member.id,
  });
}
