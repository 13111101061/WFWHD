# AGENTS.md

## ProjectMeta
- name: tts-microservice
- version: 2.0.0
- main: apps/api/index.js
- port: 3000
- architecture: hexagonal_ports_adapters
- nodeDeps: express|axios|joi|redis|ws|uuid|bcryptjs|jsonwebtoken|dotenv|cors|chokidar|@aws-sdk/client-s3|@aws-sdk/s3-request-presigner|tencentcloud-sdk-nodejs-tts
- devDeps: mocha|nodemon|supertest|js-yaml|@gradio/client

## DirectoryTree
apps/api/index.js:server_entry
apps/api/routes/ttsRoutes.js:express_router_tts_endpoints
src/config/ServiceContainer.js:di_container_initialization_order
src/modules/tts/index.js:tts_module_entry
src/modules/tts/adapters/http/TtsHttpAdapter.js:http_to_domain_translation
src/modules/tts/adapters/TtsProviderAdapter.js:provider_port_implementation
src/modules/tts/adapters/VoiceCatalogAdapter.js:voice_catalog_port
src/modules/tts/adapters/providers/index.js:adapter_registry_canonical_keys
src/modules/tts/adapters/providers/BaseTtsAdapter.js:base_adapter_credentials_audioStorage
src/modules/tts/adapters/providers/AliyunCosyVoiceAdapter.js:aliyun_cosyvoice_implementation
src/modules/tts/adapters/providers/AliyunQwenAdapter.js:aliyun_qwen_http_implementation
src/modules/tts/adapters/providers/TencentTtsAdapter.js:tencent_tts_implementation
src/modules/tts/adapters/providers/VolcengineTtsAdapter.js:volcengine_http_implementation
src/modules/tts/adapters/providers/MinimaxTtsAdapter.js:minimax_tts_implementation
src/modules/tts/adapters/providers/MossTtsAdapter.js:moss_tts_implementation
src/modules/tts/application/VoiceResolver.js:voice_identity_resolution_priority
src/modules/tts/application/ParameterResolutionService.js:parameter_merge_priority_layers
src/modules/tts/application/CapabilityResolver.js:compiled_capability_runtime_resolution
src/modules/tts/application/TtsQueryService.js:query_facade_assembly_filter
src/modules/tts/application/VoiceNormalizer.js:storedVoice_conversion_form_runtime_legacy
src/modules/tts/application/VoiceMapper.js:adapter_format_mapping
src/modules/tts/domain/TtsSynthesisService.js:orchestration_domain_service
src/modules/tts/domain/SynthesisRequest.js:value_object_immutable_request
src/modules/tts/domain/AudioResult.js:value_object_immutable_result
src/modules/tts/domain/TtsValidationService.js:validation_rules
src/modules/tts/core/VoiceRegistry.js:in_memory_index_redis_file_persistence
src/modules/tts/catalog/VoiceCatalog.js:query_facade_dto_conversion
src/modules/tts/catalog/ProviderCatalog.js:provider_metadata_query
src/modules/tts/config/FieldDefinitionSystem.js:field_definition_registry_compiler
src/modules/tts/config/FieldDefinitionRegistry.js:platform_wide_field_definitions
src/modules/tts/config/CapabilityCompiler.js:manifest_to_compiled_capability
src/modules/tts/config/CompiledCapability.js:runtime_object_validate_map_filter
src/modules/tts/config/ParameterMapper.js:platform_to_provider_parameter_mapping
src/modules/tts/config/ConfigConsistencyChecker.js:startup_audit_multi_level
src/modules/tts/config/VoiceCodeGenerator.js:15_digit_encode_decode_luhn
src/modules/tts/config/VoiceCodeConfig.json:provider_code_mappings
src/modules/tts/config/ttsDefaults.js:deprecated_defaults_capabilitySchema
src/modules/tts/config/generate-voice-categories.js:category_generation_script
src/modules/tts/providers/manifests/ProviderManifest.js:manifest_loader_singleton
src/modules/tts/providers/manifests/aliyun/manifest.json:aliyun_provider_manifest
src/modules/tts/providers/manifests/tencent/manifest.json:tencent_provider_manifest
src/modules/tts/providers/manifests/volcengine/manifest.json:volcengine_provider_manifest
src/modules/tts/providers/manifests/minimax/manifest.json:minimax_provider_manifest
src/modules/tts/providers/manifests/moss/manifest.json:moss_provider_manifest
src/modules/tts/infrastructure/ExecutionPolicy.js:resilience_rate_limit_circuit_breaker_retry_timeout
src/modules/tts/provider-management/ProviderManagementService.js:unified_provider_facade
src/modules/tts/provider-management/ProviderDescriptorRegistry.js:static_config_from_manifests
src/modules/tts/provider-management/ProviderRuntimeRegistry.js:runtime_adapter_instances
src/modules/tts/schema/CapabilitySchema.js:capability_schema_definitions
src/modules/credentials/index.js:credential_pool_health_selector
src/modules/auth/index.js:authentication_api_key_permissions
voices/build.js:voice_data_build_pipeline
voices/dist/voices.json:compiled_voice_data

