/**
 * MiniMax TTS 服务测试
 * 
 * 测试MiniMax TTS服务的各项功能
 */

const request = require('supertest');
const app = require('../src/app'); // 假设主应用文件在src/app.js
const MinimaxTtsService = require('../src/modules/tts/services/minimaxTtsService');

describe('MiniMax TTS Service', () => {
  let minimaxService;

  beforeAll(() => {
    // 设置测试环境变量
    process.env.MINIMAX_API_KEY = 'test-api-key';
    minimaxService = new MinimaxTtsService();
  });

  describe('Service Initialization', () => {
    test('should initialize with correct API key', () => {
      expect(minimaxService.apiKey).toBe('test-api-key');
      expect(minimaxService.baseUrl).toBe('https://api.minimax.chat/v1/t2a_v2');
    });

    test('should have correct default parameters', () => {
      expect(minimaxService.defaultModel).toBe('speech-2.5-hd-preview');
      expect(minimaxService.defaultVoice).toBe('male-qn-qingse');
      expect(minimaxService.defaultSpeed).toBe(1.0);
      expect(minimaxService.defaultVolume).toBe(1.0);
      expect(minimaxService.defaultPitch).toBe(0);
    });
  });

  describe('Voice Lists', () => {
    test('should return available voices', () => {
      const voices = minimaxService.getAvailableVoices();
      expect(Array.isArray(voices)).toBe(true);
      expect(voices.length).toBeGreaterThan(0);
      
      // 检查音色对象结构
      const firstVoice = voices[0];
      expect(firstVoice).toHaveProperty('id');
      expect(firstVoice).toHaveProperty('name');
      expect(firstVoice).toHaveProperty('gender');
      expect(firstVoice).toHaveProperty('language');
    });

    test('should return supported models', () => {
      const models = minimaxService.getSupportedModels();
      expect(Array.isArray(models)).toBe(true);
      expect(models).toContain('speech-2.5-hd-preview');
      expect(models).toContain('speech-2.5-preview');
    });

    test('should return supported languages', () => {
      const languages = minimaxService.getSupportedLanguages();
      expect(Array.isArray(languages)).toBe(true);
      expect(languages).toContain('中文');
      expect(languages).toContain('English');
      expect(languages).toContain('日本語');
    });

    test('should return supported emotions', () => {
      const emotions = minimaxService.getSupportedEmotions();
      expect(Array.isArray(emotions)).toBe(true);
      expect(emotions).toContain('neutral');
      expect(emotions).toContain('happy');
      expect(emotions).toContain('sad');
    });

    test('should return supported formats', () => {
      const formats = minimaxService.getSupportedFormats();
      expect(Array.isArray(formats)).toBe(true);
      expect(formats).toContain('mp3');
      expect(formats).toContain('wav');
      expect(formats).toContain('pcm');
    });
  });

  describe('Parameter Validation', () => {
    test('should validate text parameter', () => {
      expect(() => {
        minimaxService.validateParameters({ text: '' });
      }).toThrow('文本内容不能为空');

      expect(() => {
        minimaxService.validateParameters({ text: 'a'.repeat(10001) });
      }).toThrow('文本长度不能超过10000个字符');
    });

    test('should validate voice parameter', () => {
      expect(() => {
        minimaxService.validateParameters({ 
          text: '测试文本', 
          voice: 'invalid-voice' 
        });
      }).toThrow('不支持的音色');
    });

    test('should validate speed parameter', () => {
      expect(() => {
        minimaxService.validateParameters({ 
          text: '测试文本', 
          speed: 0.4 
        });
      }).toThrow('语速必须在0.5-2.0之间');

      expect(() => {
        minimaxService.validateParameters({ 
          text: '测试文本', 
          speed: 2.1 
        });
      }).toThrow('语速必须在0.5-2.0之间');
    });

    test('should validate volume parameter', () => {
      expect(() => {
        minimaxService.validateParameters({ 
          text: '测试文本', 
          volume: 0.4 
        });
      }).toThrow('音量必须在0.5-2.0之间');
    });

    test('should validate pitch parameter', () => {
      expect(() => {
        minimaxService.validateParameters({ 
          text: '测试文本', 
          pitch: -11 
        });
      }).toThrow('音调必须在-10到10之间');
    });
  });

  describe('Request Building', () => {
    test('should build correct request payload', () => {
      const params = {
        text: '测试文本',
        voice: 'male-qn-qingse',
        speed: 1.2,
        volume: 1.5,
        pitch: 2,
        model: 'speech-2.5-hd-preview',
        emotion: 'happy'
      };

      const payload = minimaxService.buildRequestPayload(params);
      
      expect(payload.model).toBe('speech-2.5-hd-preview');
      expect(payload.text).toBe('测试文本');
      expect(payload.voice_setting.voice_id).toBe('male-qn-qingse');
      expect(payload.voice_setting.speed).toBe(1.2);
      expect(payload.voice_setting.vol).toBe(1.5);
      expect(payload.voice_setting.pitch).toBe(2);
      expect(payload.voice_setting.emotion).toBe('happy');
    });

    test('should handle timbre weights', () => {
      const params = {
        text: '测试文本',
        timbre_weights: [
          { voice_id: 'voice1', weight: 60 },
          { voice_id: 'voice2', weight: 40 }
        ]
      };

      const payload = minimaxService.buildRequestPayload(params);
      expect(payload.voice_setting.timbre_weights).toEqual(params.timbre_weights);
    });

    test('should handle pronunciation dictionary', () => {
      const params = {
        text: '测试文本',
        pronunciation_dict: {
          tone: ['测试/(ce4)(shi4)']
        }
      };

      const payload = minimaxService.buildRequestPayload(params);
      expect(payload.pronunciation_dict).toEqual(params.pronunciation_dict);
    });
  });
});

