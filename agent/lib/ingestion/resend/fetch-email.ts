import { Resend } from "resend";

import type { ReceivedEmailContent } from "../types.js";

export type ResendReceivedEvent = {
  type: string;
  data?: {
    email_id?: string;
    created_at?: string;
    from?: string;
    to?: string[];
    subject?: string;
    message_id?: string;
  };
};

export async function fetchReceivedEmailContent(
  event: ResendReceivedEvent,
  deps: {
    apiKey?: string | null;
    fetchContent?: (emailId: string) => Promise<{
      text?: string | null;
      html?: string | null;
      headers?: Array<{ name: string; value: string }>;
    }>;
  } = {},
): Promise<ReceivedEmailContent> {
  const emailId = event.data?.email_id?.trim();
  if (!emailId) {
    throw new Error("Resend event missing email_id");
  }

  let text: string | null | undefined;
  let html: string | null | undefined;

  if (deps.fetchContent) {
    const content = await deps.fetchContent(emailId);
    text = content.text;
    html = content.html;
  } else {
    const apiKey = deps.apiKey?.trim() || process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is required to fetch received email content");
    }
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.receiving.get(emailId);
    if (error) {
      throw new Error(`Resend receiving.get failed: ${error.message}`);
    }
    text = data?.text ?? null;
    html = data?.html ?? null;
  }

  return {
    emailId,
    messageId: event.data?.message_id ?? null,
    from: event.data?.from ?? "",
    to: event.data?.to ?? [],
    subject: event.data?.subject ?? "",
    text,
    html,
    createdAt: event.data?.created_at ?? null,
  };
}
