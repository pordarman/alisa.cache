import type { EventEmitter } from "events";

export type CacheStrategy = "LRU" | "FIFO" | "MFU" | "CUSTOM";

export interface AlisaCacheOptions {
  limit?: number;
  updateOnGet?: boolean;
  updateOnHas?: boolean;
  cloneOnGet?: boolean;
  overWrite?: boolean;
  strategy?: CacheStrategy;
  customEvict?: (store: Map<any, any>, meta: Map<any, number>) => void;
}

export interface SetOptions {
  ttl?: number;
  priority?: number;
  tags?: string[];
}

export interface EmitPayloads {
  get: { key: any; hit: boolean; value?: any };
  set: { key: any; value: any; ttl?: number; tags?: string[]; priority?: number };
  delete: { key: any; success: boolean };
  has: { key: any; found: boolean };
  flush: Record<string, never>;
  prune: number;
  autoPrune: number;
}

export default class AlisaCache {
  constructor(options?: AlisaCacheOptions);

  // core API
  set(key: any, value: any, options?: SetOptions): this;
  get(key: any): any | undefined;
  has(key: any): boolean;
  delete(key: any): boolean;
  flush(): void;
  size(): number;
  ttl(key: any): number;
  expire(key: any): boolean;
  rename(oldKey: any, newKey: any): boolean;

  // tags
  getByTag(tag: string): any[];
  deleteByTag(tag: string): number;
  tags(): string[];

  // strategy
  autoPrune(intervalMs: number): this;
  stopAutoPrune(): this;

  // filtering
  filter(fn: (value: any, key: any, cache: AlisaCache) => boolean): AlisaCache;
  map<T>(fn: (value: any, key: any, cache: AlisaCache) => T): T[];
  some(fn: (value: any, key: any, cache: AlisaCache) => boolean): boolean;
  every(fn: (value: any, key: any, cache: AlisaCache) => boolean): boolean;
  reduce<T>(
    fn: (accumulator: T, value: any, key: any, cache: AlisaCache) => T,
    initial: T
  ): T;
  forEach(fn: (value: any, key: any, cache: AlisaCache) => void): void;
  groupBy(fn: (value: any, key: any, cache: AlisaCache) => any): Map<any, any[]>;
  partition(fn: (value: any, key: any, cache: AlisaCache) => boolean): [AlisaCache, AlisaCache];
  search(query: string | RegExp, where?: "key" | "value" | "both"): [any, any][];

  // events
  on<K extends keyof EmitPayloads>(event: K, callback: (payload: EmitPayloads[K]) => void): this;
  off<K extends keyof EmitPayloads>(event: K, callback: (payload: EmitPayloads[K]) => void): this;

  // snapshot
  snapshot(): object;
  loadSnapshot(snapshot: object): this;
  toJSON(): object;
  fromJSON(json: object): this;
  clone(): AlisaCache;

  // namespaces
  namespace(name: string): AlisaCache;
  listNamespaces(): string[];
  removeNamespace(name: string): boolean;
  flushNamespaces(): void;

  // extra
  stats(): {
    size: number;
    limit: number;
    hits: number;
    misses: number;
    evictions: number;
    strategy: string;
    tagCount: number;
    tags: string[];
  };

  statsExtended(): {
    totalKeys: number;
    totalTags: number;
    mostUsedTags: string[];
    ttlEnabled: number;
    tagUsage: Record<string, number>;
  };

  metrics(): {
    keyCount: number;
    avgValueSize: number;
    ttlCount: number;
    activeTTLKeys: string[];
  };

  inspect(): void;
  log(): void;
}
