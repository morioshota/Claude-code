/* 同期テスト用の疑似Redis(api/sync.js の makeRedis と同じ口) */
export function mockRedis() {
  const m = new Map();
  return {
    m,
    get: async (k) => (m.has(k) ? m.get(k) : null),
    set: async (k, v) => { m.set(k, String(v)); return "OK"; },
    setnx: async (k, v) => { if (m.has(k)) return null; m.set(k, String(v)); return "OK"; },
    getdel: async (k) => { const v = m.has(k) ? m.get(k) : null; m.delete(k); return v; },
    incr: async (k) => { const n = Number(m.get(k) || 0) + 1; m.set(k, String(n)); return n; },
    mget: async (keys) => keys.map((k) => (m.has(k) ? m.get(k) : null)),
    cas: async (expected, pairs) => {
      const v = Number(m.get("kd:ver") || 0);
      if (v !== Number(expected)) return { ok: false, version: v };
      pairs.forEach(([k, val]) => { if (val === "__DEL__") m.delete(k); else m.set(k, val); });
      m.set("kd:ver", String(v + 1));
      return { ok: true, version: v + 1 };
    },
  };
}
