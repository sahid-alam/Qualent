# ADR-0007: One AI adapter, with Gemma through Ollama for lead work

Status: Accepted, 2026-11-01. The owner chose free Ollama models such as Gemma; where it runs is the architect's choice.

**Context:** the owner wants free models. Gemma 4 is free to use (Apache 2.0 [Secondary]), but it still needs a machine, and Vercel cannot host it. Kimi's privacy policy lists training on user content.

**Decision:**
- One `ai.run()` function, one OpenAI-format adapter, and an `ai_models` config row per model.
- Gemma 4 handles lead work: local Ollama for building and testing, **Ollama Cloud `gemma4:cloud` in production**.
- `kimi-k3.1-pro` with `reasoning_effort: low` handles ad analysis on aggregated numbers only. The owner's choice of Ollama did not address this job, so it stays.
- The router refuses to send lead data to any model with `no_training = false`.
- Names, phones and emails become placeholders. The model has no tools, and output is schema-checked.

**Why not our own server first:** about $155 a month for a slow CPU server or $423 for a GPU, against about $0.40 per 1,000 leads on Ollama Cloud (reported price, unverified).

**Consequences:**
- Lead data leaves our hosting and is probably processed in the US. Ollama says it is "never logged or trained on", which is not independently checked. Terms and counsel's view come before real lead data.
- Gemma's Arabic and JSON quality is untested. The M8 test set decides, and `gemini-3.1-flash-lite` is the fallback.
- Every new model must pass the same test set. Swapping needs no code.

**Switch to our own server if:** a contract forbids outside AI, counsel objects, or monthly Ollama Cloud spend passes about $155.

**To record in M8:** Ollama Cloud's terms, its confirmed Gemma price, and the test results.
