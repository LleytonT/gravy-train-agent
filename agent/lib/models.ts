/**
 * Model configuration for Gravy Scout.
 *
 * SYNTHESIS: Use AGENT_MODEL for multi-step reasoning, dossier synthesis, and
 * outbound ping drafting. Use CLASSIFY_MODEL for high-volume batch extraction
 * from raw LinkedIn/X items where latency and cost matter more than nuance.
 *
 * Multi-LLM / fine-tune: override via env, or pass an explicit model id into
 * classifyBatch / eval runners. Catalog entries are suggested Gateway ids for
 * A/B comparison — not hard requirements.
 */

export type ModelRole = "agent" | "classify";

export type ModelCatalogEntry = {
  id: string;
  role: ModelRole;
  label: string;
  /** Set when this id is a fine-tuned / custom Gateway model. */
  fineTuned?: boolean;
  notes?: string;
};

/** Suggested AI Gateway model ids for chat/synthesis and batch classify. */
export const MODEL_CATALOG: ModelCatalogEntry[] = [
  {
    id: "anthropic/claude-sonnet-5",
    role: "agent",
    label: "Claude Sonnet 5",
    notes: "Default agent — tool use, digests, preference updates",
  },
  {
    id: "anthropic/claude-opus-4.5",
    role: "agent",
    label: "Claude Opus 4.5",
    notes: "Higher-quality agent when cost is less constrained",
  },
  {
    id: "openai/gpt-5",
    role: "agent",
    label: "GPT-5",
    notes: "Alternate agent for multi-LLM choice / A/B",
  },
  {
    id: "google/gemini-3-flash",
    role: "agent",
    label: "Gemini 3 Flash",
    notes: "Fast/cheap agent candidate",
  },
  {
    id: "anthropic/claude-haiku-4.5",
    role: "classify",
    label: "Claude Haiku 4.5",
    notes: "Default classifier — structured signal extraction",
  },
  {
    id: "openai/gpt-5-mini",
    role: "classify",
    label: "GPT-5 Mini",
    notes: "Alternate classifier for multi-LLM choice / A/B",
  },
  {
    id: "google/gemini-3-flash",
    role: "classify",
    label: "Gemini 3 Flash",
    notes: "Fast classifier candidate",
  },
];

export const DEFAULT_AGENT_MODEL = "anthropic/claude-sonnet-5";
export const DEFAULT_CLASSIFY_MODEL = "anthropic/claude-haiku-4.5";

export const AGENT_MODEL =
  process.env.AGENT_MODEL?.trim() || DEFAULT_AGENT_MODEL;

export const CLASSIFY_MODEL =
  process.env.CLASSIFY_MODEL?.trim() || DEFAULT_CLASSIFY_MODEL;

export const SYNTHESIS =
  "Route synthesis and ping drafting to AGENT_MODEL; route batch signal extraction to CLASSIFY_MODEL.";

/** Resolve the model id for a role, honoring env and optional override. */
export function resolveModel(
  role: ModelRole,
  override?: string | null,
): string {
  const trimmed = override?.trim();
  if (trimmed) {
    return trimmed;
  }
  return role === "agent" ? AGENT_MODEL : CLASSIFY_MODEL;
}

/** Parse a comma-separated list of model ids (for eval matrix sweeps). */
export function parseModelList(
  value: string | undefined,
  fallback: string[],
): string[] {
  if (!value?.trim()) {
    return fallback;
  }
  const ids = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return ids.length > 0 ? [...new Set(ids)] : fallback;
}

export function catalogForRole(role: ModelRole): ModelCatalogEntry[] {
  return MODEL_CATALOG.filter((entry) => entry.role === role);
}
