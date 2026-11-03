import { isAdmin, json, noStorage, readJson, sameOrigin } from '../../_lib/auth.js';
import { readData } from '../../_lib/data.js';

// Copies the working draft to the live data, then clears the draft.
export async function onRequestPost({ request, env }) {
  if (!env.PF_KV) return noStorage();
  if (!sameOrigin(request)) return json({ error: 'Bad origin' }, 403);
  if (!await isAdmin(request, env)) return json({ error: 'Not logged in' }, 401);

  let body = {};
  try { body = await readJson(request, 10_000); } catch { /* body is optional */ }

  const raw = await env.PF_KV.get('draft');
  if (!raw) return json({ ok: true, rev: (await readData(env, request)).rev || 0 });

  const draft = JSON.parse(raw);
  if (typeof body.baseRev === 'number' && body.baseRev !== (draft.rev || 0)) {
    return json({ error: 'Changed elsewhere', rev: draft.rev }, 409);
  }

  await env.PF_KV.put('data', raw);
  await env.PF_KV.delete('draft');
  return json({ ok: true, rev: draft.rev });
}
