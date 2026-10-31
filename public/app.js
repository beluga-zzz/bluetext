// Blue Text front end. Plain JS, no build step.

const $ = (id) => document.getElementById(id);
const state = {
  me: null,
  wsId: null,
  chats: [],
  tags: [],
  filterTag: null,
  search: "",
  active: null,        // { guid, address, name, isGroup, participants }
  messages: [],
  pending: [],         // optimistic messages for the active chat
  renderedKey: "",
};

// ---------- utils ----------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtPhone(a) {
  if (!a) return "";
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(a);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : a;
}

function initials(name, address) {
  if (name) {
    const p = name.trim().split(/\s+/);
    return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "#";
  }
  return "#";
}

function fmtListTime(ms) {
  if (!ms) return "";
  const d = new Date(ms), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const diff = (now - d) / 86400000;
  if (diff < 6) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "numeric", day: "numeric", year: "2-digit" });
}

function fmtDay(ms) {
  const d = new Date(ms);
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 4200);
}

async function api(path, opts = {}) {
  const res = await fetch(`/api/${path}`, {
    method: opts.method || "GET",
    headers: opts.body ? { "content-type": "application/json" } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}
const wsApi = (path, opts) => api(`w/${state.wsId}/${path}`, opts);

function displayName(chat) {
  if (chat.name) return chat.name;
  if (chat.isGroup) return chat.participants.map(fmtPhone).join(", ");
  return fmtPhone(chat.address);
}

function tagById(id) { return state.tags.find((t) => t.id === id); }

// ---------- boot ----------
async function boot() {
  try {
    state.me = await api("me");
  } catch (e) {
    return showGate(e.message);
  }
  $("userEmail").textContent = state.me.email;
  $("adminBtn").hidden = !state.me.isAdmin;
  const list = state.me.workspaces;
  if (!list.length) {
    return showGate(state.me.isAdmin
      ? "No workspaces yet. Add your first client line."
      : "Your account isn't connected to a workspace yet. Ask your admin to add you.", state.me.isAdmin);
  }
  const saved = store.get("bt.ws");
  state.wsId = list.some((w) => w.id === saved) ? saved : list[0].id;
  const sel = $("wsSelect");
  sel.innerHTML = list.map((w) => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join("");
  sel.value = state.wsId;
  sel.hidden = list.length < 2 && !state.me.isAdmin;
  $("tagsBtn").hidden = false;
  await switchWorkspace(state.wsId);
  startPolling();
}

function showGate(text, adminCta = false) {
  $("gate").hidden = false;
  $("gateText").innerHTML = esc(text) + (adminCta ? `<br><br><button class="primary" id="gateAdmin">Open Admin</button>` : "");
  if (adminCta) {
    $("adminBtn").hidden = false;
    $("gateAdmin").onclick = () => { $("gate").hidden = true; openAdmin(); };
  }
}

async function switchWorkspace(id) {
  state.wsId = id;
  store.set("bt.ws", id);
  state.active = null;
  state.chats = [];
  state.filterTag = null;
  closeThread();
  $("chatList").innerHTML = `<div class="list-empty">Loading…</div>`;
  await loadTags();
  await refreshChats();
}

async function loadTags() {
  try {
    state.tags = await wsApi("tags");
  } catch (e) { toast(e.message); state.tags = []; }
  renderTagFilter();
}

// ---------- chat list ----------
async function refreshChats() {
  const ws = state.wsId;
  try {
    const chats = await wsApi("chats");
    if (ws !== state.wsId) return;
    state.chats = chats;
    renderChats();
    if (state.active) syncActiveFromList();
  } catch (e) {
    if (ws === state.wsId && !state.chats.length) {
      $("chatList").innerHTML = `<div class="list-empty">${esc(e.message)}</div>`;
    }
  }
}

function renderTagFilter() {
  const el = $("tagFilter");
  const all = `<button class="chip ${state.filterTag ? "" : "on"}" data-tag="">All</button>`;
  el.innerHTML = all + state.tags.map((t) =>
    `<button class="chip ${state.filterTag === t.id ? "on" : ""}" data-tag="${esc(t.id)}"><span class="dot" style="background:${esc(t.color)}"></span>${esc(t.name)}</button>`
  ).join("");
}

function renderChats() {
  const q = state.search.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  const list = state.chats.filter((c) => {
    if (state.filterTag && !c.tagIds.includes(state.filterTag)) return false;
    if (!q) return true;
    const hay = `${displayName(c)} ${c.lastText}`.toLowerCase();
    if (hay.includes(q)) return true;
    return qDigits.length >= 3 && (c.address || c.participants.join(" ")).replace(/\D/g, "").includes(qDigits);
  });
  const el = $("chatList");
  if (!list.length) {
    el.innerHTML = `<div class="list-empty">${state.chats.length ? "No matches." : "No conversations yet."}</div>`;
    return;
  }
  el.innerHTML = list.map((c) => {
    const name = displayName(c);
    const dots = c.tagIds.map(tagById).filter(Boolean)
      .map((t) => `<span title="${esc(t.name)}" style="background:${esc(t.color)}"></span>`).join("");
    return `<div class="chat ${state.active?.guid === c.guid ? "active" : ""}" role="listitem" data-guid="${esc(c.guid)}">
      <div class="avatar">${esc(c.name ? initials(c.name) : c.isGroup ? "👥" : "#")}</div>
      <div class="chat-main">
        <div class="chat-name">${esc(name)}</div>
        <div class="chat-last">${c.lastFromMe ? "You: " : ""}${esc(c.lastText)}</div>
      </div>
      <div class="chat-meta">${esc(fmtListTime(c.lastDate))}<div class="chat-dots">${dots}</div></div>
    </div>`;
  }).join("");
}

// ---------- thread ----------
function openChat(chat) {
  state.active = { guid: chat.guid, address: chat.address, name: chat.name, isGroup: chat.isGroup, participants: chat.participants, tagIds: chat.tagIds || [] };
  state.messages = [];
  state.pending = [];
  state.renderedKey = "";
  $("emptyThread").hidden = true;
  $("thread").hidden = false;
  document.body.classList.add("in-thread");
  renderThreadHead();
  $("messages").innerHTML = `<div class="day">Loading…</div>`;
  renderChats();
  refreshMessages(true);
  $("composeText").focus();
}

function closeThread() {
  state.active = null;
  $("thread").hidden = true;
  $("emptyThread").hidden = false;
  document.body.classList.remove("in-thread");
}

function syncActiveFromList() {
  const c = state.chats.find((x) => x.guid === state.active.guid) ||
    (state.active.address && state.chats.find((x) => !x.isGroup && x.address === state.active.address));
  if (!c) return;
  const guidChanged = c.guid !== state.active.guid;
  Object.assign(state.active, { guid: c.guid, name: c.name, tagIds: c.tagIds, participants: c.participants });
  renderThreadHead();
  if (guidChanged) refreshMessages(true);
}

function renderThreadHead() {
  const a = state.active;
  $("threadName").textContent = a.name || (a.isGroup ? "Group" : fmtPhone(a.address));
  $("threadSub").textContent = a.isGroup ? a.participants.map(fmtPhone).join(", ") : (a.name ? fmtPhone(a.address) : "iMessage");
  $("renameBtn").hidden = a.isGroup || !a.address;
  const tagsEl = $("threadTags");
  if (a.isGroup || !a.address) { tagsEl.innerHTML = ""; tagsEl.hidden = true; return; }
  tagsEl.hidden = false;
  tagsEl.innerHTML = state.tags.map((t) => {
    const on = a.tagIds.includes(t.id);
    return `<button class="chip ${on ? "on" : ""}" style="--c:${esc(t.color)}" data-tag="${esc(t.id)}"><span class="dot" style="background:${on ? "#fff" : esc(t.color)}"></span>${esc(t.name)}</button>`;
  }).join("");
}

async function refreshMessages(force = false) {
  const a = state.active;
  if (!a) return;
  const guid = a.guid;
  try {
    const msgs = await wsApi(`chats/${encodeURIComponent(guid)}/messages?limit=80`);
    if (state.active?.guid !== guid) return;
    state.messages = msgs;
    // Drop optimistic messages the server now has.
    const theirs = new Set(msgs.filter((m) => m.fromMe).map((m) => m.text));
    state.pending = state.pending.filter((p) => p.failed || !theirs.has(p.text));
    renderMessages(force);
  } catch (e) {
    if (state.active?.guid !== guid) return;
    if (/does not exist|not found/i.test(e.message) && state.pending.length) {
      renderMessages(force); // brand-new chat, server hasn't created it yet
    } else if (force) {
      $("messages").innerHTML = `<div class="day">${esc(e.message)}</div>`;
    }
  }
}

function renderMessages(force) {
  const all = [...state.messages, ...state.pending];
  const key = all.map((m) => `${m.guid}:${m.delivered ? 1 : 0}:${m.read ? 1 : 0}:${m.failed ? 1 : 0}`).join("|");
  if (!force && key === state.renderedKey) return;
  state.renderedKey = key;
  const box = $("messages");
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  let html = "", lastDate = 0, lastSender = null;
  const lastMine = [...all].reverse().find((m) => m.fromMe && !m.pending);
  for (const m of all) {
    if (m.date && m.date - lastDate > 60 * 60 * 1000) {
      html += `<div class="day">${esc(fmtDay(m.date))}</div>`;
      lastSender = null;
    }
    if (m.date) lastDate = m.date;
    if (state.active.isGroup && !m.fromMe && m.sender && m.sender !== lastSender) {
      html += `<div class="sender">${esc(fmtPhone(m.sender))}</div>`;
    }
    lastSender = m.fromMe ? null : m.sender;
    const cls = m.fromMe ? "me" : "them";
    html += `<div class="bubble ${cls} ${m.pending ? "pending" : ""} ${m.failed || m.error ? "failed" : ""}">${esc(m.text)}</div>`;
    if (m.failed) html += `<div class="status">Not sent</div>`;
    else if (m === lastMine) html += `<div class="status">${m.error ? "Not delivered" : m.read ? "Read" : m.delivered ? "Delivered" : "Sent"}</div>`;
  }
  if (!all.length) html = `<div class="day">No messages yet.</div>`;
  box.innerHTML = html;
  if (force || nearBottom) box.scrollTop = box.scrollHeight;
}

async function sendInThread(text) {
  const a = state.active;
  const p = { guid: `pending-${Date.now()}`, text, fromMe: true, date: Date.now(), pending: true };
  state.pending.push(p);
  renderMessages(true);
  try {
    const body = a.guid ? { chatGuid: a.guid, text } : { address: a.address, text };
    const r = await wsApi("send", { method: "POST", body });
    if (!a.guid) a.guid = r.chatGuid;
    setTimeout(() => { refreshMessages(); refreshChats(); }, 1200);
  } catch (e) {
    p.failed = true; p.pending = false;
    renderMessages(true);
    toast(e.message);
  }
}

// ---------- tags ----------
async function toggleTag(tagId) {
  const a = state.active;
  if (!a?.address) return;
  const next = a.tagIds.includes(tagId) ? a.tagIds.filter((t) => t !== tagId) : [...a.tagIds, tagId];
  const prev = a.tagIds;
  a.tagIds = next;
  renderThreadHead();
  try {
    await wsApi(`contacts/${encodeURIComponent(a.address)}`, { method: "PUT", body: { tagIds: next } });
    const c = state.chats.find((x) => x.guid === a.guid);
    if (c) c.tagIds = next;
    renderChats();
  } catch (e) {
    a.tagIds = prev; renderThreadHead(); toast(e.message);
  }
}

async function renameContact() {
  const a = state.active;
  const name = prompt("Contact name", a.name || "");
  if (name === null) return;
  try {
    await wsApi(`contacts/${encodeURIComponent(a.address)}`, { method: "PUT", body: { name } });
    a.name = name.trim() || null;
    const c = state.chats.find((x) => x.guid === a.guid);
    if (c) c.name = a.name;
    renderThreadHead(); renderChats();
  } catch (e) { toast(e.message); }
}

function renderTagsEditor() {
  $("tagsEditor").innerHTML = state.tags.map((t) => `
    <div class="row" data-id="${esc(t.id)}">
      <input type="color" value="${esc(t.color)}" data-field="color" aria-label="Color">
      <input value="${esc(t.name)}" data-field="name" aria-label="Tag name">
      <button class="ghost danger small" data-del>Delete</button>
    </div>`).join("") || `<p class="hint">No tags yet.</p>`;
}

async function afterTagChange() {
  await loadTags();
  renderTagsEditor();
  if (state.active) renderThreadHead();
  await refreshChats();
}

// ---------- admin ----------
async function openAdmin() {
  $("adminDialog").showModal();
  await renderAdmin();
}

async function renderAdmin() {
  const el = $("wsAdminList");
  try {
    const list = await api("admin/workspaces");
    el.innerHTML = list.map((w) => `
      <div class="ws-card" data-id="${esc(w.id)}">
        <div class="ws-card-head">
          <strong>${esc(w.name)}</strong>
          <button class="ghost small" data-test>Test connection</button>
          <button class="ghost small danger" data-delws>Delete</button>
        </div>
        <div class="ws-url">${esc(w.bb_url)}</div>
        <div class="members">${w.members.map((m) =>
          `<span class="chip">${esc(m)} <button class="ghost small danger" data-rm="${esc(m)}" aria-label="Remove">×</button></span>`).join("") ||
          `<span class="hint">No team members yet. Admins always have access.</span>`}</div>
        <form class="row" data-addmember>
          <input type="email" placeholder="client@company.com" required>
          <button class="primary small">Add member</button>
        </form>
      </div>`).join("") || `<p class="hint">No workspaces yet.</p>`;
  } catch (e) {
    el.innerHTML = `<p class="hint">${esc(e.message)}</p>`;
  }
}

async function reloadMe() {
  state.me = await api("me");
  const sel = $("wsSelect");
  sel.innerHTML = state.me.workspaces.map((w) => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join("");
  if (!state.me.workspaces.some((w) => w.id === state.wsId)) {
    if (state.me.workspaces.length) { await switchWorkspace(state.me.workspaces[0].id); startPolling(); }
  }
  sel.value = state.wsId || "";
  sel.hidden = state.me.workspaces.length === 0;
  $("tagsBtn").hidden = !state.wsId;
  $("gate").hidden = true;
}

// ---------- polling ----------
let chatTimer, msgTimer;
function startPolling() {
  clearInterval(chatTimer); clearInterval(msgTimer);
  chatTimer = setInterval(() => { if (!document.hidden) refreshChats(); }, 5000);
  msgTimer = setInterval(() => { if (!document.hidden && state.active) refreshMessages(); }, 3000);
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.wsId) { refreshChats(); refreshMessages(); }
});

// ---------- events ----------
$("wsSelect").addEventListener("change", (e) => switchWorkspace(e.target.value));
$("search").addEventListener("input", (e) => { state.search = e.target.value; renderChats(); });

$("tagFilter").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tag]");
  if (!b) return;
  state.filterTag = b.dataset.tag || null;
  renderTagFilter(); renderChats();
});

