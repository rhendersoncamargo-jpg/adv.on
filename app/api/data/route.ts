import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";
const ADMIN_EMAIL = "escritorio@otonnasser.com.br";
const resources = ["entities", "categories", "relationships", "appointments", "diary"] as const;
type Resource = (typeof resources)[number];

function response(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
function database() {
  if (!env.DB) throw new Error("Banco de dados indisponível");
  return env.DB;
}
function clean(value: unknown, max = 2000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function optional(value: unknown): string | null {
  const result = clean(value, 120);
  return result || null;
}
function validResource(value: string | null): value is Resource {
  return resources.includes(value as Resource);
}
async function requireUser() {
  return getChatGPTUser();
}
async function ensureAdmin(db: D1Database) {
  await db.prepare("INSERT OR IGNORE INTO users (id, email, name, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind("initial-administrator", ADMIN_EMAIL, "Administrador", "ADMINISTRADOR", "pendente_autenticacao", new Date().toISOString()).run();
}

export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) return response({ error: "Acesso não autenticado" }, 401);
  const db = database();
  await ensureAdmin(db);
  const resource = new URL(request.url).searchParams.get("resource");
  if (resource === "bootstrap") {
    const [entities, categories, relationships, appointments, diary, administrator] = await Promise.all([
      db.prepare("SELECT * FROM entities WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE").all(),
      db.prepare("SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE").all(),
      db.prepare("SELECT r.*, a.name AS source_name, b.name AS target_name FROM relationships r JOIN entities a ON a.id = r.source_id JOIN entities b ON b.id = r.target_id WHERE r.deleted_at IS NULL AND a.deleted_at IS NULL AND b.deleted_at IS NULL ORDER BY r.created_at DESC").all(),
      db.prepare("SELECT a.*, e.name AS entity_name FROM appointments a LEFT JOIN entities e ON e.id = a.entity_id WHERE a.deleted_at IS NULL ORDER BY a.starts_at ASC").all(),
      db.prepare("SELECT * FROM diary_entries WHERE deleted_at IS NULL ORDER BY occurred_at DESC").all(),
      db.prepare("SELECT id, email, name, role, status FROM users WHERE id = ?").bind("initial-administrator").first(),
    ]);
    const [mentions, categoryLinks] = await Promise.all([
      db.prepare("SELECT m.entry_id, m.entity_id, e.name, e.kind FROM diary_mentions m JOIN entities e ON e.id = m.entity_id WHERE e.deleted_at IS NULL").all(),
      db.prepare("SELECT entity_id, category_id FROM entity_categories").all(),
    ]);
    return response({ entities: entities.results, categories: categories.results, categoryLinks: categoryLinks.results, relationships: relationships.results, appointments: appointments.results, diary: diary.results, mentions: mentions.results, administrator, viewer: { email: user.email, name: user.displayName } });
  }
  if (!validResource(resource)) return response({ error: "Recurso desconhecido" }, 400);
  const table = resource === "diary" ? "diary_entries" : resource;
  const rows = await db.prepare(`SELECT * FROM ${table} WHERE deleted_at IS NULL`).all();
  return response(rows.results);
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return response({ error: "Acesso não autenticado" }, 401);
  const db = database();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return response({ error: "Dados inválidos" }, 400);
  const resource = clean(body.resource, 30);
  if (!validResource(resource)) return response({ error: "Recurso desconhecido" }, 400);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    if (resource === "categories") {
      const name = clean(body.name, 100);
      if (!name) return response({ error: "Informe o nome da categoria" }, 400);
      await db.prepare("INSERT INTO categories (id, name, description, created_at) VALUES (?, ?, ?, ?)").bind(id, name, clean(body.description), now).run();
    } else if (resource === "entities") {
      const name = clean(body.name, 160);
      const kind = clean(body.kind, 20);
      if (!name || !["Pessoa", "Empresa"].includes(kind)) return response({ error: "Informe nome e tipo válidos" }, 400);
      await db.prepare("INSERT INTO entities (id, kind, name, email, phone, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, kind, name, clean(body.email, 160), clean(body.phone, 40), clean(body.notes), now, now).run();
      const ids = Array.isArray(body.category_ids) ? [...new Set(body.category_ids.map((v) => clean(v, 80)).filter(Boolean))] : [];
      for (const categoryId of ids) await db.prepare("INSERT INTO entity_categories (id, entity_id, category_id) VALUES (?, ?, ?)").bind(crypto.randomUUID(), id, categoryId).run();
    } else if (resource === "relationships") {
      const source = clean(body.source_id, 80), target = clean(body.target_id, 80), label = clean(body.label, 100);
      if (!source || !target || source === target || !label) return response({ error: "Selecione dois contatos diferentes e informe o vínculo" }, 400);
      await db.prepare("INSERT INTO relationships (id, source_id, target_id, label, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id, source, target, label, clean(body.notes), now).run();
    } else if (resource === "appointments") {
      const title = clean(body.title, 160), starts = clean(body.starts_at, 40);
      if (!title || !starts || Number.isNaN(Date.parse(starts))) return response({ error: "Informe título e data válidos" }, 400);
      await db.prepare("INSERT INTO appointments (id, title, kind, starts_at, ends_at, location, entity_id, status, outcome, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, title, clean(body.kind, 60) || "Reunião", starts, optional(body.ends_at), clean(body.location, 160), optional(body.entity_id), clean(body.status, 40) || "Agendado", clean(body.outcome), clean(body.notes), now, now).run();
    } else {
      const bodyText = clean(body.body, 10000), occurred = clean(body.occurred_at, 40);
      if (!bodyText || !occurred || Number.isNaN(Date.parse(occurred))) return response({ error: "Informe o registro e a data" }, 400);
      await db.prepare("INSERT INTO diary_entries (id, occurred_at, body, author_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id, occurred, bodyText, user.email, now, now).run();
      const ids = Array.isArray(body.entity_ids) ? [...new Set(body.entity_ids.map((v) => clean(v, 80)).filter(Boolean))] : [];
      for (const entityId of ids) await db.prepare("INSERT INTO diary_mentions (id, entry_id, entity_id) VALUES (?, ?, ?)").bind(crypto.randomUUID(), id, entityId).run();
    }
    return response({ id }, 201);
  } catch (error) {
    console.error("Erro ao criar registro", error);
    return response({ error: "Não foi possível salvar. Verifique os campos e vínculos." }, 400);
  }
}

export async function PUT(request: Request) {
  const user = await requireUser();
  if (!user) return response({ error: "Acesso não autenticado" }, 401);
  const db = database();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return response({ error: "Dados inválidos" }, 400);
  const resource = clean(body.resource, 30), id = clean(body.id, 80);
  if (!validResource(resource) || !id) return response({ error: "Registro inválido" }, 400);
  const now = new Date().toISOString();
  try {
    if (resource === "categories") {
      const name = clean(body.name, 100); if (!name) return response({ error: "Informe o nome" }, 400);
      await db.prepare("UPDATE categories SET name = ?, description = ? WHERE id = ? AND deleted_at IS NULL").bind(name, clean(body.description), id).run();
    } else if (resource === "entities") {
      const name = clean(body.name, 160), kind = clean(body.kind, 20);
      if (!name || !["Pessoa", "Empresa"].includes(kind)) return response({ error: "Nome ou tipo inválido" }, 400);
      await db.prepare("UPDATE entities SET kind = ?, name = ?, email = ?, phone = ?, notes = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(kind, name, clean(body.email, 160), clean(body.phone, 40), clean(body.notes), now, id).run();
      await db.prepare("DELETE FROM entity_categories WHERE entity_id = ?").bind(id).run();
      const ids = Array.isArray(body.category_ids) ? [...new Set(body.category_ids.map((v) => clean(v, 80)).filter(Boolean))] : [];
      for (const categoryId of ids) await db.prepare("INSERT INTO entity_categories (id, entity_id, category_id) VALUES (?, ?, ?)").bind(crypto.randomUUID(), id, categoryId).run();
    } else if (resource === "appointments") {
      const title = clean(body.title, 160), starts = clean(body.starts_at, 40);
      if (!title || !starts || Number.isNaN(Date.parse(starts))) return response({ error: "Título ou data inválida" }, 400);
      await db.prepare("UPDATE appointments SET title = ?, kind = ?, starts_at = ?, ends_at = ?, location = ?, entity_id = ?, status = ?, outcome = ?, notes = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(title, clean(body.kind, 60), starts, optional(body.ends_at), clean(body.location, 160), optional(body.entity_id), clean(body.status, 40), clean(body.outcome), clean(body.notes), now, id).run();
    } else if (resource === "relationships") {
      const source = clean(body.source_id, 80), target = clean(body.target_id, 80), label = clean(body.label, 100);
      if (!source || !target || source === target || !label) return response({ error: "Vínculo inválido" }, 400);
      await db.prepare("UPDATE relationships SET source_id = ?, target_id = ?, label = ?, notes = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(source, target, label, clean(body.notes), id).run();
    } else {
      const bodyText = clean(body.body, 10000), occurred = clean(body.occurred_at, 40);
      if (!bodyText || !occurred || Number.isNaN(Date.parse(occurred))) return response({ error: "Registro inválido" }, 400);
      await db.prepare("UPDATE diary_entries SET occurred_at = ?, body = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(occurred, bodyText, now, id).run();
      await db.prepare("DELETE FROM diary_mentions WHERE entry_id = ?").bind(id).run();
      const ids = Array.isArray(body.entity_ids) ? [...new Set(body.entity_ids.map((v) => clean(v, 80)).filter(Boolean))] : [];
      for (const entityId of ids) await db.prepare("INSERT INTO diary_mentions (id, entry_id, entity_id) VALUES (?, ?, ?)").bind(crypto.randomUUID(), id, entityId).run();
    }
    return response({ id });
  } catch (error) {
    console.error("Erro ao atualizar registro", error);
    return response({ error: "Não foi possível atualizar o registro." }, 400);
  }
}

export async function DELETE(request: Request) {
  const user = await requireUser();
  if (!user) return response({ error: "Acesso não autenticado" }, 401);
  const db = database();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const resource = clean(body?.resource, 30), id = clean(body?.id, 80);
  if (!validResource(resource) || !id) return response({ error: "Registro inválido" }, 400);
  const table = resource === "diary" ? "diary_entries" : resource;
  await db.prepare(`UPDATE ${table} SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`).bind(new Date().toISOString(), id).run();
  return response({ id });
}
