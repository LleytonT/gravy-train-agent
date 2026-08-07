import { generateText, Output } from "ai";
import { z } from "zod";

import { CLASSIFY_MODEL, resolveModel } from "./models.js";
import type { RawItem } from "./db/schema.js";

export { CLASSIFY_MODEL };

const BATCH_SIZE = 15;

const extractedSignalSchema = z.object({
  rawItemId: z.string(),
  company: z.string(),
  signalType: z.string(),
  direction: z.enum(["positive", "negative"]),
  strength: z.number().int().min(1).max(5),
  summary: z.string(),
});

const classificationResultSchema = z.object({
  signals: z.array(extractedSignalSchema),
});

export type ExtractedSignal = z.infer<typeof extractedSignalSchema>;

export type ClassifyItem = Pick<
  RawItem,
  "id" | "source" | "author" | "authorHeadline" | "excerpt" | "url" | "postedAt"
>;

export type ClassifyOptions = {
  /** Override CLASSIFY_MODEL (Gateway id or fine-tuned model id). */
  model?: string;
};

const SIGNAL_TYPE_GUIDE = [
  "Leading / timing signals:",
  "- apac_sales_leadership_hire",
  "- first_apac_gtm_job",
  "- people_watchlist_job_change",
  "- funding_round, series_b_plus, product_launch_apac, expansion_signal",
  "",
  "Territory / APAC relevance:",
  "- sydney_infra, irap, local_entity, exec_tour, au_logo, apac_office, anz_expansion",
  "",
  "Talent signals:",
  "- regional_leadership_hire, adjacent_se_csm, talent_flow_strong_org, people_watchlist_move",
  "",
  "Negatives:",
  "- layoffs, leadership_departure, funding_struggle, apac_retreat",
].join("\n");

/** System prompt used for batch classification (also used by fine-tune export). */
export function buildClassifySystemPrompt(): string {
  return [
    "You extract structured GTM intelligence signals for an APAC-focused B2B scout.",
    "Return only companies and signals clearly supported by each item.",
    "Use canonical signalType slugs from this guide:",
    SIGNAL_TYPE_GUIDE,
    "",
    "Rules:",
    "- One item may yield zero or more signals.",
    "- strength is 1-5 based on how actionable the signal is.",
    "- direction is positive unless clearly negative.",
    "- summary should be one concise sentence.",
  ].join("\n");
}

/** User-message payload for one classify batch (fine-tune / eval export). */
export function buildClassifyUserPrompt(items: ClassifyItem[]): string {
  return JSON.stringify(
    items.map((item) => ({
      rawItemId: item.id,
      source: item.source,
      author: item.author,
      authorHeadline: item.authorHeadline,
      excerpt: item.excerpt,
      url: item.url,
      postedAt: item.postedAt,
    })),
    null,
    2,
  );
}

function buildBatchPrompt(items: ClassifyItem[]): string {
  // Keep signature used by older call sites; system prompt is item-agnostic.
  void items;
  return buildClassifySystemPrompt();
}

async function classifyChunk(
  items: ClassifyItem[],
  model: string,
): Promise<ExtractedSignal[]> {
  const result = await generateText({
    model,
    system: buildBatchPrompt(items),
    prompt: buildClassifyUserPrompt(items),
    output: Output.object({
      schema: classificationResultSchema,
      name: "gravy_scout_classification",
      description:
        "Extracted company signals from raw LinkedIn/X items for Gravy Scout.",
    }),
  });

  return result.output.signals;
}

export async function classifyBatch(
  items: ClassifyItem[],
  options: ClassifyOptions = {},
): Promise<ExtractedSignal[]> {
  if (items.length === 0) {
    return [];
  }

  if (!process.env.AI_GATEWAY_API_KEY) {
    console.warn(
      "[classify] AI_GATEWAY_API_KEY is not set; skipping classification batch.",
    );
    return [];
  }

  const model = resolveModel("classify", options.model);
  const allSignals: ExtractedSignal[] = [];

  for (let index = 0; index < items.length; index += BATCH_SIZE) {
    const chunk = items.slice(index, index + BATCH_SIZE);
    try {
      const signals = await classifyChunk(chunk, model);
      allSignals.push(...signals);
    } catch (error) {
      console.warn(
        `[classify] Batch ${index / BATCH_SIZE + 1} failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return allSignals;
}
