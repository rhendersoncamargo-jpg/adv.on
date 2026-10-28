import { env } from "cloudflare:workers";
import { ADMIN_EMAIL, createSession, ensureInitialAdmin, hashPassword, sessionCookie, validatePassword, verifySetupToken } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!env.DB) return Response.json({ error: "Banco indisponível" }, { status: 503 });
  const body = await request.json().catch(() => null) as { email?: string; password?: string; token?: string } | null;
  const email = body?.email?.trim().toLowerCase() || "";
  const password = body?.password || "";
  if (email !== ADMIN_EMAIL || !(await verifySetupToken(body?.token || ""))) return Response.json({ error: "Código de ativação inválido" }, { status: 403 });
  const passwordError = validatePassword(password);
  if (passwordError) return Response.json({ error: passwordError }, { status: 400 });
  await ensureInitialAdmin();
  const admin = await env.DB.prepare("SELECT id, password_hash FROM users WHERE email = ?").bind(ADMIN_EMAIL).first<{ id: string; password_hash: string | null }>();
  if (!admin || admin.password_hash) return Response.json({ error: "O administrador já foi ativado" }, { status: 409 });
  const credentials = await hashPassword(password);
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, status = 'ATIVO', updated_at = ?, last_login_at = ? WHERE id = ?")
    .bind(credentials.hash, credentials.salt, now, now, admin.id).run();
  const token = await createSession(admin.id);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(token), "Cache-Control": "no-store" } });
}
