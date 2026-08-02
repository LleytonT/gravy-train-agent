import { defineTool } from "eve/tools";
import { z } from "zod";

import {
  createTelegramLinkToken,
  getTelegramIdentityForMember,
  requireMemberCaller,
  revokeTelegramIdentity,
} from "../lib/identity.js";
import {
  getMessagingDestination,
  saveMessagingDestination,
  telegramBotInfoLink,
} from "../lib/messaging.js";

export default defineTool({
  description:
    "Read or update the member's Telegram messaging preferences (consent, quiet hours, onboardingComplete). Use action=link to mint a one-time deep link, action=revoke to disconnect Telegram, or action=read for status. Never link by username alone — only the verified Telegram user ID from /start binds identity.",
  inputSchema: z.object({
    action: z
      .enum(["read", "save", "link", "revoke"])
      .default("save"),
    telegramChatId: z.string().optional(),
    telegramUsername: z.string().optional(),
    consentUpdates: z.boolean().optional(),
    onboardingComplete: z.boolean().optional(),
    quietHoursStart: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional()
      .describe("Quiet hours start HH:MM in the member timezone"),
    quietHoursEnd: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional()
      .describe("Quiet hours end HH:MM in the member timezone"),
    quietHoursTimezone: z.string().optional(),
  }),
  async execute(input, ctx) {
    const { memberId } = requireMemberCaller(ctx);

    if (input.action === "read") {
      const dest = await getMessagingDestination(memberId);
      const identity = await getTelegramIdentityForMember(memberId);
      return {
        ...dest,
        botInfoLink: telegramBotInfoLink(),
        botUsername: process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") ?? null,
        linked: Boolean(identity),
        telegramUserId: identity?.externalUserId ?? null,
        revoked: false,
      };
    }

    if (input.action === "link") {
      const minted = await createTelegramLinkToken(memberId);
      return {
        linked: false,
        tokenExpiresAt: minted.expiresAt.toISOString(),
        deepLink: minted.deepLink,
        botUsername: minted.botUsername,
        hint: "Open this one-time link in Telegram and tap Start. Do not share it; it expires shortly and works once.",
      };
    }

    if (input.action === "revoke") {
      await revokeTelegramIdentity(memberId);
      const dest = await saveMessagingDestination(memberId, {
        telegramChatId: null,
        consentUpdates: false,
        markLinked: false,
      });
      return {
        revoked: true,
        linked: false,
        ...dest,
      };
    }

    const dest = await saveMessagingDestination(memberId, {
      // Chat id may be refreshed from an already-linked inbound; never treat
      // username as identity.
      telegramChatId: input.telegramChatId,
      telegramUsername: input.telegramUsername,
      consentUpdates: input.consentUpdates,
      onboardingComplete: input.onboardingComplete,
      markLinked: Boolean(input.telegramChatId),
      quietHours:
        input.quietHoursStart !== undefined ||
        input.quietHoursEnd !== undefined ||
        input.quietHoursTimezone !== undefined
          ? {
              start: input.quietHoursStart,
              end: input.quietHoursEnd,
              timezone: input.quietHoursTimezone,
            }
          : undefined,
    });
    const identity = await getTelegramIdentityForMember(memberId);

    return {
      saved: true,
      ...dest,
      botInfoLink: telegramBotInfoLink(),
      linked: Boolean(identity),
      telegramUserId: identity?.externalUserId ?? null,
    };
  },
});
