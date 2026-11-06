import { searchDocument, SearchIndex } from './search-core.js';
// src/search-worker.js
var index = new SearchIndex();
var files = /* @__PURE__ */ new Map();
var dirty = /* @__PURE__ */ new Set();
var library = "";
var db;
var boot = Promise.resolve();
var reading = false;
var processed = 0;
var cacheHits = 0;
var failures = 0;
var pause = () => new Promise((resolve) => setTimeout(resolve, 0));
var newestUI = 0;
var queuedUI = null;
var queryJob = false;
var cacheRevision = -1;
var queries = /* @__PURE__ */ new Map();
async function runQuery(message, cancelled = () => false) {
  const revision = index.revision, key2 = message.limit + "\0" + message.query.trim();
  if (cacheRevision !== revision) {
    queries.clear();
    cacheRevision = revision;
  }
  let result = queries.get(key2);
  if (!result) {
    result = await index.searchAsync(message.query, message.limit, cancelled);
    if (!result.cancelled && index.revision === revision) {
      queries.set(key2, result);
      if (queries.size > 24) queries.delete(queries.keys().next().value);
    }
  }
  postMessage({ type: "results", id: message.id, ...result });
}
function queueQuery(message) {
  if (message.channel !== "ui") {
    runQuery(message).catch((error) => postMessage({ type: "error", id: message.id, error: error.message }));
    return;
  }
  newestUI = message.id;
  if (queuedUI) postMessage({ type: "results", id: queuedUI.id, cancelled: true });
  queuedUI = message;
  if (queryJob) return;
  queryJob = true;
  setTimeout(async () => {
    try {
      while (queuedUI) {
        const next = queuedUI;
        queuedUI = null;
        try {
          await runQuery(next, () => next.id !== newestUI);
        } catch (error) {
          postMessage({ type: "error", id: next.id, error: error.message });
        }
      }
    } finally {
      queryJob = false;
    }
  }, 0);
}
var key = (path) => library + "\0" + path;
function openCache() {
  return new Promise((resolve) => {
    try {
      const request2 = indexedDB.open("romus-search-v1", 1);
      request2.onupgradeneeded = () => request2.result.createObjectStore("documents", { keyPath: "key" });
      request2.onsuccess = () => resolve(request2.result);
      request2.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
function cached() {
  return new Promise((resolve) => {
    if (!db) return resolve([]);
    try {
      const request2 = db.transaction("documents").objectStore("documents").getAll(IDBKeyRange.bound(key(""), key("\uFFFF")));
      request2.onsuccess = () => resolve(request2.result);
      request2.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}
function persist(doc, path) {
  if (!db) return;
  try {
    const store = db.transaction("documents", "readwrite").objectStore("documents");
    if (doc && doc.text.length < 1e6) store.put({ key: key(path), doc });
    else store.delete(key(path));
  } catch {
  }
}
var progress = () => postMessage({ type: "progress", indexed: index.readyCount, total: files.size, cacheHits, failures, busy: reading || dirty.size > 0 });
function request() {
  if (reading || !dirty.size) {
    progress();
    return;
  }
  const batch = [];
  for (const path of dirty) {
    dirty.delete(path);
    const file = files.get(path);
    if (!file) continue;
    if (file.kind === "file") {
      const doc = searchDocument(file);
      index.put(doc);
      persist(doc, path);
      continue;
    }
    batch.push(file);
    if (batch.length === 2) break;
  }
  if (!batch.length) {
    progress();
    if (dirty.size) setTimeout(request, 0);
    return;
  }
  reading = true;
  postMessage({ type: "read", files: batch });
}
async function init(message) {
  library = message.library;
  for (const file of message.files) files.set(file.path, file);
  db = await openCache();
  const saved = await cached(), cachedMap = new Map(saved.map((row) => [row.doc.path, row.doc]));
  let start = performance.now();
  for (const file of files.values()) {
    const old = cachedMap.get(file.path);
    if (old?.stamp === file.stamp) {
      index.put(old);
      cacheHits++;
    } else {
      index.put({ ...searchDocument({ ...file, kind: "file" }), kind: file.kind, pending: true });
      dirty.add(file.path);
    }
    if (performance.now() - start > 5) {
      await pause();
      start = performance.now();
    }
  }
  for (const row of saved) if (!files.has(row.doc.path)) persist(null, row.doc.path);
  postMessage({ type: "ready" });
  request();
}
onmessage = (event) => {
  const message = event.data;
  if (message.type === "init") {
    boot = init(message).catch((error) => postMessage({ type: "fatal", error: error.message }));
    return;
  }
  boot.then(async () => {
    if (message.type === "cancel-ui") {
      newestUI = 0;
      if (queuedUI) postMessage({ type: "results", id: queuedUI.id, cancelled: true });
      queuedUI = null;
      return;
    }
    if (message.type === "query") {
      queueQuery(message);
      return;
    }
    if (message.type === "change") {
      for (const old of message.remove || []) {
        files.delete(old);
        dirty.delete(old);
        index.remove(old);
        persist(null, old);
      }
      for (const file of message.files || []) {
        if (files.get(file.path)?.stamp === file.stamp) continue;
        files.set(file.path, file);
        if (!index.docs.has(file.path)) index.put({ ...searchDocument({ ...file, kind: "file" }), kind: file.kind, pending: true });
        dirty.add(file.path);
      }
      request();
      return;
    }
    if (message.type === "raw") {
      let start = performance.now();
      for (const item of message.items) {
        const current = files.get(item.meta.path);
        if (!current || current.stamp !== item.meta.stamp) continue;
        try {
          if (item.error) throw Error(item.error);
          const doc = searchDocument(current, item.raw);
          index.put(doc);
          persist(doc, doc.path);
          processed++;
        } catch {
          failures++;
          index.put({ ...searchDocument({ ...current, kind: "file" }), kind: current.kind });
        }
        if (performance.now() - start > 5) {
          await pause();
          start = performance.now();
        }
      }
      reading = false;
      progress();
      request();
    }
  }).catch((error) => postMessage({ type: "error", id: message.id, error: error.message }));
};
