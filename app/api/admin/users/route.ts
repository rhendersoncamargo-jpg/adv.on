import { env } from "cloudflare:workers";
import { hashPassword, requireAdministrator, validatePassword } from "../../../../lib/auth";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  if (!env.DB || !(await requireAdministrator(request))) return json({ error: "Acesso exclusivo do administrador" }, 403);
  const users = await env.DB.prepare("SELECT id, email, name, role, status, created_at, updated_at, last_login_at FROM users ORDER BY name COLLATE NOCASE").all();
  return json({ users: users.results });
}

export async function POST(request: Request) {
  const administrator = await requireAdministrator(request);
  if (!env.DB || !administrator) return json({ error: "Acesso exclusivo do administrador" }, 403);
  const body = await request.json().catch(() => null) as { email?: string; name?: string; password?: string } | null;
  const email = body?.email?.trim().toLowerCase() || "";
  const name = body?.name?.trim().slice(0, 120) || "";
  const password = body?.password || "";
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Informe nome e e-mail válidos" }, 400);
  const passwordError = validatePassword(password);
  if (passwordError) return json({ error: passwordError }, 400);
  const credentials = await hashPassword(password);
  const now = new Date().toISOString();
  try {
    await env.DB.prepare("INSERT INTO users (id, email, name, role, status, password_hash, password_salt, created_at, updated_at) VALUES (?, ?, ?, 'USUARIO', 'ATIVO', ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), email, name, credentials.hash, credentials.salt, now, now).run();
    return json({ ok: true }, 201);
  } catch {
    return json({ error: "Este e-mail já está cadastrado" }, 409);
  }
}

export async function PUT(request: Request) {
  const administrator = await requireAdministrator(request);
  if (!env.DB || !administrator) return json({ error: "Acesso exclusivo do administrador" }, 403);
  const body = await request.json().catch(() => null) as { id?: string; status?: string; password?: string } | null;
  const id = body?.id || "";
  if (!id || id === administrator.id) return json({ error: "O administrador não pode bloquear o próprio acesso" }, 400);
  const now = new Date().toISOString();
  if (body?.password) {
    const passwordError = validatePassword(body.password);
    if (passwordError) return json({ error: passwordError }, 400);
    const credentials = await hashPassword(body.password);
    await env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ? AND role <> 'ADMINISTRADOR'")
      .bind(credentials.hash, credentials.salt, now, id).run();
  } else if (["ATIVO", "INATIVO"].includes(body?.status || "")) {
    await env.DB.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ? AND role <> 'ADMINISTRADOR'").bind(body?.status, now, id).run();
  } else return json({ error: "Alteração inválida" }, 400);
  return json({ ok: true });
}
