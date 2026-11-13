// B2Blue automation: Cal.com bookings -> scheduled iMessages -> HubSpot timeline.
//
// Flow
//   1. Cal.com posts a booking webhook to /api/hooks/cal/:workspaceId.
//   2. We find or create the HubSpot contact and queue texts in the `outbox` table:
//      a confirmation now, a reminder ~24h before, and one ~1h before.
//   3. A cron trigger (every minute) sends what is due through the workspace's
//      BlueBubbles server and logs each text on the HubSpot contact.
//   4. BlueBubbles posts every new message to /api/hooks/bb/:workspaceId. Replies are
//      logged in HubSpot and hold automated texts for a few hours.

export const AUTOMATION_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS automation (
     workspace_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0,
     hs_token TEXT, cal_secret TEXT, hook_key TEXT NOT NULL,
     sender_name TEXT, company TEXT,
     tpl_confirm TEXT, tpl_reschedule TEXT, tpl_24h TEXT, tpl_1h TEXT,
     daily_cap INTEGER NOT NULL DEFAULT 50, updated_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS bookings (
     uid TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, email TEXT, name TEXT,
     phone TEXT, start_time INTEGER NOT NULL, tz TEXT, hs_contact_id TEXT,
     status TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS outbox (
     id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, booking_uid TEXT, phone TEXT NOT NULL,
     kind TEXT NOT NULL, body TEXT NOT NULL, send_at INTEGER NOT NULL,
     status TEXT NOT NULL, msg_guid TEXT, sent_at INTEGER, error TEXT, hs_logged INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS outbox_due ON outbox (status, send_at)`,
  `CREATE INDEX IF NOT EXISTS bookings_phone ON bookings (workspace_id, phone)`,
];

export const DEFAULT_TEMPLATES = {
  tpl_confirm: "Hi {first_name}, {sender} from {company} here. You're booked for {day} at {time}. Anything specific you want us to cover?",
  tpl_reschedule: "Hi {first_name}, got the update. You're now set for {day} at {time}. See you then!",
  tpl_24h: "Hi {first_name}, quick reminder about our call {day} at {time}. Still good?",
  tpl_1h: "Hi {first_name}, we're on at {time}, about an hour from now. See you there!",
};

const KIND_TEMPLATE = { confirm: "tpl_confirm", reschedule: "tpl_reschedule", r24: "tpl_24h", r1: "tpl_1h" };
const KIND_LABEL = { confirm: "confirmation", reschedule: "reschedule confirmation", r24: "24h reminder", r1: "1h reminder" };
const QUIET_START = 8; // no automated texts before 8am in the prospect's time zone
const QUIET_END = 20; // ...or after 8pm
const REPLY_HOLD_MS = 3 * 3600e3; // after a reply, hold automated texts this long
const SENDS_PER_TICK = 6;
const MIN = 60e3;

// ---------- small helpers ----------

export function normalizePhone(input) {
  if (!input) return null;
  const s = String(input).trim();
  const digits = s.replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  if (s.startsWith("+") && digits.length >= 10) return "+" + digits;
  return null;
}

function randomKey() {
  const b = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...b)).replace(/[+/=]/g, "");
}

function hourIn(ms, tz) {
  try {
    const h = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date(ms));
    return Number(h);
  } catch {
    return new Date(ms).getUTCHours();
  }
}

function fmt(ms, tz, opts) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts }).format(new Date(ms));
  } catch {
    return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(new Date(ms));
  }
}

// Move a time EARLIER until it falls inside sending hours (reminders should never land late).
function pullIntoSendingHours(ms, tz) {
  let t = ms;
  for (let i = 0; i < 200; i++) {
    const h = hourIn(t, tz);
    if (h >= QUIET_START && h < QUIET_END) return t;
    t -= 15 * MIN;
  }
  return ms;
}

function render(tpl, vars) {
  return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? vars[k] : m)).trim();
}

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "there";
}

export async function getAutomation(env, wsId) {
  let a = await env.DB.prepare("SELECT * FROM automation WHERE workspace_id = ?").bind(wsId).first();
  if (!a) {
    await env.DB.prepare("INSERT OR IGNORE INTO automation (workspace_id, hook_key, updated_at) VALUES (?, ?, ?)")
      .bind(wsId, randomKey(), Date.now()).run();
    a = await env.DB.prepare("SELECT * FROM automation WHERE workspace_id = ?").bind(wsId).first();
  }
  return a;
}

function templatesOf(a) {
  const t = {};
  for (const k of Object.keys(DEFAULT_TEMPLATES)) t[k] = (a[k] && a[k].trim()) || DEFAULT_TEMPLATES[k];
  return t;
}

// ---------- BlueBubbles ----------

async function bbCall(ws, path, { method = "GET", body } = {}) {
  const base = ws.bb_url.replace(/\/+$/, "");
  const res = await fetch(`${base}/api/v1/${path}?password=${encodeURIComponent(ws.bb_password)}`, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45000),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  if (!res.ok || !data || (data.status && data.status >= 400)) {
    const detail = data?.error?.error || data?.message || `HTTP ${res.status}`;
    throw new Error(`Message server: ${detail}`);
  }
  return data;
}

// ---------- HubSpot ----------

async function hs(env, token, path, { method = "GET", body } = {}) {
  const base = env.HUBSPOT_API_BASE || "https://api.hubapi.com";
  const res = await fetch(base + path, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) {
    const err = new Error(`HubSpot ${res.status}: ${data?.message || text.slice(0, 200)}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function testHubSpot(env, token) {
  await hs(env, token, "/crm/v3/objects/contacts?limit=1");
  return true;
}

async function findOrCreateContact(env, token, { email, name, phone }) {
  if (email) {
    const found = await hs(env, token, "/crm/v3/objects/contacts/search", {
      method: "POST",
      body: { filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }], properties: ["email", "phone"], limit: 1 },
    });
    if (found?.results?.length) {
      const c = found.results[0];
      if (phone && !c.properties?.phone) {
        await hs(env, token, `/crm/v3/objects/contacts/${c.id}`, { method: "PATCH", body: { properties: { phone } } }).catch(() => {});
      }
      return c.id;
    }
  }
  const parts = String(name || "").trim().split(/\s+/);
  const properties = { firstname: parts[0] || "", lastname: parts.slice(1).join(" ") };
  if (email) properties.email = email;
  if (phone) properties.phone = phone;
  try {
    const c = await hs(env, token, "/crm/v3/objects/contacts", { method: "POST", body: { properties } });
    return c.id;
  } catch (e) {
    // 409 = contact already exists; HubSpot puts the existing id in the message.
    const m = e.status === 409 && /Existing ID:\s*(\d+)/.exec(e.data?.message || "");
    if (m) return m[1];
    throw e;
  }
}

async function logMessage(env, token, contactId, text, ms) {
  const comm = await hs(env, token, "/crm/v3/objects/communications", {
    method: "POST",
    body: {
      properties: {
        hs_communication_channel_type: "SMS",
        hs_communication_logged_from: "CRM",
        hs_communication_body: text,
        hs_timestamp: new Date(ms).toISOString(),
      },
    },
  });
  await hs(env, token, `/crm/v3/objects/communications/${comm.id}/associations/contact/${contactId}/communication_to_contact`, { method: "PUT" });
  return comm.id;
}

async function ensureContactId(env, a, booking) {
  if (booking.hs_contact_id) return booking.hs_contact_id;
  const id = await findOrCreateContact(env, a.hs_token, booking);
  await env.DB.prepare("UPDATE bookings SET hs_contact_id = ? WHERE uid = ?").bind(id, booking.uid).run();
  booking.hs_contact_id = id;
  return id;
}

// ---------- Cal.com webhook ----------

async function hmacHex(secret, body) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function phoneFromBooking(p) {
  const r = p.responses || {};
  const direct = r.attendeePhoneNumber?.value || p.attendees?.[0]?.phoneNumber || r.phone?.value || r.phoneNumber?.value;
  if (normalizePhone(direct)) return normalizePhone(direct);
  for (const [k, v] of Object.entries(r)) {
    const val = v && typeof v === "object" ? v.value : v;
    const label = (v && v.label) || k;
    if (/phone/i.test(label) || /phone/i.test(k)) {
      const n = normalizePhone(typeof val === "string" ? val : "");
      if (n) return n;
    }
  }
  return null;
}

async function queue(env, row) {
  await env.DB.prepare(
    `INSERT INTO outbox (id, workspace_id, booking_uid, phone, kind, body, send_at, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
  ).bind(crypto.randomUUID(), row.workspace_id, row.booking_uid, row.phone, row.kind, row.body, row.send_at, Date.now()).run();
}

async function scheduleBooking(env, ws, a, booking, firstKind) {
  const tpl = templatesOf(a);
  const tz = booking.tz || "America/New_York";
  const vars = {
    first_name: firstName(booking.name),
    name: booking.name || "",
    sender: a.sender_name || "Jacob",
    company: a.company || ws.name,
    day: fmt(booking.start_time, tz, { weekday: "long", month: "short", day: "numeric" }),
    time: fmt(booking.start_time, tz, { hour: "numeric", minute: "2-digit", timeZoneName: "short" }),
  };
  const now = Date.now();
  const base = { workspace_id: ws.id, booking_uid: booking.uid, phone: booking.phone };
  // Confirmation goes out right away: they just booked, so they're at their phone.
  await queue(env, { ...base, kind: firstKind, body: render(tpl[KIND_TEMPLATE[firstKind]], vars), send_at: now });
  // 24h reminder, pulled earlier into sending hours. Skipped if the call is less than ~26h away.
  const r24 = pullIntoSendingHours(booking.start_time - 24 * 3600e3, tz);
  if (r24 > now + 2 * 3600e3) {
    const dayWord = fmt(booking.start_time, tz, { year: "numeric", month: "numeric", day: "numeric" }) ===
      fmt(r24 + 24 * 3600e3, tz, { year: "numeric", month: "numeric", day: "numeric" }) ? "tomorrow" : vars.day;
    await queue(env, { ...base, kind: "r24", body: render(tpl.tpl_24h, { ...vars, day: dayWord }), send_at: r24 });
  }
  // 1h reminder. Skipped if the call starts within ~75 minutes.
  const r1 = booking.start_time - 60 * MIN;
  if (r1 > now + 15 * MIN) {
    await queue(env, { ...base, kind: "r1", body: render(tpl.tpl_1h, vars), send_at: r1 });
  }
}

async function cancelPending(env, bookingUid, reason) {
  await env.DB.prepare("UPDATE outbox SET status = 'cancelled', error = ? WHERE booking_uid = ? AND status = 'pending'")
    .bind(reason, bookingUid).run();
}

export async function handleCalHook(request, env, ws) {
  const a = await getAutomation(env, ws.id);
  const raw = await request.text();
  if (!a.cal_secret) return { status: 409, body: { error: "Set the Cal.com webhook secret in Automation settings first" } };
  const given = (request.headers.get("x-cal-signature-256") || "").toLowerCase();
  const want = await hmacHex(a.cal_secret, raw);
  if (!given || given !== want) return { status: 401, body: { error: "Bad signature" } };
  let evt;
  try { evt = JSON.parse(raw); } catch { return { status: 400, body: { error: "Body must be JSON" } }; }
  const type = evt.triggerEvent;
  const p = evt.payload || evt;
  if (type === "PING" || !p) return { status: 200, body: { ok: true, ping: true } };
  if (!a.enabled) return { status: 200, body: { ok: true, skipped: "automation is off" } };

  if (type === "BOOKING_CANCELLED" || type === "BOOKING_REJECTED") {
    await env.DB.prepare("UPDATE bookings SET status = 'cancelled' WHERE uid = ? AND workspace_id = ?").bind(p.uid, ws.id).run();
    await cancelPending(env, p.uid, "booking cancelled");
    return { status: 200, body: { ok: true } };
  }
  if (type !== "BOOKING_CREATED" && type !== "BOOKING_RESCHEDULED") return { status: 200, body: { ok: true, ignored: type } };

  const attendee = p.attendees?.[0] || {};
  const phone = phoneFromBooking(p);
  const booking = {
    uid: p.uid,
    workspace_id: ws.id,
    email: (attendee.email || p.responses?.email?.value || "").toLowerCase() || null,
    name: attendee.name || p.responses?.name?.value || "",
    phone,
    start_time: Date.parse(p.startTime),
    tz: attendee.timeZone || p.organizer?.timeZone || "America/New_York",
    hs_contact_id: null,
  };
  if (!booking.uid || !booking.start_time) return { status: 400, body: { error: "Booking is missing uid or startTime" } };
  if (!phone) return { status: 200, body: { ok: true, skipped: "no valid phone number on the booking" } };

  if (type === "BOOKING_RESCHEDULED" && p.rescheduleUid) {
    await env.DB.prepare("UPDATE bookings SET status = 'rescheduled' WHERE uid = ? AND workspace_id = ?").bind(p.rescheduleUid, ws.id).run();
    await cancelPending(env, p.rescheduleUid, "booking rescheduled");
    const old = await env.DB.prepare("SELECT hs_contact_id FROM bookings WHERE uid = ?").bind(p.rescheduleUid).first();
    if (old?.hs_contact_id) booking.hs_contact_id = old.hs_contact_id;
  }
  const exists = await env.DB.prepare("SELECT 1 FROM bookings WHERE uid = ?").bind(booking.uid).first();
  if (exists) return { status: 200, body: { ok: true, duplicate: true } }; // Cal retries; don't double-text

  await env.DB.prepare(
    `INSERT INTO bookings (uid, workspace_id, email, name, phone, start_time, tz, hs_contact_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`
  ).bind(booking.uid, ws.id, booking.email, booking.name, phone, booking.start_time, booking.tz, booking.hs_contact_id, Date.now()).run();

  await scheduleBooking(env, ws, a, booking, type === "BOOKING_RESCHEDULED" ? "reschedule" : "confirm");
  if (a.hs_token) {
    try { await ensureContactId(env, a, booking); } catch (e) { console.error("hubspot contact", e.message); }
  }
  return { status: 200, body: { ok: true, queued: true } };
}

// ---------- BlueBubbles webhook (replies + manual sends) ----------

export async function handleBbHook(request, env, ws, key) {
  const a = await getAutomation(env, ws.id);
  if (!key || key !== a.hook_key) return { status: 401, body: { error: "Bad key" } };
  let evt;
  try { evt = await request.json(); } catch { return { status: 400, body: { error: "Body must be JSON" } }; }
  if (evt.type !== "new-message" || !evt.data) return { status: 200, body: { ok: true, ignored: evt.type } };
  const m = evt.data;
  if (m.associatedMessageGuid && m.associatedMessageType) return { status: 200, body: { ok: true, ignored: "reaction" } };
  const chatGuid = m.chats?.[0]?.guid || "";
  if (m.chats?.[0]?.participants?.length > 1 || /;\+;/.test(chatGuid)) return { status: 200, body: { ok: true, ignored: "group" } };
  const phone = normalizePhone(m.handle?.address || chatGuid.split(";-;")[1]);
  if (!phone) return { status: 200, body: { ok: true, ignored: "no phone" } };
  const text = (m.text || "").replace(/￼/g, "").trim() || (m.attachments?.length ? "[Attachment]" : "");
  if (!text) return { status: 200, body: { ok: true, ignored: "empty" } };

  const booking = await env.DB.prepare(
    "SELECT * FROM bookings WHERE workspace_id = ? AND phone = ? ORDER BY created_at DESC LIMIT 1"
  ).bind(ws.id, phone).first();
  if (!booking) return { status: 200, body: { ok: true, ignored: "not a B2Blue booking" } };

  const at = m.dateCreated || Date.now();
  if (m.isFromMe) {
    // Skip our own automated sends (already logged when sent).
    const ours = await env.DB.prepare(
      "SELECT 1 FROM outbox WHERE workspace_id = ? AND phone = ? AND (msg_guid = ? OR (body = ? AND sent_at > ?)) LIMIT 1"
    ).bind(ws.id, phone, m.guid || "", text, Date.now() - 15 * MIN).first();
    if (ours) return { status: 200, body: { ok: true, ignored: "automated send" } };
  } else {
    // Prospect replied: hold automated texts so nothing lands on top of a live conversation.
    const holdUntil = at + REPLY_HOLD_MS;
    await env.DB.prepare(
      "UPDATE outbox SET status = 'cancelled', error = 'prospect replied; rep has the conversation' WHERE booking_uid = ? AND status = 'pending' AND kind = 'r1' AND send_at < ?"
    ).bind(booking.uid, holdUntil).run();
    await env.DB.prepare("UPDATE outbox SET send_at = ? WHERE booking_uid = ? AND status = 'pending' AND send_at < ?")
      .bind(holdUntil, booking.uid, holdUntil).run();
  }
  if (a.hs_token) {
    try {
      const cid = await ensureContactId(env, a, booking);
      const label = m.isFromMe ? "iMessage sent (from inbox)" : "iMessage reply from prospect";
      await logMessage(env, a.hs_token, cid, `${label}:\n${text}`, at);
    } catch (e) {
      console.error("hubspot log reply", e.message);
      return { status: 200, body: { ok: true, hubspot: e.message } };
    }
  }
  return { status: 200, body: { ok: true, logged: true } };
}

// ---------- Cron: send what's due, check delivery ----------

export async function runCron(env) {
  const now = Date.now();
  // A row stuck in 'sending' means a run died mid-send. Never resend (could double-text).
  await env.DB.prepare(
    "UPDATE outbox SET status = 'failed', error = 'send result unknown (worker stopped mid-send); not retried to avoid a double text' WHERE status = 'sending' AND sent_at < ?"
  ).bind(now - 10 * MIN).run();

  const due = await env.DB.prepare(
    `SELECT o.*, b.status AS booking_status FROM outbox o LEFT JOIN bookings b ON b.uid = o.booking_uid
     WHERE o.status = 'pending' AND o.send_at <= ? ORDER BY o.send_at LIMIT ?`
  ).bind(now, SENDS_PER_TICK).all();

  const wsCache = {};
  for (const row of due.results) {
    try {
      wsCache[row.workspace_id] ||= {
        ws: await env.DB.prepare("SELECT * FROM workspaces WHERE id = ?").bind(row.workspace_id).first(),
        a: await getAutomation(env, row.workspace_id),
      };
      const { ws, a } = wsCache[row.workspace_id];
      if (!ws || !a.enabled) continue; // stays pending until automation is turned back on
      if (row.booking_status && row.booking_status !== "active") {
        await env.DB.prepare("UPDATE outbox SET status = 'cancelled', error = ? WHERE id = ?").bind(`booking ${row.booking_status}`, row.id).run();
        continue;
      }
      // Never text after the call has started.
      const bk = row.booking_uid ? await env.DB.prepare("SELECT * FROM bookings WHERE uid = ?").bind(row.booking_uid).first() : null;
      if (bk && row.kind !== "confirm" && row.kind !== "reschedule" && now > bk.start_time - 5 * MIN) {
        await env.DB.prepare("UPDATE outbox SET status = 'cancelled', error = 'too close to the call' WHERE id = ?").bind(row.id).run();
        continue;
      }
      // Respect "Do Not Text".
      const dnt = await env.DB.prepare(
        `SELECT 1 FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id
         WHERE ct.workspace_id = ? AND ct.address = ? AND lower(t.name) = 'do not text'`
      ).bind(row.workspace_id, row.phone).first();
      if (dnt) {
        await env.DB.prepare("UPDATE outbox SET status = 'cancelled', error = 'contact is tagged Do Not Text' WHERE id = ?").bind(row.id).run();
        continue;
      }
      // Daily cap on first touches per line.
      if (row.kind === "confirm" || row.kind === "reschedule") {
        const since = now - 24 * 3600e3;
        const c = await env.DB.prepare(
          "SELECT COUNT(*) AS n FROM outbox WHERE workspace_id = ? AND kind IN ('confirm','reschedule') AND status IN ('sent','delivered','unconfirmed','undelivered') AND sent_at > ?"
        ).bind(row.workspace_id, since).first();
        if (c.n >= (a.daily_cap || 50)) {
          await env.DB.prepare("UPDATE outbox SET send_at = ?, error = 'daily new-contact cap reached; retrying' WHERE id = ?").bind(now + 30 * MIN, row.id).run();
          continue;
        }
      }
      // Claim the row so no other run sends it.
      const claim = await env.DB.prepare("UPDATE outbox SET status = 'sending', sent_at = ? WHERE id = ? AND status = 'pending'").bind(now, row.id).run();
      if (!claim.meta?.changes) continue;

      let guid = null;
      try {
        const r = await bbCall(ws, "message/text", {
          method: "POST",
          body: { chatGuid: `iMessage;-;${row.phone}`, tempGuid: row.id, message: row.body, method: "apple-script" },
        });
        guid = r?.data?.guid || null;
        const err = r?.data?.error || 0;
        await env.DB.prepare("UPDATE outbox SET status = ?, msg_guid = ?, sent_at = ?, error = ? WHERE id = ?")
          .bind(err ? "undelivered" : "sent", guid, Date.now(), err ? `Messages error ${err}` : null, row.id).run();
      } catch (e) {
        await env.DB.prepare("UPDATE outbox SET status = 'failed', error = ? WHERE id = ?").bind(String(e.message).slice(0, 300), row.id).run();
        continue;
      }
      // Log on the HubSpot contact.
      if (a.hs_token && bk) {
        try {
          const cid = await ensureContactId(env, a, bk);
          const failedNow = await env.DB.prepare("SELECT status FROM outbox WHERE id = ?").bind(row.id).first();
          const head = failedNow?.status === "undelivered"
            ? `iMessage NOT delivered by B2Blue (${KIND_LABEL[row.kind] || row.kind}). The number may not be on iMessage; call or text manually:`
            : `iMessage sent by B2Blue (${KIND_LABEL[row.kind] || row.kind}):`;
          await logMessage(env, a.hs_token, cid, `${head}\n${row.body}`, Date.now());
          await env.DB.prepare("UPDATE outbox SET hs_logged = 1 WHERE id = ?").bind(row.id).run();
        } catch (e) {
          await env.DB.prepare("UPDATE outbox SET error = ? WHERE id = ?").bind(`sent; HubSpot log failed: ${String(e.message).slice(0, 200)}`, row.id).run();
        }
      }
    } catch (e) {
      console.error("cron row", row.id, e);
    }
  }

  // Delivery check: Messages marks iMessages delivered; a number that isn't on iMessage errors or never delivers.
  const pending = await env.DB.prepare(
    "SELECT o.*, w.bb_url, w.bb_password FROM outbox o JOIN workspaces w ON w.id = o.workspace_id WHERE o.status = 'sent' AND o.msg_guid IS NOT NULL AND o.sent_at < ? LIMIT 10"
  ).bind(now - 2 * MIN).all();
  for (const row of pending.results) {
    try {
      const r = await bbCall({ bb_url: row.bb_url, bb_password: row.bb_password }, `message/${encodeURIComponent(row.msg_guid)}`);
      const m = r.data || {};
      let status = null;
      let note = null;
      if (m.error) { status = "undelivered"; note = `Messages error ${m.error}`; }
      else if (m.isDelivered || m.dateDelivered) status = "delivered";
      else if (row.sent_at < now - 30 * MIN) { status = "unconfirmed"; note = "no delivery receipt after 30 min (may not be on iMessage, or phone is off)"; }
      if (status) await env.DB.prepare("UPDATE outbox SET status = ?, error = COALESCE(?, error) WHERE id = ?").bind(status, note, row.id).run();
      if (status === "undelivered" || status === "unconfirmed") {
        const a = await getAutomation(env, row.workspace_id);
        const bk = row.booking_uid ? await env.DB.prepare("SELECT * FROM bookings WHERE uid = ?").bind(row.booking_uid).first() : null;
        if (a.hs_token && bk) {
          const cid = await ensureContactId(env, a, bk);
          const why = status === "undelivered" ? "was NOT delivered" : "has no delivery receipt after 30 minutes";
          await logMessage(env, a.hs_token, cid, `B2Blue: the ${KIND_LABEL[row.kind] || row.kind} ${why}. The number may not be on iMessage; call or text manually.`, Date.now());
        }
      }
    } catch (e) {
      console.error("delivery check", row.id, e.message);
    }
  }
}

// ---------- Admin API ----------

export async function automationView(env, ws, origin) {
  const a = await getAutomation(env, ws.id);
  const log = await env.DB.prepare(
    `SELECT o.kind, o.phone, o.body, o.send_at, o.sent_at, o.status, o.error, o.hs_logged, b.name
     FROM outbox o LEFT JOIN bookings b ON b.uid = o.booking_uid
     WHERE o.workspace_id = ? ORDER BY o.send_at DESC LIMIT 40`
  ).bind(ws.id).all();
  return {
    enabled: Boolean(a.enabled),
    hubspotConnected: Boolean(a.hs_token),
    hubspotTokenEnd: a.hs_token ? a.hs_token.slice(-4) : null,
    calSecretSet: Boolean(a.cal_secret),
    senderName: a.sender_name || "",
    company: a.company || "",
    dailyCap: a.daily_cap || 50,
    templates: templatesOf(a),
    calWebhookUrl: `${origin}/api/hooks/cal/${ws.id}`,
    bbWebhookUrl: `${origin}/api/hooks/bb/${ws.id}?key=${a.hook_key}`,
    log: log.results,
  };
}

export async function automationUpdate(env, ws, b) {
  const a = await getAutomation(env, ws.id);
  const s = (v, max = 2000) => (v === undefined ? undefined : String(v).trim().slice(0, max));
  const next = {
    enabled: b.enabled === undefined ? a.enabled : b.enabled ? 1 : 0,
    hs_token: b.hubspotToken ? s(b.hubspotToken, 500) : b.clearHubspot ? null : a.hs_token,
    cal_secret: b.calSecret ? s(b.calSecret, 500) : a.cal_secret,
    sender_name: s(b.senderName, 80) ?? a.sender_name,
    company: s(b.company, 80) ?? a.company,
    daily_cap: b.dailyCap ? Math.max(1, Math.min(200, Number(b.dailyCap) || 50)) : a.daily_cap,
  };
  const t = b.templates || {};
  for (const k of Object.keys(DEFAULT_TEMPLATES)) {
    next[k] = t[k] === undefined ? a[k] : (s(t[k], 640) === DEFAULT_TEMPLATES[k] ? null : s(t[k], 640) || null);
  }
  if (b.hubspotToken) await testHubSpot(env, next.hs_token); // throws with HubSpot's reason if the token is wrong
  await env.DB.prepare(
    `UPDATE automation SET enabled = ?, hs_token = ?, cal_secret = ?, sender_name = ?, company = ?, daily_cap = ?,
       tpl_confirm = ?, tpl_reschedule = ?, tpl_24h = ?, tpl_1h = ?, updated_at = ? WHERE workspace_id = ?`
  ).bind(next.enabled, next.hs_token, next.cal_secret, next.sender_name, next.company, next.daily_cap,
    next.tpl_confirm, next.tpl_reschedule, next.tpl_24h, next.tpl_1h, Date.now(), ws.id).run();
}
