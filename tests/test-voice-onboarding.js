/**
 * 音色入驻链路测试
 * 用法: node tests/test-voice-onboarding.js
 */
const path = require('path');
const fs = require('fs');

(async () => {
  const audioPath = path.resolve(__dirname, '../项目追踪/音色1.wav');
  if (!fs.existsSync(audioPath)) {
    console.error('❌ 音频文件不存在:', audioPath);
    process.exit(1);
  }

  const stat = fs.statSync(audioPath);
  console.log(`📂 音频文件: ${audioPath} (${(stat.size / 1024).toFixed(1)}KB)`);

  // 1. 初始化 ServiceContainer
  console.log('\n⏳ 初始化服务容器...');
  const serviceContainer = require('../src/config/ServiceContainer');
  await serviceContainer.initialize();
  console.log('✅ ServiceContainer 初始化完成');

  const voiceOnboardingService = serviceContainer.get('voiceOnboardingService');

  // 2. 构造模拟 req（跳过 multer，手动构造 file 对象）
  console.log('\n🚀 开始音色入驻流程...');
  const mockFile = {
    path: audioPath,
    originalname: '音色1.wav',
    mimetype: 'audio/wav',
    size: stat.size
  };

  const mockReq = {
    file: mockFile,
    body: {
      providerKey: 'moss',
      displayName: '链路测试音色',
      gender: 'female',
      tags: ['清晰', '温柔', '少女', '陪伴', '治愈', '自然'],
      languages: ['中文'],
      skipTestSynthesis: true       // 先跳过测试合成，减少等待
    }
  };

  // 3. 调用注册
  const startTime = Date.now();
  const result = await voiceOnboardingService.registerVoice(mockReq);
  const elapsed = Date.now() - startTime;

  // 4. 输出结果
  console.log(`\n⏱ 耗时: ${(elapsed / 1000).toFixed(1)}s`);
  console.log(`📊 成功: ${result.success}`);

  if (result.success) {
    const d = result.data;
    console.log(`🆔 voiceId: ${d.voice?.id}`);
    console.log(`🔢 voiceCode: ${d.voice?.voiceCode}`);
    console.log(`📝 displayName: ${d.voice?.displayName}`);
    console.log(`🎭 status: ${d.voice?.status}`);
    console.log(`⏳ asyncMode: ${d.asyncMode}`);
    console.log(`🔑 providerVoiceId: ${d.providerVoiceId || d.cloneResult?.providerVoiceId}`);

    if (d.cloneResult?.meta) {
      console.log('📦 meta:', JSON.stringify(d.cloneResult.meta, null, 2));
    }

    if (d.asyncMode) {
      console.log(`\n🔄 异步模式 —— 轮询状态:`);
      console.log(`   GET /api/voices/register/${d.providerVoiceId || d.taskId}/status?provider=moss`);

      // 立即查一次状态
      const voiceId = d.providerVoiceId || d.taskId;
      console.log(`\n⏳ 首次轮询 ${voiceId}...`);
      const status = await voiceOnboardingService.checkCloneStatus('moss', voiceId);
      console.log(`   status: ${status.status}`);
      if (status.error) console.log(`   error: ${status.error}`);
    }

    if (d.testAudioUrl) {
      console.log(`🔊 testAudioUrl: ${d.testAudioUrl}`);
    }
  } else {
    console.log(`❌ 失败: ${result.error}`);
    if (result.details) console.log('详情:', JSON.stringify(result.details, null, 2));
  }

  console.log('\n✅ 链路测试完成');
  process.exit(0);
})().catch(e => {
  console.error('\n❌ 测试异常:', e.message);
  console.error(e.stack);
  process.exit(1);
});
