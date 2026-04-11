# log-normalizer-slm

Python FastAPI service hosting a fine-tuned small language model that converts raw vendor security alerts into validated OCSF v1.7.0 Detection Finding JSON. The interesting parts of this service are not the model  they're the **post-processor**, the **OCSF Pydantic validation**, and the **confidence scoring** that sit around the model to make its output production-safe.

This README assumes you've read the [root README](../README.md) for context. Here we go deep on the SLM service specifically.

---

## What the service does

One endpoint handles the full pipeline:

```
POST /api/normalize
  ↓
1. prompt_builder.build_prompt(raw_log, source, format)
2. model_manager.generate(prompt) - slow (150-300s on GPU)
3. extract_json(raw_output)
4. PostProcessor.process(ocsf, raw_alert, source) - fixes + hallucination guards
5. validate_ocsf(cleaned_ocsf, source) - Pydantic v1.7.0 models
6. compute_confidence(raw_alert, cleaned_ocsf, source, validation, post_process)
  ↓
return { ocsf, decision, confidence, breakdown, fixes_applied, hallucinations_stripped, ... }
```

Every stage has its own directory under `app/` and its own tests. The pipeline is linear no branching, no caching, no queues. Concurrency is handled upstream (the NestJS worker runs at `concurrency: 1`), so this service does not need its own queue. The only concurrency primitive is a 600-second `asyncio.wait_for` wrapper around inference as a final safety net  if the model hangs, the request fails with 504 rather than hanging forever.

---

## The model

**Base:** `foundation-sec-1.1-8b-instruct`  a security-domain-adapted 8B parameter instruct model from Foundation AI Research.

**Fine-tuning:** LoRA adapter trained on a hand-labeled dataset of raw-alert → OCSF pairs covering 8 vendors (Splunk, CrowdStrike, Microsoft Defender, Microsoft Sentinel, Palo Alto Networks, Trend Micro, LogRhythm, Expel).

**Inference precision:** 4-bit quantization via `bitsandbytes` (`BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_compute_dtype=torch.float16)`). This is what allows the 8B model to fit on a single consumer GPU.

**Known failure modes** (the post-processor catches all of these):

- Hallucinated MITRE ATT&CK mappings on alerts that contain zero MITRE references (e.g., a Splunk HTTP anomaly alert comes back tagged with Initial Access / T1199).
- Wrong MITRE technique names (e.g., T1485 "Data Destruction" renamed to something else).
- `device.hostname` populated with an email address when the underlying entity is a mailbox, not a host.
- Fabricated OS strings (e.g., `"Windows 10 (10.0.19041.1282)"`) on alerts that have no OS references.
- Observable `type_id` values that don't match the `type` field (e.g., `type: "IP Address"` with `type_id: 4`).
- Invented field names that aren't in the OCSF schema (e.g., `device.account` instead of `device.owner.account`).
- Invented email fields that aren't in the OCSF Email object.

---

## File layout

```
app/
├── main.py                         # FastAPI app bootstrap
├── config.py                       # settings (model paths, device, etc.)
│
├── api/
│   ├── normalize.py                # POST /normalize endpoint
│   ├── health.py                   # GET /health with system metrics
│   └── validate.py                 # POST /validate (standalone validator)
│
├── models/
│   ├── model_loader.py             # ModelManager singleton, LoRA loader, is_ready flag
│   └── inference.py                # run_inference(model, tokenizer, prompt, settings)
│
├── ocsf/
│   ├── __init__.py                 # OCSF_VERSION constant
│   ├── enums.py                    # SeverityId, StatusId, ObservableTypeId, ...
│   ├── validator.py                # two-tier validation (hard errors + warnings)
│   ├── events/                
│       ├── detection_finding.py             
│   └── objects/
│       ├── finding_info.py
│       ├── metadata.py
│       ├── device.py
│       ├── evidence.py
│       ├── email.py
│       ├── observable.py
│       ├── attack.py
│       ├── tactic.py
│       ├── technique.py
│       ├── user.py
│       ├── account.py
│       ├── actor.py
│       ├── process.py
│       ├── file.py
│       ├── filehash.py
│       ├── os.py
│       ├── malware.py
│       ├── cve.py
│       ├── cwe.py
│       ├── network_endpoint.py
│       ├── net_con_info.py
│       ├── analytics.py
│       ├── api.py
│       ├── agent.py
│       ├── location.py
│       ├── organization.py
│       ├── product.py
│       ├── request.py
│       ├── response.py
│       ├── service.py
│       ├── enrichment.py
│       └── resource_details.py
│
├── postprocess/                    # 17 rules across 5 stages
│   ├── pipeline.py                 # PostProcessor.process()
│   ├── result.py                   # PostProcessResult, RuleResult dataclasses
│   ├── lookups/
│   │   ├── observable_types.py     # name → (type_id, canonical_name)
│   │   ├── mitre.py                # minimal T-ID and TA-ID tables
│   │   └── vendors.py              # source string → vendor_name
│   └── rules/
│       ├── structural.py           # Stage 1 (4 rules)
│       ├── field_fixes.py          # Stage 2 (5 rules)
│       ├── enrichment.py           # Stage 3 (3 rules)
│       ├── mitre.py                # Stage 4 (2 rules)
│       └── hallucinations.py       # Stage 5 (3 rules)
│
├── scoring/
│   └── confidence.py               # composite score, breakdown, decision routing
│
├── schemas/                        # Pydantic request/response shapes
│   ├── request.py                  # NormalizeRequest, ValidateRequest
│   └── response.py                 # NormalizeResponse
│
└── utils/
    ├── prompt_builder.py           # Builds the chat messages for the model
    └── ocsf_parser.py              # extract_json()  pulls the first valid JSON object from the model output
```

