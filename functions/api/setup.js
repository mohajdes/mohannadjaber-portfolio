import { createSession, hashPassword, json, noStorage, readJson, sameOrigin, sessionCookie } from '../_lib/auth.js';

// One-time: the first password ever submitted becomes the admin password.
export async function onRequestPost({ request, env }) {
  if (!env.PF_KV) return noStorage();
  if (!sameOrigin(request)) return json({ error: 'Bad origin' }, 403);
  if (await env.PF_KV.get('auth')) return json({ error: 'Password already set' }, 403);

  let password;
  try { ({ password } = await readJson(request, 10_000)); } catch { return json({ error: 'Invalid request' }, 400); }
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
    return json({ error: 'Password must be at least 8 characters' }, 400);
  }

  await env.PF_KV.put('auth', JSON.stringify(await hashPassword(password)));
  const token = await createSession(env);
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token) });
}
