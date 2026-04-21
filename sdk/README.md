# SDK 目录说明

当前仓库里的前端/JavaScript SDK 主要有两块：

- `sdk/javascript/tts`
  统一 TTS 调用 SDK，负责合成、批量调用、能力查询、服务商状态查询。
- `sdk/javascript/voices`
  音色目录查询 SDK，偏展示和筛选。

## TTS SDK

入口文件：

- `sdk/javascript/tts/TtsClient.js`
- `sdk/javascript/tts/TtsClient.d.ts`
- `sdk/javascript/tts/README.md`
- `sdk/javascript/tts/example.html`

特点：

- 对齐当前服务端 `/api/tts/*` 路由
- 支持 `voiceCode` / `systemId` / `service + voice`
- 批量模式支持 `auto / server / client`
- 允许透传后续新增 provider 特殊参数

## Voice SDK

入口文件：

- `sdk/javascript/voices/VoiceLibraryClient.js`
- `sdk/javascript/voices/VoiceLibraryClient.d.ts`
- `sdk/javascript/voices/README.md`

## 建议

- 业务侧如果是“真正发起 TTS 合成”，优先接 `TtsClient`
- 业务侧如果只是做音色浏览、筛选、搜索，可以接 `VoiceLibraryClient`
- 如果一个页面既要选音色又要试听/合成，可以两个 SDK 一起用，但要明确职责，不要在页面里自己再拼一套调用逻辑
