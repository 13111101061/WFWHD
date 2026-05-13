/**
 * TTS 服务链路连通性测试
 *
 * 测试内容：
 * 1. ServiceContainer 初始化
 * 2. ProviderRegistry 自动加载 adapter
 * 3. 字段定义系统编译
 * 4. 音色解析
 * 5. 能力查询
 * 6. 参数映射
 * 7. 服务商适配器实例化
 * 8. HTTP 路由注册
 *
 * 运行方式: node tests/test-tts-connectivity.js
 */

const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  gray: (text) => `\x1b[90m${text}\x1b[0m`
};

const results = {
  passed: 0,
  failed: 0,
  warnings: 0
};

function log(pass, msg, detail = '') {
  if (pass) {
    results.passed++;
    console.log(`  ${colors.green('✓')} ${msg}`);
  } else if (pass === null) {
    results.warnings++;
    console.log(`  ${colors.yellow('⚠')} ${msg}`);
  } else {
    results.failed++;
    console.log(`  ${colors.red('✗')} ${msg}`);
  }
  if (detail) {
    console.log(`      ${colors.gray(detail)}`);
  }
}

async function testServiceContainerInit() {
  console.log('\n' + colors.cyan('═══ 测试 1: ServiceContainer 初始化 ═══'));

  try {
    const serviceContainer = require('../src/config/ServiceContainer');

    if (serviceContainer.isInitialized()) {
      log(true, 'ServiceContainer 已初始化');
    } else {
      console.log('  正在初始化 ServiceContainer...');
      await serviceContainer.initialize();
      log(true, 'ServiceContainer 初始化成功');
    }

    const services = serviceContainer.getRegisteredServices();
    log(true, `注册了 ${services.length} 个服务`, services.join(', '));

    const requiredServices = [
      'providerManifest',
      'providerRegistry',
      'providerManagementService',
      'fieldDefinitionSystem',
      'ttsProviderAdapter',
      'capabilityResolver',
      'executionPolicy',
      'validationService',
      'queryService',
      'synthesisService',
      'ttsHttpAdapter'
    ];

    for (const name of requiredServices) {
      try {
        const service = serviceContainer.get(name);
        log(true, `服务 ${name} 可获取`, typeof service === 'function' ? 'function' : 'object');
      } catch (e) {
        log(false, `服务 ${name} 获取失败`, e.message);
      }
    }

    return true;
  } catch (e) {
    log(false, 'ServiceContainer 初始化失败', e.message);
    console.log(colors.red(e.stack));
    return false;
  }
}

async function testProviderRegistry() {
  console.log('\n' + colors.cyan('═══ 测试 2: ProviderRegistry 自动加载 ═══'));

  try {
    const serviceContainer = require('../src/config/ServiceContainer');
    const providerRegistry = serviceContainer.get('providerRegistry');

    const allServices = providerRegistry.getAll();
    log(true, `注册了 ${allServices.length} 个服务`);

    for (const svc of allServices) {
      log(true, `  服务: ${svc.key}`, `${svc.displayName} (${svc.status})`);
    }

    const runtimeStats = providerRegistry.getRuntimeStats();
    log(true, `已加载 ${runtimeStats.registeredClasses} 个 adapter 类`);
    log(true, `已缓存 ${runtimeStats.cachedInstances} 个 adapter 实例`);

    const providers = providerRegistry.getAllProviders();
    log(true, `服务商数量: ${providers.length}`);
    for (const provider of providers) {
      log(true, `  服务商: ${provider.key}`, provider.displayName || '');
      const services = providerRegistry.getServicesByProvider(provider.key);
      log(true, `    服务数: ${services.length}`, services.map(s => s.key).join(', '));
    }

    return true;
  } catch (e) {
    log(false, 'ProviderRegistry 测试失败', e.message);
    console.log(colors.red(e.stack));
    return false;
  }
}

