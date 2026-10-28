import { getSessionUser } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return Response.json({ user }, { headers: { "Cache-Control": "no-store" } });
}
