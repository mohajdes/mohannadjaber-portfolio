import { destroySession, json, sameOrigin, sessionCookie } from '../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'Bad origin' }, 403);
  if (env.PF_KV) await destroySession(request, env);
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}
