import { isAdmin, json } from '../_lib/auth.js';

// Tells the browser whether it is logged in and whether the admin password has been created yet.
export async function onRequestGet({ request, env }) {
  if (!env.PF_KV) return json({ admin: false, configured: false, storage: false });
  return json({
    admin: await isAdmin(request, env),
    configured: (await env.PF_KV.get('auth')) !== null,
    storage: true,
  });
}