Tests mirror the source tree under `tests/unit/`.

---

## The normalize endpoint

### Request

```json
POST /api/normalize
Content-Type: application/json

{
  "raw_log": { ... raw alert JSON or string ... },
  "source": "splunk",
  "format": "json"
}
```

### Response (success)

```json
{
  "ocsf": { ... cleaned OCSF Detection Finding ... },
  "decision": "accept",
  "confidence": 0.82,
  "processing_time_ms": 187432,
  "breakdown": {
    "schema_score": 1.0,
    "coverage_score": 0.75,
    "consistency_score": 0.9,
    "post_process_penalty": -0.1
  },
  "fixes_applied": [
    "moved finding_info.severity_id to root",
    "fixed observable[2] type_id: 20 -> 2 (IP Address)",
    "set metadata.product.vendor_name to Splunk from source splunk"
  ],
  "hallucinations_stripped": [
    "stripped hallucinated finding_info.attacks (raw alert has no MITRE references)"
  ],
  "validation_errors": null
}
```

### Response (decision: review or reject)

Same shape, different `decision` value. `review` means the confidence was too low for automatic publish; `reject` means validation failed too hard and the output can't be trusted at all.

### Response (error)

```json
{
  "ocsf": null,
  "decision": "reject",
  "confidence": 0.0,
  "processing_time_ms": 12,
  "error": "JSON extraction failed"
}
```

---

## The system prompt

The system prompt is built in `app/utils/prompt_builder.py`. It instructs the model to:

- Output only valid JSON, no markdown or preamble
- Map all SOC-useful fields (sparse output is wrong)
- Place process, network, actor, and email information inside `evidences[]`
- Place MITRE ATT&CK information inside `finding_info.attacks[]`
- Place user information in `device.owner` or `evidences[].actor.user`
- Never put process, src_endpoint, dst_endpoint, attacks, or user at the top level
- Place vendor-specific fields with no OCSF equivalent in an `unmapped` object  never invent OCSF field names
- Include `observables[]` with key IOCs (IPs, hashes, domains, emails, usernames)
- Use the correct severity_id enum values (0=Unknown through 6=Fatal, and 99=Other)
- Compute `type_uid = class_uid * 100 + activity_id`
- Omit fields with no value (no nulls, no empty strings, no placeholders)

[VERIFY: read the actual prompt_builder.py file and copy the real prompt content into this section before handoff]

**The exact content of this prompt is also copied into the backend** at `log-normalizer-backend/src/training-data/training-prompt.constant.ts`. The backend uses it when exporting analyst corrections as training data, so the exported JSONL matches the prompt the model was trained against. **If you change the prompt here, also update the backend constant.** A test in the backend asserts the constant starts with the expected first words as a minimum drift detector, but it cannot catch deeper changes.

---

## Post-processor deep dive

The post-processor is in `app/postprocess/`. It runs between JSON extraction and Pydantic validation. Every rule takes a partially-broken OCSF dict and returns a slightly-less-broken one, along with a `RuleResult` describing what it did.

### Stage 1: Structural (4 rules)

Rules that fix *where* fields are, not their values.

| Rule | What it fixes |
|---|---|
| `move_root_fields_from_finding_info` | Moves `severity_id`, `severity`, `status`, `status_id`, `time`, `start_time`, `end_time` from inside `finding_info` to the root. |
| `fix_evidence_network_nesting` | Renames `evidences[].network.src_endpoint` to `evidences[].src_endpoint` and strips the invalid `network` wrapper. |
| `move_device_account_to_owner` | Moves `device.account` (invented) to `device.owner.account` (correct). |
| `strip_metadata_invented_fields` | Strips `metadata.created_time`, `metadata.modified_time` (not in OCSF Metadata). |

