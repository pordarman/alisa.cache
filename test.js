// AlisaCache full feature test (assert-style)
const AlisaCache = require("./index");
const assert = require("assert");

const cache = new AlisaCache({ limit: 50, updateOnGet: true, cloneOnGet: true });

// SET / GET / HAS / DELETE
cache.set("key1", "value1");
assert.strictEqual(cache.get("key1"), "value1");
assert.strictEqual(cache.has("key1"), true);
assert.strictEqual(cache.delete("key1"), true);
assert.strictEqual(cache.has("key1"), false);

// TTL & EXPIRE
cache.set("temp", "value", { ttl: 1000 });
assert.ok(cache.ttlExpire("temp") > 0);
cache.expire("temp");
assert.strictEqual(cache.get("temp"), undefined);

// TAG SYSTEM
cache.set("a", 1, { tags: ["even"] });
cache.set("b", 2, { tags: ["even"] });
cache.set("c", 3, { tags: ["odd"] });
assert.strictEqual(cache.getByTag("even").length, 2);
assert.strictEqual(cache.deleteByTag("even"), 2);
assert.strictEqual(cache.tags().includes("odd"), true);

// FILTER / MAP / SOME / EVERY / REDUCE / FOR EACH
cache.set("x", 2);
cache.set("y", 4);
cache.set("z", 5);
const filtered = cache.filter((v) => v % 2 === 0);
assert.deepStrictEqual(filtered.keys().sort(), ["x", "y"]);
const mapped = cache.map(v => v * 2);
assert.deepStrictEqual(mapped.includes(10), true);
assert.strictEqual(cache.some(v => v === 4), true);
assert.strictEqual(cache.every(v => typeof v === "number"), true);
const sum = cache.reduce((acc, val) => acc + val, 0);
assert.strictEqual(sum, 14);

// GROUP BY / PARTITION
const grouped = cache.groupBy(v => (v % 2 === 0 ? "even" : "odd"));
assert.deepStrictEqual(grouped.get("even").length, 2);
const [evens, odds] = cache.partition(v => v % 2 === 0);
assert.deepStrictEqual(evens.keys().sort(), ["x", "y"]);
assert.deepStrictEqual(odds.keys(), ["c", "z"]);

// RENAME / SEARCH
cache.rename("z", "newZ");
assert.strictEqual(cache.get("newZ"), 5);
assert.strictEqual(cache.search("newZ").length, 1);

// SNAPSHOT / LOAD / JSON
const snap = cache.snapshot();
const clone = new AlisaCache().loadSnapshot(snap);
assert.deepStrictEqual(clone.get("newZ"), 5);
const json = cache.toJSON();
const fromJson = new AlisaCache().fromJSON(json);
assert.strictEqual(fromJson.get("newZ"), 5);

// METRICS / EXTENDED STATS
const metrics = cache.metrics();
assert.strictEqual(typeof metrics.keyCount, "number");
const stats = cache.statsExtended();
assert.strictEqual(typeof stats.totalTags, "number");

// EVENTS
let getEventCount = 0;
cache.on("get", ({ key }) => key && getEventCount++);
cache.get("x");
assert.strictEqual(getEventCount, 1);

// AUTO PRUNE
cache.set("expire", "soon", { ttl: 500 });
cache.autoPrune(200);
setTimeout(() => {
  cache.stopAutoPrune();
  assert.strictEqual(cache.has("expire"), false);
  console.log("[✓] All tests passed");
}, 1000);

// NAMESPACE
const ns = cache.namespace("guild:001");
ns.set("prefix", "!");
assert.strictEqual(ns.get("prefix"), "!");
assert.deepStrictEqual(cache.listNamespaces(), ["guild:001"]);
assert.strictEqual(cache.removeNamespace("guild:001"), true);