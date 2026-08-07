import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Compare one candidate role with one career profile. Enforce hard constraints, produce fit rationale that cites persisted signal ids, and never override explicit member preferences.",
  model: process.env.AGENT_MODEL ?? "anthropic/claude-sonnet-5",
});
