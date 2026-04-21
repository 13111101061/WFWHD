# TTS服务商接入主链重构设计方案

## 1. 文档定位

- 文档用途：指导开发对 TTS 服务商接入层、参数标准化链路、资源目录管理进行一次结构化整改
- 适用范围：`/api/tts/synthesize` 主合成链、服务商接入管理、音色资源目录、参数标准化与扩展参数处理
- 设计目标：不是临时修补，而是建立一套后续能持续接新服务商、接新模型、接特殊参数的稳定骨架

---

## 2. 现状判断

结合当前项目结构，TTS 模块已经有基本雏形，但服务商接入这一层仍然存在明显的结构分散问题。

当前核心相关文件大致如下：

- `src/modules/tts/catalog/ProviderCatalog.js`
- `src/modules/tts/application/VoiceResolver.js`
- `src/modules/tts/application/CapabilityResolver.js`
- `src/modules/tts/application/ParameterResolutionService.js`
- `src/modules/tts/config/ParameterMapper.js`
- `src/modules/tts/adapters/TtsProviderAdapter.js`
- `src/modules/tts/adapters/providers/index.js`
- `src/modules/tts/adapters/providers/*Adapter.js`
- `src/modules/credentials/core/CredentialsRegistry.js`

当前主要问题不是“功能完全没有”，而是“关键职责分散在多个层里，没有统一收口”。

### 2.1 当前已具备的基础能力

- 已有统一入口：`POST /api/tts/synthesize`
- 已有音色 ID 转译能力：`VoiceResolver`
- 已有能力规则读取能力：`CapabilityResolver`
- 已有参数合并能力：`ParameterResolutionService`
- 已有服务商适配器体系：`BaseTtsAdapter + 各 provider adapter`
- 已有凭证池化和健康状态管理：`credentials` 模块

### 2.2 当前核心结构问题

#### 问题一：服务商定义分裂

目前至少有三套“服务商定义”在并行存在：

- `ProviderCatalog`：静态目录、展示信息、别名
- `adapters/providers/index.js`：adapter 注册表
- `credentials`：配置、服务可用性、账号池状态

结果就是：

- 一个服务是否“存在”，在不同模块里答案可能不同
- 一个服务的 canonical key、alias、serviceType 维护点过多
- 新增服务商时开发要同时改多处，容易漏改

#### 问题二：主链里缺少统一的服务商管理门面

当前 `TtsProviderAdapter` 更像一个简单转发器，不是完整的“服务商运行时管理层”。

它现在主要做：

- 根据 `provider + serviceType` 拼 key
- 从 adapter 注册表取实例
- 调用 `synthesizeAndSave`

但它没有统一回答这些问题：

- 这个服务商服务的标准标识是什么
- 这个服务当前有没有注册 adapter
- 这个服务的凭证是否配置完整
- 当前健康状态如何
- 前端/后台查询时该展示什么元信息

#### 问题三：参数标准化链路还没有真正闭环

当前链路虽然已经有：

- `VoiceResolver`
- `CapabilityResolver`
- `ParameterResolutionService`
- `ParameterMapper`

但实际上并未形成稳定的一条标准执行链。

典型表现：

- `VoiceResolver` 历史上承担过多职责
- `ParameterMapper` 曾因 adapter 入参不统一而被禁用或半禁用
- 部分特殊参数还靠各 adapter 自己理解
- “平台标准参数”和“服务商专属参数”的边界还不够清晰

#### 问题四：资源目录与运行时上下文还没有明确分层

现在资源相关信息散落于：

- 音色表
- ProviderCatalog
- voice registry
- runtime provider options
- 模型能力配置

缺点是：

- 展示信息和执行信息容易混在一起
- 查询侧和执行侧容易各自补字段
- 后期新增模型或音色字段时容易越改越乱

---

## 3. 本次整改的目标

本次整改目标不是推翻重写，而是做“结构收口”。

### 3.1 主目标

建立一套统一的 TTS 服务商接入标准化体系，使系统能够稳定支持：

- 多 Provider 并行接入
- 多 ServiceType 并行接入
- 多模型、多音色、多能力差异并存
- 特殊 provider 的特殊参数优雅下沉
- 查询展示和运行执行使用同一套资源定义来源

### 3.2 达成后的效果

整改完成后，新增一个服务商不应该再去修改五六处逻辑，而应该基本落在以下几类位置：

- 注册服务商描述
- 注册 adapter
- 配置凭证
- 补充能力规则
- 补充参数映射规则

