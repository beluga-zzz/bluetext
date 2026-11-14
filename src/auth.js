// B2Blue accounts: email + password logins that only an admin can create.
//
// - Passwords are hashed with PBKDF2-SHA256 (100,000 rounds, the most Workers allows) and a random salt.
// - Sessions are signed cookies: userId.sessionVersion.expiry.signature. Bumping a user's
//   session_ver (password reset, disable) signs them out everywhere immediately.
// - 5 wrong passwords in a row lock the account for 15 minutes.
// - The very first admin is created on the setup screen, which requires the old shared app password.

export const AUTH_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
     role TEXT NOT NULL DEFAULT 'member', pw_hash TEXT NOT NULL, pw_salt TEXT NOT NULL,
     must_change INTEGER NOT NULL DEFAULT 1, disabled INTEGER NOT NULL DEFAULT 0,
     session_ver INTEGER NOT NULL DEFAULT 1, failed INTEGER NOT NULL DEFAULT 0,
     locked_until INTEGER, last_login INTEGER, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];

export const COOKIE = "b2_session";
const SESSION_DAYS = 30;
const ITERATIONS = 100000;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60e3;
const MIN_PASSWORD = 10;

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const enc = new TextEncoder();
const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" }[c]));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function hashPassword(password, saltHex) {
  const salt = saltHex ? Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16))) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256);
  return { hash: hex(bits), salt: hex(salt) };
}

export function tempPassword() {
  // 12 characters from an alphabet without look-alikes (no 0/O, 1/l/I).
  const abc = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => abc[b % abc.length]).join("");
}

function checkPasswordRules(pw) {
  if (typeof pw !== "string" || pw.length < MIN_PASSWORD) throw new AuthError(400, `Use at least ${MIN_PASSWORD} characters`);
  if (pw.length > 200) throw new AuthError(400, "That password is too long");
}

