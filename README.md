# Mohannad Jaber portfolio

Static site on Cloudflare Pages, with a small built-in editor.

- **Edit the site:** go to `/admin/`, log in, then use the Work and project pages as normal. Editing tools appear on top of them and every change saves automatically.
- **Data:** projects live in Cloudflare KV (binding `PF_KV`, set in `wrangler.toml`). `data/projects.json` is only the starting data used until the first save, and the fallback if the API is unreachable.
- **API:** `functions/api/*` (Pages Functions). Public pages read `/api/projects`; the editor uses `/api/admin/*` behind a password session cookie.
- **Images:** uploaded from the browser to Cloudinary (`portfolio_unsigned` preset) and resized on delivery by `optimizeImage()` in `js/main.js`.

## Forgot the admin password

In the Cloudflare dashboard open Workers & Pages → KV → `portfolio-data` and delete the `auth` key. The next visit to `/admin/` lets you create a new password (do it right away).
