/**
 * 音色字段全链路追踪
 */

require('dotenv').config();

const { VoiceResolver } = require('./src/modules/tts/application/VoiceResolver');
const SynthesisRequest = require('./src/modules/tts/domain/SynthesisRequest');

console.log('========================================');
console.log('音色字段全链路追踪');
console.log('========================================\n');

// 模拟三种请求方式
const testCases = [
  {
    name: '方式1: 直接传 voice + service',
    request: {
      text: '你好',
      service: 'aliyun_qwen_http',
      voice: 'Cherry'
    }
  },
  {
    name: '方式2: 传 voiceCode（新标准）',
    request: {
      text: '你好',
      voiceCode: '001000100100001'
    }
  },
  {
    name: '方式3: 传 systemId（兼容）',
    request: {
      text: '你好',
      systemId: 'aliyun-qwen-cherry'
    }
  },
  {
    name: '方式4: 传 voice_id + service',
    request: {
      text: '你好',
      service: 'aliyun_qwen_http',
      voice_id: 'Cherry'
    }
  }
];

testCases.forEach((tc, idx) => {
  console.log(`\n--- 测试用例 ${idx + 1}: ${tc.name} ---`);
  console.log('原始请求:', JSON.stringify(tc.request, null, 2));

  try {
    // Step 1: SynthesisRequest.fromJSON
    const sr = SynthesisRequest.fromJSON(tc.request);
    console.log('\n[Step 1] SynthesisRequest 构建:');
    console.log('  voiceCode:', sr.voiceCode || '(无)');
    console.log('  systemId:', sr.systemId || '(无)');
    console.log('  service:', sr.service || '(无)');
    console.log('  provider:', sr.provider || '(无)');
    console.log('  serviceType:', sr.serviceType || '(无)');
    console.log('  options:', JSON.stringify(sr.options));

    // Step 2: VoiceResolver.normalizeRequest
    const normalized = VoiceResolver.normalizeRequest({
      text: sr.text,
      service: sr.service,
      voiceCode: sr.voiceCode,
      systemId: sr.systemId,
      options: sr.options
    });
    console.log('\n[Step 2] VoiceResolver.normalizeRequest:');
    console.log('  voiceCode:', normalized.voiceCode || '(无)');
    console.log('  systemId:', normalized.systemId || '(无)');
    console.log('  voiceId:', normalized.voiceId || '(无)');
    console.log('  service:', normalized.service);

    // Step 3: VoiceResolver.resolve (获取 VoiceIdentity)
    const voiceIdentity = VoiceResolver.resolve({
      text: sr.text,
      service: sr.service,
      voiceCode: sr.voiceCode,
      systemId: sr.systemId,
      voice: sr.options?.voice || sr.options?.voiceId
    });
    console.log('\n[Step 3] VoiceResolver.resolve → VoiceIdentity:');
    console.log('  serviceKey:', voiceIdentity.serviceKey);
    console.log('  providerKey:', voiceIdentity.providerKey);
    console.log('  providerVoiceId:', voiceIdentity.providerVoiceId);
    console.log('  modelKey:', voiceIdentity.modelKey);
    console.log('  voiceCode:', voiceIdentity.voiceCode);
    console.log('  systemId:', voiceIdentity.systemId);
    console.log('  voiceRuntime:', JSON.stringify(voiceIdentity.voiceRuntime, null, 2));

    // Step 4: 模拟锁定参数
    console.log('\n[Step 4] ParameterResolutionService 锁定参数:');
    console.log('  locked.voice = providerVoiceId:', voiceIdentity.providerVoiceId);
    console.log('  locked.model = modelKey:', voiceIdentity.modelKey);

    // Step 5: 模拟 ParameterMapper 映射结果
    console.log('\n[Step 5] ParameterMapper 映射后（平台标准 → 服务商参数）:');
    if (voiceIdentity.providerKey === 'aliyun') {
      if (voiceIdentity.serviceKey === 'aliyun_qwen_http') {
        console.log('  { input: { voice: "' + voiceIdentity.providerVoiceId + '" } }');
      } else if (voiceIdentity.serviceKey === 'aliyun_cosyvoice') {
        console.log('  { voice: "' + voiceIdentity.providerVoiceId + '" }');
      }
    }

    console.log('\n  ✅ 链路追踪成功');

  } catch (error) {
    console.log('\n  ❌ 错误:', error.message);
    console.log('     code:', error.code);
  }
});

console.log('\n========================================');
console.log('音色字段全链路汇总');
console.log('========================================');
console.log(`
【用户输入层】可接受的字段（多种方式）:
  - voice          → 音色名称/ID（如 "Cherry"）
  - voice_id       → 音色ID（下划线风格）
  - voiceId        → 音色ID（驼峰风格）
  - voice_code     → 15位数字编码（如 "001000100100001"）
  - voiceCode      → 15位数字编码（驼峰风格）
  - system_id      → 系统音色ID（如 "aliyun-qwen-cherry"）
  - systemId       → 系统音色ID（驼峰风格）

【SynthesisRequest】提取后:
  - options.voiceId  ← 从 voice/voice_id/voiceId 提取
  - voiceCode        ← 从 voice_code/voiceCode 提取
  - systemId         ← 从 system_id/systemId 提取

【VoiceResolver.normalizeRequest】标准化后:
  - voiceCode, systemId, voiceId, service

【VoiceIdentity】解析结果（核心输出）:
  - providerVoiceId  → 服务商真实音色ID（如 "Cherry", "longxiaochun"）
  - voiceRuntime     → 音色运行时配置（含 model/voiceId 等）
  - modelKey         → 模型标识（如 "qwen3-tts-instruct-flash"）
  - serviceKey       → 服务标识（如 "aliyun_qwen_http"）
  - providerKey      → 服务商（如 "aliyun"）

【ParameterResolutionService】锁定参数:
  - voice  = providerVoiceId（最高优先级，用户传入的 voice 会被覆盖）
  - model  = modelKey

【ParameterMapper】映射到服务商参数:
  - aliyun_qwen_http   → { input: { voice: providerVoiceId } }
  - aliyun_cosyvoice   → { voice: providerVoiceId }
  - tencent_tts        → { VoiceType: parseInt(providerVoiceId) }
  - volcengine_http    → { audio: { voice_type: providerVoiceId } }
  - minimax_tts        → { voice_setting: { voice_id: providerVoiceId } }
  - moss_tts           → { voice_id: providerVoiceId }

【Adapter 最终请求体】:
  - AliyunQwenAdapter     → body.input.voice
  - AliyunCosyVoiceAdapter→ payload.parameters.voice
  - TencentTtsAdapter     → requestBody.VoiceType
  - VolcengineTtsAdapter  → requestPayload.audio.voice_type
  - MinimaxTtsAdapter     → requestBody.voice_setting.voice_id
  - MossTtsAdapter        → requestBody.voice_id
`);

console.log('========================================');
