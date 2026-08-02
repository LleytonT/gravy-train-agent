import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Verify company expansion, funding, filings, leadership, and hiring evidence with a small web-search budget. Return structured facts with citations and observed times.",
  model: process.env.CLASSIFY_MODEL ?? "anthropic/claude-haiku-4.5",
});
