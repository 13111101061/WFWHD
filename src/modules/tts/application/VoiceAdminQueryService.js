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
  constructor({ voiceCatalog }) {
    this.catalog = voiceCatalog;
  }

  list(filters = {}) {
    const { provider, service, gender, tags, source } = filters;

    let voices = [];
    if (provider && service) {
      for (const reg of this.catalog.registries) {
        voices = voices.concat(reg.getByProviderAndService(provider, service));
      }
    } else if (provider) {
      for (const reg of this.catalog.registries) {
        voices = voices.concat(reg.getByProvider(provider));
      }
    } else {
      for (const reg of this.catalog.registries) {
        voices = voices.concat(reg.getAll());
      }
    }

    if (source) {
      voices = voices.filter(v => v.meta?.dataSource === source);
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
    return this.catalog.get(id) || null;
  }

  getStats() {
    return this.catalog.getStats();
  }

  getProvidersStatus() {
    const enabledSet = new Set();
    const disabledSet = new Set();
    const all = {};

    for (const reg of this.catalog.registries) {
      for (const p of reg.getEnabledProviders()) enabledSet.add(p);
      for (const d of reg.getDisabledProviders()) disabledSet.add(d.provider || d);
      Object.assign(all, reg.getStats().providers);
    }

    return {
      enabled: Array.from(enabledSet),
      disabled: Array.from(disabledSet),
      all
    };
  }

  isProviderEnabled(provider) {
    for (const reg of this.catalog.registries) {
      if (reg.isProviderEnabled(provider) !== undefined) return reg.isProviderEnabled(provider);
    }
    return false;
  }

  getTotal() {
    let total = 0;
    for (const reg of this.catalog.registries) total += reg.getStats().total;
    return total;
  }
}

module.exports = { VoiceAdminQueryService };
