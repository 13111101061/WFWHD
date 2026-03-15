/**
 * CredentialSelector 单元测试
 *
 * 测试选择策略：priority, round_robin, weighted
 */

const assert = require('assert');
const { CredentialSelector, SelectionStrategy } = require('../../src/modules/credentials/core/CredentialSelector');

describe('CredentialSelector', () => {
  describe('SelectionStrategy enum', () => {
    it('should have PRIORITY strategy', () => {
      assert.strictEqual(SelectionStrategy.PRIORITY, 'priority');
    });

    it('should have ROUND_ROBIN strategy', () => {
      assert.strictEqual(SelectionStrategy.ROUND_ROBIN, 'round_robin');
    });

    it('should have WEIGHTED strategy', () => {
      assert.strictEqual(SelectionStrategy.WEIGHTED, 'weighted');
    });
  });

  describe('Priority selection', () => {
    let selector;

    beforeEach(() => {
      selector = new CredentialSelector(SelectionStrategy.PRIORITY);
    });

    it('should select account with lowest priority number', () => {
      const accounts = [
        { id: 'backup', priority: 10, enabled: true, services: [] },
        { id: 'primary', priority: 1, enabled: true, services: [] },
        { id: 'secondary', priority: 5, enabled: true, services: [] }
      ];

      const selected = selector.select(accounts);
      assert.strictEqual(selected.id, 'primary');
    });

    it('should skip disabled accounts', () => {
      const accounts = [
        { id: 'primary', priority: 1, enabled: false, services: [] },
        { id: 'backup', priority: 10, enabled: true, services: [] }
      ];

      const selected = selector.select(accounts);
      assert.strictEqual(selected.id, 'backup');
    });

    it('should return null when no accounts available', () => {
      const accounts = [
        { id: 'primary', priority: 1, enabled: false, services: [] }
      ];

      const selected = selector.select(accounts);
      assert.strictEqual(selected, null);
    });

    it('should filter by service', () => {
      const accounts = [
        { id: 'a', priority: 1, enabled: true, services: ['qwen_http'] },
        { id: 'b', priority: 2, enabled: true, services: ['cosyvoice'] }
      ];

      const selected = selector.select(accounts, { serviceKey: 'cosyvoice' });
      assert.strictEqual(selected.id, 'b');
    });

    it('should filter by health status', () => {
      const accounts = [
        { id: 'healthy', priority: 1, enabled: true, services: [] },
        { id: 'unhealthy', priority: 2, enabled: true, services: [] }
      ];

      const selected = selector.select(accounts, {
        isAvailable: (acc) => acc.id === 'unhealthy'
      });
      assert.strictEqual(selected.id, 'unhealthy');
    });

    it('should default to priority 100 when not specified', () => {
      const accounts = [
        { id: 'no-priority', enabled: true, services: [] },
        { id: 'low', priority: 200, enabled: true, services: [] }
      ];

      const selected = selector.select(accounts);
      assert.strictEqual(selected.id, 'no-priority');
    });
  });

  describe('Round-robin selection', () => {
    let selector;

    beforeEach(() => {
      selector = new CredentialSelector(SelectionStrategy.ROUND_ROBIN);
    });

    it('should cycle through accounts', () => {
      const accounts = [
        { id: 'a', priority: 1, enabled: true, services: [] },
        { id: 'b', priority: 2, enabled: true, services: [] },
        { id: 'c', priority: 3, enabled: true, services: [] }
      ];

      // First selection
      const first = selector.select(accounts, { providerKey: 'test' });
      assert.strictEqual(first.id, 'a');

      // Second selection
      const second = selector.select(accounts, { providerKey: 'test' });
      assert.strictEqual(second.id, 'b');

      // Third selection
      const third = selector.select(accounts, { providerKey: 'test' });
      assert.strictEqual(third.id, 'c');

      // Fourth selection - wraps around
      const fourth = selector.select(accounts, { providerKey: 'test' });
      assert.strictEqual(fourth.id, 'a');
    });

    it('should maintain separate indices per provider', () => {
      const accounts = [
        { id: 'x', priority: 1, enabled: true, services: [] }
      ];

      // Provider A
      const a1 = selector.select(accounts, { providerKey: 'providerA' });
      const a2 = selector.select(accounts, { providerKey: 'providerA' });
      assert.strictEqual(a1.id, 'x');
      assert.strictEqual(a2.id, 'x');

      // Provider B has its own index
      const b1 = selector.select(accounts, { providerKey: 'providerB' });
      assert.strictEqual(b1.id, 'x');
    });

    it('should reset round-robin index', () => {
      const accounts = [
        { id: 'a', priority: 1, enabled: true, services: [] },
        { id: 'b', priority: 2, enabled: true, services: [] }
      ];

      selector.select(accounts, { providerKey: 'test' });
      selector.select(accounts, { providerKey: 'test' });

      selector.resetRoundRobin('test');

      const afterReset = selector.select(accounts, { providerKey: 'test' });
      assert.strictEqual(afterReset.id, 'a');
    });
  });

  describe('Weighted selection', () => {
    let selector;

    beforeEach(() => {
      selector = new CredentialSelector(SelectionStrategy.WEIGHTED);
    });

    it('should select based on weight distribution', () => {
      const accounts = [
        { id: 'heavy', weight: 100, enabled: true, services: [] },
        { id: 'light', weight: 1, enabled: true, services: [] }
      ];

      // Run multiple selections and check distribution
      const counts = { heavy: 0, light: 0 };

      for (let i = 0; i < 100; i++) {
        const selected = selector.select(accounts);
        counts[selected.id]++;
      }

      // Heavy should be selected much more often
      assert.ok(counts.heavy > counts.light * 10);
    });

    it('should use default weight of 1', () => {
      const accounts = [
        { id: 'no-weight', enabled: true, services: [] },
        { id: 'also-no-weight', enabled: true, services: [] }
      ];

      // Should not throw and should select one of them
      const selected = selector.select(accounts);
      assert.ok(['no-weight', 'also-no-weight'].includes(selected.id));
    });
  });

  describe('Strategy switching', () => {
    it('should allow strategy change', () => {
      const selector = new CredentialSelector(SelectionStrategy.PRIORITY);
      selector.setStrategy(SelectionStrategy.ROUND_ROBIN);
      assert.strictEqual(selector.strategy, 'round_robin');
    });

    it('should throw for unknown strategy', () => {
      const selector = new CredentialSelector(SelectionStrategy.PRIORITY);

      assert.throws(() => {
        selector.setStrategy('unknown');
      }, /Unknown strategy/);
    });
  });
});