# Example scenarios

Importable Make blueprints for the Entity Enricher app. Each one is a small, complete flow you
can run as-is once you point it at your own schema and connection.

| # | Blueprint | Shows |
|---|---|---|
| 01 | [01-enrich-single-entity.json](01-enrich-single-entity.json) | One entity, four languages, auto model selection, the `database` outcome block |
| 02 | [02-iterator-batch.json](02-iterator-batch.json) | Many entities via Make's Iterator — one operation, one bundle, one error scope per entity |
| 03 | [03-document-to-enrichment.json](03-document-to-enrichment.json) | **PDF in** → Upload Attachment → enrichment sourced from the document |
| 04 | [04-image-to-sample-to-schema.json](04-image-to-sample-to-schema.json) | **Photo in** → sample → saved schema, without writing any JSON by hand |
| 05 | [05-samples-to-schema.json](05-samples-to-schema.json) | 3 samples of one type → a saved, relational-ready schema |
| 06 | [06-database-sync-drain.json](06-database-sync-drain.json) | The delta feed → your own PostgreSQL, leased and acknowledged |

Blueprints 05 → 06 are the Make version of the platform's end-to-end sync test
(`scenario-tests/scenarios/001`): author a schema from generated samples, register a database on
it, enrich, and keep your own database converged. See [The full arc](#the-full-arc-05--06) below.

---

## Importing

1. In Make: **Scenarios ▸ Create a new scenario ▸ ⋯ (top right) ▸ Import Blueprint**, then upload
   the `.json`.
2. Open each Entity Enricher module and pick your **connection** (the blueprints ship without one).
3. Replace the placeholders:
   - `PASTE_YOUR_SCHEMA_ID` — just re-pick the schema from the **Schema** dropdown.
   - `PASTE_YOUR_DATABASE_ID` (blueprint 06) — re-pick from the **Database** dropdown.
4. Run once with **Run once**, then inspect the bundles.

### Sideloaded app? Rename the module namespace first

The blueprints reference the published app namespace `entity-enricher:`. A sideloaded (private)
copy of the app is namespaced per team — `app#entity-enricher-<suffix>:` — and Make will not
resolve the modules until you match it. The suffix is in your Developer Hub URL:

```bash
sed -i '' 's/"entity-enricher:/"app#entity-enricher-3ebi2k:/g' examples/*.json   # use YOUR suffix
```

If a single field doesn't restore after import (a dropdown that shows empty, an aggregator setting),
just set it in the module UI — the rest of the flow is unaffected.

---

## 01 · Enrich one entity

```
Enrich Entity  →  (your destination: CRM, Sheets, database, webhook …)
```

The module calls `POST /api/single/enrich/sync`, so **one operation = one finished result** — no SSE,
no polling, no two-module pattern. **Models** is left empty, which means *auto*: your organization's
pinned default model, or its best-scoring one. Fill it with 2+ models and the results are fused
server-side (`is_fused`, `source_models`, `fusion.agreed_fields` / `conflicted_fields`).

`Languages` is `en, fr, de, ja` — all four are produced **in a single LLM pass**, not four calls.
Map any of them downstream: `{{1.result.description.fr}}`.

**Check the `database` block** if the schema has a registered database sync — it is how you learn
what will reach your database:

| Field | Meaning |
|---|---|
| `status` | `saved` (everything written), `partial` (entity landed, some rows dropped or references detached), `rejected` |
| `reason`, `missing_fields` | Why the write wasn't whole — the unfilled non-nullable path |
| `entity_keys` | The **stored** key column values. Correlate rows by these, not by your input text |
| `key_collisions`, `shared_entity_conflicts`, `skipped_items`, `detached_references` | Rows silently dropped or overwritten, references silently cut |
| `identity_merges` | Objects folded into an existing concept — on the entity itself, this run took over that row |

A router filtering on `saved = true` treats a partial write as a clean success — filter on `status`.
Nothing re-sends the dropped rows: fix the schema, re-enrich.

## 02 · Iterator batch

```
Iterator (array)  →  Enrich Entity  →  [Aggregator]  →  destination
```

There is deliberately no batch module: Make bills per operation, so N entities through the Iterator
is cheaper *and* gives you per-entity error handling. Right-click the Enrich Entity module ▸
**Add error handler ▸ Resume** to keep the remaining entities running when one fails.

The Iterator's **Array** field needs a real array — a JSON *string* will not iterate. Either keep the
literal array (as in the blueprint), or feed it from a **JSON ▸ Parse JSON** module. `parseJSON()` is
not an IML function you can call in a mapping.

Add an **Array aggregator** after Enrich Entity if the destination wants one bundle instead of N.

## 03 · A document as the source (PDF, DOCX, TXT, audio…)

```
HTTP ▸ Get a File  →  Upload Attachment  →  Enrich Entity (Attachment IDs)  →  Delete Attachment
```

Upload once, reference by id. The response tells you how the file will be delivered to the model:

- `mode: "inline_text"` — the server extracted the text and inlines it into the prompt. Works with
  any model. `extracted_chars` tells you how much was recovered.
- `mode: "binary"` — the original bytes go to the model, which must declare the capability in
  `requires_capability`. With **Models** left empty, auto-selection restricts itself to models that
  can accept the file; if none qualify you get a `400` naming the missing capability.

**The buffer gotcha:** map a real binary output into **File** — HTTP ▸ *Get a File*, Google Drive ▸
*Download a File*, Dropbox, or HTTP ▸ *Make a request* with **Parse response = No**. With parsing on,
Make hands you a collection and the module fails with `Value can't be casted as buffer for
parameter data`. Keep the extension in **File name**: the server sniffs the format from it and
applies the matching document policy.

Raise **Timeout (seconds)** for large documents (the blueprint uses 600) and delete the attachment
when you're done — it is billed as storage, and blueprint 03 ends with the cleanup module.

## 04 · A photo as the source

```
HTTP ▸ Get a File  →  Upload Attachment  →  Generate Sample  →  Generate Schema  →  Delete Attachment
```

The fastest way to get a schema for something you can only photograph. Attachments switch **Generate
Sample** into *source mode*: it transcribes the document or describes **visible** attributes only,
and **Sample count is forced to 1** (there is one document to describe, not three instances to
invent). The `request` in the blueprint fences it in further — no invented provenance or
price.

Images are `binary` attachments, so the sample-generation model must accept images; leave **Model**
on `auto` and the server picks a capable one.

Attach several photos of the same object and the response carries an `attachment_coherence` verdict
(`mode`, `object_type`, and a `reason` when the set is incoherent) — a cheap guard against sampling
two different objects into one record.

**Chaining sample → schema:** *Sample data (JSON)* is a text field, so wrap the array in
`toString()`: `{{toString(3.samples)}}`. Mapping the raw `samples` array into a text field will not
produce valid JSON.

## 05 · Samples → schema

```
Generate Sample (3 instances)  →  Generate Schema
```

`Sample count = 3` returns three **distinct instances that share one field set** in a single job:
the first sample defines the fields, the rest fill them for their own instance. That is what makes
the schema honest — a field that is missing or null in *any* sample becomes **nullable** instead of
required, and the distinct observed values become the property `examples`. Naming three instances in
**Typical instances** anchors them; leave slots empty and the model names the rest itself, in one
pass, so they stay distinct.

The `request` carries the rules that decide whether the schema is usable downstream: settled
public facts only (an operational or time-varying property becomes a required field nobody can
fill), nullable where an instance legitimately lacks the property, and a shape with parts of its own
plus recurring third parties.

**Set `Generate semantic IDs = true` before generating** when the schema will feed a database sync —
it is on in this blueprint. Without semantic IDs every table keys on whatever `identifying` property
generation happened to pick (a name, a website), which drifts between runs and mints duplicate rows.
Adding them afterwards means hand-editing every object. It needs an organization embedding model
(Settings ▸ Organization) and adds embedding cost.

Then open the schema in the [Workflow Editor](https://entityenricher.ai/workflow-editor) and check
**ownership**: the entity's own parts should be `owned`; a recurring third party (a laboratory, a
publisher, a launch site) must **not** be — an owned shared entity materializes one private copy per
parent instead of one row every parent references, and no join undoes that afterwards.

## 06 · Drain the delta feed

```
Fetch Database Deltas (claim)  →  Text aggregator  →  [your DB module]  →  Acknowledge Deltas
```

Register the database on the schema first (**Database Sync** page in the app, or `create_database_sync`
over MCP), then publish the schema — a linked-but-unpublished schema queues nothing.

How the feed works: **Fetch** returns the next FIFO window, one bundle per delta. With **Claim**
enabled the window is *leased* and stays unacknowledged until you acknowledge it; with claim off the
read is replayable and harmless. **Acknowledge** releases the lease up to a delta id and (per the
sync's options) purges delivered rows.

Two rules the blueprint encodes, both easy to get wrong:

1. **Apply a whole window in one transaction.** All deltas of one enrichment share a batch and the
   projected tables carry `DEFERRABLE INITIALLY DEFERRED` foreign keys — splitting a batch across
   transactions fails on the constraint. The window never splits a batch, so "one fetch = one
   transaction" is the correct unit. That is what the **Text aggregator** is for: it joins the
   window's `sql` into one script, wrapped in `BEGIN; … COMMIT;`.
2. **Acknowledge only after the commit.** Module 4 maps `Acknowledge up to ID` from the aggregated
   bundle's `key` — check the aggregator's **Group by** is set to module 1's `Next cursor` after
   import (that is what puts the cursor on the aggregated bundle). Ack before the apply and a failed
   transaction loses deltas permanently.

Replace module 3 (a Set Variable placeholder holding the script) with your database module —
**PostgreSQL ▸ Execute a query**, MySQL, or an HTTP call to your own applier. Deltas of
`kind: "schema"` are DDL migrations and arrive **before** the data rows that need them; apply them in
order, never filter them out.

> **Prefer the CLI when you can.** [`ee-database`](https://github.com/TOT-Concept/ee-database) pairs
> to a database sync, bootstraps from the `.sql` snapshot, applies batches over a WebSocket and acks
> them — with no per-operation cost and no aggregation to get right. This blueprint is for when a
> CLI can't run where your database lives, or when you want the deltas to fan out into something
> else (a warehouse queue, an audit log, a Slack alert on schema migrations).

---

## The full arc (05 → 06)

The platform's end-to-end test (`scenario-tests/scenarios/001`) walks exactly this path with
chemical elements: three generated samples (Gold, Iron, Carbon) → a schema whose `isotopes` are an
owned component → a registered database → enrichments in `en` + `fr` → a replica of 4 tables, 18
indexes and 4 primary keys, converged over the delta feed. In Make:

```
05  Generate Sample ×3  →  Generate Schema
        ↓
    (in the app) Database Sync ▸ register a database on the schema, review the Model tab, publish
        ↓
01/02  Enrich Entity  — check database.status on every bundle
        ↓
06  Fetch Deltas (claim) → aggregate → apply in one transaction → Acknowledge
```

The one step with no Make module is registering the database itself: it is a one-time setup action
in the app (or via MCP / the REST API), not something a scenario repeats.
