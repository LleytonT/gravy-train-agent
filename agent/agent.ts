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
    ? { model: createEvalFixtureModel() }
    : { model: AGENT_MODEL, reasoning: "low" },
);
