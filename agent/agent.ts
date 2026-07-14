import { defineAgent } from "eve";

import { AGENT_MODEL } from "./lib/models.js";

export default defineAgent({
  model: AGENT_MODEL,
  reasoning: "low",
});
