/**
 * VoiceAdminQueryService - 管理端音色查询服务
 *
 * 职责：
 * - 管理端 raw/StoredVoice 查询（暴露完整 runtime 字段）
 * - 过滤逻辑（provider/service/gender/tags）
 * - 统计查询（provider 状态、overview）
 *
 * 与 TtsQueryService 的分工：
 * - TtsQueryService → 面向前端展示 DTO（不暴露 runtime.voiceId 等）
 * - VoiceAdminQueryService → 面向管理端 raw 数据（完整 StoredVoice）
 */
class VoiceAdminQueryService {
  constructor({ voiceRegistry }) {
    this.registry = voiceRegistry;
  }

  list(filters = {}) {
    const { provider, service, gender, tags } = filters;

    let voices = this.registry.getAll();

    if (provider && service) {
      voices = this.registry.getByProviderAndService(provider, service);
    } else if (provider) {
      voices = this.registry.getByProvider(provider);
    }

    if (gender) {
      voices = voices.filter(v => v.profile?.gender === gender);
    }

    if (tags) {
      const tagList = tags.split(',').map(t => t.trim());
      voices = voices.filter(v => {
        const vTags = v.profile?.tags;
        return vTags && tagList.some(t => vTags.includes(t));
      });
    }

    return voices;
  }

  getById(id) {
    return this.registry.get(id) || null;
  }

  getStats() {
    return this.registry.getStats();
  }

  getProvidersStatus() {
    return {
      enabled: this.registry.getEnabledProviders(),
      disabled: this.registry.getDisabledProviders(),
      all: this.registry.getStats().providers
    };
  }

  isProviderEnabled(provider) {
    return this.registry.isProviderEnabled(provider);
  }

  getTotal() {
    return this.registry.getStats().total;
  }
}

module.exports = { VoiceAdminQueryService };
