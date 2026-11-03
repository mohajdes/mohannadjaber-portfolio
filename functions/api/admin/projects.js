import { isAdmin, json, noStorage, readJson, sameOrigin } from '../../_lib/auth.js';
import { hasChanges, readData, readDraft, sanitizeData } from '../../_lib/data.js';

// Admin: the working copy (drafts included). `changed` says whether it differs from the published site.
export async function onRequestGet({ request, env }) {
  if (!env.PF_KV) return noStorage();
  if (!await isAdmin(request, env)) return json({ error: 'Not logged in' }, 401);
  const published = await readData(env, request);
  const draft = await readDraft(env, published);
  return json({ ...draft, changed: hasChanges(draft, published) });
}

// Saves to the draft only. Visitors see nothing until /api/admin/publish.
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
  const published = await readData(env, request);
  const current = await readDraft(env, published);
  const rev = current.rev || 0;
  if (typeof body.baseRev === 'number' && body.baseRev !== rev) return json({ error: 'Changed elsewhere', rev }, 409);

  const next = { ...clean, rev: rev + 1 };
  await env.PF_KV.put('draft', JSON.stringify(next));
  return json({ ok: true, rev: next.rev, changed: hasChanges(next, published) });
}
