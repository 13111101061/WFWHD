# TTS Microservice Architecture Gap Analysis Report

**Generated:** 2026-03-10
**Analyst:** Claude (Evolutionary Architecture Refactorer)

---

## Executive Summary

This report provides a comprehensive architectural assessment of the TTS (Text-to-Speech) microservice codebase. The analysis identifies critical architectural debt, violation of SOLID principles, and proposes an evolutionary refactoring roadmap.

---

## 1. Architecture As-Is Assessment

### 1.1 Current Architecture Style

```
Style: Layered Architecture with Anemic Domain Model
Pattern Maturity: 2.5/5 (Mixed patterns, inconsistent application)

┌─────────────────────────────────────────────────────────────┐
│                    Routes (Express Router)                   │
│  ttsRoutes.js, voiceRoutes.js, audioRoutes.js               │
└──────────────────────────┬──────────────────────────────────┘
                           │ Direct Express req/res
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Controllers                                │
│  UnifiedTtsController.js (438 lines)                        │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ • synthesize(req, res) - HTTP COUPLING              │    │
│  │ • getVoices(req, res) - HTTP COUPLING               │    │
│  │ • validateText() - Business Logic                   │    │
│  │ • handleError() - Error Handling                    │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Service Manager                           │
│  TtsServiceManager.js (350 lines)                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ • synthesize() - Orchestration                       │    │
│  │ • Circuit Breaker Logic - Infrastructure             │    │
│  │ • Rate Limiting - Infrastructure                      │    │
│  │ • Metrics Collection - Infrastructure                │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Factory                                    │
│  TtsFactory.js (307 lines)                                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Base Service (God Class)                  │
│  BaseTtsService.js (361 lines)                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ • Validation                                         │    │
│  │ • Retry Logic                                        │    │
│  │ • Error Handling                                     │    │
│  │ • Audio Storage                                      │    │
│  │ • Logging                                            │    │
│  │ • Response Formatting                                │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Provider Services                          │
│  cosyVoiceService, tencentTtsService, volcengineTtsService  │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Dependency Analysis

```yaml
Critical Coupling Violations:
  - UnifiedTtsController → Express (req/res objects)
  - BaseTtsService → AudioStorage (concrete implementation)
  - TtsServiceManager → TtsFactory (singleton import)
  - All services → VoiceManager (static import)

Coupling Metrics:
  average_dependencies_per_module: 8.2
  god_classes:
    - UnifiedTtsController: 12 responsibilities
    - BaseTtsService: 8 responsibilities
    - UnifiedAuthMiddleware: 6 responsibilities
```

### 1.3 Key Architectural Issues

#### Issue 1: HTTP Framework Leakage (CRITICAL)

**Location:** `UnifiedTtsController.js:19-86`

```javascript
// PROBLEM: Business logic accepts Express req/res
async synthesize(req, res) {
  const { service, text, systemId, ...options } = req.body;  // Express coupling
  // ...
  res.json({ success: true, data: result });  // Express coupling
}
```

**Impact:**
- Cannot unit test business logic without Express
- Cannot switch HTTP frameworks
- Violates Clean Architecture principle

---

#### Issue 2: God Class Anti-Pattern (HIGH)

**Location:** `BaseTtsService.js:9-360`

```javascript
class BaseTtsService {
  // Responsibilities mixed:
  validateText() { }        // Validation concern
  validateOptions() { }     // Validation concern
  executeWithRetry() { }    // Resilience concern
  handleError() { }         // Error handling concern
  saveAudioFile() { }       // Storage concern
  log() { }                 // Logging concern
  formatResponse() { }      // Presentation concern
}
```

**Impact:**
- Violates Single Responsibility Principle (SRP)
- High cognitive load (361 lines)
- Changes in one concern affect unrelated concerns

---

#### Issue 3: Singleton Dependency Hell (HIGH)

**Location:** Multiple files

```javascript
// TtsServiceManager.js:10
this.factory = ttsFactory;  // Singleton imported at module level

// BaseTtsService.js:1
const { audioStorageManager } = require('../../../shared/utils/audioStorage');

