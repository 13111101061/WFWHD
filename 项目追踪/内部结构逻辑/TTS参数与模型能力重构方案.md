# TTS参数与模型能力重构方案

## 1. 背景

当前 TTS 模块在“音色调用、模型特殊参数、服务商参数转换”这块已经能跑，但结构上还存在几个长期风险：

- `VoiceResolver` 职责过重，同时承担了解析、标准化、校验、参数合并
- `ParameterMapper` 已实现但未正式接入主链
- 能力规则分散在 `ttsDefaults`、`ProviderConfig`、`ModelSchema`、各 ProviderAdapter 内部
- 参数优先级没有被正式固定，后续容易出现覆盖混乱
- ProviderAdapter 仍然理解过多平台语义，导致新增服务商时改动面过大

本方案目标不是推倒重构，而是把“参数定义、能力判断、默认值合并、服务商转译”这几层职责拆开，方便后续持续扩展。

---

## 2. 设计目标

### 2.1 核心目标

- 接口层只负责收请求，不负责解释模型和服务商参数语义
- `VoiceResolver` 只负责解析身份，不再负责大段参数逻辑
- 能力规则统一收口，避免散落在各处
- 参数优先级固定，避免后续覆盖关系失控
- `ParameterMapper` 正式回归主链
- ProviderAdapter 只负责调用外部 API，不再承担平台参数解释职责

### 2.2 结果目标

重构后要达到下面这个效果：

- 新增一个模型：主要改能力定义和默认值
- 新增一个音色：主要改音色数据
- 新增一个服务商：主要改 mapper 和 adapter
- 前端动态表单：直接查 schema/capability，不解析 ID 猜字段

---

## 3. 目标架构

```text
HTTP接口层
  只做：基础校验 -> 请求对象构建 -> 调服务层

VoiceResolver
  只做：解析 service / model / voice / voiceCode / systemId / providerVoiceId

CapabilityResolver
  只做：读取服务能力、模型能力、音色默认配置、锁定规则

ParameterResolutionService
  只做：参数优先级合并
  顺序：平台 -> 服务 -> 模型 -> 音色 -> 用户 -> 锁定参数回写

ParameterMapper
  只做：平台标准参数 -> provider 实际参数

ProviderAdapter
  只做：调用外部 API
  输入必须是：映射后的服务商参数
```

---

## 4. 分层职责定义

### 4.1 HTTP接口层

职责：

- 基础字段校验
- 构建 `SynthesisRequest`
- 调用服务层
- 返回统一响应和统一错误

禁止事项：

- 不在接口层判断某模型支持什么参数
- 不在接口层拼服务商专属参数
- 不在接口层做 provider 参数转换

---

### 4.2 VoiceResolver

职责缩回到“身份解析”：

- 解析 `service`
- 解析 `voiceCode`
- 解析 `systemId`
- 解析 `voice`
- 找到对应音色
- 得到真实 `providerVoiceId`
- 反推出模型和服务标识

输出建议：

```json
{
  "serviceKey": "moss_tts",
  "providerKey": "moss",
  "modelKey": "moss-tts",
  "systemId": "moss-tts-ashui",
  "voiceCode": "001000030000005",
  "providerVoiceId": "2001257729754140672"
}
```

不再负责：

- 默认值合并
- 高级参数规则判断
- provider 参数格式转换

---

### 4.3 CapabilityResolver

这是新增核心模块，负责把分散规则统一收口。

读取来源：

- 平台标准参数定义
- 服务能力定义
- 模型能力定义
- 音色默认配置
- 锁定字段定义

输出内容：

- 支持哪些参数
- 每个参数的类型
- 范围
- 默认值
- 是否前端展示
- 是否允许用户修改
- 是否为锁定参数

一句话理解：

- 服务层回答“能不能”
- 模型层回答“怎么玩”
- 音色层回答“默认给什么”

---

### 4.4 ParameterResolutionService

新增参数解析服务，只负责做一件事：**按固定优先级合并参数**。

参数优先级固定为：

1. 平台默认值
2. 服务默认值
3. 模型默认值
4. 音色默认值
5. 用户输入值
6. 锁定参数回写

注意：

- 最后必须做一次“锁定参数回写”
- 否则用户可能覆盖掉真实 `voiceId`、模型绑定字段等关键参数

建议输出：

```json
{
  "voice": "2001257729754140672",
  "model": "moss-tts",
  "speed": 1.0,
  "pitch": 1.0,
  "volume": 50,
  "format": "wav",
  "sampleRate": 24000,
  "samplingParams": {
    "temperature": 1.7,
    "topP": 0.8,
    "topK": 25
  }
}
```

---

### 4.5 ParameterMapper

职责明确为：

- 平台标准参数名 -> provider 参数名
- 平台标准值域 -> provider 实际值域
- 枚举值转换
- 嵌套结构拼装

例如：

- `voice -> input.voice`
- `speed -> rate`
- `emotion -> voice_setting.emotion`
- `sampleRate -> audio.sample_rate`

关键原则：

- `ParameterMapper` 的输出不再是平台参数
- 而是“服务商实际参数”或“provider-ready params”

---

### 4.6 ProviderAdapter

职责收缩为：

- 接收已经映射好的服务商参数
- 组装请求
- 调外部 API
- 解析响应
- 映射错误

