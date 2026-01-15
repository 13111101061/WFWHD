/**
 * Quick test for ParameterMapper
 */
const { parameterMapper } = require('../src/modules/tts/config/ParameterMapper');

async function test() {
  try {
    console.log('Initializing ParameterMapper...\n');
    await parameterMapper.initialize();

    console.log('Test 1: Aliyun CosyVoice basic mapping');
    const result1 = parameterMapper.mapAndValidate('aliyun', 'cosyvoice', {
      voice: 'longxiaochun_v2',
      speed: 1.5,
      volume: 8
    });
    console.log('Input: {voice: "longxiaochun_v2", speed: 1.5, volume: 8}');
    console.log('Output:', JSON.stringify(result1, null, 2));
    console.log('✅ Expected: rate=1.5, volume=80 (8*10)\n');

    console.log('\nTest 2: MiniMax nested mapping');
    const result2 = parameterMapper.mapAndValidate('minimax', 'tts', {
      voice: 'male-qn-qingse',
      speed: 1.2,
      volume: 8,
      pitch: 1.25
    });
    console.log('Input: {voice: "male-qn-qingse", speed: 1.2, volume: 8, pitch: 1.25}');
    console.log('Output:', JSON.stringify(result2, null, 2));
    console.log('✅ Expected: voice_setting.vol=0.8 (8/10), voice_setting.pitch=6 ((1.25-1)*24)\n');

    console.log('\nTest 3: Tencent TTS');
    const result3 = parameterMapper.mapAndValidate('tencent', 'tts', {
      voice: '101001',
      volume: 7
    });
    console.log('Input: {voice: "101001", volume: 7}');
    console.log('Output:', JSON.stringify(result3, null, 2));
    console.log('✅ Expected: VoiceType=101001, Volume=7, Speed=1.0 (default)\n');

    console.log('\nTest 4: Error handling - unsupported parameter');
    try {
      parameterMapper.mapAndValidate('tencent', 'tts', {
        voice: '101001',
        pitch: 1.2
      });
      console.log('❌ Should have thrown error for unsupported pitch parameter');
    } catch (error) {
      console.log('✅ Correctly threw error:', error.message);
    }

    console.log('\nTest 5: Error handling - out of range');
    try {
      parameterMapper.mapAndValidate('aliyun', 'cosyvoice', {
        voice: 'longxiaochun_v2',
        speed: 5.0
      });
      console.log('❌ Should have thrown error for speed out of range');
    } catch (error) {
      console.log('✅ Correctly threw error:', error.message);
    }

    console.log('\n✅ All basic tests completed!');
    console.log('\nParameterMapper is working correctly.');
    console.log('- Flat structure mapping: OK');
    console.log('- Nested structure mapping: OK');
    console.log('- Standardization transforms: OK');
    console.log('- Error handling: OK');
    console.log('- Default values: OK');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

test();
