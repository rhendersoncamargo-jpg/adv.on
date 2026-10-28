"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, CirclePlus, ContactRound, LayoutDashboard, NotebookPen, Search, Settings2, UsersRound, Building2, Tags, Link2, Clock3, MapPin, X, Pencil, Trash2, ArrowUpRight, Menu, Check, AlertCircle, Bell, ArrowRight, Phone, Copy, Mail, LockKeyhole, LogOut, ShieldCheck, UserCog, UserPlus, DatabaseZap } from "lucide-react";

type Entity = { id: string; kind: "Pessoa" | "Empresa"; name: string; email: string; phone: string; notes: string; created_at: string; updated_at: string };
type Category = { id: string; name: string; description: string };
type Relationship = { id: string; source_id: string; target_id: string; source_name: string; target_name: string; label: string; notes: string };
type Appointment = { id: string; title: string; kind: string; starts_at: string; ends_at: string | null; location: string; entity_id: string | null; entity_name?: string | null; status: string; outcome: string; notes: string };
type DiaryEntry = { id: string; occurred_at: string; body: string; author_email: string; author_name: string; edited_at: string | null; editor_email: string | null; editor_name: string | null };
type Mention = { entry_id: string; entity_id: string; name: string; kind: string };
type UsefulPhone = { id: string; name: string; category: string; phone: string; extension: string; city: string; notes: string; entity_id: string | null; entity_name?: string | null; created_at: string; updated_at: string };
type Data = { entities: Entity[]; categories: Category[]; categoryLinks: { entity_id: string; category_id: string }[]; relationships: Relationship[]; appointments: Appointment[]; diary: DiaryEntry[]; usefulPhones: UsefulPhone[]; mentions: Mention[]; administrator: { email: string; role: string; status: string } | null; viewer: { email: string; name: string } | null };
type Resource = "entities" | "categories" | "relationships" | "appointments" | "diary" | "useful_phones";
type FormState = Record<string, string | string[]>;
type SessionUser = { id: string; email: string; name: string; role: "ADMINISTRADOR" | "USUARIO"; status: "ATIVO" | "INATIVO" };
type ManagedUser = { id: string; email: string; name: string; role: string; status: string; created_at: string; updated_at: string; last_login_at: string | null };
const empty: Data = { entities: [], categories: [], categoryLinks: [], relationships: [], appointments: [], diary: [], usefulPhones: [], mentions: [], administrator: null, viewer: null };

const groups = [
  { title: "INÍCIO", icon: LayoutDashboard, items: [{ id: "painel", label: "Painel do Dia" }] },
  { title: "CRM", icon: ContactRound, items: [{ id: "clientes", label: "Clientes" }, { id: "telefones-uteis", label: "Telefones Úteis" }] },
  { title: "AGENDA", icon: CalendarDays, items: [{ id: "agenda-hoje", label: "Hoje" }, { id: "agenda-semana", label: "Semana" }, { id: "agenda-mes", label: "Mês" }, { id: "compromissos", label: "Compromissos" }] },
  { title: "REGISTRO DIÁRIO", icon: NotebookPen, items: [{ id: "diario-hoje", label: "Hoje" }, { id: "registros", label: "Registros" }] },
  { title: "ADMINISTRAÇÃO", icon: UserCog, items: [{ id: "usuarios", label: "Usuários" }] },
];
const titleFor = Object.fromEntries(groups.flatMap(group => group.items.map(item => [item.id, item.label])));
const sectionFor = Object.fromEntries(groups.flatMap(group => group.items.map(item => [item.id, group.title])));

