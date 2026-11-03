// Password + session helpers shared by the /api functions.
// The admin password is chosen by the site owner on first visit and stored only as a salted PBKDF2 hash in KV.

const enc = new TextEncoder();
const ITERATIONS = 100000; // Cloudflare Workers allows at most 100k for PBKDF2
const COOKIE = 'pf_session';
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days

const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const fromHex = hex => Uint8Array.from(hex.match(/../g) || [], h => parseInt(h, 16));

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });

export const noStorage = () => json({ error: 'Storage is not configured yet (missing PF_KV binding).' }, 503);

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return { salt: toHex(salt), hash: toHex(hash), iterations: ITERATIONS };
}

export async function verifyPassword(password, record) {
  const hash = await pbkdf2(password, fromHex(record.salt), record.iterations);
  return safeEqual(hash, fromHex(record.hash));
}

async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export async function createSession(env) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  await env.PF_KV.put('sess:' + await sha256Hex(token), '1', { expirationTtl: SESSION_TTL });
  return token;
}

export const sessionCookie = (token, maxAge = SESSION_TTL) =>
  `${COOKIE}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Strict`;

function readToken(request) {
  const match = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)pf_session=([a-f0-9]{64})/);
  return match ? match[1] : null;
}

export async function isAdmin(request, env) {
  const token = readToken(request);
  if (!token) return false;
  return (await env.PF_KV.get('sess:' + await sha256Hex(token))) !== null;
}

export async function destroySession(request, env) {
  const token = readToken(request);
  if (token) await env.PF_KV.delete('sess:' + await sha256Hex(token));
}

// Extra CSRF guard on top of SameSite=Strict: browsers always send Origin on cross-site writes.
export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

// Login throttling: 8 failures per 15 minutes per IP.
export async function tooManyAttempts(request, env) {
  const key = 'rl:' + (request.headers.get('CF-Connecting-IP') || 'unknown');
  return (parseInt(await env.PF_KV.get(key), 10) || 0) >= 8;
}
export async function recordFailure(request, env) {
  const key = 'rl:' + (request.headers.get('CF-Connecting-IP') || 'unknown');
  const count = (parseInt(await env.PF_KV.get(key), 10) || 0) + 1;
  await env.PF_KV.put(key, String(count), { expirationTtl: 900 });
}

export async function readJson(request, maxBytes = 2_000_000) {
  const length = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (length > maxBytes) throw new Error('Request too large');
  return request.json();
}