function normEmail(e) {
  const email = String(e || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AuthError(400, "Enter a valid email");
  return email;
}

// ---------- session signing ----------

async function signingKey(env) {
  let row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'session_secret'").first();
  if (!row) {
    await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('session_secret', ?)")
      .bind(hex(crypto.getRandomValues(new Uint8Array(32)))).run();
    row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'session_secret'").first();
  }
  return crypto.subtle.importKey("raw", enc.encode(row.value), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function sign(env, payload) {
  return b64url(await crypto.subtle.sign("HMAC", await signingKey(env), enc.encode(payload)));
}

async function sessionCookie(env, request, user) {
  const exp = Date.now() + SESSION_DAYS * 86400e3;
  const payload = `${user.id}.${user.session_ver}.${exp}`;
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${payload}.${await sign(env, payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function readCookie(request, name) {
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, mustChange: Boolean(u.must_change) });

export async function currentUser(request, env) {
  const host = new URL(request.url).hostname;
  if (env.DEV_EMAIL && (host === "localhost" || host === "127.0.0.1") && env.DEV_SKIP_LOGIN) {
    return { id: "dev", email: env.DEV_EMAIL, name: "Dev", role: "admin", must_change: 0 };
  }
  const raw = readCookie(request, COOKIE);
  const parts = raw ? raw.split(".") : [];
  if (parts.length !== 4) throw new AuthError(401, "Not signed in");
  const [id, ver, exp, sig] = parts;
  if (!safeEqual(sig, await sign(env, `${id}.${ver}.${exp}`)) || Number(exp) < Date.now()) throw new AuthError(401, "Not signed in");
  const u = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  if (!u || u.disabled || String(u.session_ver) !== ver) throw new AuthError(401, "Not signed in");
  return u;
}

// ---------- public endpoints ----------

export async function authState(env) {
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
  return { needsSetup: n.n === 0 };
}

// First admin. Only works while there are no users, and needs the old shared app password.
export async function setup(request, env, body, legacyPassword) {
  const { needsSetup } = await authState(env);
  if (!needsSetup) throw new AuthError(409, "Setup is already done. Sign in instead.");
  if (!safeEqual(String(body.setupPassword || ""), legacyPassword)) {
    await new Promise((r) => setTimeout(r, 800));
    throw new AuthError(401, "The current app password is wrong");
  }
  const email = normEmail(body.email);
  const name = String(body.name || "").trim().slice(0, 80) || email.split("@")[0];
  checkPasswordRules(body.password);
  const { hash, salt } = await hashPassword(body.password);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO users (id, email, name, role, pw_hash, pw_salt, must_change, last_login, created_at) VALUES (?, ?, ?, 'admin', ?, ?, 0, ?, ?)"
  ).bind(id, email, name, hash, salt, Date.now(), Date.now()).run();
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  return { user: publicUser(user), cookie: await sessionCookie(env, request, user) };
}

export async function login(request, env, body) {
  const generic = new AuthError(401, "Wrong email or password");
  let email;
  try { email = normEmail(body.email); } catch { throw generic; }
  const u = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  const now = Date.now();
  if (u && u.locked_until && u.locked_until > now) {
    const mins = Math.ceil((u.locked_until - now) / 60e3);
    throw new AuthError(429, `Too many wrong passwords. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`);
  }
  // Hash even when the email is unknown, so response time doesn't reveal which emails exist.
  const { hash } = await hashPassword(String(body.password || ""), u ? u.pw_salt : "00000000000000000000000000000000");
  if (!u || !safeEqual(hash, u.pw_hash)) {
    if (u) {
      const failed = u.failed + 1;
      await env.DB.prepare("UPDATE users SET failed = ?, locked_until = ? WHERE id = ?")
        .bind(failed >= MAX_FAILS ? 0 : failed, failed >= MAX_FAILS ? now + LOCK_MS : null, u.id).run();
    }
    throw generic;
  }
  if (u.disabled) throw new AuthError(403, "This account is turned off. Ask your admin.");
  await env.DB.prepare("UPDATE users SET failed = 0, locked_until = NULL, last_login = ? WHERE id = ?").bind(now, u.id).run();
  return { user: publicUser(u), cookie: await sessionCookie(env, request, u) };
}

export async function changePassword(request, env, user, body) {
  const { hash } = await hashPassword(String(body.current || ""), user.pw_salt);
  if (!safeEqual(hash, user.pw_hash)) throw new AuthError(400, "Your current password is wrong");
  checkPasswordRules(body.password);
  if (body.password === body.current) throw new AuthError(400, "Pick a new password, not the same one");
  const next = await hashPassword(body.password);
  const ver = user.session_ver + 1;
  await env.DB.prepare("UPDATE users SET pw_hash = ?, pw_salt = ?, must_change = 0, session_ver = ? WHERE id = ?")
    .bind(next.hash, next.salt, ver, user.id).run();
  // New session version signs out other devices; this device gets a fresh cookie.
  return { cookie: await sessionCookie(env, request, { ...user, session_ver: ver }) };
}

export function me(user) {
  return publicUser(user);
}

// ---------- admin: manage users ----------

async function userWorkspaces(env) {
  const rows = await env.DB.prepare("SELECT m.email, w.id, w.name FROM members m JOIN workspaces w ON w.id = m.workspace_id").all();
  const by = {};
  for (const r of rows.results) (by[r.email] ||= []).push({ id: r.id, name: r.name });
  return by;
}

async function setWorkspaces(env, email, ids) {
  if (!Array.isArray(ids)) return;
  const valid = await env.DB.prepare("SELECT id FROM workspaces").all();
  const ok = new Set(valid.results.map((w) => w.id));
  const stmts = [env.DB.prepare("DELETE FROM members WHERE email = ?").bind(email)];
  for (const id of ids) if (ok.has(id)) stmts.push(env.DB.prepare("INSERT OR IGNORE INTO members (workspace_id, email) VALUES (?, ?)").bind(id, email));
  await env.DB.batch(stmts);
}

export async function adminUsers(request, env, admin, segs) {
  const method = request.method;
  const [id, action] = segs;
  const body = method === "GET" || method === "DELETE" ? {} : await request.json().catch(() => ({}));

  if (!id && method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM users ORDER BY role, name").all();
    const ws = await userWorkspaces(env);
    return rows.results.map((u) => ({
      ...publicUser(u), disabled: Boolean(u.disabled), lastLogin: u.last_login,
      locked: Boolean(u.locked_until && u.locked_until > Date.now()), you: u.id === admin.id,
      workspaces: ws[u.email] || [],
    }));
  }

  if (!id && method === "POST") {
    const email = normEmail(body.email);
    const name = String(body.name || "").trim().slice(0, 80);
    if (!name) throw new AuthError(400, "Add a name");
    const role = body.role === "admin" ? "admin" : "member";
    const exists = await env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first();
    if (exists) throw new AuthError(409, "Someone already has that email");
    const temp = tempPassword();
    const { hash, salt } = await hashPassword(temp);
    await env.DB.prepare(
      "INSERT INTO users (id, email, name, role, pw_hash, pw_salt, must_change, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)"
    ).bind(crypto.randomUUID(), email, name, role, hash, salt, Date.now()).run();
    await setWorkspaces(env, email, body.workspaces || []);
    return { ok: true, email, tempPassword: temp };
  }

  const u = id && await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  if (!u) throw new AuthError(404, "User not found");
  const self = u.id === admin.id;

  if (action === "reset" && method === "POST") {
    const temp = tempPassword();
    const { hash, salt } = await hashPassword(temp);
    await env.DB.prepare(
      "UPDATE users SET pw_hash = ?, pw_salt = ?, must_change = 1, session_ver = session_ver + 1, failed = 0, locked_until = NULL WHERE id = ?"
    ).bind(hash, salt, u.id).run();
    return { ok: true, email: u.email, tempPassword: temp, signedOut: self };
  }

  if (!action && method === "PATCH") {
    const updates = { name: u.name, role: u.role, disabled: u.disabled, session_ver: u.session_ver };
    if (body.name !== undefined) updates.name = String(body.name).trim().slice(0, 80) || u.name;
    if (body.role !== undefined) {
      if (self && body.role !== "admin") throw new AuthError(400, "You can't remove your own admin access");
      updates.role = body.role === "admin" ? "admin" : "member";
    }
    if (body.disabled !== undefined) {
      if (self && body.disabled) throw new AuthError(400, "You can't turn off your own account");
      updates.disabled = body.disabled ? 1 : 0;
      if (updates.disabled) updates.session_ver += 1; // sign them out now
    }
    await env.DB.prepare("UPDATE users SET name = ?, role = ?, disabled = ?, session_ver = ?, failed = 0, locked_until = NULL WHERE id = ?")
      .bind(updates.name, updates.role, updates.disabled, updates.session_ver, u.id).run();
    if (body.workspaces !== undefined) await setWorkspaces(env, u.email, body.workspaces);
    return { ok: true };
  }

  if (!action && method === "DELETE") {
    if (self) throw new AuthError(400, "You can't delete your own account");
    await env.DB.batch([
      env.DB.prepare("DELETE FROM members WHERE email = ?").bind(u.email),
      env.DB.prepare("DELETE FROM users WHERE id = ?").bind(u.id),
    ]);
    return { ok: true };
  }

  throw new AuthError(404, "Not found");
}
