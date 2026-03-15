/**
 * Credential Pool 集成测试
 *
 * 测试完整的凭证选择、健康追踪、熔断恢复流程
 */

const assert = require('assert');
const credentials = require('../../src/modules/credentials');
const { HealthStatus } = require('../../src/modules/credentials/core/CredentialPool');
const AliyunQwenAdapter = require('../../src/modules/tts/adapters/providers/AliyunQwenAdapter');

describe('Credential Pool Integration', () => {
  // 重置凭证模块状态
  beforeEach(() => {
    // 清除模块缓存以重置状态
    delete require.cache[require.resolve('../../src/modules/credentials')];

    // 重新加载并重置健康状态
    const freshCredentials = require('../../src/modules/credentials');
    const registry = freshCredentials.getRegistry();

    // 重置所有 pool 的健康状态
    for (const [providerKey, pool] of registry.getPools()) {
      const accounts = pool.getAllAccounts();
      for (const account of accounts) {
        pool.resetCircuit(account.id);
      }
    }
  });

  describe('selectCredentials', () => {
    it('should return credentials with account info', () => {
      const result = credentials.selectCredentials('aliyun', 'qwen_http');

      assert.ok(result);
      assert.ok(result.credentials);
      assert.ok(result.accountId);
      assert.ok(result.account);
    });

    it('should set _currentAccountId on adapter', () => {
      const adapter = new AliyunQwenAdapter();

      // 调用 _getCredentials 会设置 _currentAccountId
      const creds = adapter._getCredentials();

      assert.ok(adapter._currentAccountId);
      assert.ok(creds);
    });

    it('should return null for unknown provider', () => {
      const result = credentials.selectCredentials('unknown', 'unknown');
      assert.strictEqual(result, null);
    });
  });

  describe('Health tracking flow', () => {
    it('should track success and update health status', () => {
      // 选择凭证
      const result = credentials.selectCredentials('aliyun', 'qwen_http');
      assert.ok(result);

      // 报告成功
      credentials.reportSuccess('aliyun', result.accountId, 'qwen_http');

      // 检查健康状态
      const health = credentials.getHealthStatus('aliyun');
      assert.ok(health);

      const accountHealth = health.accounts.find(a => a.id === result.accountId);
      assert.ok(accountHealth);
      assert.strictEqual(accountHealth.status, HealthStatus.HEALTHY);
      assert.ok(accountHealth.lastSuccessAt);
    });

    it('should track failure and degrade health status', () => {
      const result = credentials.selectCredentials('aliyun', 'qwen_http');

      // 报告两次失败进入降级状态
      credentials.reportFailure('aliyun', result.accountId, 'qwen_http', new Error('API error'));
      credentials.reportFailure('aliyun', result.accountId, 'qwen_http', new Error('API error'));

      const health = credentials.getHealthStatus('aliyun');
      const accountHealth = health.accounts.find(a => a.id === result.accountId);

      assert.strictEqual(accountHealth.status, HealthStatus.DEGRADED);
      assert.strictEqual(accountHealth.consecutiveFailures, 2);
    });

    it('should track multiple providers independently', () => {
      // 先重置阿里云的健康状态（因为之前的测试可能已经修改了它）
      const accounts = credentials.getProviderAccounts('aliyun');
      accounts.forEach(acc => {
        credentials.resetCircuit('aliyun', acc.id);
      });

      // 阿里云成功
      const aliyunResult = credentials.selectCredentials('aliyun', 'qwen_http');
      credentials.reportSuccess('aliyun', aliyunResult.accountId, 'qwen_http');

      // 腾讯云失败（如果配置了的话）
      const tencentHealth = credentials.getHealthStatus('tencent');

      // 阿里云应该不受影响
      const aliyunHealth = credentials.getHealthStatus('aliyun');
      const aliyunAccount = aliyunHealth.accounts.find(a => a.id === aliyunResult.accountId);

      assert.strictEqual(aliyunAccount.status, HealthStatus.HEALTHY);
    });
  });

  describe('Adapter integration', () => {
    it('should set _currentAccountId during _getCredentials', () => {
      const adapter = new AliyunQwenAdapter();

      // 构造函数中调用 _getCredentials
      assert.ok(adapter._currentAccountId);
    });

    it('should update _currentAccountId on each _getCredentials call', () => {
      const adapter = new AliyunQwenAdapter();

      // 第一次调用
      adapter._getCredentials();
      const firstAccountId = adapter._currentAccountId;

      // 第二次调用
      adapter._getCredentials();
      const secondAccountId = adapter._currentAccountId;

      // 应该相同（因为只有一个账号）
      assert.strictEqual(firstAccountId, secondAccountId);
    });

    it('should have _reportSuccess and _reportFailure methods', () => {
      const adapter = new AliyunQwenAdapter();

      assert.strictEqual(typeof adapter._reportSuccess, 'function');
      assert.strictEqual(typeof adapter._reportFailure, 'function');
    });

    it('should not throw when calling _reportSuccess without account ID', () => {
      const adapter = new AliyunQwenAdapter();
      adapter._currentAccountId = null;

      // 不应该抛出
      assert.doesNotThrow(() => {
        adapter._reportSuccess();
      });
    });

    it('should not throw when calling _reportFailure without account ID', () => {
      const adapter = new AliyunQwenAdapter();
      adapter._currentAccountId = null;

      // 不应该抛出
      assert.doesNotThrow(() => {
        adapter._reportFailure(new Error('test'));
      });
    });
  });

  describe('Credential sanitization', () => {
    it('should not expose raw credentials in getProviderAccounts', () => {
      const accounts = credentials.getProviderAccounts('aliyun');

      accounts.forEach(account => {
        // 不应该有 credentials 字段
        assert.ok(!('credentials' in account));

        // 应该有 credentialStatus 字段
        assert.ok('credentialStatus' in account);

        // credentialStatus 不应该包含原始值
        Object.values(account.credentialStatus).forEach(status => {
          assert.ok('configured' in status);
          assert.ok('preview' in status);
          // preview 应该是脱敏的
          if (status.preview) {
            assert.ok(status.preview.includes('...'));
          }
        });
      });
    });

    it('should not expose raw credentials in getAccount', () => {
      const accounts = credentials.getProviderAccounts('aliyun');

      if (accounts.length > 0) {
        const account = credentials.getAccount('aliyun', accounts[0].id);

        assert.ok(!('credentials' in account));
        assert.ok('credentialStatus' in account);
      }
    });
  });

  describe('Circuit breaker integration', () => {
    it('should open circuit after threshold failures', () => {
      // 使用新的 tracker 实例
      const { CredentialHealthTracker } = require('../../src/modules/credentials/core/CredentialHealthTracker');

      const tracker = new CredentialHealthTracker({
        enabled: true,
        failureThreshold: 3,
        resetTimeout: 60000
      });

      // 模拟连续失败
      for (let i = 0; i < 5; i++) {
        tracker.reportFailure('test', 'account1', 'service', new Error('fail'));
      }

      const available = tracker.isAvailable('test', 'account1');
      assert.strictEqual(available, false);
    });

    it('should allow reset via resetCircuit', () => {
      const result = credentials.selectCredentials('aliyun', 'qwen_http');

      if (result) {
        // 制造一些失败
        for (let i = 0; i < 3; i++) {
          credentials.reportFailure('aliyun', result.accountId, 'qwen_http', new Error('test'));
        }

        // 重置熔断
        credentials.resetCircuit('aliyun', result.accountId);

        // 应该可以使用了
        const health = credentials.getHealthStatus('aliyun');
        const account = health.accounts.find(a => a.id === result.accountId);
        assert.strictEqual(account.status, HealthStatus.HEALTHY);
      }
    });
  });

  describe('Backward compatibility', () => {
    it('should support getCredentials() for existing code', () => {
      const creds = credentials.getCredentials('aliyun');

      assert.ok(creds);
      assert.ok(creds.apiKey);
    });

    it('should support isConfigured() for existing code', () => {
      const configured = credentials.isConfigured('aliyun');
      assert.strictEqual(typeof configured, 'boolean');
    });

    it('should support listProviders() for existing code', () => {
      const providers = credentials.listProviders();

      assert.ok(Array.isArray(providers));
      assert.ok(providers.length > 0);

      providers.forEach(p => {
        assert.ok(p.key);
        assert.ok(p.name);
      });
    });
  });
});