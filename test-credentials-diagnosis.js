/**
 * 密钥管理模块深度诊断
 */

require('dotenv').config();

console.log('========================================');
console.log('密钥管理模块深度诊断');
console.log('========================================\n');

// [1] 检查环境变量
console.log('[1/6] 环境变量检查');
console.log('  QWEN_API_KEY:', process.env.QWEN_API_KEY ? `${process.env.QWEN_API_KEY.substring(0, 8)}...${process.env.QWEN_API_KEY.slice(-4)} (${process.env.QWEN_API_KEY.length} chars)` : '❌ 未设置');
console.log('  TTS_API_KEY:', process.env.TTS_API_KEY ? `${process.env.TTS_API_KEY.substring(0, 8)}...` : '❌ 未设置');
console.log('  TENCENTCLOUD_SECRET_ID:', process.env.TENCENTCLOUD_SECRET_ID ? '✅ 已设置' : '❌ 未设置');
console.log();

// [2] 检查 credentials 模块加载
console.log('[2/6] Credentials 模块加载');
try {
  const credentials = require('./src/modules/credentials');
  console.log('  模块加载: ✅');
  console.log('  导出的方法:', Object.keys(credentials).join(', '));
  
  // 初始化
  const registry = credentials.initialize();
  console.log('  初始化: ✅');
  console.log('  池化模式:', credentials.isPoolMode() ? '✅ 是' : '❌ 否');
  console.log();
  
  // [3] 检查阿里云 provider 详情
  console.log('[3/6] 阿里云 Provider 详情');
  const aliyunAccounts = credentials.getProviderAccounts('aliyun');
  console.log('  账号数量:', aliyunAccounts.length);
  
  aliyunAccounts.forEach((acc, idx) => {
    console.log(`\n  [账号 ${idx + 1}] ${acc.name} (${acc.id})`);
    console.log('    enabled:', acc.enabled);
    console.log('    health.status:', acc.health?.status);
    console.log('    health.consecutiveFailures:', acc.health?.consecutiveFailures);
    console.log('    hasCredentials:', acc.hasCredentials);
    
    if (acc.credentialStatus) {
      Object.entries(acc.credentialStatus).forEach(([key, status]) => {
        console.log(`    credential.${key}:`, status.configured ? `✅ (${status.preview})` : '❌ 未配置');
      });
    }
  });
  console.log();
  
  // [4] 检查凭证选择
  console.log('[4/6] 凭证选择测试');
  const selected = credentials.selectCredentials('aliyun', 'qwen_http');
  if (selected) {
    console.log('  selectCredentials: ✅');
    console.log('  accountId:', selected.accountId);
    console.log('  account.name:', selected.account?.name);
    console.log('  credentials.apiKey:', selected.credentials?.apiKey ? `${selected.credentials.apiKey.substring(0, 8)}...${selected.credentials.apiKey.slice(-4)}` : '❌ 空');
    
    // 检查密钥长度
    const key = selected.credentials?.apiKey;
    if (key) {
      console.log('  apiKey 长度:', key.length);
      console.log('  apiKey 前缀:', key.startsWith('sk-') ? '✅ sk-' : '⚠️ 非 sk- 开头');
    }
  } else {
    console.log('  selectCredentials: ❌ 返回 null');
  }
  console.log();
  
  // [5] 检查所有服务商状态
  console.log('[5/6] 所有服务商配置状态');
  const allProviders = credentials.listProviders();
  allProviders.forEach(p => {
    const status = p.configured ? '✅' : '❌';
    const poolMode = p.poolMode ? '(池化)' : '(单账号)';
    console.log(`  ${p.name}: ${status} ${poolMode}`);
    p.services.forEach(s => {
      console.log(`    - ${s.key}: ${s.available ? '✅' : '❌'}`);
    });
  });
  console.log();
  
  // [6] 检查 YAML 配置源
  console.log('[6/6] YAML 配置源检查');
  const fs = require('fs');
  const path = require('path');
  const yamlDir = path.join(process.cwd(), 'credentials', 'sources', 'providers');
  
  if (fs.existsSync(yamlDir)) {
    console.log('  YAML 目录存在: ✅');
    const files = fs.readdirSync(yamlDir).filter(f => f.endsWith('.yaml'));
    console.log('  YAML 文件:', files.join(', '));
    
    files.forEach(f => {
      const content = fs.readFileSync(path.join(yamlDir, f), 'utf8');
      console.log(`\n  [${f}]`);
      // 检查是否包含环境变量引用
      const hasEnvRef = content.includes('${');
      console.log('    环境变量引用:', hasEnvRef ? '✅' : '❌');
      
      // 检查 accounts 部分
      const accountsMatch = content.match(/accounts:/);
      console.log('    accounts 配置:', accountsMatch ? '✅' : '❌');
    });
  } else {
    console.log('  YAML 目录存在: ❌');
  }
  console.log();
  
  // [7] 验证所有
  console.log('[7/6] 验证所有服务商');
  const validations = credentials.getRegistry().validateAll();
  validations.forEach(v => {
    console.log(`  ${v.name}: ${v.valid ? '✅' : '❌'} ${v.missing?.length > 0 ? `(缺少: ${v.missing.join(', ')})` : ''}`);
  });
  
} catch (error) {
  console.error('❌ 诊断失败:', error.message);
  console.error(error.stack);
}

console.log('\n========================================');
console.log('诊断完成');
console.log('========================================');
