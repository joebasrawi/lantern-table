import { env } from 'cloudflare:workers';
export function database(): D1Database {
  if (!env.DB) throw new Error('Campaign storage is unavailable.');
  return env.DB;
}
