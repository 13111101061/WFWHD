# 短信接码模块 (SMS Code Module)

⚠️ **【模块开发状态 - 部分功能待完善】**

## 📋 模块概述

本模块提供基于好助云接码平台的短信验证码接收服务，支持多种运营商和省份的手机号获取与验证码接收。

## 🚀 已完成功能

### ✅ 核心服务 (`services/smsCodeService.js`)
- [x] 用户登录与Token管理
- [x] 账号信息查询
- [x] 手机号获取 (支持运营商和省份筛选)
- [x] 验证码接收与查询
- [x] 手机号释放与管理
- [x] 号码黑名单功能
- [x] 完整接码流程封装

### ✅ API接口 (`routes/smsRoutes.js`)
- [x] RESTful API设计
- [x] API密钥验证中间件
- [x] 统一错误处理
- [x] 健康检查接口
- [x] 运营商和省份列表查询

## ⏳ 待开发功能

### 🔄 项目管理功能
- [ ] **项目列表查询** - 获取可用项目列表 (依赖服务商API)
- [ ] **自定义项目创建** - 支持用户自定义项目ID
- [ ] **项目权限管理** - 项目访问权限控制
- [ ] **项目配置管理** - 项目参数和设置

### 🔄 高级功能
- [ ] **批量操作** - 批量获取手机号和验证码
- [ ] **号码池管理** - 号码预分配和池化管理
- [ ] **统计分析** - 使用统计和成功率分析
- [ ] **缓存优化** - Redis缓存集成

## 📁 目录结构

```
src/modules/sms/
├── README.md           # 模块说明文档 (本文件)
├── routes/
│   └── smsRoutes.js   # API路由定义
└── services/
    └── smsCodeService.js # 核心服务逻辑
```

## 🔧 配置说明

### 环境变量
```env
SMS_CODE_SERVER=https://api.haozhuyun.com/sms/
SMS_CODE_USERNAME=your_username
SMS_CODE_PASSWORD=your_password
API_KEYS=key1,key2,key3
```

### 项目ID规范
- **测试项目ID**: 使用 `672xxxxx` 格式 (避免冲突)
- **生产项目ID**: 联系服务商获取正式项目ID

## 📖 使用示例

### 基础用法
```javascript
const SmsCodeService = require('./services/smsCodeService');
const smsService = new SmsCodeService();

// 获取验证码完整流程
const result = await smsService.getCodeComplete(67210001, {
  isp: 1,        // 中国移动
  ascription: 2  // 实卡
});
```

### API调用
```bash
# 获取手机号
curl -X POST "http://localhost:3000/api/sms/phone" \
  -H "x-api-key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"sid": 67210001, "isp": 1, "ascription": 2}'
```

## 🚨 已知问题

1. **项目列表API缺失**: 服务商可能未提供项目列表查询接口
2. **项目ID依赖**: 当前需要手动配置项目ID
3. **错误重试**: 部分接口的重试机制需要优化

## 🔄 开发计划

### 短期目标 (1-2周)
- [ ] 确认服务商项目管理API规范
- [ ] 实现自定义项目ID管理
- [ ] 完善错误处理和日志记录

### 中期目标 (1个月)
- [ ] 添加项目列表和管理功能
- [ ] 实现批量操作接口
- [ ] 集成缓存和性能优化

### 长期目标 (3个月)
- [ ] 统计分析功能
- [ ] 多服务商支持
- [ ] 管理后台界面

## 👥 维护团队

- **主要维护者**: 开发团队
- **最后更新**: 2024年
- **联系方式**: 通过项目Issue或PR联系

## 📚 相关文档

- [API文档](../../../API_DOCUMENTATION.md)
- [部署指南](../../../DEPLOYMENT.md)
- [测试脚本](../../../test/)

---

💡 **提示**: 如需恢复项目列表功能的开发，请先确认服务商API文档，然后参考 `test/get-projects-test.js` 中的探索性代码。