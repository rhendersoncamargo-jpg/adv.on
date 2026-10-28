import { env } from "cloudflare:workers";
import { createSession, sessionCookie, verifyPassword } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!env.DB) return Response.json({ error: "Banco indisponível" }, { status: 503 });
  const body = await request.json().catch(() => null) as { email?: string; password?: string } | null;
  const email = body?.email?.trim().toLowerCase() || "";
  const password = body?.password || "";
  const user = await env.DB.prepare("SELECT id, password_hash, password_salt, status FROM users WHERE lower(email) = lower(?)")
    .bind(email).first<{ id: string; password_hash: string | null; password_salt: string | null; status: string }>();
  const valid = Boolean(user?.password_hash && user.password_salt && user.status === "ATIVO" && await verifyPassword(password, user.password_hash, user.password_salt));
  if (!valid || !user) return Response.json({ error: "E-mail ou senha inválidos" }, { status: 401 });
  await env.DB.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), new Date().toISOString(), user.id).run();
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(await createSession(user.id)), "Cache-Control": "no-store" } });
}