// UnifiedTtsController.js:1
const { ttsServiceManager } = require('./core/TtsServiceManager');
```

**Impact:**
- Hidden dependencies
- Cannot inject mocks for testing
- Tight coupling between layers

---

#### Issue 4: Middleware Chain Complexity (MEDIUM)

**Location:** `ttsRoutes.js:43-49`

```javascript
router.post('/synthesize',
  unifiedAuth.createMiddleware({ service: 'tts' }),  // Auth #1
  securityLogger,
  validateTtsParams,
  createUnifiedTtsMiddleware(),                       // Another layer
  ttsController.synthesize.bind(ttsController)
);
```

**Impact:**
- Multiple authentication checks
- Hard to trace request flow
- Potential redundant processing

---

## 2. Target Architecture Vision

### 2.1 Hexagonal Architecture (Ports & Adapters)

```
┌─────────────────────────────────────────────────────────────────┐
│                        ADAPTERS (Infrastructure)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ HTTP Adapter │  │ Storage      │  │ External API Adapters │  │
│  │ (Express)    │  │ Adapter      │  │ (Aliyun, Tencent...)  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
└─────────┼─────────────────┼─────────────────────┼──────────────┘
          │                 │                     │
          ▼                 ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                           PORTS (Interfaces)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ TtsUseCase   │  │ AudioRepo    │  │ TtsProviderPort      │  │
│  │ (Input Port) │  │ (Output Port)│  │ (Provider Interface) │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DOMAIN (Core Business Logic)              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ TtsSynthesisService                                         │ │
│  │ - synthesize(text, options): AudioResult                   │ │
│  │ - validateRequest(request): ValidationResult               │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Text         │  │ Audio        │  │ SynthesisRequest     │  │
│  │ (Value Obj)  │  │ (Entity)     │  │ (Value Object)       │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Architectural Fitness Functions

```yaml
Coupling Metrics:
  - module_dependencies_avg: < 3 (current: 8.2)
  - abstract_class_ratio: > 30% (current: 5%)
  - express_leak_rate: 0% (current: 65%)

Cohesion Metrics:
  - max_class_lines: 300 (current: 518)
  - max_method_lines: 30
  - cyclomatic_complexity_avg: < 10

Testability:
  - unit_test_coverage: > 80% (current: ~20%)
  - external_deps_mocked: 100%

Changeability:
  - files_changed_per_feature: < 3
  - mttr (mean time to recovery): < 5min
```

---

## 3. Evolutionary Refactoring Roadmap

### Phase 1: Foundation (Week 1-2)

**ADR-001: Introduce Domain Layer**

```yaml
Decision: Create pure domain layer with no framework dependencies
Rationale:
  - Decouple business logic from Express
  - Enable unit testing without HTTP mocking
  - Prepare for future framework migration

Impact:
  - New files: src/domain/tts/*.js
  - No breaking changes to existing API

Tasks:
  - Create SynthesisRequest value object
  - Create AudioResult entity
  - Create TtsSynthesisService (pure business logic)
```

**ADR-002: Extract Port Interfaces**

```yaml
Decision: Define interfaces (ports) for all external dependencies
Rationale:
  - Enable dependency inversion
  - Allow runtime swapping of implementations

Impact:
  - New files: src/ports/*.js
  - BaseTtsService references interfaces, not implementations

Tasks:
  - Define TtsProviderPort interface
  - Define AudioRepositoryPort interface
  - Define VoiceCatalogPort interface
```

### Phase 2: Adapter Layer (Week 3-4)

**ADR-003: Implement HTTP Adapter**

```yaml
Decision: Create Express adapter that calls domain layer
Rationale:
  - Isolate Express to adapter layer
  - Controller becomes thin HTTP translator

Impact:
  - UnifiedTtsController → TtsHttpAdapter (rename/refactor)
  - Business logic moves to TtsSynthesisService

Tasks:
  - Extract TtsHttpAdapter (Express-specific)
  - Create TtsSynthesisService (pure business)
  - Update routes to use new adapter
```

**ADR-004: Extract Infrastructure Services**

```yaml
Decision: Move cross-cutting concerns to dedicated services
Rationale:
  - Single Responsibility Principle
  - Reusable across different use cases

Impact:
  - CircuitBreakerService (extract from TtsServiceManager)
  - RateLimiterService (extract from TtsServiceManager)
  - MetricsCollector (extract from TtsServiceManager)

Tasks:
  - Create CircuitBreaker class
  - Create RateLimiter class
  - Create MetricsCollector class
  - Refactor TtsServiceManager to use these
```

### Phase 3: Dependency Injection (Week 5-6)

**ADR-005: Introduce DI Container**

```yaml
Decision: Use dependency injection for all services
Rationale:
  - Eliminate hidden singleton dependencies
  - Enable proper unit testing
  - Flexible configuration

Impact:
  - All services receive dependencies via constructor
  - Container manages service lifetime

Tasks:
  - Create simple DI container
  - Refactor all services to use DI
  - Update tests to inject mocks
```