### Stage 2: Field fixes (5 rules)

Rules that fix the shape or type of individual field values.

| Rule | What it fixes |
|---|---|
| `fix_observable_types` | Corrects `type` string (sometimes "string" / "list" / "datetime" leaks from Python type names) and sets `type_id` to match via the lookup table. |
| `fix_email_to_list` | Wraps `email.to` in a list if it's a bare string. |
| `fix_email_from_string` | Extracts the `.email` value when `email.from` is an object instead of a string. |
| `fix_process_pid_int` | Drops `process.pid` if it's a non-numeric string (e.g., "Unspecified"). |
| `strip_device_os_string` | Drops `device.os` if it's a string instead of an OS object. |

### Stage 3: Enrichment (3 rules)

Rules that *add* information the model didn't produce, pulled from the raw alert or constants.

| Rule | What it fixes |
|---|---|
| `force_metadata_version` | Always sets `metadata.version = "1.7.0"`. |
| `force_vendor_name` | Sets `metadata.product.vendor_name` from the `source` parameter via the vendor lookup table (splunk → "Splunk", sentinel → "Microsoft", ...). |
| `enrich_email_from_raw_alert` | Walks the raw alert for email metadata (Sentinel MailMessage entity fields like `senderIP`, `internetMessageId`, SPF/DKIM/DMARC results) and enriches the email evidence in the output with the official OCSF Email fields. |

### Stage 4: MITRE lookup (2 rules)

Rules that correct MITRE ATT&CK naming without stripping valid mappings.

| Rule | What it fixes |
|---|---|
| `fix_mitre_technique_names` | Overwrites `technique.name` with the canonical name from the minimal MITRE table when the UID is present. Leaves unknown UIDs alone with a warning. |
| `fix_mitre_tactic_names` | Same for tactics. Also normalizes the deprecated `TA0043 PreAttack` to `TA0043 Reconnaissance`. |

The MITRE table is minimal  only the techniques and tactics the model has actually produced in training output. See `app/postprocess/lookups/mitre.py` for the full list. An out-of-date full MITRE table would cause more problems than a minimal table of known values.

### Stage 5: Hallucination guards (3 rules)

Rules that *remove* information the model invented.

