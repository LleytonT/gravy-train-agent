import { defineEval } from "eve/evals";
import { includes, satisfies } from "eve/evals/expect";

/** Former website-first refusal. Cold start must never regress to this. */
const WEBSITE_GATE_REFUSAL =
  /this telegram account is not linked yet|sign in on the web|open the one-time link from your signed-in gravy scout account on the web/i;

function notWebsiteGate(label: string) {
  return satisfies(
    (value) => !WEBSITE_GATE_REFUSAL.test(String(value)),
    label,
  );
}

export default defineEval({
  description:
    "Unknown Telegram identity is onboarded; website-gate refusal cannot regress.",
  tags: ["deterministic", "onboarding", "telegram"],
  async test(t) {
    const start = await t.send("/start");
    start.succeeded();
    t.usedNoTools();
    t.check(start.message, includes(/gravy scout|ready when you are/i));
    t.check(
      start.message,
      notWebsiteGate("bare /start must not refuse with a website-gate"),
    );

    const dm = await t.send(
      "[eval:telegram-cold-start] hi, a friend shared this bot — can we talk?",
    );
    dm.succeeded();
    t.check(
      dm.message,
      notWebsiteGate("first DM must not refuse with a website-gate"),
    );
    t.check(
      dm.message,
      includes(/gravy scout|ready when you are|want role matches|got it/i),
    );
  },
});
