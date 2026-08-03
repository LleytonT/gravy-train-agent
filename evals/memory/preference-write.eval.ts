import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description:
    "Explicit preference updates must call update_user_profile (hard gate).",
  tags: ["deterministic", "memory"],
  async test(t) {
    await t.send("Update my preference: I only want remote roles.");
    t.succeeded();
    t.calledTool("update_user_profile", {
      input: {
        action: "set_preference",
        preferenceKey: "remoteOnly",
        preferenceValue: true,
      },
      status: "completed",
      count: 1,
    });
    t.notCalledTool("create_opportunity");
    t.check(t.reply, includes(/saved/i));
  },
});
