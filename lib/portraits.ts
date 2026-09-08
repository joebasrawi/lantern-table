import { env } from 'cloudflare:workers';
export function portraits(): R2Bucket {
  if (!env.PORTRAITS) throw new Error('Portrait storage is unavailable.');
  return env.PORTRAITS;
}