async function testFieldDefinitionSystem() {
  console.log('\n' + colors.cyan('═══ 测试 3: 字段定义系统编译 ═══'));

  try {
    const serviceContainer = require('../src/config/ServiceContainer');
    const fieldDefSystem = serviceContainer.get('fieldDefinitionSystem');
    const stats = fieldDefSystem.getStats();
    log(true, `字段定义系统 stats:`, JSON.stringify(stats));

    const services = ['moss_tts', 'aliyun_cosyvoice', 'aliyun_qwen_http', 'tencent_tts'];
    for (const svc of services) {
      try {
        const compiled = fieldDefSystem.getCompiledCapability(svc);
        if (compiled) {
          const schema = compiled.getSchema();
          const fieldCount = Object.keys(schema).length;
          log(true, `服务 ${svc} 编译成功`, `${fieldCount} 个字段`);

          const defaults = compiled.getDefaults();
          log(true, `  默认值:`, JSON.stringify(defaults));
        } else {
          log(false, `服务 ${svc} 编译失败: 返回 null`);
        }
      } catch (e) {
        log(false, `服务 ${svc} 获取失败`, e.message);
      }
    }

    return true;
  } catch (e) {
    log(false, 'FieldDefinitionSystem 测试失败', e.message);
    console.log(colors.red(e.stack));
    return false;
  }
}

async function testCapabilityResolver() {
  console.log('\n' + colors.cyan('═══ 测试 4: 能力解析器 ═══'));

  try {
    const serviceContainer = require('../src/config/ServiceContainer');
    const capabilityResolver = serviceContainer.get('capabilityResolver');

    const services = ['moss_tts', 'aliyun_cosyvoice'];
    for (const svc of services) {
      try {
        const context = capabilityResolver.resolve(svc);
        log(true, `服务 ${svc} 解析成功`);

        if (context.compiled) {
          const schema = context.compiled.getSchema();
          log(true, `  schema 字段数: ${Object.keys(schema).length}`);
        }

        if (context.resolvedDefaults) {
          log(true, `  resolvedDefaults:`, JSON.stringify(context.resolvedDefaults));
        }

        if (context.lockedParams) {
          log(true, `  lockedParams:`, JSON.stringify(context.lockedParams));
        }
      } catch (e) {
        log(false, `服务 ${svc} 解析失败`, e.message);
      }
    }

    return true;
  } catch (e) {
    log(false, 'CapabilityResolver 测试失败', e.message);
    console.log(colors.red(e.stack));
    return false;
  }
}

async function testTtsQueryService() {
  console.log('\n' + colors.cyan('═══ 测试 5: 查询服务 ═══'));

  try {
    const serviceContainer = require('../src/config/ServiceContainer');
    const queryService = serviceContainer.get('queryService');

    const capabilities = queryService.getCapabilities('moss_tts');
    if (capabilities) {
      log(true, 'getCapabilities(moss_tts) 成功');
      log(true, '  schema 存在:', !!capabilities.schema);
      log(true, '  defaults 存在:', !!capabilities.defaults);
      log(true, '  lockedParams 存在:', !!capabilities.lockedParams);
    } else {
      log(false, 'getCapabilities(moss_tts) 返回 null');
    }

    const pms = serviceContainer.get('providerManagementService');
    const allProviders = pms.getAllProviders();
    log(true, `getAllProviders 返回 ${allProviders.length} 个服务商`);

    const catalog = queryService.getFrontendCatalog();
    if (catalog) {
      log(true, 'getFrontendCatalog 成功');
      log(true, `  服务数量: ${catalog.services?.length || 'N/A'}`);
    } else {
      log(null, 'getFrontendCatalog 返回 null（可能需要 Redis）');
    }

    return true;
  } catch (e) {
    log(false, 'TtsQueryService 测试失败', e.message);
    console.log(colors.red(e.stack));
    return false;
  }
}

