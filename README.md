# Entity Enricher — Make.com Custom App

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A [Make.com](https://www.make.com) Custom App for [**Entity Enricher**](https://entityenricher.ai) — an AI-powered platform that **enriches any entity against a JSON schema using multiple LLMs in parallel**, with automatic fusion, **multilingual output in 40 languages**, and pre-flight classification.

> Drop a single Make module into any scenario, map an entity from a previous step, and receive a structured, schema-validated, multi-model-fused JSON object — with multilingual output produced in a single LLM pass. No SSE handling, no retry plumbing, no prompt engineering.

![Demo: enriching an entity inside a Make scenario](https://entityenricher.ai/docs/demo-single-enrichment-make-connector.gif)

The app covers the whole loop, not just the enrichment call:

- **Author the schema from Make** — generate sample objects of an entity type (optionally from a PDF or a photo), turn them into a saved schema.
- **Feed it documents and images** — upload a file once, reference it by id in any enrichment or sample generation.
- **Enrich** — one call, N models, N languages, fused server-side.
- **Land it in your own database** — as real, migrated relational tables, synced by a client you run.

### Enrichments become a real database — yours

The enrichment is the easy half. What you normally end up building yourself — the tables to hold the
results, the DDL, the migration when the shape changes, and a loader that keeps it consistent — is
what a **database sync** does for you:

- **A designed schema, not a JSON dump.** Register a database on a schema and Entity Enricher derives
  the relational model from it: a table per entity type, `PRIMARY KEY`s, real `FOREIGN KEY`s, child
  tables for the parts an entity owns, junction tables for entities it merely references (one row
  many parents point at, not a copy per parent), typed columns, and indexes on what a list screen
  actually filters and sorts on. An LLM classification pass proposes each column's SQL contract at
  link time; you curate it in the Model tab.
- **Migrations you don't write.** Edit the schema and publish: the change is diffed against what each
  database has actually shipped and travels down the same feed as the data — additive DDL applied
  silently, riskier transforms (a re-key, a type change, a renamed column) held for your confirmation.
  No hand-written `ALTER`, no drift between the schema and the database.
- **Synced by an open-source client you run.** [`ee-database`](https://github.com/TOT-Concept/ee-database)
  is an MIT-licensed Go binary that lives next to *your* PostgreSQL, MySQL or SQLite. It connects
  **outward** over WSS — no inbound firewall hole — and **your connection string never leaves the
  machine**: Entity Enricher never holds a credential to your database. It bootstraps from a `.sql`
  snapshot, applies each leased batch transactionally, acknowledges it, and halts loudly on a failing
  delta rather than skipping it. Releases are **Sigstore-signed** and the installer verifies that
  signature against the publishing workflow's identity before the binary is ever executable.

```
  your schema ──┬──▶ relational model   tables, PK/FK, child + junction tables, indexes
                ├──▶ migrations         schema edits, diffed and shipped as DDL
                └──▶ rows               every enrichment, merged into current state
                             │
                             │  one ordered feed, leased and acknowledged
                             ▼
                    ee-database  ──  MIT-licensed, Sigstore-signed, outbound WSS only
                             │       (your DSN never leaves your machine)
                             ▼
              your PostgreSQL · MySQL · SQLite
```

This app exposes the same feed to Make (**List Database Syncs**, **Fetch Database Deltas**,
**Acknowledge Database Deltas**) for when a CLI can't run where your database lives, or when the
deltas should fan out somewhere else entirely — see [Keep your own database in sync](#keep-your-own-database-in-sync).

**Ready-made scenarios:** see [`examples/`](examples/) — six importable blueprints, including PDF-in, photo-in, and the full schema → database-sync arc.

---

## What this app does

Exposes Entity Enricher's REST API as **15 first-class Make modules** with dynamic dropdowns, plan-limit-aware error handling, and **one-call enrichment** (no SSE plumbing on the Make side).

| Category | Module | Endpoint | Type |
|---|---|---|---|
| **Enrichment** | Enrich Entity | `POST /api/single/enrich/sync` | Action |
| **Schemas** | List Schemas | `GET /api/schema/saved` | Search |
| **Schemas** | Get Schema Details | `GET /api/schema/saved/{id}` | Action |
| **Schemas** | Generate Sample | `POST /api/schema/sample/generate/sync` | Action |
| **Schemas** | Generate Schema | `POST /api/schema/generate/sync` | Action |
| **Records** | List Records | `GET /api/records` | Search |
| **Records** | Get Record | `GET /api/records/{id}` | Action |
| **Records** | Inject Records into Database | `POST /api/records/sync-to-database` | Action |
| **Fusion** | Merge Results | `POST /api/fusion/merge` | Action |
| **Attachments** | Upload Attachment | `POST /api/attachments` (multipart) | Action |
| **Attachments** | Delete Attachment | `DELETE /api/attachments/{id}` | Action |
| **Database Sync** | List Database Syncs | `GET /api/schemas/{id}/databases` | Search |
| **Database Sync** | Fetch Database Deltas | `GET /api/databases/{id}/changes` | Search |
| **Database Sync** | Acknowledge Database Deltas | `POST /api/databases/{id}/ack` | Action |
| **Configuration** | Get Options | `GET /api/enrichment/options` | Action |

### Designed for Make

Entity Enricher's primary public endpoints stream Server-Sent Events, which Make modules can't natively consume. The backend exposes dedicated `/sync` endpoints — enrichment, sample generation, schema generation — that wrap the streaming flow internally and return the final result in a **single HTTP response**. Each Make operation = one bundle: no polling, no two-module patterns, no job-status loops.

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

**Import it instead:** [`examples/01-enrich-single-entity.json`](examples/01-enrich-single-entity.json).

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

## Documents and images as input

Upload a file once with **Upload Attachment**, then map its `id` into **Enrich Entity** or **Generate Sample** — the file becomes the source material instead of (or alongside) the model's own knowledge. PDFs, office and text documents, images and audio are supported.

```
HTTP ▸ Get a File  ─►  Upload Attachment  ─►  Enrich Entity (Attachment IDs)  ─►  Delete Attachment
```

The upload response tells you how the file will reach the model:

| Field | What it means |
|---|---|
| `mode` | `inline_text` — the server extracted the text and inlines it into the prompt (works with any model). `binary` — the original bytes go to the model. |
| `requires_capability` | The model capability a `binary` attachment needs (e.g. image input). With **Models** empty, auto-selection restricts itself to capable models; a `400` names the capability when none qualifies. |
| `extracted_chars` | How much text was recovered in `inline_text` mode — a near-zero count on a large PDF means a scanned document. |

**Map a real binary into the *File* field** — HTTP ▸ *Get a File*, Google Drive ▸ *Download a File*, Dropbox, or HTTP ▸ *Make a request* with **Parse response = No**. With parsing on, Make hands the module a collection and it fails with `Value can't be casted as buffer for parameter data`. Keep the extension in **File name**: the server sniffs the format from it and applies the matching document policy.

Attachments are billed as storage — end the flow with **Delete Attachment** when the file was a one-shot source.

Blueprints: [`03-document-to-enrichment.json`](examples/03-document-to-enrichment.json) (PDF → enrichment) and [`04-image-to-sample-to-schema.json`](examples/04-image-to-sample-to-schema.json) (photo → sample → schema).

---

## Author schemas without leaving Make

**Generate Sample** invents realistic sample objects of an entity type; **Generate Schema** turns samples into a saved, reusable schema. Together they replace the hand-written JSON that used to be a prerequisite for the first enrichment.

```
Generate Sample (Sample count = 3)  ─►  Generate Schema  ─►  Enrich Entity
```

- **Several samples, one field set.** `Sample count = 3` returns three *distinct instances of the same type* in one job: the first defines the fields and names the remaining instances, the rest fill those fields for their own instance. The schema then covers the union — a field missing or null in **any** sample becomes `nullable` instead of required, and the distinct observed values become the property `examples`. Mixed entity types are rejected with a `400` before any LLM call.
- **Anchor the instances** with *Typical instances* (`Sanofi`, `Pfizer`, …). Slots you leave empty are named by the model itself, all in one pass, so they stay distinct.
- **From a document instead.** Set *Attachment IDs* and Generate Sample switches to source mode — transcribe the document or describe visible photo attributes only — and forces *Sample count* to 1. With 2+ attachments the response carries an `attachment_coherence` verdict, so a set mixing two different objects is caught before it becomes a schema.
- **Semantic IDs are a before-generation decision.** Turn *Generate semantic IDs* on when the schema will feed a database sync or any relational target: without them every table keys on whatever `is_key` property generation picked, which drifts between runs and mints duplicate rows. Requires an organization embedding model.
- **Chaining the two modules:** *Sample data (JSON)* is a text field, so wrap the array — `{{toString(1.samples)}}`.

Blueprint: [`05-samples-to-schema.json`](examples/05-samples-to-schema.json).

---

## Keep your own database in sync

Register a **database sync** on a schema (in the app, or over MCP / the REST API) and every enrichment queues SQL deltas for it — the designed tables, their migrations, and the rows, in one ordered feed ([what that gives you](#enrichments-become-a-real-database--yours)). The three Database Sync modules let a Make scenario drain it into your own PostgreSQL — or fan it out anywhere else.

```
Fetch Database Deltas (Claim)  ─►  Text aggregator  ─►  [PostgreSQL ▸ Execute a query]  ─►  Acknowledge Deltas
```

| Module | Role |
|---|---|
| **List Database Syncs** | The databases registered on a schema, with their pending delta counts. |
| **Fetch Database Deltas** | The next FIFO window, one bundle per delta (`sql`, `kind`, `op`, `entity_type`, `revision`, `next_cursor`). **Claim** leases the window; with claim off the read is replayable. |
| **Acknowledge Database Deltas** | Releases the lease up to a delta id, and purges delivered rows per the sync's options. |

Two rules decide whether the replica stays correct:

1. **One window = one transaction.** All deltas of one enrichment share a batch, and the projected tables carry `DEFERRABLE INITIALLY DEFERRED` foreign keys — splitting a batch across transactions fails on the constraint. A fetched window never splits a batch, so aggregate the window's `sql` and run it as a single `BEGIN; … COMMIT;`.
2. **Acknowledge after the commit, never before.** An ack on a transaction that then failed loses those deltas permanently.

Deltas of `kind: "schema"` are DDL migrations and arrive **before** the data rows that need them — apply them in order, never filter them out.

> For a database the CLI can reach, [`ee-database`](https://github.com/TOT-Concept/ee-database) is the better client: it bootstraps from the `.sql` snapshot, applies batches over a WebSocket and acks them, at no per-operation cost. Use Make when a CLI can't run where the database lives, or to route deltas into something other than a database.

Every enrichment also reports what reached the entity layer, in the **Database sync outcome** collection of *Enrich Entity* and *Merge Results*:

| Field | Meaning |
|---|---|
| `status` | `saved`, `partial` (the entity landed but some rows were dropped), or `rejected`. **Filter on this, not on `saved`** — a router treating `partial` as success silently loses rows. |
| `reason` / `missing_fields` | Why the write wasn't whole: the unfilled non-nullable path behind the rejection or each dropped item. |
| `entity_keys` | The **stored** key column values of the row — correlate with your replica on these, not on your input text, which the model may canonicalize. |
| `key_collisions` | List items that claimed a database key an earlier sibling already had; only the first is written. |
| `shared_entity_conflicts` | Shared rows this run overwrote while another parent still links to them — usually a sign the relationship should be marked owned. |
| `identity_merges` | Objects whose semantic ID resolved to a concept minted from *different* text. On the enriched entity itself (`json_path` empty) that means this run took over an existing row and overwrote it — check the two texts name the same thing. |
| `skipped_items` | Array items dropped by a `skip_row` database. |

Nothing re-sends dropped rows: fix the schema, then re-enrich.

Blueprint: [`06-database-sync-drain.json`](examples/06-database-sync-drain.json).

---

## Dynamic dropdowns

Every selectable field is populated by one of the app's **10 RPCs**, which hit the Entity Enricher API at configuration time. Pinned schemas surface first (marked with 📌), model labels include your organization's benchmark score (★ overall plus a Quality/Speed/Cost breakdown, when scoring benchmarks are configured) and per-million-token pricing, and plan-limited orgs see a notice when their quota is reached. The capability dropdowns (web search, response schema, strict structured output) only offer "On" when a selected model actually declares the capability.

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

Each iteration is independent — failures of one entity don't abort the others, and Make's per-operation billing reflects exactly how much was processed. The Iterator's *Array* field needs a real array: keep a literal array, or build one with **JSON ▸ Parse JSON** (`parseJSON()` is not callable in a mapping).

![Iterator pattern for multi-entity enrichment](https://entityenricher.ai/docs/make-connector-batch-entichment.gif)

Blueprint: [`02-iterator-batch.json`](examples/02-iterator-batch.json).

---

## Plan-limit awareness

Profile-limited orgs see structured 402 errors when they exceed quota — Make surfaces these as typed `OutOfMoneyError` with the limit `code`, `used`, and `limit` fields. Branch on this in your scenario to fall back to a cheaper model, alert a human, or wait for the quota window to reset.

![Error handler branching on OutOfMoneyError](https://entityenricher.ai/docs/make-connector-error-handling.png)

| HTTP | Make error type | When it fires |
|---|---|---|
| `400` | `DataError` | Schema not found, missing search keys, invalid models or languages, no model with a required capability. |
| `401` | `InvalidCredentials` | Bad or missing API key, or a revoked/expired OAuth connection. |
| `402` | `OutOfMoneyError` | Plan limit exceeded OR insufficient credits. Includes `code` (`insufficient_credits`, `model_limit_exceeded`, …). |
| `403` | `AccessDeniedError` | Role or scope insufficient. |
| `404` | `InvalidConfigurationError` | Schema, record or database not found. |
| `422` | `DataError` | Classification warning, or a model that hit its context limit. `body.detail.classification` carries status, reasoning, confidence. |
| `429` | `RateLimitError` | Provider rate limit (transient). |
| `499` | `RuntimeError` | Job cancelled. |
| `502` | `ConnectionError` | Upstream LLM provider error. |
| `503` | `ConnectionError` | A backend dependency (e.g. attachment storage) is offline — retry shortly. |
| `504` | `ConnectionError` | `timeout_seconds` elapsed; job auto-cancelled server-side. |

When a run partially succeeds, *Enrich Entity* also reports **why a single model produced nothing**: each entry of `per_model_results` carries an `error_code` — `model_retired` (the provider retired it; it is auto-deactivated, reselect and retry), `rate_limited`, `context_length_exceeded` or `provider_timeout`.

---

## What is Entity Enricher?

Entity Enricher treats LLMs as **queryable knowledge bases**. You define a JSON schema describing the data you want — fields, types, descriptions, expertise domains — and Entity Enricher orchestrates one or more LLM providers (Anthropic, OpenAI, Google Gemini, DeepSeek, Cohere, Mistral, X.AI, Ollama, …) to fill it in. The output is validated against your schema, deduplicated across models, and stored for analytics.

**What makes it different:**

- **Multilingual by design** — 40 supported languages. A single property can carry localized values populated **in a single LLM pass** — not N sequential round-trips per language. Core capability, not an afterthought.
- **Multi-model fusion** — Run an entity through 2+ models in parallel; conflicts are resolved field-by-field via a deterministic merger or an LLM arbiter, with a per-field agreement report.
- **Pre-flight classification** — A cheap classifier model verifies the entity matches the schema's expected type *before* expensive enrichment runs. Mismatches are surfaced as typed warnings instead of producing hallucinated data.
- **Expertise-driven prompts** — Schemas can group properties by expertise domain. The `multi_expertise` strategy runs one focused LLM call per domain in parallel, producing higher-quality results for large schemas.
- **AI schema generation from real samples** — Generate sample objects of a type (or read them off a PDF or photo), then turn them into a validated, saved schema; multiple samples decide what is required vs nullable.
- **Documents and images as source material** — Upload once, reference by id, delivered to the model as extracted text or original bytes depending on the format.
- **Auto model selection** — Leave the model unset and the server picks your organization's pinned default or its best benchmark-scored model for the task, restricted to models capable of what the request needs.
- **Your data in your database** — Enrichments write a relational entity layer that ships to your own PostgreSQL, MySQL or SQLite as an ordered SQL feed: a designed model (primary keys, foreign keys, child and junction tables, indexes), automatic migrations when the schema changes, and an open-source, signature-verified client that applies it without Entity Enricher ever holding your database credentials.
- **REST API with role-based access** — Organization access keys with their own roles, scoped permissions, plan-based quotas.

Learn more: [entityenricher.ai](https://entityenricher.ai) · [Documentation](https://entityenricher.ai/docs) · [Make integration guide](https://entityenricher.ai/docs/integrations/make)

---

## Workflow ideas

- **CRM enrichment** — Trigger on new HubSpot/Salesforce contacts, enrich with company data, update the CRM record.
- **Spreadsheet pipeline** — Read entities from Google Sheets, Iterator + Enrich Entity, write results back to a new sheet.
- **Inbox to structured data** — Email attachment or Drive drop → Upload Attachment → Enrich Entity → your database, with the document deleted at the end of the run.
- **Photo intake** — A field photo hits a webhook → Upload Attachment → Generate Sample → Generate Schema the first time, Enrich Entity every time after.
- **Conditional re-arbitration** — Run rule-based fusion first; if `conflicted_fields > 5`, re-merge with an LLM arbiter via *Merge Results* — without re-running the costly enrichment.
- **Human-in-the-loop database writes** — Enrich with *Database Sync* off, route the output through a review step (Slack approval, a spreadsheet edit), then send the approved version with *Inject Records into Database*. The edited output becomes its own record, so the audit trail shows what was actually stored.
- **Replica keeper** — Scheduled scenario: Fetch Database Deltas → apply in one transaction → Acknowledge, with a Slack alert whenever a `kind: "schema"` migration delta shows up.
- **Partial-write watchdog** — Route on `database.status`: `partial` or `rejected` bundles go to a review queue with their `missing_fields`, instead of being counted as successes.
- **Plan-limit routing** — On `OutOfMoneyError`, alert a human in Slack and pause the scenario until the quota window resets.
- **Scheduled refresh** — Run on a cron schedule (Make Schedule trigger) to re-enrich stale records with the latest models.

---

## License

MIT — see [LICENSE](LICENSE). Built by [TOT Concept](https://entityenricher.ai). Questions or feedback: [contact@entityenricher.ai](mailto:contact@entityenricher.ai).
