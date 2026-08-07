# Evals

Two complementary suites share `evals/`:

| Suite | Entry | Purpose |
| --- | --- | --- |
| **Eve evals (GS-009)** | `pnpm test:evals` | Deterministic agent behavior via `eve eval` + `.eval.ts` (mockModel, no Gateway/Neon) |
| **Model / fine-tune harness** | `pnpm eval` / `eval:*` | Scoring + classify gold + digest/chat fixtures; multi-LLM compare and fine-tune export |

---

## Eve evaluation suite (GS-009)

Deterministic regression checks for Gravy Scout agent behavior. Evals drive the same Eve HTTP surface members use and assert on replies, tool calls, persisted fixture outcomes, and safety boundaries.

### Fixture agent

Set `GRAVY_SCOUT_EVAL_FIXTURE=1` before running. That switches `agent/agent.ts` to Eve's `mockModel`, maps loopback auth to a stable fixture member, and routes the tools exercised by these cases through an in-memory store — so the suite runs **without AI Gateway or Neon credentials**.

### Commands

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

### Coverage

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

---

## Model / fine-tune harness

Offline + live harness for scoring, classification, digests, and chat tool-use — built so you can **pick an LLM** or **point at a fine-tuned model** with measurable quality. Does not replace GS-009; use Eve evals for agent behavior gates and this harness for model choice / fine-tune quality.

### What you need (fine-tune or multi-LLM)

| Need | Why | Status in this repo |
| --- | --- | --- |
| **Labeled classify gold set** | Supervised signal for fine-tuning + accuracy for model choice | `fixtures/classify-gold.json` (starter; expand before a real fine-tune) |
| **Deterministic scoring suite** | Scoring stays code, not a model — regression-proof the rubric | `pnpm eval:scoring` (broader than `pnpm test:scoring` smoke) |
| **Digest rubric** | Structural checks on ping copy (length, urgency, no markdown walls) | `pnpm eval:digest` |
| **Chat / tool scenarios** | Preference updates + dossier questions must hit the right tools | `pnpm eval:chat` (+ optional live; overlaps intent with GS-009 memory evals) |
| **Model registry / env overrides** | Swap `AGENT_MODEL` / `CLASSIFY_MODEL` (or a fine-tuned Gateway id) | `agent/lib/models.ts` |
| **Compare matrix** | Same fixtures × multiple Gateway ids → accuracy + latency | `pnpm eval:compare` |
| **Fine-tune export** | JSONL of classify prompt → gold signals | `pnpm eval:export` |
| **AI Gateway key** | Live classify / compare / chat | `AI_GATEWAY_API_KEY` |
| **Human-reviewed labels** | Synthesized export targets are a bootstrap — replace before training | Your labeling pass |
| **Keep scoring deterministic** | Do **not** fine-tune the Gravy Train Index — only classify + optionally digest tone | `agent/lib/scoring.ts` |

### Recommended path

1. Grow `fixtures/classify-gold.json` to ≥50–100 diverse items (positives, negatives, noise, edge companies).
2. Optionally add explicit `expected.goldSignals[]` per case (best fine-tune targets).
3. `pnpm eval:export` → review `data/evals/classify-finetune.jsonl`.
4. Train with your provider; register the resulting Gateway model id.
5. `CLASSIFY_MODEL=<fine-tuned-id> pnpm eval:classify`
6. `CLASSIFY_MODELS=anthropic/claude-haiku-4.5,<fine-tuned-id>,openai/gpt-5-mini pnpm eval:compare`
7. For agent/chat model choice: set `AGENT_MODEL`, then run GS-009 (`pnpm test:evals`) plus optional `EVAL_LIVE=1 pnpm eval:chat`.

Scoring math and ping tiers stay in TypeScript. Fine-tune **classification** (and optionally digest style later); compare **agent** models on tool-use + digest quality.

### Commands

| Command | Needs key? | Purpose |
| --- | --- | --- |
| `pnpm eval` | No | Offline suites: scoring + digest + chat fixtures |
| `pnpm eval:scoring` | No | Expanded Gravy Train Index + preference parsing |
| `pnpm eval:digest` | No | Digest structure rubric |
| `pnpm eval:chat` | No* | Fixture checks; `EVAL_LIVE=1` hits session API |
| `pnpm eval:classify` | Yes | Gold-label accuracy for `CLASSIFY_MODEL` |
| `pnpm eval:compare` | Yes | Multi-model classify matrix → `data/evals/compare-*.json` |
| `pnpm eval:export` | No | Fine-tune JSONL export |

\* Live chat also needs a running agent (`pnpm dev:no-ui`) and usually a Gateway key. Prefer GS-009 for deterministic tool-use gates.

### Env knobs

```bash
AGENT_MODEL=anthropic/claude-sonnet-5          # chat / synthesis / digests
CLASSIFY_MODEL=anthropic/claude-haiku-4.5      # batch signal extraction
CLASSIFY_MODELS=id1,id2,id3                    # compare sweep
EVAL_CLASSIFY_MODEL=...                        # single-run classify override
EVAL_LIVE=1 EVAL_BASE_URL=http://127.0.0.1:2000
GRAVY_SCOUT_EVAL_FIXTURE=1                     # Eve eval fixture agent only
```

Catalog of suggested Gateway ids: `agent/lib/models.ts` (`MODEL_CATALOG`).