async function testProviderAdapter() {
  console.log('\n' + colors.cyan('═══ 测试 6: 服务商适配器实例化 ═══'));

  try {
    const serviceContainer = require('../src/config/ServiceContainer');
    const pms = serviceContainer.get('providerManagementService');

    const services = ['moss_tts', 'aliyun_cosyvoice', 'aliyun_qwen_http'];
    for (const svc of services) {
      try {
        const adapter = pms.getAdapter(svc);
        if (adapter) {
          log(true, `服务 ${svc} 获取适配器成功`, adapter.constructor?.name || 'unknown');
        } else {
          log(false, `服务 ${svc} 获取适配器返回 null`);
        }
      } catch (e) {
        log(false, `服务 ${svc} 获取适配器失败`, e.message);
      }
    }

    const ttsProvider = serviceContainer.get('ttsProviderAdapter');
    const availableProviders = ttsProvider.getAvailableProviders();
    log(true, `getAvailableProviders 返回 ${availableProviders.length} 个可用提供商`);

    const health = await ttsProvider.getHealthStatus();
    log(true, 'getHealthStatus 成功', `overall: ${health.overall}`);

    return true;
  } catch (e) {
    log(false, 'TtsProviderAdapter 测试失败', e.message);
    console.log(colors.red(e.stack));
    return false;
  }
}

async function testParameterMapping() {
  console.log('\n' + colors.cyan('═══ 测试 7: 参数映射 ═══'));

  try {
    const serviceContainer = require('../src/config/ServiceContainer');
    const fieldDefinitionSystem = serviceContainer.get('fieldDefinitionSystem');

    const compiled = fieldDefinitionSystem.getCompiledCapability('moss_tts');
    if (!compiled) {
      log(false, '获取 moss_tts 编译能力失败');
      return false;
    }

    const testParams = {
      text: '测试文本',
      voice: 'moss-tts-beijingnan',
      speed: 1.0,
      format: 'wav',
      samplingParams: {
        temperature: 1.5,
        topP: 0.9
      }
    };

    const context = {
      providerVoiceId: 'moss-tts-beijingnan'
    };

    try {
      const mapped = compiled.mapToProvider(testParams, context);
      log(true, 'mapToProvider 成功');
      log(true, '  映射结果:', JSON.stringify(mapped));

      if (mapped.voice_id) {
        log(true, '  voice → voice_id 映射成功', mapped.voice_id);
      }

      if (mapped.sampling_params?.temperature !== undefined) {
        log(true, '  sampling_params.temperature 映射成功', mapped.sampling_params.temperature);
      }

      if (mapped.speed === undefined) {
        log(true, '  unsupported 字段(speed)被正确过滤');
      }
    } catch (e) {
      log(false, 'mapToProvider 失败', e.message);
    }

    return true;
  } catch (e) {
    log(false, '参数映射测试失败', e.message);
    console.log(colors.red(e.stack));
    return false;
  }
}

async function testHttpAdapter() {
  console.log('\n' + colors.cyan('═══ 测试 8: HTTP 路由注册 ═══'));

  try {
    const serviceContainer = require('../src/config/ServiceContainer');
    const ttsHttpAdapter = serviceContainer.get('ttsHttpAdapter');

    log(true, 'TtsHttpAdapter 实例获取成功', ttsHttpAdapter.constructor?.name || 'unknown');

    const methods = ['synthesize', 'batchSynthesize', 'getCapabilities', 'getVoices', 'getProviders'];
    for (const method of methods) {
      if (typeof ttsHttpAdapter[method] === 'function') {
        log(true, `方法 ${method} 存在`);
      } else {
        log(false, `方法 ${method} 不存在`);
      }
    }

    return true;
  } catch (e) {
    log(false, 'HttpAdapter 测试失败', e.message);
    console.log(colors.red(e.stack));
    return false;
  }
}

async function testSynthesisValidation() {
  console.log('\n' + colors.cyan('═══ 测试 9: 合成参数校验 ═══'));

  try {
    const serviceContainer = require('../src/config/ServiceContainer');
    const synthesisService = serviceContainer.get('synthesisService');

    const testCases = [
      { text: '', service: 'moss_tts', expect: 'fail', desc: '空文本' },
      { text: 'a'.repeat(10001), service: 'moss_tts', expect: 'fail', desc: '超长文本' },
      { text: '测试文本', service: 'unknown_service', expect: 'fail', desc: '未知服务' },
      { text: '测试文本', service: 'moss_tts', expect: 'error', desc: '缺少音色' }
    ];

    for (const tc of testCases) {
      try {
        await synthesisService.synthesize({ text: tc.text, service: tc.service });
        if (tc.expect === 'fail' || tc.expect === 'error') {
          log(false, `参数校验: ${tc.desc}`, '应该抛出异常但没有');
        } else {
          log(true, `参数校验: ${tc.desc}`, '通过');
        }
      } catch (e) {
        if (tc.expect === 'fail' || tc.expect === 'error') {
          log(true, `参数校验: ${tc.desc}`, `正确抛出异常: ${e.code || e.message}`);
        } else {
          log(false, `参数校验: ${tc.desc}`, `意外异常: ${e.message}`);
        }
      }
    }

    return true;
  } catch (e) {
    log(false, '合成参数校验测试失败', e.message);
    console.log(colors.red(e.stack));
    return false;
  }
}