function localDateTime() { return new Date().toLocaleString("sv-SE", { timeZone: "America/Cuiaba", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(" ", "T"); }
function dateOnly(value: string) { return value.slice(0, 10); }
function prettyDate(value: string, options?: Intl.DateTimeFormatOptions) {
  const date = new Date(`${dateOnly(value)}T12:00:00`);
  return new Intl.DateTimeFormat("pt-BR", options ?? { day: "2-digit", month: "short", year: "numeric" }).format(date);
}
function timeOnly(value: string) { return value.slice(11, 16); }
function diaryWallTime(value: string) { return /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? new Date(value).toLocaleString("sv-SE", { timeZone: "America/Cuiaba", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(" ", "T") : value; }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase(); }
function viewFromUrl() { if (typeof window === "undefined") return "painel"; const value = new URLSearchParams(window.location.search).get("view") || "painel"; if (["contatos", "pessoas", "empresas", "categorias", "relacionamentos"].includes(value)) return "clientes"; if (["pessoas-citadas", "empresas-citadas", "pesquisa"].includes(value)) return "registros"; return titleFor[value] ? value : "painel"; }

export default function Home() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState("painel");
  const [data, setData] = useState<Data>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<Resource | null>(null);
  const [form, setForm] = useState<FormState>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);
  const [quickBody, setQuickBody] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickEntityId, setQuickEntityId] = useState("");
  const [diaryEntityFilter, setDiaryEntityFilter] = useState("");
  const [clientKind, setClientKind] = useState("Todos");
  const [clientCategory, setClientCategory] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);
  const [importingPhones, setImportingPhones] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/me", { cache: "no-store" }).then(async response => {
      if (!response.ok) return setSession(null);
      const result = await response.json() as { user: SessionUser };
      setSession(result.user);
    }).catch(() => setSession(null)).finally(() => setAuthLoading(false));
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/data?resource=bootstrap", { cache: "no-store" });
      const result = await response.json() as Data & { error?: string };
      if (response.status === 401) { setSession(null); throw new Error("Sua sessão terminou. Entre novamente."); }
      if (!response.ok) throw new Error(result.error || "Falha ao carregar dados");
      setData(result);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao carregar dados"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { setView(viewFromUrl()); if (session) void load(); const handler = () => setView(viewFromUrl()); window.addEventListener("popstate", handler); return () => window.removeEventListener("popstate", handler); }, [load, session]);
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); document.querySelector<HTMLInputElement>(".top-search input")?.focus(); } }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, []);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".modal-card input, .modal-card select, .modal-card textarea")?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setModal(null); return; }
      if (event.key !== "Tab") return;
      const elements = Array.from(document.querySelectorAll<HTMLElement>(".modal-card button:not([disabled]), .modal-card input:not([disabled]), .modal-card select:not([disabled]), .modal-card textarea:not([disabled])"));
      if (!elements.length) return;
      if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements[elements.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === elements[elements.length - 1]) { event.preventDefault(); elements[0].focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, [modal]);
  function navigate(next: string) { setView(next); setQuery(""); setMobileMenu(false); if (next !== "clientes") setSelectedClientId(null); window.history.pushState({}, "", next === "painel" ? "/" : `/?view=${next}`); }
  const today = dateOnly(localDateTime());
  const q = query.toLocaleLowerCase("pt-BR").trim();
  const activeClientCategory = data.categories.some(item => item.id === clientCategory) ? clientCategory : "";
  useEffect(() => { if (clientCategory && !data.categories.some(item => item.id === clientCategory)) setClientCategory(""); }, [clientCategory, data.categories]);
  const entityName = (id: string | null) => data.entities.find(entity => entity.id === id)?.name || "—";
  const categoryNames = (entityId: string) => data.categoryLinks.filter(link => link.entity_id === entityId).map(link => data.categories.find(category => category.id === link.category_id)?.name).filter(Boolean).join(", ") || "Sem classificação";
  const matchedEntities = data.entities.filter(entity => {
    const categories = categoryNames(entity.id);
    if (clientKind !== "Todos" && entity.kind !== clientKind) return false;
    if (activeClientCategory && !data.categoryLinks.some(link => link.entity_id === entity.id && link.category_id === activeClientCategory)) return false;
    return !q || [entity.name, entity.email, entity.phone, entity.notes, categories].some(value => value.toLocaleLowerCase("pt-BR").includes(q));
  });
  const matchedUsefulPhones = data.usefulPhones.filter(item => !q || [item.name, item.category, item.phone, item.extension, item.city, item.notes].some(value => value.toLocaleLowerCase("pt-BR").includes(q)));
  const selectedClient = matchedEntities.find(entity => entity.id === selectedClientId) || null;
  const matchedAppointments = data.appointments.filter(item => {
    if (q && ![item.title, item.kind, item.location, item.entity_name || ""].some(value => value.toLocaleLowerCase("pt-BR").includes(q))) return false;
    const day = dateOnly(item.starts_at);
    if (view === "agenda-hoje") return day === today;
    if (view === "agenda-semana") { const current = new Date(`${today}T12:00:00`); const start = new Date(current); start.setDate(current.getDate() - ((current.getDay() + 6) % 7)); const end = new Date(start); end.setDate(start.getDate() + 7); return day >= dateOnly(start.toISOString()) && day < dateOnly(end.toISOString()); }
    return true;
  });
  const matchedDiary = data.diary.filter(item => {
    const mentions = data.mentions.filter(mention => mention.entry_id === item.id);
    if (view === "diario-hoje" && dateOnly(diaryWallTime(item.occurred_at)) !== today) return false;
    if (view === "registros" && diaryEntityFilter && !mentions.some(mention => mention.entity_id === diaryEntityFilter)) return false;
    return !q || item.body.toLocaleLowerCase("pt-BR").includes(q) || mentions.some(mention => mention.name.toLocaleLowerCase("pt-BR").includes(q));
  });
  const todayAppointments = data.appointments.filter(item => dateOnly(item.starts_at) === today && item.status !== "Cancelado");
  const upcoming = data.appointments.filter(item => dateOnly(item.starts_at) >= today && item.status === "Agendado").slice(0, 5);
  const todayDiary = data.diary.filter(item => dateOnly(diaryWallTime(item.occurred_at)) === today);
  const section = sectionFor[view] || "INÍCIO";
  const visibleGroups = groups.filter(group => group.title !== "ADMINISTRAÇÃO" || session?.role === "ADMINISTRADOR");
  const activeResource: Resource = view === "clientes" ? "entities" : view === "telefones-uteis" ? "useful_phones" : section === "AGENDA" ? "appointments" : "diary";
  const createLabel = activeResource === "entities" ? "Novo cliente" : activeResource === "useful_phones" ? "Novo telefone" : activeResource === "appointments" ? "Novo compromisso" : view === "diario-hoje" ? "Novo registro" : "Ir para Hoje";

  function openCreate(resource: Resource, kind?: "Pessoa" | "Empresa") {
    if (resource === "diary") { setQuickEntityId(selectedClientId || ""); navigate("diario-hoje"); requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(".quick-capture textarea")?.focus()); return; }
    setEditingId(null);
    const start = localDateTime();
    setForm(resource === "entities" ? { kind: kind || "Pessoa", name: "", email: "", phone: "", category_ids: [], notes: "" } : resource === "useful_phones" ? { name: "", category: "", phone: "", extension: "", city: "", notes: "", entity_id: "" } : resource === "appointments" ? { title: "", kind: "Reunião", starts_at: start, ends_at: "", location: "", entity_id: selectedClientId || "", status: "Agendado", outcome: "", notes: "" } : resource === "relationships" ? { source_id: selectedClientId || "", target_id: "", label: "", notes: "" } : { name: "", description: "" });
    setModal(resource); setError("");
  }
  function openEdit(resource: Resource, item: Record<string, unknown>) {
    setEditingId(String(item.id));
    const next: FormState = Object.fromEntries(Object.entries(item).map(([key, value]) => [key, value == null ? "" : String(value)]));
    if (resource === "diary") next.entity_ids = data.mentions.filter(mention => mention.entry_id === item.id).map(mention => mention.entity_id);
    if (resource === "entities") next.category_ids = data.categoryLinks.filter(link => link.entity_id === item.id).map(link => link.category_id);
    setForm(next); setModal(resource); setError("");
  }
  function update(key: string, value: string | string[]) { setForm(current => ({ ...current, [key]: value })); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!modal) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/data", { method: editingId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, resource: modal, id: editingId }) });
      const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || "Falha ao salvar");
      setModal(null); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar"); }
    finally { setSaving(false); }
  }
  async function remove(resource: Resource, id: string, label: string) {
    if (!window.confirm(`Arquivar “${label}”? O registro sairá das listas, mas seu histórico será preservado.`)) return;
    try { const response = await fetch("/api/data", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resource, id }) }); if (!response.ok) throw new Error("Não foi possível arquivar"); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível arquivar"); }
  }

  async function importInstitutionalPhones() {
    setImportingPhones(true); setError("");
    try {
      const response = await fetch("/api/admin/useful-phones-import", { method: "POST" });
      const result = await response.json().catch(() => ({ error: "O servidor não concluiu a importação." })) as { error?: string; imported?: number; updated?: number; skipped?: number };
      if (!response.ok) throw new Error(result.error || "Não foi possível importar os telefones");
      await load();
      window.alert(`${result.imported || 0} telefones adicionados. ${result.updated || 0} atualizados. ${result.skipped || 0} já estavam corretos.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível importar os telefones"); }
    finally { setImportingPhones(false); }
  }

  async function saveQuickEntry(event: React.FormEvent) {
    event.preventDefault();
    if (!quickBody.trim()) return;
    setQuickSaving(true); setError("");
    try {
      const response = await fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resource: "diary", body: quickBody.trim(), entity_ids: quickEntityId ? [quickEntityId] : [] }) });
      const result = await response.json().catch(() => ({ error: "O servidor não concluiu a solicitação. Tente novamente." })) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar o registro");
      setQuickBody(""); setQuickEntityId(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar o registro"); }
    finally { setQuickSaving(false); }
  }

  const monthDate = useMemo(() => { const date = new Date(`${today}T12:00:00`); date.setDate(1); date.setMonth(date.getMonth() + monthOffset); return date; }, [today, monthOffset]);
  const monthDays = useMemo(() => { const first = new Date(monthDate); const shift = (first.getDay() + 6) % 7; first.setDate(1 - shift); return Array.from({ length: 42 }, (_, index) => { const day = new Date(first); day.setDate(first.getDate() + index); return day; }); }, [monthDate]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setSession(null); setData(empty); setView("painel");
    window.history.replaceState({}, "", "/");
  }

  if (authLoading) return <div className="auth-shell"><div className="auth-loading"><div className="auth-logo">ON</div><p>Verificando acesso seguro…</p></div></div>;
  if (!session) return <AuthScreen onAuthenticated={user => { setSession(user); setLoading(true); }}/>;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
      <div className="brand"><div className="brand-mark">ON</div><div><strong>ADV.ON</strong><small>OTON NASSER ADVOCACIA</small></div><span className="brand-edition">JURÍDICO</span></div>
      <div className="sidebar-caption">NAVEGAÇÃO PRINCIPAL</div>
      <nav aria-label="Navegação principal">
        {visibleGroups.map(group => <div className="nav-group" key={group.title}><button type="button" className={`nav-heading ${section === group.title ? "active" : ""}`} onClick={() => navigate(group.items[0].id)}><group.icon size={18} strokeWidth={1.8}/><span>{group.title === "INÍCIO" ? "Início" : group.title === "AGENDA" ? "Agenda" : group.title === "CRM" ? "CRM" : group.title === "ADMINISTRAÇÃO" ? "Administração" : "Registro Diário"}</span>{section === group.title && <span className="nav-dot"/>}</button>{section === group.title && <div className="nav-items">{group.items.map(item => <button key={item.id} type="button" className={`nav-item ${view === item.id ? "active" : ""}`} onClick={() => navigate(item.id)}>{item.label}</button>)}</div>}</div>)}
      </nav>
      <div className="sidebar-bottom"><div className="admin-avatar">{initials(session.name)}</div><div className="admin-meta"><strong>{session.name}</strong><span>{session.email}</span></div><button type="button" className="logout-button" onClick={() => void logout()} title="Sair" aria-label="Sair"><LogOut size={16}/></button></div>
    </aside>
    {mobileMenu && <button type="button" aria-label="Fechar menu" className="mobile-overlay" onClick={() => setMobileMenu(false)}/>}
    <main className="main-content">
      <header className="topbar"><button type="button" className="mobile-toggle" onClick={() => setMobileMenu(true)} aria-label="Abrir menu"><Menu size={23}/></button><div className="top-search"><Search size={18}/><input aria-label="Pesquisar nesta seção" value={query} onChange={event => setQuery(event.target.value)} placeholder="Pesquisar nesta seção"/><kbd>Ctrl+K</kbd></div><div className="topbar-actions"><span className="top-date"><CalendarDays size={17}/>{prettyDate(today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span><Bell size={18} aria-hidden="true"/>{view !== "usuarios" && <button className="primary-button top-create" type="button" onClick={() => openCreate("diary")}><CirclePlus size={17}/>{view === "diario-hoje" ? "Novo registro" : "Ir para Hoje"}</button>}</div></header>
      <div className="content-wrap">
        {error && <div className="error-banner" role="alert"><AlertCircle size={18}/><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Dispensar aviso"><X size={16}/></button></div>}
        <div className="page-heading"><div><div className="eyebrow">{view === "painel" ? "PAINEL DE CONTROLE JURÍDICO" : section === "CRM" ? "CRM DO ESCRITÓRIO" : section === "AGENDA" ? "ROTINA E COMPROMISSOS" : section === "ADMINISTRAÇÃO" ? "SEGURANÇA E ACESSO" : "MEMÓRIA DO ESCRITÓRIO"}</div><h1>{view === "painel" ? "Painel do Dia" : view === "clientes" ? "Clientes" : view === "telefones-uteis" ? "Telefones Úteis" : section === "AGENDA" ? "Agenda Integrada" : section === "REGISTRO DIÁRIO" ? "Registro Diário" : titleFor[view]}</h1><p>{view === "painel" ? "A rotina do escritório reunida em um só lugar." : view === "clientes" ? "Cadastre e atualize pessoas e organizações em um só lugar." : view === "telefones-uteis" ? "Números de locais e serviços que o escritório consulta com frequência." : section === "AGENDA" ? "Compromissos e acontecimentos planejados para a equipe." : section === "ADMINISTRAÇÃO" ? "Cadastre e controle quem pode entrar no sistema." : "A memória do escritório, organizada e pesquisável."}</p></div>{view !== "usuarios" && <div className="heading-actions"><span className="date-pill"><CalendarDays size={16}/>{prettyDate(today, { weekday: "long", day: "numeric", month: "long" })}</span>{view === "telefones-uteis" && session?.role === "ADMINISTRADOR" && <button className="secondary-button" type="button" disabled={importingPhones} onClick={() => void importInstitutionalPhones()}><DatabaseZap size={17}/>{importingPhones ? "Importando…" : "Importar listas"}</button>}<button className="primary-button" type="button" onClick={() => openCreate(view === "painel" ? "appointments" : activeResource)}><CirclePlus size={18}/>{view === "painel" ? "Novo compromisso" : createLabel}</button></div>}</div>
        {loading ? <div className="loading-state">Carregando informações do escritório…</div> : <>
          {view === "painel" && <>
            <div className="welcome-card"><div><span>VISÃO GERAL</span><h2>Um bom dia começa com<br/>tudo em ordem.</h2><p>Acompanhe seus compromissos, contatos e registros recentes.</p></div><div className="welcome-monogram">ON<span>.</span></div></div>
            <div className="metric-grid"><Metric icon={CalendarDays} label="Compromissos hoje" value={todayAppointments.length} detail="na agenda do escritório"/><Metric icon={UsersRound} label="Pessoas" value={data.entities.filter(e => e.kind === "Pessoa").length} detail="contatos cadastrados"/><Metric icon={Building2} label="Empresas" value={data.entities.filter(e => e.kind === "Empresa").length} detail="organizações cadastradas"/><Metric icon={NotebookPen} label="Registros hoje" value={todayDiary.length} detail="no registro diário"/></div>
            <div className="dashboard-grid"><section className="panel"><PanelTitle title="Próximos compromissos" subtitle="O que vem pela frente" action={() => navigate("compromissos")}/>{upcoming.length ? <div className="compact-list">{upcoming.map(item => <div className="compact-row" key={item.id}><div className="date-block"><strong>{item.starts_at.slice(8, 10)}</strong><span>{prettyDate(item.starts_at, { month: "short" })}</span></div><div><strong>{item.title}</strong><span>{timeOnly(item.starts_at)} · {item.entity_name || item.kind}</span></div><span className="status-badge">{item.status}</span></div>)}</div> : <EmptyState icon={CalendarDays} title="Agenda tranquila" description="Os próximos compromissos aparecerão aqui." action="Criar compromisso" onAction={() => openCreate("appointments")}/>}</section><section className="panel"><PanelTitle title="Registro Diário" subtitle="Últimos acontecimentos" action={() => navigate("registros")}/>{data.diary.length ? <div className="compact-list">{data.diary.slice(0, 4).map(item => <div className="diary-preview" key={item.id}><span className="preview-dot"/><div><p>{item.body}</p><small>{prettyDate(diaryWallTime(item.occurred_at))} · {timeOnly(diaryWallTime(item.occurred_at))}</small></div></div>)}</div> : <EmptyState icon={NotebookPen} title="Ainda sem registros" description="Registre acontecimentos para preservar o contexto do escritório." action="Ir para Hoje" onAction={() => openCreate("diary")}/>}</section></div>
            <section className="quick-modules panel"><div><h2>Acesso rápido aos módulos</h2><p>Navegação direta pelas áreas operacionais do escritório</p></div><div className="module-grid"><button type="button" onClick={() => navigate("clientes")}><UsersRound size={21}/><span><strong>Clientes</strong><small>Cadastro de pessoas e organizações</small></span><ArrowRight size={18}/></button><button type="button" onClick={() => navigate("agenda-mes")}><CalendarDays size={21}/><span><strong>Agenda integrada</strong><small>Compromissos por dia, semana e mês</small></span><ArrowRight size={18}/></button><button type="button" onClick={() => navigate("registros")}><NotebookPen size={21}/><span><strong>Registro Diário</strong><small>Fatos e notas do escritório</small></span><ArrowRight size={18}/></button></div></section>
          </>}
          {view === "usuarios" && session.role === "ADMINISTRADOR" && <UserAdministration currentUserId={session.id}/>}
          {view === "clientes" && <>
            <div className="metric-grid relationship-metrics">
              <Metric icon={ContactRound} label="Cadastros" value={data.entities.length} detail="pessoas e organizações"/>
              <Metric icon={UsersRound} label="Pessoas" value={data.entities.filter(item => item.kind === "Pessoa").length} detail="contatos individuais"/>
              <Metric icon={Building2} label="Organizações" value={data.entities.filter(item => item.kind === "Empresa").length} detail="empresas cadastradas"/>
              <Metric icon={Link2} label="Vínculos" value={data.relationships.length} detail="relações registradas"/>
            </div>
            <section className="panel list-panel">
              <div className="list-toolbar"><div><h2>Cadastro de clientes</h2><p>Uma ficha para cada pessoa ou organização, com seus vínculos e histórico.</p></div><span className="count-pill">{matchedEntities.length} registros</span></div>
              <div className="client-filters" aria-label="Filtros de clientes">
                <div className="view-tabs">{["Todos", "Pessoa", "Empresa"].map(kind => <button key={kind} type="button" className={clientKind === kind ? "active" : ""} onClick={() => setClientKind(kind)}>{kind === "Pessoa" ? "Pessoas" : kind === "Empresa" ? "Organizações" : "Todos"}</button>)}</div>
                <select aria-label="Filtrar por categoria" value={activeClientCategory} onChange={event => setClientCategory(event.target.value)}><option value="">Todas as classificações</option>{data.categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                <button type="button" className="secondary-button" onClick={() => openCreate("categories")}><Tags size={15}/> Nova classificação</button>
              </div>
              {matchedEntities.length ? <div className="table-scroll"><table><thead><tr><th>NOME</th><th>TIPO</th><th>CLASSIFICAÇÃO</th><th>CONTATO</th><th>ATUALIZADO</th><th>AÇÕES</th></tr></thead><tbody>{matchedEntities.map(item => <tr key={item.id}><td><div className="name-cell"><span className="entity-avatar">{initials(item.name)}</span><div><button type="button" className="name-link" onClick={() => setSelectedClientId(item.id)}>{item.name}</button>{item.notes && <small>{item.notes}</small>}</div></div></td><td><span className="type-badge">{item.kind === "Empresa" ? "Organização" : "Pessoa"}</span></td><td>{categoryNames(item.id)}</td><td><div className="contact-cell">{item.email && <span>{item.email}</span>}{item.phone && <span>{item.phone}</span>}{!item.email && !item.phone && "—"}</div></td><td>{prettyDate(item.updated_at || item.created_at)}</td><td><RowActions onEdit={() => openEdit("entities", item as unknown as Record<string, unknown>)} onDelete={() => remove("entities", item.id, item.name)}/></td></tr>)}</tbody></table></div> : <EmptyState icon={UsersRound} title={q || clientCategory || clientKind !== "Todos" ? "Nenhum cadastro encontrado" : "Comece o cadastro de clientes"} description={q || clientCategory || clientKind !== "Todos" ? "Ajuste a busca ou os filtros." : "Cadastre a primeira pessoa ou organização do escritório."} action={q || clientCategory || clientKind !== "Todos" ? undefined : "Novo cliente"} onAction={() => openCreate("entities")}/>}
            </section>
            {selectedClient && <section className="panel client-detail" aria-label={`Ficha de ${selectedClient.name}`}>
              <div className="client-detail-head"><div><span className="eyebrow">FICHA DO CADASTRO</span><h2>{selectedClient.name}</h2><p>{selectedClient.kind === "Empresa" ? "Organização" : "Pessoa"} · {categoryNames(selectedClient.id)}</p></div><div><button className="secondary-button" type="button" onClick={() => openEdit("entities", selectedClient as unknown as Record<string, unknown>)}><Pencil size={15}/> Editar dados</button><button className="icon-button" type="button" aria-label="Fechar ficha" onClick={() => setSelectedClientId(null)}><X size={18}/></button></div></div>
              <div className="client-detail-info"><span><Mail size={16}/>{selectedClient.email || "E-mail não informado"}</span><span><Phone size={16}/>{selectedClient.phone || "Telefone não informado"}</span><span><Tags size={16}/>{categoryNames(selectedClient.id)}</span></div>
              {selectedClient.notes && <p className="client-notes">{selectedClient.notes}</p>}
              <div className="client-detail-grid"><div><div className="detail-section-head"><h3>Vínculos</h3><button type="button" onClick={() => openCreate("relationships")}>Novo vínculo <CirclePlus size={14}/></button></div>{data.relationships.filter(item => item.source_id === selectedClient.id || item.target_id === selectedClient.id).length ? data.relationships.filter(item => item.source_id === selectedClient.id || item.target_id === selectedClient.id).map(item => <div className="detail-row" key={item.id}><Link2 size={15}/><span>{item.source_id === selectedClient.id ? item.target_name : item.source_name}<small>{item.label}</small></span><RowActions onEdit={() => openEdit("relationships", item as unknown as Record<string, unknown>)} onDelete={() => remove("relationships", item.id, item.label)}/></div>) : <p className="detail-empty">Nenhum vínculo cadastrado.</p>}</div><div><h3>Atividade relacionada</h3>{data.appointments.filter(item => item.entity_id === selectedClient.id).slice(0,3).map(item => <div className="detail-row" key={item.id}><CalendarDays size={15}/><span>{item.title}<small>{prettyDate(item.starts_at)}</small></span></div>)}{data.mentions.filter(item => item.entity_id === selectedClient.id).slice(0,3).map(item => { const entry = data.diary.find(record => record.id === item.entry_id); return entry && <div className="detail-row" key={item.entry_id}><NotebookPen size={15}/><span>{entry.body.slice(0,100)}<small>{prettyDate(diaryWallTime(entry.occurred_at))}</small></span></div>; })}{!data.appointments.some(item => item.entity_id === selectedClient.id) && !data.mentions.some(item => item.entity_id === selectedClient.id) && <p className="detail-empty">Agenda e Registro Diário aparecerão aqui quando relacionados.</p>}</div></div>
            </section>}
            {data.categories.length > 0 && <details className="panel inline-settings"><summary>Gerenciar classificações</summary><div className="category-grid">{data.categories.map(item => <div className="category-card" key={item.id}><div className="category-icon"><Tags size={18}/></div><div><strong>{item.name}</strong><p>{item.description || "Sem descrição"}</p></div><RowActions onEdit={() => openEdit("categories", item as unknown as Record<string, unknown>)} onDelete={() => remove("categories", item.id, item.name)}/></div>)}</div></details>}
          </>}
          {view === "telefones-uteis" && <section className="panel list-panel useful-phones">
            <label className="diary-search"><Search size={17}/><input aria-label="Pesquisar telefones úteis" value={query} onChange={event => setQuery(event.target.value)} placeholder="Pesquisar por órgão, setor, telefone, cidade ou categoria"/>{query && <button type="button" className="icon-button" aria-label="Limpar pesquisa de telefones" onClick={() => setQuery("")}><X size={15}/></button>}</label>
            <div className="list-toolbar"><div><h2>Telefones Úteis</h2><p>Locais e serviços consultados com frequência pelo escritório.</p></div><span className="count-pill">{matchedUsefulPhones.length} números</span></div>
            {matchedUsefulPhones.length ? <div className="phone-grid">{matchedUsefulPhones.map(item => <article className="phone-card" key={item.id}><div className="phone-card-head"><span className="phone-icon"><Phone size={19}/></span><span className="type-badge">{item.category || "Geral"}</span></div><h3>{item.name}</h3>{item.city && <p><MapPin size={14}/>{item.city}</p>}<a className="phone-number" href={`tel:${item.phone.replace(/[^+\d]/g, "")}`}>{item.phone}{item.extension && <small> · ramal {item.extension}</small>}</a>{item.notes && <p className="phone-notes">{item.notes}</p>}{item.entity_name && <p className="phone-linked">Relacionado a {item.entity_name}</p>}<div className="phone-card-actions"><a href={`tel:${item.phone.replace(/[^+\d]/g, "")}`}><Phone size={15}/> Ligar</a><button type="button" onClick={() => { void navigator.clipboard.writeText(item.phone).then(() => setCopiedPhoneId(item.id)).catch(() => setError("Não foi possível copiar o telefone")); }}><Copy size={15}/>{copiedPhoneId === item.id ? "Copiado" : "Copiar"}</button><RowActions onEdit={() => openEdit("useful_phones", item as unknown as Record<string, unknown>)} onDelete={() => remove("useful_phones", item.id, item.name)}/></div></article>)}</div> : <EmptyState icon={Phone} title={q ? "Nenhum telefone encontrado" : "Lista de telefones vazia"} description={q ? "Tente buscar pelo local, número, cidade ou categoria." : "Cadastre os locais com que o escritório fala com frequência."} action={q ? undefined : "Novo telefone"} onAction={() => openCreate("useful_phones")}/>}
          </section>}
          {section === "AGENDA" && <div className="view-tabs" aria-label="Visualização da agenda">{[{ id: "agenda-hoje", label: "Hoje" }, { id: "agenda-semana", label: "Semana" }, { id: "agenda-mes", label: "Mês" }, { id: "compromissos", label: "Compromissos" }].map(item => <button key={item.id} type="button" className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)}>{item.label}</button>)}</div>}
          {section === "AGENDA" && <section className="panel list-panel"><div className="list-toolbar"><div><h2>{view === "agenda-mes" ? prettyDate(monthDate.toISOString(), { month: "long", year: "numeric" }) : view === "agenda-semana" ? "Esta semana" : view === "agenda-hoje" ? "Compromissos de hoje" : "Todos os compromissos"}</h2><p>Reuniões, ligações, atendimentos e eventos em uma única agenda.</p></div>{view === "agenda-mes" ? <div className="month-controls"><button type="button" onClick={() => setMonthOffset(value => value - 1)} aria-label="Mês anterior"><ChevronLeft size={18}/></button><button type="button" onClick={() => setMonthOffset(0)}>Hoje</button><button type="button" onClick={() => setMonthOffset(value => value + 1)} aria-label="Próximo mês"><ChevronRight size={18}/></button></div> : <span className="count-pill">{matchedAppointments.length} compromissos</span>}</div>{view === "agenda-mes" ? <div className="calendar-grid">{["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"].map(day => <div className="calendar-weekday" key={day}>{day}</div>)}{monthDays.map(day => { const key = dateOnly(`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,"0")}-${String(day.getDate()).padStart(2,"0")}`); const items = data.appointments.filter(item => dateOnly(item.starts_at) === key); return <div className={`calendar-day ${day.getMonth() !== monthDate.getMonth() ? "muted" : ""} ${key === today ? "today" : ""}`} key={key}><span>{day.getDate()}</span>{items.slice(0,2).map(item => <button type="button" key={item.id} title={item.title} onClick={() => openEdit("appointments", item as unknown as Record<string, unknown>)}>{timeOnly(item.starts_at)} {item.title}</button>)}{items.length > 2 && <small>+{items.length-2} outros</small>}</div>; })}</div> : matchedAppointments.length ? <div className="appointment-list">{matchedAppointments.map(item => <div className="appointment-row" key={item.id}><div className="appointment-date"><strong>{item.starts_at.slice(8,10)}</strong><span>{prettyDate(item.starts_at, { month: "short" })}</span></div><div className="appointment-main"><div><strong>{item.title}</strong><span className={`status-badge ${item.status === "Cancelado" ? "cancelled" : item.status === "Realizado" ? "done" : ""}`}>{item.status}</span></div><p><Clock3 size={14}/>{timeOnly(item.starts_at)}{item.ends_at ? ` – ${timeOnly(item.ends_at)}` : ""}<span>•</span>{item.kind}{item.location && <><span>•</span><MapPin size={14}/>{item.location}</>}</p>{item.entity_name && <small>Relacionado a {item.entity_name}</small>}{item.outcome && <small>Resultado: {item.outcome}</small>}</div><RowActions onEdit={() => openEdit("appointments", item as unknown as Record<string, unknown>)} onDelete={() => remove("appointments", item.id, item.title)}/></div>)}</div> : <EmptyState icon={CalendarDays} title={q ? "Nenhum compromisso encontrado" : "Nenhum compromisso por aqui"} description={q ? "Tente outro termo de pesquisa." : "Adicione o primeiro compromisso à agenda."} action={q ? undefined : "Novo compromisso"} onAction={() => openCreate("appointments")}/>}</section>}
          {view === "diario-hoje" && <form className="quick-capture panel" onSubmit={saveQuickEntry}>
            <div className="quick-capture-head"><span className="eyebrow">REGISTRO DE HOJE</span><small>{prettyDate(today, { day: "numeric", month: "long", year: "numeric" })}</small></div>
            <textarea value={quickBody} onChange={event => setQuickBody(event.target.value)} placeholder="Relate uma ocorrência, atendimento ou memória de reunião…" aria-label="Conteúdo do novo registro" rows={5} required/>
            <label className="diary-client-picker"><span>Cliente citado <small>(opcional)</small></span><select value={quickEntityId} onChange={event => setQuickEntityId(event.target.value)}><option value="">Nenhum cliente selecionado</option>{data.entities.map(item => <option key={item.id} value={item.id}>{item.name} · {item.kind}</option>)}</select></label>
            <div className="quick-capture-foot"><span>O dia, a hora e seu nome serão salvos automaticamente.</span><button type="submit" className="primary-button" disabled={quickSaving || !quickBody.trim()}>{quickSaving ? "Salvando…" : "Salvar registro"}<ArrowRight size={16}/></button></div>
          </form>}
          {section === "REGISTRO DIÁRIO" && <section className="panel list-panel">
            <div className="list-toolbar"><div><h2>{view === "diario-hoje" ? "Registros de hoje" : "Registros"}</h2><p>{view === "diario-hoje" ? "Acontecimentos salvos neste dia." : "Histórico do escritório com busca por conteúdo e cliente citado."}</p></div><span className="count-pill">{matchedDiary.length} registros</span></div>
            {view === "registros" && <div className="diary-filters"><label><span>Filtrar por pessoa ou empresa citada</span><select value={diaryEntityFilter} onChange={event => setDiaryEntityFilter(event.target.value)}><option value="">Todos os clientes</option>{data.entities.map(item => <option key={item.id} value={item.id}>{item.name} · {item.kind}</option>)}</select></label></div>}
            {matchedDiary.length ? <div className="diary-list">{matchedDiary.map(item => { const mentions = data.mentions.filter(mention => mention.entry_id === item.id); const created = diaryWallTime(item.occurred_at); const edited = item.edited_at ? diaryWallTime(item.edited_at) : null; return <article className="diary-entry" key={item.id}><div className="entry-rail"><span/></div><div className="entry-body"><div className="entry-meta"><strong>{prettyDate(created, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</strong><span>{timeOnly(created)}</span></div><p>{item.body}</p>{mentions.length > 0 && <div className="mention-list">{mentions.map(mention => <span key={mention.entity_id}>{mention.kind === "Pessoa" ? <UsersRound size={13}/> : <Building2 size={13}/>} {mention.name}</span>)}</div>}<div className="diary-audit"><small>Registrado por {item.author_name || item.author_email}</small>{edited && <small>Editado em {prettyDate(edited)} às {timeOnly(edited)} por {item.editor_name || item.editor_email}</small>}</div></div><RowActions onEdit={() => openEdit("diary", item as unknown as Record<string, unknown>)} onDelete={() => remove("diary", item.id, "registro diário")}/></article>; })}</div> : <EmptyState icon={NotebookPen} title={q || diaryEntityFilter ? "Nenhum registro encontrado" : "Nenhum acontecimento registrado"} description={q || diaryEntityFilter ? "Ajuste a busca ou o filtro de cliente." : "Crie o primeiro registro para preservar a memória do escritório."} action={q || diaryEntityFilter ? undefined : "Ir para Hoje"} onAction={() => openCreate("diary")}/>}
          </section>}
        </>}
        <footer className="app-footer"><span>ADV.ON · Oton Nasser Advocacia</span><span>Fase 1 · Relacionamento e rotina interna</span></footer>
      </div>
    </main>
    {modal && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setModal(null); }}><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div><span className="eyebrow">ADV.ON • CADASTRO</span><h2 id="modal-title">{editingId ? "Editar" : "Criar"} {modal === "entities" ? "cliente" : modal === "useful_phones" ? "telefone útil" : modal === "categories" ? "classificação" : modal === "relationships" ? "vínculo" : modal === "appointments" ? "compromisso" : "registro"}</h2></div><button type="button" className="icon-button" aria-label="Fechar" onClick={() => setModal(null)}><X size={20}/></button></div><form onSubmit={save}><div className="modal-fields">
      {modal === "entities" && <><Field label="Tipo de cadastro" required><select value={String(form.kind || "Pessoa")} onChange={event => update("kind", event.target.value)}><option>Pessoa</option><option>Empresa</option></select></Field><Field label="Nome" required><input required value={String(form.name || "")} onChange={event => update("name", event.target.value)} placeholder="Nome da pessoa ou organização"/></Field><div className="field-pair"><Field label="E-mail"><input type="email" value={String(form.email || "")} onChange={event => update("email", event.target.value)} placeholder="email@exemplo.com"/></Field><Field label="Telefone"><input value={String(form.phone || "")} onChange={event => update("phone", event.target.value)} placeholder="(00) 00000-0000"/></Field></div><Field label="Classificações"><div className="mention-picker">{data.categories.length ? data.categories.map(item => { const selected = Array.isArray(form.category_ids) && form.category_ids.includes(item.id); return <label key={item.id}><input type="checkbox" checked={selected} onChange={() => update("category_ids", selected ? (form.category_ids as string[]).filter(id => id !== item.id) : [...(Array.isArray(form.category_ids) ? form.category_ids : []), item.id])}/><span>{item.name}</span></label>; }) : <p>Use “Nova classificação” na área de clientes para organizar os cadastros.</p>}</div></Field><Field label="Observações"><textarea rows={3} value={String(form.notes || "")} onChange={event => update("notes", event.target.value)} placeholder="Contexto útil sobre este cliente"/></Field></>}
      {modal === "useful_phones" && <><Field label="Local ou serviço" required><input required value={String(form.name || "")} onChange={event => update("name", event.target.value)} placeholder="Ex.: Cartório, fórum ou órgão"/></Field><div className="field-pair"><Field label="Categoria"><input value={String(form.category || "")} onChange={event => update("category", event.target.value)} placeholder="Ex.: Cartório"/></Field><Field label="Cidade ou unidade"><input value={String(form.city || "")} onChange={event => update("city", event.target.value)} placeholder="Ex.: Cuiabá"/></Field></div><div className="field-pair"><Field label="Telefone" required><input required type="tel" value={String(form.phone || "")} onChange={event => update("phone", event.target.value)} placeholder="(00) 0000-0000"/></Field><Field label="Ramal"><input value={String(form.extension || "")} onChange={event => update("extension", event.target.value)} placeholder="Opcional"/></Field></div><Field label="Cadastro relacionado (opcional)"><select value={String(form.entity_id || "")} onChange={event => update("entity_id", event.target.value)}><option value="">Sem vínculo com cliente</option>{data.entities.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Observações"><textarea rows={3} value={String(form.notes || "")} onChange={event => update("notes", event.target.value)} placeholder="Horário, setor ou instruções para contato"/></Field></>}
      {modal === "categories" && <><Field label="Nome da categoria" required><input required value={String(form.name || "")} onChange={event => update("name", event.target.value)} placeholder="Ex.: Cliente, Parceiro, Fornecedor"/></Field><Field label="Descrição"><textarea rows={3} value={String(form.description || "")} onChange={event => update("description", event.target.value)} placeholder="Como esta categoria será usada?"/></Field></>}
      {modal === "relationships" && <><Field label="Origem" required><select required value={String(form.source_id || "")} onChange={event => update("source_id", event.target.value)}><option value="">Selecione um contato</option>{data.entities.map(item => <option key={item.id} value={item.id}>{item.name} ({item.kind})</option>)}</select></Field><Field label="Tipo de vínculo" required><input required value={String(form.label || "")} onChange={event => update("label", event.target.value)} placeholder="Ex.: representante de, indicado por, sócio de"/></Field><Field label="Destino" required><select required value={String(form.target_id || "")} onChange={event => update("target_id", event.target.value)}><option value="">Selecione um contato</option>{data.entities.map(item => <option key={item.id} value={item.id}>{item.name} ({item.kind})</option>)}</select></Field><Field label="Observações"><textarea rows={3} value={String(form.notes || "")} onChange={event => update("notes", event.target.value)}/></Field></>}
      {modal === "appointments" && <><Field label="Título" required><input required value={String(form.title || "")} onChange={event => update("title", event.target.value)} placeholder="Ex.: Reunião com cliente"/></Field><div className="field-pair"><Field label="Tipo"><select value={String(form.kind || "Reunião")} onChange={event => update("kind", event.target.value)}>{["Reunião", "Ligação", "Atendimento", "Visita", "Evento", "Lembrete", "Outro"].map(kind => <option key={kind}>{kind}</option>)}</select></Field><Field label="Status"><select value={String(form.status || "Agendado")} onChange={event => update("status", event.target.value)}>{["Agendado", "Realizado", "Cancelado", "Reagendado"].map(status => <option key={status}>{status}</option>)}</select></Field></div><div className="field-pair"><Field label="Início" required><input type="datetime-local" required value={String(form.starts_at || "").slice(0,16)} onChange={event => update("starts_at", event.target.value)}/></Field><Field label="Fim"><input type="datetime-local" value={String(form.ends_at || "").slice(0,16)} onChange={event => update("ends_at", event.target.value)}/></Field></div><Field label="Local"><input value={String(form.location || "")} onChange={event => update("location", event.target.value)} placeholder="Endereço ou link da reunião"/></Field><Field label="Contato relacionado"><select value={String(form.entity_id || "")} onChange={event => update("entity_id", event.target.value)}><option value="">Sem contato relacionado</option>{data.entities.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Resultado"><textarea rows={2} value={String(form.outcome || "")} onChange={event => update("outcome", event.target.value)} placeholder="Resumo após o compromisso"/></Field><Field label="Observações"><textarea rows={2} value={String(form.notes || "")} onChange={event => update("notes", event.target.value)}/></Field></>}
      {modal === "diary" && <><p className="diary-edit-note">Registro original de {prettyDate(diaryWallTime(String(form.occurred_at || "")))} às {timeOnly(diaryWallTime(String(form.occurred_at || "")))}. A edição será identificada automaticamente.</p><Field label="O que aconteceu?" required><textarea required rows={6} value={String(form.body || "")} onChange={event => update("body", event.target.value)} placeholder="Registre o fato com contexto suficiente para consulta futura."/></Field><Field label="Pessoas e empresas citadas (opcional)"><div className="mention-picker">{data.entities.length ? data.entities.map(item => { const selected = Array.isArray(form.entity_ids) && form.entity_ids.includes(item.id); return <label key={item.id}><input type="checkbox" checked={selected} onChange={() => update("entity_ids", selected ? (form.entity_ids as string[]).filter(id => id !== item.id) : [...(Array.isArray(form.entity_ids) ? form.entity_ids : []), item.id])}/><span>{item.name}</span><small>{item.kind}</small></label>; }) : <p>Cadastre uma pessoa ou empresa para relacioná-la ao registro.</p>}</div></Field></>}
    </div>{error && <div className="form-error" role="alert">{error}</div>}<div className="modal-footer"><button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Salvando…" : <><Check size={17}/> Salvar registro</>}</button></div></form></div></div>}
  </div>;
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: SessionUser) => void }) {
  const [needsSetup, setNeedsSetup] = useState(false);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<"login" | "setup">("login");
  const [email, setEmail] = useState("escritorio@otonnasser.com.br");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/status", { cache: "no-store" }).then(async response => await response.json() as { needsSetup?: boolean }).then(result => {
      const pending = Boolean(result.needsSetup);
      setNeedsSetup(pending); setMode(pending ? "setup" : "login");
    }).catch(() => setError("Não foi possível verificar o primeiro acesso.")).finally(() => setChecking(false));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (mode === "setup" && password !== confirmPassword) return setError("As senhas não coincidem");
    setSubmitting(true);
    try {
      const response = await fetch(mode === "setup" ? "/api/auth/setup" : "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, token: setupToken }) });
      const result = await response.json().catch(() => ({ error: "O servidor não concluiu a solicitação. Tente novamente." })) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível entrar");
      const me = await fetch("/api/auth/me", { cache: "no-store" });
      if (!me.ok) throw new Error("A sessão não pôde ser iniciada");
      const session = await me.json() as { user: SessionUser };
      onAuthenticated(session.user);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível entrar"); }
    finally { setSubmitting(false); }
  }

  return <div className="auth-shell">
    <section className="auth-brand"><div className="auth-monogram">ON</div><span>ADV.ON</span><h1>Gestão jurídica com acesso reservado.</h1><p>Relacionamentos, agenda e registros do escritório protegidos em um único ambiente.</p><small>OTON NASSER ADVOCACIA</small></section>
    <main className="auth-panel"><div className="auth-card"><div className="auth-card-icon"><LockKeyhole size={25}/></div><span className="eyebrow">ACESSO SEGURO</span><h2>{mode === "setup" ? "Ativar administrador" : "Entrar no ADV.ON"}</h2><p>{mode === "setup" ? "Defina a primeira senha administrativa usando o código de ativação." : "Use o acesso criado pelo administrador do escritório."}</p>
      {checking ? <div className="auth-checking">Verificando configuração…</div> : <form onSubmit={submit}>
        <Field label="E-mail" required><input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} disabled={mode === "setup"}/></Field>
        {mode === "setup" && <Field label="Código de ativação" required><input type="password" autoComplete="one-time-code" required value={setupToken} onChange={event => setSetupToken(event.target.value)} placeholder="Código fornecido pelo sistema"/></Field>}
        <Field label={mode === "setup" ? "Nova senha" : "Senha"} required><input type="password" autoComplete={mode === "setup" ? "new-password" : "current-password"} required value={password} onChange={event => setPassword(event.target.value)} placeholder="Mínimo 10 caracteres"/></Field>
        {mode === "setup" && <Field label="Confirmar senha" required><input type="password" autoComplete="new-password" required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)}/></Field>}
        {error && <div className="auth-error" role="alert"><AlertCircle size={16}/>{error}</div>}
        <button className="primary-button auth-submit" type="submit" disabled={submitting}>{submitting ? "Aguarde…" : mode === "setup" ? "Ativar e entrar" : "Entrar"}<ArrowRight size={17}/></button>
      </form>}
      {!needsSetup && <small className="auth-help">O cadastro e a recuperação de acesso são realizados pelo administrador.</small>}
    </div></main>
  </div>;
}

function UserAdministration({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const result = await response.json().catch(() => ({ error: "O servidor não concluiu a solicitação." })) as { users?: ManagedUser[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar usuários");
      setUsers(result.users || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar usuários"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadUsers(); }, [loadUsers]);

  async function createUser(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password }) });
      const result = await response.json().catch(() => ({ error: "O servidor não concluiu a solicitação." })) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível criar o usuário");
      setName(""); setEmail(""); setPassword(""); await loadUsers();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar o usuário"); }
    finally { setSaving(false); }
  }

  async function updateUser(id: string, change: { status?: string; password?: string }) {
    setError("");
    try {
      const response = await fetch("/api/admin/users", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...change }) });
      const result = await response.json().catch(() => ({ error: "O servidor não concluiu a solicitação." })) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível alterar o usuário");
      await loadUsers();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível alterar o usuário"); }
  }

  function resetPassword(user: ManagedUser) {
    const next = window.prompt(`Defina uma nova senha temporária para ${user.name}.\nMínimo de 10 caracteres, com maiúscula, minúscula e número.`);
    if (next) void updateUser(user.id, { password: next });
  }

  return <div className="users-admin-grid">
    <section className="panel user-create-card"><div className="panel-title"><div><h2>Novo usuário</h2><p>Somente o administrador pode liberar novos acessos.</p></div><span className="secure-badge"><ShieldCheck size={15}/> Administrador</span></div><form className="modal-fields" onSubmit={createUser}>
      <Field label="Nome completo" required><input required value={name} onChange={event => setName(event.target.value)} placeholder="Nome do colaborador"/></Field>
      <Field label="E-mail de acesso" required><input required type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="usuario@escritorio.com.br"/></Field>
      <Field label="Senha temporária" required><input required type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Mínimo 10 caracteres"/></Field>
      <p className="password-note">Use letra maiúscula, minúscula e número. Entregue a senha diretamente ao usuário.</p>
      <button className="primary-button" type="submit" disabled={saving}><UserPlus size={17}/>{saving ? "Criando…" : "Criar usuário"}</button>
    </form></section>
    <section className="panel users-list-card"><div className="list-toolbar"><div><h2>Usuários do sistema</h2><p>Todos os usuários ativos acessam os módulos operacionais.</p></div><span className="count-pill">{users.filter(user => user.status === "ATIVO").length} ativos</span></div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {loading ? <div className="loading-state">Carregando usuários…</div> : <div className="users-list">{users.map(user => <article key={user.id} className="user-row"><div className="entity-avatar">{initials(user.name)}</div><div className="user-details"><strong>{user.name}{user.id === currentUserId && <small> Você</small>}</strong><span>{user.email}</span><em>{user.role === "ADMINISTRADOR" ? "Administrador" : "Usuário"} · {user.last_login_at ? `último acesso ${new Date(user.last_login_at).toLocaleString("pt-BR", { timeZone: "America/Cuiaba" })}` : "ainda não acessou"}</em></div><span className={`status-badge ${user.status === "INATIVO" ? "cancelled" : "done"}`}>{user.status === "ATIVO" ? "Ativo" : "Inativo"}</span>{user.id !== currentUserId && <div className="user-actions"><button type="button" className="secondary-button" onClick={() => resetPassword(user)}>Redefinir senha</button><button type="button" className="secondary-button" onClick={() => void updateUser(user.id, { status: user.status === "ATIVO" ? "INATIVO" : "ATIVO" })}>{user.status === "ATIVO" ? "Bloquear" : "Ativar"}</button></div>}</article>)}</div>}
    </section>
  </div>;
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof CalendarDays; label: string; value: number; detail: string }) { return <div className="metric-card"><div className="metric-top"><span>{label}</span><Icon size={18}/></div><strong>{String(value).padStart(2, "0")}</strong><small>{detail}</small></div>; }
function PanelTitle({ title, subtitle, action }: { title: string; subtitle: string; action: () => void }) { return <div className="panel-title"><div><h2>{title}</h2><p>{subtitle}</p></div><button type="button" onClick={action}>Ver todos <ArrowUpRight size={16}/></button></div>; }
function EmptyState({ icon: Icon, title, description, action, onAction }: { icon: typeof CalendarDays; title: string; description: string; action?: string; onAction: () => void }) { return <div className="empty-state"><div><Icon size={25} strokeWidth={1.5}/></div><h3>{title}</h3><p>{description}</p>{action && <button type="button" onClick={onAction}>{action} <ArrowUpRight size={15}/></button>}</div>; }
function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) { return <div className="row-actions"><button type="button" aria-label="Editar registro" title="Editar" onClick={onEdit}><Pencil size={16}/></button><button type="button" aria-label="Arquivar registro" title="Arquivar" onClick={onDelete}><Trash2 size={16}/></button></div>; }
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) { return <label className="form-field"><span>{label}{required && <em> *</em>}</span>{children}</label>; }
