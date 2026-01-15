/**
 * TTS音色工厂 SDK - TypeScript类型定义
 *
 * @version 1.0.0
 */

/**
 * 音色对象
 */
export interface Voice {
  /** 系统ID (如: 'aliyun-qwen-kai') */
  id: string;
  /** 音色名称 (如: 'Kai') */
  name: string;
  /** 服务商 (如: 'aliyun') */
  provider: string;
  /** 服务类型 (如: 'qwen_http') */
  service: string;
  /** 厂商音色ID (如: 'Kai') */
  voiceId: string;
  /** 模型名称 (如: 'qwen3-tts-flash') */
  model: string;
  /** 性别: 'male' | 'female' */
  gender: 'male' | 'female';
  /** 支持的语言 (如: ['zh-CN', 'en-US']) */
  languages: string[];
  /** 标签 (如: ['舒缓', '年轻男性']) */
  tags: string[];
  /** 描述（可选） */
  description?: string;
  /** 系统ID别名（可选） */
  systemId?: string;
}

/**
 * 服务商统计
 */
export interface Provider {
  provider: string;
  service: string;
  count: number;
  models: string[];
}

/**
 * 标签统计
 */
export interface Tag {
  name: string;
  count: number;
}

/**
 * 音色统计信息
 */
export interface Statistics {
  total: number;
  byProvider: Record<string, number>;
  byGender: {
    male: number;
    female: number;
  };
  byLanguage: Record<string, number>;
  byTag: Record<string, number>;
  byModel: Record<string, number>;
}

/**
 * 筛选条件
 */
export interface Filters {
  /** 服务商 */
  provider?: string;
  /** 性别 */
  gender?: 'male' | 'female';
  /** 语言代码 */
  language?: string;
  /** 标签数组 */
  tags?: string[];
  /** 搜索关键词 */
  search?: string;
}

/**
 * 获取音色的选项
 */
export interface GetVoicesOptions {
  /** 是否使用缓存（默认: true） */
  useCache?: boolean;
  /** 强制刷新（默认: false） */
  forceRefresh?: boolean;
}

/**
 * 搜索音色的选项
 */
export interface SearchOptions {
  /** 搜索字段（默认: ['name', 'tags', 'description']） */
  fields?: Array<'name' | 'tags' | 'description'>;
}

/**
 * 推荐音色的选项
 */
export interface RecommendedOptions {
  /** 返回数量（默认: 10） */
  limit?: number;
  /** 指定服务商 */
  provider?: string;
}

/**
 * 导出JSON的选项
 */
export interface ExportOptions {
  /** 是否格式化（默认: true） */
  pretty?: boolean;
}

/**
 * SDK配置选项
 */
export interface VoiceLibraryClientConfig {
  /** API基础URL（默认: '/api'） */
  apiBaseUrl?: string;
  /** API密钥 */
  apiKey?: string;
  /** 请求超时时间(毫秒，默认: 10000) */
  timeout?: number;
  /** 缓存有效期(毫秒，默认: 300000) */
  cacheTTL?: number;
}

/**
 * 事件监听器类型
 */
export type EventListener = (data?: any) => void;

/**
 * 事件名称
 */
export type EventName = 'voicesLoaded' | 'error' | string;

/**
 * TTS音色库客户端类
 */
export default class VoiceLibraryClient {
  /**
   * 构造函数
   * @param config - 配置对象
   */
  constructor(config?: VoiceLibraryClientConfig);

  /**
   * 添加事件监听器
   * @param event - 事件名称
   * @param callback - 回调函数
   */
  on(event: EventName, callback: EventListener): void;

  /**
   * 获取所有音色列表
   * @param options - 查询选项
   * @returns 音色列表
   */
  getVoices(options?: GetVoicesOptions): Promise<Voice[]>;

  /**
   * 根据系统ID获取单个音色
   * @param systemId - 音色系统ID
   * @returns 音色对象
   */
  getVoiceById(systemId: string): Promise<Voice>;

  /**
   * 根据服务商获取音色列表
   * @param provider - 服务商名称
   * @returns 音色列表
   */
  getVoicesByProvider(provider: string): Promise<Voice[]>;

  /**
   * 根据标签获取音色列表
   * @param tag - 标签名称
   * @returns 音色列表
   */
  getVoicesByTag(tag: string): Promise<Voice[]>;

  /**
   * 搜索音色
   * @param keyword - 搜索关键词
   * @param options - 搜索选项
   * @returns 匹配的音色列表
   */
  searchVoices(keyword: string, options?: SearchOptions): Promise<Voice[]>;

  /**
   * 获取所有服务商列表
   * @returns 服务商列表
   */
  getProviders(): Promise<Provider[]>;

  /**
   * 获取所有标签列表
   * @returns 标签列表
   */
  getTags(): Promise<Tag[]>;

  /**
   * 按性别筛选音色
   * @param gender - 性别
   * @returns 音色列表
   */
  getVoicesByGender(gender: 'male' | 'female'): Promise<Voice[]>;

  /**
   * 按语言筛选音色
   * @param language - 语言代码
   * @returns 音色列表
   */
  getVoicesByLanguage(language: string): Promise<Voice[]>;

  /**
   * 高级筛选
   * @param filters - 筛选条件
   * @returns 筛选后的音色列表
   */
  filterVoices(filters?: Filters): Promise<Voice[]>;

  /**
   * 获取音色统计信息
   * @returns 统计信息
   */
  getStatistics(): Promise<Statistics>;

  /**
   * 获取推荐音色
   * @param options - 推荐选项
   * @returns 推荐音色列表
   */
  getRecommendedVoices(options?: RecommendedOptions): Promise<Voice[]>;

  /**
   * 批量获取音色详情
   * @param systemIds - 音色系统ID数组
   * @returns 音色详情数组
   */
  getVoicesByIds(systemIds: string[]): Promise<Voice[]>;

  /**
   * 导出音色数据为JSON
   * @param options - 导出选项
   * @returns JSON字符串
   */
  exportToJSON(options?: ExportOptions): Promise<string>;

  /**
   * 清除缓存
   */
  clearCache(): void;

  // ========== 别名方法 ==========

  /**
   * 获取所有音色（别名）
   */
  getAll(options?: GetVoicesOptions): Promise<Voice[]>;

  /**
   * 搜索音色（别名）
   */
  search(keyword: string, options?: SearchOptions): Promise<Voice[]>;

  /**
   * 按标签获取（别名）
   */
  getByTag(tag: string): Promise<Voice[]>;

  /**
   * 按服务商获取（别名）
   */
  getByProvider(provider: string): Promise<Voice[]>;
}

/**
 * 全局声明（浏览器环境）
 */
declare global {
  interface Window {
    VoiceLibraryClient: typeof VoiceLibraryClient;
  }
}

export {};
