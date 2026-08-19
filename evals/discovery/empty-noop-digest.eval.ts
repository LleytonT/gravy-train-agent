import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description:
    "An empty discovery result must not fabricate opportunities or pad a digest.",
  tags: ["deterministic", "discovery"],
  async test(t) {
    await t.send(
      "Anything new in tonight's discovery? Discovery result: empty — zero results.",
    );
    t.succeeded();
    t.calledTool("list_opportunities", { status: "completed", count: 1 });
    t.notCalledTool("create_opportunity");
    t.notCalledTool("send_telegram_message");
    t.check(t.reply, includes(/nothing notable/i));
  },
});
