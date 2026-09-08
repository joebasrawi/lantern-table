import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
export type AccessConfig = { issuer: string; audience: string };
const keys = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export function accessConfig(issuer: unknown, audience: unknown): AccessConfig {
  if (
    typeof issuer !== 'string' ||
    !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) ||
    typeof audience !== 'string' ||
    !audience.trim()
  )
    throw new Error(
      'Configure ACCESS_ISSUER and ACCESS_AUDIENCE before accepting players.',
    );
  return { issuer, audience };
}
export async function verifyAccessToken(
  token: string,
  config: AccessConfig,
  key?: JWTVerifyGetKey,
) {
  if (!key) {
    if (!keys.has(config.issuer))
      keys.set(
        config.issuer,
        createRemoteJWKSet(new URL(`${config.issuer}/cdn-cgi/access/certs`), {
          timeoutDuration: 5000,
        }),
      );
    key = keys.get(config.issuer)!;
  }
  const { payload } = await jwtVerify(token, key, {
    issuer: config.issuer,
    audience: config.audience,
    algorithms: ['RS256'],
    requiredClaims: ['sub', 'email', 'exp', 'iat'],
    clockTolerance: 5,
  });
  if (
    typeof payload.sub !== 'string' ||
    !payload.sub ||
    typeof payload.email !== 'string' ||
    !payload.email.includes('@')
  )
    throw new Error('A player identity is required.');
  return {
    id: `access:${config.issuer}:${payload.sub}`,
    name: payload.email.split('@')[0].slice(0, 80),
  };
}
