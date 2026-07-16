# Entity Enricher — Make.com Custom App

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A [Make.com](https://www.make.com) Custom App for [**Entity Enricher**](https://entityenricher.ai) — an AI-powered platform that **enriches any entity against a JSON schema using multiple LLMs in parallel**, with automatic fusion, **multilingual output in 40 languages**, and pre-flight classification.

> Drop a single Make module into any scenario, map an entity from a previous step, and receive a structured, schema-validated, multi-model-fused JSON object — with multilingual output produced in a single LLM pass. No SSE handling, no retry plumbing, no prompt engineering.

![Demo: enriching an entity inside a Make scenario](https://entityenricher.ai/docs/demo-single-enrichment-make-connector.gif)

---

## What this app does

Exposes Entity Enricher's REST API as **7 first-class Make modules** with dynamic dropdowns, plan-limit-aware error handling, and **one-call enrichment** (no SSE plumbing on the Make side).

| Category | Module | Endpoint | Type |
|---|---|---|---|
| **Enrichment** | Enrich Entity | `POST /api/single/enrich/sync` | Action |
| **Schemas** | List Schemas | `GET /api/schema/saved` | Search |
| **Schemas** | Get Schema Details | `GET /api/schema/saved/{id}` | Action |
| **Records** | List Records | `GET /api/records` | Search |
| **Records** | Get Record | `GET /api/records/{id}` | Action |
| **Fusion** | Merge Results | `POST /api/fusion/merge` | Action |
| **Attachments** | Upload Attachment | `POST /api/attachments` (multipart) | Action |
| **Attachments** | Delete Attachment | `DELETE /api/attachments/{id}` | Action |
| **Configuration** | Get Options | `GET /api/enrichment/options` | Action |

### Designed for Make

Entity Enricher's primary public endpoint streams Server-Sent Events, which Make modules can't natively consume. The backend exposes a dedicated `POST /api/single/enrich/sync` endpoint that wraps the streaming flow internally and returns the final fused result in a **single HTTP response** — so each Make operation = one bundle, no polling, no two-module patterns.

### Why no batch module

Make scenarios bill **per operation**. To process N entities, use Make's built-in **Iterator** + this app's *Enrich Entity* — that pattern is cheaper, more transparent, and gives users granular per-entity error handling (vs. a single batch module that fails opaquely if one entity errors out).

---

## Installation

### Sideloading (until v1.x lands on the Make marketplace)

1. Sign in to your Make organisation as a developer.
2. Go to **Apps → Create a new app → Custom App**.
3. Either upload this directory as a `.zip`, or paste the contents of each `.json` / `.imljson` file into the corresponding tab in the editor.
4. Add a connection — two types are available on every module:
   - **Entity Enricher OAuth 2.0** (easiest): click *Create a connection*, sign in to Entity Enricher, and click **Authorize**. The connection acts on your behalf with your own role; manage or revoke it anytime under Entity Enricher → *API Keys → Connected Apps*.
   - **Entity Enricher API Key**: paste a key from Entity Enricher → *Settings → API Keys* (format `ent_XXXXXXXXXXXX`). The connection auto-tests against `/api/enrichment/options`. Recommended for durable service-to-service scenarios — an organization access key keeps working even if the person who created it changes role or leaves.

The **Base URL** defaults to `https://entityenricher.ai` and only needs to change for self-hosted deployments. Self-hosted OAuth additionally needs a seeded confidential client (`AUTH_OAUTH_SEED_CLIENTS`, redirect URI `https://www.integromat.com/oauth/cb/app`) whose ID/secret go in the connection's advanced fields.

![API Key connection setup form](https://entityenricher.ai/docs/make-connector-connection-setup.png)

### Marketplace install

> v1.0 is published to the Make.com public marketplace — install via the standard "Add a module" picker once it's listed.

---

## Quickstart — Enrich a single entity

Drop one **Enrich Entity** module into a scenario, configure schema + models + languages, map the entity from a previous step:

```
[any trigger]  ─►  Enrich Entity (this app)  ─►  [downstream module]
                       │
                       ├ Schema:    📌 Pharmaceutical Company
                       ├ Models:    Claude Sonnet 4.5 + GPT-4o
                       ├ Languages: en, fr, de, ja
                       ├ Strategy:  multi_expertise
                       └ Entity:    {{trigger.json}}
```

Models is optional — leave it empty for **Auto**: Entity Enricher uses your organization's best-scoring model (a pinned organization default wins when set; single model, no fusion). When 2+ models are selected, the result is **automatically fused** server-side. The Make output bundle includes `is_fused: true`, the list of `source_models`, and a `fusion: {agreed_fields, conflicted_fields, total_fields}` summary.

![Configuring the Enrich Entity module](https://entityenricher.ai/docs/make-connector-add.gif)

---

## Multilingual enrichment in one pass

Pick more than one language and Entity Enricher populates every multilingual property in **all selected languages in a single LLM call** — not N round-trips per language. Localized values come back as a flat `{en, fr, de, ...}` object inside each property:

```jsonc
// One Enrich Entity call with languages = ["en", "fr", "de", "ja"]
{
  "names": {
    "primary": {
      "en": "Aspirin",
      "fr": "Aspirine",
      "de": "Aspirin",
      "ja": "アスピリン"
    }
  },
  "indications": {
    "en": "Pain, fever, inflammation; antiplatelet therapy.",
    "fr": "Douleur, fièvre, inflammation ; antiagrégant plaquettaire.",
    "de": "Schmerz, Fieber, Entzündung; Thrombozytenaggregationshemmer.",
    "ja": "痛み、発熱、炎症;抗血小板療法。"
  }
}
```

Downstream Make modules can map any language directly: `{{enrichEntity.result.names.primary.fr}}`. 40 supported languages cover the major European, Asian, Middle Eastern, and African markets.

![Languages multi-select dropdown showing 40 supported languages](https://entityenricher.ai/docs/make-connector-languages.png)

---

## Dynamic dropdowns

Every selectable field is populated by an RPC that hits the Entity Enricher API at configuration time. Pinned schemas surface first (marked with 📌), model labels include your organization's benchmark score (★ overall plus a Quality/Speed/Cost breakdown, when scoring benchmarks are configured) and per-million-token pricing, and plan-limited orgs see a notice when their quota is reached.

![Schemas dropdown open with pinned schemas at the top](https://entityenricher.ai/docs/make-connector-schemas.png)

---

## Multi-entity workflows — Iterator pattern

```
[trigger: array of entities]
       ↓
[Make: Iterator]              (splits into N bundles)
       ↓
[this app: Enrich Entity]     (one operation per entity)
       ↓
[Make: Aggregator]            (recombines, optionally with skip-on-error)
       ↓
[downstream: upsert to CRM / database]
```

Each iteration is independent — failures of one entity don't abort the others, and Make's per-operation billing reflects exactly how much was processed.

![Iterator pattern for multi-entity enrichment](https://entityenricher.ai/docs/make-connector-batch-entichment.gif)

---

## Plan-limit awareness

Profile-limited orgs see structured 402 errors when they exceed quota — Make surfaces these as typed `OutOfMoneyError` with the limit `code`, `used`, and `limit` fields. Branch on this in your scenario to fall back to a cheaper model, alert a human, or wait for the quota window to reset.

![Error handler branching on OutOfMoneyError](https://entityenricher.ai/docs/make-connector-error-handling.png)

| HTTP | Make error type | When it fires |
|---|---|---|
| `400` | `DataError` | Schema not found, missing search keys, invalid models or languages. |
| `401` | `InvalidCredentials` | Bad or missing API key, or a revoked/expired OAuth connection. |
| `402` | `OutOfMoneyError` | Plan limit exceeded OR insufficient credits. Includes `code` (`insufficient_credits`, `model_limit_exceeded`, …). |
| `403` | `AccessDeniedError` | Role or scope insufficient. |
| `404` | `InvalidConfigurationError` | Schema or record not found. |
| `422` | `DataError` | Classification warning. `body.detail.classification` carries status, reasoning, confidence. |
| `429` | `RateLimitError` | Provider rate limit (transient). |
| `499` | `RuntimeError` | Job cancelled. |
| `502` | `ConnectionError` | Upstream LLM provider error. |
| `504` | `ConnectionError` | `timeout_seconds` elapsed; job auto-cancelled server-side. |

---

## What is Entity Enricher?

Entity Enricher treats LLMs as **queryable knowledge bases**. You define a JSON schema describing the data you want — fields, types, descriptions, expertise domains — and Entity Enricher orchestrates one or more LLM providers (Anthropic, OpenAI, Google Gemini, DeepSeek, Cohere, Mistral, X.AI, Ollama, …) to fill it in. The output is validated against your schema, deduplicated across models, and stored for analytics.

**What makes it different:**

- **Multilingual by design** — 40 supported languages. A single property can carry localized values populated **in a single LLM pass** — not N sequential round-trips per language. Core capability, not an afterthought.
- **Multi-model fusion** — Run an entity through 2+ models in parallel; conflicts are resolved field-by-field via a deterministic merger or an LLM arbiter, with a per-field agreement report.
- **Pre-flight classification** — A cheap classifier model verifies the entity matches the schema's expected type *before* expensive enrichment runs. Mismatches are surfaced as typed warnings instead of producing hallucinated data.
- **Expertise-driven prompts** — Schemas can group properties by expertise domain. The `multi_expertise` strategy runs one focused LLM call per domain in parallel, producing higher-quality results for large schemas.
- **AI schema generation with self-correction** — Paste sample data, get a validated schema back; the LLM uses Pydantic-AI's `ModelRetry` to self-correct invalid output.
- **REST API with role-based access** — Organization access keys with their own roles, scoped permissions, plan-based quotas.

Learn more: [entityenricher.ai](https://entityenricher.ai) · [Documentation](https://entityenricher.ai/docs) · [Make integration guide](https://entityenricher.ai/docs/integrations/make)

---

## Workflow ideas

- **CRM enrichment** — Trigger on new HubSpot/Salesforce contacts, enrich with company data, update the CRM record.
- **Spreadsheet pipeline** — Read entities from Google Sheets, Iterator + Enrich Entity, write results back to a new sheet.
- **Conditional re-arbitration** — Run rule-based fusion first; if `conflicted_fields > 5`, re-merge with an LLM arbiter via *Merge Results* — without re-running the costly enrichment.
- **Plan-limit routing** — On `OutOfMoneyError`, alert a human in Slack and pause the scenario until the quota window resets.
- **Scheduled refresh** — Run on a cron schedule (Make Schedule trigger) to re-enrich stale records with the latest models.

---

## License

MIT — see [LICENSE](LICENSE). Built by [TOT Concept](https://entityenricher.ai). Questions or feedback: [contact@entityenricher.ai](mailto:contact@entityenricher.ai).