## CallChain:synthesize
step:1
  name:express_route
  file:apps/api/routes/ttsRoutes.js
  middleware:unifiedAuth.createMiddleware({service:tts})|securityLogger|validateTtsParams|createUnifiedTtsMiddleware
  endpoint:POST /api/tts/synthesize
  aliases:POST /api/tts/
step:2
  name:http_adapter
  file:src/modules/tts/adapters/http/TtsHttpAdapter.js
  method:synthesize(req,res)
  action:SynthesisRequest.fromJSON(req.body)|this.synthesisService.synthesize(request)
step:3
  name:domain_service
  file:src/modules/tts/domain/TtsSynthesisService.js
  method:synthesize(request)
  subSteps:
    - _validateRequest(sr):basic_validation
    - _resolveServiceIdentifier(sr):VoiceResolver.resolve()|voiceCode?parse->canonical|systemId?lookup_VoiceRegistry|voice?legacy_path
    - capabilityResolver.checkUnsupportedInput(resolvedServiceKey,resolvedRequest.options):warn_on_unsupported
    - executionPolicy.execute(resolvedServiceKey,async()=>_doSynthesize()):rate_limit|circuit_breaker|retry|timeout
    - _synthesizeWithNewChain():
      - VoiceResolver.resolve()->VoiceIdentity{serviceKey,providerKey,providerVoiceId,modelKey,systemId,voiceCode,voiceRuntime}
      - capabilityResolver.resolve(serviceKey,modelKey,voiceRuntime)->CapabilityContext{compiled,resolvedDefaults,lockedParams,parameterSupport,defaultVoiceId,apiStructure}
      - parameterResolutionService.mergeFromContext(userOptions,capabilityContext,identity)->merge_priority:platform<service<model<voice<user<locked
      - _validateCapabilities(serviceKey,resolvedParams.parameters,capabilityContext):check_constraints
      - parameterResolutionService.buildFinalParams()->extract_providerOptions
      - _translateParameters()->ParameterMapper.mapToProvider()|CompiledCapability.mapToProvider()
      - ttsProvider.synthesize(provider,serviceType,text,mappedOptions)
step:4
  name:provider_adapter
  file:src/modules/tts/adapters/TtsProviderAdapter.js
  method:synthesize(provider,serviceType,text,options)
  action:ProviderManagementService.getAdapter(key)->adapter.synthesizeAndSave(text,options)
  subSteps:
    - BaseTtsAdapter._getCredentials()->CredentialSelector(pool+health_tracking)
    - provider_specific_HTTP_WebSocket_call
    - audioStorage.saveAudioFile()|remote_URL
step:5
  name:result_value_object
  file:src/modules/tts/domain/AudioResult.js
  method:fromServiceResult(serviceResult,context)
  return:formatted_response_to_HTTP_adapter

## CallChain:batchSynthesize
step:1
  endpoint:POST /api/tts/batch
  middleware:unifiedAuth|securityLogger|validateBatchParams
  validation:texts_array_required|max_10_items|each_string_max_5000
step:2
  TtsHttpAdapter.batchSynthesize()->synthesisService.batchSynthesize(requests)

## CallChain:queryVoices
step:1
  endpoint:GET /api/tts/voices?service=xxx
step:2
  TtsHttpAdapter.getVoices()->synthesisService.getVoices()->TtsQueryService.queryVoices()->VoiceCatalog.query()->voiceRegistry.getByProviderAndService()

## ServiceContainerInitializationOrder
0:ProviderManifest._ensureLoaded():load_all_manifest_json
0.1:ConfigConsistencyChecker.audit():if CONFIG_AUDIT!=false|strict_mode_throws|migration_mode_warns
1:FieldDefinitionSystem.initialize():load_field_definitions|compile_all_services|fail_fast_or_warn
2:ProviderManagementService.initialize():load_descriptor_registry|runtime_registry
3:capabilityResolver:singleton_cache
4:voiceCatalogAdapter.initialize():load_voice_registry
4.1:ttsProviderAdapter.initialize():load_voice_registry|ProviderManagementService
4.2:ConfigConsistencyChecker.auditVoiceCoverage():check_defaultVoiceId_exists|each_service_has_voice
5:ExecutionPolicy:new_instance
6:TtsValidationService:new_instance
7:TtsQueryService:{ttsProvider,providerManagementService,capabilityResolver}
8:ParameterMapper.initialize():ensure_FieldDefinitionSystem|compile_capability
9:ParameterResolutionService:singleton
10:TtsSynthesisService:{ttsProvider,voiceCatalog,validator,capabilityResolver,parameterResolutionService,parameterMapper,queryService,executionPolicy}
11:TtsHttpAdapter(synthesisService):http_adapter_instance

