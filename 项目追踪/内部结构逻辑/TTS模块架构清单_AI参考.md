# TTS_MODULE_ARCHITECTURE_REFERENCE

version: 5
updated_at: 2026-04-18
audience: AI_AGENT_ONLY
purpose: COMPLETE_TTS_MODULE_REFERENCE_FOR_CODE_OPERATIONS

## RECENT_CHANGES

```
2026-04-18:
  - Added: CapabilityValidator (active in main chain)
  - Added: CAPABILITY_ERROR -> HTTP 400 mapping
  - Added: Metrics collection for timeoutCount, rateLimitHits
  - Disabled: ParameterMapper (compatibility issue with adapters)
  - Created: ResolvedTtsContext (not yet integrated)
  - Test: Full chain verified - synthesis, providers, voices, stats all working
  - Added: VoiceFormSchema + StoredVoiceSchema + VoiceNormalizer
  - Added: VoiceMapper as shared mapping utility
  - Fixed: VoiceRegistry index maintenance for 4-layer voice structure
  - Fixed: systemId -> service inference for new voice structure
  - Fixed: create/batch/update voice management now use unified validation chain
  - Added: regression suite tests/regression/VoiceStructureRegression.test.js (27 passing)
```

---

## EXECUTION_CHAIN_CANONICAL

```
POST /api/tts/synthesize
    |
    +-- [apps/api/routes/ttsRoutes.js:90-103]
    |   middleware_chain:
    |     - unifiedAuth: API key validation
    |     - securityLogger: XSS/malicious request scan
    |     - validateTtsParams: param validation
    |     - createUnifiedTtsMiddleware: requestId, fingerprint
    |
    +-- [src/modules/tts/adapters/http/TtsHttpAdapter.js:33-55]
    |   action: synthesize(req, res)
    |   detail: SynthesisRequest.fromJSON(req.body) -> immutable request object
    |
    +-- [src/modules/tts/domain/TtsSynthesisService.js:103-143]
    |   action: synthesize(request)
    |   steps:
    |     1. _validateRequest() -> SynthesisRequest.validate() + TtsValidationService.validateText()
    |     2. _resolveServiceIdentifier() -> VoiceResolver.resolve() [ONLY_ID_TRANSLATION_ENTRY]
    |     3. _checkRateLimit() -> per-service 100req/min
    |     4. circuitBreaker.execute(() -> _synthesizeWithRetry())
    |     5. AudioResult.fromServiceResult()
    |
    +-- [src/modules/tts/application/VoiceResolver.js:140-211]
    |   action: resolve(request)
    |   [CRITICAL] ONLY component allowed to translate business_id -> provider_real_id
    |   steps:
    |     1. normalizeRequest() -> standardize field names (voiceCode/voice_code, etc)
    |     2. _resolveVoice() -> priority: voiceCode > systemId > legacy voiceId
    |        - voiceRegistry.get(id) -> raw voice data
    |        - extract runtime.voiceId -> provider real voice id
    |     3. _buildRuntimeOptions() -> merge: defaults <- runtime <- user (voice LOCKED)
    |   output:
    |     - providerKey: "moss"
    |     - serviceKey: "tts"
    |     - adapterKey: "moss_tts"
    |     - voiceId: "2001257729754140672" (provider real id, NOT system id)
    |     - runtimeOptions: merged options with voice locked
    |
    +-- [NEW: CapabilityValidator] (in _synthesizeWithRetry)
    |   action: _validateCapabilities(adapterKey, options)
    |   purpose: validate request params against provider/service capabilities
    |   checks:
    |     - speed/pitch/volume range
    |     - format support
    |     - sampleRate support
    |     - streaming/realtime capability
    |   on_failure: throws CAPABILITY_ERROR
    |   on_warning: logs warning, continues execution
    |
    +-- [NEW: ParameterMapper] (DISABLED - compatibility issue)
    |   action: _translateParameters(provider, serviceType, options)
    |   current_behavior: returns original params (no-op)
    |   why_disabled:
    |     - ProviderConfig.json maps voice -> input.voice
    |     - Adapters still read params.voice
    |     - Enabling would break provider calls
    |   todo: update adapters OR update ProviderConfig.json
    |
    +-- [src/modules/tts/adapters/TtsProviderAdapter.js:28-43]
    |   action: synthesize(provider, serviceType, text, options)
    |   steps:
    |     1. _getAdapter(key) -> cached instance or create new
    |     2. adapter.synthesizeAndSave(text, options)
    |
    +-- [src/modules/tts/adapters/providers/BaseTtsAdapter.js:76-107]
    |   action: synthesizeAndSave(text, options)
    |   steps:
    |     1. this.synthesize(text, options) -> implemented by concrete adapter
    |     2. if audioUrl -> return { url, isRemote: true }
    |     3. if audio buffer -> audioStorageManager.saveAudioFile()
    |
    +-- [src/modules/tts/adapters/providers/MossTtsAdapter.js] (example concrete adapter)
    |   action: synthesize(text, options)
    |   steps:
    |     1. _getCredentials() -> credentials.selectCredentials(provider, serviceType)
    |     2. call external provider API
    |     3. _reportSuccess() or _reportFailure() -> health feedback
    |     4. return { audio/audioUrl, format, ... }
    |
    +-- [src/modules/tts/domain/AudioResult.js]
        action: fromServiceResult() -> toApiResponse()
        output: standardized JSON response
```

