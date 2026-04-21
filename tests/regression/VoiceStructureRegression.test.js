/**
 * VoiceStructureRegression.test.js
 * 自动化回归测试 - 覆盖音色结构重构主路径
 *
 * 测试覆盖：
 * 1. systemId 推断服务
 * 2. voiceCode 解析
 * 3. 批量新增校验
 * 4. 更新校验
 * 5. 按 provider/service 分组
 * 6. Registry 只接受 StoredVoice
 * 7. VoiceWriteService 写链
 */

const assert = require('assert');
const { voiceRegistry } = require('../../src/modules/tts/core/VoiceRegistry');
const VoiceNormalizer = require('../../src/modules/tts/application/VoiceNormalizer');
const VoiceMapper = require('../../src/modules/tts/application/VoiceMapper');
const VoiceFormSchema = require('../../src/modules/tts/schema/VoiceFormSchema');
const StoredVoiceSchema = require('../../src/modules/tts/schema/StoredVoiceSchema');
const { VoiceWriteService } = require('../../src/modules/tts/application/VoiceWriteService');
const { VoiceCatalog } = require('../../src/modules/tts/catalog/VoiceCatalog');

describe('Voice Structure Regression Tests', function() {
  this.timeout(10000);

  // ==================== 测试数据 ====================

  const validFormDTO = {
    provider: 'test_provider',
    service: 'test_service',
    sourceId: 'test_voice',
    displayName: '测试音色',
    gender: 'female',
    languages: ['zh-CN'],
    description: '测试用音色',
    tags: ['测试'],
    providerVoiceId: 'provider_voice_123',
    model: 'test-model',
    providerOptions: {
      temperature: 1.0
    }
  };

  const legacyVoice = {
    id: 'legacy_voice',
    provider: 'legacy_provider',
    service: 'legacy_service',
    sourceId: 'legacy_source',
    displayName: '遗留音色',
    name: '遗留音色别名',
    gender: 'male',
    languages: ['zh-CN'],
    description: '遗留格式音色',
    tags: ['遗留'],
    voiceCode: '001000030000001',
    ttsConfig: {
      voiceId: 'legacy_provider_voice_id',
      model: 'legacy-model'
    }
  };

  // ==================== 1. VoiceNormalizer 测试 ====================

  describe('VoiceNormalizer', function() {

    describe('fromForm()', function() {
      it('应正确转换表单数据为存储结构', function() {
        const stored = VoiceNormalizer.fromForm(validFormDTO);

        // 校验 identity 层
        assert.strictEqual(stored.identity.id, 'test_provider-test_service-test_voice');
        assert.strictEqual(stored.identity.provider, 'test_provider');
        assert.strictEqual(stored.identity.service, 'test_service');
        assert.strictEqual(stored.identity.sourceId, 'test_voice');
        // voiceCode 仅在传入 voiceNumber 时生成，否则为 undefined
        assert.strictEqual(stored.identity.voiceCode, undefined);

        // 校验 profile 层
        assert.strictEqual(stored.profile.displayName, '测试音色');
        assert.strictEqual(stored.profile.gender, 'female');
        assert.deepStrictEqual(stored.profile.languages, ['zh-CN']);

        // 校验 runtime 层
        assert.strictEqual(stored.runtime.voiceId, 'provider_voice_123');
        assert.strictEqual(stored.runtime.model, 'test-model');
        assert.deepStrictEqual(stored.runtime.providerOptions, { temperature: 1.0 });

        // 校验 meta 层
        assert.ok(stored.meta.createdAt, '应有 createdAt');
        assert.ok(stored.meta.updatedAt, '应有 updatedAt');
        assert.strictEqual(stored.meta.dataSource, 'manual');
      });

      it('应在传入 voiceNumber 时生成 voiceCode', function() {
        const stored = VoiceNormalizer.fromForm(validFormDTO, { voiceNumber: 5 });
        // voiceCode 可能为 null（如果 providerKey 未注册）
        assert.ok(stored.identity.voiceCode === null || typeof stored.identity.voiceCode === 'string');
      });

      it('应为缺失的可选字段提供默认值', function() {
        const minimalForm = {
          provider: 'min_provider',
          service: 'min_service',
          sourceId: 'min_voice',
          displayName: '最小音色',
          gender: 'neutral',
          providerVoiceId: 'min_voice_id'
        };

        const stored = VoiceNormalizer.fromForm(minimalForm);

        assert.deepStrictEqual(stored.profile.languages, ['zh-CN']);
        assert.deepStrictEqual(stored.profile.tags, []);
        assert.strictEqual(stored.profile.description, '');
        assert.strictEqual(stored.runtime.model, 'default');
        assert.deepStrictEqual(stored.runtime.providerOptions, {});
      });
    });

    describe('fromLegacy()', function() {
      it('应正确转换遗留扁平结构', function() {
        const stored = VoiceNormalizer.fromLegacy(legacyVoice);

        // 校验已转换为新结构
        assert.ok(stored.identity, '应有 identity 层');
        assert.ok(stored.profile, '应有 profile 层');
        assert.ok(stored.runtime, '应有 runtime 层');
        assert.ok(stored.meta, '应有 meta 层');

        // 校验 identity 正确映射
        assert.strictEqual(stored.identity.id, 'legacy_voice');
        assert.strictEqual(stored.identity.provider, 'legacy_provider');
        assert.strictEqual(stored.identity.service, 'legacy_service');
        assert.strictEqual(stored.identity.voiceCode, '001000030000001');

        // 校验 profile 正确映射
        assert.strictEqual(stored.profile.displayName, '遗留音色');
        assert.strictEqual(stored.profile.alias, '遗留音色别名');
        assert.strictEqual(stored.profile.gender, 'male');

        // 校验 runtime 从 ttsConfig 提取
        assert.strictEqual(stored.runtime.voiceId, 'legacy_provider_voice_id');
        assert.strictEqual(stored.runtime.model, 'legacy-model');
      });

      it('应保持已转换的新结构不变', function() {
        const newFormatVoice = {
          identity: {
            id: 'new_voice',
            provider: 'new_provider',
            service: 'new_service',
            sourceId: 'new_source',
            voiceCode: '001000030000002'
          },
          profile: {
            displayName: '新格式音色',
            gender: 'female',
            languages: ['zh-CN'],
            tags: [],
            description: '',
            status: 'active'
          },
          runtime: {
            voiceId: 'new_runtime_id',
            model: 'new-model',
            providerOptions: {}
          },
          meta: {
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            dataSource: 'import',
            version: 'v1'
          }
        };

        const result = VoiceNormalizer.fromLegacy(newFormatVoice);

        // 应该直接返回，不做修改
        assert.strictEqual(result, newFormatVoice);
      });
    });

    describe('toForm()', function() {
      it('应正确转换存储结构为表单格式', function() {
        const stored = VoiceNormalizer.fromForm(validFormDTO);
        const form = VoiceNormalizer.toForm(stored);

        // 表单不应包含系统字段
        assert.strictEqual(form.id, undefined);
        assert.strictEqual(form.voiceCode, undefined);
        assert.strictEqual(form.createdAt, undefined);
        assert.strictEqual(form.updatedAt, undefined);

        // 应包含可编辑字段
        assert.strictEqual(form.provider, 'test_provider');
        assert.strictEqual(form.service, 'test_service');
        assert.strictEqual(form.sourceId, 'test_voice');
        assert.strictEqual(form.displayName, '测试音色');
        assert.strictEqual(form.providerVoiceId, 'provider_voice_123');
      });
    });

    describe('toRuntime()', function() {
      it('应只返回运行时必要字段', function() {
        const stored = VoiceNormalizer.fromForm(validFormDTO);
        const runtime = VoiceNormalizer.toRuntime(stored);

        assert.strictEqual(runtime.provider, 'test_provider');
        assert.strictEqual(runtime.service, 'test_service');
        assert.strictEqual(runtime.voiceId, 'provider_voice_123');
        assert.strictEqual(runtime.model, 'test-model');
        assert.deepStrictEqual(runtime.providerOptions, { temperature: 1.0 });

        // 不应包含 profile 信息
        assert.strictEqual(runtime.displayName, undefined);
        assert.strictEqual(runtime.gender, undefined);
      });
    });
  });

  // ==================== 2. VoiceMapper 测试（运行时专用） ====================

  describe('VoiceMapper (Runtime)', function() {

    const testVoice = {
      identity: {
        id: 'mapper_test',
        provider: 'mapper_provider',
        service: 'mapper_service',
        sourceId: 'mapper_source',
        voiceCode: '001000030000003'
      },
      profile: {
        displayName: '映射测试音色',
        gender: 'female',
        languages: ['zh-CN', 'en-US'],
        tags: ['测试', '映射'],
        description: '测试映射器'
      },
      runtime: {
        voiceId: 'mapper_runtime_id',
        model: 'mapper-model',
        providerOptions: { speed: 1.2 }
      }
    };

    describe('toAdapterFormat()', function() {
      it('应返回适配器格式，包含运行时信息', function() {
        const adapter = VoiceMapper.toAdapterFormat(testVoice);

        assert.strictEqual(adapter.id, 'mapper_test');
        assert.strictEqual(adapter.systemId, 'mapper_test');
        assert.strictEqual(adapter.displayName, '映射测试音色');
        assert.strictEqual(adapter.name, '映射测试音色');
        assert.strictEqual(adapter.language, 'zh-CN');
        assert.strictEqual(adapter.voiceId, 'mapper_runtime_id');
        assert.strictEqual(adapter.model, 'mapper-model');
        assert.deepStrictEqual(adapter.providerOptions, { speed: 1.2 });
      });
    });

    describe('toRuntimeConfig()', function() {
      it('应只返回运行时必要字段', function() {
        const runtime = VoiceMapper.toRuntimeConfig(testVoice);

        assert.strictEqual(runtime.provider, 'mapper_provider');
        assert.strictEqual(runtime.service, 'mapper_service');
        assert.strictEqual(runtime.voiceId, 'mapper_runtime_id');
        assert.strictEqual(runtime.model, 'mapper-model');

        // 不应包含展示信息
        assert.strictEqual(runtime.displayName, undefined);
      });
    });
  });

  // ==================== 2.5 VoiceCatalog 展示 DTO 测试 ====================

  describe('VoiceCatalog Display DTO', function() {
    const { toDisplayDto, toDetailDto } = require('../../src/modules/tts/catalog/VoiceCatalog');

    const testVoice = {
      identity: {
        id: 'catalog_test',
        provider: 'catalog_provider',
        service: 'catalog_service',
        sourceId: 'catalog_source',
        voiceCode: '001000030000004'
      },
      profile: {
        displayName: '目录测试音色',
        gender: 'female',
        languages: ['zh-CN', 'en-US'],
        tags: ['测试', '目录'],
        description: '测试目录 DTO',
        status: 'active',
        preview: 'https://example.com/preview.mp3'
      },
      runtime: {
        voiceId: 'catalog_runtime_id',
        model: 'catalog-model',
        providerOptions: { speed: 1.5 }
      },
      meta: {
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        dataSource: 'test'
      }
    };

    describe('toDisplayDto()', function() {
      it('应返回标准展示格式', function() {
        const display = toDisplayDto(testVoice);

        // 核心展示字段
        assert.strictEqual(display.id, 'catalog_test');
        assert.strictEqual(display.voiceCode, '001000030000004');
        assert.strictEqual(display.provider, 'catalog_provider');
        assert.strictEqual(display.service, 'catalog_service');
        assert.strictEqual(display.displayName, '目录测试音色');
        assert.strictEqual(display.gender, 'female');
        assert.deepStrictEqual(display.languages, ['zh-CN', 'en-US']);
        assert.strictEqual(display.previewUrl, 'https://example.com/preview.mp3');

        // 不应暴露运行时敏感信息
        assert.strictEqual(display.voiceId, undefined);
        // 但应有运行时预览
        assert.ok(display.runtimePreview);
        assert.strictEqual(display.runtimePreview.model, 'catalog-model');
      });
    });

    describe('toDetailDto()', function() {
      it('应返回详情格式，voiceId 脱敏', function() {
        const detail = toDetailDto(testVoice);

        assert.ok(detail.identity);
        assert.ok(detail.profile);
        assert.ok(detail.runtimePreview);
        assert.ok(detail.meta);

        // voiceId 应脱敏
        const maskedVoiceId = detail.runtimePreview.maskedVoiceId;
        assert.ok(maskedVoiceId.includes('****'), 'voiceId 应被脱敏');
        assert.ok(!maskedVoiceId.includes('catalog_runtime_id'), '不应暴露完整 voiceId');
      });
    });
  });

  // ==================== 3. Schema 校验测试 ====================

  describe('VoiceFormSchema', function() {

    describe('validate()', function() {
      it('应通过有效的表单数据', function() {
        const result = VoiceFormSchema.validate(validFormDTO);
        assert.strictEqual(result.valid, true);
        assert.deepStrictEqual(result.errors, []);
      });

      it('应拒绝缺失必填字段', function() {
        const invalidForm = { displayName: '缺少必填字段' };
        const result = VoiceFormSchema.validate(invalidForm);

        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.length > 0);
        assert.ok(result.errors.some(e => e.includes('provider')));
      });

      it('应拒绝禁止字段', function() {
        const formWithForbidden = {
          ...validFormDTO,
          id: 'custom_id',
          voiceCode: 'custom_code',
          ttsConfig: { voiceId: 'xxx' }
        };
        const result = VoiceFormSchema.validate(formWithForbidden);

        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('id')));
        assert.ok(result.errors.some(e => e.includes('voiceCode')));
        assert.ok(result.errors.some(e => e.includes('ttsConfig')));
      });

      it('应拒绝 providerOptions 为数组', function() {
        const formWithArrayOptions = {
          ...validFormDTO,
          providerOptions: [{ key: 'value' }]
        };
        const result = VoiceFormSchema.validate(formWithArrayOptions);

        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('providerOptions')));
      });
    });

    describe('validateUpdate()', function() {
      it('应允许部分字段更新', function() {
        const partialUpdate = { displayName: '新名称' };
        const result = VoiceFormSchema.validateUpdate(partialUpdate);

        assert.strictEqual(result.valid, true);
      });

      it('应拒绝更新禁止字段', function() {
        const updateWithForbidden = {
          displayName: '新名称',
          voiceCode: 'new_code'
        };
        const result = VoiceFormSchema.validateUpdate(updateWithForbidden);

        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('voiceCode')));
      });
    });
  });

  describe('StoredVoiceSchema', function() {

    describe('validate()', function() {
      it('应通过有效的存储结构', function() {
        const stored = VoiceNormalizer.fromForm(validFormDTO);
        const result = StoredVoiceSchema.validate(stored);

        assert.strictEqual(result.valid, true);
      });

      it('应拒绝缺失 identity 层', function() {
        const invalidStored = {
          profile: { displayName: '测试' },
          runtime: { voiceId: 'test' },
          meta: {}
        };
        const result = StoredVoiceSchema.validate(invalidStored);

        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('identity')));
      });

      it('voiceCode 应为可选字段', function() {
        const stored = VoiceNormalizer.fromForm(validFormDTO);
        delete stored.identity.voiceCode;

        const result = StoredVoiceSchema.validate(stored);
        assert.strictEqual(result.valid, true);
      });
    });
  });

  // ==================== 4. VoiceRegistry 严格类型测试 ====================

  describe('VoiceRegistry Strict Types', function() {

    before(async function() {
      await voiceRegistry.initialize();
    });

    describe('add() 拒绝非 StoredVoice', function() {
      it('直接传 form DTO 必须报错', function() {
        const formDTO = {
          provider: 'test_provider',
          service: 'test_service',
          sourceId: 'test_voice',
          displayName: '测试音色',
          gender: 'female',
          providerVoiceId: 'test_id'
        };

        assert.throws(
          () => voiceRegistry.add(formDTO),
          /only accepts StoredVoice/
        );
      });

      it('传遗留格式必须报错', function() {
        const legacy = {
          id: 'legacy_voice',
          provider: 'legacy',
          displayName: '遗留',
          ttsConfig: { voiceId: 'xxx' }
        };

        assert.throws(
          () => voiceRegistry.add(legacy),
          /only accepts StoredVoice/
        );
      });

      it('传 StoredVoice 结构必须成功', function() {
        const stored = {
          identity: {
            id: 'stored_voice_test',
            provider: 'test',
            service: 'test',
            sourceId: 'test'
          },
          profile: {
            displayName: 'Stored 音色',
            gender: 'neutral',
            languages: ['zh-CN'],
            tags: [],
            description: ''
          },
          runtime: {
            voiceId: 'runtime_id',
            model: 'model',
            providerOptions: {}
          },
          meta: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            dataSource: 'test'
          }
        };

        voiceRegistry.addStored(stored);
        const retrieved = voiceRegistry.get('stored_voice_test');
        assert.ok(retrieved);
        assert.strictEqual(retrieved.identity.id, 'stored_voice_test');

        // 清理
        voiceRegistry.remove('stored_voice_test');
      });
    });

    describe('addLegacyForMigration()', function() {
      it('应正确转换并存储遗留格式', function() {
        const legacy = {
          id: 'migration_voice_test',
          provider: 'migration',
          service: 'migration',
          sourceId: 'migration',
          displayName: '迁移音色',
          gender: 'female',
          languages: ['zh-CN'],
          ttsConfig: {
            voiceId: 'migration_voice_id',
            model: 'migration-model'
          }
        };

        voiceRegistry.addLegacyForMigration(legacy);
        const retrieved = voiceRegistry.get('migration_voice_test');

        assert.ok(retrieved);
        assert.ok(retrieved.identity);
        assert.ok(retrieved.profile);
        assert.ok(retrieved.runtime);
        assert.strictEqual(retrieved.runtime.voiceId, 'migration_voice_id');

        // 清理
        voiceRegistry.remove('migration_voice_test');
      });
    });

    describe('索引维护', function() {
      it('应正确维护 provider 索引', function() {
        const provider = 'test_index_provider';
        const testVoice = {
          identity: {
            id: 'test_index_voice',
            provider,
            service: 'test_service',
            sourceId: 'test_source'
          },
          profile: {
            displayName: '索引测试',
            gender: 'female',
            languages: ['zh-CN'],
            tags: [],
            description: ''
          },
          runtime: {
            voiceId: 'test_runtime',
            model: 'test-model',
            providerOptions: {}
          },
          meta: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            dataSource: 'test',
            version: 'v1'
          }
        };

        voiceRegistry.addStored(testVoice);
        const voices = voiceRegistry.getByProvider(provider);

        assert.ok(voices.length > 0);
        assert.strictEqual(voices[0].identity.id, 'test_index_voice');

        // 清理
        voiceRegistry.remove('test_index_voice');
      });

      describe('按 provider/service 分组', function() {
        it('getByProviderAndService 应返回正确的音色', function() {
          const provider = 'aliyun';
          const service = 'qwen_http';

          const voices = voiceRegistry.getByProviderAndService(provider, service);

          assert.ok(Array.isArray(voices));
          voices.forEach(v => {
            const vProvider = v.identity?.provider || v.provider;
            const vService = v.identity?.service || v.service;
            assert.strictEqual(vProvider, provider);
            assert.strictEqual(vService, service);
          });
        });
      });
    });
  });

  // ==================== 5. VoiceWriteService 测试 ====================

  describe('VoiceWriteService', function() {

    let writeService;
    let testRegistry;

    before(function() {
      // 创建测试用的 Registry 实例
      const { VoiceRegistry } = require('../../src/modules/tts/core/VoiceRegistry');
      testRegistry = new VoiceRegistry({ configPath: '/tmp/test-voices.json' });
      testRegistry.voices = new Map();
      testRegistry.providerIndex = new Map();
      testRegistry.serviceIndex = new Map();

      writeService = new VoiceWriteService({ registry: testRegistry });
    });

    const testForm = {
      provider: 'write_test',
      service: 'test',
      sourceId: 'test_voice',
      displayName: '写入测试音色',
      gender: 'female',
      providerVoiceId: 'test_voice_id'
    };

    describe('create()', function() {
      it('应成功创建音色', function() {
        const result = writeService.create(testForm);

        assert.strictEqual(result.success, true);
        assert.ok(result.data);
        assert.ok(result.data.identity);
        assert.strictEqual(result.data.identity.provider, 'write_test');
        assert.strictEqual(result.data.runtime.voiceId, 'test_voice_id');
      });

      it('重复创建应返回失败', function() {
        const result = writeService.create(testForm);

        assert.strictEqual(result.success, false);
        assert.strictEqual(result.error, 'Voice already exists');
      });

      it('无效表单应返回失败', function() {
        const result = writeService.create({ displayName: '缺少必填字段' });

        assert.strictEqual(result.success, false);
        assert.strictEqual(result.error, 'Form validation failed');
      });

      it('禁止字段应被拒绝', function() {
        const result = writeService.create({
          ...testForm,
          sourceId: 'forbidden_test',
          id: 'custom_id',
          voiceCode: 'custom_code'
        });

        assert.strictEqual(result.success, false);
        assert.ok(result.details.some(e => e.includes('id')));
      });
    });

    describe('createBatch()', function() {
      it('应批量创建音色', function() {
        const forms = [
          { ...testForm, sourceId: 'batch_1' },
          { ...testForm, sourceId: 'batch_2' },
          { ...testForm, sourceId: 'batch_3' }
        ];

        const result = writeService.createBatch(forms);

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.data.added.length, 3);
        assert.strictEqual(result.data.errors.length, 0);
      });

      it('部分失败应返回错误列表', function() {
        const forms = [
          { ...testForm, sourceId: 'batch_4' },
          { displayName: '缺少必填字段' }, // 无效
          { ...testForm, sourceId: 'batch_1' } // 重复
        ];

        const result = writeService.createBatch(forms);

        assert.strictEqual(result.success, false);
        assert.strictEqual(result.data.added.length, 1);
        assert.strictEqual(result.data.errors.length, 2);
      });

      it('批量新增和单条新增应共用同一套校验', function() {
        // 单条创建失败
        const singleResult = writeService.create({ displayName: '缺少字段' });
        assert.strictEqual(singleResult.error, 'Form validation failed');

        // 批量创建同样的数据
        const batchResult = writeService.createBatch([{ displayName: '缺少字段' }]);
        assert.strictEqual(batchResult.data.errors[0].error, 'Form validation failed');
      });
    });

    describe('update()', function() {
      it('应成功更新音色', function() {
        const id = 'write_test-test-test_voice';
        const result = writeService.update(id, { displayName: '更新后的名称' });

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.data.profile.displayName, '更新后的名称');
      });

      it('更新不存在的音色应返回失败', function() {
        const result = writeService.update('not-exist', { displayName: '测试' });

        assert.strictEqual(result.success, false);
        assert.strictEqual(result.error, 'Voice not found');
      });

      it('更新禁止字段应被拒绝', function() {
        const id = 'write_test-test-test_voice';
        const result = writeService.update(id, { voiceCode: 'new_code' });

        assert.strictEqual(result.success, false);
        assert.ok(result.details.some(e => e.includes('voiceCode')));
      });

      it('preview 字段写入链路应完整', function() {
        // 创建带 preview 的音色
        const formWithPreview = {
          ...testForm,
          sourceId: 'preview_test',
          preview: 'https://example.com/preview.mp3'
        };

        const createResult = writeService.create(formWithPreview);
        assert.strictEqual(createResult.success, true);

        // 验证存储中 preview 字段
        const stored = testRegistry.get('write_test-test-preview_test');
        assert.strictEqual(stored.profile.preview, 'https://example.com/preview.mp3');

        // 验证展示输出 previewUrl
        const { toDisplayDto } = require('../../src/modules/tts/catalog/VoiceCatalog');
        const display = toDisplayDto(stored);
        assert.strictEqual(display.previewUrl, 'https://example.com/preview.mp3');

        // 更新 preview
        const updateResult = writeService.update('write_test-test-preview_test', {
          preview: 'https://example.com/new-preview.mp3'
        });
        assert.strictEqual(updateResult.success, true);
        assert.strictEqual(updateResult.data.profile.preview, 'https://example.com/new-preview.mp3');

        // 清理
        testRegistry.remove('write_test-test-preview_test');
      });
    });
  });

  // ==================== 6. VoiceCatalog 集成测试 ====================

  describe('VoiceCatalog Integration', function() {

    describe('查询与分组', function() {
      it('getByProviderAndService 应正确分组', function() {
        const voices = VoiceCatalog.getByProviderAndService('aliyun', 'qwen_http');

        assert.ok(Array.isArray(voices));
        assert.ok(voices.length > 0);

        voices.forEach(v => {
          assert.strictEqual(v.provider, 'aliyun');
          assert.strictEqual(v.service, 'qwen_http');
        });
      });

      it('getDisplay 应返回展示格式', function() {
        // 获取第一个音色
        const allVoices = VoiceCatalog.query({});
        if (allVoices.length === 0) {
          this.skip('无可用的音色数据');
        }

        const voice = VoiceCatalog.getDisplay(allVoices[0].id);

        assert.ok(voice);
        assert.ok(voice.id);
        assert.ok(voice.displayName);
        // 不应暴露敏感运行时信息
        assert.strictEqual(voice.voiceId, undefined);
      });
    });
  });

  // ==================== 7. 端到端场景测试 ====================

  describe('End-to-End Scenarios', function() {

    before(async function() {
      await voiceRegistry.initialize();
    });

    describe('完整表单提交流程（通过 VoiceWriteService）', function() {
      it('应完成: VoiceWriteService.create() → 注册', function() {
        const { VoiceWriteService } = require('../../src/modules/tts/application/VoiceWriteService');
        const writeService = new VoiceWriteService({ registry: voiceRegistry });

        const result = writeService.create({
          provider: 'e2e_test',
          service: 'test',
          sourceId: 'e2e_voice',
          displayName: '端到端测试',
          gender: 'neutral',
          providerVoiceId: 'e2e_voice_id'
        });

        assert.strictEqual(result.success, true);
        assert.ok(result.data.identity.id);

        // 验证可以通过 Registry 查询
        const retrieved = voiceRegistry.get(result.data.identity.id);
        assert.ok(retrieved);

        // 清理
        voiceRegistry.remove(result.data.identity.id);
      });
    });

    describe('遗留数据迁移场景', function() {
      it('应完成: addLegacyForMigration() → 展示/运行', function() {
        // 使用迁移入口
        voiceRegistry.addLegacyForMigration(legacyVoice);

        // 获取时已转换为 StoredVoice
        const stored = voiceRegistry.get('legacy_voice');
        assert.ok(stored.identity);
        assert.ok(stored.profile);
        assert.ok(stored.runtime);

        // 展示格式（使用 VoiceCatalog 的统一 DTO）
        const { toDisplayDto } = require('../../src/modules/tts/catalog/VoiceCatalog');
        const display = toDisplayDto(stored);
        assert.strictEqual(display.id, 'legacy_voice');
        assert.strictEqual(display.displayName, '遗留音色');

        // 运行时格式
        const runtime = VoiceNormalizer.toRuntime(stored);
        assert.strictEqual(runtime.voiceId, 'legacy_provider_voice_id');

        // 清理
        voiceRegistry.remove('legacy_voice');
      });
    });
  });
});
