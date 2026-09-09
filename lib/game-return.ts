/** Only these two game destinations may survive a password sign-in. */
export function gameReturnPath(value: unknown) {
  return typeof value === 'string' &&
    /^\/\?(?:campaign|invite)=[a-zA-Z0-9-]{1,100}$/.test(value)
    ? value
    : '/';
}
export function gameSignInHref(path: string) {
  const params = new URLSearchParams(path.split('?')[1] || '');
  for (const key of ['invite', 'campaign']) {
    if (params.getAll(key).length !== 1) continue;
    const destination = gameReturnPath('/?' + key + '=' + params.get(key));
    if (destination !== '/')
      return '/api/auth?returnTo=' + encodeURIComponent(destination);
  }
  return '/api/auth';
}
