/**
 * 新认证系统测试脚本
 * 用于验证重构后的认证系统是否正常工作
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testNewAuthSystem() {
  console.log('🧪 开始测试新的认证系统...\n');

  try {
    // 测试1: 健康检查（无需认证）
    console.log('📍 测试1: 健康检查端点');
    const healthResponse = await axios.get(`${BASE_URL}/health`);
    console.log('✅ 健康检查成功:', healthResponse.data);
    console.log('');

    // 测试2: 公开信息端点（无需认证）
    console.log('📍 测试2: 公开信息端点');
    const publicResponse = await axios.get(`${BASE_URL}/api/public/info`);
    console.log('✅ 公开信息:', publicResponse.data);
    console.log('');

    // 测试3: 无API密钥访问受保护端点
    console.log('📍 测试3: 无API密钥访问TTS服务');
    try {
      await axios.post(`${BASE_URL}/api/tts`, {
        text: '测试文本',
        voice: 'longxiaochun_v2'
      });
      console.log('❌ 应该被拒绝但没有');
    } catch (error) {
      console.log('✅ 正确拒绝未认证请求:', error.response?.data?.error || error.message);
    }
    console.log('');

    // 测试4: 使用无效API密钥
    console.log('📍 测试4: 使用无效API密钥');
    try {
      await axios.post(`${BASE_URL}/api/tts`, {
        text: '测试文本',
        voice: 'longxiaochun_v2'
      }, {
        headers: {
          'X-API-Key': 'invalid-key-12345'
        }
      });
      console.log('❌ 应该被拒绝但没有');
    } catch (error) {
      console.log('✅ 正确拒绝无效密钥:', error.response?.data?.error || error.message);
    }
    console.log('');

    // 测试5: 使用环境变量中的API密钥
    const apiKey = process.env.API_KEYS?.split(',')[0];
    if (apiKey) {
      console.log('📍 测试5: 使用有效的API密钥');
      try {
        const response = await axios.post(`${BASE_URL}/api/tts`, {
          text: '这是一个测试',
          voice: 'longxiaochun_v2'
        }, {
          headers: {
            'X-API-Key': apiKey
          }
        });
        console.log('✅ API密钥认证成功');
        console.log('📝 响应状态:', response.status);
        console.log('📝 响应数据结构:', Object.keys(response.data || {}));
      } catch (error) {
        console.log('⚠️  API密钥可能有问题:', error.response?.data?.error || error.message);
      }
      console.log('');

      // 测试6: 使用管理员API密钥访问监控端点
      console.log('📍 测试6: 访问认证统计端点');
      try {
        const statsResponse = await axios.get(`${BASE_URL}/api/auth/stats`, {
          headers: {
            'X-API-Key': apiKey
          }
        });
        console.log('✅ 成功获取认证统计');
        console.log('📊 密钥统计:', statsResponse.data.data?.auth || '无数据');
        console.log('📊 实时指标:', statsResponse.data.data?.metrics || '无数据');
      } catch (error) {
        console.log('⚠️  访问统计端点失败:', error.response?.data?.error || error.message);
      }
      console.log('');

      // 测试7: 生成新的API密钥
      console.log('📍 测试7: 生成新的API密钥');
      try {
        const keyResponse = await axios.post(`${BASE_URL}/api/auth/keys`, {
          services: ['tts', 'unified-tts'],
          permissions: ['tts.access'],
          description: '测试生成的密钥',
          expiresIn: 24 * 60 * 60 * 1000 // 24小时
        }, {
          headers: {
            'X-API-Key': apiKey
          }
        });
        console.log('✅ 成功生成新密钥');
        console.log('🔑 新密钥:', keyResponse.data.data?.key?.substring(0, 20) + '...');
        console.log('📋 密钥信息:', {
          type: keyResponse.data.data?.keyInfo?.type,
          services: keyResponse.data.data?.keyInfo?.services,
          permissions: keyResponse.data.data?.keyInfo?.permissions
        });

        // 使用新生成的密钥进行测试
        if (keyResponse.data.data?.key) {
          const newKey = keyResponse.data.data.key;
          console.log('📍 测试8: 使用新生成的密钥');
          try {
            const testResponse = await axios.post(`${BASE_URL}/api/tts`, {
              text: '使用新密钥的测试',
              voice: 'longxiaochun_v2'
            }, {
              headers: {
                'X-API-Key': newKey
              }
            });
            console.log('✅ 新密钥认证成功');
          } catch (error) {
            console.log('⚠️  新密钥测试失败:', error.response?.data?.error || error.message);
          }
        }
      } catch (error) {
        console.log('⚠️  生成新密钥失败:', error.response?.data?.error || error.message);
      }
    } else {
      console.log('⚠️  未找到API_KEYS环境变量，跳过需要认证的测试');
    }

    console.log('\n🎉 认证系统测试完成！');

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 请确保服务器正在运行 (npm start)');
    }
  }
}

// 运行测试
if (require.main === module) {
  testNewAuthSystem();
}

module.exports = { testNewAuthSystem };