export type CheckResult = {
  id: string;
  ok: boolean;
  detail?: string;
};

export class EvalReporter {
  readonly suite: string;
  readonly checks: CheckResult[] = [];
  meta: Record<string, unknown> = {};

  constructor(suite: string) {
    this.suite = suite;
  }

  check(id: string, ok: boolean, detail?: string): void {
    this.checks.push({ id, ok, detail });
    const mark = ok ? "PASS" : "FAIL";
    const suffix = detail ? ` — ${detail}` : "";
    console.log(`  [${mark}] ${id}${suffix}`);
  }

  assert(id: string, ok: boolean, detail?: string): void {
    this.check(id, ok, detail);
    if (!ok) {
      throw new Error(`${this.suite}/${id} failed${detail ? `: ${detail}` : ""}`);
    }
  }

  summary(): { passed: number; failed: number; total: number } {
    const passed = this.checks.filter((c) => c.ok).length;
    const failed = this.checks.length - passed;
    return { passed, failed, total: this.checks.length };
  }

  finish(exitOnFail = true): number {
    const { passed, failed, total } = this.summary();
    console.log(
      JSON.stringify(
        {
          suite: this.suite,
          passed,
          failed,
          total,
          ...this.meta,
        },
        null,
        2,
      ),
    );
    if (failed > 0 && exitOnFail) {
      process.exitCode = 1;
    }
    return failed;
  }
}

export function normalizeCompany(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeSignalType(type: string): string {
  return type.trim().toLowerCase().replace(/\s+/g, "_");
}

export function companyMatches(
  actual: string,
  expectedAnyOf: string[],
): boolean {
  const normalized = normalizeCompany(actual);
  return expectedAnyOf.some((candidate) => {
    const expected = normalizeCompany(candidate);
    return (
      normalized === expected ||
      normalized.includes(expected) ||
      expected.includes(normalized)
    );
  });
}
