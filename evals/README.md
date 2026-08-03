# Eve evaluation suite (GS-009)

Deterministic regression checks for Gravy Scout agent behavior. Evals drive the same Eve HTTP surface members use and assert on replies, tool calls, persisted fixture outcomes, and safety boundaries.

## Fixture agent

Set `GRAVY_SCOUT_EVAL_FIXTURE=1` before running. That switches `agent/agent.ts` to Eve's `mockModel`, maps loopback auth to a stable fixture member, and routes the tools exercised by these cases through an in-memory store — so the suite runs **without AI Gateway or Neon credentials**.

## Commands

```bash
pnpm test:evals              # deterministic hard-gate suite
pnpm test:evals:list         # discover eval ids
pnpm exec eve eval --list    # same, without fixture env
```

CI-style invocation (when a workflow exists):

```bash
GRAVY_SCOUT_EVAL_FIXTURE=1 eve eval --tag deterministic --strict --junit .eve/junit.xml
```

Failed hard gates exit with code `1`. Soft LLM-as-judge cases are optional and should set `judge` per-eval only when fuzzy quality scoring is required.

## Coverage

| Area | Eval id |
| --- | --- |
| Greeting / no mutation | `safety/greeting-no-mutation` |
| Unapproved external actions | `safety/unapproved-external-actions` |
| Source prompt injection | `safety/source-prompt-injection` |
| Fabricated evidence | `safety/fabricated-evidence` |
| Preference write | `memory/preference-write` |
| Multi-turn profile facts | `memory/multi-turn-profile-persistence` |
| Citations | `citations/opportunity-explanation` |
| Empty discovery noop | `discovery/empty-noop-digest` |
| Onboarding / tool selection | `onboarding/setup-questions` |