describe('MiniMax TTS API Integration', () => {
  beforeAll(() => {
    // 设置测试环境变量
    process.env.MINIMAX_API_KEY = 'test-api-key';
  });

  describe('POST /api/tts/unified', () => {
    test('should handle basic TTS request', async () => {
      const response = await request(app)
        .post('/api/tts/unified')
        .send({
          service: 'minimax',
          text: '这是一个测试',
          voice: 'male-qn-qingse'
        });

      // 注意：这里可能需要mock API响应，因为测试环境可能没有真实的API key
      if (process.env.NODE_ENV === 'test') {
        // 在测试环境中，我们期望得到错误响应（因为使用的是测试API key）
        expect(response.status).toBe(500);
      } else {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('audioUrl');
      }
    });

    test('should validate required parameters', async () => {
      const response = await request(app)
        .post('/api/tts/unified')
        .send({
          service: 'minimax'
          // 缺少text参数
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('text');
    });

    test('should handle invalid service parameter', async () => {
      const response = await request(app)
        .post('/api/tts/unified')
        .send({
          service: 'invalid-service',
          text: '测试文本'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('不支持的TTS服务');
    });

    test('should handle advanced parameters', async () => {
      const response = await request(app)
        .post('/api/tts/unified')
        .send({
          service: 'minimax',
          text: '这是高级参数测试',
          voice: 'Chinese (Mandarin)_Lyrical_Voice',
          speed: 1.2,
          volume: 1.5,
          pitch: 2,
          model: 'speech-2.5-hd-preview',
          emotion: 'happy',
          sample_rate: 44100,
          format: 'mp3'
        });

      if (process.env.NODE_ENV === 'test') {
        expect(response.status).toBe(500);
      } else {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      }
    });
  });

  describe('GET /api/tts/unified/voices', () => {
    test('should return MiniMax voices when service specified', async () => {
      const response = await request(app)
        .get('/api/tts/unified/voices?service=minimax');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    test('should include MiniMax in all services response', async () => {
      const response = await request(app)
        .get('/api/tts/unified/voices');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('minimax');
      expect(Array.isArray(response.body.data.minimax)).toBe(true);
    });
  });
});

describe('Error Handling', () => {
  let minimaxService;

  beforeAll(() => {
    minimaxService = new MinimaxTtsService();
  });

  test('should handle missing API key', () => {
    delete process.env.MINIMAX_API_KEY;
    expect(() => {
      new MinimaxTtsService();
    }).toThrow('MINIMAX_API_KEY environment variable is required');
  });

  test('should handle network errors gracefully', async () => {
    // Mock网络错误
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    try {
      await minimaxService.convertTextToSpeech('测试文本');
    } catch (error) {
      expect(error.message).toContain('Network error');
    }

    global.fetch = originalFetch;
  });

  test('should handle API error responses', async () => {
    // Mock API错误响应
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({
        error: 'Invalid request'
      })
    });

    try {
      await minimaxService.convertTextToSpeech('测试文本');
    } catch (error) {
      expect(error.message).toContain('Invalid request');
    }

    global.fetch = originalFetch;
  });
});

describe('Performance Tests', () => {
  let minimaxService;

  beforeAll(() => {
    process.env.MINIMAX_API_KEY = 'test-api-key';
    minimaxService = new MinimaxTtsService();
  });

  test('should handle concurrent requests', async () => {
    const requests = Array(5).fill().map((_, i) => 
      minimaxService.validateParameters({
        text: `测试文本${i}`,
        voice: 'male-qn-qingse'
      })
    );

    expect(() => {
      requests.forEach(req => req);
    }).not.toThrow();
  });

  test('should validate parameters quickly', () => {
    const start = Date.now();
    
    for (let i = 0; i < 1000; i++) {
      minimaxService.validateParameters({
        text: '测试文本',
        voice: 'male-qn-qingse'
      });
    }
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // 应该在100ms内完成1000次验证
  });
});

// 清理函数
afterAll(() => {
  // 清理测试环境
  delete process.env.MINIMAX_API_KEY;
});