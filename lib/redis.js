// lib/redis.js
// Cliente Redis via TCP (node-redis), pra usar com Redis Cloud ou qualquer Redis padrao.
// Mantem a MESMA interface de antes: getRedis().set(key, objeto) e .get(key) -> objeto.
// Por isso as rotas (save, page) NAO mudam.
import { createClient } from "redis";

let _client = null;

// A Vercel injeta a URL com o nome do banco como prefixo (ex.: sorocaba_REDIS_URL).
// Aqui a gente acha sozinho qualquer env var que termine em REDIS_URL.
function findRedisUrl() {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  for (const [k, v] of Object.entries(process.env)) {
    if (/redis_url$/i.test(k) && typeof v === "string" && v.startsWith("redis")) {
      return v;
    }
  }
  return null;
}

async function getClient() {
  const url = findRedisUrl();
  if (!url) {
    throw new Error(
      "URL do Redis ausente. Defina REDIS_URL (ou conecte o banco Redis na Vercel) e faca redeploy."
    );
  }
  if (!_client) {
    _client = createClient({
      url,
      socket: { reconnectStrategy: (retries) => Math.min(retries * 50, 1000) },
    });
    // sem este handler, um erro de socket derruba a function.
    _client.on("error", (e) => console.error("Redis error:", e));
  }
  if (!_client.isOpen) await _client.connect();
  return _client;
}

// Wrapper com a mesma cara do @upstash/redis: set/get lidam com objetos via JSON,
// entao redis.set(key, { ... }) e redis.get(key) -> { ... } continuam funcionando igual.
export function getRedis() {
  return {
    async set(key, value) {
      const c = await getClient();
      const payload = typeof value === "string" ? value : JSON.stringify(value);
      return c.set(key, payload);
    },
    async get(key) {
      const c = await getClient();
      const raw = await c.get(key);
      if (raw == null) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    },
  };
}
