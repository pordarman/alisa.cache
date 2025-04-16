// @ts-check
"use strict";
const CacheError = require("./CacheError.js");
const validStrategies = ["LRU", "FIFO", "MFU", "CUSTOM"];

/**
 * @typedef {Object} AlisaCacheOptions
 * @property {number} [limit=100] - Maximum number of items the cache can store.
 * @property {number} [ttl] - Time to live in milliseconds.
 * @property {boolean} [updateOnGet=false] - Whether accessing a key should update its position (LRU behavior).
 * @property {boolean} [updateOnHas=false] - Whether checking a key should update its position (LRU behavior).
 * @property {boolean} [cloneOnGet=false] - Whether to return a clone of the value when getting it.
 * @property {boolean} [overWrite=true] - Whether to overwrite existing keys.
 * @property {"LRU" | "FIFO" | "MFU" | "CUSTOM"} [strategy="LRU"] - Cache eviction strategy.
 * @property {Function} [customEvict] - Custom eviction function when using "CUSTOM" strategy.
 */

/**
 * Represents a high-performance, multi-strategy cache system.
 */
class AlisaCache {
    // #region Properties
    /**
     * @param {AlisaCacheOptions} [options={}]
     */
    constructor(options = {}) {
        const {
            limit = 100,
            ttl,
            updateOnGet = false,
            updateOnHas = false,
            cloneOnGet = false,
            overWrite = true,
            strategy = "LRU",
            customEvict = null
        } = options;

        if (typeof limit !== "number" || limit <= 0) {
            throw new CacheError("`limit` must be a positive number.");
        }

        if (!validStrategies.includes(strategy)) {
            throw new CacheError(`Invalid strategy "${strategy}". Must be one of: ${validStrategies.join(", ")}`);
        }

        if (strategy === "CUSTOM" && typeof customEvict !== "function") {
            throw new CacheError("When using CUSTOM strategy, `customEvict` must be a function.");
        }

        this.limit = limit; // Maximum number of items the cache can store
        this.ttl = ttl; // Time to live in milliseconds (not used in this version)
        this.updateOnGet = updateOnGet; // Whether accessing a key should update its position (LRU behavior)
        this.updateOnHas = updateOnHas; // Whether checking a key should update its position (LRU behavior)
        this.cloneOnGet = cloneOnGet; // Whether to return a clone of the value when getting it
        this.overWrite = overWrite; // Whether to overwrite existing keys
        this.strategy = strategy; // Cache eviction strategy
        this.customEvict = customEvict; // Custom eviction function when using "CUSTOM" strategy

        this.hits = 0; // Cache hits
        this.misses = 0; // Cache misses
        this.evictions = 0; // Cache evictions

        /**
         * Internal auto prune timer ID.
         * @type {any}
         * @private
         */
        this._autoPruneIntervalId = null;

        /**
         * @type {Map<any, any>}
         * @private
         */
        this.store = new Map(); // key -> value

        /**
         * @type {Map<any, number>}
         * @private
         */
        this.meta = new Map(); // key -> last accessed timestamp

        /**
         * @type {Map<any, number>}
         * @private
         */
        this.ttlMap = new Map(); // key -> expiration timestamp

        /**
         * @type {Map<any, number>}
         * @private
         */
        this.priorityMap = new Map(); // key -> priority value


        /**
         * Map of tags to sets of keys.
         * @type {Map<string, Set<any>>}
         * @private
         */
        this.tagMap = new Map();

        /**
         * Map of key to tags.
         * @type {Map<any, Set<string>>}
         * @private
         */
        this.keyTags = new Map();

        /**
         * Internal event listener map.
         * @type {Map<string, Set<Function>>}
         * @private
         */
        this.listeners = new Map();

        /**
         * Holds sub-cache instances for namespaced segments.
         * @type {Map<string, AlisaCache>}
         * @private
         */
        this.namespaces = new Map();
    }
    // #endregion

