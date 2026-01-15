# 管理脚本目录

本目录包含项目的管理工具和实用脚本。

## 目录结构

```
scripts/
├── model-manager.js          # 声音模型管理工具
├── quick-model.sh           # 声音模型快速管理Shell脚本
├── clear-cache.js           # 缓存清理工具
├── quick-test.sh            # 快速测试脚本
├── start.sh                 # Linux/Mac启动脚本
├── start.bat                # Windows启动脚本
└── README.md                # 本文件
```

## 使用方式

### 声音模型管理
```bash
# 交互式模型管理
node scripts/model-manager.js

# 或者使用Shell脚本快速管理
./scripts/quick-model.sh
```

### 缓存清理
```bash
# 清理TTS缓存
node scripts/clear-cache.js
```

### 快速测试
```bash
# 运行快速TTS测试
./scripts/quick-test.sh
```

### 服务器启动
```bash
# Linux/Mac 启动服务器
./scripts/start.sh

# Windows 启动服务器
./scripts/start.bat
```

## 功能说明

### model-manager.js
完整的模型管理工具，支持：
- 添加新声音模型
- 删除现有模型
- 查询模型信息
- 更新模型配置
- 验证模型数据

### quick-model.sh
简化的Shell脚本，用于快速模型管理：
- 快速添加模型
- 列出所有模型
- 删除指定模型
- 搜索模型

### clear-cache.js
缓存清理工具：
- 清理TTS音频缓存
- 清理API响应缓存
- 清理临时文件
- 显示缓存统计

### quick-test.sh
快速TTS测试脚本：
- 测试主要TTS服务
- 快速验证系统状态
- 显示测试结果摘要

### start.sh / start.bat
服务器启动脚本：
- 环境检查
- 依赖验证
- 自动启动服务

## 注意事项

1. **备份**: 修改模型配置前请备份`voiceModels.json`
2. **权限**: 某些操作可能需要管理员权限
3. **验证**: 修改配置后请验证模型数据有效性

## 配置文件位置

- 声音模型配置: `src/modules/tts/config/voiceModels.json`
- 模型注册中心: `src/modules/tts/config/VoiceModelRegistry.js`

更多使用细节请参考各个脚本文件中的注释。