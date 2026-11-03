import { hashPassword, isAdmin, json, noStorage, readJson, recordFailure, sameOrigin, tooManyAttempts, verifyPassword } from '../../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  if (!env.PF_KV) return noStorage();
  if (!sameOrigin(request)) return json({ error: 'Bad origin' }, 403);
  if (!await isAdmin(request, env)) return json({ error: 'Not logged in' }, 401);
  if (await tooManyAttempts(request, env)) return json({ error: 'Too many attempts. Try again later.' }, 429);

  let current, next;
  try { ({ current, next } = await readJson(request, 10_000)); } catch { return json({ error: 'Invalid request' }, 400); }
  if (typeof next !== 'string' || next.length < 8 || next.length > 200) {
    return json({ error: 'New password must be at least 8 characters' }, 400);
  }

  const raw = await env.PF_KV.get('auth');
  if (!raw || typeof current !== 'string' || !await verifyPassword(current, JSON.parse(raw))) {
    await recordFailure(request, env);
    return json({ error: 'Current password is wrong' }, 401);
  }

  await env.PF_KV.put('auth', JSON.stringify(await hashPassword(next)));
  return json({ ok: true });
}
