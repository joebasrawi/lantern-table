import { railwayUser } from '#platform-auth';
import { getChatGPTUser } from '../app/chatgpt-auth';
import { cookies, headers } from 'next/headers';
import { env } from 'cloudflare:workers';
import { accessConfig, verifyAccessToken } from './access-auth';
export const localNames: Record<string, string> = {
  local_1: 'Joe',
  local_2: 'Mara',
  local_3: 'Felix',
};
export async function currentUser() {
  if (__LANTERN_RAILWAY__)
    return railwayUser((await cookies()).get('lantern_session')?.value);
  if (__LANTERN_STANDALONE__) {
    const token = (await headers()).get('Cf-Access-Jwt-Assertion');
    if (!token) return null;
    const config = accessConfig(env.ACCESS_ISSUER, env.ACCESS_AUDIENCE);
    try {
      return await verifyAccessToken(token, config);
    } catch {
      return null;
    }
  }
  const user = await getChatGPTUser();
  if (user)
    return {
      id: user.userId,
      name: user.fullName || user.displayName.split('@')[0],
    };
  if (import.meta.env.DEV) {
    const id = (await cookies()).get('lantern_local')?.value;
    if (id && localNames[id]) return { id, name: localNames[id] };
  }
  return null;
}
