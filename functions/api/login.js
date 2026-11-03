import { createSession, json, noStorage, readJson, recordFailure, sameOrigin, sessionCookie, tooManyAttempts, verifyPassword } from '../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  if (!env.PF_KV) return noStorage();
  if (!sameOrigin(request)) return json({ error: 'Bad origin' }, 403);
  if (await tooManyAttempts(request, env)) return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);

  let password;
  try { ({ password } = await readJson(request, 10_000)); } catch { return json({ error: 'Invalid request' }, 400); }

  const raw = await env.PF_KV.get('auth');
  if (!raw) return json({ error: 'No password set yet' }, 409);

  if (typeof password !== 'string' || !await verifyPassword(password, JSON.parse(raw))) {
    await recordFailure(request, env);
    return json({ error: 'Wrong password' }, 401);
  }

  const token = await createSession(env);
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token) });
}