## ManifestSystem:Structure
schema:ProviderManifest/v2
providerKey:string:unique_identifier
provider.displayName:string
provider.description:string
provider.status:stable|beta|deprecated
provider.protocolTypes:string[]:http|ws
provider.credentialMode:apiKey|secretKey|accessKey
services.{serviceKey}:
  displayName:string
  description:string
  status:stable|beta|deprecated
  aliases:string[]
  protocol:http|ws
  supportsStreaming:boolean
  supportsAsync:boolean
  apiStructure:flat|nested
  basePath:string:if_nested
  capabilities:{streaming:bool,realtime:bool,emotion:bool,speedAdjustable:bool,pitchAdjustable:bool,volumeAdjustable:bool}
  defaults:{format:string,sampleRate:number,...}
  defaultVoiceId:string:optional
  lockedParams:string[]
  parameters.{paramKey}:
    status:supported|unsupported|locked|hidden|required
    default:any:optional
    range:[min,max]:optional
    values:any[]:optional
    mapTo:string:provider_path
    source:string:if_locked_and_dynamic:providerVoiceId
    lockedValue:any:if_locked_and_static
    onUserInput:warn:if_unsupported
    reason:string:if_unsupported
    valueTransform:string:optional:toInteger
    ui:{highlight:bool,collapsed:bool}:optional
    nested:{subKey:{default,range,mapTo}}:optional
voiceCode:{providerCode:string(3digit),serviceKey:string}

## ManifestSystem:ProviderConfigs
provider:aliyun
  credentialMode:apiKey
  services:
    aliyun_cosyvoice:
      aliases:[cosyvoice]
      protocol:http
      supportsStreaming:true
      supportsAsync:true
      apiStructure:flat
      capabilities:{streaming:true,realtime:true,emotion:false,speedAdjustable:true,pitchAdjustable:true,volumeAdjustable:true}
      defaults:{format:wav,sampleRate:22050,speed:1.0,pitch:1.0,volume:50}
      lockedParams:[voice,model]
      parameters:
        voice:{status:locked,source:providerVoiceId,mapTo:voice}
        text:{status:required,mapTo:text}
        speed:{status:supported,default:1.0,range:[0.5,2.0],mapTo:rate}
        pitch:{status:supported,default:1.0,range:[0.5,1.5],mapTo:pitch}
        volume:{status:supported,default:50,range:[0,100],mapTo:volume}
        format:{status:supported,default:mp3,values:[mp3,wav,pcm,flac],mapTo:format}
        sampleRate:{status:supported,default:22050,values:[8000,16000,22050,24000],mapTo:sample_rate}
        model:{status:supported,default:cosyvoice-v1,mapTo:model}
        emotion|languageType|expectedDurationSec|samplingParams:{status:unsupported,onUserInput:warn}
    aliyun_qwen_http:
      aliases:[aliyun_qwen,qwen_http]
      protocol:http
      supportsStreaming:false
      supportsAsync:false
      apiStructure:nested
      basePath:input
      capabilities:{streaming:false,realtime:false,emotion:false,speedAdjustable:false,pitchAdjustable:false,volumeAdjustable:false}
      defaults:{format:wav,sampleRate:24000,model:qwen3-tts-instruct-flash-realtime,languageType:Auto}
      defaultVoiceId:aliyun-qwen_http-cherry
      lockedParams:[voice,model]
      parameters:
        voice:{status:locked,source:providerVoiceId,mapTo:input.voice}
        text:{status:required,mapTo:input.text}
        model:{status:supported,default:qwen3-tts-instruct-flash,mapTo:model}
        languageType:{status:supported,default:Auto,values:[Auto,Chinese,English,Japanese,Korean,German,French,Spanish,Russian,Italian,Portuguese],mapTo:input.language_type}
        format:{status:supported,default:wav,mapTo:input.format}
        sampleRate:{status:supported,default:24000,values:[8000,16000,24000,48000],mapTo:input.sample_rate}
        speed|pitch|volume:{status:unsupported,reason:Qwen_HTTP_不支持,onUserInput:warn}
        emotion|expectedDurationSec|samplingParams:{status:unsupported,onUserInput:warn}
  voiceCode:{providerCode:002,serviceKey:qwen_http}