$("chatList").addEventListener("click", (e) => {
  const row = e.target.closest(".chat");
  if (!row) return;
  const c = state.chats.find((x) => x.guid === row.dataset.guid);
  if (c) openChat(c);
});

$("threadTags").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tag]");
  if (b) toggleTag(b.dataset.tag);
});

$("backBtn").addEventListener("click", () => { closeThread(); renderChats(); });
$("renameBtn").addEventListener("click", renameContact);

const compose = $("composeText");
compose.addEventListener("input", () => {
  compose.style.height = "auto";
  compose.style.height = Math.min(compose.scrollHeight, 160) + "px";
});
compose.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $("composer").requestSubmit();
  }
});
$("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = compose.value.trim();
  if (!text || !state.active) return;
  compose.value = "";
  compose.style.height = "auto";
  sendInThread(text);
});

$("newBtn").addEventListener("click", () => {
  $("newForm").reset();
  $("newDialog").showModal();
  $("newTo").focus();
});
$("newForm").addEventListener("submit", async (e) => {
  if (e.submitter?.value !== "send") return;
  e.preventDefault();
  const to = $("newTo").value, text = $("newText").value.trim();
  if (!text) return;
  const btn = $("newSend");
  btn.disabled = true;
  try {
    const r = await wsApi("send", { method: "POST", body: { address: to, text } });
    $("newDialog").close();
    const address = r.chatGuid.split(";-;")[1];
    const existing = state.chats.find((c) => c.guid === r.chatGuid || (!c.isGroup && c.address === address));
    openChat(existing || { guid: r.chatGuid, address, name: null, isGroup: false, participants: [address], tagIds: [] });
    state.pending.push({ guid: `pending-${Date.now()}`, text, fromMe: true, date: Date.now(), pending: true });
    renderMessages(true);
    setTimeout(() => { refreshChats(); refreshMessages(); }, 1500);
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
  }
});

