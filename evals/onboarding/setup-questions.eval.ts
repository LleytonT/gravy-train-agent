import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description:
    "Onboarding kickoff selects recommend_roles and asks clarifying questions.",
  tags: ["deterministic", "onboarding", "tools"],
  async test(t) {
    await t.send(
      "[eval:onboarding] I just finished setup — what roles fit me?",
    );
    t.succeeded();
    t.calledTool("recommend_roles", { status: "completed", count: 1 });
    t.notCalledTool("create_opportunity");
    t.check(t.reply, includes(/Fireworks|Decagon/i));
    t.check(t.reply, includes(/\?/));
  },
});
