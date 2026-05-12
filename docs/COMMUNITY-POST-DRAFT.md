# Make.com community-post draft

Copy/paste this into <https://community.make.com> (Custom Apps / SDK category) to ask for help.

---

**Title:** `{{connection.apiKey}}` empty in modules after successful connection test — tried both `basic` and `oauth` types

**Body:**

I'm building a custom app via the CLI (`@makehq/cli@1.4.0`). The user fills in an API key in the connection form, the connection test succeeds, but `{{connection.apiKey}}` resolves to empty in every module/RPC HTTP request — `X-API-Key` header is sent with empty value, causing my backend to return 401.

**What I tried (in order):**

1. `type: "basic"`, parameter type `password`, headers in base.imljson — empty
2. Switched parameter type `password` → `text` (community advice for password-redaction) — empty
3. Added explicit `response.data: { apiKey: "{{parameters.apiKey}}" }` (docs say this persists) — empty
4. Removed `response.valid` object form, kept only `metadata` + `error` — empty
5. Added `editable: true` to the parameter — empty
6. Switched `type: "basic"` → `type: "oauth"` with token block (per thread #6234) — empty
7. Re-created the user connection from scratch after every schema change — empty
8. Used `parameters.apiKey` in base.imljson (not canonical) — empty
9. Used `connection.data.apiKey` — empty
10. Hardcoded baseUrl in base.imljson; uses relative URLs in modules — auth still empty

**Current state of the connection definition (`type: oauth`):**

```jsonc
// parameters
[{"name": "apiKey", "type": "text", "label": "API Key", "required": true, "editable": true}]

// communication (token block)
{
  "token": {
    "url": "https://entityenricher.ai/api/enrichment/options",
    "method": "GET",
    "headers": { "X-API-Key": "{{parameters.apiKey}}" },
    "response": {
      "metadata": { "type": "text", "value": "{{body.organization_name}}" },
      "data": { "apiKey": "{{parameters.apiKey}}" },
      "error": { "401": {"type": "InvalidCredentials", "message": "..."} }
    }
  }
}
```

**base.imljson:**

```jsonc
{
  "baseUrl": "https://entityenricher.ai",
  "headers": { "X-API-Key": "{{connection.apiKey}}" }
}
```

**A module's `api.imljson`:**

```jsonc
{"url": "/api/schema/saved", "method": "GET", "response": {"output": "{{item}}", "iterate": {"container": "{{body.schemas}}"}}}
```

When the user opens a parameter dropdown that's bound to `rpc://getSchemas`, Make tries to hit `/api/schema/saved` and the X-API-Key header is empty.

The connection test passes (Make shows green check + the org name from `response.metadata`), but `{{connection.apiKey}}` is empty downstream. Same symptom with both `basic` and `oauth` type, multiple recreation cycles, and every variation of `response.data` placement.

**Question:** what am I missing to make `{{connection.apiKey}}` populated after a successful connection test? Is there a specific CLI deployment step I'm skipping, or a required field in the connection metadata?

Deployment is via:
```bash
make-cli sdk-apps create --name=entity-enricher --label='Entity Enricher' --theme='#f59e0b'
make-cli sdk-connections create --app-name=entity-enricher-3ebi2k --type=oauth --label='...'
make-cli sdk-connections set-section --connection-name=entity-enricher-3ebi2k --section=parameters --body=...
make-cli sdk-connections set-section --connection-name=entity-enricher-3ebi2k --section=api --body=...
make-cli sdk-modules update --app-name=... --module-name=... --connection=entity-enricher-3ebi2k
```

Public source: <https://github.com/TOT-Concept/make-app-entity-enricher>

---

When posting, link to thread #6234 (`/t/app-development-connection-with-token-bearer-which-is-not-oauth/6234`) and mention you applied that thread's fix but still hit the same symptom.
