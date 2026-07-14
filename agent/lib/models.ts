/**
 * Model configuration for Gravy Scout.
 *
 * SYNTHESIS: Use AGENT_MODEL for multi-step reasoning, dossier synthesis, and
 * outbound ping drafting. Use CLASSIFY_MODEL for high-volume batch extraction
 * from raw LinkedIn/X items where latency and cost matter more than nuance.
 */

export const AGENT_MODEL =
  process.env.AGENT_MODEL ?? "anthropic/claude-sonnet-5";

export const CLASSIFY_MODEL =
  process.env.CLASSIFY_MODEL ?? "anthropic/claude-haiku-4.5";

export const SYNTHESIS =
  "Route synthesis and ping drafting to AGENT_MODEL; route batch signal extraction to CLASSIFY_MODEL.";
