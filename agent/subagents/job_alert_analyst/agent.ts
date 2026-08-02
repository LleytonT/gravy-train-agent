import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Extract roles, locations, compensation, and canonical links from job-alert source items. Prefer structured fields already on the source item payload; return advertised candidate roles only.",
  model: process.env.CLASSIFY_MODEL ?? "anthropic/claude-haiku-4.5",
});
