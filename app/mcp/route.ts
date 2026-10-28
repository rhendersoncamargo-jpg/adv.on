import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

const MCP_VERSION = "2026-07-28";
const OWNER_EMAILS = new Set(["rhendersoncamargo@hotmail.com", "escritorio@otonnasser.com.br"]);

const tools = [
  {
    name: "resumo_adv_on",
    description: "Mostra um resumo do ADV.ON com quantidades de clientes, telefones úteis, compromissos e registros diários.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "buscar_clientes",
    description: "Pesquisa clientes cadastrados no CRM do ADV.ON por nome, e-mail, telefone, observações ou tipo.",
    inputSchema: {
      type: "object",
      properties: {
        termo: { type: "string", description: "Texto opcional para pesquisa." },
        tipo: { type: "string", enum: ["Pessoa", "Empresa"], description: "Filtra por pessoa ou empresa." },
        limite: { type: "integer", minimum: 1, maximum: 50, default: 20 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "buscar_telefones_uteis",
    description: "Pesquisa Telefones Úteis por órgão, setor, número, cidade, categoria ou observação.",
    inputSchema: {
      type: "object",
      properties: {
        termo: { type: "string", description: "Nome, setor, telefone, cidade, categoria ou observação." },
        categoria: { type: "string", enum: ["TRT24", "TJMS"], description: "Categoria institucional opcional." },
        limite: { type: "integer", minimum: 1, maximum: 50, default: 20 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "listar_compromissos",
    description: "Lista compromissos da agenda do ADV.ON em um intervalo de datas.",
    inputSchema: {
      type: "object",
      properties: {
        inicio: { type: "string", description: "Data inicial no formato AAAA-MM-DD. O padrão é hoje." },
        fim: { type: "string", description: "Data final no formato AAAA-MM-DD. O padrão é 30 dias após o início." },
        status: { type: "string", description: "Status opcional, como Agendado, Concluído ou Cancelado." },
        limite: { type: "integer", minimum: 1, maximum: 50, default: 30 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "buscar_registros_diarios",
    description: "Pesquisa o Registro Diário do ADV.ON por texto ou cliente citado.",
    inputSchema: {
      type: "object",
      properties: {
        termo: { type: "string", description: "Texto contido no registro." },
        cliente: { type: "string", description: "Nome da pessoa ou empresa citada." },
        limite: { type: "integer", minimum: 1, maximum: 50, default: 20 },
      },
      additionalProperties: false,
    },
  },
];

type Arguments = Record<string, unknown>;

function database() {
  if (!env.DB) throw new Error("Banco de dados indisponível");
  return env.DB;
}

function clean(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function limit(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? Math.trunc(value) : fallback;
  return Math.max(1, Math.min(50, parsed));
}

function isoDate(value: unknown, fallback: Date) {
  const text = clean(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback.toISOString().slice(0, 10);
}

function textResult(value: unknown, isError = false) {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }], ...(isError ? { isError: true } : {}) };
}

function rpc(id: unknown, result: unknown) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result }, { headers: { "Cache-Control": "no-store" } });
}

function rpcError(id: unknown, code: number, message: string, status = 200) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

async function authorize(request: Request) {
  const email = clean(request.headers.get("oai-authenticated-user-email"), 200).toLocaleLowerCase("pt-BR");
  if (!email || !env.DB) return null;
  if (OWNER_EMAILS.has(email)) return { email, name: "Proprietário ADV.ON", role: "ADMINISTRADOR" };
  return database().prepare("SELECT email, name, role FROM users WHERE lower(email) = ? AND status = 'ATIVO' LIMIT 1")
    .bind(email).first<{ email: string; name: string; role: string }>();
}

async function callTool(name: string, args: Arguments) {
  const db = database();
  if (name === "resumo_adv_on") {
    const [clients, phones, appointments, diary] = await Promise.all([
      db.prepare("SELECT count(*) AS total FROM entities WHERE deleted_at IS NULL").first<{ total: number }>(),
      db.prepare("SELECT count(*) AS total FROM useful_phones WHERE deleted_at IS NULL").first<{ total: number }>(),
      db.prepare("SELECT count(*) AS total FROM appointments WHERE deleted_at IS NULL").first<{ total: number }>(),
      db.prepare("SELECT count(*) AS total FROM diary_entries WHERE deleted_at IS NULL").first<{ total: number }>(),
    ]);
    return textResult({ sistema: "ADV.ON", clientes: clients?.total || 0, telefones_uteis: phones?.total || 0, compromissos: appointments?.total || 0, registros_diarios: diary?.total || 0 });
  }

  if (name === "buscar_clientes") {
    const term = clean(args.termo), kind = clean(args.tipo, 20), max = limit(args.limite, 20);
    const like = `%${term}%`;
    const rows = await db.prepare("SELECT id, kind AS tipo, name AS nome, email, phone AS telefone, notes AS observacoes, created_at AS criado_em, updated_at AS atualizado_em FROM entities WHERE deleted_at IS NULL AND (? = '' OR kind = ?) AND (? = '' OR name LIKE ? OR email LIKE ? OR phone LIKE ? OR notes LIKE ?) ORDER BY name COLLATE NOCASE LIMIT ?")
      .bind(kind, kind, term, like, like, like, like, max).all();
    return textResult({ total: rows.results.length, clientes: rows.results });
  }

  if (name === "buscar_telefones_uteis") {
    const term = clean(args.termo), category = clean(args.categoria, 80), max = limit(args.limite, 20);
    const like = `%${term}%`;
    const rows = await db.prepare("SELECT name AS nome, category AS categoria, phone AS telefone, extension AS ramal, city AS cidade, notes AS observacoes FROM useful_phones WHERE deleted_at IS NULL AND (? = '' OR category = ?) AND (? = '' OR name LIKE ? OR category LIKE ? OR phone LIKE ? OR city LIKE ? OR notes LIKE ?) ORDER BY name COLLATE NOCASE LIMIT ?")
      .bind(category, category, term, like, like, like, like, like, max).all();
    return textResult({ total: rows.results.length, telefones: rows.results });
  }

  if (name === "listar_compromissos") {
    const startDate = new Date();
    const start = isoDate(args.inicio, startDate);
    const defaultEnd = new Date(`${start}T12:00:00Z`); defaultEnd.setUTCDate(defaultEnd.getUTCDate() + 30);
    const end = isoDate(args.fim, defaultEnd), status = clean(args.status, 40), max = limit(args.limite, 30);
    const rows = await db.prepare("SELECT a.title AS titulo, a.kind AS tipo, a.starts_at AS inicio, a.ends_at AS fim, a.location AS local, a.status, a.outcome AS resultado, a.notes AS observacoes, e.name AS cliente FROM appointments a LEFT JOIN entities e ON e.id = a.entity_id AND e.deleted_at IS NULL WHERE a.deleted_at IS NULL AND substr(a.starts_at, 1, 10) >= ? AND substr(a.starts_at, 1, 10) <= ? AND (? = '' OR a.status = ?) ORDER BY a.starts_at LIMIT ?")
      .bind(start, end, status, status, max).all();
    return textResult({ intervalo: { inicio: start, fim: end }, total: rows.results.length, compromissos: rows.results });
  }

  if (name === "buscar_registros_diarios") {
    const term = clean(args.termo), client = clean(args.cliente), max = limit(args.limite, 20);
    const termLike = `%${term}%`, clientLike = `%${client}%`;
    const rows = await db.prepare("SELECT d.id, d.occurred_at AS ocorrido_em, d.body AS registro, d.author_name AS autor, d.author_email AS email_autor, d.edited_at AS editado_em, d.editor_name AS editor, group_concat(DISTINCT e.name) AS clientes_citados FROM diary_entries d LEFT JOIN diary_mentions m ON m.entry_id = d.id LEFT JOIN entities e ON e.id = m.entity_id AND e.deleted_at IS NULL WHERE d.deleted_at IS NULL AND (? = '' OR d.body LIKE ?) GROUP BY d.id HAVING (? = '' OR clientes_citados LIKE ?) ORDER BY d.occurred_at DESC LIMIT ?")
      .bind(term, termLike, client, clientLike, max).all();
    return textResult({ total: rows.results.length, registros: rows.results });
  }

  return textResult(`Ferramenta desconhecida: ${name}`, true);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { jsonrpc?: string; id?: unknown; method?: string; params?: { name?: string; arguments?: Arguments } } | null;
  if (!body || body.jsonrpc !== "2.0" || !body.method) return rpcError(body?.id, -32600, "Requisição JSON-RPC inválida", 400);

  if (body.method === "server/discover") return rpc(body.id, { supportedVersions: [MCP_VERSION], capabilities: { tools: {} }, serverInfo: { name: "ADV.ON", version: "1.0.0" } });
  if (body.method === "tools/list") return rpc(body.id, { tools });

  if (body.method === "tools/call") {
    const caller = await authorize(request);
    if (!caller) return rpc(body.id, textResult("Acesso negado. Use uma conta autorizada no ADV.ON.", true));
    const name = clean(body.params?.name, 100);
    try {
      return rpc(body.id, await callTool(name, body.params?.arguments || {}));
    } catch (error) {
      console.error("Falha na ferramenta MCP do ADV.ON", error);
      return rpc(body.id, textResult("Não foi possível consultar o ADV.ON agora.", true));
    }
  }

  return rpcError(body.id, -32601, "Método não encontrado");
}
