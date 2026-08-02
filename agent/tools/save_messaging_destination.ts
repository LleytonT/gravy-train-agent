import { defineTool } from "eve/tools";
import { z } from "zod";

import { requireMemberCaller } from "../lib/identity.js";
import {
  getMessagingDestination,
  saveMessagingDestination,
  telegramDeepLink,
} from "../lib/messaging.js";

export default defineTool({
  description:
    "Save or update the member's Telegram messaging destination (chatId, username, consent, onboardingComplete). Call when they link Telegram, agree to updates, or finish guided setup. Also use action=read to check link status.",
  inputSchema: z.object({
    action: z.enum(["read", "save"]).default("save"),
    telegramChatId: z.string().optional(),
    telegramUsername: z.string().optional(),
    consentUpdates: z.boolean().optional(),
    onboardingComplete: z.boolean().optional(),
  }),
  async execute(input, ctx) {
    const { memberId } = requireMemberCaller(ctx);

    if (input.action === "read") {
      const dest = await getMessagingDestination(memberId);
      return {
        ...dest,
        deepLink: telegramDeepLink(),
        botUsername: process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") ?? null,
        linked: Boolean(dest.telegramChatId),
      };
    }

    const dest = await saveMessagingDestination(memberId, {
      telegramChatId: input.telegramChatId,
      telegramUsername: input.telegramUsername,
      consentUpdates: input.consentUpdates,
      onboardingComplete: input.onboardingComplete,
      markLinked: Boolean(input.telegramChatId),
    });

    return {
      saved: true,
      ...dest,
      deepLink: telegramDeepLink(),
      linked: Boolean(dest.telegramChatId),
    };
  },
});
