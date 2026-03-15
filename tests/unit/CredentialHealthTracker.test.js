/**
 * CredentialHealthTracker 单元测试
 *
 * 测试健康状态追踪和熔断器逻辑
 */

const assert = require('assert');
const { CredentialHealthTracker, HealthStatus } = require('../../src/modules/credentials/core/CredentialHealthTracker');

describe('CredentialHealthTracker', () => {
  describe('HealthStatus enum', () => {
    it('should have correct status values', () => {
      assert.strictEqual(HealthStatus.HEALTHY, 'healthy');
      assert.strictEqual(HealthStatus.DEGRADED, 'degraded');
      assert.strictEqual(HealthStatus.UNHEALTHY, 'unhealthy');
      assert.strictEqual(HealthStatus.CIRCUIT_OPEN, 'circuit_open');
    });
  });

  describe('Initial state', () => {
    let tracker;

    beforeEach(() => {
      tracker = new CredentialHealthTracker();
    });

    it('should create initial health state for new account', () => {
      const state = tracker.getOrCreate('aliyun', 'primary');

      assert.strictEqual(state.status, HealthStatus.HEALTHY);
      assert.strictEqual(state.consecutiveFailures, 0);
      assert.strictEqual(state.consecutiveSuccesses, 0);
    });

    it('should return existing state for same account', () => {
      tracker.getOrCreate('aliyun', 'primary');
      const state1 = tracker.getOrCreate('aliyun', 'primary');
      const state2 = tracker.getOrCreate('aliyun', 'primary');

      assert.strictEqual(state1, state2);
    });
  });

  describe('Success reporting', () => {
    let tracker;

    beforeEach(() => {
      tracker = new CredentialHealthTracker();
    });

    it('should increment success counters', () => {
      tracker.reportSuccess('aliyun', 'primary', 'qwen_http');
      tracker.reportSuccess('aliyun', 'primary', 'qwen_http');

      const state = tracker.getOrCreate('aliyun', 'primary');
      assert.strictEqual(state.totalSuccesses, 2);
      assert.strictEqual(state.consecutiveSuccesses, 2);
    });

    it('should reset consecutive failures on success', () => {
      tracker.reportFailure('aliyun', 'primary', 'qwen_http', new Error('test'));
      tracker.reportSuccess('aliyun', 'primary', 'qwen_http');

      const state = tracker.getOrCreate('aliyun', 'primary');
      assert.strictEqual(state.consecutiveFailures, 0);
    });

    it('should update lastSuccessAt timestamp', () => {
      const before = new Date().toISOString();
      tracker.reportSuccess('aliyun', 'primary', 'qwen_http');
      const after = new Date().toISOString();

      const state = tracker.getOrCreate('aliyun', 'primary');
      assert.ok(state.lastSuccessAt >= before);
      assert.ok(state.lastSuccessAt <= after);
    });

    it('should recover from DEGRADED status after consecutive successes', () => {
      // Degrade the account
      tracker.reportFailure('aliyun', 'primary', 'qwen_http', new Error('fail'));
      tracker.reportFailure('aliyun', 'primary', 'qwen_http', new Error('fail'));

      let state = tracker.getOrCreate('aliyun', 'primary');
      assert.strictEqual(state.status, HealthStatus.DEGRADED);

      // Three successes should recover
      tracker.reportSuccess('aliyun', 'primary', 'qwen_http');
      tracker.reportSuccess('aliyun', 'primary', 'qwen_http');
      tracker.reportSuccess('aliyun', 'primary', 'qwen_http');

      state = tracker.getOrCreate('aliyun', 'primary');
      assert.strictEqual(state.status, HealthStatus.HEALTHY);
    });
  });

  describe('Failure reporting', () => {
    let tracker;

    beforeEach(() => {
      tracker = new CredentialHealthTracker();
    });

    it('should increment failure counters', () => {
      tracker.reportFailure('aliyun', 'primary', 'qwen_http', new Error('test'));

      const state = tracker.getOrCreate('aliyun', 'primary');
      assert.strictEqual(state.totalFailures, 1);
      assert.strictEqual(state.consecutiveFailures, 1);
    });

    it('should store last error message', () => {
      tracker.reportFailure('aliyun', 'primary', 'qwen_http', new Error('API timeout'));

      const state = tracker.getOrCreate('aliyun', 'primary');
      assert.strictEqual(state.lastError, 'API timeout');
    });

    it('should enter DEGRADED after 2 consecutive failures', () => {
      tracker.reportFailure('aliyun', 'primary', 'qwen_http', new Error('fail1'));
      tracker.reportFailure('aliyun', 'primary', 'qwen_http', new Error('fail2'));

      const state = tracker.getOrCreate('aliyun', 'primary');
      assert.strictEqual(state.status, HealthStatus.DEGRADED);
    });

    it('should reset consecutive successes on failure', () => {
      tracker.reportSuccess('aliyun', 'primary', 'qwen_http');
      tracker.reportSuccess('aliyun', 'primary', 'qwen_http');
      tracker.reportFailure('aliyun', 'primary', 'qwen_http', new Error('fail'));

      const state = tracker.getOrCreate('aliyun', 'primary');
      assert.strictEqual(state.consecutiveSuccesses, 0);
    });
  });

  describe('Circuit breaker', () => {
    let tracker;

    beforeEach(() => {
      tracker = new CredentialHealthTracker({
        enabled: true,
        failureThreshold: 3,
        resetTimeout: 1000 // 1 second for testing
      });
    });

    it('should open circuit after threshold failures', () => {
      tracker.reportFailure('aliyun', 'primary', 'qwen_http', new Error('fail'));
      tracker.reportFailure('aliyun', 'primary', 'qwen_http', new Error('fail'));
      tracker.reportFailure('aliyun', 'primary', 'qwen_http', new Error('fail'));

      const state = tracker.getOrCreate('aliyun', 'primary');
      assert.strictEqual(state.status, HealthStatus.CIRCUIT_OPEN);
    });

    it('should not allow requests when circuit is open', () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        tracker.reportFailure('aliyun', 'primary', 'qwen_http', new Error('fail'));
      }

      const available = tracker.isAvailable('aliyun', 'primary');
      assert.strictEqual(available, false);
    });

    it('should allow requests after reset timeout', (done) => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        tracker.reportFailure('aliyun', 'primary', 'qwen_http', new Error('fail'));
      }

      // Wait for reset timeout
      setTimeout(() => {
        const available = tracker.isAvailable('aliyun', 'primary');
        assert.strictEqual(available, true);
        done();
      }, 1100);
    });

    it('should close circuit on success after recovery', () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        tracker.reportFailure('aliyun', 'primary', 'qwen_http', new Error('fail'));
      }

      // Simulate time passing (manually set state)
      const state = tracker.getOrCreate('aliyun', 'primary');
      state.status = HealthStatus.UNHEALTHY; // Half-open

      // Report success
      tracker.reportSuccess('aliyun', 'primary', 'qwen_http');

      const newState = tracker.getOrCreate('aliyun', 'primary');
      assert.strictEqual(newState.status, HealthStatus.HEALTHY);
    });

    it('should be disabled when configured', () => {
      const disabledTracker = new CredentialHealthTracker({
        enabled: false
      });

      // Report many failures
      for (let i = 0; i < 10; i++) {
        disabledTracker.reportFailure('aliyun', 'primary', 'qwen_http', new Error('fail'));
      }

      // Should still be available
      const available = disabledTracker.isAvailable('aliyun', 'primary');
      assert.strictEqual(available, true);
    });
  });

  describe('Availability check', () => {
    let tracker;

    beforeEach(() => {
      tracker = new CredentialHealthTracker();
    });

    it('should be available for HEALTHY status', () => {
      tracker.reportSuccess('aliyun', 'primary', 'qwen_http');

      const available = tracker.isAvailable('aliyun', 'primary');
      assert.strictEqual(available, true);
    });

    it('should be available for DEGRADED status', () => {
      tracker.reportFailure('aliyun', 'primary', 'qwen_http', new Error('fail'));
      tracker.reportFailure('aliyun', 'primary', 'qwen_http', new Error('fail'));

      const available = tracker.isAvailable('aliyun', 'primary');
      assert.strictEqual(available, true);
    });

    it('should be unavailable for CIRCUIT_OPEN status', () => {
      const state = tracker.getOrCreate('aliyun', 'primary');
      state.status = HealthStatus.CIRCUIT_OPEN;
      state.circuitOpenAt = Date.now();

      const available = tracker.isAvailable('aliyun', 'primary');
      assert.strictEqual(available, false);
    });
  });

  describe('Reset functionality', () => {
    let tracker;

    beforeEach(() => {
      tracker = new CredentialHealthTracker({ failureThreshold: 2 });
    });

    it('should reset account health state', () => {
      // Degrade the account
      tracker.reportFailure('aliyun', 'primary', 'qwen_http', new Error('fail'));
      tracker.reportFailure('aliyun', 'primary', 'qwen_http', new Error('fail'));

      // Reset
      tracker.reset('aliyun', 'primary');

      const state = tracker.getOrCreate('aliyun', 'primary');
      assert.strictEqual(state.status, HealthStatus.HEALTHY);
      assert.strictEqual(state.consecutiveFailures, 0);
    });

    it('should reset all health states', () => {
      tracker.reportFailure('aliyun', 'primary', 'qwen_http', new Error('fail'));
      tracker.reportFailure('tencent', 'backup', 'tts', new Error('fail'));

      tracker.resetAll();

      const aliyunState = tracker.getOrCreate('aliyun', 'primary');
      const tencentState = tracker.getOrCreate('tencent', 'backup');

      assert.strictEqual(aliyunState.status, HealthStatus.HEALTHY);
      assert.strictEqual(tencentState.status, HealthStatus.HEALTHY);
    });
  });

  describe('Status retrieval', () => {
    let tracker;

    beforeEach(() => {
      tracker = new CredentialHealthTracker();
    });

    it('should calculate success rate', () => {
      tracker.reportSuccess('aliyun', 'primary', 'qwen_http');
      tracker.reportSuccess('aliyun', 'primary', 'qwen_http');
      tracker.reportFailure('aliyun', 'primary', 'qwen_http', new Error('fail'));

      const status = tracker.getStatus('aliyun', 'primary');
      assert.strictEqual(status.successRate, 2/3);
    });

    it('should return success rate of 1 for no requests', () => {
      const status = tracker.getStatus('aliyun', 'primary');
      assert.strictEqual(status.successRate, 1);
    });

    it('should get all statuses', () => {
      tracker.reportSuccess('aliyun', 'primary', 'qwen_http');
      tracker.reportFailure('tencent', 'backup', 'tts', new Error('fail'));

      const allStatuses = tracker.getAllStatuses();

      assert.strictEqual(allStatuses.length, 2);
      assert.ok(allStatuses.some(s => s.providerKey === 'aliyun' && s.accountId === 'primary'));
      assert.ok(allStatuses.some(s => s.providerKey === 'tencent' && s.accountId === 'backup'));
    });
  });
});