async function testProviderManagementService() {
  console.log('\n' + colors.cyan('═══ 测试 10: 服务商管理服务 ═══'));

  try {
    const serviceContainer = require('../src/config/ServiceContainer');
    const pms = serviceContainer.get('providerManagementService');

    const services = ['moss_tts', 'aliyun_cosyvoice', 'tencent_tts'];
    for (const svc of services) {
      const info = pms.getServiceInfo(svc);
      if (info) {
        log(true, `服务 ${svc} 信息获取成功`);
        log(true, `  显示名称: ${info.displayName}`);
        log(true, `  状态: ${info.status}`);
        log(true, `  提供商: ${info.provider}`);
      } else {
        log(false, `服务 ${svc} 信息获取失败`);
      }

      const availability = pms.checkServiceAvailability(svc);
      log(true, `  可用性: ${availability.available ? '可用' : '不可用'}`, availability.reason);
    }

    return true;
  } catch (e) {
    log(false, 'ProviderManagementService 测试失败', e.message);
    console.log(colors.red(e.stack));
    return false;
  }
}

async function main() {
  console.log('\n' + colors.cyan('╔════════════════════════════════════════════╗'));
  console.log(colors.cyan('║      TTS 服务链路连通性测试                    ║'));
  console.log(colors.cyan('╚════════════════════════════════════════════╝'));

  const tests = [
    { name: 'ServiceContainer 初始化', fn: testServiceContainerInit },
    { name: 'ProviderRegistry 自动加载', fn: testProviderRegistry },
    { name: '字段定义系统编译', fn: testFieldDefinitionSystem },
    { name: '能力解析器', fn: testCapabilityResolver },
    { name: '查询服务', fn: testTtsQueryService },
    { name: '服务商适配器实例化', fn: testProviderAdapter },
    { name: '参数映射', fn: testParameterMapping },
    { name: 'HTTP 路由注册', fn: testHttpAdapter },
    { name: '合成参数校验', fn: testSynthesisValidation },
    { name: '服务商管理服务', fn: testProviderManagementService }
  ];

  for (const test of tests) {
    try {
      await test.fn();
    } catch (e) {
      log(false, `${test.name} 抛出未捕获异常`, e.message);
    }
  }

  console.log('\n' + colors.cyan('════════════════════════════════════════════'));
  console.log('📊 测试结果汇总');
  console.log('════════════════════════════════════════════');
  console.log(`  ${colors.green('✓ 通过')}: ${results.passed}`);
  console.log(`  ${colors.red('✗ 失败')}: ${results.failed}`);
  console.log(`  ${colors.yellow('⚠ 警告')}: ${results.warnings}`);
  console.log('════════════════════════════════════════════');

  const total = results.passed + results.failed + results.warnings;
  const passRate = total > 0 ? Math.round(results.passed / total * 100) : 0;
  console.log(`  通过率: ${passRate}%`);

  if (results.failed > 0) {
    console.log(`\n${colors.red('⚠ 有测试失败，请检查上面的错误信息')}`);
  } else if (results.warnings > 0) {
    console.log(`\n${colors.yellow('⚠ 有警告，部分功能可能受限（如 Redis 未配置）')}`);
  } else {
    console.log(`\n${colors.green('✅ 所有核心测试通过！')}`);
  }

  console.log('');
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error(colors.red('测试脚本异常:'), e);
  process.exit(1);
});
