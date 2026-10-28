import { env } from "cloudflare:workers";
import { getSessionUser } from "../../../lib/auth";

export const dynamic = "force-dynamic";
const resources = ["entities", "categories", "relationships", "appointments", "diary", "useful_phones", "vehicles", "vehicle_logs"] as const;
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
function phoneDigits(value: string): string { return value.replace(/\D/g, ""); }
async function duplicateUsefulPhone(db: D1Database, name: string, phone: string, exceptId?: string) {
  const rows = await db.prepare("SELECT id, phone FROM useful_phones WHERE lower(name) = lower(?) AND deleted_at IS NULL").bind(name).all<{ id: string; phone: string }>();
  return rows.results.some(item => item.id !== exceptId && phoneDigits(item.phone) === phoneDigits(phone));
}
function validResource(value: string | null): value is Resource {
  return resources.includes(value as Resource);
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return response({ error: "Acesso não autenticado" }, 401);
  const db = database();
  const resource = new URL(request.url).searchParams.get("resource");
  if (resource === "bootstrap") {
    const [entities, categories, relationships, appointments, diary, usefulPhones, vehicles, vehicleLogs, administrator] = await Promise.all([
      db.prepare("SELECT * FROM entities WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE").all(),
      db.prepare("SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE").all(),
      db.prepare("SELECT r.*, a.name AS source_name, b.name AS target_name FROM relationships r JOIN entities a ON a.id = r.source_id JOIN entities b ON b.id = r.target_id WHERE r.deleted_at IS NULL AND a.deleted_at IS NULL AND b.deleted_at IS NULL ORDER BY r.created_at DESC").all(),
      db.prepare("SELECT a.*, e.name AS entity_name FROM appointments a LEFT JOIN entities e ON e.id = a.entity_id WHERE a.deleted_at IS NULL ORDER BY a.starts_at ASC").all(),
      db.prepare("SELECT * FROM diary_entries WHERE deleted_at IS NULL ORDER BY occurred_at DESC").all(),
      db.prepare("SELECT u.*, e.name AS entity_name FROM useful_phones u LEFT JOIN entities e ON e.id = u.entity_id AND e.deleted_at IS NULL WHERE u.deleted_at IS NULL ORDER BY u.name COLLATE NOCASE").all(),
      db.prepare("SELECT * FROM vehicles WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE").all(),
      db.prepare("SELECT l.*, v.name AS vehicle_name, v.plate AS vehicle_plate FROM vehicle_logs l JOIN vehicles v ON v.id = l.vehicle_id WHERE l.deleted_at IS NULL AND v.deleted_at IS NULL ORDER BY l.used_at DESC").all(),
      db.prepare("SELECT id, email, name, role, status FROM users WHERE id = ?").bind("initial-administrator").first(),
    ]);
    const [mentions, categoryLinks] = await Promise.all([
      db.prepare("SELECT m.entry_id, m.entity_id, e.name, e.kind FROM diary_mentions m JOIN diary_entries d ON d.id = m.entry_id JOIN entities e ON e.id = m.entity_id WHERE d.deleted_at IS NULL AND e.deleted_at IS NULL").all(),
      db.prepare("SELECT entity_id, category_id FROM entity_categories").all(),
    ]);
    return response({ entities: entities.results, categories: categories.results, categoryLinks: categoryLinks.results, relationships: relationships.results, appointments: appointments.results, diary: diary.results, usefulPhones: usefulPhones.results, vehicles: vehicles.results, vehicleLogs: vehicleLogs.results, mentions: mentions.results, administrator, viewer: { email: user.email, name: user.name } });
  }
  if (!validResource(resource)) return response({ error: "Recurso desconhecido" }, 400);
  const table = resource === "diary" ? "diary_entries" : resource;
  const rows = await db.prepare(`SELECT * FROM ${table} WHERE deleted_at IS NULL`).all();
  return response(rows.results);
}