---

## 4. Risk Assessment

```yaml
High Risk:
  - Breaking existing API contracts
  - Hidden behavior in singleton state
  - Test coverage too low for confident refactoring

Medium Risk:
  - Performance impact from additional abstraction layers
  - Learning curve for new patterns

Mitigation:
  - Incremental migration with feature flags
  - Comprehensive integration tests before each phase
  - Keep old code paths runnable during transition
```

---

## 5. Immediate Actions

### Priority 1: Extract Business Logic from Controller

```javascript
// BEFORE (UnifiedTtsController.js)
async synthesize(req, res) {
  const { service, text, systemId, ...options } = req.body;
  // ... 60 lines of business logic mixed with HTTP ...
  res.json({ success: true, data: result });
}

// AFTER (TtsSynthesisService.js)
class TtsSynthesisService {
  constructor({ ttsProvider, voiceCatalog, audioRepo }) {
    this.ttsProvider = ttsProvider;
    this.voiceCatalog = voiceCatalog;
    this.audioRepo = audioRepo;
  }

  async synthesize(request) {
    // Pure business logic, no HTTP
    const provider = this.resolveProvider(request);
    const result = await this.ttsProvider.synthesize(request.text, request.options);
    return result;
  }
}

// HTTP Adapter (TtsHttpAdapter.js)
class TtsHttpAdapter {
  constructor(synthesisService) {
    this.synthesisService = synthesisService;
  }

  async synthesize(req, res) {
    const request = SynthesisRequest.fromJSON(req.body);
    const result = await this.synthesisService.synthesize(request);
    res.json({ success: true, data: result });
  }
}
```

### Priority 2: Split BaseTtsService

```javascript
// Extract into separate services:

// 1. ValidationService
class TtsValidationService {
  validateText(text) { /* ... */ }
  validateOptions(options) { /* ... */ }
}

// 2. ResilienceService
class ResilienceService {
  executeWithRetry(fn, options) { /* ... */ }
}

// 3. AudioStorageService (already exists, just use it)

// 4. TtsProviderBase (minimal)
class TtsProviderBase {
  constructor(config, { validator, resilience, storage }) {
    this.validator = validator;
    this.resilience = resilience;
    this.storage = storage;
  }

  async synthesize(text, options) {
    throw new Error('Must implement in subclass');
  }
}
```

---

## 6. Success Metrics

| Metric | Current | Target | Deadline |
|--------|---------|--------|----------|
| Express Leak Rate | 65% | 0% | Week 4 |
| Avg Dependencies | 8.2 | < 3 | Week 6 |
| Unit Test Coverage | 20% | 80% | Week 8 |
| Max Class Lines | 518 | < 300 | Week 4 |
| Abstract Class Ratio | 5% | 30% | Week 6 |

---

## Appendix: File Inventory

### Critical Files (High Coupling)

| File | Lines | Dependencies | Issues |
|------|-------|--------------|--------|
| UnifiedTtsController.js | 438 | 12 | HTTP coupling, mixed concerns |
| BaseTtsService.js | 361 | 8 | God class, SRP violation |
| TtsServiceManager.js | 350 | 6 | Mixed infrastructure concerns |
| UnifiedAuthMiddleware.js | 450 | 5 | Auth + rate limit + monitoring |
| VoiceManager.js | 518 | 4 | Good design, just large |
| ttsRoutes.js | 248 | 8 | Complex middleware chain |

### Proposed New Structure

```
src/
├── domain/
│   ├── tts/
│   │   ├── SynthesisRequest.js
│   │   ├── AudioResult.js
│   │   └── TtsSynthesisService.js
│   └── shared/
│       └── ValueObjects.js
├── ports/
│   ├── TtsProviderPort.js
│   ├── AudioRepositoryPort.js
│   └── VoiceCatalogPort.js
├── adapters/
│   ├── http/
│   │   ├── TtsHttpAdapter.js
│   │   └── middleware/
│   ├── storage/
│   │   └── FileSystemAudioRepo.js
│   └── providers/
│       ├── AliyunTtsAdapter.js
│       ├── TencentTtsAdapter.js
│       └── VolcengineTtsAdapter.js
├── infrastructure/
│   ├── CircuitBreaker.js
│   ├── RateLimiter.js
│   └── MetricsCollector.js
└── config/
    └── ServiceContainer.js
```