import { isAdmin, json, noStorage, readJson, sameOrigin } from '../../_lib/auth.js';
import { readData, sanitizeData } from '../../_lib/data.js';

// Admin: everything, including drafts.
export async function onRequestGet({ request, env }) {
  if (!env.PF_KV) return noStorage();
  if (!await isAdmin(request, env)) return json({ error: 'Not logged in' }, 401);
  return json(await readData(env, request));
}

export async function onRequestPut({ request, env }) {
  if (!env.PF_KV) return noStorage();
  if (!sameOrigin(request)) return json({ error: 'Bad origin' }, 403);
  if (!await isAdmin(request, env)) return json({ error: 'Not logged in' }, 401);

  let body, clean;
  try {
    body = await readJson(request);
    clean = sanitizeData(body);
  } catch (err) {
    return json({ error: err.message }, 400);
  }

  // Guard against a stale tab overwriting newer changes.
  const current = await readData(env, request);
  const rev = current.rev || 0;
  if (typeof body.baseRev === 'number' && body.baseRev !== rev) return json({ error: 'Changed elsewhere', rev }, 409);

  const next = { ...clean, rev: rev + 1 };
  await env.PF_KV.put('data', JSON.stringify(next));
  return json({ ok: true, rev: next.rev });
}