禁止事项：

- 不再理解平台参数语义
- 不再判断某参数是否支持
- 不再承担模型能力判断
- 不再承担统一参数换算

这条规则是本次重构必须坚持的边界。

---

## 5. 参数分类方案

### 5.1 平台标准参数

建议统一一套平台参数字典，后续所有模块都按这套名字走：

- `voice`
- `model`
- `speed`
- `pitch`
- `volume`
- `format`
- `sampleRate`
- `emotion`
- `style`
- `durationHint`
- `providerOptions`

说明：

- 这套名字一旦确定，不允许各层再自由发挥
- 前端、服务层、mapper、adapter 都围绕这套参数字典工作

---

### 5.2 模型高级参数

模型层定义“高级玩法”，例如：

- `emotion`
- `samplingParams`
- `styleStrength`
- `expectedDurationSec`

模型层负责定义：

- 是否支持
- 参数类型
- 默认值
- 范围
- 枚举
- 前端展示方式

模型层不负责：

- 真实音色 ID
- 单个音色特调参数

---

### 5.3 音色层参数

音色层只保留：

- 真实服务商音色 ID
- 所属模型
- 默认运行参数
- 个别音色特调参数

音色层不定义参数规则。

如果每个音色都开始定义自己支持哪些字段，后面一定会重新失控。

---

## 6. 冲突与覆盖规则

### 6.1 模型与音色冲突规则

必须写死：

- 传了 `voiceCode/systemId` 时，以音色为准，模型从音色反推
- 只传模型不传音色时，使用模型默认音色
- 同时传模型和音色，但两者不一致时，直接报错

禁止：

- 偷偷兜底
- 静默替换
- 自动忽略其中一边

---

### 6.2 锁定参数规则

以下字段原则上应支持锁定，不允许用户直接覆盖：

- 真实 `providerVoiceId`
- 音色绑定 `model`
- 某些必须与音色绑定的专属参数

实现方式：

- 在 `CapabilityResolver` 输出中声明 `lockedParams`
- 在 `ParameterResolutionService` 最后一步统一回写

---

## 7. 数据与规则文件建议

### 7.1 建议保留

- `ttsDefaults.js`
  用于平台/服务默认值

- `voices/dist/voices.json`
  用于音色数据和音色默认配置

- `ProviderConfig.json`
  用于 provider 参数映射规则

---

### 7.2 建议新增

- `schema/CapabilitySchema.js`
  定义服务能力、模型能力、锁定规则

- `application/CapabilityResolver.js`
  统一读取能力规则

- `application/ParameterResolutionService.js`
  统一做默认值合并和锁定参数回写

---

### 7.3 建议弱化

- `ModelSchema.js`
  只保留“模型数据结构定义”

不要继续让它同时承担：

- 能力规则
- 前端展示规则
- 运行时参数规则

否则还是会越用越乱。

---

## 8. 落地步骤

### 第一步：收缩 VoiceResolver

目标：

- 去掉参数合并逻辑
- 去掉大段默认值逻辑
- 保留身份解析输出

修改文件：

- `src/modules/tts/application/VoiceResolver.js`

---

### 第二步：新增 CapabilitySchema / CapabilityResolver

目标：

- 把能力规则从 `ModelSchema`、`ProviderConfig`、adapter 内部整理出来

新增文件：

- `src/modules/tts/schema/CapabilitySchema.js`
- `src/modules/tts/application/CapabilityResolver.js`

---

### 第三步：新增 ParameterResolutionService

目标：

- 固化参数优先级
- 统一默认值合并
- 统一锁定参数回写

新增文件：

- `src/modules/tts/application/ParameterResolutionService.js`

---

### 第四步：统一 ProviderAdapter 入参约定

目标：

- 所有 ProviderAdapter 不再理解平台参数
- 统一接收映射后的服务商参数

涉及文件：

- `src/modules/tts/adapters/providers/*.js`

---

### 第五步：ParameterMapper 接回主链

目标：

- 正式恢复主链参数转译

涉及文件：

- `src/modules/tts/domain/TtsSynthesisService.js`
- `src/config/ServiceContainer.js`
- `src/modules/tts/config/ParameterMapper.js`

---

### 第六步：再决定是否接入 ResolvedTtsContext

说明：

- 这一步不属于主链稳定性前置条件
- 只有在需要统一调试上下文、链路追踪、日志标准化时再正式接入

---

## 9. 当前项目建议结论

本项目后续不建议继续按“接口层功能堆参数”的方式演进。

正确方向应为：

- 接口层负责接收
- 服务层负责能力边界
- 模型层负责高级玩法
- 音色层负责默认值与绑定
- 映射层负责 provider 参数转换

一句话定稿：

**参数设计按“服务能力 + 模型能力 + 音色默认值 + 映射转换”四层走，不按接口层硬编码功能走。**

---

## 10. 实施优先级

优先级建议如下：

1. 收缩 `VoiceResolver`
2. 固化参数优先级
3. 新建 `CapabilityResolver`
4. 统一 adapter 入参
5. 重启 `ParameterMapper`
6. 最后再考虑 `ResolvedTtsContext`

如果资源不足，不建议先做 `ResolvedTtsContext`，因为它不是当前主矛盾。

