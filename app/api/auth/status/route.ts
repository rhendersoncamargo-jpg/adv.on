import { env } from "cloudflare:workers";
import { ADMIN_EMAIL, ensureInitialAdmin } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!env.DB) return Response.json({ error: "Banco indisponível" }, { status: 503 });
  await ensureInitialAdmin();
  const admin = await env.DB.prepare("SELECT password_hash FROM users WHERE email = ?").bind(ADMIN_EMAIL).first<{ password_hash: string | null }>();
  return Response.json({ needsSetup: !admin?.password_hash, adminEmail: ADMIN_EMAIL }, { headers: { "Cache-Control": "no-store" } });
}