主链本身不应因新增服务商而持续膨胀。

---

## 4. 设计原则

### 原则一：语义归一优先，不做表面归一

参数归一的核心不是把所有 provider 的字段名机械改成一样，而是先统一“语义”。

例如平台统一语义可定义为：

- 语速
- 音调
- 音量
- 输出格式
- 采样率
- 情感
- 风格
- 目标时长

然后再由映射层把这些语义转换为不同 provider 实际接受的字段或数值区间。

结论：

- 主体是“语义归一”
- 数值区间映射只是语义归一之后的一层子动作

### 原则二：资源目录和执行链分离

`Catalog` 的含义不是“文件夹”，而是“标准化资源目录”。

它应该负责回答：

- 系统里有哪些 provider
- 哪些 service 已注册
- 哪些模型存在
- 哪些音色可被前端展示
- 每个资源的元信息是什么

但它不应该直接负责：

- 实际调用外部 API
- 处理 HTTP 请求
- 处理重试、超时、熔断

### 原则三：平台层只认标准参数，provider 特殊参数下沉处理

平台执行链应优先只处理标准参数。

对于 provider 专属参数，允许存在，但必须通过统一出口进入：

- `providerOptions`

而不能继续让每个层都乱塞一批“谁都看不懂”的额外字段。

### 原则四：一个问题只在一个地方解决

职责边界必须明确：

- ID 转译只归 `VoiceResolver`
- 能力判断只归 `CapabilityResolver / CapabilitySchema`
- 参数合并只归 `ParameterResolutionService`
- 参数映射只归 `ParameterMapper`
- 服务商运行时管理只归 `ProviderManagementService`
- 实际外部 API 调用只归各 `ProviderAdapter`

---

## 5. 目标架构总览

目标主链如下：

```text
HTTP 接口层
  ↓
SynthesisRequest
  ↓
VoiceResolver
  ↓
CapabilityResolver
  ↓
ParameterResolutionService
  ↓
ParameterMapper
  ↓
ProviderManagementService
  ↓
ProviderAdapter
  ↓
外部 Provider API
  ↓
统一响应结果
```

### 5.1 查询侧结构

```text
前端查询接口
  ↓
TtsQueryService
  ↓
VoiceCatalog / ProviderCatalog
  ↓
CapabilitySchema / VoiceRegistry / ProviderManagementService
  ↓
统一展示 DTO
```

### 5.2 本次建议新增的核心层

建议新增统一服务商管理层：

- `ProviderManagementService`
- `ProviderDescriptorRegistry`
- `ProviderRuntimeRegistry`

这三个层不是替代现有 adapter，而是把“描述信息、运行时实例、可用性状态”统一收口。

---

## 6. 关键模块职责设计

## 6.1 HTTP 接口层

职责：

- 基础请求校验
- 鉴权
- 请求对象构建
- 统一响应输出

禁止：

- 直接做 provider 参数拼装
- 直接做音色 ID 转译
- 直接判断某模型支不支持某字段

## 6.2 VoiceResolver

职责收缩后应只负责“资源身份解析”。

输入：

- `service`
- `voiceCode`
- `systemId`
- `voice / voiceId`

输出：

- `serviceKey`
- `providerKey`
- `modelKey`
- `systemId`
- `voiceCode`
- `providerVoiceId`
- `voiceRuntime`

它要解决的问题是：

- 前端给的是哪个资源
- 最终对应哪个 provider
- 真正调用时要用哪个 provider voice id

它不应继续承担：

- 参数能力判断
- 参数默认值全量合并
- provider 参数格式转换

## 6.3 CapabilityResolver

职责：

- 读取服务级能力
- 读取模型级能力
- 合并音色运行时默认值
- 返回标准化的能力上下文

它回答的是：

- 这个服务/模型/音色“能不能”
- 哪些参数支持
- 哪些参数锁定
- 默认值是什么

## 6.4 ParameterResolutionService

职责：

- 负责参数优先级合并
- 产出平台标准参数对象
- 统一处理锁定字段
- 收敛用户传入的非法覆盖

建议固定优先级：

```text
平台默认 < 服务默认 < 模型默认 < 音色默认 < 用户输入 < 锁定参数回写
```

锁定参数通常至少包括：

- `voice`
- `model`

必要时可扩展：

- `sampleRate`
- `format`

## 6.5 ParameterMapper

职责：

