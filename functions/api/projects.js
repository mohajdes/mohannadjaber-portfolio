import { readData } from '../_lib/data.js';

// Public: published projects only.
export async function onRequestGet({ request, env }) {
  const data = await readData(env, request);
  const body = { categories: data.categories, projects: data.projects.filter(p => !p.hidden) };
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=30' },
  });
}