---

## UPDATED_CHAIN_ORDER

```
SynthesisRequest
    |
    v
VoiceResolver (解析资源与运行时上下文)
    |
    v
CapabilityValidator (能力校验)
    |
    v
ParameterMapper (参数转译)
    |
    v
ProviderAdapter (执行合成)
```

---

## CURRENT_ARCHITECTURE_STATUS

```
CURRENT_JUDGEMENT: NO_BLOCKING_ARCHITECTURE_ISSUE

MEANING:
  - Main synthesis chain is structurally closed
  - Voice management chain is structurally closed
  - Query/display side and adapter side both understand the current voice structure
  - Remaining work is cleanup / future evolution, not immediate architecture repair

NON_BLOCKING_FUTURE_WORK:
  - Integrate ResolvedTtsContext if context standardization is still desired
  - Re-enable ParameterMapper only after adapter input contract is unified
  - Remove duplicate query method definitions in TtsSynthesisService when convenient
```

---

## VOICE_DATA_CONTRACT_CANONICAL

```
CANONICAL_STORED_VOICE:
  identity:
    id: provider-service-sourceId
    voiceCode: optional 15-digit code
    sourceId: provider-side business identifier
    provider: provider key
    service: service key

  profile:
    displayName: frontend display name
    alias: optional alias
    gender: male|female|neutral
    languages: array
    description: display description
    tags: array
    status: active|inactive|deprecated
    preview: optional preview url

  runtime:
    voiceId: provider real voice id
    model: runtime model name
    providerOptions: provider-specific runtime options

  meta:
    createdAt: iso datetime
    updatedAt: iso datetime
    dataSource: manual|import|migration|api
    version: schema version
```

### Important Clarification

```
"4-layer separation" DOES NOT mean "4 files per voice".

It means:
  - one voice record
  - one canonical stored object
  - internally split into identity/profile/runtime/meta

Operationally:
  - Add/update by management API: submit one form DTO
  - Storage file: one voice entry in voices/dist/voices.json
  - Derived files should be generated, not manually synchronized field-by-field
```

---

## VOICE_MANAGEMENT_CHAIN_CANONICAL

```
POST /api/voices
POST /api/voices/batch
PUT  /api/voices/:id
    |
    +-- VoiceFormSchema.validate() / validateUpdate()
    +-- VoiceNormalizer.fromForm() or merge existing stored object
    +-- StoredVoiceSchema.validate()
    +-- VoiceRegistry.add() / update()

BENEFIT:
  - create/update/batch now follow the same structure contract
  - form layer and storage layer are no longer split-brain
```

---

## LAYER_RESPONSIBILITY_MATRIX