| Rule | What it fixes |
|---|---|
| `strip_hallucinated_mitre` | If the raw alert contains zero MITRE references (checked via regex for `T\d{4}`, `TA\d{4}`, and the words "tactic", "technique", "att&ck", "mitre"), AND the model populated `finding_info.attacks`, strip the entire attacks array. |
| `strip_hallucinated_os` | If the raw alert has no OS references (checked against `os`, `osPlatform`, `operatingSystem`, `windows`, `linux`, `macos`, `android`, `ios`), AND the model populated `device.os`, drop `device.os`. |
| `strip_hallucinated_hostname` | If `device.hostname` contains `@` (it's an email), set it to null. If `device.hostname` doesn't appear anywhere as a substring in the raw alert, set it to null. |

Every hallucination stripped **counts toward the confidence penalty**. One hallucination docks the confidence score by 0.10. The penalty is capped at 0.30.

### The confidence loop

The combination of "strip + log + dock" is deliberate. When the post-processor catches a hallucination, three things happen atomically:

1. The bad data is removed from the output (the downstream system doesn't see it).
2. A message is appended to `hallucinations_stripped` so a human reviewing the job can see what was removed.
3. The confidence score is docked by 0.10, which often pushes the job below the `accept` threshold and into the `review` queue.

A hallucinating output naturally routes toward human review without any new code paths  it uses the existing confidence-based routing. The post-processor and the routing system work together via the confidence score.

---

## OCSF Pydantic models

The `app/ocsf/objects/` directory contains hand-derived Pydantic models for every OCSF v1.7.0 object the system uses. They are derived from the official schema at `schema.ocsf.io/1.7.0`.

### Key design choices

**`extra="ignore"` everywhere.** Every model uses `ConfigDict(extra="ignore")`. This means any field the LLM invents that doesn't exist in the official schema is silently dropped during validation. This is the last line of defense against invented fields the post-processor didn't catch.

**Two-tier validation.** `app/ocsf/validator.py` distinguishes between **hard errors** (Pydantic validation errors that require specific field types/shapes) and **warnings** (things that are technically valid but smell wrong, like missing optional recommended fields). Hard errors dock the schema score by 0.05 each (up to 0.4). Warnings dock by 0.02 each (up to 0.2). The validator returns a `ValidationResult` with the cleaned dict, the list of errors, and the list of warnings.

**Aliased fields.** The `Email` object uses `from_: str | None = Field(None, alias="from")` because `from` is a Python keyword. Pydantic serialization uses `by_alias=True` so the JSON output has the correct OCSF field name. Preserve this pattern for any field name that collides with Python keywords.

**The Email object.** Includes `message_uid` and `x_originating_ip` fields verified against the official OCSF v1.7.0 schema. **Do not invent email fields.** If you need to add an email field, fetch the official schema from `https://github.com/ocsf/ocsf-schema/blob/v1.7.0/objects/email.json` and confirm the field exists before editing the Pydantic model.

---

## Confidence scoring

`app/scoring/confidence.py` computes the composite score and the decision. Rough shape:

```python
composite = weighted_average(schema_score, coverage_score, consistency_score) + post_process_penalty
composite = clamp(composite, 0.0, 1.0)

if composite >= ACCEPT_THRESHOLD:
    decision = "accept"
elif composite >= REVIEW_THRESHOLD:
    decision = "review"
else:
    decision = "reject"
```

[VERIFY: exact threshold values and weights]

The breakdown is returned in the response as an object:

```json
{
  "schema_score": 0.95,
  "coverage_score": 0.70,
  "consistency_score": 0.85,
  "post_process_penalty": -0.10
}
```

**The penalty is explicitly negative.** This is important  it means the composite math is just `sum of the values`, and UI rendering needs to handle the negative case. The backend `JobResponse` mapper preserves the negative value; the UI renders it in a visually distinct way (red / "deduction" label).

---

## Running the service

### Docker (recommended)

Use the root `docker compose up slm`. The Dockerfile is `nvidia/cuda:13.0.0-runtime-ubuntu22.04` with Python 3.11 installed. The requirements layer is cached separately from the app code so iteration is fast.

GPU passthrough is configured in `docker-compose.yml` via `deploy.resources.reservations.devices`. Requires `nvidia-container-toolkit` on the host. Without a GPU, the model still loads but inference takes minutes per request and is unusable.

### Local (native)

```bash
cd log-normalizer-slm
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# With a GPU:
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload    # [VERIFY: exact command]

# Without a GPU (CPU inference  slow):
# Make sure settings.device defaults to 'cpu' in your environment
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

First boot downloads the base model weights (~4 GB for 4-bit quantized). Subsequent boots load from the HuggingFace cache.

### Health check

```bash
curl http://localhost:8000/health
```

Returns:

```json
{
  "status": "healthy",
  "model_loaded": true,
  "model_path": "foundation-sec-1.1-8b-instruct",
  "system": {
    "memory_used_mb": 12834,
    "memory_total_mb": 32768,
    "memory_percent": 39.2,
    "cpu_percent": 8.4,
    "cpu_cores": 8,
    "uptime_seconds": 4521,
    "gpu_memory_used_mb": 5841,
    "gpu_memory_total_mb": 24576,
    "gpu_memory_percent": 23,
    "gpu_utilization_percent": 0
  }
}
```

`status` is one of `loading` / `healthy` / `unhealthy`. The backend polls this at startup and during its own health check, and surfaces the system metrics block on the UI Health page.

---

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `BASE_MODEL_PATH` | HuggingFace model ID or local path | [VERIFY] |
| `ADAPTER_PATH` | Relative path to the LoRA adapter directory | [VERIFY] |
| `DEVICE` | `cuda` / `cuda:0` / `cpu` | `cuda` |
| `MAX_NEW_TOKENS` | Generation length cap | [VERIFY] |
| `TEMPERATURE` | Sampling temperature | [VERIFY] |
| `PORT` | FastAPI port | `8000` |
| `INFERENCE_TIMEOUT_SECONDS` | `asyncio.wait_for` around the generate call | `600` |

The `is_ready` flag is a runtime state, not an env var. It's set after the model and adapter are loaded successfully in `ModelManager.load()`.

---

## Testing

```bash
cd log-normalizer-slm
source .venv/bin/activate
pytest tests/unit
```


## What the SLM service does not do

- **No batching.** The model runs at batch 1. Concurrent requests would serialize anyway because of GPU memory constraints, and the NestJS worker upstream runs at `concurrency: 1` to enforce this.
- **The post-processor is a deny-list of known bugs, not a validator.** If the model produces a novel hallucination that no rule catches, it will flow through. The confidence-based routing is the safety net  novel outputs tend to score low and route to review.
- **MITRE table is minimal.** Only techniques/tactics the model has actually produced in training or observation. If the model produces a valid technique that isn't in the table, the name is left unchanged rather than looked up. Expanding the table requires manual curation.
- **The `enrich_email_from_raw_alert` rule is Sentinel-specific.** It knows the Sentinel MailMessage entity shape. Other vendors that produce email alerts would need their own enrichment logic.
- **No request-level concurrency control inside the service.** The service trusts the caller to not hammer it. Concurrency is enforced by the NestJS worker. If you expose the SLM directly to another caller, add a GPU semaphore.
