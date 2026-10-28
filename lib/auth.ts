import { env } from "cloudflare:workers";

export const SESSION_COOKIE = "adv_on_session";
export const ADMIN_EMAIL = "escritorio@otonnasser.com.br";
const encoder = new TextEncoder();
const SESSION_SECONDS = 8 * 60 * 60;
// Cloudflare Workers currently accepts at most 100,000 PBKDF2 iterations.
const PASSWORD_ITERATIONS = 100_000;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMINISTRADOR" | "USUARIO";
  status: "ATIVO" | "INATIVO";
};

function database() {
  if (!env.DB) throw new Error("Banco de dados indisponível");
  return env.DB;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function hmac(value: string) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET não configurado");
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

async function safeEqual(left: string, right: string) {
  const leftDigest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(left)));
  const rightDigest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(right)));
  let difference = 0;
  for (let index = 0; index < leftDigest.length; index += 1) difference |= leftDigest[index] ^ rightDigest[index];
  return difference === 0;
}

export function validatePassword(password: string) {
  if (password.length < 10) return "A senha deve ter pelo menos 10 caracteres";
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) return "Use letra maiúscula, minúscula e número";
  return null;
}

export async function hashPassword(password: string, suppliedSalt?: string) {
  const salt = suppliedSalt || bytesToBase64Url(crypto.getRandomValues(new Uint8Array(18)));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: base64UrlToBytes(salt), iterations: PASSWORD_ITERATIONS }, key, 256);
  return { hash: bytesToBase64Url(new Uint8Array(bits)), salt };
}

export async function verifyPassword(password: string, expectedHash: string, salt: string) {
  const result = await hashPassword(password, salt);
  return safeEqual(result.hash, expectedHash);
}

export async function ensureInitialAdmin() {
  const now = new Date().toISOString();
  await database().prepare("INSERT OR IGNORE INTO users (id, email, name, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind("initial-administrator", ADMIN_EMAIL, "Administrador", "ADMINISTRADOR", "PENDENTE", now, now).run();
}

export async function createSession(userId: string) {
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify({ userId, expiresAt: Date.now() + SESSION_SECONDS * 1000 })));
  return `${payload}.${await hmac(payload)}`;
}

export function sessionCookie(token: string) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function cookieValue(request: Request) {
  const cookies = request.headers.get("cookie") || "";
  return cookies.split(";").map(item => item.trim()).find(item => item.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1) || "";
}

export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const token = cookieValue(request);
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || !(await safeEqual(await hmac(payload), signature))) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as { userId?: string; expiresAt?: number };
    if (!parsed.userId || !parsed.expiresAt || parsed.expiresAt <= Date.now()) return null;
    const user = await database().prepare("SELECT id, email, name, role, status FROM users WHERE id = ? AND status = 'ATIVO'").bind(parsed.userId).first<SessionUser>();
    return user || null;
  } catch {
    return null;
  }
}

export async function requireAdministrator(request: Request) {
  const user = await getSessionUser(request);
  return user?.role === "ADMINISTRADOR" ? user : null;
}

export async function verifySetupToken(token: string) {
  return Boolean(env.ADMIN_SETUP_TOKEN && token && await safeEqual(token, env.ADMIN_SETUP_TOKEN));
}
