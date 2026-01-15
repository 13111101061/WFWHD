require('dotenv').config();
const axios = require('axios');

async function main() {
  const baseURL = process.env.TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  const fid = process.env.TEST_FID || ''; // 上传目录ID（留空=根目录）

  console.log('Base URL:', baseURL);

  // 选择认证方式：优先用户密钥，其次管理员密钥（取 API_KEYS 第一个）
  let authHeader = {};
  let authMode = 'none';
  if (process.env.TEST_USER_KEY) {
    authHeader = { 'x-user-key': process.env.TEST_USER_KEY };
    authMode = 'x-user-key';
  } else if (process.env.API_KEYS) {
    const firstAdminKey = process.env.API_KEYS.split(',').map(s => s.trim()).filter(Boolean)[0];
    if (firstAdminKey) {
      authHeader = { 'x-api-key': firstAdminKey };
      authMode = 'x-api-key';
    }
  }
  console.log('Auth Mode:', authMode);

  if (Object.keys(authHeader).length === 0) {
    console.error('未找到可用的鉴权信息。请在 .env 配置 TEST_USER_KEY 或 API_KEYS。');
    process.exit(1);
  }

  const client = axios.create({
    baseURL,
    timeout: 20000,
    headers: {
      ...authHeader,
      'Accept': 'application/json'
    },
    validateStatus: () => true // 我们自行判断状态码，避免抛异常
  });

  const logAxiosError = (err) => {
    console.error('\\n请求异常:');
    console.error('message:', err.message);
    if (err.code) console.error('code:', err.code);
    if (err.errno) console.error('errno:', err.errno);
    if (err.stack) console.error('stack:', err.stack.split('\\n')[0]);
    if (err.response) {
      console.error('status:', err.response.status);
      console.error('data:', JSON.stringify(err.response.data, null, 2));
    }
  };

  try {
    // 0) 健康检查
    console.log(`\\n0) 健康检查: GET ${baseURL}/health`);
    const health = await client.get('/health');
    console.log('健康检查结果:', health.status, JSON.stringify(health.data, null, 2));
    if (health.status !== 200) {
      console.error('健康检查异常，建议先重启服务后再试');
      process.exit(1);
    }

    // 1) 鉴权状态
    console.log(`\\n1) 查询鉴权状态: GET ${baseURL}/api/snpan/auth`);
    const authStatus = await client.get('/api/snpan/auth');
    console.log('状态码:', authStatus.status);
    console.log('响应体:', JSON.stringify(authStatus.data, null, 2));
    if (authStatus.status >= 400) {
      console.error('鉴权状态接口返回非 2xx');
    }

    // 2) 刷新鉴权
    console.log(`\\n2) 刷新鉴权: POST ${baseURL}/api/snpan/auth/refresh`);
    const refreshed = await client.post('/api/snpan/auth/refresh');
    console.log('状态码:', refreshed.status);
    console.log('响应体:', JSON.stringify(refreshed.data, null, 2));

    // 3) 获取上传地址
    console.log(`\\n3) 获取上传地址: GET ${baseURL}/api/snpan/upload-url?fid=${fid}`);
    const uploadUrlResp = await client.get('/api/snpan/upload-url', { params: { fid } });
    console.log('状态码:', uploadUrlResp.status);
    console.log('响应体:', JSON.stringify(uploadUrlResp.data, null, 2));

    const data = uploadUrlResp.data && uploadUrlResp.data.data;
    const uploadUrl = data && (data.uploadUrl || data.url);
    const warning = uploadUrlResp.data && uploadUrlResp.data.warning;

    if (uploadUrl) {
      console.log('\\n√ 已获取直传地址:');
      console.log(uploadUrl.length > 200 ? uploadUrl.slice(0, 200) + '...' : uploadUrl);
      if (warning) {
        console.log('\\n! 提示:', warning);
      }
      console.log('\\ncurl 上传示例（请替换文件路径）:');
      console.log(`curl -X POST -F "file=@/path/to/file" "${uploadUrl}"`);
    } else {
      console.log('\\n× 未拿到直传地址（data.uploadUrl 为空）');
    }
  } catch (err) {
    logAxiosError(err);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('脚本异常:', e);
  process.exit(1);
});