    // #region Event Methods
    /**
     * Registers a new listener for the given event.
     * @param {string} event - Event name (e.g., "get", "set", "delete", "has")
     * @param {(payload: any) => void} callback - Listener callback
     * @returns {this}
     * @example
     * cache.on("get", ({ key, hit }) => console.log(key, hit));
     */
    on(event, callback) {
        if (typeof event !== "string") throw new CacheError("Event name must be a string.");
        if (typeof callback !== "function") throw new CacheError("Callback must be a function.");

        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)?.add(callback);
        return this;
    }

    /**
     * Unregisters a listener for a given event.
     * @param {string} event
     * @param {(payload: any) => void} callback
     * @returns {this}
     */
    off(event, callback) {
        this.listeners.get(event)?.delete(callback);
        return this;
    }

    /**
     * Emits an event to all registered listeners.
     * @param {string} event
     * @param {any} payload
     * @returns {void}
     */
    emit(event, payload) {
        for (const listener of this.listeners.get(event) || []) {
            try {
                listener(payload);
            } catch (err) {
                console.error(`[AlisaCache] Error in "${event}" listener:`, err);
            }
        }
    }
    // #endregion

    // #region Namespace
    /**
     * Creates or returns a namespaced AlisaCache instance.
     * Each namespace is isolated with its own store, meta, TTL, tags, etc.
     * @param {string} name - The namespace identifier
     * @returns {AlisaCache|undefined}
     * @example
     * const guildCache = cache.namespace("guild:1234");
     * guildCache.set("prefix", "!");
     */
    namespace(name) {
        if (typeof name !== "string" || !name.length) {
            throw new CacheError("Namespace name must be a non-empty string.");
        }

        if (this.namespaces.has(name)) return this.namespaces.get(name);

        const ns = this._deepClone(); // Create a new instance of AlisaCache with the same options

        // Event forwarding (optional, isteğe bağlı)
        ns.on = this.on.bind(this);
        ns.emit = this.emit.bind(this);

        this.namespaces.set(name, ns);
        return ns;
    }

    /**
     * Returns a list of all defined namespace identifiers.
     * @returns {string[]}
     * @example
     * cache.listNamespaces(); // ["guild:123", "guild:456"]
     */
    listNamespaces() {
        return [...this.namespaces.keys()];
    }

    /**
   * Removes a namespaced cache instance.
   * @param {string} name - The name of the namespace to remove
   * @returns {boolean} - Whether the namespace was removed
   * @example
   * cache.removeNamespace("guild:123");
   */
    removeNamespace(name) {
        return this.namespaces.delete(name);
    }

    /**
   * Flushes all namespace caches.
   * @returns {void}
   * @example
   * cache.flushNamespaces();
   */
    flushNamespaces() {
        for (const ns of this.namespaces.values()) {
            ns.flush();
        }
    }

    // #endregion  

    // #region General Methods
    /**
      * Sets a value in the cache with optional TTL support.
      * @param {any} key - Cache key.
      * @param {any} value - Value to cache.
      * @param {Object} [options={}]
      * @param {number} [options.ttl] - Time to live in milliseconds.
      * @param {number} [options.priority] - Priority level (higher = less likely to be evicted).
      * @param {string[]} [options.tags] - List of tags to associate with this key.
      * @returns {this}
      */
    set(key, value, options = {}) {
        const {
            ttl,
            priority = 0,
            tags = [],
        } = options;

        if (!Array.isArray(tags)) throw new CacheError("`tags` must be an array of strings.");

        if (typeof priority === "number") {
            this.priorityMap.set(key, priority);
        }

        const defaultTTL = ttl || this.ttl;

        if (!this.overWrite && this.store.has(key)) return this;

        if (this.store.size >= this.limit && !this.store.has(key)) {
            this.evict();
        }

        this.store.set(key, value);
        this.meta.set(key, Date.now());

        if (typeof defaultTTL === "number" && defaultTTL > 0) {
            this.ttlMap.set(key, Date.now() + defaultTTL);
        } else {
            this.ttlMap.delete(key);
        }

        const tagSet = new Set(tags.map(String));
        this.keyTags.set(key, tagSet);
        for (const tag of tagSet) {
            if (!this.tagMap.has(tag)) this.tagMap.set(tag, new Set());
            this.tagMap.get(tag)?.add(key);
        }

        this.emit("set", { key, value, ttl: defaultTTL, tags, priority });
        return this;
    }

    /**
     * Get a value from the cache.
     * @param {any} key - The key to retrieve.
     * @returns {any | undefined}
     * @example
     * cache.get("user:1"); // { id: 1, name: "Alice" }
     */
    get(key) {
        if (!this.store.has(key)) {
            this.misses++;
            this.emit("get", { key, hit: false });
            return undefined;
        }

        const ttl = this.ttlMap.get(key);
        if (ttl && Date.now() > ttl) {
            this.delete(key);
            this.misses++;
            this.emit("get", { key, hit: false });
            return undefined;
        }

        if (this.updateOnGet) {
            this.meta.set(key, Date.now());
        }

        this.hits++;
        const value = this.store.get(key);

        this.emit("get", { key, hit: true, value });
        return this.cloneOnGet ? this._clone(value) : value;
    }

    /**
     * Returns all values associated with the given tag.
     * @param {string} tag
     * @returns {Array<any>}
     */
    getByTag(tag) {
        const keys = this.tagMap.get(tag);
        if (!keys) return [];
        return [...keys].map(k => this.get(k)).filter(v => v !== undefined);
    }

    /**
     * Check if a key exists in the cache.
     * @param {any} key
     * @returns {boolean}
     * @example
     * cache.has("user:1"); // true
     */
    has(key) {
        const exists = this.store.has(key);
        const ttl = this.ttlMap.get(key);
        if (!exists || (ttl && Date.now() > ttl)) {
            this.delete(key);
            this.emit("has", { key, found: false });
            return false;
        }

        if (this.updateOnHas) {
            this.meta.set(key, Date.now());
        }

        this.emit("has", { key, found: true });
        return true;
    }


    /**
     * Delete a key from the cache.
     * @param {any} key
     * @returns {boolean}
     * @example
     * cache.delete("user:1"); // true
     */
    delete(key) {
        const existed = this.store.delete(key);
        this.meta.delete(key);
        this.ttlMap.delete(key);
        this.priorityMap.delete(key);

        const tags = this.keyTags.get(key);
        if (tags) {
            for (const tag of tags) {
                const keys = this.tagMap.get(tag);
                keys?.delete(key);
                if (keys?.size === 0) this.tagMap.delete(tag);
            }
            this.keyTags.delete(key);
        }


        this.emit("delete", { key, success: existed });
        return existed;
    }

    /**
     * Deletes all entries associated with the given tag.
     * @param {string} tag
     * @returns {number} - Number of deleted entries.
     */
    deleteByTag(tag) {
        const keys = this.tagMap.get(tag);
        if (!keys) return 0;

        let deleted = 0;
        for (const key of keys) {
            if (this.delete(key)) deleted++;
        }

        this.tagMap.delete(tag);
        return deleted;
    }

    /**
     * Renames a key while preserving its value and metadata (tags, ttl, etc.)
     * @param {any} oldKey
     * @param {any} newKey
     * @returns {boolean} - Whether the rename was successful
     * @example
     * cache.rename("u:1", "user:1");
     */
    rename(oldKey, newKey) {
        if (!this.store.has(oldKey) || this.store.has(newKey)) return false;

        const value = this.store.get(oldKey);
        const meta = this.meta.get(oldKey);
        const ttl = this.ttlMap.get(oldKey);
        const tags = this.keyTags.get(oldKey);

        this.set(newKey, value);
        if (meta) this.meta.set(newKey, meta);
        if (ttl) this.ttlMap.set(newKey, ttl);
        if (tags) {
            this.keyTags.set(newKey, new Set(tags));
            for (const tag of tags) {
                this.tagMap.get(tag)?.add(newKey);
                this.tagMap.get(tag)?.delete(oldKey);
            }
        }

        this.delete(oldKey);
        return true;
    }


    /**
     * Removes all data from the cache, including metadata, TTLs, and tags.
     * @returns {void}
     * @example
     * cache.flush();
     */
    flush() {
        this.store.clear();
        this.meta.clear();
        this.ttlMap.clear();
        this.tagMap.clear();
        this.keyTags.clear();
        this.priorityMap.clear();

        this.emit("flush", {});
    }

    /**
     * Returns the remaining time-to-live (TTL) in milliseconds for a given key.
     * If no TTL is set or the key is expired/missing, returns -1.
     * @param {any} key
     * @returns {number} Remaining TTL in milliseconds or -1 if none.
     * @example
     * const timeLeft = cache.ttl("user:123"); // e.g., 4242 ms
     */
    ttlExpire(key) {
        const expireAt = this.ttlMap.get(key);
        if (!this.store.has(key) || !expireAt) return -1;

        const now = Date.now();
        return expireAt > now ? expireAt - now : -1;
    }


    /**
     * Removes expired entries from the cache.
     * @returns {number} - Number of removed entries.
     * @example
     * cache.prune(); // 3
     */
    prune() {
        let removed = 0;
        const now = Date.now();
        for (const [key, expireAt] of this.ttlMap.entries()) {
            if (now > expireAt) {
                if (this.delete(key)) removed++;
            }
        }

        this.emit("prune", removed);
        return removed;
    }

    /**
     * Starts an interval that automatically prunes expired entries.
     * @param {number} intervalMs - Interval in milliseconds.
     * @returns {this}
     * @example
     * cache.autoPrune(10000); // every 10 seconds
     */
    autoPrune(intervalMs) {
        if (typeof intervalMs !== "number" || intervalMs <= 0) {
            throw new CacheError("autoPrune interval must be a positive number (ms).");
        }

        this.stopAutoPrune(); // temiz başla

        this._autoPruneIntervalId = setInterval(() => {
            const removed = this.prune?.(); // varsa çağır
            this.emit("autoPrune", removed);
        }, intervalMs);

        return this;
    }

    /**
     * Stops the automatic prune interval if it's running.
     * @returns {this}
     */
    stopAutoPrune() {
        if (this._autoPruneIntervalId) {
            clearInterval(this._autoPruneIntervalId);
            this._autoPruneIntervalId = null;
        }
        return this;
    }


    // #endregion

    // #region Utility Methods
    /**
     * Return current cache size.
     * @returns {number}
     * @example
     * cache.size(); // 5
     */
    size() {
        return this.store.size;
    }

    /**
     * Get all keys in the cache.
     * @returns {Array<any>}
     * @example
     * cache.keys(); // ["user:1", "user:2"]
     */
    keys() {
        return [...this.store.keys()];
    }

    /**
     * Returns an iterator over cache values.
     * @returns {Iterator<any>}
     */
    values() {
        return this.store.values();
    }

    /**
     * Returns an iterator over [key, value] entries.
     * @returns {Iterator<[any, any]>}
     */
    entries() {
        return this.store.entries();
    }

    /**
     * Returns a new AlisaCache instance with entries that pass the test.
     * @param {(value: any, key: any, cache: AlisaCache) => boolean} predicate
     * @returns {AlisaCache}
     * @example
     * const activeUsers = cache.filter((v, k) => v.active);
     */
    filter(predicate) {
        if (typeof predicate !== "function") {
            throw new CacheError("Predicate must be a function.");
        }

        const result = this._deepClone(); // Create a new instance of AlisaCache

        for (const [key, value] of this.store.entries()) {
            if (predicate(value, key, this)) {
                result.set(key, this.cloneOnGet ? this._clone(value) : value);
            }
        }

        return result;
    }

    /**
     * Creates a new array populated with the results of calling a provided function on every entry.
     * @param {(value: any, key: any, cache: AlisaCache) => any} fn
     * @returns {Array<any>}
     * @example
     * const usernames = cache.map(v => v.username);
     */
    map(fn) {
        if (typeof fn !== "function") {
            throw new CacheError("'fn' must be a function.");
        }
        const result = [];
        for (const [key, value] of this.store.entries()) {
            result.push(fn(value, key, this));
        }
        return result;
    }

    /**
     * Checks if at least one entry passes the test implemented by the provided function.
     * @param {(value: any, key: any, cache: AlisaCache) => boolean} fn
     * @returns {boolean}
     * @example
     * const hasActiveUsers = cache.some(v => v.active);
     */
    some(fn) {
        if (typeof fn !== "function") {
            throw new CacheError("'fn' must be a function.");
        }
        for (const [key, value] of this.store.entries()) {
            if (fn(value, key, this)) return true;
        }
        return false;
    }

    /**
     * Checks if all entries pass the test implemented by the provided function.
     * @param {(value: any, key: any, cache: AlisaCache) => boolean} fn
     * @returns {boolean}
     * @example
     * const allActive = cache.every(v => v.active);
     */
    every(fn) {
        if (typeof fn !== "function") {
            throw new CacheError("'fn' must be a function.");
        }
        for (const [key, value] of this.store.entries()) {
            if (!fn(value, key, this)) return false;
        }
        return true;
    }

    /**
     * Applies a function against an accumulator and each value to reduce it to a single result.
     * @param {(accumulator: any, value: any, key: any, cache: AlisaCache) => any} reducer
     * @param {any} initialValue
     * @returns {any}
     * @example
     * const totalXP = cache.reduce((acc, val) => acc + val.xp, 0);
     */
    reduce(reducer, initialValue) {
        if (typeof reducer !== "function") {
            throw new CacheError("'fn' must be a function.");
        }
        let accumulator = initialValue;
        for (const [key, value] of this.store.entries()) {
            accumulator = reducer(accumulator, value, key, this);
        }
        return accumulator;
    }

    /**
     * Executes a function for each cache entry.
     * @param {(value: any, key: any, cache: AlisaCache) => void} callback
     * @returns {void}
     */
    forEach(callback) {
        if (typeof callback !== "function") {
            throw new CacheError("'callback' must be a function.");
        }

        for (const [key, value] of this.store.entries()) {
            callback(value, key, this);
        }
    }

    /**
     * Groups values in the cache by a given function.
     * @param {(value: any, key: any, cache: AlisaCache) => any} fn - Grouping function
     * @returns {Map<any, any[]>} - Group key -> values
     * @example
     * const groups = cache.groupBy(v => v.role);
     */
    groupBy(fn) {
        if (typeof fn !== "function") {
            throw new CacheError("'fn' must be a function.");
        }

        const groups = new Map();
        for (const [key, value] of this.store.entries()) {
            const groupKey = fn(value, key, this);
            if (!groups.has(groupKey)) groups.set(groupKey, []);
            groups.get(groupKey).push(value);
        }
        return groups;
    }

    /**
     * Partitions the cache into two new caches based on a predicate function.
     * @param {(value: any, key: any, cache: AlisaCache) => boolean} fn
     * @returns {[AlisaCache, AlisaCache]} - [matchedCache, unmatchedCache]
     * @example
     * const [online, offline] = cache.partition(v => v.online);
     */
    partition(fn) {
        if (typeof fn !== "function") {
            throw new CacheError("'fn' must be a function.");
        }

        const matched = this._deepClone();
        const unmatched = this._deepClone();

        for (const [key, value] of this.store.entries()) {
            const isMatch = fn(value, key, this);
            const target = isMatch ? matched : unmatched;
            target.set(key, this.cloneOnGet ? this._clone(value) : value);
        }

        return [matched, unmatched];
    }

    /**
     * Searches for entries by key or value using a string or RegExp.
     * @param {string | RegExp} query - Search string or regular expression.
     * @param {"key" | "value" | "both"} [where="key"] - Field to search in.
     * @returns {Array<[any, any]>} - Array of matching entries.
     * @example
     * cache.search("admin", "key");
     * cache.search(/@gmail\.com$/, "value");
     */
    search(query, where = "key") {
        const regex = typeof query === "string" ? new RegExp(query, "i") : query;

        /** @type {Array<[any, any]>} */
        const results = [];

        for (const [key, value] of this.store.entries()) {
            const testKey = where === "key" || where === "both";
            const testVal = where === "value" || where === "both";

            const keyMatch = testKey && regex.test(String(key));
            const valMatch = testVal && regex.test(JSON.stringify(value));

            if (keyMatch || valMatch) {
                results.push([key, value]);
            }
        }

        return results;
    }

    /**
     * Immediately expires the TTL for a given key (if set).
     * @param {any} key
     * @returns {boolean} - Whether TTL existed and was expired
     * @example
     * cache.expire("user:1");
     */
    expire(key) {
        if (!this.ttlMap.has(key)) return false;
        this.ttlMap.set(key, Date.now() - 1);
        return true;
    }


    /**
     * Returns a list of all defined tags.
     * @returns {Array<string>}
     */
    tags() {
        return [...this.tagMap.keys()];
    }

    /**
    * Returns detailed statistics about the cache usage.
    * @returns {{
    *   size: number,
    *   limit: number,
    *   hits: number,
    *   misses: number,
    *   evictions: number,
    *   strategy: string,
    *   tagCount: number,
    *   tags: string[],
    *   priority: { average: number }
    * }}
    * @example
    * cache.stats();
    * // => {
    * //   size: 24,
    * //   limit: 100,
    * //   hits: 85,
    * //   misses: 20,
    * //   evictions: 5,
    * //   strategy: 'LRU',
    * //   tagCount: 3,
    * //   tags: ['user', 'session', 'temp']
    * // }
    */
    stats() {
        return {
            size: this.store.size,
            limit: this.limit,
            hits: this.hits,
            misses: this.misses,
            evictions: this.evictions,
            strategy: this.strategy,
            tagCount: this.tagMap.size,
            tags: [...this.tagMap.keys()],
            priority: {
                average: this.priorityMap.size
                  ? [...this.priorityMap.values()].reduce((a, b) => a + b, 0) / this.priorityMap.size
                  : 0
              }
        };
    }

    /**
     * Resets cache statistics (hit/miss/evict counters).
     * @returns {void}
     */
    resetStats() {
        this.hits = 0;
        this.misses = 0;
        this.evictions = 0;
    }

    /**
     * Performs a deep clone of an object or array.
     * Note: Functions, Maps, Sets are not preserved deeply.
     * @param {any} value
     * @returns {any}
     */
    _clone(value) {
        if (typeof value !== "object" || value === null) return value;
        return JSON.parse(JSON.stringify(value));
    }

    /**
     * Creates a deep clone of the class
     * @returns {AlisaCache}
     */
    _deepClone() {
        return new AlisaCache({
            limit: this.limit,
            strategy: this.strategy,
            updateOnGet: this.updateOnGet,
            updateOnHas: this.updateOnHas,
            overWrite: this.overWrite,
            cloneOnGet: this.cloneOnGet,
            customEvict: this.customEvict || undefined
        });
    }

    /**
     * Creates a deep clone of the entire cache.
     * @returns {AlisaCache}
     * @example
     * const backup = cache.clone();
     */
    clone() {
        const snapshot = this.snapshot();
        const clone = this._deepClone();

        clone.loadSnapshot(
            JSON.parse(JSON.stringify(snapshot)) // Deep clone the snapshot
        );
        return clone;
    }

    /**
     * Returns advanced statistics including tag usage and TTL distributions.
     * @returns {{
     *   totalKeys: number,
     *   totalTags: number,
     *   mostUsedTags: string[],
     *   ttlEnabled: number,
     *   tagUsage: Record<string, number>
     * }}
     */
    statsExtended() {
        /** @type {Record<string, number>} */
        const tagUsage = {};
        for (const [tag, keys] of this.tagMap.entries()) {
            tagUsage[tag] = keys.size;
        }

        return {
            totalKeys: this.store.size,
            totalTags: this.tagMap.size,
            mostUsedTags: Object.entries(tagUsage).sort((a, b) => b[1] - a[1]).map(([tag]) => tag),
            ttlEnabled: this.ttlMap.size,
            tagUsage
        };
    }

    /**
     * Returns estimated memory usage and active TTL data.
     * @returns {{
     *   keyCount: number,
     *   avgValueSize: number,
     *   ttlCount: number,
     *   activeTTLKeys: string[]
     * }}
     */
    metrics() {
        const values = [...this.store.values()];
        const keyCount = this.store.size;
        const jsonSizes = values.map(v => JSON.stringify(v)?.length || 0);
        const totalSize = jsonSizes.reduce((a, b) => a + b, 0);
        const avgValueSize = keyCount ? totalSize / keyCount : 0;

        const activeTTLKeys = [...this.ttlMap.keys()].filter(k => this.ttlExpire(k) > 0);
        const ttlCount = activeTTLKeys.length;

        return {
            keyCount,
            avgValueSize,
            ttlCount,
            activeTTLKeys
        };
    }



    /**
     * Creates a serializable snapshot of the cache and all internal states.
     * @returns {Object}
     * @example
     * const dump = cache.snapshot();
     * fs.writeFileSync("./cache.json", JSON.stringify(dump, null, 2));
     */
    snapshot() {
        return {
            data: [...this.store.entries()],
            meta: [...this.meta.entries()],
            ttlMap: [...this.ttlMap.entries()],
            tagMap: [...this.tagMap.entries()].map(([tag, keys]) => [tag, [...keys]]),
            keyTags: [...this.keyTags.entries()].map(([key, tags]) => [key, [...tags]]),
            stats: {
                hits: this.hits,
                misses: this.misses,
                evictions: this.evictions
            }
        };
    }


    /**
     * Loads a snapshot into the cache. Overwrites existing data.
     * @param {Object} snapshot - The snapshot object to restore.
     * @returns {this}
     * @example
     * const dump = JSON.parse(fs.readFileSync("./cache.json"));
     * cache.loadSnapshot(dump);
     */
    loadSnapshot(snapshot) {
        if (!snapshot || typeof snapshot !== "object") throw new CacheError("Invalid snapshot");

        this.flush(); // clear existing data

        // Restore data from snapshot
        for (const [k, v] of snapshot.data || []) this.store.set(k, v);
        for (const [k, v] of snapshot.meta || []) this.meta.set(k, v);
        for (const [k, v] of snapshot.ttlMap || []) this.ttlMap.set(k, v);
        for (const [tag, keys] of snapshot.tagMap || []) this.tagMap.set(tag, new Set(keys));
        for (const [key, tags] of snapshot.keyTags || []) this.keyTags.set(key, new Set(tags));

        const { hits = 0, misses = 0, evictions = 0 } = snapshot.stats || {};
        this.hits = hits;
        this.misses = misses;
        this.evictions = evictions;

        return this;
    }

    /**
     * Converts the cache to a plain JSON-safe object.
     * @returns {Object}
     */
    toJSON() {
        return this.snapshot();
    }

    /**
     * Loads data from a JSON-safe snapshot object.
     * @param {Object} json
     * @returns {this}
     * @example
     * cache.fromJSON(JSON.parse(jsonString));
     */
    fromJSON(json) {
        return this.loadSnapshot(json);
    }

    // #endregion

    // #region Eviction Strategies
    /**
     * Execute eviction based on selected strategy.
     * @private
     */
    evict() {
        if (this.customEvict && typeof this.customEvict === "function") {
            this.customEvict(this.store, this.meta);
            return;
        }
    
        const entries = [...this.store.entries()];
        if (!entries.length) return;
    
        entries.sort(([aKey, aVal], [bKey, bVal]) => {
            const aPrio = this.priorityMap.get(aKey) || 0;
            const bPrio = this.priorityMap.get(bKey) || 0;
            if (aPrio !== bPrio) return aPrio - bPrio;
    
            // Secondary sort by strategy
            const aTime = this.meta.get(aKey) || 0;
            const bTime = this.meta.get(bKey) || 0;
            if (this.strategy === "LRU") return aTime - bTime;
            if (this.strategy === "MFU") return bTime - aTime;
            if (this.strategy === "FIFO") return aTime - bTime;
            return 0;
        });
    
        const [evictKey] = entries[0];
        this.delete(evictKey);
        this.evictions++;
    }
    // #endregion

    // #region Symbol Methods
    /**
     * Enables iteration over [key, value] pairs using `for...of`.
     * @returns {Iterator<[any, any]>}
     */
    [Symbol.iterator]() {
        return this.entries();
    }
    // #endregion
}

module.exports = AlisaCache;