import { createECDH } from 'node:crypto';
export function pushConfig() {
  if (process.env.LANTERN_PUSH_ENABLED !== 'true') return null;
  const publicKey = process.env.LANTERN_VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.LANTERN_VAPID_PRIVATE_KEY || '';
  const subject =
    process.env.LANTERN_VAPID_SUBJECT || process.env.LANTERN_ORIGIN || '';
  try {
    const url = new URL(subject);
    if (
      !['mailto:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hash
    )
      return null;
    if (url.protocol === 'mailto:' && !/^[^\s@]+@[^\s@]+$/.test(url.pathname))
      return null;
    for (const [value, length] of [
      [publicKey, 65],
      [privateKey, 32],
    ] as const) {
      if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
      const bytes = Buffer.from(value, 'base64url');
      if (bytes.length !== length || bytes.toString('base64url') !== value)
        return null;
    }
    const pair = createECDH('prime256v1');
    pair.setPrivateKey(Buffer.from(privateKey, 'base64url'));
    if (pair.getPublicKey().toString('base64url') !== publicKey) return null;
    return { subject, publicKey, privateKey };
  } catch {
    return null;
  }
}
