export interface VoiceIdentity {
  voiceCode?: string;
  systemId?: string;
  service?: string;
  voice?: string;
  voiceId?: string;
}

export interface SynthesisParams extends VoiceIdentity {
  text: string;
  model?: string;
  format?: string;
  sampleRate?: number;
  speed?: number;
  pitch?: number;
  volume?: number;
  emotion?: string;
  expectedDurationSec?: number;
  samplingParams?: Record<string, any>;
  seed?: number;
  options?: Record<string, any>;
  [key: string]: any;
}

export interface SynthesisResult {
  success: boolean;
  audioUrl?: string;
  filePath?: string;
  fileName?: string;
  format?: string;
  sampleRate?: number;
  duration?: number;
  fileSize?: number;
  provider?: string;
  serviceType?: string;
  voice?: string;
  model?: string;
  requestId?: string;
  systemId?: string | null;
  fromCache?: boolean;
  timestamp?: string;
  raw?: any;
}

export type BatchMode = 'auto' | 'server' | 'client';

export interface BatchSynthesisParams extends VoiceIdentity {
  texts: string[];
  mode?: BatchMode;
  concurrency?: number;
  model?: string;
  format?: string;
  sampleRate?: number;
  speed?: number;
  pitch?: number;
  volume?: number;
  emotion?: string;
  expectedDurationSec?: number;
  samplingParams?: Record<string, any>;
  seed?: number;
  options?: Record<string, any>;
  [key: string]: any;
}

export interface BatchResultItem {
  index: number;
  text: string;
  success: boolean;
  data?: SynthesisResult;
}

export interface BatchErrorItem {
  index: number;
  text?: string;
  error: string;
  code?: string;
  status?: number;
}

export interface BatchResult {
  success: boolean;
  mode: 'server' | 'client';
  results: BatchResultItem[];
  errors: BatchErrorItem[];
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
  service?: string;
  timestamp?: string;
}

export interface VoiceDisplayDto {
  id: string;
  voiceCode: string;
  displayName: string;
  gender?: string;
  languages: string[];
  tags: string[];
  description?: string;
  previewUrl?: string;
}

export interface VoiceDetail {
  identity: {
    id: string;
    voiceCode?: string;
    sourceId?: string;
    provider?: string;
    service?: string;
  };
  profile?: {
    displayName?: string;
    alias?: string;
    gender?: string;
    languages?: string[];
    description?: string;
    tags?: string[];
    status?: string;
    preview?: string;
  };
  runtimePreview?: Record<string, any>;
  meta?: Record<string, any>;
}

export interface ProviderInfo {
  key: string;
  provider: string;
  service: string;
  displayName: string;
  description?: string;
  configured: boolean;
  status: 'stable' | 'beta' | 'deprecated' | string;
}

export interface ParameterSupport {
  supported: boolean;
  config?: {
    type?: string;
    range?: { min: number; max: number };
    values?: any[];
    default?: any;
    description?: string;
  };
}

export interface ServiceCapabilities {
  success: boolean;
  data?: {
    displayName?: string;
    defaultVoiceId?: string;
    status?: string;
    parameters: Record<string, ParameterSupport>;
    defaults: Record<string, any>;
    lockedParams: string[];
  };
  error?: string;
  code?: string;
  timestamp?: string;
}

export interface TtsClientConfig {
  apiBaseUrl?: string;
  apiKey?: string;
  timeout?: number;
  cacheTTL?: number;
  headers?: Record<string, string>;
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
}

export type TtsEventName =
  | 'requestStart'
  | 'requestSuccess'
  | 'requestError'
  | 'synthesizeSuccess'
  | 'synthesizeError';

export type TtsEventListener = (data?: any) => void;

export default class TtsClient {
  constructor(config?: TtsClientConfig);

  on(event: TtsEventName, callback: TtsEventListener): void;
  off(event: TtsEventName, callback: TtsEventListener): void;

  request(endpoint: string, options?: RequestInit & { query?: Record<string, any> }): Promise<any>;
  get(endpoint: string, query?: Record<string, any>): Promise<any>;
  post(endpoint: string, body?: any, options?: RequestInit): Promise<any>;

  synthesize(params: SynthesisParams): Promise<SynthesisResult>;
  synthesize(text: string, options?: Omit<SynthesisParams, 'text'>): Promise<SynthesisResult>;

  batchSynthesize(params: BatchSynthesisParams): Promise<BatchResult>;
  batchSynthesize(texts: string[], options?: Omit<BatchSynthesisParams, 'texts'>): Promise<BatchResult>;

  synthesizeWithVoiceCode(
    text: string,
    voiceCode: string,
    options?: Record<string, any>
  ): Promise<SynthesisResult>;

  synthesizeWithSystemId(
    text: string,
    systemId: string,
    options?: Record<string, any>
  ): Promise<SynthesisResult>;

  synthesizeWithService(
    text: string,
    service: string,
    voice: string,
    options?: Record<string, any>
  ): Promise<SynthesisResult>;

  aliyunQwen(text: string, voice: string, options?: Record<string, any>): Promise<SynthesisResult>;
  aliyunCosyvoice(text: string, voice: string, options?: Record<string, any>): Promise<SynthesisResult>;
  tencent(text: string, voice: string, options?: Record<string, any>): Promise<SynthesisResult>;
  volcengine(text: string, voice: string, options?: Record<string, any>): Promise<SynthesisResult>;
  moss(text: string, voice: string, options?: Record<string, any>): Promise<SynthesisResult>;
  minimax(text: string, voice: string, options?: Record<string, any>): Promise<SynthesisResult>;

  getVoices(options?: {
    useCache?: boolean;
    forceRefresh?: boolean;
    service?: string;
  }): Promise<any>;

  getFrontendVoices(options?: {
    useCache?: boolean;
    forceRefresh?: boolean;
  }): Promise<{
    success: boolean;
    data: {
      voices: VoiceDisplayDto[];
      filters: Record<string, string[]>;
      total: number;
    };
    timestamp: string;
  }>;

  getServiceVoices(service: string): Promise<any>;
  getVoiceDetail(voiceId: string): Promise<{ success: boolean; data?: VoiceDetail; error?: string }>;
  getCatalog(): Promise<any>;
  getProviders(options?: { useCache?: boolean; forceRefresh?: boolean }): Promise<{
    success: boolean;
    data: ProviderInfo[];
    providerCount?: number;
    total?: number;
    timestamp: string;
  }>;
  getCapabilities(serviceKey: string, options?: { useCache?: boolean; forceRefresh?: boolean }): Promise<ServiceCapabilities>;
  getFilterOptions(): Promise<{ success: boolean; data: Record<string, string[]>; timestamp: string }>;
  getHealth(): Promise<any>;
  getStats(): Promise<any>;

  clearCache(): void;
  clearCapabilitiesCache(serviceKey?: string): void;

  setApiKey(apiKey: string): void;
  setBaseUrl(baseUrl: string): void;
  setTimeout(timeout: number): void;
  setFetch(fetchImpl: (input: string, init?: RequestInit) => Promise<Response>): void;
}

declare global {
  interface Window {
    TtsClient: typeof TtsClient;
  }
}
