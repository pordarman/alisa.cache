## [![Alisa Logo](https://i.hizliresim.com/aug2sp9.png)](https://www.npmjs.com/package/alisa.cache/)

[![Package Name](https://img.shields.io/badge/alisa.cache?logo=npm&logoColor=red&label=Package%20name&color=red)](https://www.npmjs.com/package/alisa.cache/)
[![Package size](https://img.shields.io/bundlephobia/min/alisa.cache?label=Package%20size)](https://www.npmjs.com/package/alisa.cache/)
[![Version](https://img.shields.io/npm/v/alisa.cache.svg?label=Package%20version)](https://www.npmjs.com/package/alisa.cache/)
[![License](https://img.shields.io/npm/l/alisa.cache.svg?label=License)](https://www.npmjs.com/package/alisa.cache/)

[![NPM](https://nodei.co/npm/alisa.cache.png?downloads=true)](https://www.npmjs.com/package/alisa.cache/)

# Source file

- [alisa.cache](https://github.com/pordarman/alisa.cache)

<br>

# Creator(s)

- [Ali (Fearless Crazy)](https://github.com/pordarman)

<br>

# Social media accounts

- Ali: [Instagram](https://www.instagram.com/ali.celk/) - [Discord](https://discord.com/users/488839097537003521) - [Spotify](https://open.spotify.com/user/215jixxk4morzgq5mpzsmwwqa?si=41e0583b36f9449b)

<br>

# How to download?

- First we create a [node.js](https://nodejs.org/en/) file (If you have not downloaded [node.js](https://nodejs.org/en/) to computer before, you can download [node.js](https://nodejs.org/en/) by [clicking here](https://nodejs.org/en/))

- Then we open the PowerShell terminal by "shift + right click" on the folder of the file you created.

![Opening the PowerShell terminal](https://i.hizliresim.com/gbwgora.png)

- Then we write **npm i alisa.cache** and press enter.

- Download the alisa.cache module

- And now we have downloaded the **alisa.cache** module, congratulations 🎉🎉

<br>

# What is this module?

- This module is a **high-performance and flexible JavaScript caching system** designed to be modular and extendable

- Supports **TTL**, **LRU/FIFO/MFU**, **tagging**, **namespacing**, **event emitters**, **auto pruning**, and more

- Easily usable and thoroughly tested with assert-based and Jest-style tests

<br>

# Features

- ✅ LRU / FIFO / MFU / CUSTOM strategy support
- 🔁 TTL with auto cleanup support
- 🔖 Tag system (getByTag, deleteByTag, etc.)
- 📂 Namespaces for isolated sub-caches
- 🧠 Smart methods: `filter`, `map`, `groupBy`, `partition`, `reduce`
- 🔍 Utility methods: `rename`, `search`, `expire`, `ttl`
- 📦 Full snapshot + restore system
- 📡 `on()` and `emit()` support (custom event listeners)
- 🧪 Manual and automated testing support (`test.js`)

<br>

# How to use?

```js
const AlisaCache = require("alisa.cache");
const cache = new AlisaCache({ limit: 100 });

cache.set("user:1", { name: "Alice" }, { ttl: 5000, tags: ["admin"] });

console.log(cache.get("user:1")); // { name: "Alice" }
```

<br>

# How to test?

```bash
node test.js
```

If all goes well, you'll see:
```
[✓] All tests passed
```

<br>

# API Table

| Method                  | Description                             |
|------------------------|-----------------------------------------|
| `set(key, value, opts)`| Add item to cache                       |
| `get(key)`             | Retrieve value                          |
| `has(key)`             | Check existence                        |
| `delete(key)`          | Remove key                             |
| `ttl(key)`             | Remaining TTL in ms                    |
| `expire(key)`          | Instantly expire a key                 |
| `rename(old, new)`     | Rename a key                           |
| `filter(fn)`           | Return matching entries                |
| `groupBy(fn)`          | Group entries                          |
| `partition(fn)`        | Separate matching & non-matching       |
| `search(q, where?)`    | Find keys/values with RegExp support   |
| `namespace(name)`      | Get isolated cache segment             |
| `snapshot()`           | Export cache state                     |
| `loadSnapshot(obj)`    | Restore from snapshot                  |
| `on(event, cb)`        | Register listener                      |

<br>

Please do not forget to use it in the latest version for more **stable** and **performance** of the module!

<br>

# And finally

- If you want to support this module, if you request me on [github](https://github.com/pordarman), I will be happy to help you.

- Thank you for reading this far, i love you 💗

- See you in my next modules!

<br>

![lovee](https://gifdb.com/images/high/drake-heart-hands-aqm0moab2i6ocb44.webp)
