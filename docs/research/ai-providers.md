# AI Provider Check — Kimi (Moonshot AI) and Alternatives

Last checked: 2026-11-01. Prices are USD per 1M tokens. Prices change often, so check again before launch.

## TL;DR

- **Kimi is no longer the cheapest option.** Its low-cost K2 models closed to **new sign-ups on Oct 31, 2026** and **shut down by end of Dec 2026** (official notice). What's left is the K3 family, a premium flagship (K3: $3 in / $15 out).
- **Kimi's privacy policy lists "training and refining" its models among its uses of user content**, with servers in Singapore (official). So it should not receive lead data unless Moonshot gives written no-training terms.
- The API is **OpenAI-compatible** (`https://api.moonshot.ai/v1`, OpenAI SDK, Bearer key), so switching is cheap.
- **Decision (2026-11-01):** Gemma 4 through Ollama for routine lead work, and `kimi-k3.1-pro` with `reasoning_effort: low` for ad analysis on aggregated numbers only. `gemini-3.1-flash-lite` is the fallback. See [ARCHITECTURE.md](../ARCHITECTURE.md) section 9.

## Kimi — verified facts

| Fact | Value | Source |
|---|---|---|
| Current models | `kimi-k3.1-pro`, `kimi-k3.1-pro-highspeed`, `kimi-k3`, `kimi-k2.7-code`, `kimi-k2.7-code-highspeed`, `kimi-k2.6` | [Model list (official)](https://platform.kimi.ai/docs/models.md) |
| Context window | K3 series 1,048,576 tokens; K2 series 262,144 tokens | [Pricing page (official)](https://platform.kimi.ai/docs/pricing/chat.md) |
| K2 retirement | No new users from **2026-10-31**; all K2 retired by **end of Dec 2026** | [Pricing page (official)](https://platform.kimi.ai/docs/pricing/chat.md) |
| Already gone | `kimi-k2.5` and `moonshot-v1-*` (2026-08-31), `kimi-k2-*` previews (2026-05-25), `kimi-latest` (2026-01-28) | [Model list (official)](https://platform.kimi.ai/docs/models.md) |
| API format | OpenAI-compatible Chat Completions. `base_url="https://api.moonshot.ai/v1"`, `Authorization: Bearer $MOONSHOT_API_KEY`. Supports tools, `tool_choice`, `json_schema` with `strict: true`, streaming, vision | [K3.1 Pro quickstart (official)](https://platform.kimi.ai/docs/guide/kimi-k3-1-pro-quickstart.md) |
| Thinking | K3.1 Pro always thinks. `reasoning_effort`: `low` / `high` / `max` (default `max`, the most expensive). Parse `message.content`, not `reasoning_content` | same |
| Access | Flagship models unlock after a $1 minimum top-up; rate limits depend on total top-ups | same, and [limits (official)](https://platform.kimi.ai/docs/pricing/limits.md) |
| Caching | Automatic prefix caching, 5-minute TTL by default; K3 charges for cache writes by TTL | [Pricing page (official)](https://platform.kimi.ai/docs/pricing/chat.md) |
| Billing | Pay-as-you-go, plus tax | same |
| Company and data location | Moonshot AI Pte. Ltd., Singapore. Data stored on servers in Singapore | [Privacy policy (official)](https://platform.kimi.ai/docs/agreement/userprivacy.md) |
| Training | Policy includes "training and refining our underlying technology, such as machine learning models" among uses of User Content. Whether an API opt-out or separate business terms exist is **not confirmed** | same |

## Kimi — prices (secondary sources)

The official pricing tables load with JavaScript and came back empty when fetched. These numbers come from third-party trackers:

| Model | Input (cache hit) | Input | Output | Source |
|---|---|---|---|---|
| `kimi-k3` | $0.30 | $3.00 | $15.00 | [CloudZero, updated 2026-10-15](https://www.cloudzero.com/blog/kimi-api-pricing/) |
| `kimi-k2.6` (retiring) | $0.16 | $0.95 | $4.00 | same |
| `kimi-k2.7-code` (retiring) | $0.19 | $0.95 | $4.00 | same |
| `kimi-k3.1-pro` | ? | $2.00 [UNVERIFIED] | $10.00 [UNVERIFIED] | [BenchLM](https://benchlm.ai/moonshot/api-pricing), single source |

**Before launch:** confirm the K3.1 Pro price in the Kimi console, since budgets depend on the price table.

## Cheaper alternatives

| Model | Input | Output | Data use | Source |
|---|---|---|---|---|
| `gemini-3.1-flash-lite` | $0.25 (batch $0.125) | $1.50 (batch $0.75) | Paid tier: not used to improve products | [Google pricing (official)](https://ai.google.dev/gemini-api/docs/pricing) |
| `gemini-3.5-flash-lite` | $0.30 (batch $0.15) | $2.50 (batch $1.25) | Same | same |
| `deepseek-flash` (V4.1 Flash) | $0.30 peak, $0.15 off-peak | $1.20 peak, $0.60 off-peak | Not checked; do not send lead data until it is | [DeepSeek pricing (official)](https://api-docs.deepseek.com/quick_start/pricing) |
| GPT-5.6 Luna (OpenAI) | $0.20 | $1.20 | Not checked | [CloudZero, updated 2026-09-30](https://www.cloudzero.com/blog/llm-api-pricing-comparison/), secondary |
| Claude Haiku 4.5 (Anthropic) | $1.00 | $5.00 | Not checked | same, secondary. Haiku 5.5 pricing not checked |

## Ollama (self-hosted)

| Fact | Value | Source |
|---|---|---|
| API format | OpenAI-compatible at `http://localhost:11434/v1/`. `response_format` and JSON mode listed; `json_schema` not confirmed | [Ollama docs (official)](https://docs.ollama.com/api/openai-compatibility) |
| Concurrency | `OLLAMA_NUM_PARALLEL` defaults to 1 per model. Queue limit 512, then 503 errors | [Ollama FAQ (official)](https://docs.ollama.com/faq) |
| Login | The client's API key is ignored on a local server, and the FAQ covers no server login. Treat it as open and keep it on a private network | same two pages |
| GPU server cost | `g4dn.xlarge` in Mumbai: $0.579/hour, about $423/month running all the time | [DoiT](https://www.doit.com/compute/spot/ap-south-1/g4dn.xlarge), secondary |
| Cloud Run GPU in Mumbai | Invitation only | [Google (official)](https://docs.cloud.google.com/run/docs/locations) |
| CPU server cost | `m7i.2xlarge` (8 vCPU, 32 GiB) in Mumbai: $0.4242/hour, about $310/month | [DoiT](https://www.doit.com/compute/spot/ap-south-1/m7i.2xlarge), secondary |
| Gemma 4 on Ollama | Tags from `e2b` to `31b`; `gemma4:e4b` is 6.6–9.5 GB. Cloud tags `gemma4:cloud` and `gemma4:31b-cloud` exist | [Ollama library (official)](https://ollama.com/library/gemma4) |
| Gemma 4 license | Apache 2.0 | [Slashdot](https://tech.slashdot.org/story/26/04/02/1735238/google-announces-gemma-4-open-ai-models-switches-to-apache-20-license), secondary |
| Gemma 4 CPU speed | About 2–7 tokens/second | [Gemma4all](https://gemma4all.com/blog/gemma-4-cpu-only), secondary |
| Ollama Cloud plans | Pay-as-you-go: $0 base, 3 concurrent. Pro: $20/month with $60 credits, 3 concurrent. Own hardware included | [Ollama pricing (official)](https://ollama.com/pricing) |
| Ollama Cloud privacy | "Prompt or response data is never logged or trained on"; partners "no logging, no training, and zero data retention". Not independently checked. Terms not yet read | same |
| Ollama Cloud location | Data may be processed in the US | [Tapbit](https://www.tapbit.com/en/learn/article/ollama-cloud-pricing-privacy-open-model-business-20260903), secondary |
| Gemma 4 price on Ollama Cloud | $0.14 in / $0.40 out per 1M for `gemma4:31b` [UNVERIFIED]; another tracker says no published price | [TypingMind](https://www.typingmind.com/guide/ollama-cloud/gemma4-31b), secondary |

**Decision:** Gemma 4, on local Ollama for building and Ollama Cloud in production. See [ARCHITECTURE.md](../ARCHITECTURE.md) section 9 for the comparison and the trigger to switch.

**Not found:** Gemma 4's Arabic quality and JSON reliability. The M8 test set decides.

## Rough cost comparison

One lead-scoring call, assuming about 2,000 input and 300 output tokens (my estimate):

| Model | Per call | Per 1,000 leads |
|---|---|---|
| `gemini-3.1-flash-lite` | ~$0.001 | ~$1 |
| `kimi-k3` | ~$0.0105 | ~$10.50 (more with thinking tokens) |
| Gemma 4 on Ollama Cloud | ~$0.0004 | ~$0.40 (reported price, unverified) |

## Design impact

- Kimi, DeepSeek and OpenRouter all speak the OpenAI format, so one adapter covers them, and each provider adds only a config row. Gemini's OpenAI-compatible endpoint is **not yet confirmed from official docs**.
- Store a **per-model price table and a `no_training` flag** in config, so budgets stay accurate and lead data only reaches approved models.
- Always set `reasoning_effort` on K3.1 Pro, because its default is the most expensive setting.