provider:tencent
  credentialMode:secretKey
  services:
    tencent_tts:
      aliases:[tencent]
      protocol:http
      supportsStreaming:false
      supportsAsync:false
      apiStructure:flat
      capabilities:{streaming:false,realtime:false,emotion:false,speedAdjustable:true,pitchAdjustable:false,volumeAdjustable:true}
      defaults:{format:wav,sampleRate:16000,speed:0,volume:5}
      lockedParams:[voice,model]
      parameters:
        voice:{status:locked,source:providerVoiceId,mapTo:VoiceType,valueTransform:toInteger}
        text:{status:required,mapTo:Text}
        speed:{status:supported,default:0,range:[-2,6],mapTo:Speed}
        volume:{status:supported,default:5,range:[-10,10],mapTo:Volume}
        format:{status:supported,default:wav,values:[wav,mp3,pcm],mapTo:Codec}
        sampleRate:{status:supported,default:16000,mapTo:SampleRate}
        pitch|emotion|languageType|expectedDurationSec|samplingParams|model:{status:unsupported,onUserInput:warn}
  voiceCode:{providerCode:003,serviceKey:tts}

provider:volcengine
  credentialMode:accessKey
  services:
    volcengine_http:
      aliases:[volcengine,volcengine_ws,volcengine_http_legacy]
      protocol:http
      supportsStreaming:false
      supportsAsync:false
      apiStructure:flat
      capabilities:{streaming:false,realtime:false,emotion:false,speedAdjustable:true,pitchAdjustable:false,volumeAdjustable:true}
      defaults:{format:wav,sampleRate:24000,speed:1.0,volume:50}
      lockedParams:[voice,model]
      parameters:
        voice:{status:locked,source:providerVoiceId,mapTo:voice_type}
        text:{status:required,mapTo:text}
        speed:{status:supported,default:1.0,range:[0.5,2.0],mapTo:speed_ratio}
        format:{status:supported,default:mp3,mapTo:format}
        sampleRate:{status:supported,default:24000,mapTo:sample_rate}
        volume|pitch|emotion|languageType|expectedDurationSec|samplingParams|model:{status:unsupported,onUserInput:warn}
  voiceCode:{providerCode:004,serviceKey:http}

provider:minimax
  credentialMode:apiKey
  services:
    minimax_tts:
      aliases:[minimax]
      protocol:http
      supportsStreaming:false
      supportsAsync:false
      apiStructure:flat
      capabilities:{streaming:false,realtime:false,emotion:true,speedAdjustable:true,pitchAdjustable:true,volumeAdjustable:true}
      defaults:{format:mp3,sampleRate:32000,speed:1.0,pitch:0,volume:1.0,model:speech-01-hd-preview,emotion:neutral}
      lockedParams:[voice,model]
      parameters:
        voice:{status:locked,source:providerVoiceId,mapTo:voice_id}
        text:{status:required,mapTo:text}
        emotion:{status:supported,default:neutral,values:[neutral,happy,sad,angry,fearful],mapTo:emotion}
        format:{status:supported,default:mp3,mapTo:audio_format}
        sampleRate:{status:supported,default:32000,values:[16000,24000,32000],mapTo:sample_rate}
        speed:{status:supported,default:1.0,range:[0.1,2.0],mapTo:speed}
        pitch:{status:supported,default:0,range:[-12,12],mapTo:pitch}
        volume:{status:supported,default:1.0,range:[0.0,1.0],mapTo:volume}
        model:{status:supported,default:speech-01-hd-preview,mapTo:model}
        languageType|expectedDurationSec|samplingParams:{status:unsupported,onUserInput:warn}
  voiceCode:{providerCode:005,serviceKey:tts}

provider:moss
  credentialMode:apiKey
  services:
    moss_tts:
      aliases:[moss]
      protocol:http
      supportsStreaming:false
      supportsAsync:false
      apiStructure:flat
      capabilities:{streaming:false,realtime:false,emotion:false,speedAdjustable:false,pitchAdjustable:false,volumeAdjustable:false,samplingParams:true,expectedDuration:true}
      defaults:{format:wav,sampleRate:24000,model:moss-tts}
      defaultVoiceId:moss-tts-beijingnan
      lockedParams:[voice,model]
      parameters:
        voice:{status:locked,source:providerVoiceId,mapTo:voice_id}
        text:{status:required,mapTo:text}
        speed:{status:unsupported,reason:MOSS_不支持语速调整_可用_expectedDurationSec_替代,onUserInput:warn}
        pitch|volume|emotion|languageType:{status:unsupported,reason:MOSS_不支持,onUserInput:warn}
        model:{status:locked,lockedValue:moss-tts,mapTo:model}
        format:{status:supported,default:wav,mapTo:format}
        sampleRate:{status:supported,default:24000,values:[16000,24000],mapTo:sample_rate}
        expectedDurationSec:{status:supported,ui:{highlight:true},mapTo:expected_duration_sec}
        samplingParams:{status:supported,ui:{collapsed:true},nested:{temperature:{default:1.7,range:[0.1,3.0],mapTo:sampling_params.temperature},topP:{default:0.8,range:[0,1.0],mapTo:sampling_params.top_p},topK:{default:25,range:[1,100],mapTo:sampling_params.top_k},maxNewTokens:{default:20000,mapTo:sampling_params.max_new_tokens}}}
  voiceCode:{providerCode:001,serviceKey:tts}

