# Entity Enricher for Make

Drop a single Make module into any scenario, map an entity from a previous step, and receive a structured, schema-validated, multi-model-fused JSON object — with multilingual output in 40 languages produced in a single LLM pass. 7 first-class modules with dynamic dropdowns and plan-limit-aware error handling, designed for Make's per-operation billing model.

![Demo: enriching an entity inside a Make scenario](https://entityenricher.ai/docs/demo-single-enrichment-make-connector.gif)

---

## Designed for Make

Entity Enricher already ships an [n8n connector](https://entityenricher.ai/docs/integrations/n8n) that consumes a Server-Sent Events stream. Make modules can't natively consume SSE — each module is one atomic HTTP call. To support enrichment as a single Make operation, the backend exposes a dedicated `POST /api/single/enrich/sync` endpoint that wraps the streaming flow server-side and returns the final fused result in one response.

| n8n connector | Make.com connector |
|---|---|
| `POST /enrich/stream` → `job_id` | `POST /enrich/sync` |
| `GET /llm/stream/{id}` | *(server awaits internally)* |
| `GET /llm/stream/{id}` | |
| *... (events)* | |
| `[final bundle out]` | `[final bundle out]` |

---

## Multilingual Enrichment in One Pass

Pick more than one language in the **Languages** field and Entity Enricher populates every multilingual property in **all selected languages in a single LLM call** — not N sequential round-trips per language. 40 languages cover the major European, Asian, Middle Eastern, and African markets.

Result of one Enrich Entity call with `languages = ["en", "fr", "de", "ja"]`:

```json
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

Downstream Make modules can map any language directly: `{{enrichEntity.result.names.primary.fr}}`. The Languages dropdown surfaces the full 40-language list, with a plan-limit notice when your organisation's profile caps the number of selectable languages.

![Languages multi-select dropdown showing 40 supported languages](https://entityenricher.ai/docs/make-connector-languages.png)

---

## Installation

The Make app source lives in the [public TOT-Concept repository](https://github.com/TOT-Concept/make-app-entity-enricher) (synced from the Entity Enricher monorepo). Until v1.0 lands on the Make marketplace, sideload via the Developer Hub:

1. Sign in to your Make organisation as a developer.
2. Go to **Apps → Create a new app → Custom App**.
3. Either upload the `make-app-entity-enricher/` directory as a `.zip`, or paste each `.json` / `.imljson` file into its tab in the editor.
4. Add an **API Key connection** using a key from Entity Enricher → Settings → API Keys (format `ent_XXXXXXXXXXXX`). The connection auto-tests against `/api/enrichment/options`.

![API Key connection setup form](https://entityenricher.ai/docs/make-connector-connection-setup.png)

---

## Dynamic Dropdowns

Every selectable field in the Make modules is populated by an RPC that hits the Entity Enricher API at configuration time. Pinned schemas surface first (marked with 📌), model labels include per-million-token pricing, and plan-limited orgs see a notice when their quota is reached.

![Schemas dropdown open with pinned schemas at the top](https://entityenricher.ai/docs/make-connector-schemas.png)

---

## Prerequisites

- **API Key** — Create an organisation access key in Entity Enricher. See the [API Keys documentation](https://entityenricher.ai/docs/platform/api-keys). Use an organisation access key (with its own role) for service-to-service integrations.
- **Base URL** — The URL of your Entity Enricher instance — defaults to `https://entityenricher.ai`. Override only for self-hosted deployments.

---

## Enrich Entity in Action

The central module exposes 11 input fields with dynamic dropdowns: schema, models (multi-select), languages (multi-select), strategy, optional classification & arbitration models, web search, timeout, and metadata toggles. Map an entity from any previous module via the `Entity data` field.

![Configuring the Enrich Entity module](https://entityenricher.ai/docs/make-connector-add.gif)

When 2+ models are selected, the result is automatically fused server-side. The Make output panel shows `is_fused: true`, the list of `source_models`, and a `fusion` summary counting agreed and conflicted fields:

![Make output panel: multi-model fused enrichment result](https://entityenricher.ai/docs/make-connector-multimodel.png)

---

## Available Modules

7 modules across 4 categories. Search modules emit one bundle per result for downstream Iterator/Aggregator chains; Action modules emit a single bundle.

| Category | Module | Description |
|---|---|---|
| **Enrichment** | Enrich Entity | Single-call enrichment with multi-model fusion. Returns the final fused (or best-single-model) result. Auto-cancels on classification warning. |
| **Schemas** | List Schemas | Returns one Make bundle per saved schema, ready for Iterator/Aggregator chains. |
| **Schemas** | Get Schema Details | Full schema content including expertise domains, properties, and search keys. |
| **Records** | List Records | Search past enrichment records with filters (type, success, free-text). |
| **Records** | Get Record | Retrieve a single enrichment result with full per-prompt metrics. |
| **Fusion** | Merge Results | Re-merge multiple enrichment results, optionally with a different LLM arbiter. |
| **Configuration** | Get Options | Available models, languages, strategies, and the org's plan limits. |

---

## Multi-Entity Workflows: Iterator Pattern

Make scenarios bill per operation. Instead of porting the n8n connector's Batch Enrich module, the Make app uses Make's built-in Iterator + Enrich Entity. Each iteration is independent, failures don't cascade, and billing reflects exactly what was processed.

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

![Iterator pattern for multi-entity enrichment](https://entityenricher.ai/docs/make-connector-batch-entichment.gif)

---

## Key Features

- **Multilingual in 40 Languages.** A single Enrich Entity call populates every multilingual property in all selected languages — produced in one LLM pass, not N sequential round-trips. Map any language directly: `{{result.names.primary.fr}}`.
- **One-Call Enrichment.** A dedicated `POST /api/single/enrich/sync` endpoint wraps the streaming flow server-side. One Make operation = one bundle. No polling, no two-module patterns.
- **Dynamic Dropdowns (RPCs).** 7 RPCs fetch schemas, models, languages, strategies, classification/arbitration models, and web-search options at configuration time — pinned schemas surface first, model labels include pricing.
- **Multi-Model Auto-Fusion.** Pick 2+ models and the result is automatically fused. The output bundle includes `is_fused`, `source_models[]`, and a `fusion: {agreed_fields, conflicted_fields, total_fields}` summary.
- **Pre-Flight Classification.** Optional cheap classifier model verifies the entity matches the schema's expected type before enrichment runs. Mismatches produce a typed `DataError` instead of hallucinated data.
- **Plan-Limit & Credit Awareness.** HTTP 402 errors (plan limits or insufficient credits) become typed Make `OutOfMoneyError`. The message echoes the backend's human-readable detail (with a billing top-up URL when credits are out) plus a machine-readable code — branch the scenario error handler on the code to alert humans, fall back to cheaper models, or pause.
- **Web-Search Dropdown Locks.** The Web Search dropdown reads `parameters.models` and disables itself when none of the selected models declares `supports_web_search`.
- **No Batch Module.** Make scenarios bill per operation. Multi-entity workflows use Make's built-in Iterator + Enrich Entity, giving granular per-entity error handling and exact billing.
- **Configurable Timeout.** Default 300-second timeout per call, bounded [10, 900]. The job is auto-cancelled server-side if it doesn't finish in time, returning a typed `ConnectionError`.

---

## Error Contract

Every status the backend can return is mapped to a typed Make error so scenario error handlers can branch on the failure mode rather than parsing strings.

![Error handler branching on OutOfMoneyError](https://entityenricher.ai/docs/make-connector-error-handling.png)

| HTTP | Make error type | When it fires |
|---|---|---|
| `400` | `DataError` | Schema not found, missing search keys, invalid models or languages. |
| `401` | `InvalidCredentials` | Bad or missing API key. |
| `402` | `OutOfMoneyError` | Plan limit exceeded OR insufficient credits. Message = `body.detail.detail` (human-readable, includes a top-up URL for `insufficient_credits`) + `body.detail.code` (machine-readable). Branch on the code: `insufficient_credits`, `model_limit_exceeded`, `language_limit_exceeded`, `concurrent_job_limit_reached`, `daily`/`weekly`/`monthly_prompt_limit_exceeded`. |
| `403` | `AccessDeniedError` | Role or scope insufficient. |
| `404` | `InvalidConfigurationError` | Schema or record not found. |
| `422` | `DataError` | Classification warning. `body.detail.classification` carries status, reasoning, confidence, entity_description. |
| `429` | `RateLimitError` | Provider rate limit (transient). |
| `499` | `RuntimeError` | Job cancelled. |
| `502` | `ConnectionError` | Upstream LLM provider error (e.g. context overflow). |
| `504` | `ConnectionError` | `timeout_seconds` elapsed; job auto-cancelled server-side. |

---

## Workflow Ideas

- **CRM Enrichment** — Trigger on new HubSpot/Salesforce contacts, enrich with company data, update the CRM record.
- **Spreadsheet Pipeline** — Read entities from Google Sheets, Iterator + Enrich Entity, write results back to a new sheet.
- **Conditional Re-Arbitration** — Run rule-based fusion first; if `conflicted_fields > 5`, re-merge with an LLM arbiter via *Merge Results* — without re-running the costly enrichment.
- **Plan-Limit Routing** — On `OutOfMoneyError`, alert a human in Slack and pause the scenario until the quota window resets.
- **Scheduled Refresh** — Run on a cron schedule (Make Schedule trigger) to re-enrich stale records with the latest models.

---

## Next Steps

- [API Keys](https://entityenricher.ai/docs/platform/api-keys) — Create organisation access keys for the Make connection.
- [n8n Connector](https://entityenricher.ai/docs/integrations/n8n) — The SSE-streaming sibling for n8n users.
- [API Reference](https://entityenricher.ai/docs/api) — Full REST API documentation, including the `/enrich/sync` endpoint.

---

Questions or feedback: [contact@entityenricher.ai](mailto:contact@entityenricher.ai).
