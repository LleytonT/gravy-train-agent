import { defineEval } from "eve/evals";
import { equals, includes } from "eve/evals/expect";

export default defineEval({
  description:
    "Multi-turn topic switch must preserve explicit profile preferences.",
  tags: ["deterministic", "memory"],
  async test(t) {
    const first = await t.send(
      "Please update my preference: I only want remote roles.",
    );
    first.calledTool("update_user_profile", {
      input: { preferenceKey: "remoteOnly", preferenceValue: true },
      status: "completed",
    });

    const second = await t.send(
      "Switching topics — tell me about Fireworks as a fit.",
    );
    await t.require(second.sessionId, equals(first.sessionId));
    second.calledTool("get_company_dossier", {
      input: { company: "Fireworks" },
      status: "completed",
    });

    const third = await t.send("What are my preferences?");
    third.calledTool("update_user_profile", {
      input: { action: "read" },
      status: "completed",
    });
    t.succeeded();
    t.check(third.message, includes(/remoteOnly/i));
  },
});
