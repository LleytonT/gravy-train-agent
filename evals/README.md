# Gravy Scout evals

Offline + live harness for scoring, classification, digests, and chat tool-use — built so you can **pick an LLM** or **point at a fine-tuned model** with measurable quality.

## What you need (fine-tune or multi-LLM)

| Need | Why | Status in this repo |
| --- | --- | --- |
| **Labeled classify gold set** | Supervised signal for fine-tuning + accuracy for model choice | `fixtures/classify-gold.json` (starter; expand before a real fine-tune) |
| **Deterministic scoring suite** | Scoring stays code, not a model — regression-proof the rubric | `pnpm eval:scoring` |
| **Digest rubric** | Structural checks on ping copy (length, urgency, no markdown walls) | `pnpm eval:digest` |
| **Chat / tool scenarios** | Preference updates + dossier questions must hit the right tools | `pnpm eval:chat` (+ optional live) |
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
7. For agent/chat model choice: set `AGENT_MODEL`, run chat scenarios live against `pnpm dev:no-ui`.

Scoring math and ping tiers stay in TypeScript. Fine-tune **classification** (and optionally digest style later); compare **agent** models on tool-use + digest quality.

## Commands

| Command | Needs key? | Purpose |
| --- | --- | --- |
| `pnpm eval` | No | Offline suites: scoring + digest + chat fixtures |
| `pnpm eval:scoring` | No | Gravy Train Index + preference parsing |
| `pnpm eval:digest` | No | Digest structure rubric |
| `pnpm eval:chat` | No* | Fixture checks; `EVAL_LIVE=1` hits session API |
| `pnpm eval:classify` | Yes | Gold-label accuracy for `CLASSIFY_MODEL` |
| `pnpm eval:compare` | Yes | Multi-model classify matrix → `data/evals/compare-*.json` |
| `pnpm eval:export` | No | Fine-tune JSONL export |

\* Live chat also needs a running agent (`pnpm dev:no-ui`) and usually a Gateway key.

## Env knobs

```bash
AGENT_MODEL=anthropic/claude-sonnet-5          # chat / synthesis / digests
CLASSIFY_MODEL=anthropic/claude-haiku-4.5      # batch signal extraction
CLASSIFY_MODELS=id1,id2,id3                    # compare sweep
EVAL_CLASSIFY_MODEL=...                        # single-run classify override
EVAL_LIVE=1 EVAL_BASE_URL=http://127.0.0.1:2000
```

Catalog of suggested Gateway ids: `agent/lib/models.ts` (`MODEL_CATALOG`).
