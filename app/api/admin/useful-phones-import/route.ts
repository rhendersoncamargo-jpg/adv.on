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

  const existing = await env.DB.prepare("SELECT id, name, category, phone, extension, city, notes FROM useful_phones WHERE deleted_at IS NULL").all<ImportRecord>();
  const known = new Map(existing.results.map((item) => [`${item.name.toLocaleLowerCase("pt-BR")}|${digits(item.phone)}`, item]));
  const pending = (records as ImportRecord[]).filter((item) => !known.has(`${item.name.toLocaleLowerCase("pt-BR")}|${digits(item.phone)}`));
  const updates = (records as ImportRecord[]).flatMap((item) => {
    const current = known.get(`${item.name.toLocaleLowerCase("pt-BR")}|${digits(item.phone)}`);
    if (!current || (current.category === item.category && current.extension === item.extension && current.city === item.city && current.notes === item.notes)) return [];
    return [{ ...item, id: current.id }];
  });
  const now = new Date().toISOString();
  let imported = 0;
  let updated = 0;

  for (let index = 0; index < pending.length; index += 50) {
    const chunk = pending.slice(index, index + 50);
    const statements = chunk.map((item) => env.DB.prepare("INSERT OR IGNORE INTO useful_phones (id, name, category, phone, extension, city, notes, entity_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)")
      .bind(item.id, item.name, item.category, item.phone, item.extension, item.city, item.notes, now, now));
    const results = await env.DB.batch(statements);
    imported += results.reduce((total, result) => total + Number(result.meta.changes || 0), 0);
  }

  for (let index = 0; index < updates.length; index += 50) {
    const chunk = updates.slice(index, index + 50);
    const statements = chunk.map((item) => env.DB.prepare("UPDATE useful_phones SET category = ?, extension = ?, city = ?, notes = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
      .bind(item.category, item.extension, item.city, item.notes, now, item.id));
    const results = await env.DB.batch(statements);
    updated += results.reduce((total, result) => total + Number(result.meta.changes || 0), 0);
  }

  return Response.json({ imported, updated, skipped: records.length - imported - updated, total: records.length }, { headers: { "Cache-Control": "no-store" } });
}