- 平台标准参数 -> provider 实际参数
- 数值区间换算
- 枚举值翻译
- 特殊字段拆分/重组
- provider 扩展参数注入

核心要求：

- 主链接收的必须是标准语义参数
- adapter 不再自己解释平台字段
- adapter 只接收“已经面向 provider 整理好的参数”

## 6.6 ProviderManagementService

这是本次整改最关键的新门面。

职责：

- 统一服务商 canonical key 解析
- 统一 adapter 注册与实例管理
- 汇总 provider 元信息
- 汇总凭证状态/账号池状态/健康状态
- 提供查询侧和执行侧共用的 provider 信息入口

它要统一回答的问题：

- 这个服务有没有注册
- 这个服务的标准 key 是什么
- 使用哪个 adapter
- 配置状态如何
- 当前健康状态如何
- 对外展示时叫什么名字

## 6.7 ProviderDescriptorRegistry

职责：

- 管理 provider/service 静态描述信息
- 维护 canonical key 与 alias
- 对查询展示层提供稳定目录信息

建议承接的核心字段：

- `key`
- `provider`
- `service`
- `displayName`
- `description`
- `status`
- `aliases`
- `protocol`
- `category`
- `supportsStreaming`
- `supportsAsync`

## 6.8 ProviderRuntimeRegistry

职责：

- 管理 adapter class 注册
- 管理 adapter 实例缓存
- 管理服务运行时实例创建策略

它主要是运行时层，不应混入太多展示字段。

## 6.9 ProviderAdapter

职责保持单纯：

- 拼装 provider 请求
- 调用外部 API
- 解析 provider 响应
- 映射 provider 错误

不建议继续承担：

- 前端音色 ID 转译
- 平台能力判断
- 平台字段默认值合并
- 多来源资源目录管理

---

## 7. 数据契约设计

为了防止后期继续混乱，建议明确几种中间对象。

## 7.1 ResolvedVoiceIdentity

用于 VoiceResolver 输出。

```json
{
  "serviceKey": "moss_tts",
  "providerKey": "moss",
  "modelKey": "moss-tts-v1",
  "systemId": "moss-tts-ashui",
  "voiceCode": "001002000000001",
  "providerVoiceId": "2001257729754140672",
  "voiceRuntime": {
    "voiceId": "2001257729754140672",
    "model": "moss-tts-v1",
    "providerOptions": {
      "emotionScale": 0.6
    }
  }
}
```

## 7.2 CapabilityContext

用于能力层输出。

```json
{
  "serviceKey": "moss_tts",
  "resolvedDefaults": {
    "speed": 1,
    "format": "mp3"
  },
  "voiceDefaults": {
    "style": "gentle"
  },
  "lockedParams": ["voice", "model"],
  "parameterSupport": {
    "speed": { "supported": true },
    "pitch": { "supported": false },
    "emotion": { "supported": true }
  },
  "providerOptions": {
    "emotionScale": 0.6
  }
}
```

## 7.3 StandardTtsParameters

这是平台内部的统一参数对象。

建议仅保留平台语义字段：

```json
{
  "voice": "2001257729754140672",
  "model": "moss-tts-v1",
  "speed": 1,
  "pitch": 0,
  "volume": 50,
  "format": "mp3",
  "sampleRate": 24000,
  "emotion": "happy",
  "style": "gentle",
  "expectedDurationSec": 12,
  "providerOptions": {
    "emotionScale": 0.6
  }
}
```

不建议在标准参数对象里继续混入：

- 展示字段
- 描述字段
- 标签字段
- 状态字段
- preview 字段

## 7.4 ProviderExecutionContext

建议给 adapter 的最终入参采用统一执行上下文，而不是继续散着传。

```json
{
  "provider": "moss",
  "serviceType": "tts",
  "text": "你好，欢迎使用系统",
  "params": {
    "voice_id": "2001257729754140672",
    "audio_format": "mp3"
  },
  "resolved": {
    "serviceKey": "moss_tts",
    "modelKey": "moss-tts-v1",
    "voiceCode": "001002000000001"
  },
  "requestMeta": {
    "requestId": "req_xxx",
    "source": "api"
  }
}
```

好处：

- adapter 不再依赖外层散装字段
- 日志、监控、计费、调试都更容易补齐

---

## 8. 参数标准化设计

## 8.1 结论：参数归一以语义归一为主

这里必须明确：

- 不是简单数值归一
- 也不是简单字段名归一
- 而是“平台语义归一”