$("tagsBtn").addEventListener("click", () => { renderTagsEditor(); $("tagsDialog").showModal(); });
$("tagsEditor").addEventListener("change", async (e) => {
  const row = e.target.closest("[data-id]");
  const field = e.target.dataset.field;
  if (!row || !field) return;
  try {
    await wsApi(`tags/${row.dataset.id}`, { method: "PUT", body: { [field]: e.target.value } });
    await afterTagChange();
  } catch (err) { toast(err.message); }
});
$("tagsEditor").addEventListener("click", async (e) => {
  if (!e.target.closest("[data-del]")) return;
  const row = e.target.closest("[data-id]");
  const t = tagById(row.dataset.id);
  if (!confirm(`Delete the "${t?.name}" tag? It will be removed from every contact.`)) return;
  try {
    await wsApi(`tags/${row.dataset.id}`, { method: "DELETE" });
    await afterTagChange();
  } catch (err) { toast(err.message); }
});
$("addTagForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await wsApi("tags", { method: "POST", body: { name: $("addTagName").value, color: $("addTagColor").value } });
    $("addTagName").value = "";
    await afterTagChange();
  } catch (err) { toast(err.message); }
});

$("adminBtn").addEventListener("click", openAdmin);
$("addWsForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const r = await api("admin/workspaces", {
      method: "POST",
      body: { name: $("wsName").value, bb_url: $("wsUrl").value, bb_password: $("wsPw").value },
    });
    $("addWsForm").reset();
    await renderAdmin();
    await reloadMe();
    if (!state.wsId) { await switchWorkspace(r.id); startPolling(); $("wsSelect").value = r.id; }
    toast("Workspace added");
  } catch (err) { toast(err.message); }
});
$("wsAdminList").addEventListener("click", async (e) => {
  const card = e.target.closest("[data-id]");
  if (!card) return;
  const id = card.dataset.id;
  try {
    if (e.target.closest("[data-test]")) {
      await api(`admin/workspaces/${id}/test`, { method: "POST" });
      toast("Connected. The server answered.");
    } else if (e.target.closest("[data-delws]")) {
      if (!confirm("Delete this workspace? Its tags and contact names are removed. Messages on the phone are not affected.")) return;
      await api(`admin/workspaces/${id}`, { method: "DELETE" });
      if (state.wsId === id) state.wsId = null;
      await renderAdmin(); await reloadMe();
    } else if (e.target.closest("[data-rm]")) {
      const email = e.target.closest("[data-rm]").dataset.rm;
      await api(`admin/workspaces/${id}/members/${encodeURIComponent(email)}`, { method: "DELETE" });
      await renderAdmin();
    }
  } catch (err) { toast(err.message); }
});
$("wsAdminList").addEventListener("submit", async (e) => {
  const form = e.target.closest("[data-addmember]");
  if (!form) return;
  e.preventDefault();
  const id = form.closest("[data-id]").dataset.id;
  try {
    await api(`admin/workspaces/${id}/members`, { method: "POST", body: { email: form.querySelector("input").value } });
    await renderAdmin();
  } catch (err) { toast(err.message); }
});

document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));

boot();