## AdapterRegistry
key:aliyun_cosyvoice|provider:aliyun|service:cosyvoice|class:AliyunCosyVoiceAdapter|status:stable|aliases:[cosyvoice]|protocol:http|supportsStreaming:true|supportsAsync:true
key:aliyun_qwen_http|provider:aliyun|service:qwen_http|class:AliyunQwenAdapter|status:stable|aliases:[aliyun_qwen,qwen_http]|protocol:http|supportsStreaming:false|supportsAsync:false
key:tencent_tts|provider:tencent|service:tts|class:TencentTtsAdapter|status:stable|aliases:[tencent]|protocol:http|supportsStreaming:false|supportsAsync:false
key:volcengine_http|provider:volcengine|service:volcengine_http|class:VolcengineTtsAdapter|status:stable|aliases:[volcengine,volcengine_ws,volcengine_http_legacy]|protocol:http|supportsStreaming:false|supportsAsync:false
key:minimax_tts|provider:minimax|service:minimax_tts|class:MinimaxTtsAdapter|status:beta|aliases:[minimax]|protocol:http|supportsStreaming:false|supportsAsync:false
key:moss_tts|provider:moss|service:moss_tts|class:MossTtsAdapter|status:beta|aliases:[moss]|protocol:http|supportsStreaming:false|supportsAsync:false

## VoiceResolutionPriority
1:voiceCode:15_digit_string:e.g.001000030000005:VoiceCodeGenerator.parse()->providerKey+serviceKey->canonical_service_key
2:systemId:string:e.g.moss-tts-ashui:VoiceRegistry.get()->identity.provider+identity.service->canonical_service_key
3:voice|voiceId:string:e.g.ashui:legacy_provider_name->ProviderCatalog.resolveCanonicalKey()
4:defaultVoiceId:from_service_config:CapabilitySchema.getDefaultVoiceId(serviceKey)

## VoiceDataModel:StoredVoice_v3
identity:
  id:string:system_id:e.g.moss-tts-ashui
  voiceCode:string:15_digit:e.g.001000030000005
  sourceId:string:provider_local_name:e.g.ashui
  provider:string:e.g.moss
  service:string:e.g.tts
profile:
  displayName:string:e.g.阿树
  gender:string:female|male
  languages:string[]:e.g.[zh-CN]
  tags:string[]:e.g.[治愈]
  description:string
  status:active|inactive
  preview:string:url
runtime:
  voiceId:string:provider_real_id:e.g.2001257729754140672
  model:string:e.g.moss-tts
  providerOptions:object
meta:
  createdAt:iso8601
  updatedAt:iso8601
  dataSource:manual|imported
  version:v1

## ParameterMergePriority
layer:1:platform_defaults:lowest
layer:2:service_defaults:from_manifest.defaults
layer:3:model_defaults:from_model_config
layer:4:voice_defaults:from_voice_runtime
layer:5:user_input:filtered_locked_params
layer:6:locked_params:highest:voice->providerVoiceId|model->modelKey

## StartupAudit:ConfigConsistencyChecker
L1:legacy_file_check:
  targets:[service-field-overrides.json,provider-field-mappings.json,ProviderConfig.json,__legacy_backup__]
  strict:ERROR|migration:WARN
L2a:key_uniqueness:
  checks:duplicate_service_keys|alias_collisions_across_providers
L2b:voiceCode_mappings:
  checks:providerCode_maps_to_valid_providerKey
L2c:locked_parameters:
  checks:all_locked_params_have_lockedValue_or_source
L2d:mapTo_paths:
  checks:supported+locked_params_must_have_mapTo|unsupported_params_must_NOT_have_mapTo
L3:voice_coverage:
  checks:defaultVoiceId_exists_in_voice_registry|each_service_has_at_least_one_voice
mode:strict:any_error->startup_fails|migration:errors_become_warnings

## ExecutionPolicy:Resilience
rateLimiting:
  type:token_bucket
  default:100_req_per_min_per_serviceKey
  config:maxRequests:100|windowMs:60000
