import { defineAgent } from "eve";

import {
  createEvalFixtureModel,
  isEvalFixture,
  resetFixtureStore,
} from "./lib/eval-fixture/index.js";
import { AGENT_MODEL } from "./lib/models.js";

if (isEvalFixture()) {
  resetFixtureStore();
}

export default defineAgent(
  isEvalFixture()
    ? {
        model: createEvalFixtureModel(),
        // mockModel has no AI Gateway catalog entry — supply a window so
        // compaction can compile without provider metadata.
        modelContextWindowTokens: 128_000,
      }
    : { model: AGENT_MODEL, reasoning: "low" },
);
