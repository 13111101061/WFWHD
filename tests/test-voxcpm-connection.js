/**
 * 测试 VoxCPM TTS API 连接性
 * 目标: https://voxcpm.modelbest.cn/
 */

import { Client } from "@gradio/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置
const CONFIG = {
  API_URL: "https://voxcpm.modelbest.cn/",
  OUTPUT_DIR: path.join(__dirname, "test-output"),
  TEST_TEXT: "Hello, this is a test of the VoxCPM TTS service.",
  REF_WAV_PATH: path.join(__dirname, "test-moss-ashui.wav"), // 使用项目中的测试音频
  USER_ID: "test-user-" + Date.now(),
};

// 确保输出目录存在
if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
  fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
}

/**
 * 测试 1: 基本连接测试
 */
async function testConnection() {
  console.log("\n========== 测试 1: 基本连接测试 ==========");
  try {
    console.log(`正在连接到 ${CONFIG.API_URL}...`);
    const client = await Client.connect(CONFIG.API_URL);
    console.log("✅ 连接成功！");
    return client;
  } catch (error) {
    console.error("❌ 连接失败:", error.message);
    throw error;
  }
}

/**
 * 测试 2: TTS 生成测试
 */
async function testTtsGeneration(client) {
  console.log("\n========== 测试 2: TTS 生成测试 ==========");

  // 检查参考音频文件是否存在
  if (!fs.existsSync(CONFIG.REF_WAV_PATH)) {
    console.error(`❌ 参考音频文件不存在: ${CONFIG.REF_WAV_PATH}`);
    console.log("提示: 请准备一个参考音频文件用于测试");
    return null;
  }

  console.log(`使用参考音频: ${CONFIG.REF_WAV_PATH}`);
  console.log(`生成文本: "${CONFIG.TEST_TEXT}"`);

  try {
    // 读取参考音频文件
    const refWavBuffer = fs.readFileSync(CONFIG.REF_WAV_PATH);
    const refWavBlob = new Blob([refWavBuffer], { type: "audio/wav" });

    console.log("正在调用 /generate API...");
    const result = await client.predict("/generate", {
      text: CONFIG.TEST_TEXT,
      control_instruction: "",
      ref_wav: refWavBlob,
      use_prompt_text: false,
      prompt_text_value: "",
      cfg_value: 2.0,
      do_normalize: false,
      denoise: false,
      dit_steps: 10,
      user_id: CONFIG.USER_ID,
    });

    console.log("✅ TTS 生成成功！");
    console.log("返回结果:", result.data);

    // 保存生成的音频
    if (result.data && result.data.length > 0) {
      const outputAudio = result.data[0];
      if (outputAudio && outputAudio.url) {
        const outputPath = path.join(
          CONFIG.OUTPUT_DIR,
          `generated-${CONFIG.USER_ID}.wav`
        );
        
        // 下载音频
        console.log(`正在下载音频到: ${outputPath}`);
        const response = await fetch(outputAudio.url);
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(outputPath, Buffer.from(buffer));
        console.log(`✅ 音频已保存: ${outputPath}`);
      }
    }

    return result;
  } catch (error) {
    console.error("❌ TTS 生成失败:", error.message);
    console.error("详细错误:", error);
    return null;
  }
}

/**
 * 测试 3: 健康检查 (通过调用简单 API 验证服务可用性)
 */
async function testHealthCheck(client) {
  console.log("\n========== 测试 3: 服务可用性检查 ==========");
  try {
    // 尝试调用一个简单的 API 来验证服务是否可用
    const result = await client.predict("/_on_toggle_instant", {
      checked: false,
    });
    console.log("✅ 服务可用");
    console.log("响应:", result.data);
    return true;
  } catch (error) {
    console.error("⚠️  健康检查失败:", error.message);
    return false;
  }
}

/**
 * 主测试流程
 */
async function runTests() {
  console.log("=== VoxCPM TTS API 连接性测试 ===");
  console.log(`API 地址: ${CONFIG.API_URL}`);
  console.log(`测试时间: ${new Date().toISOString()}`);

  const results = {
    connection: false,
    healthCheck: false,
    ttsGeneration: false,
  };

  try {
    // 测试 1: 连接
    const client = await testConnection();
    results.connection = true;

    // 测试 2: 健康检查
    results.healthCheck = await testHealthCheck(client);

    // 测试 3: TTS 生成
    const ttsResult = await testTtsGeneration(client);
    results.ttsGeneration = ttsResult !== null;

    // 输出总结
    console.log("\n========== 测试总结 ==========");
    console.log(`连接测试: ${results.connection ? "✅ 通过" : "❌ 失败"}`);
    console.log(`健康检查: ${results.healthCheck ? "✅ 通过" : "❌ 失败"}`);
    console.log(`TTS 生成: ${results.ttsGeneration ? "✅ 通过" : "❌ 失败"}`);

    if (results.connection && results.ttsGeneration) {
      console.log("\n🎉 所有测试通过！VoxCPM TTS 服务正常工作。");
    } else {
      console.log("\n⚠️  部分测试失败，请检查网络连接和服务状态。");
    }
  } catch (error) {
    console.error("\n❌ 测试过程中发生错误:", error.message);
  }
}

// 运行测试
runTests();
