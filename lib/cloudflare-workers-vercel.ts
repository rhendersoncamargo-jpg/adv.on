// Build-time compatibility for Vercel. Requests to the D1-backed routes are
// rewritten to the Cloudflare backend before these handlers are reached.
export const env = {} as Cloudflare.Env;