| Layer | File | Core_Responsibility | In_Main_Chain |
|-------|------|---------------------|---------------|
| ingress | apps/api/routes/ttsRoutes.js | middleware chain, route dispatch | YES |
| http_adapter | adapters/http/TtsHttpAdapter.js | HTTP<->domain translation | YES |
| domain | domain/TtsSynthesisService.js | orchestration, circuit breaker, rate limiter, metrics | YES |
| application | application/VoiceResolver.js | ID translation (ONLY entry point) | YES |
| core | core/VoiceRegistry.js | voice data source, O(1) lookup | YES |
| provider_aggregation | adapters/TtsProviderAdapter.js | aggregate all providers | YES |
| provider_concrete | adapters/providers/*Adapter.js | call external API, credential selection, health report | YES |
| credentials | modules/credentials/core/*.js | pooling, health tracking, circuit breaker | YES |
| voice_normalizer | application/VoiceNormalizer.js | form/legacy/stored/runtime conversion | NO |
| voice_mapper | application/VoiceMapper.js | shared display/detail/adapter mapping | NO |
| voice_form_schema | schema/VoiceFormSchema.js | validate editable form DTO | NO |
| stored_voice_schema | schema/StoredVoiceSchema.js | validate canonical stored voice | NO |
| catalog | catalog/VoiceCatalog.js | query/display: list, detail, filter | NO |
| query_service | application/TtsQueryService.js | query aggregation for frontend | NO |
| config_parameter | config/ParameterMapper.js | param mapping: unified -> provider-specific | NO |
| config_schema | config/ModelSchema.js | voice data schema definition | NO |

---

## CRITICAL_BOUNDARY_RULES

### RULE_1: ID_TRANSLATION_SINGLE_ENTRY

```
ALLOWED_TRANSLATOR: VoiceResolver ONLY
INPUT_TO_RESOLVER: business_id | system_id | voice_code
OUTPUT_FROM_RESOLVER: provider_real_voice_id

FORBIDDEN:
  - Provider adapter doing its own ID translation
  - Direct use of system_id in provider API call
  - Bypassing VoiceResolver in synthesis flow

VIOLATION_INDICATORS:
  - 404 from provider API (wrong voice_id format)
  - system_id appearing in provider request payload
```

### RULE_2: CREDENTIAL_OWNERSHIP

```
CREDENTIAL_OWNER: modules/credentials/core/*.js
NOT_OWNER: BaseTtsAdapter (it CALLS credentials module)

BaseTtsAdapter responsibility:
  - invoke credentials.selectCredentials()
  - invoke credentials.reportSuccess/Failure()

CredentialPool responsibility:
  - priority/weight selection
  - health state machine
  - circuit breaker logic
```

### RULE_3: VOICE_DATA_SOURCE

```
PRIMARY_SOURCE: VoiceRegistry (core/VoiceRegistry.js)
QUERY_FACADE: VoiceCatalog (catalog/VoiceCatalog.js)
WRITE_ENTRY: voiceManageRoutes + VoiceFormSchema + VoiceNormalizer + StoredVoiceSchema

VoiceRegistry: used in MAIN_SYNTHESIS_CHAIN
  - get(id) -> O(1) lookup
  - returns raw voice data including runtime.voiceId

VoiceCatalog: used in QUERY/DISPLAY_SIDE
  - getDisplay(), getDetail(), query(), getFiltersMeta()
  - wraps VoiceRegistry with DTO transformation
```

---

## COMPONENT_DETAIL_REFERENCE

### TtsSynthesisService

```
file: src/modules/tts/domain/TtsSynthesisService.js
injected_dependencies:
  - ttsProvider: TtsProviderAdapter
  - voiceCatalog: VoiceCatalogAdapter
  - validator: TtsValidationService

internal_state:
  - circuitBreakers: Map<serviceKey, CircuitBreaker>
  - rateLimiters: Map<serviceKey, RateLimiter>
  - metrics: { totalRequests, successfulRequests, failedRequests, serviceStats }

policies:
  timeout: 60000ms (env: TTS_SYNTH_TIMEOUT_MS)
  retry: 1 attempt, backoff 120ms * attempt
  retryable_errors: [API_ERROR, PROVIDER_ERROR, TIMEOUT_ERROR, ETIMEDOUT, ECONNRESET, ECONNREFUSED, EAI_AGAIN]

[CURRENT_CODE_STATUS] DUPLICATE_METHOD_DEFINITIONS:
  Lines 211-231: getVoices(), getAllVoices(), getProviders() - direct implementation
  Lines 339-348: SAME_METHOD_NAMES - delegate to queryService
  
  ACTUAL_RUNTIME_BEHAVIOR:
    - Later definitions OVERRIDE earlier ones
    - getVoices/getAllVoices/getProviders actually use queryService delegation
    - queryService must be set via setQueryService() before calling these methods
    - If queryService is null, getProviders() falls back to ttsProvider.getAvailableProviders()
```

### VoiceRegistry

```
file: src/modules/tts/core/VoiceRegistry.js
data_structure:
  - voices: Map<id, voiceObject>
  - providerIndex: Map<provider, Set<id>>
  - serviceIndex: Map<provider_service, Set<id>>

key_methods:
  - get(id): O(1) lookup
  - getByProvider(provider): filtered list
  - getByProviderAndService(provider, service): filtered list
  - getAll(): all voices

voice_object_structure:
  identity:
    id: string                  # system id, e.g. "moss-tts-ashui"
    voiceCode: string | null    # 15-digit encoding (optional)
    sourceId: string
    provider: string
    service: string
  profile:
    displayName: string
    alias: string
    gender: string
    languages: array
    description: string
    tags: array
    status: string
    preview: string | null
  runtime:
    voiceId: string             # PROVIDER REAL ID
    model: string
    providerOptions: object
  meta:
    createdAt: iso datetime
    updatedAt: iso datetime
    dataSource: string
    version: string

compatibility_behavior:
  - get()/getAll()/getByProvider* normalize legacy flat voices automatically
  - indexes support both new structure and old flat structure during transition
```

### VoiceResolver

```
file: src/modules/tts/application/VoiceResolver.js
key_method: resolve(request)

resolution_priority:
  1. voiceCode (15-digit) -> parse -> lookup
  2. systemId -> direct lookup
  3. legacy voiceId -> compatibility lookup

output_structure:
  providerKey: string           # e.g. "moss"
  serviceKey: string            # e.g. "tts"
  adapterKey: string            # e.g. "moss_tts"
  voiceCode: string | null
  systemId: string | null
  voiceId: string               # PROVIDER REAL ID
  runtimeOptions: object        # merged, voice LOCKED

merge_order:
  baseOptions (defaults) -> runtimeOptions -> userOptions
  [LOCKED] voice/voiceId from runtime, cannot be overridden by user

important_current_behavior:
  - systemId -> service inference reads identity.provider / identity.service first
  - providerOptions are flattened into runtimeOptions for adapter compatibility
  - output is still plain object; ResolvedTtsContext is not yet integrated

error_codes_used:
  - UNKNOWN_SERVICE
  - CONFIG_ERROR
  - SERVICE_MISMATCH
  - VALIDATION_ERROR
  - VOICE_NOT_FOUND
```

### TtsProviderAdapter

```
file: src/modules/tts/adapters/TtsProviderAdapter.js
implements: TtsProviderPort
internal_cache: Map<adapterKey, adapterInstance>

key_method: synthesize(provider, serviceType, text, options)
  1. build key: provider_serviceType
  2. _getAdapter(key) -> cached or create
  3. adapter.synthesizeAndSave(text, options)
```

### BaseTtsAdapter

```
file: src/modules/tts/adapters/providers/BaseTtsAdapter.js
subclass_must_implement: synthesize(text, options)

provided_methods:
  - _getCredentials(): -> credentials.selectCredentials()
  - _reportSuccess(): -> credentials.reportSuccess()
  - _reportFailure(): -> credentials.reportFailure()
  - synthesizeAndSave(): -> synthesize() + audioStorage
  - validateText(), validateOptions()
  - getAvailableVoices(): uses shared VoiceMapper adapter format

[NOTE] BaseTtsAdapter CALLS credentials module
       credentials module OWNS pooling/circuit_breaker logic
```

### VoiceMapper

```
file: src/modules/tts/application/VoiceMapper.js
status: ACTIVE_SHARED_UTILITY
purpose: remove duplicated voice mapping logic across adapter/query/catalog sides

main_exports:
  - map()
  - toDisplay()
  - toAdapterFormat()
  - toDetail()
  - mapAll()

current_consumers:
  - BaseTtsAdapter
  - TtsQueryService
  - VoiceCatalogAdapter
```

### Provider Index

```
file: src/modules/tts/adapters/providers/index.js
registered_adapters:
  aliyun_cosyvoice: { Adapter: AliyunCosyVoiceAdapter, provider: aliyun, service: cosyvoice }
  aliyun_qwen_http: { Adapter: AliyunQwenAdapter, provider: aliyun, service: qwen_http }
  aliyun_qwen: { Adapter: AliyunQwenAdapter, provider: aliyun, service: qwen_http } # alias
  tencent: { Adapter: TencentTtsAdapter, provider: tencent, service: tts }
  tencent_tts: { Adapter: TencentTtsAdapter, provider: tencent, service: tts } # alias
  volcengine_http: { Adapter: VolcengineTtsAdapter, provider: volcengine, service: volcengine_http }
  volcengine_ws: { Adapter: VolcengineTtsAdapter, provider: volcengine, service: volcengine_http } # alias
  minimax_tts: { Adapter: MinimaxTtsAdapter, provider: minimax, service: minimax_tts }
  moss_tts: { Adapter: MossTtsAdapter, provider: moss, service: tts }
```

---

## CREDENTIALS_MODULE_REFERENCE

```
location: src/modules/credentials/

structure:
  index.js                    # module entry, exports all methods
  core/
    CredentialsRegistry.js    # registry, manages all providers
    CredentialPool.js         # single provider pool, selection logic
    CredentialHealthTracker.js # health state machine
    CredentialSelector.js     # selection strategies
  config/
    loader.js                 # YAML config loader
  utils/
    envParser.js              # ${VAR} syntax parser

yaml_config_location: credentials/sources/providers/*.yaml

selection_strategies:
  - priority: highest priority enabled account
  - round_robin: circular distribution
  - weighted: by weight field
```

### Health State Machine (ACTUAL_IMPLEMENTATION)

```
file: src/modules/credentials/core/CredentialHealthTracker.js

HealthStatus enum:
  - HEALTHY
  - DEGRADED
  - UNHEALTHY (half-open state)
  - CIRCUIT_OPEN

State Transitions:
  HEALTHY -> DEGRADED:     consecutive failures >= 2
  HEALTHY/DEGRADED -> CIRCUIT_OPEN: consecutive failures >= 5 (failureThreshold)
  CIRCUIT_OPEN -> UNHEALTHY: after resetTimeout (60000ms) expires, enters half-open
  UNHEALTHY -> HEALTHY:   on first success (half-open probe succeeds)
  DEGRADED -> HEALTHY:    consecutive successes >= 3

Default Config:
  - failureThreshold: 5
  - resetTimeout: 60000ms
  - halfOpenMaxCalls: 1

isAvailable() logic:
  - HEALTHY/DEGRADED: always true
  - CIRCUIT_OPEN: false until resetTimeout, then transitions to UNHEALTHY (half-open)
  - UNHEALTHY: true only if halfOpenCalls < halfOpenMaxCalls
```

---

## ERROR_CODE_MAPPING (ACTUAL_IMPLEMENTATION)

```
Source: src/modules/tts/adapters/http/TtsHttpAdapter.js:396-412

HTTP Status Mapping:
  400: VALIDATION_ERROR, SERVICE_MISMATCH, UNKNOWN_SERVICE, CAPABILITY_ERROR
  404: VOICE_NOT_FOUND, NOT_FOUND
  429: RATE_LIMIT_EXCEEDED
  503: CIRCUIT_BREAKER_OPEN, SERVICE_UNAVAILABLE
  500: all other codes (including API_ERROR, PROVIDER_ERROR, TIMEOUT_ERROR, etc.)

Default: 500 for any unrecognized error code
```

### Error Codes by Source

```
VoiceResolver:
  - UNKNOWN_SERVICE
  - CONFIG_ERROR
  - SERVICE_MISMATCH
  - VALIDATION_ERROR
  - VOICE_NOT_FOUND

TtsSynthesisService:
  - VALIDATION_ERROR
  - VOICE_NOT_FOUND
  - RATE_LIMIT_EXCEEDED
  - TIMEOUT_ERROR

BaseTtsAdapter:
  - VALIDATION_ERROR
  - (custom codes from _error() method)

TtsHttpAdapter:
  - VALIDATION_ERROR (batch validation)
```

---

## NOT_IN_MAIN_CHAIN

### ParameterMapper

```
file: src/modules/tts/config/ParameterMapper.js
status: DISABLED - compatibility issue with existing adapters
purpose: map unified params -> provider-specific API params
config_source: config/ProviderConfig.json

CURRENT_STATE:
  - Initialized and injected in ServiceContainer
  - _translateParameters() returns original params (disabled)
  - NOT actually transforming params

WHY_DISABLED:
  - ProviderConfig.json defines mappings like voice -> input.voice (Qwen)
  - But adapters still read params.voice directly
  - Enabling would break all provider calls

TODO:
  - Update adapters to read mapped field names
  - Or update ProviderConfig.json to match current adapter expectations
```

### ModelSchema

```
file: src/modules/tts/config/ModelSchema.js
status: SCHEMA_DEFINITION, NOT in main execution chain
purpose: voice data structure definition, validation, normalization

CURRENT_STATE:
  - Just a basic data structure definition file
  - Defines field specifications for voice objects
  - NOT actively called in main synthesis chain

EVOLUTION_TARGET:
  - Option A: Evolve into unified capability rule source (merge ModelSchema + CapabilitySchema)
  - Option B: Split into ModelSchema (data structure) + CapabilitySchema (capability rules)

RECOMMENDED: Option B - keep ModelSchema simple, capability validation handled by CapabilityValidator
```

### CapabilityValidator

```
file: src/modules/tts/domain/CapabilityValidator.js
status: IN_MAIN_CHAIN (active)
purpose: validate request params against provider/service capabilities

INTEGRATION_POINT:
  - TtsSynthesisService._validateCapabilities()
  - Called before provider synthesis

VALIDATION_COVERAGE:
  - speed/pitch/volume range checking
  - format support checking
  - sampleRate support checking
  - streaming/realtime capability checking

ON_FAILURE: throws CAPABILITY_ERROR (mapped to HTTP 400)
```

### ResolvedTtsContext

```
file: src/modules/tts/domain/ResolvedTtsContext.js
status: CREATED_BUT_NOT_INTEGRATED
purpose: standardized context object passed between layers

CURRENT_STATE:
  - File exists, class defined
  - Exported from domain/index.js
  - NOT actually used in main synthesis chain
  - TtsSynthesisService still uses SynthesisRequest directly

TODO:
  - Integrate into VoiceResolver output
  - Pass through main chain instead of plain objects
```

### VoiceCatalog

```
file: src/modules/tts/catalog/VoiceCatalog.js
status: QUERY/DISPLAY SIDE, NOT in main synthesis chain
purpose: voice list, detail, filter for frontend

key_methods:
  - getDisplay(id): display DTO
  - getDetail(id): detail DTO with masked provider_voice_id
  - query(filters): filtered list
  - getFiltersMeta(): available filter options

wraps: VoiceRegistry
```

### VoiceFormSchema / StoredVoiceSchema / VoiceNormalizer

```
files:
  - src/modules/tts/schema/VoiceFormSchema.js
  - src/modules/tts/schema/StoredVoiceSchema.js
  - src/modules/tts/application/VoiceNormalizer.js

combined_role:
  - VoiceFormSchema: validate incoming editable payload
  - VoiceNormalizer: convert form/legacy data to canonical stored voice
  - StoredVoiceSchema: enforce canonical stored structure before registry write

current_state:
  - ACTIVE in management chain
  - create/batch/update all pass through this structure contract
  - voiceCode is optional at stored layer
```

### Regression Coverage

```
file: tests/regression/VoiceStructureRegression.test.js
status: PASSING

covered_topics:
  - VoiceNormalizer form/legacy/runtime conversion
  - VoiceMapper display/detail/adapter mapping
  - VoiceFormSchema validation
  - StoredVoiceSchema validation
  - VoiceRegistry index maintenance
  - VoiceCatalog grouping and display DTOs
  - end-to-end form -> normalize -> validate -> register flow
```

---

## STRUCTURAL_RISKS

### RISK_1: PROVIDER_DEFINITION_DRIFT

```
TWO_SOURCES_OF_TRUTH:
  1. ProviderCatalog (catalog/ProviderCatalog.js)
     - Defines: provider/service metadata, aliases, capabilities
     - Keys: aliyun_qwen_http, aliyun_cosyvoice, tencent_tts, volcengine_http, minimax_tts, moss_tts

  2. adapters/providers/index.js
     - Defines: actual adapter class registration
     - Keys: aliyun_cosyvoice, aliyun_qwen_http, tencent, volcengine_http, minimax_tts, moss_tts
     - Also has aliases: aliyun_qwen, tencent_tts, volcengine, volcengine_ws, minimax, moss

DRIFT_INDICATORS:
  - Key exists in ProviderCatalog but no adapter registered
  - Adapter registered but no ProviderCatalog entry
  - Alias definitions differ between two sources
  - Service string resolves in one but not the other

CURRENT_SYNC_STATUS: MANUALLY_MAINTAINED, NO_AUTO_VALIDATION
```

### RISK_2: DOCUMENTATION_DRIFT_ON_VOICE_STRUCTURE

```
OLD_ASSUMPTION_TO_AVOID:
  "voice object is still flat"

CURRENT_TRUTH:
  canonical stored format is 4-layer
  flat format is compatibility input/output only

IF_UPDATING_CODE_OR_DOCS:
  always treat StoredVoice as the source contract
  do not document flat structure as the primary structure anymore
```

---

## DIAGNOSIS_MATRIX

| Symptom | First_Check | Likely_Cause |
|---------|-------------|--------------|
| 404 from provider | VoiceResolver -> runtime.voiceId | system_id passed to provider instead of real_id |
| UNKNOWN_SERVICE | ProviderCatalog.resolveCanonicalKey | service string not registered |
| CONFIG_ERROR | credentials yaml + env vars | provider config missing or env var not set |
| CIRCUIT_OPEN | CredentialHealthTracker.getStatus | 5 consecutive failures |
| VOICE_NOT_FOUND | VoiceRegistry.get | voice id not in registry |
| TIMEOUT_ERROR | _synthesizeWithRetry | provider API slow or unreachable |

### Edge_Case_Diagnosis (Abnormal_Initialization)

| Symptom | Condition | Cause |
|---------|-----------|-------|
| queryService methods undefined | DI init failed or bypassed container | ServiceContainer.initialize() not called, or manual instantiation bypassed injection |

---

## FILE_QUICK_REFERENCE

```
Main synthesis chain (in order):
  apps/api/routes/ttsRoutes.js
  src/modules/tts/adapters/http/TtsHttpAdapter.js
  src/modules/tts/domain/TtsSynthesisService.js
  src/modules/tts/application/VoiceResolver.js
  src/modules/tts/core/VoiceRegistry.js
  src/modules/tts/adapters/TtsProviderAdapter.js
  src/modules/tts/adapters/providers/BaseTtsAdapter.js
  src/modules/tts/adapters/providers/*Adapter.js

Credentials (called by adapters):
  src/modules/credentials/index.js
  src/modules/credentials/core/CredentialsRegistry.js
  src/modules/credentials/core/CredentialPool.js
  src/modules/credentials/core/CredentialHealthTracker.js

Not in main chain:
  src/modules/tts/catalog/VoiceCatalog.js
  src/modules/tts/application/TtsQueryService.js
  src/modules/tts/config/ParameterMapper.js
  src/modules/tts/config/ModelSchema.js

Config:
  src/modules/tts/config/ttsDefaults.js
  src/modules/tts/config/VoiceCodeGenerator.js
  credentials/sources/providers/*.yaml
  voices/dist/voices.json
```
