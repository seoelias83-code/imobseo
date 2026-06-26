import { Redis } from "@upstash/redis";

// Conexao preguiçosa: so instancia quando uma request usa.
// Assim o build da Vercel passa MESMO antes de conectar o Upstash,
// e nao quebra na primeira subida.
let _redis = null;

export function getRedis() {
  if (_redis) return _redis;
  // aceita tanto as env vars que a Vercel injeta (KV_REST_API_*)
  // quanto os nomes nativos do Upstash (UPSTASH_REDIS_REST_*).
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Credenciais do Upstash Redis ausentes. Conecte a integracao Upstash Redis na Vercel (Storage) e faca redeploy."
    );
  }
  _redis = new Redis({ url, token });
  return _redis;
}