circuitBreaker:
  type:fail_fast
  default:5_consecutive_failures
  config:failureThreshold:5|successThreshold:2|timeout:60000
retry:
  default_times:parseInt(process.env.TTS_SYNTH_RETRY_TIMES||1)
  backoff:120ms*attempt
  retryableCodes:[API_ERROR,PROVIDER_ERROR,TIMEOUT_ERROR,ETIMEDOUT,ECONNRESET,ECONNREFUSED,EAI_AGAIN]
timeout:
  default_ms:parseInt(process.env.TTS_SYNTH_TIMEOUT_MS||60000)
metrics:
  totalRequests|successfulRequests|failedRequests|totalLatency|serviceStats(Map)|timeoutCount|rateLimitHits

## CredentialSystem
BaseTtsAdapter._getCredentials():
  path:credentials.selectCredentials(provider,serviceType,context)->{accountId,credentials}
  fallback:credentials.getCredentials(provider)
healthTracking:
  _reportSuccess()->credentials.reportSuccess(provider,accountId,serviceType)
  _reportFailure(error)->credentials.reportFailure(provider,accountId,serviceType,error)

## FieldDefinitionSystem:CompilationFlow
FieldDefinitionRegistry.initialize():load_platform_field_definitions
CapabilityCompiler.compileAll():
  for_each_serviceKey+providerKey:
    compileField(platformField,serviceOverride,providerMapping)->compiledSchema
    compileNestedFields()->nestedSchema
    merge->compiledDefaults|compiledLockedParams|compiledUiSchema|compiledValidator|compiledMapper
  store_in_CompiledCapability_cache
CompiledCapability.methods:
  getSchema()|getField(key)|hasField(key)|getFieldStatus(key)|isFieldSupported(key)|isFieldLocked(key)
  getUiSchema()|getUiGroups()|getFieldUi(key)
  getDefaults()|getDefault(key)|mergeWithDefaults(userParams)
  getLockedParams()|applyLockedParams()
  validate(params)|filterParams(params)|mapToProvider(params,context)

## APIEndpoints
POST /api/tts/synthesize:
  auth:unifiedAuth({service:tts})
  middleware:securityLogger|validateTtsParams|createUnifiedTtsMiddleware
  body:{text,service,voiceCode?,systemId?,voice?,options?}
  response:{success,data:{audioUrl,format,size,duration?},service,metadata:{provider,serviceType,systemId,requestId},timestamp,warnings?}
POST /api/tts/:
  alias:/synthesize|same_behavior
POST /api/tts/batch:
  auth:unifiedAuth({service:tts})
  middleware:securityLogger|validateBatchParams
  body:{service,texts:string[],options?}
  response:{success,data:{results:[],errors:[],summary:{total,successful,failed}},service,timestamp}
GET /api/tts/voices:
  query:?service=xxx
  response:{success,data:{provider,service,voices:[]}|allVoices,voiceCount,timestamp}
GET /api/tts/providers:
  response:{success,data:[{key,provider,service,displayName,description,configured,status}],timestamp}
GET /api/tts/health:
  response:{overall,services:{serviceKey:{status,error?}},timestamp}

## EnvironmentVariables
CONFIG_MODE:strict|migration:default_strict
CONFIG_AUDIT:true|false:default_true
TTS_STRICT_MAPPER:true|false:follows_CONFIG_MODE
TTS_FIELD_SYSTEM_FAIL_FAST:true|false:default_true
TTS_SYNTH_TIMEOUT_MS:number:default_60000
TTS_SYNTH_RETRY_TIMES:number:default_1

## ErrorCodes
UNKNOWN_SERVICE:VoiceResolver.resolve()->service_not_found
CONFIG_ERROR:Provider_config_not_found
SERVICE_MISMATCH:voiceCode/systemId_service_mismatch_with_request.service
VALIDATION_ERROR:text_empty_or_too_long
PARAMETER_MAPPING_ERROR:strict_mode_mapping_failure|compiled_capability_unavailable
RATE_LIMIT_EXCEEDED:ExecutionPolicy_rate_limiter
TIMEOUT_ERROR:ExecutionPolicy_timeout
API_ERROR|PROVIDER_ERROR:provider_API_failure:retryable

## Conventions
- canonical_key_format:provider_service:e.g.aliyun_cosyvoice
- voiceCode_format:15_digit_string_with_luhn_check
- parameter_status_values:supported|unsupported|locked|hidden|required
- apiStructure:flat|nested:if_nested_use_basePath
- credentialModes:apiKey|secretKey|accessKey
- adapter_status:stable|beta|deprecated
- voice_status:active|inactive
- all_dependencies_via_constructor_injection:no_setters
- ExecutionPolicy_delegates_all_resilience:no_resilience_in_domain_service
- ProviderManifest_single_source_of_truth:no_scattered_config_files
- StoredVoice_v3_only_format:VoiceRegistry_rejects_non_standard

