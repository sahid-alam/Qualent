# ADR-0007: One AI adapter; the model is chosen later

Status: Accepted, 2026-11-01. The owner: "we will figure out model later".

**Context:** the owner leans towards free Ollama models such as Gemma, and has not decided. Prices and models change often. Kimi's privacy policy lists training on user content.

**Decision:**
- One `aiRun()` function, one OpenAI-format adapter, and an `ai_models` row per model. No model is configured in v1 yet.
- With no model, leads flow normally and stay unscored. Nothing fakes a score.
- Lead data only reaches models with `no_training = true`, enforced in `aiRun()` and tested.
- Names, phones and emails become placeholders. The model has no tools, and output is schema-checked.
- Monthly budget per client: warn at 80%, stop at 100%.

**Options when deciding:** see ARCHITECTURE.md section 9. Gemma is free but needs a machine: about $0.40 per 1,000 leads on Ollama Cloud (reported price, unverified), or $155–423 a month for our own server. Gemma's Arabic and JSON quality are untested.

**Consequences:** adding a model means one row and an API key in the environment, with no code change, then running the test set.
