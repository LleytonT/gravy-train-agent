#!/usr/bin/env npx tsx
/**
 * GS-009 acceptance: a failed hard gate must make `eve eval` exit non-zero.
 * Runs one intentionally broken eval against the fixture agent.
 */
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

async function main() {
  const dir = await mkdtemp(join(tmpdir(), "gravy-eval-fail-"));
  const evalsDir = join(dir, "evals");
  await mkdir(evalsDir);

  // Minimal broken suite copied beside a symlink isn't needed — we invoke
  // eve eval with a filter against a temp eval file under the real project
  // by writing into evals/_tmp_fail_gate.eval.ts then deleting it.
  const failPath = join(process.cwd(), "evals", "_tmp_fail_gate.eval.ts");
  await writeFile(
    failPath,
    `import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "Intentional failing gate for exit-code smoke.",
  tags: ["tmp-fail-gate"],
  async test(t) {
    await t.send("Hello!");
    t.succeeded();
    t.check(t.reply, includes("__this_token_must_not_appear__"));
  },
});
`,
    "utf8",
  );

  try {
    const code = await runEveEval(["--tag", "tmp-fail-gate"]);
    if (code === 0) {
      throw new Error(
        `expected non-zero exit for a failed gate, got ${code}`,
      );
    }
    console.log(`ok: failed gate exited with code ${code}`);
  } finally {
    await rm(failPath, { force: true });
    await rm(dir, { recursive: true, force: true });
  }
}

function runEveEval(args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["exec", "eve", "eval", ...args],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          GRAVY_SCOUT_EVAL_FIXTURE: "1",
        },
        stdio: "inherit",
      },
    );
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