## Q&A:DeepDive

Q01:CapabilitySchema_participates_main_path
  status:edge_only|not_in_hot_path
  runtime_reads:CompiledCapability_cache_only
  current_roles:
    platform_constants:defaultSampleRate|maxTextLength|supportedFormats
    model_metadata:serviceKey_mapping|samplingControl_flag
    getServiceCapabilities:delegates_to_ProviderManifest
  ttsDefaults.js:@deprecated|migrated_to_CapabilitySchema_and_manifest

Q02:ParameterMapper_vs_CompiledCapability_authority
  authority:CompiledCapability|ParameterMapper_is_thin_wrapper
  call_chain:TtsSynthesisService._translateParameters->ParameterMapper.mapToProvider->_tryGetCompiledCapability->compiled.mapToProvider
  ParameterMapper_roles:
    - env_gatekeeper:TTS_STRICT_MAPPER|CONFIG_MODE
    - exception_handler:strict->PARAMETER_MAPPING_ERROR|non_strict->WARN+passthrough
    - backward_compat:getSupportedParameters
  CompiledCapability.mapToProvider:
    - iterates_compiledSchema|calls_field.mapper(value,context)
    - transforms:direct|rename|linear|enumMap|nestedPath|ignore
    - handles_mapping.source:e.g.context.providerVoiceId
  key_code:CompiledCapability.js:mapToProvider:iterates_schema|field.mapper(value,context)->provider_params

Q03:serviceKey_serviceType_service_alias_boundary
  serviceKey:canonical_key:provider_service:global_unique:e.g.aliyun_cosyvoice|moss_tts
  serviceType:provider_prefix_removed:adapter_internal+provider_api:e.g.cosyvoice|tts|qwen_http
  service:user_input:canonical_or_alias:e.g.aliyun_cosyvoice|cosyvoice(alias)
  alias:backward_compat:e.g.cosyvoice->aliyun_cosyvoice
  resolution:
    alias->canonical:ProviderCatalog.resolveCanonicalKey(service)
    extract_serviceType:TtsSynthesisService._extractServiceType(serviceKey):prefix_cut
    parse_identifier:SynthesisRequest.parseServiceIdentifier()->{provider,serviceType}
  note:serviceType_may_contain_underscore:e.g.volcengine_http|_extractServiceType_uses_descriptor_or_prefix_cut

Q04:voiceCode_15_digit_structure_and_visibility
  structure:PPP_VVVVV_RRRRRR_C:15_digit_string
    PPP:3:providerCode:e.g.001=moss|002=aliyun
    VVVVV:5:voice_business_number:00001-99999
    RRRRRR:6:reserved:fixed_000000
    C:1:luhn_checksum
  visibility:
    api_fields:voiceCode(camelCase)|voice_code(snake_case)
    validation:SynthesisRequest.fromJSON->VoiceCodeGenerator.isValid
    resolution:VoiceCodeGenerator.parse->providerKey+serviceKey->canonical_service_key
  rule:all_ids_as_string|no_Number_conversion|preserves_leading_zeros

Q05:locked_parameter_user_input_handling
  phase1_filter:ParameterResolutionService._filterLockedParams(userParams,lockedParams)
    action:removes_locked_from_filteredUser|records_to_filteredParams
  phase2_rewrite:CompiledCapability.applyLockedParams(params,context)
    static:lockedValue
    dynamic:valueSource_from_context:e.g.providerVoiceId
  warning_generation:
    ParameterResolutionService:{type:locked,param,message,userValue}
    CompiledCapability:{type:locked,param,value,message}
  outcome:user_locked_params_silently_ignored|system_preset_applied|warned_in_warnings[]

Q06:warnings_array_standard_structure
  dual_sources:
    ParameterResolutionService:{type,param,message,userValue}:e.g.{type:locked,param:voice,message:...,userValue:xxx}
    CompiledCapability:{type,param,value,message}:e.g.{type:unsupported,param:emotion,value:happy,message:...}
  merge_point:TtsSynthesisService.synthesize:checkUnsupportedInput_warnings+chainWarnings->AudioResult.warnings
  http_response:TtsHttpAdapter:result.warnings?.length>0->response.warnings

