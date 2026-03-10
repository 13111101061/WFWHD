# AstraTTS 部署运维文档

## 本次部署全流程记录

### 1. 环境信息
- **操作系统**: Linux 6.8.0-48-generic
- **部署目录**: `/www/wwwroot/TTS`
- **部署日期**: 2026-02-11
- **.NET 版本**: 10.0.103

### 2. 部署步骤

#### 2.1 安装 .NET SDK
```bash
wget https://dot.net/v1/dotnet-install.sh -O /tmp/dotnet-install.sh
chmod +x /tmp/dotnet-install.sh
/tmp/dotnet-install.sh --channel 10.0 --install-dir /usr/local/dotnet

# 配置环境变量
export DOTNET_ROOT=/usr/local/dotnet
export PATH=$PATH:/usr/local/dotnet
echo 'export DOTNET_ROOT=/usr/local/dotnet' >> ~/.bashrc
echo 'export PATH=$PATH:/usr/local/dotnet' >> ~/.bashrc
```

#### 2.2 创建配置和目录结构
```bash
cd /www/wwwroot/TTS

# 复制配置模板
cp config.template.json config.json

# 创建资源目录结构
mkdir -p resources/avatars/default/references
mkdir -p resources/models_v1/default/tts
mkdir -p resources/models_v1/default/bert/tokenizer
mkdir -p resources/models_v1/default/hubert
mkdir -p resources/shared/dictionaries
mkdir -p resources/shared/g2p
```

#### 2.3 上传模型文件

**V1 引擎模型目录结构:**
```
resources/
├── models_v1/default/
│   ├── speaker_encoder.onnx
│   ├── bert/
│   │   ├── roberta.onnx
│   │   └── tokenizer/
│   │       ├── tokenizer_config.json
│   │       └── vocab.txt
│   ├── hubert/
│   │   └── chinese-hubert-base_full.onnx
│   └── tts/
│       ├── vits.onnx
│       ├── prompt_encoder.onnx
│       ├── t2s_encoder.onnx
│       ├── t2s_first_stage_decoder.onnx
│       └── t2s_stage_decoder.onnx
├── shared/
│   ├── dictionaries/
│   │   ├── cmudict.dict
│   │   ├── mandarin_pinyin.dict
│   │   └── opencpop-strict.txt
│   └── g2p/
│       └── checkpoint20.npz
└── avatars/default/references/
    └── 【正常】良宵方始，不必心急。.wav
```

#### 2.4 配置文件修改

`config.json` 关键配置：
```json
{
  "ResourcesDir": "resources",
  "UseEngineV2": false,
  "DefaultAvatarId": "default",
  "Speed": 1.0,
  "StreamingMode": true,
  "Avatars": [
    {
      "Id": "default",
      "Name": "默认音色",
      "DefaultReferenceId": "normal",
      "References": [
        {
          "Id": "normal",
          "Name": "正常语调",
          "AudioPath": "【正常】良宵方始，不必心急。.wav",
          "Text": "良宵方始，不必心急。",
          "Language": "zh"
        }
      ]
    }
  ]
}
```

#### 2.5 构建项目
```bash
cd /www/wwwroot/TTS
dotnet build
```

#### 2.6 启动服务
```bash
# 启动 Web API 服务
dotnet run --project AstraTTS.Web --urls "http://*:5000"
```

#### 2.7 创建编译输出目录的符号链接
```bash
ln -sf /www/wwwroot/TTS/config.json /www/wwwroot/TTS/AstraTTS.Web/bin/Debug/net10.0/config.json
ln -sf /www/wwwroot/TTS/resources /www/wwwroot/TTS/AstraTTS.Web/bin/Debug/net10.0/resources
```

---

## 服务管理

### 启动服务
```bash
cd /www/wwwroot/TTS
dotnet run --project AstraTTS.Web --urls "http://*:5000"
```

### 后台运行
```bash
nohup dotnet run --project AstraTTS.Web --urls "http://*:5000" > /tmp/astra-tts.log 2>&1 &
```

### 停止服务
```bash
# 查找进程
ps aux | grep "dotnet.*AstraTTS.Web"

# 终止进程
kill <PID>
```

### 重启服务
```bash
# 停止当前进程
pkill -f "dotnet.*AstraTTS.Web"

# 重新启动
dotnet run --project AstraTTS.Web --urls "http://*:5000"
```

---

## 健康检查

### 检查服务状态
```bash
curl http://localhost:5000/api/tts/avatars
```

### 检查进程
```bash
ps aux | grep "dotnet.*AstraTTS.Web"
```

