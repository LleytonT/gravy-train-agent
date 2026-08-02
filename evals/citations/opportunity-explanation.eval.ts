import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

const CITATION_URL = "https://example.com/sources/fireworks-apac-se-2026";

export default defineEval({
  description:
    "Opportunity explanations must load the dossier and cite a source URL (hard gate).",
  tags: ["deterministic", "citations"],
  async test(t) {
    await t.send("Why is Fireworks a fit for me?");
    t.succeeded();
    t.calledTool("get_company_dossier", {
      input: { company: "Fireworks" },
      status: "completed",
      count: 1,
    });
    t.check(t.reply, includes(CITATION_URL));
    t.check(t.reply, includes(/Fireworks/i));
  },
});