export async function POST(request: Request) {
  const user = await getSessionUser(request);
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
      const email = clean(body.email, 160), phone = clean(body.phone, 40);
      if (email || phone) {
        const duplicate = await db.prepare("SELECT id FROM entities WHERE deleted_at IS NULL AND lower(name) = lower(?) AND ((? <> '' AND lower(email) = lower(?)) OR (? <> '' AND phone = ?)) LIMIT 1")
          .bind(name, email, email, phone, phone).first();
        if (duplicate) return response({ error: "Já existe um cadastro com esse nome e contato" }, 409);
      }
      await db.prepare("INSERT INTO entities (id, kind, name, email, phone, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, kind, name, email, phone, clean(body.notes), now, now).run();
      const ids = Array.isArray(body.category_ids) ? [...new Set(body.category_ids.map((v) => clean(v, 80)).filter(Boolean))] : [];
      for (const categoryId of ids) await db.prepare("INSERT INTO entity_categories (id, entity_id, category_id) VALUES (?, ?, ?)").bind(crypto.randomUUID(), id, categoryId).run();
    } else if (resource === "relationships") {
      const source = clean(body.source_id, 80), target = clean(body.target_id, 80), label = clean(body.label, 100);
      if (!source || !target || source === target || !label) return response({ error: "Selecione dois contatos diferentes e informe o vínculo" }, 400);
      await db.prepare("INSERT INTO relationships (id, source_id, target_id, label, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id, source, target, label, clean(body.notes), now).run();
    } else if (resource === "useful_phones") {
      const name = clean(body.name, 160), phone = clean(body.phone, 50);
      if (!name || phone.replace(/\D/g, "").length < 8) return response({ error: "Informe o local e um telefone válido" }, 400);
      const existing = await duplicateUsefulPhone(db, name, phone);
      if (existing) return response({ error: "Este local e telefone já estão cadastrados" }, 409);
      await db.prepare("INSERT INTO useful_phones (id, name, category, phone, extension, city, notes, entity_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, name, clean(body.category, 80), phone, clean(body.extension, 20), clean(body.city, 100), clean(body.notes), optional(body.entity_id), now, now).run();
    } else if (resource === "appointments") {
      const title = clean(body.title, 160), starts = clean(body.starts_at, 40);
      if (!title || !starts || Number.isNaN(Date.parse(starts))) return response({ error: "Informe título e data válidos" }, 400);
      await db.prepare("INSERT INTO appointments (id, title, kind, starts_at, ends_at, location, entity_id, status, outcome, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, title, clean(body.kind, 60) || "Reunião", starts, optional(body.ends_at), clean(body.location, 160), optional(body.entity_id), clean(body.status, 40) || "Agendado", clean(body.outcome), clean(body.notes), now, now).run();
    } else if (resource === "vehicles") {
      const name = clean(body.name, 120), plate = clean(body.plate, 20).toUpperCase();
      if (!name) return response({ error: "Informe a identificação do veículo" }, 400);
      if (plate && await db.prepare("SELECT id FROM vehicles WHERE plate = ? AND deleted_at IS NULL LIMIT 1").bind(plate).first()) return response({ error: "Já existe um veículo com esta placa" }, 409);
      await db.prepare("INSERT INTO vehicles (id, name, plate, model, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(id, name, plate, clean(body.model, 120), clean(body.notes), now, now).run();
    } else if (resource === "vehicle_logs") {
      const vehicleId = clean(body.vehicle_id, 80), usedAt = clean(body.used_at, 40) || now;
      const kmStart = Number(body.km_start), kmEnd = Number(body.km_end);
      if (!vehicleId || !Number.isInteger(kmStart) || !Number.isInteger(kmEnd) || kmStart < 0 || kmEnd < kmStart) return response({ error: "Selecione o veículo e informe quilômetros válidos; a entrada não pode ser menor que a saída" }, 400);
      if (!(await db.prepare("SELECT id FROM vehicles WHERE id = ? AND deleted_at IS NULL").bind(vehicleId).first())) return response({ error: "Veículo não encontrado" }, 404);
      await db.prepare("INSERT INTO vehicle_logs (id, vehicle_id, used_at, km_start, km_end, route, notes, author_email, author_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, vehicleId, usedAt, kmStart, kmEnd, clean(body.route, 500), clean(body.notes), user.email, user.name || user.email, now, now).run();
    } else {
      const bodyText = clean(body.body, 10000);
      if (!bodyText) return response({ error: "Informe o conteúdo do registro" }, 400);
      await db.prepare("INSERT INTO diary_entries (id, occurred_at, body, author_email, author_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(id, now, bodyText, user.email, user.name || user.email, now, now).run();
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
  const user = await getSessionUser(request);
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
      const email = clean(body.email, 160), phone = clean(body.phone, 40);
      if (email || phone) {
        const duplicate = await db.prepare("SELECT id FROM entities WHERE deleted_at IS NULL AND id <> ? AND lower(name) = lower(?) AND ((? <> '' AND lower(email) = lower(?)) OR (? <> '' AND phone = ?)) LIMIT 1")
          .bind(id, name, email, email, phone, phone).first();
        if (duplicate) return response({ error: "Já existe um cadastro com esse nome e contato" }, 409);
      }
      const updated = await db.prepare("UPDATE entities SET kind = ?, name = ?, email = ?, phone = ?, notes = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(kind, name, email, phone, clean(body.notes), now, id).run();
      if (!updated.meta.changes) return response({ error: "Cliente não encontrado" }, 404);
      await db.prepare("DELETE FROM entity_categories WHERE entity_id = ?").bind(id).run();
      const ids = Array.isArray(body.category_ids) ? [...new Set(body.category_ids.map((v) => clean(v, 80)).filter(Boolean))] : [];
      for (const categoryId of ids) await db.prepare("INSERT INTO entity_categories (id, entity_id, category_id) VALUES (?, ?, ?)").bind(crypto.randomUUID(), id, categoryId).run();
    } else if (resource === "useful_phones") {
      const name = clean(body.name, 160), phone = clean(body.phone, 50);
      if (!name || phone.replace(/\D/g, "").length < 8) return response({ error: "Informe o local e um telefone válido" }, 400);
      const existing = await duplicateUsefulPhone(db, name, phone, id);
      if (existing) return response({ error: "Este local e telefone já estão cadastrados" }, 409);
      const updated = await db.prepare("UPDATE useful_phones SET name = ?, category = ?, phone = ?, extension = ?, city = ?, notes = ?, entity_id = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(name, clean(body.category, 80), phone, clean(body.extension, 20), clean(body.city, 100), clean(body.notes), optional(body.entity_id), now, id).run();
      if (!updated.meta.changes) return response({ error: "Telefone não encontrado" }, 404);
    } else if (resource === "appointments") {
      const title = clean(body.title, 160), starts = clean(body.starts_at, 40);
      if (!title || !starts || Number.isNaN(Date.parse(starts))) return response({ error: "Título ou data inválida" }, 400);
      await db.prepare("UPDATE appointments SET title = ?, kind = ?, starts_at = ?, ends_at = ?, location = ?, entity_id = ?, status = ?, outcome = ?, notes = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(title, clean(body.kind, 60), starts, optional(body.ends_at), clean(body.location, 160), optional(body.entity_id), clean(body.status, 40), clean(body.outcome), clean(body.notes), now, id).run();
    } else if (resource === "vehicles") {
      const name = clean(body.name, 120), plate = clean(body.plate, 20).toUpperCase();
      if (!name) return response({ error: "Informe a identificação do veículo" }, 400);
      if (plate && await db.prepare("SELECT id FROM vehicles WHERE plate = ? AND id <> ? AND deleted_at IS NULL LIMIT 1").bind(plate, id).first()) return response({ error: "Já existe outro veículo com esta placa" }, 409);
      const updated = await db.prepare("UPDATE vehicles SET name = ?, plate = ?, model = ?, notes = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(name, plate, clean(body.model, 120), clean(body.notes), now, id).run();
      if (!updated.meta.changes) return response({ error: "Veículo não encontrado" }, 404);
    } else if (resource === "vehicle_logs") {
      const vehicleId = clean(body.vehicle_id, 80), usedAt = clean(body.used_at, 40);
      const kmStart = Number(body.km_start), kmEnd = Number(body.km_end);
      if (!vehicleId || !usedAt || !Number.isInteger(kmStart) || !Number.isInteger(kmEnd) || kmStart < 0 || kmEnd < kmStart) return response({ error: "Informe veículo, data e quilômetros válidos" }, 400);
      const updated = await db.prepare("UPDATE vehicle_logs SET vehicle_id = ?, used_at = ?, km_start = ?, km_end = ?, route = ?, notes = ?, updated_at = ?, edited_at = ?, editor_email = ?, editor_name = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(vehicleId, usedAt, kmStart, kmEnd, clean(body.route, 500), clean(body.notes), now, now, user.email, user.name || user.email, id).run();
      if (!updated.meta.changes) return response({ error: "Uso de veículo não encontrado" }, 404);
    } else if (resource === "relationships") {
      const source = clean(body.source_id, 80), target = clean(body.target_id, 80), label = clean(body.label, 100);
      if (!source || !target || source === target || !label) return response({ error: "Vínculo inválido" }, 400);
      await db.prepare("UPDATE relationships SET source_id = ?, target_id = ?, label = ?, notes = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(source, target, label, clean(body.notes), id).run();
    } else {
      const bodyText = clean(body.body, 10000);
      if (!bodyText) return response({ error: "Registro inválido" }, 400);
      const updated = await db.prepare("UPDATE diary_entries SET body = ?, updated_at = ?, edited_at = ?, editor_email = ?, editor_name = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(bodyText, now, now, user.email, user.name || user.email, id).run();
      if (!updated.meta.changes) return response({ error: "Registro não encontrado" }, 404);
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
  const user = await getSessionUser(request);
  if (!user) return response({ error: "Acesso não autenticado" }, 401);
  const db = database();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const resource = clean(body?.resource, 30), id = clean(body?.id, 80);
  if (!validResource(resource) || !id) return response({ error: "Registro inválido" }, 400);
  const table = resource === "diary" ? "diary_entries" : resource;
  const archived = await db.prepare(`UPDATE ${table} SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`).bind(new Date().toISOString(), id).run();
  if (!archived.meta.changes) return response({ error: "Registro não encontrado" }, 404);
  return response({ id });
}
