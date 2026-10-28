import { env } from "cloudflare:workers";
import { requireAdministrator } from "../../../../lib/auth";
import records from "../../../../data/useful-phone-import.json";

export const dynamic = "force-dynamic";

type ImportRecord = {
  id: string;
  name: string;
  category: string;
  phone: string;
  extension: string;
  city: string;
  notes: string;
};

function digits(value: string) {
  return value.replace(/\D/g, "");
}

export async function POST(request: Request) {
  if (!env.DB || !(await requireAdministrator(request))) {
    return Response.json({ error: "Acesso exclusivo do administrador" }, { status: 403 });
  }

  const existing = await env.DB.prepare("SELECT id, name, phone FROM useful_phones WHERE deleted_at IS NULL").all<{ id: string; name: string; phone: string }>();
  const known = new Set(existing.results.map((item) => `${item.name.toLocaleLowerCase("pt-BR")}|${digits(item.phone)}`));
  const pending = (records as ImportRecord[]).filter((item) => !known.has(`${item.name.toLocaleLowerCase("pt-BR")}|${digits(item.phone)}`));
  const now = new Date().toISOString();
  let imported = 0;

  for (let index = 0; index < pending.length; index += 50) {
    const chunk = pending.slice(index, index + 50);
    const statements = chunk.map((item) => env.DB.prepare("INSERT OR IGNORE INTO useful_phones (id, name, category, phone, extension, city, notes, entity_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)")
      .bind(item.id, item.name, item.category, item.phone, item.extension, item.city, item.notes, now, now));
    const results = await env.DB.batch(statements);
    imported += results.reduce((total, result) => total + Number(result.meta.changes || 0), 0);
  }

  return Response.json({ imported, skipped: records.length - imported, total: records.length }, { headers: { "Cache-Control": "no-store" } });
}
