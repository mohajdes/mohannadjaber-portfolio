// Project data lives in KV under "data". Until the first save, the static data/projects.json is the seed.

export async function readData(env, request) {
  if (env.PF_KV) {
    const raw = await env.PF_KV.get('data');
    if (raw) return JSON.parse(raw);
  }
  const seed = await env.ASSETS.fetch(new URL('/data/projects.json', request.url));
  return { ...(await seed.json()), rev: 0 };
}

const isUrl = value => typeof value === 'string' && value.length <= 2000 && /^https:\/\/\S+$/.test(value);
const clean = (value, max) => String(value ?? '').trim().slice(0, max);

// Never trust the client: rebuild the document from known fields only.
export function sanitizeData(body) {
  if (!body || !Array.isArray(body.projects) || !Array.isArray(body.categories)) throw new Error('Invalid data');

  const categories = [...new Set(body.categories.map(c => clean(c, 40)).filter(Boolean))].slice(0, 20);
  if (!categories.length) throw new Error('At least one category is required');

  const seen = new Set();
  const projects = body.projects.slice(0, 500).map(p => {
    const id = clean(p?.id, 80).replace(/[^a-zA-Z0-9_-]/g, '-');
    if (!id || seen.has(id)) throw new Error('Invalid or duplicate project id');
    seen.add(id);

    const project = {
      id,
      title: clean(p.title, 200),
      tag: clean(p.tag, 80),
      category: clean(p.category, 40),
      coverImage: isUrl(p.coverImage) ? p.coverImage : '',
      description: clean(p.description, 5000),
      images: (Array.isArray(p.images) ? p.images : []).filter(isUrl).slice(0, 300),
    };
    if (isUrl(p.video)) project.video = p.video;
    if (p.hidden) project.hidden = true;
    return project;
  });

  return { categories, projects };
}
