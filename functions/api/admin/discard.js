import { isAdmin, json, noStorage, sameOrigin } from '../../_lib/auth.js';

// Throws away the working draft; the editor goes back to what is published.
export async function onRequestPost({ request, env }) {
  if (!env.PF_KV) return noStorage();
  if (!sameOrigin(request)) return json({ error: 'Bad origin' }, 403);
  if (!await isAdmin(request, env)) return json({ error: 'Not logged in' }, 401);
  await env.PF_KV.delete('draft');
  return json({ ok: true });
}