举例：

- 平台层统一叫“语速 speed”
- A 服务商范围可能是 `0.5 ~ 2.0`
- B 服务商范围可能是 `-500 ~ 500`
- C 服务商可能根本不支持 speed

那么平台层只关心：

- 用户传的是 speed
- 它语义上合法不合法

然后映射层负责：

- A：原值直传
- B：区间换算
- C：报不支持或兜底忽略

## 8.2 参数分类建议

建议把参数分成三类：

### 第一类：平台标准参数

- 语速
- 音调
- 音量
- 输出格式
- 采样率
- 情感
- 风格
- 目标时长

### 第二类：平台半标准参数

这些字段不是所有服务都有，但出现频率较高，可以先纳入平台层。

例如：

- `styleStrength`
- `speakerRole`
- `streaming`
- `seed`

### 第三类：服务商扩展参数

统一收口到：

- `providerOptions`

例如：

- 某 provider 的特定采样策略
- 某模型的特定控制系数
- 某 websocket 服务的 chunk 配置

## 8.3 不支持参数的处理策略

建议统一三种策略：

- `error`：直接报错，适用于关键参数
- `ignore`：忽略，适用于弱影响字段
- `fallback`：自动降级到默认值

每个参数在 schema 中应可配置其策略。

---

## 9. 资源目录设计

## 9.1 Catalog 的正确含义

这里的 `Catalog` 建议统一理解为“资源目录层”，不是物理目录。

它的作用是把系统资源标准化整理出来，包括：

- provider 目录
- service 目录
- model 目录
- voice 目录

### 资源目录层回答的问题

- 系统有哪些 provider
- 每个 provider 下有哪些 service
- 每个 service 下有哪些模型
- 每个模型下有哪些音色
- 每个资源的展示信息和基础能力信息是什么

### 资源目录层不回答的问题

- 这次请求具体用哪个账号
- 这次请求是否命中熔断
- 本次 provider 实际参数要怎么拼

这些属于运行时层，不属于 Catalog。

## 9.2 目录分层建议

建议至少分四层：

### Provider 层

字段建议：

- providerKey
- providerName
- status
- protocolTypes
- credentialMode
- description

### Service 层

字段建议：

- serviceKey
- providerKey
- displayName
- category
- protocol
- supportsStreaming
- supportsAsync
- enabled

### Model 层

字段建议：

- modelKey
- serviceKey
- displayName
- status
- defaultParams
- capabilityRef

### Voice 层

沿用你们当前四层分离思路即可：

- `identity`
- `profile`
- `runtime`
- `meta`

---

## 10. 面向奇怪服务商的扩展设计

后期服务商一定会越来越杂，所以主链设计不能默认所有 provider 都规整。

建议提前考虑以下差异场景。

## 10.1 协议差异

后期可能同时存在：

- HTTP 同步
- HTTP 异步任务
- WebSocket 流式
- 回调式任务

因此 adapter 层建议统一抽象出执行模式：

- `sync`
- `async_job`
- `stream`

这样主链不用把所有 provider 都当成同一种服务。

## 10.2 参数形态差异

有些 provider 参数扁平，有些 provider 参数嵌套。

例如：

- Provider A：`voice`, `speed`, `format`
- Provider B：`input.voice`, `audio.format`
- Provider C：`request.tts.voice_id`

这不应该污染主链，而应由 `ParameterMapper` 负责最终转换。

## 10.3 资源来源差异

有些 provider 的音色目录：

- 可以手工维护
- 可以通过 API 同步
- 可以部分手工、部分同步

因此建议 `voice.meta.dataSource` 必须保留。

建议枚举：

- `manual`
- `import`
- `provider_sync`
- `migration`
- `api`

## 10.4 账号与路由差异

后期可能出现：

- 一个 provider 多账号
- 不同模型绑定不同账号
- 某些音色必须走特定账号
- 某些区域服务要分线路

因此建议未来的路由维度不要只看 `provider`，还要预留以下概念：

- service route
- model route
- account route
- region route

但本次先不强推全部落地，只要在 `ProviderManagementService` 的输出结构中预留扩展位置即可。

---

## 11. 推荐的目标文件结构

建议新增或调整如下结构：