### 查看端口占用
```bash
netstat -tlnp | grep 5000
# 或
ss -tlnp | grep 5000
```

---

## 配置文件热重载

无需重启服务，直接调用 API 即可：
```bash
curl -X POST http://localhost:5000/api/tts/reload
```

---

## 性能基准

### 测试结果

| 指标 | 值 |
|------|-----|
| 首字节延迟 | 3.4ms |
| 20字生成时间 | 7.9-9.5秒 |
| 生成速度 | ~2.3 字/秒 |
| 推荐并发数 | 5-10 |
| 峰值 QPS | 0.7-0.8 |

### 并发测试

| 并发数 | QPS | 平均响应时间 | 最大响应时间 |
|--------|-----|-------------|-------------|
| 1 | 0.31 | 3226ms | 3537ms |
| 5 | 0.60 | 6376ms | 8641ms |
| 10 | 0.72 | 11573ms | 16726ms |
| 15 | 0.61 | 21694ms | 28916ms |

---

## 系统资源

### 硬件要求
- **CPU**: 4核以上（测试环境：8核）
- **内存**: 8GB 以上（推荐 16GB）
- **磁盘**: 10GB 以上（模型文件占用较大）

### 资源使用
```
Mem: 7.8Gi total
- 模型加载: ~3GB
- 运行时: ~4GB
- 可用: ~373MB
```

---

## 常见问题

### 1. 服务启动失败

**错误**: `V1 TTS 模型目录不存在`

**解决**: 检查 `resources/models_v1/default/tts` 目录是否存在且包含所有必需的 `.onnx` 文件。

### 2. 参考音频文件找不到

**错误**: `参考音频文件不存在`

**解决**: 检查 `config.json` 中的 `AudioPath` 是否与实际文件名匹配。

### 3. 端口被占用

**解决**:
```bash
# 查找占用进程
lsof -i :5000

# 修改启动端口
dotnet run --project AstraTTS.Web --urls "http://*:5001"
```

### 4. 内存不足

**解决**:
- 调整配置中的线程数
- 减少并发请求数
- 增加系统交换空间

---

## 添加新音色

### 1. 准备参考音频

将参考音频（WAV 格式）上传到:
```
resources/avatars/{avatarId}/references/{audioName}.wav
```

### 2. 更新配置文件

在 `config.json` 的 `Avatars` 数组中添加新配置:
```json
{
  "Id": "new_avatar",
  "Name": "新音色",
  "Description": "音色描述",
  "DefaultReferenceId": "ref1",
  "References": [
    {
      "Id": "ref1",
      "Name": "参考1",
      "AudioPath": "reference1.wav",
      "Text": "参考音频对应的文本",
      "Language": "zh"
    }
  ]
}
```

### 3. 热重载配置

```bash
curl -X POST http://localhost:5000/api/tts/reload
```

---

## 使用 CLI 工具

项目还包含命令行工具用于本地测试:

```bash
# 启动 CLI 交互模式
dotnet run --project AstraTTS.CLI
```

---

## Docker 部署（备选方案）

### 构建镜像
```bash
docker build -t astra-tts .
```

### 运行容器
```bash
docker run -d \
  --name astra-tts \
  -p 5000:5000 \
  -v $(pwd)/config.json:/app/config.json:ro \
  -v $(pwd)/resources:/app/resources:ro \
  astra-tts
```

### 使用 Docker Compose
```bash
docker-compose up -d
```

---

## 日志管理

### 服务日志
```bash
# 查看实时日志
tail -f /tmp/astra-tts.log

# 查看错误日志
grep ERROR /tmp/astra-tts.log
```

### 日志级别配置
修改 `appsettings.json`:
```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  }
}
```

---

## 安全建议

1. **生产环境配置**
   - 使用 HTTPS
   - 添加 API 认证
   - 限制访问 IP

2. **防火墙配置**
   ```bash
   # 限制访问来源
   iptables -A INPUT -p tcp --dport 5000 -s 允许的IP -j ACCEPT
   iptables -A INPUT -p tcp --dport 5000 -j DROP
   ```

3. **反向代理**
   使用 Nginx 作为反向代理：
   ```nginx
   server {
       listen 80;
       server_name tts.example.com;

       location / {
           proxy_pass http://localhost:5000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

---

## 监控建议

1. **服务监控**: 使用 Prometheus + Grafana
2. **日志监控**: 使用 ELK Stack 或 Loki
3. **告警**: 配置邮件/钉钉告警

---

## 联系与支持

- **GitHub**: https://github.com/Blackwood416/AstraTTS
- **项目主页**: https://github.com/Blackwood416/AstraTTS