Q07:streaming_async_runtime_exposure
  status:metadata_only|no_runtime_api
  manifest_declaration:aliyun_cosyvoice:supportsStreaming=true|supportsAsync=true|all_others_false
  runtime_behavior:
    TtsHttpAdapter.synthesize:returns_full_audio_url|non_streaming
    AliyunCosyVoiceAdapter:uses_websocket_internally|returns_complete_buffer
    endpoints:no_/api/tts/stream|no_SSE
  current_usage:ProviderManagementService.getAllServiceInfo->frontend_capability_display|future_extension_marker

Q08:batch_concurrency_rateLimit_billing_unit
  concurrency:serial|no_Promise.all|await_this.synthesize_per_request
  rateLimit:per_request_passes_ExecutionPolicy.execute(serviceKey)|per_service_token_bucket|excess->RATE_LIMIT_EXCEEDED
  billing:no_billing_module|per_provider_api_call_billed_by_provider
  validation:validateBatchParams:texts_max_10_items|each_max_5000_chars

Q09:metrics_vs_billing_division
  metrics:
    location:ExecutionPolicy.metrics+TtsSynthesisService.metrics
    data:total_requests|success_rate|avg_latency|per_service_stats|timeouts|rateLimit_hits|circuitBreaker_status
    usage:ops_monitoring|health_check|troubleshooting
    endpoints:GET_/api/tts/stats|GET_/api/tts/health
  billing:
    location:not_implemented
    data:N/A
    usage:N/A
    endpoints:none
  extended_metrics:credentialErrors|audioSaveErrors|capabilityValidationFailures|parameterMappingErrors
  billing_gap:no_billing_system|if_needed:intercept_at_TtsHttpAdapter_or_TtsSynthesisService|charge_by_text.length_or_audioDuration

Q10:AudioStorage_storage_and_url_strategy
  storage:audioStorage.js
    base_dir:process.env.AUDIO_STORAGE_DIR|config.audio.directory|default:./audio
    filename:generateSafeFilename->{prefix}_{timestamp}_{hash}.{ext}
      prefix:metadata.service|tts
      options:useTimestamp+useHash:default_true
    subDir:supported|sanitized_replaces_unsafe_chars
    retention:7_days|retentionPeriod:7*24*60*60*1000|scheduleCleanup
    url:urlPrefix|default:/audio|+subDir+filename
  adapter_behavior:
    remote_url:result.audioUrl->passthrough:isRemote=true
    local:audioStorage.saveAudioFile()->isRemote=false

Q11:Credential_pool_selection_and_recovery
  architecture:credentials/index.js+CredentialsRegistry.js
    single_account:.env:e.g.QWEN_API_KEY|TENCENTCLOUD_SECRET_ID
    pool_mode:YAML_config|CredentialPool_per_provider
  selection_strategy:CredentialPool
    ROUND_ROBIN:round_robin
    RANDOM:random
    HEALTH_FIRST:health_priority:default
    LEAST_USED:least_used
  health_tracking:
    reportSuccess:increment_success|lower_error_rate
    reportFailure:increment_failure|trigger_circuit_breaker
    recovery:resetCircuit_manual|auto_recovery_on_success_threshold
  adapter_call:BaseTtsAdapter._getCredentials:selectCredentials(pool)->fallback->getCredentials(single)

Q12:Provider_Adapter_contract
  BaseTtsAdapter_contract:
    synthesize(text,options):must_implement:returns_{audio:Buffer,format,provider,serviceType,...}:default:throws
    synthesizeAndSave(text,options):calls_synthesize+save/pass_url:default:implemented
    validateText(text):non_empty|length<=10000:default:implemented
    validateOptions(options):passthrough_no_defaults:default:return_{...options}
    _getCredentials():pool_support:default:implemented
    _reportSuccess()/_reportFailure(error):health_report:default:implemented
    getAvailableVoices():from_VoiceRegistry:default:implemented
    getFallbackVoices():fallback_when_no_registry:default:return_[]
    getStatus():returns_{provider,serviceType,status,timestamp}:default:implemented
  adapter_implementations:
    AliyunCosyVoiceAdapter:websocket|stream_audio_chunks|concat_buffer
    AliyunQwenAdapter:http|DashScope_API|nested_params:input.voice|input.text
    TencentTtsAdapter:http|TencentCloud_SDK|VoiceType_parseInt|speed_linear_map_*5
    VolcengineTtsAdapter:http|Volcengine_API
    MinimaxTtsAdapter:http|MiniMax_API|emotion_support
    MossTtsAdapter:http|fail_fast|voice_id_and_sampling_params_required|else_MISSING_VOICE_ID|MISSING_SAMPLING_PARAMS
  input_convention_post_refactor:
    adapter_receives_mapped_provider_params:from_ParameterMapper/CompiledCapability
    no_platform_to_provider_conversion_in_adapter
    all_defaults_merged_by_ParameterResolutionService_upstream