```text
src/modules/tts/
  application/
    VoiceResolver.js
    CapabilityResolver.js
    ParameterResolutionService.js

  provider-management/
    ProviderManagementService.js
    ProviderDescriptorRegistry.js
    ProviderRuntimeRegistry.js

  adapters/
    TtsProviderAdapter.js
    providers/
      BaseTtsAdapter.js
      *Adapter.js
      index.js

  catalog/
    ProviderCatalog.js
    VoiceCatalog.js

  schema/
    CapabilitySchema.js
    VoiceFormSchema.js
    StoredVoiceSchema.js

  config/
    ParameterMapper.js
    PlatformParameterDictionary.js
```

---

## 12. 落地实施建议

## 12.1 第一阶段：先收口 provider 管理

目标：

- 不改动所有 adapter 细节
- 先把 provider 描述、adapter 注册、凭证状态统一起来

建议动作：

1. 新建 `ProviderManagementService`
2. 新建 `ProviderDescriptorRegistry`
3. 新建 `ProviderRuntimeRegistry`
4. `TtsProviderAdapter` 全部改走统一管理层
5. 查询层获取 provider 列表时也改走统一管理层

### 第一阶段验收标准

- 查询侧和执行侧使用同一份 provider key 解析逻辑
- 不再同时维护两套不同的 provider 可用性判断逻辑
- 新增一个 provider 时，不再需要同时改查询层和执行层分叉代码

## 12.2 第二阶段：统一 adapter 入参契约

目标：

- 让 `ParameterMapper` 真正接回主链

建议动作：

1. 统一所有 adapter 的标准入参格式
2. 取消 adapter 自己猜平台参数语义
3. `ParameterMapper` 输出 provider 参数对象
4. adapter 只负责请求拼装和响应解析

### 第二阶段验收标准

- 平台标准参数在所有 adapter 中不再被直接解释
- 特殊 provider 参数只从 `providerOptions` 入口进入
- `ParameterMapper` 可以正式启用，不再需要临时 no-op

## 12.3 第三阶段：资源目录和能力规则统一

目标：

- 查询侧和运行时共用同一规则来源

建议动作：

1. `ProviderCatalog` 和 `CapabilitySchema` 明确职责边界
2. 查询接口直接从目录层拿展示信息
3. 运行链从能力层拿执行规则
4. 避免前端显示和后端能力不一致

### 第三阶段验收标准

- 前端展示参数和运行时能力判断一致
- 同一模型/音色的支持字段不会出现前后端冲突

---

## 13. 对开发的明确要求

这部分建议直接发给开发，避免做偏。

### 必须做到

- 不允许再新增一套平行的 provider 定义表
- 不允许 adapter 再自己做业务音色 ID 转译
- 不允许前端依赖拆 ID 来判断高级参数能力
- 不允许把展示字段混入执行参数对象
- 不允许把 provider 特殊参数散落在多层处理

### 必须保留

- VoiceResolver 作为唯一 ID 转译入口
- Voice 四层结构
- credentials 模块的账号池与健康状态能力
- BaseTtsAdapter 作为 provider 调用公共基类

### 优先优化但不必一次做尽

- 先统一 provider 管理门面
- 再统一 adapter 入参
- 最后再彻底收紧参数能力规则源

---

## 14. 风险与注意事项

## 14.1 最大风险

最大风险不是“代码写不出来”，而是“整改一半，主链和旧逻辑同时存在”。

这样会导致：

- 查询侧看的是新逻辑
- 执行侧跑的是旧逻辑
- 文档写的是目标架构
- 实际代码还是过渡状态

所以整改时必须明确：

- 哪一层已经切换完成
- 哪一层只是占位文件
- 哪一层仍在兼容期

## 14.2 兼容处理建议

如果需要兼容旧请求，建议只兼容输入，不要兼容内部结构。

意思是：

- 对外仍可接受旧字段
- 进入主链后必须立刻转成统一结构

不建议：

- 旧结构在内部一路传递到底

---

## 15. 最终结论

当前 TTS 模块不是不能用，而是已经进入“必须收口”的阶段。

真正该做的不是继续零散补丁，而是把这几个核心点稳定下来：

1. 建立统一的 Provider 管理门面
2. 把资源目录层和运行时层拆清楚
3. 把参数归一固定为“语义归一 -> 数值/字段映射”
4. 让特殊 provider 参数统一从 `providerOptions` 下沉
5. 让 adapter 彻底回归“外部协议适配器”角色

一句话总结：

> 本次整改的本质，不是再加几个工具类，而是把“服务商管理、资源目录、参数标准化、运行时调用”四条线正式收口成一条可持续扩展的标准主链。
