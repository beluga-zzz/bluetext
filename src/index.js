// Blue Text: Cloudflare Worker API.
// Serves /api/* and proxies to each workspace's BlueBubbles server.
// Static UI in /public is served by Workers Assets.

const DEFAULT_TAGS = [
  ["New", "#0A84FF"],
  ["Contacted", "#5E5CE6"],
  ["Replied", "#30B0C7"],
  ["Booked", "#34C759"],
  ["Closed", "#8E8E93"],
  ["Do Not Text", "#FF3B30"],
];

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS workspaces (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, bb_url TEXT NOT NULL,
     bb_password TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS members (
     workspace_id TEXT NOT NULL, email TEXT NOT NULL,
     PRIMARY KEY (workspace_id, email))`,
  `CREATE TABLE IF NOT EXISTS tags (
     id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL,
     color TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS contacts (
     workspace_id TEXT NOT NULL, address TEXT NOT NULL, name TEXT,
     PRIMARY KEY (workspace_id, address))`,
  `CREATE TABLE IF NOT EXISTS contact_tags (
     workspace_id TEXT NOT NULL, address TEXT NOT NULL, tag_id TEXT NOT NULL,
     PRIMARY KEY (workspace_id, address, tag_id))`,
];

let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
  schemaReady = true;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

// ---------- Auth (single app password) ----------
// One password gates the whole app. Override with an APP_PASSWORD secret.
const DEFAULT_PASSWORD = "blue33!";
const COOKIE = "bt_session";
const SESSION_DAYS = 30;

function appPassword(env) {
  return env.APP_PASSWORD || DEFAULT_PASSWORD;
}

async function sessionToken(env) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(appPassword(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("bluetext-session-v1"));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" }[c]));
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function readCookie(request, name) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

const USER = "team";

async function getUser(request, env) {
  const host = new URL(request.url).hostname;
  if (env.DEV_EMAIL && (host === "localhost" || host === "127.0.0.1")) return USER;
  const token = readCookie(request, COOKIE);
  if (token && safeEqual(token, await sessionToken(env))) return USER;
  throw new HttpError(401, "Not signed in");
}

function isAdmin() {
  return true;
}

async function handleLogin(request, env) {
  const body = await readBody(request);
  const ok = typeof body.password === "string" && safeEqual(body.password, appPassword(env));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    throw new HttpError(401, "Wrong password");
  }
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "content-type": "application/json",
      "set-cookie": `${COOKIE}=${await sessionToken(env)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`,
    },
  });
}

function handleLogout() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json", "set-cookie": `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` },
  });
}

// ---------- Helpers ----------

function normalizeAddress(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (s.includes("@")) return s.toLowerCase();
  const digits = s.replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  if (s.startsWith("+") && digits.length >= 10) return "+" + digits;
  return null;
}

function addressFromChatGuid(guid) {
  const i = String(guid).indexOf(";-;");
  return i === -1 ? null : normalizeAddress(guid.slice(i + 3));
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Request body must be JSON");
  }
}

async function bb(ws, path, { method = "GET", query = {}, body } = {}) {
  const base = ws.bb_url.replace(/\/+$/, "");
  const params = new URLSearchParams({ ...query, password: ws.bb_password });
  let res;
  try {
    res = await fetch(`${base}/api/v1/${path}?${params}`, {
      method,
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    throw new HttpError(502, `Could not reach the message server (${e.name === "TimeoutError" ? "timed out" : e.message})`);
  }
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new HttpError(502, `Message server returned HTTP ${res.status} with a non-JSON reply`);
  }
  if (!res.ok || (data.status && data.status >= 400)) {
    const detail = data?.error?.error || data?.message || `HTTP ${res.status}`;
    throw new HttpError(502, `Message server error: ${detail}`);
  }
  return data;
}

async function loadWorkspace(env, id) {
  const ws = await env.DB.prepare("SELECT * FROM workspaces WHERE id = ?").bind(id).first();
  if (!ws) throw new HttpError(404, "Workspace not found");
  return ws;
}

async function requireWorkspace(env, email, id) {
  const ws = await loadWorkspace(env, id);
  if (isAdmin(email, env)) return ws;
  const m = await env.DB.prepare("SELECT 1 FROM members WHERE workspace_id = ? AND email = ?")
    .bind(id, email).first();
  if (!m) throw new HttpError(403, "You don't have access to this workspace");
  return ws;
}

async function contactMap(env, wsId) {
  const [contacts, links] = await env.DB.batch([
    env.DB.prepare("SELECT address, name FROM contacts WHERE workspace_id = ?").bind(wsId),
    env.DB.prepare("SELECT address, tag_id FROM contact_tags WHERE workspace_id = ?").bind(wsId),
  ]);
  const map = {};
  for (const c of contacts.results) map[c.address] = { name: c.name || null, tagIds: [] };
  for (const l of links.results) {
    (map[l.address] ||= { name: null, tagIds: [] }).tagIds.push(l.tag_id);
  }
  return map;
}

function messageText(m) {
  if (m.text && m.text.trim() && m.text !== "￼") return m.text.replace(/￼/g, "").trim() || "[Attachment]";
  if (m.attachments && m.attachments.length) return "[Attachment]";
  return m.text || "";
}

function isReaction(m) {
  return Boolean(m.associatedMessageGuid && m.associatedMessageType);
}

// ---------- Handlers ----------

async function handleMe(env, email) {
  const admin = isAdmin(email, env);
  const rows = admin
    ? await env.DB.prepare("SELECT id, name FROM workspaces ORDER BY name").all()
    : await env.DB.prepare(
        `SELECT w.id, w.name FROM workspaces w JOIN members m ON m.workspace_id = w.id
         WHERE m.email = ? ORDER BY w.name`
      ).bind(email).all();
  return json({ email, isAdmin: admin, workspaces: rows.results });
}

async function handleAdmin(request, env, segs) {
  // segs: ["workspaces", id?, sub?, subId?]
  const method = request.method;
  if (segs[0] !== "workspaces") throw new HttpError(404, "Not found");
  const id = segs[1];

  if (!id && method === "GET") {
    const ws = await env.DB.prepare("SELECT id, name, bb_url, created_at FROM workspaces ORDER BY name").all();
    const mem = await env.DB.prepare("SELECT workspace_id, email FROM members ORDER BY email").all();
    return json(ws.results.map((w) => ({
      ...w,
      members: mem.results.filter((m) => m.workspace_id === w.id).map((m) => m.email),
    })));
  }

  if (!id && method === "POST") {
    const b = await readBody(request);
    const name = String(b.name || "").trim();
    const url = String(b.bb_url || "").trim().replace(/\/+$/, "");
    const pw = String(b.bb_password || "");
    if (!name || !/^https?:\/\//.test(url) || !pw) {
      throw new HttpError(400, "Name, a server URL starting with https://, and a password are required");
    }
    const wsId = crypto.randomUUID();
    const stmts = [
      env.DB.prepare("INSERT INTO workspaces (id, name, bb_url, bb_password, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(wsId, name, url, pw, Date.now()),
      ...DEFAULT_TAGS.map(([n, c], i) =>
        env.DB.prepare("INSERT INTO tags (id, workspace_id, name, color, position) VALUES (?, ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), wsId, n, c, i)),
    ];
    await env.DB.batch(stmts);
    return json({ id: wsId }, 201);
  }

  if (!id) throw new HttpError(405, "Method not allowed");
  const ws = await loadWorkspace(env, id);
  const sub = segs[2];

  if (!sub && method === "PUT") {
    const b = await readBody(request);
    const name = b.name !== undefined ? String(b.name).trim() : ws.name;
    const url = b.bb_url !== undefined ? String(b.bb_url).trim().replace(/\/+$/, "") : ws.bb_url;
    const pw = b.bb_password ? String(b.bb_password) : ws.bb_password;
    if (!name || !/^https?:\/\//.test(url)) throw new HttpError(400, "Invalid name or URL");
    await env.DB.prepare("UPDATE workspaces SET name = ?, bb_url = ?, bb_password = ? WHERE id = ?")
      .bind(name, url, pw, id).run();
    return json({ ok: true });
  }

  if (!sub && method === "DELETE") {
    await env.DB.batch(
      ["contact_tags", "contacts", "tags", "members"].map((t) =>
        env.DB.prepare(`DELETE FROM ${t} WHERE workspace_id = ?`).bind(id))
        .concat(env.DB.prepare("DELETE FROM workspaces WHERE id = ?").bind(id))
    );
    return json({ ok: true });
  }

  if (sub === "test" && method === "POST") {
    const r = await bb(ws, "ping");
    return json({ ok: true, reply: r.data });
  }

  if (sub === "members" && method === "POST") {
    const b = await readBody(request);
    const email = String(b.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "Enter a valid email");
    await env.DB.prepare("INSERT OR IGNORE INTO members (workspace_id, email) VALUES (?, ?)").bind(id, email).run();
    return json({ ok: true }, 201);
  }

  if (sub === "members" && segs[3] && method === "DELETE") {
    await env.DB.prepare("DELETE FROM members WHERE workspace_id = ? AND email = ?")
      .bind(id, decodeURIComponent(segs[3]).toLowerCase()).run();
    return json({ ok: true });
  }

  throw new HttpError(404, "Not found");
}

async function handleWorkspace(request, env, email, wsId, segs) {
  const ws = await requireWorkspace(env, email, wsId);
  const method = request.method;
  const url = new URL(request.url);
  const [a, b, c] = segs;

  // GET /chats
  if (a === "chats" && !b && method === "GET") {
    const [r, contacts] = await Promise.all([
      bb(ws, "chat/query", { method: "POST", body: { limit: 500, offset: 0, with: ["lastMessage", "participants"], sort: "lastmessage" } }),
      contactMap(env, wsId),
    ]);
    const chats = (r.data || [])
      .filter((ch) => ch.lastMessage)
      .map((ch) => {
        const participants = (ch.participants || []).map((p) => normalizeAddress(p.address) || p.address);
        const isGroup = participants.length > 1;
        const address = isGroup ? null : participants[0] || normalizeAddress(ch.chatIdentifier) || ch.chatIdentifier;
        const contact = (address && contacts[address]) || { name: null, tagIds: [] };
        const lm = ch.lastMessage;
        return {
          guid: ch.guid,
          isGroup,
          address,
          participants,
          name: contact.name || ch.displayName || null,
          tagIds: contact.tagIds,
          lastText: messageText(lm),
          lastFromMe: Boolean(lm.isFromMe),
          lastDate: lm.dateCreated || 0,
        };
      });
    return json(chats);
  }

  // GET /chats/:guid/messages
  if (a === "chats" && b && c === "messages" && method === "GET") {
    const guid = decodeURIComponent(b);
    const limit = Math.min(Number(url.searchParams.get("limit")) || 60, 200);
    const r = await bb(ws, `chat/${encodeURIComponent(guid)}/message`, {
      query: { limit: String(limit), sort: "DESC", with: "attachment,handle" },
    });
    const msgs = (r.data || [])
      .filter((m) => !isReaction(m))
      .map((m) => ({
        guid: m.guid,
        text: messageText(m),
        fromMe: Boolean(m.isFromMe),
        date: m.dateCreated || 0,
        delivered: Boolean(m.isDelivered || m.dateDelivered),
        read: m.dateRead || null,
        error: m.error || 0,
        sender: m.handle ? m.handle.address : null,
      }))
      .reverse();
    return json(msgs);
  }

  // POST /send  { chatGuid? | address?, text }
  if (a === "send" && method === "POST") {
    const body = await readBody(request);
    const text = String(body.text || "").trim();
    if (!text) throw new HttpError(400, "Message is empty");
    let chatGuid = body.chatGuid ? String(body.chatGuid) : null;
    let address = null;
    if (!chatGuid) {
      address = normalizeAddress(body.address);
      if (!address) throw new HttpError(400, "Enter a valid 10-digit phone number or email");
      chatGuid = `iMessage;-;${address}`;
    } else {
      address = addressFromChatGuid(chatGuid);
    }
    if (address) {
      const blocked = await env.DB.prepare(
        `SELECT 1 FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id
         WHERE ct.workspace_id = ? AND ct.address = ? AND lower(t.name) = 'do not text'`
      ).bind(wsId, address).first();
      if (blocked) throw new HttpError(409, "This contact is tagged Do Not Text. Remove the tag to message them.");
    }
    await bb(ws, "message/text", {
      method: "POST",
      body: { chatGuid, tempGuid: crypto.randomUUID(), message: text, method: "apple-script" },
    });
    return json({ ok: true, chatGuid });
  }

  // Tags
  if (a === "tags" && !b && method === "GET") {
    const r = await env.DB.prepare("SELECT id, name, color, position FROM tags WHERE workspace_id = ? ORDER BY position, name")
      .bind(wsId).all();
    return json(r.results);
  }
  if (a === "tags" && !b && method === "POST") {
    const body = await readBody(request);
    const name = String(body.name || "").trim();
    const color = /^#[0-9a-fA-F]{6}$/.test(body.color || "") ? body.color : "#0A84FF";
    if (!name) throw new HttpError(400, "Tag name is required");
    const max = await env.DB.prepare("SELECT COALESCE(MAX(position), -1) AS p FROM tags WHERE workspace_id = ?").bind(wsId).first();
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO tags (id, workspace_id, name, color, position) VALUES (?, ?, ?, ?, ?)")
      .bind(id, wsId, name, color, max.p + 1).run();
    return json({ id }, 201);
  }
  if (a === "tags" && b && method === "PUT") {
    const body = await readBody(request);
    const t = await env.DB.prepare("SELECT * FROM tags WHERE id = ? AND workspace_id = ?").bind(b, wsId).first();
    if (!t) throw new HttpError(404, "Tag not found");
    const name = body.name !== undefined ? String(body.name).trim() : t.name;
    const color = /^#[0-9a-fA-F]{6}$/.test(body.color || "") ? body.color : t.color;
    if (!name) throw new HttpError(400, "Tag name is required");
    await env.DB.prepare("UPDATE tags SET name = ?, color = ? WHERE id = ?").bind(name, color, b).run();
    return json({ ok: true });
  }
  if (a === "tags" && b && method === "DELETE") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM contact_tags WHERE workspace_id = ? AND tag_id = ?").bind(wsId, b),
      env.DB.prepare("DELETE FROM tags WHERE workspace_id = ? AND id = ?").bind(wsId, b),
    ]);
    return json({ ok: true });
  }

  // PUT /contacts/:address  { name?, tagIds? }
  if (a === "contacts" && b && method === "PUT") {
    const address = normalizeAddress(decodeURIComponent(b));
    if (!address) throw new HttpError(400, "Invalid contact address");
    const body = await readBody(request);
    const stmts = [];
    if (body.name !== undefined) {
      const name = String(body.name || "").trim() || null;
      stmts.push(env.DB.prepare(
        `INSERT INTO contacts (workspace_id, address, name) VALUES (?, ?, ?)
         ON CONFLICT(workspace_id, address) DO UPDATE SET name = excluded.name`
      ).bind(wsId, address, name));
    }
    if (Array.isArray(body.tagIds)) {
      const valid = await env.DB.prepare("SELECT id FROM tags WHERE workspace_id = ?").bind(wsId).all();
      const ok = new Set(valid.results.map((r) => r.id));
      stmts.push(env.DB.prepare("DELETE FROM contact_tags WHERE workspace_id = ? AND address = ?").bind(wsId, address));
      for (const t of new Set(body.tagIds)) {
        if (ok.has(t)) {
          stmts.push(env.DB.prepare("INSERT INTO contact_tags (workspace_id, address, tag_id) VALUES (?, ?, ?)")
            .bind(wsId, address, t));
        }
      }
    }
    if (stmts.length) await env.DB.batch(stmts);
    return json({ ok: true, address });
  }

  throw new HttpError(404, "Not found");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      await ensureSchema(env);
      if (url.pathname === "/api/login" && request.method === "POST") return await handleLogin(request, env);
      if (url.pathname === "/api/logout" && request.method === "POST") return handleLogout();
      const email = await getUser(request, env);
      const segs = url.pathname.replace(/^\/api\//, "").split("/").filter(Boolean);
      if (segs[0] === "me" && request.method === "GET") return handleMe(env, email);
      if (segs[0] === "admin") {
        if (!isAdmin(email, env)) throw new HttpError(403, "Admins only");
        return await handleAdmin(request, env, segs.slice(1));
      }
      if (segs[0] === "w" && segs[1]) return await handleWorkspace(request, env, email, segs[1], segs.slice(2));
      throw new HttpError(404, "Not found");
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Something went wrong on our side" }, 500);
    }
  },
};
