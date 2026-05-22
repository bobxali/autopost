const STORAGE_KEYS = {
  accounts: "auto_re_accounts",
  activeAccountId: "auto_re_active_account_id",
  campaignsByAccount: "auto_re_campaigns_by_account",
  postTemplatesByAccount: "auto_re_post_templates_by_account",
  previewPlansByAccount: "auto_re_preview_plans_by_account",
  groupListsByAccount: "auto_re_group_lists_by_account",
  failedGroupsByAccount: "auto_re_failed_groups_by_account",
  errorLogsByAccount: "auto_re_error_logs_by_account",
  groupsSortByAccount: "auto_re_groups_sort_by_account",
  groupOrderDraftByAccount: "auto_re_group_order_draft_by_account"
};

const state = {
  stopRequested: false,
  filter: "all",
  modalTab: "overview",
  selectedCampaignId: "",
  accounts: [],
  activeAccountId: "",
  campaignsByAccount: {},
  uiLogs: [],
  runningCampaignId: "",
  lastPostActionAtMs: 0,
  preloadedMediaItems: [],
  preloadedFromCampaignId: "",
  postTemplatesByAccount: {},
  previewPlansByAccount: {},
  previewPlanId: "",
  editingPostId: "",
  groupListsByAccount: {},
  failedGroupsByAccount: {},
  errorLogsByAccount: {},
  groupsSortByAccount: {},
  groupOrderDraftByAccount: {},
  groupReorderModeByAccount: {},
  currentRenderedGroupIdsByAccount: {},
  syncMonitor: {
    active: false,
    post: "",
    group: "",
    uploadTotal: 0,
    uploadDone: 0,
    startMs: 0,
    phase: "",
    phaseStartMs: 0,
    durationsMs: { text: 0, upload: 0, submit: 0 },
    lastSummary: "Sync: -"
  }
};

const IDB_CONFIG = {
  name: "auto_re_local_db",
  version: 1,
  stores: {
    media: "media_blob_store"
  }
};

let _idbPromise = null;

const els = {
  status: document.getElementById("status"),
  logs: document.getElementById("logs"),
  brandProfileDisplay: document.getElementById("brandProfileDisplay"),
  brandProfileInput: document.getElementById("brandProfileInput"),
  btnBrandProfileSave: document.getElementById("btnBrandProfileSave"),
  btnRefreshView: document.getElementById("btnRefreshView"),
  accountSelect: document.getElementById("accountSelect"),
  accountMeta: document.getElementById("accountMeta"),
  accountLabelLine: document.getElementById("accountLabelLine"),
  accountIdLine: document.getElementById("accountIdLine"),
  activeProfileTitle: document.getElementById("activeProfileTitle"),
  activeProfileSub: document.getElementById("activeProfileSub"),
  statTotal: document.getElementById("statTotal"),
  statCompleted: document.getElementById("statCompleted"),
  statPending: document.getElementById("statPending"),
  statFailed: document.getElementById("statFailed"),
  btnSaveAccount: document.getElementById("btnSaveAccount"),
  btnClearResults: document.getElementById("btnClearResults"),
  logCountdown: document.getElementById("logCountdown"),
  syncCountdown: document.getElementById("syncCountdown"),
  btnCheckLogin: document.getElementById("btnCheckLogin"),
  btnFetchGroups: document.getElementById("btnFetchGroups"),
  maxPages: document.getElementById("maxPages"),
  postText: document.getElementById("postText"),
  imageFiles: document.getElementById("imageFiles"),
  imageState: document.getElementById("imageState"),
  btnStart: document.getElementById("btnStart"),
  btnStop: document.getElementById("btnStop"),
  btnPreview: document.getElementById("btnPreview"),
  btnGoLiveLogs: document.getElementById("btnGoLiveLogs"),
  previewActionHint: document.getElementById("previewActionHint"),
  btnClearLogs: document.getElementById("btnClearLogs"),
  campaignSearch: document.getElementById("campaignSearch"),
  campaignsBody: document.getElementById("campaignsBody"),
  campaignEmptyState: document.getElementById("campaignEmptyState"),
  detailsModal: document.getElementById("detailsModal"),
  btnCloseModal: document.getElementById("btnCloseModal"),
  modalContent: document.getElementById("modalContent"),
  previewLog: document.getElementById("previewLog"),
  builderStatus: document.getElementById("builderStatus"),
  postName: document.getElementById("postName"),
  btnSavePostTemplate: document.getElementById("btnSavePostTemplate"),
  postList: document.getElementById("postList"),
  intervalPreset: document.getElementById("intervalPreset"),
  intervalHint: document.getElementById("intervalHint"),
  startDelayMinutes: document.getElementById("startDelayMinutes"),
  groupListName: document.getElementById("groupListName"),
  btnSaveGroupList: document.getElementById("btnSaveGroupList"),
  groupsPageBody: document.getElementById("groupsPageBody"),
  groupsCards: document.getElementById("groupsCards"),
  groupsSearch: document.getElementById("groupsSearch"),
  groupsSortMode: document.getElementById("groupsSortMode"),
  btnToggleGroupReorder: document.getElementById("btnToggleGroupReorder"),
  btnSaveGroupOrder: document.getElementById("btnSaveGroupOrder"),
  groupLists: document.getElementById("groupLists"),
  btnRefreshGroupsPage: document.getElementById("btnRefreshGroupsPage"),
  btnClearFailedGroups: document.getElementById("btnClearFailedGroups"),
  failedGroupsBody: document.getElementById("failedGroupsBody"),
  failedGroupsEmpty: document.getElementById("failedGroupsEmpty"),
  btnExportDevLogs: document.getElementById("btnExportDevLogs"),
  btnClearErrorLogs: document.getElementById("btnClearErrorLogs"),
  errorLogsBody: document.getElementById("errorLogsBody"),
  errorLogsEmpty: document.getElementById("errorLogsEmpty")
};

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch (_) {
    return iso || "-";
  }
}

function accountDisplayName(a, fallbackIndex = 0) {
  if (a?.label && String(a.label).trim()) return String(a.label).trim();
  if (a?.actorId) return `FB ${a.actorId}`;
  return `Profile ${fallbackIndex + 1}`;
}

function accountCampaignCount(accountId) {
  const list = state.campaignsByAccount[accountId];
  return Array.isArray(list) ? list.length : 0;
}

function setStatus(text) {
  els.status.textContent = text;
}

function setBuilderStatus(text) {
  if (els.builderStatus) els.builderStatus.textContent = text;
}

function log(msg) {
  state.uiLogs.push({ ts: new Date().toISOString(), msg: String(msg || "") });
  state.uiLogs = state.uiLogs.slice(-200);
  renderLogs();
}

function logEvent(type, message, meta = {}) {
  const ts = new Date().toISOString();
  const summary = `[${type}] ${message}`;
  const extra = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : "";
  state.uiLogs.push({ ts, msg: `${summary}${extra}` });
  state.uiLogs = state.uiLogs.slice(-400);
  renderLogs();
  if (type === "FAILED") {
    const acct = activeAccount();
    const match = (acct?.groups || []).find((g) => String(g.name || "") === String(message || ""));
    const gid = match ? String(match.id || "") : "";
    const err = meta?.error || "";
    recordFailedGroup(gid, String(message || ""), err);
    recordErrorLog({
      source: "campaign",
      campaign: meta?.post || "",
      groupId: gid,
      groupName: String(message || ""),
      error: String(err || "Unknown error")
    });
  } else if (type === "POSTED") {
    const acct = activeAccount();
    const match = (acct?.groups || []).find((g) => String(g.name || "") === String(message || ""));
    const gid = match ? String(match.id || "") : "";
    clearFailedGroup(gid, String(message || ""));
  } else if (type === "ERROR") {
    recordErrorLog({
      source: "ui",
      campaign: meta?.post || "",
      groupId: "",
      groupName: String(message || ""),
      error: String(meta?.error || message || "Unknown error")
    });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sleepInterruptible(totalMs, stepMs = 1000) {
  let remaining = Math.max(0, totalMs);
  while (remaining > 0) {
    if (state.stopRequested) return false;
    const chunk = Math.min(stepMs, remaining);
    await sleep(chunk);
    remaining -= chunk;
  }
  return true;
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (resp) => resolve(resp || { ok: false, error: "No response" }));
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error("Failed to read media file"));
    fr.readAsDataURL(file);
  });
}

async function mediaItemToFile(media) {
  if (media instanceof File) return media;
  if (media && media.mediaId) {
    const record = await idbGet(IDB_CONFIG.stores.media, media.mediaId);
    if (!record?.blob) throw new Error("Media not found in local IndexedDB");
    return new File(
      [record.blob],
      media.name || record.name || `img_${Date.now()}.jpg`,
      { type: media.type || record.type || record.blob.type || "image/jpeg" }
    );
  }
  if (media && media.dataUrl) {
    const blob = await (await fetch(media.dataUrl)).blob();
    return new File(
      [blob],
      media.name || `img_${Date.now()}.jpg`,
      { type: media.type || blob.type || "image/jpeg" }
    );
  }
  throw new Error("Invalid media item");
}

function extractRegex(html, pattern) {
  const m = html.match(pattern);
  return m ? m[1] : "";
}

function parseFbJsonResponse(raw) {
  const cleaned = String(raw || "").replace(/^for\s*\(;;\);\s*/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // Facebook can return multiple JSON chunks in one response.
    // Parse the first valid JSON object from the stream.
    let start = -1;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = 0; i < cleaned.length; i += 1) {
      const ch = cleaned[i];
      if (start < 0) {
        if (ch === "{") {
          start = i;
          depth = 1;
        }
        continue;
      }
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === "\"") inStr = false;
        continue;
      }
      if (ch === "\"") inStr = true;
      else if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          const firstObj = cleaned.slice(start, i + 1);
          return JSON.parse(firstObj);
        }
      }
    }
    throw new Error("Unable to parse Facebook JSON response");
  }
}

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function setStorage(obj) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(obj, () => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message || "Storage write failed"));
        return;
      }
      resolve();
    });
  });
}

function openIndexedDb() {
  if (_idbPromise) return _idbPromise;
  _idbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_CONFIG.name, IDB_CONFIG.version);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_CONFIG.stores.media)) {
        db.createObjectStore(IDB_CONFIG.stores.media, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
  });
  return _idbPromise;
}

async function idbPut(store, value) {
  const db = await openIndexedDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB put failed"));
  });
}

async function idbGet(store, key) {
  const db = await openIndexedDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error || new Error("IndexedDB get failed"));
  });
}

async function idbGetAllKeys(store) {
  const db = await openIndexedDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAllKeys();
    req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
    req.onerror = () => reject(req.error || new Error("IndexedDB getAllKeys failed"));
  });
}

async function idbDelete(store, key) {
  const db = await openIndexedDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB delete failed"));
  });
}

async function putMediaDataUrlToIndexedDb(dataUrl, name = "", type = "") {
  const blob = await (await fetch(dataUrl)).blob();
  const id = uid("media");
  await idbPut(IDB_CONFIG.stores.media, {
    id,
    blob,
    name: name || `media_${Date.now()}`,
    type: type || blob.type || "application/octet-stream",
    createdAt: nowIso()
  });
  return { mediaId: id, name: name || `media_${Date.now()}`, type: type || blob.type || "application/octet-stream" };
}

function compactCampaign(campaign, maxGroupResults = 250) {
  const c = { ...(campaign || {}) };
  const groupResults = Array.isArray(c.groupResults) ? c.groupResults : [];
  c.groupResults = groupResults.slice(-maxGroupResults).map((r) => ({
    groupId: r.groupId,
    groupName: r.groupName,
    status: r.status,
    url: r.url || "",
    ts: r.ts || ""
  }));
  return c;
}

function compactStateForStorage(inputState) {
  const out = { ...inputState };
  const compactCampaignMap = {};
  for (const [acctId, list] of Object.entries(out.campaignsByAccount || {})) {
    const arr = Array.isArray(list) ? list.slice(-60).map((c) => compactCampaign(c, 250)) : [];
    compactCampaignMap[acctId] = arr;
  }
  out.campaignsByAccount = compactCampaignMap;

  const compactTemplates = {};
  for (const [acctId, list] of Object.entries(out.postTemplatesByAccount || {})) {
    const arr = Array.isArray(list) ? list.slice(-100).map((p) => ({
      ...p,
      mediaItems: (Array.isArray(p.mediaItems) ? p.mediaItems : []).map((m) => ({
        mediaId: m.mediaId || "",
        name: m.name || "",
        type: m.type || "",
        size: Number(m.size || 0) || 0
      }))
    })) : [];
    compactTemplates[acctId] = arr;
  }
  out.postTemplatesByAccount = compactTemplates;

  const compactPreviewPlans = {};
  for (const [acctId, list] of Object.entries(out.previewPlansByAccount || {})) {
    compactPreviewPlans[acctId] = Array.isArray(list) ? list.slice(0, 5) : [];
  }
  out.previewPlansByAccount = compactPreviewPlans;

  const compactFailed = {};
  for (const [acctId, list] of Object.entries(out.failedGroupsByAccount || {})) {
    compactFailed[acctId] = Array.isArray(list) ? list.slice(0, 300) : [];
  }
  out.failedGroupsByAccount = compactFailed;

  const compactErrors = {};
  for (const [acctId, list] of Object.entries(out.errorLogsByAccount || {})) {
    compactErrors[acctId] = Array.isArray(list) ? list.slice(0, 300) : [];
  }
  out.errorLogsByAccount = compactErrors;
  return out;
}

function aggressiveCompactForQuota(inputState) {
  const out = compactStateForStorage(inputState);
  const slimCampaignMap = {};
  for (const [acctId, list] of Object.entries(out.campaignsByAccount || {})) {
    slimCampaignMap[acctId] = Array.isArray(list) ? list.slice(-20).map((c) => compactCampaign(c, 80)) : [];
  }
  out.campaignsByAccount = slimCampaignMap;
  const compactPreviewPlans = {};
  for (const key of Object.keys(out.previewPlansByAccount || {})) compactPreviewPlans[key] = [];
  out.previewPlansByAccount = compactPreviewPlans;
  for (const key of Object.keys(out.errorLogsByAccount || {})) {
    out.errorLogsByAccount[key] = (out.errorLogsByAccount[key] || []).slice(0, 100);
  }
  return out;
}

function fmtLogTs(iso) {
  try {
    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  } catch (_) {
    return "";
  }
}

function fmtClockTs(iso) {
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mi}`;
  } catch (_) {
    return "";
  }
}

function fmtDurationClock(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function splitLogTextAndMeta(text) {
  const raw = String(text || "");
  const parts = raw.split(" | ");
  const message = (parts[0] || "").trim();
  let meta = null;
  if (parts.length > 1) {
    try {
      meta = JSON.parse(parts.slice(1).join(" | "));
    } catch (_) {
      meta = null;
    }
  }
  return { message, meta };
}

function resetSyncMonitor() {
  state.syncMonitor = {
    active: false,
    post: "",
    group: "",
    uploadTotal: 0,
    uploadDone: 0,
    startMs: 0,
    phase: "",
    phaseStartMs: 0,
    durationsMs: { text: 0, upload: 0, submit: 0 },
    lastSummary: state.syncMonitor?.lastSummary || "Sync: -"
  };
}

function addSyncPhaseDuration(nowMs = Date.now()) {
  const mon = state.syncMonitor;
  if (!mon.active || !mon.phase || !mon.phaseStartMs) return;
  const elapsed = Math.max(0, nowMs - mon.phaseStartMs);
  if (mon.phase === "text") mon.durationsMs.text += elapsed;
  else if (mon.phase === "upload") mon.durationsMs.upload += elapsed;
  else if (mon.phase === "submit") mon.durationsMs.submit += elapsed;
  mon.phaseStartMs = nowMs;
}

function startSyncMonitor(post, group, uploadCount = 0) {
  resetSyncMonitor();
  state.syncMonitor.active = true;
  state.syncMonitor.post = String(post || "").trim();
  state.syncMonitor.group = String(group || "").trim();
  state.syncMonitor.uploadTotal = Math.max(0, Number(uploadCount || 0));
  state.syncMonitor.uploadDone = 0;
  state.syncMonitor.startMs = Date.now();
  state.syncMonitor.phase = "text";
  state.syncMonitor.phaseStartMs = state.syncMonitor.startMs;
  logEvent("SYNC", "Phase TEXT", {
    post: state.syncMonitor.post,
    group: state.syncMonitor.group
  });
  updateSyncCountdown();
}

function incrementSyncUploadDone() {
  const mon = state.syncMonitor;
  if (!mon.active) return;
  mon.uploadDone = Math.min(mon.uploadTotal || 0, (mon.uploadDone || 0) + 1);
  updateSyncCountdown();
}

function setSyncPhase(phase, extraMeta = {}) {
  const mon = state.syncMonitor;
  if (!mon.active) return;
  const nowMs = Date.now();
  addSyncPhaseDuration(nowMs);
  mon.phase = String(phase || "");
  mon.phaseStartMs = nowMs;
  const label = mon.phase ? mon.phase.toUpperCase() : "UNKNOWN";
  logEvent("SYNC", `Phase ${label}`, {
    post: mon.post,
    group: mon.group,
    ...extraMeta
  });
  updateSyncCountdown();
}

function finishSyncMonitor(result = "done", error = "") {
  const mon = state.syncMonitor;
  if (!mon.active) return;
  const nowMs = Date.now();
  addSyncPhaseDuration(nowMs);
  const totalSec = Math.round((nowMs - mon.startMs) / 1000);
  const textSec = Math.round(mon.durationsMs.text / 1000);
  const uploadSec = Math.round(mon.durationsMs.upload / 1000);
  const submitSec = Math.round(mon.durationsMs.submit / 1000);
  mon.lastSummary = `Sync: ${String(result || "").toUpperCase()} | text ${fmtDurationClock(textSec)} | upload ${fmtDurationClock(uploadSec)} | submit ${fmtDurationClock(submitSec)} | total ${fmtDurationClock(totalSec)}`;
  logEvent("SYNC", `Done ${String(result || "").toUpperCase()}`, {
    post: mon.post,
    group: mon.group,
    textSec,
    uploadSec,
    submitSec,
    totalSec,
    error: String(error || "")
  });
  mon.active = false;
  mon.phase = "";
  mon.phaseStartMs = 0;
  updateSyncCountdown();
}

function updateSyncCountdown() {
  if (!els.syncCountdown) return;
  const mon = state.syncMonitor;
  if (!mon || !mon.active) {
    els.syncCountdown.textContent = mon?.lastSummary || "Sync: -";
    return;
  }
  const nowMs = Date.now();
  const textMs = mon.durationsMs.text + (mon.phase === "text" ? Math.max(0, nowMs - mon.phaseStartMs) : 0);
  const uploadMs = mon.durationsMs.upload + (mon.phase === "upload" ? Math.max(0, nowMs - mon.phaseStartMs) : 0);
  const submitMs = mon.durationsMs.submit + (mon.phase === "submit" ? Math.max(0, nowMs - mon.phaseStartMs) : 0);
  const totalSec = Math.round(Math.max(0, nowMs - mon.startMs) / 1000);
  const textSec = Math.round(textMs / 1000);
  const uploadSec = Math.round(uploadMs / 1000);
  const submitSec = Math.round(submitMs / 1000);
  const phaseLabel = String(mon.phase || "").toUpperCase();
  const target = mon.post ? ` | ${mon.post}` : "";
  if (phaseLabel === "UPLOAD") {
    const done = Math.max(0, Number(mon.uploadDone || 0));
    const total = Math.max(0, Number(mon.uploadTotal || 0));
    els.syncCountdown.textContent = `Sync: Upload ${done}/${total} | ${fmtDurationClock(uploadSec)} | Total ${fmtDurationClock(totalSec)}${target}`;
    return;
  }
  if (phaseLabel === "TEXT") {
    els.syncCountdown.textContent = `Sync: Text ${fmtDurationClock(textSec)} | Total ${fmtDurationClock(totalSec)}${target}`;
    return;
  }
  if (phaseLabel === "SUBMIT") {
    els.syncCountdown.textContent = `Sync: Submit ${fmtDurationClock(submitSec)} | Total ${fmtDurationClock(totalSec)}${target}`;
    return;
  }
  els.syncCountdown.textContent = `Sync: ${phaseLabel} | Total ${fmtDurationClock(totalSec)}${target}`;
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseLogType(msg) {
  const m = String(msg || "").match(/^\[([A-Z_]+)\]\s*/);
  return m ? m[1] : "INFO";
}

function logTypeClass(type) {
  if (["POSTED", "START", "END", "RESUME", "CREATE"].includes(type)) return "ok";
  if (["WAIT", "WAIT_GUARD", "NOTE"].includes(type)) return "warn";
  if (["FAILED", "ERROR"].includes(type)) return "err";
  return "info";
}

function renderLogLines(el, lines) {
  if (!el) return;
  const html = lines.map((l) => {
    const type = l.type || "INFO";
    const postedClock = type === "POSTED" && l.postedClock
      ? `<div class="logTypeClock">${escapeHtml(l.postedClock)}</div>`
      : "";
    return `<div class="logLine">
      <div class="logType ${logTypeClass(type)}">${escapeHtml(type)}${postedClock}</div>
      <div class="logMsg">${escapeHtml(l.message || "")}</div>
    </div>`;
  }).join("");
  el.innerHTML = html || "<div class=\"emptyState\">No logs yet.</div>";
  el.scrollTop = el.scrollHeight;
}

function updateCountdown() {
  if (!els.logCountdown) return;
  const rows = [...state.uiLogs].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  const waitLog = [...rows].reverse().find((l) => {
    const t = parseLogType(l.msg);
    return t === "WAIT" || t === "WAIT_GUARD";
  });
  if (!waitLog) {
    els.logCountdown.textContent = "Next post: -";
    return;
  }
  const waitTs = new Date(waitLog.ts).getTime();
  const laterRows = rows.filter((l) => new Date(l.ts).getTime() > waitTs);
  const hasLaterTerminal = laterRows.some((l) => {
    const ts = new Date(l.ts).getTime();
    if (!(ts > waitTs)) return false;
    const type = parseLogType(l.msg);
    return type === "POSTED" || type === "FAILED" || type === "END" || type === "STOP";
  });
  if (hasLaterTerminal) {
    els.logCountdown.textContent = "Next post: -";
    return;
  }
  const waitRaw = String(waitLog.msg || "").replace(/^\[[A-Z_]+\]\s*/, "");
  const waitParts = splitLogTextAndMeta(waitRaw);
  const match = waitParts.message.match(/Waiting\s+(\d+)s/);
  if (!match) {
    els.logCountdown.textContent = "Next post: -";
    return;
  }
  const seconds = Math.max(0, parseInt(match[1], 10));
  const elapsed = Math.floor((Date.now() - new Date(waitLog.ts).getTime()) / 1000);
  const remaining = Math.max(0, seconds - elapsed);
  if (remaining <= 0) {
    els.logCountdown.textContent = "Next post: 0s";
    return;
  }
  els.logCountdown.textContent = `Next post: ${remaining}s`;
}

function renderLogs() {
  if (!els.logs) return;
  const rows = [...state.uiLogs]
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
    .slice(-600);
  const allowedTypes = new Set(["CREATE", "START", "WAIT", "POSTED", "FAILED", "END", "STOP", "SYNC"]);
  const lines = rows.map((x) => {
    const type = parseLogType(x.msg);
    const message = formatLiveLogMessage(type, String(x.msg || "").replace(/^\[[A-Z_]+\]\s*/, ""), x.ts);
    return { time: fmtLogTs(x.ts), type, message, postedClock: type === "POSTED" ? fmtClockTs(x.ts) : "" };
  }).filter((l) => allowedTypes.has(l.type));
  renderLogLines(els.logs, lines);
  updateCountdown();
}

function formatLiveLogMessage(type, rawMessage, ts) {
  const text = String(rawMessage || "");
  if (type === "FAILED") return text;
  if (type !== "POSTED") return text;
  const parts = splitLogTextAndMeta(text);
  const group = String(parts.message || "").trim();
  let postName = "";
  if (parts.meta) postName = String(parts.meta.post || "").trim();
  if (!postName) return group || text;
  return `${group}\n${postName}`;
}

function setView(view) {
  for (const panel of document.querySelectorAll("[data-view-panel]")) {
    panel.classList.toggle("hidden", panel.getAttribute("data-view-panel") !== view);
  }
}

function setActiveMenu(view) {
  for (const m of document.querySelectorAll(".menuItem")) {
    m.classList.toggle("active", (m.getAttribute("data-view") || "results") === view);
  }
}

function updateImageState() {
  const count = Array.from(els.imageFiles?.files || []).length;
  const cached = state.preloadedMediaItems.length;
  if (els.imageState) {
    const shown = count > 0 ? count : cached;
    els.imageState.textContent = `Images: ${shown}`;
  }
}

async function stopAnyBackgroundCampaign() {
  try {
    await sendRuntimeMessage({ type: "AUTO_RE_STOP_CAMPAIGN", payload: {} });
  } catch (_) {
    // Ignore if background worker is unavailable.
  }
}

async function markStaleProcessingCampaignsStopped() {
  let changed = false;
  const map = state.campaignsByAccount || {};
  for (const accountId of Object.keys(map)) {
    const list = Array.isArray(map[accountId]) ? map[accountId] : [];
    for (const c of list) {
      if (c.status === "processing") {
        c.status = "stopped";
        changed = true;
      }
    }
  }
  if (changed) {
    await persistState();
    log("Recovered previous running campaigns as stopped (browser-only mode).");
  }
}

async function loadState() {
  const data = await getStorage([
    STORAGE_KEYS.accounts,
    STORAGE_KEYS.activeAccountId,
    STORAGE_KEYS.campaignsByAccount,
    STORAGE_KEYS.postTemplatesByAccount,
    STORAGE_KEYS.previewPlansByAccount,
    STORAGE_KEYS.groupListsByAccount,
    STORAGE_KEYS.failedGroupsByAccount,
    STORAGE_KEYS.errorLogsByAccount,
    STORAGE_KEYS.groupsSortByAccount,
    STORAGE_KEYS.groupOrderDraftByAccount
  ]);
  state.accounts = Array.isArray(data[STORAGE_KEYS.accounts]) ? data[STORAGE_KEYS.accounts] : [];
  state.activeAccountId = data[STORAGE_KEYS.activeAccountId] || "";
  state.campaignsByAccount = data[STORAGE_KEYS.campaignsByAccount] || {};
  state.postTemplatesByAccount = data[STORAGE_KEYS.postTemplatesByAccount] || {};
  state.previewPlansByAccount = data[STORAGE_KEYS.previewPlansByAccount] || {};
  state.groupListsByAccount = data[STORAGE_KEYS.groupListsByAccount] || {};
  state.failedGroupsByAccount = data[STORAGE_KEYS.failedGroupsByAccount] || {};
  state.errorLogsByAccount = data[STORAGE_KEYS.errorLogsByAccount] || {};
  state.groupsSortByAccount = data[STORAGE_KEYS.groupsSortByAccount] || {};
  state.groupOrderDraftByAccount = data[STORAGE_KEYS.groupOrderDraftByAccount] || {};
  await backfillFailedGroupsIfEmpty();

  if (!state.accounts.length) {
    const def = {
      id: uid("acct"),
      label: "",
      actorId: "",
      lastSync: "",
      groups: []
    };
    state.accounts.push(def);
    state.activeAccountId = def.id;
    await persistState();
  }

  state.accounts = state.accounts.map((a, i) => ({
    ...a,
    label: a.label || accountDisplayName(a, i),
    groups: Array.isArray(a.groups) ? a.groups : []
  }));
  if (!state.accounts.find((a) => a.id === state.activeAccountId)) {
    state.activeAccountId = state.accounts[0].id;
    await persistState();
  }
}

async function refreshRuntimeStateFromStorage() {
  const data = await getStorage([
    STORAGE_KEYS.campaignsByAccount,
    STORAGE_KEYS.failedGroupsByAccount,
    STORAGE_KEYS.errorLogsByAccount
  ]);
  state.campaignsByAccount = data[STORAGE_KEYS.campaignsByAccount] || state.campaignsByAccount || {};
  state.failedGroupsByAccount = data[STORAGE_KEYS.failedGroupsByAccount] || state.failedGroupsByAccount || {};
  state.errorLogsByAccount = data[STORAGE_KEYS.errorLogsByAccount] || state.errorLogsByAccount || {};
}

async function persistState() {
  const compact = compactStateForStorage({
    accounts: state.accounts,
    activeAccountId: state.activeAccountId,
    campaignsByAccount: state.campaignsByAccount,
    postTemplatesByAccount: state.postTemplatesByAccount,
    previewPlansByAccount: state.previewPlansByAccount,
    groupListsByAccount: state.groupListsByAccount,
    failedGroupsByAccount: state.failedGroupsByAccount,
    errorLogsByAccount: state.errorLogsByAccount
  });
  state.campaignsByAccount = compact.campaignsByAccount;
  state.postTemplatesByAccount = compact.postTemplatesByAccount;
  state.previewPlansByAccount = compact.previewPlansByAccount;
  state.failedGroupsByAccount = compact.failedGroupsByAccount;
  state.errorLogsByAccount = compact.errorLogsByAccount;
  try {
    await setStorage({
      [STORAGE_KEYS.accounts]: compact.accounts,
      [STORAGE_KEYS.activeAccountId]: compact.activeAccountId,
      [STORAGE_KEYS.campaignsByAccount]: compact.campaignsByAccount,
      [STORAGE_KEYS.postTemplatesByAccount]: compact.postTemplatesByAccount,
      [STORAGE_KEYS.previewPlansByAccount]: compact.previewPlansByAccount,
    [STORAGE_KEYS.groupListsByAccount]: compact.groupListsByAccount,
    [STORAGE_KEYS.failedGroupsByAccount]: compact.failedGroupsByAccount,
      [STORAGE_KEYS.errorLogsByAccount]: compact.errorLogsByAccount,
      [STORAGE_KEYS.groupsSortByAccount]: state.groupsSortByAccount,
      [STORAGE_KEYS.groupOrderDraftByAccount]: state.groupOrderDraftByAccount
    });
  } catch (e) {
    const msg = String(e?.message || "");
    if (!msg.includes("Quota") && !msg.includes("quota")) throw e;
    const aggressive = aggressiveCompactForQuota(compact);
    state.campaignsByAccount = aggressive.campaignsByAccount;
    state.previewPlansByAccount = aggressive.previewPlansByAccount;
    state.errorLogsByAccount = aggressive.errorLogsByAccount;
    await setStorage({
      [STORAGE_KEYS.accounts]: aggressive.accounts,
      [STORAGE_KEYS.activeAccountId]: aggressive.activeAccountId,
      [STORAGE_KEYS.campaignsByAccount]: aggressive.campaignsByAccount,
      [STORAGE_KEYS.postTemplatesByAccount]: aggressive.postTemplatesByAccount,
      [STORAGE_KEYS.previewPlansByAccount]: aggressive.previewPlansByAccount,
      [STORAGE_KEYS.groupListsByAccount]: aggressive.groupListsByAccount,
      [STORAGE_KEYS.failedGroupsByAccount]: aggressive.failedGroupsByAccount,
      [STORAGE_KEYS.errorLogsByAccount]: aggressive.errorLogsByAccount,
      [STORAGE_KEYS.groupsSortByAccount]: state.groupsSortByAccount,
      [STORAGE_KEYS.groupOrderDraftByAccount]: state.groupOrderDraftByAccount
    });
    log("Storage quota reached: state compacted automatically.");
  }
}

function activeAccount() {
  return state.accounts.find((a) => a.id === state.activeAccountId) || null;
}

function accountCampaigns() {
  return state.campaignsByAccount[state.activeAccountId] || [];
}

function accountPostTemplates() {
  return state.postTemplatesByAccount[state.activeAccountId] || [];
}

function accountPreviewPlans() {
  return state.previewPlansByAccount[state.activeAccountId] || [];
}

function accountGroupLists() {
  return state.groupListsByAccount[state.activeAccountId] || [];
}

function accountFailedGroups() {
  return state.failedGroupsByAccount[state.activeAccountId] || [];
}

function accountErrorLogs() {
  return state.errorLogsByAccount[state.activeAccountId] || [];
}

function accountGroupsSortMode() {
  return state.groupsSortByAccount[state.activeAccountId] || "default";
}

function accountGroupOrderDraft() {
  return state.groupOrderDraftByAccount[state.activeAccountId] || [];
}

function isGroupReorderMode() {
  return !!state.groupReorderModeByAccount[state.activeAccountId];
}

async function saveAccountCampaigns(campaigns) {
  state.campaignsByAccount[state.activeAccountId] = campaigns;
  await persistState();
}

async function upsertAccountCampaign(campaign) {
  if (!campaign?.id) return;
  const list = [...accountCampaigns()];
  const idx = list.findIndex((x) => x.id === campaign.id);
  if (idx >= 0) list[idx] = { ...campaign };
  else list.unshift({ ...campaign });
  await saveAccountCampaigns(list);
}

async function saveAccountPostTemplates(list) {
  state.postTemplatesByAccount[state.activeAccountId] = list;
  await persistState();
}

async function saveAccountPreviewPlans(list) {
  state.previewPlansByAccount[state.activeAccountId] = list;
  await persistState();
}

async function saveAccountGroupLists(list) {
  state.groupListsByAccount[state.activeAccountId] = list;
  await persistState();
}

async function saveAccountFailedGroups(list) {
  state.failedGroupsByAccount[state.activeAccountId] = list;
  await persistState();
}

async function saveAccountErrorLogs(list) {
  state.errorLogsByAccount[state.activeAccountId] = list;
  await persistState();
}

async function backfillFailedGroupsIfEmpty() {
  const existing = accountFailedGroups();
  if (existing.length) return;
  const campaigns = accountCampaigns();
  const merged = [];
  const seen = new Set();
  for (const c of campaigns) {
    for (const r of c.groupResults || []) {
      if (r.status !== "failed") continue;
      const gid = String(r.groupId || "");
      if (!gid || seen.has(gid)) continue;
      seen.add(gid);
      merged.push({
        groupId: gid,
        groupName: String(r.groupName || gid),
        groupUrl: `https://www.facebook.com/groups/${gid}`,
        error: "",
        createdAt: nowIso()
      });
    }
  }
  if (merged.length) {
    await saveAccountFailedGroups(merged);
  }
}

async function migrateTemplateMediaToIndexedDb() {
  let changed = false;
  const mapped = { ...(state.postTemplatesByAccount || {}) };
  for (const acctId of Object.keys(mapped)) {
    const list = Array.isArray(mapped[acctId]) ? mapped[acctId] : [];
    for (const post of list) {
      const mediaItems = Array.isArray(post.mediaItems) ? post.mediaItems : [];
      const nextItems = [];
      for (const item of mediaItems) {
        if (item?.mediaId) {
          nextItems.push({
            mediaId: item.mediaId,
            name: item.name || "",
            type: item.type || "",
            size: Number(item.size || 0) || 0
          });
          continue;
        }
        if (item?.dataUrl) {
          try {
            const ref = await putMediaDataUrlToIndexedDb(item.dataUrl, item.name || "", item.type || "");
            nextItems.push({
              mediaId: ref.mediaId,
              name: ref.name,
              type: ref.type,
              size: Number(item.size || 0) || 0
            });
            changed = true;
          } catch (_) {
            // If migration fails for one media item, keep a minimal marker to avoid quota growth.
            nextItems.push({
              mediaId: "",
              name: item.name || "",
              type: item.type || "",
              size: Number(item.size || 0) || 0
            });
            changed = true;
          }
          continue;
        }
        nextItems.push({
          mediaId: "",
          name: item?.name || "",
          type: item?.type || "",
          size: Number(item?.size || 0) || 0
        });
      }
      post.mediaItems = nextItems;
    }
    mapped[acctId] = list;
  }
  if (changed) {
    state.postTemplatesByAccount = mapped;
    await persistState();
    log("Migrated media payloads to IndexedDB (local).");
  }
}

async function compactIndexedDbMediaGarbage() {
  const used = new Set();
  for (const list of Object.values(state.postTemplatesByAccount || {})) {
    for (const post of (Array.isArray(list) ? list : [])) {
      for (const m of (Array.isArray(post.mediaItems) ? post.mediaItems : [])) {
        const id = String(m?.mediaId || "").trim();
        if (id) used.add(id);
      }
    }
  }
  const allKeys = await idbGetAllKeys(IDB_CONFIG.stores.media);
  for (const key of allKeys) {
    const id = String(key || "");
    if (!used.has(id)) {
      await idbDelete(IDB_CONFIG.stores.media, id);
    }
  }
}

async function getTokens() {
  const r = await fetch("https://www.facebook.com/settings", { credentials: "include" });
  const html = await r.text();
  const lsd = extractRegex(html, /"token":\s*"([^"]+)"/);
  const actorId = extractRegex(html, /"actorId":\s*"([^"]+)"/) || extractRegex(html, /"actorID":\s*"([^"]+)"/);
  const fb_dtsg = extractRegex(html, /"DTSGInitialData",\s*\[[^\]]*\],\s*\{[^{}]*"token"\s*:\s*"([^"]+)"/);
  const rev = extractRegex(html, /"consistency":\s*\{"rev":\s*(\d+)\}/);
  const hsi = extractRegex(html, /"hsi":\s*"([^"]+)"/);
  const spin_r = extractRegex(html, /"__spin_r":\s*(\d+),/);
  const spin_b = extractRegex(html, /"__spin_b":\s*"([^"]+)"/);
  const spin_t = extractRegex(html, /"__spin_t":\s*(\d+),/);
  if (!fb_dtsg || !actorId || !lsd) throw new Error("Could not extract Facebook tokens");
  return { lsd, actorId, fb_dtsg, rev, hsi, spin_r, spin_b, spin_t };
}

function baseForm(tokens, req = "1i", jazoest = "25669") {
  return new URLSearchParams({
    av: tokens.actorId,
    __aaid: "0",
    __user: tokens.actorId,
    __a: "1",
    __req: req,
    __hs: "20160.HYP:comet_pkg.2.1...1",
    dpr: "1",
    __ccg: "EXCELLENT",
    __rev: tokens.rev || "",
    __s: "",
    __hsi: tokens.hsi || "",
    __dyn: "",
    __csr: "",
    __hsdp: "",
    __hblp: "",
    __comet_req: "15",
    fb_dtsg: tokens.fb_dtsg,
    jazoest,
    lsd: tokens.lsd,
    __spin_r: tokens.spin_r || "",
    __spin_b: tokens.spin_b || "",
    __spin_t: tokens.spin_t || ""
  });
}

async function fbGraphql(tokens, docId, friendlyName, variablesObj) {
  const body = baseForm(tokens);
  body.set("fb_api_caller_class", "RelayModern");
  body.set("fb_api_req_friendly_name", friendlyName);
  body.set("variables", JSON.stringify(variablesObj));
  body.set("server_timestamps", "true");
  body.set("doc_id", docId);
  const r = await fetch("https://www.facebook.com/api/graphql/", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const rawText = await r.text();
  let parsed = null;
  try {
    parsed = parseFbJsonResponse(rawText);
  } catch (_) {
    parsed = null;
  }
  return {
    ok: r.ok,
    status: r.status,
    rawText,
    data: parsed
  };
}

function parseGroupsPayload(payload) {
  const out = [];
  const viewer = payload?.data?.viewer || {};
  const groupsTab = viewer.groups_tab || {};
  const buckets = [groupsTab?.pinned_groups?.edges || [], groupsTab?.tab_groups_list?.edges || []];
  for (const edges of buckets) {
    for (const edge of edges) {
      const n = edge?.node || {};
      const id = String(n.id || "").trim();
      if (!id) continue;
      const membersCount =
        n?.group_member_profiles?.count ??
        n?.group_members?.count ??
        n?.members?.count ??
        null;
      const membersText =
        n?.members_summary?.text ||
        (typeof membersCount === "number" && Number.isFinite(membersCount) ? `${membersCount} members` : "");
      const photoUrl =
        n?.profile_picture?.uri ||
        n?.picture?.uri ||
        n?.group_profile_picture?.uri ||
        n?.cover_photo?.photo?.image?.uri ||
        "";
      out.push({
        id,
        name: String(n.name || ""),
        privacy: String(n?.privacy_info?.title?.text || ""),
        url: `https://www.facebook.com/groups/${id}`,
        membersText: String(membersText || ""),
        membersCount: typeof membersCount === "number" && Number.isFinite(membersCount)
          ? Math.round(membersCount)
          : parseMembersCount(membersText),
        photoUrl: String(photoUrl || "")
      });
    }
  }
  const pageInfo = groupsTab?.tab_groups_list?.page_info || {};
  return { groups: out, endCursor: pageInfo.end_cursor || "", hasNextPage: !!pageInfo.has_next_page };
}

function decodeEscapedUnicode(text) {
  try {
    return String(text || "").replace(/\\u([0-9a-fA-F]{4})/g, (_m, g1) => String.fromCharCode(parseInt(g1, 16)));
  } catch (_) {
    return String(text || "");
  }
}

function extractMembersTextFromGroupHtml(html) {
  const raw = String(html || "");
  const patterns = [
    /"formatted_count_text":"([^"]+)"/,
    /"member_count_sentence":"([^"]+)"/,
    /"members_count_text":"([^"]+)"/
  ];
  for (const p of patterns) {
    const m = raw.match(p);
    if (m && m[1]) return decodeEscapedUnicode(m[1]).replace(/\\"/g, "\"");
  }
  return "";
}

async function fetchGroupMembersText(groupId) {
  try {
    const url = `https://www.facebook.com/groups/${encodeURIComponent(String(groupId || ""))}`;
    const res = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        accept: "text/html,*/*;q=0.9",
        "accept-language": "en-US,en;q=0.9"
      }
    });
    if (!res.ok) return "";
    const html = await res.text();
    return extractMembersTextFromGroupHtml(html);
  } catch (_) {
    return "";
  }
}

function renderAccountSwitcher() {
  els.accountSelect.innerHTML = "";
  for (let i = 0; i < state.accounts.length; i += 1) {
    const a = state.accounts[i];
    const opt = document.createElement("option");
    opt.value = a.id;
    const campaigns = accountCampaignCount(a.id);
    const groups = (a.groups || []).length;
    opt.textContent = `${accountDisplayName(a, i)} | ${campaigns} campaign(s) | ${groups} group(s)`;
    els.accountSelect.appendChild(opt);
  }
  els.accountSelect.value = state.activeAccountId;
  const a = activeAccount();
  if (!a) {
    if (els.accountLabelLine) els.accountLabelLine.textContent = "No account selected";
    if (els.accountIdLine) els.accountIdLine.textContent = "";
    if (els.brandProfileDisplay) els.brandProfileDisplay.textContent = "";
    return;
  }
  const brandName = a.customLabel ? String(a.label || "").trim() : "";
  if (els.brandProfileDisplay) {
    els.brandProfileDisplay.textContent = brandName;
  }
  if (els.brandProfileInput) {
    const isEditing = document.activeElement === els.brandProfileInput;
    if (!isEditing) {
      els.brandProfileInput.value = brandName;
    }
  }
  const lastSync = a.lastSync ? fmtDate(a.lastSync) : "never";
  const campaigns = accountCampaignCount(a.id);
  if (els.accountLabelLine) {
    els.accountLabelLine.textContent = `Profile: ${a.label || accountDisplayName(a)} | Campaigns: ${campaigns} | Groups: ${(a.groups || []).length} | Last sync: ${lastSync}`;
  }
  if (els.accountIdLine) {
    els.accountIdLine.textContent = `FB ID: ${a.actorId || "-"}`;
  }
}

function renderPostTemplates() {
  if (!els.postList) return;
  const scrollById = new Map();
  for (const box of document.querySelectorAll(".groupsPicker")) {
    const id = box.getAttribute("data-id") || "";
    if (id) scrollById.set(id, box.scrollTop);
  }
  const list = accountPostTemplates();
  const groups = getDisplayGroupsForActiveAccount();
  els.postList.innerHTML = "";
  if (!list.length) {
    els.postList.innerHTML = `<div class="emptyState">No saved posts yet.</div>`;
    return;
  }
  list.forEach((p, index) => {
    const card = document.createElement("div");
    card.className = "postCard";
    const enabled = p.enabled !== false;
    const expanded = !!p.expanded;
    const groupCount = (p.groupIds || []).length;
    const groupIdSet = new Set((p.groupIds || []).map((id) => String(id)));
    const selectedCount = groups.reduce((acc, g) => acc + (groupIdSet.has(String(g.id)) ? 1 : 0), 0);
    const allSelected = groups.length > 0 && selectedCount === groups.length;
    const failedSet = new Set(
      accountFailedGroups()
        .map((x) => String(x.groupId || "").trim())
        .filter(Boolean)
    );
    const minM = p.minIntervalMinutes ?? 0;
    const maxM = p.maxIntervalMinutes ?? minM;
    card.innerHTML = `
      <div class="postCardHeader">
        <div>
          <div class="postCardTitle">${p.name || "Unnamed post"}</div>
          <div class="postCardMeta">Images: ${(p.mediaItems || []).length} | Groups: ${groupCount} | Interval: ${minM}-${maxM} min</div>
        </div>
        <div class="postCardActions">
          <label class="toggle"><input type="checkbox" class="postEnable" data-id="${p.id}" ${enabled ? "checked" : ""}/> Enabled</label>
          <button class="btn small postShowMore" data-id="${p.id}">${expanded ? "Hide" : "Show more"}</button>
          <button class="btn small postEdit" data-id="${p.id}">Edit</button>
          <button class="btn small danger postDelete" data-id="${p.id}">Delete</button>
        </div>
      </div>
      <div class="postDetails ${expanded ? "active" : ""}" data-details="${p.id}">
        <div class="row">
          <label>Min interval (minutes) <input class="postMin" data-id="${p.id}" type="number" min="0" step="0.5" value="${minM}" /></label>
          <label>Max interval (minutes) <input class="postMax" data-id="${p.id}" type="number" min="0" step="0.5" value="${maxM}" /></label>
          <label>Priority
            <select class="postPriority" data-id="${p.id}">
              <option value="normal" ${p.priority === "normal" ? "selected" : ""}>Normal</option>
              <option value="high" ${p.priority === "high" ? "selected" : ""}>High</option>
              <option value="low" ${p.priority === "low" ? "selected" : ""}>Low</option>
            </select>
          </label>
        </div>
        <div class="row">
          <label class="toggle"><input type="checkbox" class="postRepeat" data-id="${p.id}" ${p.repeatEnabled ? "checked" : ""}/> Repeat</label>
          <label>Repeat every (days) <input class="postRepeatDays" data-id="${p.id}" type="number" min="1" value="${p.repeatDays || 1}" /></label>
        </div>
        <div class="row">
          <input type="text" class="postGroupSearch" data-id="${p.id}" placeholder="Search groups..." />
          <label class="toggle"><input type="checkbox" class="postSelectAllGroups" data-id="${p.id}" data-selected="${selectedCount}" data-total="${groups.length}" ${allSelected ? "checked" : ""}/> Select all</label>
          <button class="btn small danger postClearGroups" data-id="${p.id}">Clear All</button>
        </div>
        <div class="row">
          <label>Group list
            <select class="postGroupList" data-id="${p.id}">
              <option value="">Select list...</option>
              ${accountGroupLists().map((gl) => `<option value="${gl.id}">${gl.name} (${gl.groupIds.length})</option>`).join("")}
            </select>
          </label>
        </div>
          <div class="groupsPicker groupsPickerCards ${p.groupsHidden ? "hidden" : ""}" data-id="${p.id}">
            ${groups.map((g) => {
              const checked = (p.groupIds || []).includes(g.id);
              return `<label class="grpRow grpCard ${checked ? "selected" : ""}" data-name="${escapeHtml(String(g.name || "").toLowerCase())}" data-group-id="${escapeHtml(String(g.id || ""))}">
                <div class="grpCardLeft">
                  ${g.photoUrl
                    ? `<img class="grpAvatar" src="${escapeHtml(g.photoUrl)}" alt="group" />`
                    : `<div class="grpAvatar grpAvatarPlaceholder">${escapeHtml((g.name || "?").slice(0, 1).toUpperCase())}</div>`}
                  <div class="grpText">
                    <div class="grpName">${escapeHtml(g.name || g.id)}</div>
                    <div class="grpMeta">${escapeHtml(g.membersText || "")}</div>
                  </div>
                </div>
                <div class="grpCardRight">
                  ${failedSet.has(String(g.id || "")) ? `<span class="tag failed">Issue</span>` : ""}
                  <input type="checkbox" class="postGroupCheck" data-id="${p.id}" value="${g.id}" ${checked ? "checked" : ""}/>
                </div>
              </label>`;
            }).join("")}
          </div>
          <div class="row">
            <button class="btn small postHideGroups" data-id="${p.id}">${p.groupsHidden ? "Show Groups" : "Hide Groups"}</button>
          </div>
        </div>
      `;
      els.postList.appendChild(card);
    });
    for (const box of document.querySelectorAll(".groupsPicker")) {
      const id = box.getAttribute("data-id") || "";
      if (scrollById.has(id)) box.scrollTop = scrollById.get(id);
    }

  for (const btn of document.querySelectorAll(".postShowMore")) {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const list = accountPostTemplates();
      const updated = list.map((p) => ({ ...p, expanded: p.id === id ? !p.expanded : false }));
      saveAccountPostTemplates(updated).then(renderPostTemplates);
    });
  }
  for (const btn of document.querySelectorAll(".postEdit")) {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const list = accountPostTemplates();
      const item = list.find((x) => x.id === id);
      if (!item) return;
      state.editingPostId = id;
      if (els.postName) els.postName.value = item.name || "";
      if (els.postText) els.postText.value = item.text || "";
      state.preloadedMediaItems = Array.isArray(item.mediaItems) ? item.mediaItems.map((m) => ({ ...m })) : [];
      state.preloadedFromCampaignId = item.id;
      updateImageState();
      setBuilderStatus(`Editing: ${item.name || "Unnamed"}`);
      if (els.btnSavePostTemplate) els.btnSavePostTemplate.textContent = "Update Post";
    });
  }
  for (const btn of document.querySelectorAll(".postDelete")) {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const list = accountPostTemplates();
      const item = list.find((x) => x.id === id);
      if (!item) return;
      if (!confirm(`Delete saved post?\n${item.name || id}`)) return;
      const filtered = list.filter((x) => x.id !== id);
      saveAccountPostTemplates(filtered).then(() => {
        if (state.editingPostId === id) {
          state.editingPostId = "";
          if (els.btnSavePostTemplate) els.btnSavePostTemplate.textContent = "Save Post";
        }
        renderPostTemplates();
        log(`Deleted post: ${item.name || id}`);
      });
    });
  }
  for (const btn of document.querySelectorAll(".postHideGroups")) {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      if (!id) return;
      const list = accountPostTemplates();
      const updated = list.map((p) => (p.id === id ? { ...p, groupsHidden: !p.groupsHidden } : p));
      saveAccountPostTemplates(updated).then(renderPostTemplates);
    });
  }
  for (const toggle of document.querySelectorAll(".postEnable")) {
    toggle.addEventListener("change", () => {
      const id = toggle.getAttribute("data-id");
      const list = accountPostTemplates();
      if (toggle.checked) {
        const enabledCount = list.filter((p) => p.enabled !== false).length;
        if (enabledCount >= 3) {
          toggle.checked = false;
          log("Only 3 posts can be enabled at the same time.");
          return;
        }
      }
      const updated = list.map((p) => p.id === id ? { ...p, enabled: toggle.checked } : p);
      saveAccountPostTemplates(updated).then(renderPostTemplates);
    });
  }
  const autoSave = (id) => {
    const list = accountPostTemplates();
    const p = list.find((x) => x.id === id);
    if (!p) return;
    const minInput = document.querySelector(`.postMin[data-id="${id}"]`);
    const maxInput = document.querySelector(`.postMax[data-id="${id}"]`);
    const prio = document.querySelector(`.postPriority[data-id="${id}"]`);
      const repeat = document.querySelector(`.postRepeat[data-id="${id}"]`);
      const repeatDays = document.querySelector(`.postRepeatDays[data-id="${id}"]`);
    const groupChecks = Array.from(document.querySelectorAll(`.postGroupCheck[data-id="${id}"]:checked`));
    const groupIds = groupChecks.map((c) => c.value);
    const minM = Math.max(0, Number(minInput?.value || "0"));
    const maxM = Math.max(minM, Number(maxInput?.value || String(minM)));
    const updated = list.map((x) => x.id === id ? {
      ...x,
      minIntervalMinutes: minM,
      maxIntervalMinutes: maxM,
      priority: prio?.value || "normal",
        repeatEnabled: !!repeat?.checked,
        repeatDays: Math.max(1, parseInt(repeatDays?.value || "1", 10)),
        groupIds
      } : x);
    saveAccountPostTemplates(updated).then(() => {
      renderPostTemplates();
      log(`Updated settings for ${p.name}`);
    });
  };
  for (const el of document.querySelectorAll(".postMin, .postMax, .postPriority, .postRepeat, .postRepeatDays, .postGroupCheck")) {
    el.addEventListener("change", (ev) => {
      const id = ev.target.getAttribute("data-id");
      if (ev.target.classList.contains("postGroupCheck")) {
        const row = ev.target.closest(".grpCard");
        if (row) row.classList.toggle("selected", !!ev.target.checked);
      }
      if (id) autoSave(id);
    });
  }
  for (const el of document.querySelectorAll(".postGroupList")) {
    el.addEventListener("change", (ev) => {
      const id = ev.target.getAttribute("data-id");
      if (!id) return;
      const list = accountGroupLists();
      const gl = list.find((x) => x.id === ev.target.value);
      if (!gl) return;
      for (const ch of document.querySelectorAll(`.postGroupCheck[data-id="${id}"]`)) {
        ch.checked = gl.groupIds.includes(ch.value);
      }
      autoSave(id);
    });
  }
  for (const el of document.querySelectorAll(".postSelectAllGroups")) {
    const selected = Number(el.getAttribute("data-selected") || "0");
    const total = Number(el.getAttribute("data-total") || "0");
    if (total > 0 && selected > 0 && selected < total) {
      el.indeterminate = true;
    }
    el.addEventListener("change", (ev) => {
      const id = ev.target.getAttribute("data-id");
      if (!id) return;
      const checked = !!ev.target.checked;
      for (const ch of document.querySelectorAll(`.postGroupCheck[data-id="${id}"]`)) {
        ch.checked = checked;
        const row = ch.closest(".grpCard");
        if (row) row.classList.toggle("selected", checked);
      }
      autoSave(id);
    });
  }
  for (const btn of document.querySelectorAll(".postClearGroups")) {
    btn.addEventListener("click", (ev) => {
      const id = ev.target.getAttribute("data-id");
      if (!id) return;
      for (const ch of document.querySelectorAll(`.postGroupCheck[data-id="${id}"]`)) {
        ch.checked = false;
        const row = ch.closest(".grpCard");
        if (row) row.classList.remove("selected");
      }
      const selectAll = document.querySelector(`.postSelectAllGroups[data-id="${id}"]`);
      if (selectAll) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
      }
      autoSave(id);
    });
  }
  for (const input of document.querySelectorAll(".postGroupSearch")) {
    input.addEventListener("input", (ev) => {
      const id = ev.target.getAttribute("data-id");
      if (!id) return;
      const q = String(ev.target.value || "").trim().toLowerCase();
      const cards = document.querySelectorAll(`.grpCard .postGroupCheck[data-id="${id}"]`);
      for (const ch of cards) {
        const row = ch.closest(".grpCard");
        if (!row) continue;
        const name = String(row.getAttribute("data-name") || "");
        const gid = String(row.getAttribute("data-group-id") || "");
        row.classList.toggle("hidden", !!q && !name.includes(q) && !gid.includes(q));
      }
    });
  }
}

async function savePreviewPlan(plan) {
  const list = accountPreviewPlans();
  list.unshift(plan);
  await saveAccountPreviewPlans(list.slice(0, 10));
  state.previewPlanId = plan.id;
}

function getSavedPreviewPlan() {
  const list = accountPreviewPlans();
  return list.length ? list[0] : null;
}

function updatePreviewActionState() {
  const plan = getSavedPreviewPlan();
  const ready = !!(plan && state.previewPlanId && plan.id === state.previewPlanId && Array.isArray(plan.events) && plan.events.length > 0);
  if (els.btnPreview) {
    els.btnPreview.classList.toggle("attention", !ready);
  }
  if (els.btnStart) {
    els.btnStart.classList.toggle("needsPreview", !ready);
  }
  if (els.previewActionHint) {
    els.previewActionHint.textContent = ready
      ? "Preview ready. Click Start Posting."
      : "1) Build Preview first, then 2) Start Posting";
  }
}

async function startCampaignWithPlan(plan) {
  const acct = activeAccount();
  if (!acct) return log("No active account.");
  const tokens = await getTokens();
  if (acct.actorId && acct.actorId !== tokens.actorId) {
    return log(`Active account (${acct.actorId}) is not current Facebook login (${tokens.actorId}). Switch Facebook account first.`);
  }
  acct.actorId = tokens.actorId;

  const templates = accountPostTemplates();
  if (!plan?.events?.length) return log("No saved plan to resume.");

  const campaignsByPostId = new Map();
  const list = accountCampaigns();
  for (const p of plan.posts || []) {
    const tpl = templates.find((t) => t.id === p.id);
    if (!tpl) continue;
    const text = (tpl.text || "").trim();
    if (!text) continue;
    const groupIds = (p.groupIds || []);
    const mediaItems = Array.isArray(tpl.mediaItems) ? tpl.mediaItems.map((m) => ({ ...m })) : [];
    let mediaFiles = [];
    try {
      mediaFiles = await Promise.all(mediaItems.map((m) => mediaItemToFile(m)));
    } catch (e) {
      log(`Skipping post "${tpl.name || p.id}" due to media error: ${e.message || String(e)}`);
      continue;
    }
    const title = tpl.name || text.slice(0, 70) + (text.length > 70 ? "..." : "");
      const campaign = {
        id: uid("campaign"),
        title,
        postName: title,
        text,
        description: text,
        status: "pending",
        createdAt: nowIso(),
        scheduledAt: nowIso(),
      groupCount: groupIds.length,
      groupIds,
      postedCount: 0,
      failedCount: 0,
      pendingCount: groupIds.length,
      successRate: 0,
      intervalBetweenPostsMin: p.minIntervalMinutes ?? 0,
      minIntervalMinutes: p.minIntervalMinutes ?? 0,
      maxIntervalMinutes: p.maxIntervalMinutes ?? p.minIntervalMinutes ?? 0,
      repeatEnabled: false,
      repeatDays: 1,
      repeatEvery: "Disabled",
      mediaNames: mediaItems.map((m) => m.name || "image"),
      mediaItems,
      priority: p.priority || "normal",
      groupResults: []
    };
    list.unshift(campaign);
    campaignsByPostId.set(p.id, { campaign, template: tpl, mediaFiles });
    logEvent("CREATE", "Campaign started (saved schedule)", { title: campaign.title, groups: groupIds.length });
  }
  await saveAccountCampaigns(list);
  await persistState();

    const events = [...plan.events].sort((a, b) => {
      const ta = new Date(a.at).getTime();
      const tb = new Date(b.at).getTime();
      if (ta !== tb) return ta - tb;
      return (a.order ?? 0) - (b.order ?? 0);
    });
    state.stopRequested = false;
    const startedCampaigns = new Set();
    const startDelay = Math.max(0, plan.startDelaySeconds || 0);
    if (startDelay > 0) {
      logEvent("WAIT", `Waiting ${startDelay}s before first post`, { scheduledStart: new Date(Date.now() + startDelay * 1000).toLocaleTimeString() });
      const ok = await sleepInterruptible(startDelay * 1000);
      if (!ok) {
        for (const entry of campaignsByPostId.values()) {
          entry.campaign.status = "stopped";
          await upsertAccountCampaign(entry.campaign);
        }
        renderAll();
        setStatus("Stopped");
        logEvent("END", "Campaign stopped");
        return;
      }
    }
    for (const ev of events) {
      if (state.stopRequested) break;
      const bundle = campaignsByPostId.get(ev.postId);
      if (!bundle) continue;
      const { campaign, template, mediaFiles } = bundle;
      if (campaign.status !== "processing") {
        campaign.status = "processing";
        startedCampaigns.add(campaign.id);
      }
      const syncGroupName = ev.groupName || ev.groupId;
      try {
        state.lastPostActionAtMs = Date.now();
        startSyncMonitor(campaign.postName, syncGroupName, (mediaFiles || []).length);
        setSyncPhase("text", { post: campaign.postName, group: syncGroupName });
        setSyncPhase("upload", { files: (mediaFiles || []).length });
        const photoIds = await Promise.all((mediaFiles || []).map(async (file) => {
          const photoId = await uploadImage(tokens, file);
          incrementSyncUploadDone();
          return photoId;
        }));
        setSyncPhase("submit");
        const url = await postToGroup(tokens, ev.groupId, template.text || template.description || "", photoIds);
        finishSyncMonitor("posted");
        campaign.postedCount += 1;
        campaign.groupResults.push({ groupId: ev.groupId, groupName: ev.groupName || ev.groupId, status: "completed", url, ts: nowIso() });
        logEvent("POSTED", ev.groupName || ev.groupId, { url, post: campaign.postName });
      } catch (e) {
        finishSyncMonitor("failed", e.message || String(e));
        campaign.failedCount += 1;
        campaign.groupResults.push({ groupId: ev.groupId, groupName: ev.groupName || ev.groupId, status: "failed", url: "", ts: nowIso() });
        await recordFailedGroup(ev.groupId, ev.groupName || ev.groupId, e.message);
        logEvent("FAILED", ev.groupName || ev.groupId, { error: e.message, post: campaign.postName });
      }
      campaign.pendingCount = Math.max(0, (campaign.groupCount || 0) - ((campaign.postedCount || 0) + (campaign.failedCount || 0)));
      campaign.successRate = campaign.groupCount ? (campaign.postedCount / campaign.groupCount) * 100 : 0;
      await upsertAccountCampaign(campaign);
      renderCampaignTable();
      if (!state.stopRequested && Number.isFinite(Number(ev.waitSeconds)) && Number(ev.waitSeconds) > 0) {
        const waitSec = Math.round(Number(ev.waitSeconds));
        const nextEv = events[events.indexOf(ev) + 1];
        logEvent("WAIT", `Waiting ${waitSec}s (planned)`, {
          post: campaign.postName,
          group: nextEv?.groupName || ev.groupName || ev.groupId
        });
        const ok = await sleepInterruptible(waitSec * 1000);
        if (!ok) break;
      }
    }
  for (const entry of campaignsByPostId.values()) {
    const c = entry.campaign;
    c.status = state.stopRequested ? "stopped" : (c.failedCount === 0 ? "completed" : "failed");
    await upsertAccountCampaign(c);
  }
  renderAll();
}
function statusClass(status) {
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "stopped") return "stopped";
  if (status === "processing") return "processing";
  return "pending";
}

function normalizeCampaignStats(campaign) {
  const c = campaign || {};
  const results = Array.isArray(c.groupResults) ? c.groupResults : [];
  const postedFromResults = results.filter((r) => r?.status === "completed").length;
  const failedFromResults = results.filter((r) => r?.status === "failed").length;
  const posted = Math.max(Number(c.postedCount || 0), postedFromResults);
  const failed = Math.max(Number(c.failedCount || 0), failedFromResults);
  const groupCount = Math.max(0, Number(c.groupCount || 0));
  const done = Math.max(0, posted + failed);
  const pending = Math.max(0, groupCount - done);
  const successRate = groupCount ? (posted / groupCount) * 100 : 0;
  return {
    ...c,
    postedCount: posted,
    failedCount: failed,
    pendingCount: pending,
    successRate
  };
}

function applyPriorityOrdering(groups, priority) {
  const list = [...groups];
  if (priority === "high") return list;
  if (priority === "low") return list.reverse();
  return list;
}

function previewSchedule() {
  const active = accountCampaigns().some((c) => c.status === "processing");
  if (active || state.runningCampaignId || state.stopRequested) {
    log("Stop running campaigns before building a new preview.");
    if (els.previewLog) els.previewLog.textContent = "Stop running campaigns before building a new preview.";
    return;
  }
  const posts = accountPostTemplates().filter((p) => p.enabled !== false);
  if (!posts.length) {
    if (els.previewLog) els.previewLog.textContent = "Enable at least one post.";
    return;
  }
  const preset = els.intervalPreset?.value || "default";
  const presets = {
    normal: { min: 3, max: 5, label: "Normal: 3-5 min" },
    safe: { min: 5, max: 8, label: "Safe: 5-8 min" },
    super_safe: { min: 8, max: 12, label: "Super Safe: 8-12 min" }
  };
  if (els.intervalHint) {
    els.intervalHint.textContent = preset === "default"
      ? "Default: uses each post’s min/max"
      : presets[preset]?.label || "Custom";
  }
  const plan = {
    id: uid("plan"),
    createdAt: nowIso(),
    posts: [],
    events: []
  };
  const rawDelay = Number(els.startDelayMinutes?.value || 0.5);
  const startDelayMinutes = Math.max(0.5, Number.isFinite(rawDelay) ? rawDelay : 0.5);
  if (els.startDelayMinutes && startDelayMinutes !== rawDelay) {
    els.startDelayMinutes.value = String(startDelayMinutes);
  }
  const startDelaySeconds = Math.round(startDelayMinutes * 60);
  let lines = [];
  const previewStart = Date.now() + startDelaySeconds * 1000;
  lines.push({ time: new Date(previewStart).toLocaleTimeString(), type: "START", message: `Start in ${startDelaySeconds}s` });
  const groupMap = new Map((activeAccount()?.groups || []).map((g) => [g.id, g.name || g.id]));
  let orderIndex = 0;
  for (const p of posts) {
    const groups = (p.groupIds || []).map((id) => ({ id, name: groupMap.get(id) || id }));
    const ordered = applyPriorityOrdering(groups, p.priority || "normal");
    let minM = p.minIntervalMinutes ?? 0;
    let maxM = Math.max(minM, p.maxIntervalMinutes ?? minM);
    if (preset !== "default" && presets[preset]) {
      minM = presets[preset].min;
      maxM = presets[preset].max;
    }
    plan.posts.push({
      id: p.id,
      postName: p.name || "Unnamed",
      minIntervalMinutes: minM,
      maxIntervalMinutes: maxM,
      priority: p.priority || "normal",
      groupIds: ordered.map((g) => g.id),
      repeatEnabled: !!p.repeatEnabled,
      repeatDays: p.repeatDays || 1
    });
    let cur = previewStart;
    for (let i = 0; i < ordered.length; i += 1) {
      const g = ordered[i];
      const at = new Date(cur);
      plan.events.push({
        postId: p.id,
        postName: p.name || "Unnamed",
        groupId: g.id,
        groupName: g.name || g.id,
        at: at.toISOString(),
        order: orderIndex++
      });
      if (i < ordered.length - 1) {
        const randMins = minM + Math.random() * (maxM - minM);
        const waitMs = Math.max(1000, Math.round(randMins * 60 * 1000));
        plan.events[plan.events.length - 1].waitSeconds = Math.round(waitMs / 1000);
        cur += waitMs;
      }
    }
  }
  plan.events.sort((a, b) => {
    const ta = new Date(a.at).getTime();
    const tb = new Date(b.at).getTime();
    if (ta !== tb) return ta - tb;
    return (a.order ?? 0) - (b.order ?? 0);
  });
  // Strict global schedule: serialize all events using each event planned wait.
  const postCfg = new Map(plan.posts.map((p) => [String(p.id), p]));
  for (let i = 0; i < plan.events.length - 1; i += 1) {
    const ev = plan.events[i];
    if (!Number.isFinite(Number(ev.waitSeconds))) {
      const cfg = postCfg.get(String(ev.postId));
      const minM = Number(cfg?.minIntervalMinutes ?? 0.5);
      const maxM = Math.max(minM, Number(cfg?.maxIntervalMinutes ?? minM));
      const randMins = minM + Math.random() * (maxM - minM);
      ev.waitSeconds = Math.max(1, Math.round(randMins * 60));
    }
  }
  let globalAt = previewStart;
  for (let i = 0; i < plan.events.length; i += 1) {
    const ev = plan.events[i];
    ev.at = new Date(globalAt).toISOString();
    if (i < plan.events.length - 1) {
      globalAt += Math.max(0, Math.round(Number(ev.waitSeconds || 0)) * 1000);
    }
  }
  plan.startDelaySeconds = startDelaySeconds;
  lines = [{ time: new Date(previewStart).toLocaleTimeString(), type: "START", message: `Start in ${startDelaySeconds}s` }];
  for (const ev of plan.events) {
    const waitInfo = ev.waitSeconds ? ` | wait ${ev.waitSeconds}s` : "";
    lines.push({
      time: new Date(ev.at).toLocaleTimeString(),
      type: "SCHEDULE",
      message: `${ev.postName} -> ${ev.groupName}${waitInfo}`
    });
  }
  const endAt = plan.events.length ? new Date(plan.events[plan.events.length - 1].at) : new Date(previewStart);
  lines.push({ time: endAt.toLocaleTimeString(), type: "END", message: "Preview complete" });
  if (els.previewLog) renderLogLines(els.previewLog, lines);
  savePreviewPlan(plan).then(updatePreviewActionState);
}

function renderCampaignTable() {
  const q = (els.campaignSearch.value || "").toLowerCase().trim();
  const campaigns = accountCampaigns()
    .filter((c) => state.filter === "all" || c.status === state.filter)
    .filter((c) => {
      if (!q) return true;
      const title = (c.title || "").toLowerCase();
      const name = (c.postName || "").toLowerCase();
      return title.includes(q) || name.includes(q);
    });

  els.campaignsBody.innerHTML = "";
  for (const c of campaigns) {
    const normalized = normalizeCampaignStats(c);
    const doneCount = (normalized.postedCount || 0) + (normalized.failedCount || 0);
    const rate = Math.max(0, Math.min(100, Math.round(normalized.groupCount ? (doneCount / normalized.groupCount) * 100 : 0)));
    const actions = [];
    const isRunningThis = state.runningCampaignId && state.runningCampaignId === normalized.id;
    if (isRunningThis && (normalized.status === "processing" || normalized.status === "pending")) {
      actions.push(`<button class="btn small danger campaignActionBtn" data-action="stop" data-id="${normalized.id}">Stop</button>`);
    } else {
      if (normalized.status === "stopped") {
        actions.push(`<button class="btn small campaignActionBtn" data-action="complete" data-id="${normalized.id}">Complete</button>`);
      }
    }
    const actionHtml = actions.length ? actions.join(" ") : "-";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="tag pending">Repeats</span></td>
      <td><a href="#" class="campaignLink" data-id="${normalized.id}">${normalized.postName || normalized.title || "-"}</a></td>
      <td>Manually selected<br>${normalized.groupCount || 0} groups</td>
      <td>${fmtDate(normalized.scheduledAt)}</td>
      <td><span class="tag ${statusClass(normalized.status)}">${normalized.status || "pending"}</span></td>
      <td>
        ${doneCount}/${normalized.groupCount || 0} done
        <div class="progressBar"><div style="width:${rate}%"></div></div>
        ${rate}%
      </td>
      <td>${actionHtml}</td>
    `;
    els.campaignsBody.appendChild(tr);
  }
  for (const el of document.querySelectorAll(".campaignLink")) {
    el.addEventListener("click", (ev) => {
      ev.preventDefault();
      state.selectedCampaignId = el.getAttribute("data-id") || "";
      openModal("overview");
    });
  }
  for (const btn of document.querySelectorAll(".campaignActionBtn")) {
    btn.addEventListener("click", async () => {
      const action = btn.getAttribute("data-action");
      const campaignId = btn.getAttribute("data-id") || "";
      if (!campaignId) return;
      if (action === "stop") {
        state.stopRequested = true;
        if (state.runningCampaignId === campaignId) {
          setStatus("Stop requested");
          log(`Stop requested for campaign ${campaignId}`);
        } else {
          const list = accountCampaigns();
          const idx = list.findIndex((x) => x.id === campaignId);
          if (idx >= 0 && list[idx].status === "processing") {
            list[idx].status = "stopped";
            await saveAccountCampaigns(list);
            log(`Campaign stopped: ${campaignId}`);
          }
        }
        renderAll();
      } else if (action === "complete") {
        const list = accountCampaigns();
        const idx = list.findIndex((x) => x.id === campaignId);
        if (idx >= 0 && list[idx].status === "stopped") {
          if (state.runningCampaignId) {
            log("Another campaign is already running. Stop it first.");
            return;
          }
          const campaign = list[idx];
          const acct = activeAccount();
          const remaining = buildRemainingGroupsForCampaign(acct, campaign);
          if (!remaining.length) {
            campaign.status = campaign.failedCount === 0 ? "completed" : "failed";
            await saveAccountCampaigns(list);
            log(`Campaign finalized (nothing remaining): ${campaignId}`);
            renderAll();
            return;
          }

          const mediaItems = Array.isArray(campaign.mediaItems) ? campaign.mediaItems : [];

          const tokens = await getTokens();
          if (acct?.actorId && acct.actorId !== tokens.actorId) {
            log(`Active account (${acct.actorId}) does not match current Facebook login (${tokens.actorId}).`);
            return;
          }

          campaign.status = "processing";
          await saveAccountCampaigns(list);
          const minM = Math.max(0, Number(campaign.minIntervalMinutes ?? campaign.intervalBetweenPostsMin ?? 1));
          const maxM = Math.max(minM, Number(campaign.maxIntervalMinutes ?? campaign.intervalBetweenPostsMin ?? minM));
          logEvent("RESUME", `Resuming campaign ${campaignId}`, { remaining: remaining.length });
          await runCampaignPostingLoop(campaign, remaining, mediaItems, tokens, minM, maxM);
        }
      }
    });
  }
  if (els.campaignEmptyState) {
    els.campaignEmptyState.classList.toggle("hidden", campaigns.length > 0);
  }
}

function renderProfileSummary() {
  const acct = activeAccount();
  const campaigns = accountCampaigns();
  const completed = campaigns.filter((c) => c.status === "completed").length;
  const failed = campaigns.filter((c) => c.status === "failed").length;
  const pending = campaigns.filter((c) => c.status === "pending" || c.status === "processing").length;
  const stopped = campaigns.filter((c) => c.status === "stopped").length;

  if (els.activeProfileTitle) {
    els.activeProfileTitle.textContent = `Campaigns - ${acct ? accountDisplayName(acct) : "No Profile"}`;
  }
  if (els.activeProfileSub) {
    els.activeProfileSub.textContent = acct
      ? `Actor ID: ${acct.actorId || "-"} | Groups synced: ${(acct.groups || []).length}`
      : "No profile selected";
  }
  if (els.statTotal) els.statTotal.textContent = String(campaigns.length);
  if (els.statCompleted) els.statCompleted.textContent = String(completed);
  if (els.statPending) els.statPending.textContent = String(pending);
  if (els.statFailed) els.statFailed.textContent = String(failed + stopped);
}

function campaignById(id) {
  return accountCampaigns().find((c) => c.id === id) || null;
}

function renderModal() {
  const c = campaignById(state.selectedCampaignId);
  if (!c) {
    els.modalContent.innerHTML = "<p>No campaign selected.</p>";
    return;
  }
  if (state.modalTab === "overview") {
    const scheduled = c.scheduledAt ? new Date(c.scheduledAt) : null;
    const postDate = scheduled ? scheduled.toLocaleDateString() : "-";
    const postTime = scheduled ? scheduled.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-";
    const repeatText = c.repeatEnabled ? `Every ${c.repeatDays || 1} day` : "Disabled";
    const minM = c.minIntervalMinutes ?? c.intervalBetweenPostsMin ?? 0;
    const maxM = c.maxIntervalMinutes ?? c.intervalBetweenPostsMin ?? minM;
    els.modalContent.innerHTML = `
      <div class="composerBox">
        <h2>Campaign Summary</h2>
        <p>ID: ${c.id}</p>
        <p>Post name: ${c.postName || c.title || "-"}</p>
        <p>Created: ${fmtDate(c.createdAt)}</p>
        <p>Status: <span class="tag ${statusClass(c.status)}">${c.status}</span></p>
        <p>Success: ${c.postedCount} | Failed: ${c.failedCount} | Pending: ${c.pendingCount}</p>
        <p>Success Rate: ${Math.round(c.successRate || 0)}%</p>
      </div>
      <div class="overviewGrid">
        <div class="composerBox">
          <h2>Description</h2>
          <p>${(c.description || "-").replace(/\n/g, "<br>")}</p>
        </div>
        <div class="composerBox">
          <h2>Schedule Details</h2>
          <p>Date: ${postDate}</p>
          <p>Time: ${postTime}</p>
          <p>Post Interval Range: ${minM} - ${maxM} minutes</p>
          <p>Repeat: ${repeatText}</p>
        </div>
      </div>
      <div class="composerBox">
        <h2>Posting Summary</h2>
        <p>This post will be published to ${c.groupCount || 0} groups.</p>
        <p>Posted: ${c.postedCount || 0} | Failed: ${c.failedCount || 0} | Pending: ${c.pendingCount || 0}</p>
      </div>
    `;
    return;
  }
  if (state.modalTab === "group_posts") {
    const rows = (c.groupResults || []).map((r) => `
        <tr>
          <td>${r.groupName}</td>
          <td><span class="tag ${statusClass(r.status)}">${r.status}</span></td>
          <td>${r.url ? `<a href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.url)}</a>` : "-"}</td>
        </tr>
      `).join("");
    els.modalContent.innerHTML = `
      <div class="tableWrap campaigns">
        <table>
          <thead><tr><th>Group</th><th>Status</th><th>URL</th></tr></thead>
          <tbody>${rows || "<tr><td colspan='3'>No post data available</td></tr>"}</tbody>
        </table>
      </div>
    `;
    return;
  }
  if (state.modalTab === "media") {
    const names = c.mediaNames || [];
    els.modalContent.innerHTML = `
      <div class="composerBox">
        <h2>Media</h2>
        <ul>${names.map((n) => `<li>${n}</li>`).join("") || "<li>No media</li>"}</ul>
      </div>
    `;
  }
}

function openModal(tab = "overview") {
  state.modalTab = tab;
  for (const b of document.querySelectorAll(".tab")) {
    b.classList.toggle("active", b.getAttribute("data-tab") === tab);
  }
  els.detailsModal.classList.remove("hidden");
  renderModal();
}

function closeModal() {
  els.detailsModal.classList.add("hidden");
}

async function checkLogin() {
  setStatus("Checking login...");
  try {
    const t = await getTokens();
    setStatus(`Logged in: ${t.actorId}`);
    log(`Login OK (actor: ${t.actorId})`);
    const acct = activeAccount();
    if (acct && acct.actorId !== t.actorId) {
      log(`Active profile actor (${acct.actorId || "-"}) differs from logged actor (${t.actorId}). Use "Save Current" or switch profile.`);
    }
  } catch (e) {
    setStatus("Not logged in");
    log(`Login failed: ${e.message}`);
  }
}

async function saveCurrentAccount() {
  try {
    const t = await getTokens();
    let acct = state.accounts.find((a) => a.actorId === t.actorId);
    if (!acct) {
      acct = { id: uid("acct"), label: `FB ${t.actorId}`, actorId: t.actorId, lastSync: "", groups: [], customLabel: false };
      state.accounts.push(acct);
      log(`Created account profile for actor ${t.actorId}`);
    } else {
      if (!acct.customLabel) {
        acct.label = `FB ${t.actorId}`;
      }
      log(`Updated existing profile for actor ${t.actorId}`);
    }
    state.activeAccountId = acct.id;
    await persistState();
    renderAll();
  } catch (e) {
    log(`Save account failed: ${e.message}`);
  }
}

async function ensureCurrentActorProfile() {
  try {
    const t = await getTokens();
    let acct = state.accounts.find((a) => a.actorId === t.actorId);
    if (!acct) {
      acct = {
        id: uid("acct"),
        label: `FB ${t.actorId}`,
        actorId: t.actorId,
        lastSync: "",
        groups: [],
        customLabel: false
      };
      state.accounts.push(acct);
      log(`Auto-linked current Facebook profile: ${acct.label}`);
    } else if (!acct.customLabel && acct.label !== `FB ${t.actorId}`) {
      acct.label = `FB ${t.actorId}`;
    }
    state.activeAccountId = acct.id;
    await persistState();
  } catch (_) {
    // User may not be logged in; keep local profiles as-is.
  }
}

async function fetchGroups() {
  setStatus("Syncing joined groups...");
  logEvent("SYNC", "Groups sync started");
  try {
    const tokens = await getTokens();
    const acct = activeAccount();
    if (!acct) throw new Error("No active account");
    if (acct.actorId && acct.actorId !== tokens.actorId) {
      throw new Error(`Current Facebook login (${tokens.actorId}) does not match active account (${acct.actorId})`);
    }
    acct.actorId = tokens.actorId;
    const maxPagesRaw = els.maxPages ? els.maxPages.value : "12";
    const maxPages = Math.max(1, parseInt(maxPagesRaw || "12", 10));
    const seen = new Set();
    const all = [];

    let res = await fbGraphql(tokens, "7740459739385247", "GroupsCometPinnedGroupsDialogQuery", { ordering: ["viewer_added"], scale: 1 });
    if (!res.ok || !res.data) throw new Error(`Groups fetch failed (HTTP ${res.status})`);
    let parsed = parseGroupsPayload(res.data);
    for (const g of parsed.groups) if (!seen.has(g.id)) { seen.add(g.id); all.push(g); }
    logEvent("SYNC", "Fetched initial groups", { total: all.length });
    let cursor = parsed.endCursor;
    let hasNext = parsed.hasNextPage;
    let page = 0;
    while (hasNext && cursor && page < maxPages) {
      page += 1;
      res = await fbGraphql(tokens, "7218669964900608", "GroupsCometUnpinnedGroupsPaginationListPaginatedQuery", {
        count: 10,
        cursor,
        ordering: ["viewer_added"],
        scale: 1
      });
      if (!res.ok || !res.data) throw new Error(`Groups pagination failed (HTTP ${res.status})`);
      parsed = parseGroupsPayload(res.data);
      for (const g of parsed.groups) if (!seen.has(g.id)) { seen.add(g.id); all.push(g); }
      cursor = parsed.endCursor;
      hasNext = parsed.hasNextPage;
      logEvent("SYNC", "Fetched groups page", { page, total: all.length });
      await sleep(700);
    }
    // Best-effort members enrichment from group pages (fallback when GraphQL doesn't return members text).
    logEvent("SYNC", "Enriching group members", { total: all.length });
    for (let i = 0; i < all.length; i += 1) {
      if (state.stopRequested) break;
      const g = all[i];
      if (!g.membersText) {
        const membersText = await fetchGroupMembersText(g.id);
        if (membersText) g.membersText = membersText;
      }
      g.membersCount = groupMembersCount(g);
      if ((i + 1) % 10 === 0 || i === all.length - 1) {
        setStatus(`Syncing joined groups... ${i + 1}/${all.length}`);
        logEvent("SYNC", "Enrichment progress", { done: i + 1, total: all.length });
      }
      await sleep(250);
    }
    acct.groups = all;
    acct.lastSync = nowIso();
    await persistState();
    renderAll();
    renderGroupsPage();
    renderPostTemplates();
    setStatus(`Groups synced: ${all.length}`);
    logEvent("SYNC", `Groups synced`, { count: all.length });
  } catch (e) {
    setStatus("Sync failed");
    logEvent("SYNC", "Groups sync failed", { error: e.message });
    log(`Fetch groups failed: ${e.message}`);
  }
}

async function uploadImage(tokens, file) {
  const url = new URL("https://upload.facebook.com/ajax/react_composer/attachments/photo/upload");
  const qs = baseForm(tokens, "22", "25549");
  for (const [k, v] of qs.entries()) url.searchParams.set(k, v);
  const fd = new FormData();
  fd.append("source", "8");
  fd.append("profile_id", tokens.actorId);
  fd.append("waterfallxapp", "comet");
  fd.append("upload_id", `upload_${Date.now()}`);
  fd.append("farr", file);
  const resp = await fetch(url.toString(), { method: "POST", credentials: "include", body: fd });
  const text = await resp.text();
  const data = parseFbJsonResponse(text);
  const photoId = data?.payload?.photoID;
  if (!photoId) throw new Error("No photoID in upload response");
  return String(photoId);
}

function buildRemainingGroupsForCampaign(acct, campaign) {
  const allIds = Array.isArray(campaign.groupIds) ? campaign.groupIds.map(String) : [];
  const doneIds = new Set((campaign.groupResults || []).map((r) => String(r.groupId || "")));
  const groupMap = new Map((acct?.groups || []).map((g) => [String(g.id), g]));
  const remaining = [];
  for (const gid of allIds) {
    if (doneIds.has(gid)) continue;
    const g = groupMap.get(gid);
    remaining.push({ id: gid, name: g?.name || gid });
  }
  return remaining;
}

async function runCampaignPostingLoop(campaign, groups, mediaItems, tokens, minIntervalMinutes, maxIntervalMinutes, plan) {
  state.stopRequested = false;
  state.runningCampaignId = campaign.id;
  renderAll();
  setStatus("Campaign running...");
  logEvent("START", `Campaign running`, { title: campaign.title, groups: groups.length });
  let mediaFiles = [];
  try {
    mediaFiles = await Promise.all((Array.isArray(mediaItems) ? mediaItems : []).map((m) => mediaItemToFile(m)));
  } catch (e) {
    campaign.status = "failed";
    await upsertAccountCampaign(campaign);
    state.runningCampaignId = "";
    renderAll();
    setStatus("Failed");
    logEvent("ERROR", "Media preparation failed", { post: campaign.postName, error: e.message || String(e) });
    return;
  }

  for (let i = 0; i < groups.length; i += 1) {
    if (state.stopRequested) break;
    const g = groups[i];
    let status = "completed";
    let url = "";
    const syncGroupName = g.name || g.id;
    try {
      if (plan && plan.events && plan.events[i]) {
        const scheduledAt = new Date(plan.events[i].at).getTime();
        const waitMs = Math.max(0, scheduledAt - Date.now());
        if (waitMs > 0) {
          logEvent("WAIT", `Waiting ${Math.round(waitMs / 1000)}s until scheduled time`, { post: campaign.postName, group: g.name || g.id });
          const ok = await sleepInterruptible(waitMs);
          if (!ok) break;
        }
      }
      const now = Date.now();
      if (state.lastPostActionAtMs > 0) {
        const elapsed = now - state.lastPostActionAtMs;
        if (elapsed < 23000) {
          const waitMs = 23000 - elapsed;
          logEvent("WAIT_GUARD", `Waiting ${Math.round(waitMs / 1000)}s before posting`);
          const ok = await sleepInterruptible(waitMs);
          if (!ok) break;
        }
      }
      state.lastPostActionAtMs = Date.now();
      startSyncMonitor(campaign.postName, syncGroupName, mediaFiles.length);
      setSyncPhase("text", { post: campaign.postName, group: syncGroupName });
      setSyncPhase("upload", { files: mediaFiles.length });
      const photoIds = await Promise.all(mediaFiles.map(async (file) => {
        const photoId = await uploadImage(tokens, file);
        incrementSyncUploadDone();
        return photoId;
      }));
      setSyncPhase("submit");
      url = await postToGroup(tokens, g.id, campaign.text || campaign.description || "", photoIds);
      finishSyncMonitor("posted");
      campaign.postedCount += 1;
      logEvent("POSTED", g.name, { url, post: campaign.postName });
      } catch (e) {
        finishSyncMonitor("failed", e.message || String(e));
        status = "failed";
        campaign.failedCount += 1;
        await recordFailedGroup(g.id, g.name, e.message);
        logEvent("FAILED", g.name, { error: e.message, post: campaign.postName });
      }
    campaign.pendingCount = Math.max(0, (campaign.groupCount || 0) - ((campaign.postedCount || 0) + (campaign.failedCount || 0)));
    campaign.successRate = campaign.groupCount ? (campaign.postedCount / campaign.groupCount) * 100 : 0;
    campaign.groupResults = Array.isArray(campaign.groupResults) ? campaign.groupResults : [];
    campaign.groupResults.push({ groupId: g.id, groupName: g.name, status, url, ts: nowIso() });
    await upsertAccountCampaign(campaign);
    renderCampaignTable();

    if (i < groups.length - 1 && !state.stopRequested && !plan) {
      const randMins = minIntervalMinutes + Math.random() * (maxIntervalMinutes - minIntervalMinutes);
      const waitMs = Math.max(1000, Math.round(randMins * 60 * 1000));
      logEvent("WAIT", `Waiting ${Math.round(waitMs / 1000)}s before next group`, { post: campaign.postName });
      const ok = await sleepInterruptible(waitMs);
      if (!ok) break;
    }
  }

  campaign.status = state.stopRequested ? "stopped" : (campaign.failedCount === 0 ? "completed" : "failed");
  state.runningCampaignId = "";
  await upsertAccountCampaign(campaign);
  renderAll();
  setStatus(state.stopRequested ? "Stopped" : "Completed");
  logEvent("END", `Campaign ${state.stopRequested ? "stopped" : "completed"}`);
}

async function postToGroup(tokens, groupId, text, photoIds) {
  const attachments = photoIds.map((id) => ({ photo: { id } }));
  const groupIdStr = String(groupId || "");
  if (!groupIdStr) throw new Error("Missing group id");
  const variables = {
    input: {
      composer_entry_point: attachments.length ? "publisher_bar_media" : "inline_composer",
      composer_source_surface: "group",
      composer_type: "group",
      logging: { composer_session_id: "" },
      source: "WWW",
      message: { ranges: [], text },
      with_tags_ids: null,
      inline_activities: [],
      text_format_preset_id: "0",
      attachments,
      navigation_data: { attribution_id_v2: "CometGroupDiscussionRoot.react,comet.group,via_cold_start,,,,," },
      tracking: [null],
      event_share_metadata: { surface: "newsfeed" },
      audience: { to_id: groupIdStr },
      actor_id: tokens.actorId,
      client_mutation_id: "1"
    },
    feedLocation: "GROUP",
    feedbackSource: 0,
    groupID: groupIdStr,
    scale: 1,
    renderLocation: "group",
    useDefaultActor: false,
    isGroup: true
  };
  const docId = attachments.length ? "9286110778162996" : "9469644099759635";
  const resp = await fbGraphql(tokens, docId, "ComposerStoryCreateMutation", variables);
  if (!resp.ok) throw new Error(`Post API HTTP ${resp.status}`);
  const data = resp.data || {};

  const created = data?.data?.story_create || {};
  const storyNode = created.story || {};

  if (storyNode.url) return String(storyNode.url);

  const legacyId = storyNode.legacy_story_hideable_id || created.post_id || storyNode.post_id;
  if (legacyId) return `https://www.facebook.com/groups/${groupId}/permalink/${legacyId}`;

  let story = created.story_id || storyNode.id || "";
  if (!story) {
    // Fallback used by SafePoster-style flow when story_create path is missing.
    const m1 = resp.rawText.match(/"story_id"\s*:\s*"([^"]+)"/);
    const m2 = resp.rawText.match(/"story"\s*:\s*\{\s*"id"\s*:\s*"([^"]+)"/);
    const mUrl = resp.rawText.match(/"url"\s*:\s*"([^"]*groups\\\/[^"]*permalink\\\/[^"]+)"/);
    if (mUrl && mUrl[1]) return mUrl[1].replace(/\\\//g, "/");
    story = (m1 && m1[1]) || (m2 && m2[1]) || "";
  }

  const gqlErrors = Array.isArray(data.errors) ? data.errors : [];
  if (gqlErrors.length > 0) {
    const unique = [...new Set(gqlErrors.map((x) => String(x?.message || "").trim()).filter(Boolean))];
    const msg = (unique.slice(0, 3).join(" | ") || "GraphQL error");
    throw new Error(msg);
  }
  if (!story) throw new Error("No story id returned");

  let numericPostId = "";
  try {
    const decoded = atob(story);
    const m = decoded.match(/(?:VK:|:)(\d+)$/);
    if (m) numericPostId = m[1];
  } catch (_) {
    // Ignore decode error and fallback below.
  }
  if (!numericPostId) {
    const mDirect = String(story).match(/(\d{6,})$/);
    if (mDirect) numericPostId = mDirect[1];
  }
  if (!numericPostId) throw new Error("Cannot parse post id");

  return `https://www.facebook.com/groups/${groupId}/permalink/${numericPostId}`;
}

async function startCampaign() {
  const active = accountCampaigns().some((c) => c.status === "processing");
  if (active || state.runningCampaignId || state.stopRequested) {
    log("Stop running campaigns before starting.");
    return;
  }
  const plan = getSavedPreviewPlan();
  if (!plan || !state.previewPlanId || plan.id !== state.previewPlanId) {
    log("Build Preview first to lock schedule.");
    return;
  }
  setView("results");
  setActiveMenu("results");
  await startCampaignWithPlan(plan);
}

async function stopCampaign() {
  state.stopRequested = true;
  setStatus("Stopping...");
  log("Stop requested");
  if (state.syncMonitor?.active) {
    finishSyncMonitor("stopped", "Stopped by user");
  }
  await stopAnyBackgroundCampaign();
  if (state.runningCampaignId) {
    const list = accountCampaigns();
    const idx = list.findIndex((c) => c.id === state.runningCampaignId);
    if (idx >= 0) {
      const c = list[idx];
      c.status = "stopped";
      c.pendingCount = Math.max(0, (c.groupCount || 0) - ((c.postedCount || 0) + (c.failedCount || 0)));
      await saveAccountCampaigns(list);
      renderAll();
      setStatus("Stopped");
      logEvent("END", "Campaign stopped");
    }
  }
}

function bindEvents() {
  els.btnCheckLogin.addEventListener("click", checkLogin);
  els.btnFetchGroups.addEventListener("click", fetchGroups);
  els.btnSaveAccount.addEventListener("click", saveCurrentAccount);
  els.btnStart.addEventListener("click", startCampaign);
  els.btnStop.addEventListener("click", stopCampaign);
  if (els.btnPreview) {
    els.btnPreview.addEventListener("click", previewSchedule);
  }
  if (els.btnGoLiveLogs) {
    els.btnGoLiveLogs.addEventListener("click", () => {
      setActiveMenu("results");
      setView("results");
      renderAll();
      setStatus("Campaign logs");
    });
  }
  if (els.btnClearResults) {
    els.btnClearResults.addEventListener("click", async () => {
      if (!confirm("Clear all campaign results for this profile?")) return;
      await saveAccountCampaigns([]);
      renderAll();
      log("Campaign results cleared.");
    });
  }
  if (els.btnSavePostTemplate) {
    els.btnSavePostTemplate.addEventListener("click", async () => {
      const name = (els.postName?.value || "").trim();
      const text = (els.postText?.value || "").trim();
      if (!name || !text) {
        log("Post name and text are required to save.");
        return;
      }
      const files = Array.from(els.imageFiles.files || []);
      let mediaItems = [];
      if (files.length > 0) {
        for (const f of files) {
          const dataUrl = await readFileAsDataUrl(f);
          const ref = await putMediaDataUrlToIndexedDb(dataUrl, f.name, f.type);
          mediaItems.push({ mediaId: ref.mediaId, name: ref.name, type: ref.type, size: f.size || 0 });
        }
      }
      const list = accountPostTemplates();
      const existing = state.editingPostId ? list.find((p) => p.id === state.editingPostId) : list.find((p) => p.name === name);
      if (existing) {
        existing.text = text;
        if (mediaItems.length) existing.mediaItems = mediaItems;
        existing.updatedAt = nowIso();
        if (state.editingPostId) {
          existing.name = name;
        }
      } else {
        list.unshift({
          id: uid("post"),
          name,
          text,
          mediaItems,
          createdAt: nowIso(),
          enabled: true,
          groupIds: [],
          minIntervalMinutes: 1,
          maxIntervalMinutes: 2,
          priority: "normal",
          repeatEnabled: false,
          repeatDays: 1
        });
      }
      await saveAccountPostTemplates(list);
      state.editingPostId = "";
      if (els.btnSavePostTemplate) els.btnSavePostTemplate.textContent = "Save Post";
      renderPostTemplates();
      log(`Saved post template: ${name}`);
    });
  }
  // Post selection handled via Saved Posts list.
  if (els.btnClearLogs) {
    els.btnClearLogs.addEventListener("click", () => {
      state.uiLogs = [];
      renderLogs();
    });
  }
  if (els.imageFiles) {
    els.imageFiles.addEventListener("change", () => {
      state.preloadedMediaItems = [];
      state.preloadedFromCampaignId = "";
      updateImageState();
    });
  }
  if (els.postName) {
    els.postName.addEventListener("input", () => {
      const name = (els.postName.value || "").trim();
      if (name) setBuilderStatus(`Post: ${name}`);
      else setBuilderStatus("Ready");
    });
  }
  if (els.intervalPreset) {
    els.intervalPreset.addEventListener("change", () => {
      const preset = els.intervalPreset.value;
      if (els.intervalHint) {
        if (preset === "default") els.intervalHint.textContent = "Default: uses each post’s min/max";
        if (preset === "normal") els.intervalHint.textContent = "Normal: 3-5 min";
        if (preset === "safe") els.intervalHint.textContent = "Safe: 5-8 min";
        if (preset === "super_safe") els.intervalHint.textContent = "Super Safe: 8-12 min";
      }
    });
  }
  if (els.btnSaveGroupList) {
    els.btnSaveGroupList.addEventListener("click", async () => {
      const name = (els.groupListName?.value || "").trim();
      if (!name) {
        log("Group list name is required.");
        return;
      }
      const selected = [...new Set(Array.from(document.querySelectorAll(".grpPageCheck:checked")).map((c) => c.value))];
      if (!selected.length) {
        log("Select at least one group to save the list.");
        return;
      }
      const lists = accountGroupLists();
      lists.unshift({ id: uid("glist"), name, groupIds: selected, createdAt: nowIso() });
      await saveAccountGroupLists(lists);
      if (els.groupListName) els.groupListName.value = "";
      renderGroupsPage();
      log(`Saved group list: ${name}`);
    });
  }
  if (els.btnRefreshGroupsPage) {
    els.btnRefreshGroupsPage.addEventListener("click", renderGroupsPage);
  }
  if (els.groupsSearch) {
    els.groupsSearch.addEventListener("input", renderGroupsPage);
  }
  if (els.groupsSortMode) {
    els.groupsSortMode.addEventListener("change", async () => {
      const mode = String(els.groupsSortMode.value || "default");
      state.groupsSortByAccount[state.activeAccountId] = mode;
      // Sorting and manual reorder are mutually exclusive in the UI.
      state.groupReorderModeByAccount[state.activeAccountId] = false;
      await persistState();
      renderGroupsPage();
      log(`Groups sort: ${mode}`);
    });
  }
  if (els.btnToggleGroupReorder) {
    els.btnToggleGroupReorder.addEventListener("click", () => {
      const next = !isGroupReorderMode();
      state.groupReorderModeByAccount[state.activeAccountId] = next;
      if (next) {
        const seed = state.currentRenderedGroupIdsByAccount[state.activeAccountId] || [];
        state.groupOrderDraftByAccount[state.activeAccountId] = seed.length
          ? [...seed]
          : (activeAccount()?.groups || []).map((g) => String(g.id || ""));
      }
      renderGroupsPage();
      log(next ? "Manual reorder enabled (drag group cards)." : "Manual reorder disabled.");
    });
  }
  if (els.btnSaveGroupOrder) {
    els.btnSaveGroupOrder.addEventListener("click", async () => {
      const acct = activeAccount();
      if (!acct) return;
      const draft = accountGroupOrderDraft();
      if (!draft.length) {
        log("No group order to save.");
        return;
      }
      acct.groups = applyOrderByIds(acct.groups || [], draft);
      state.groupReorderModeByAccount[state.activeAccountId] = false;
      await persistState();
      renderGroupsPage();
      log(`Saved group order (${acct.groups.length} groups).`);
    });
  }
  if (els.btnClearFailedGroups) {
    els.btnClearFailedGroups.addEventListener("click", async () => {
      if (!confirm("Clear failed groups list for this profile?")) return;
      await saveAccountFailedGroups([]);
      renderFailedGroupsPage();
      log("Failed groups cleared.");
    });
  }
  if (els.btnClearErrorLogs) {
    els.btnClearErrorLogs.addEventListener("click", async () => {
      if (!confirm("Clear maintenance error logs for this profile?")) return;
      await saveAccountErrorLogs([]);
      renderErrorMonitorPage();
      log("Error monitor cleared.");
    });
  }
  if (els.btnExportDevLogs) {
    els.btnExportDevLogs.addEventListener("click", async () => {
      const acct = activeAccount();
      const resp = await sendRuntimeMessage({
        type: "AUTO_RE_EXPORT_DEV_LOGS",
        payload: { accountId: acct?.id || "" }
      });
      if (resp?.ok) {
        log(`Developer logs export started: ${resp.filename || "file"}`);
      } else {
        log(`Developer logs export failed: ${resp?.error || "Unknown error"}`);
      }
    });
  }
  if (els.btnRefreshView) {
    els.btnRefreshView.addEventListener("click", () => {
      renderAll();
    });
  }

  els.accountSelect.addEventListener("change", async () => {
    state.activeAccountId = els.accountSelect.value;
    await persistState();
    renderAll();
  });

  if (els.btnBrandProfileSave) {
    els.btnBrandProfileSave.addEventListener("click", async () => {
      const name = (els.brandProfileInput?.value || "").trim();
      const acct = activeAccount();
      if (!acct) return;
      acct.label = name;
      acct.customLabel = !!name;
      await persistState();
      renderAll();
      log(name ? `Profile name updated: ${name}` : "Profile name cleared.");
    });
  }
  if (els.brandProfileInput) {
    els.brandProfileInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        els.btnBrandProfileSave?.click();
      }
    });
  }

  // Group selection handled per saved post in Show More.

  els.campaignSearch.addEventListener("input", renderCampaignTable);

  for (const chip of document.querySelectorAll(".chip")) {
    chip.addEventListener("click", () => {
      for (const c of document.querySelectorAll(".chip")) c.classList.remove("active");
      chip.classList.add("active");
      state.filter = chip.getAttribute("data-filter") || "all";
      renderCampaignTable();
    });
  }

  for (const menu of document.querySelectorAll(".menuItem")) {
    menu.addEventListener("click", () => {
      const view = menu.getAttribute("data-view") || "results";
      setActiveMenu(view);
      setView(view);
      renderAll();
      setStatus("Campaign logs");
      log(`Menu selected: ${menu.textContent.trim()}`);
    });
  }

  els.btnCloseModal.addEventListener("click", closeModal);
  els.detailsModal.addEventListener("click", (e) => {
    if (e.target === els.detailsModal) closeModal();
  });
  for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => openModal(tab.getAttribute("data-tab") || "overview"));
  }
}

function renderAll() {
  renderAccountSwitcher();
  renderProfileSummary();
  renderPostTemplates();
  renderCampaignTable();
  updateImageState();
  renderGroupsPage();
  renderFailedGroupsPage();
  renderErrorMonitorPage();
  updatePreviewActionState();
  updateSyncCountdown();
}

function renderErrorMonitorPage() {
  if (!els.errorLogsBody || !els.errorLogsEmpty) return;
  const list = [...accountErrorLogs()].sort((a, b) => new Date(b.ts || 0).getTime() - new Date(a.ts || 0).getTime());
  els.errorLogsBody.innerHTML = list.map((x) => `
    <tr>
      <td>${escapeHtml(fmtDate(x.ts || ""))}</td>
      <td>${escapeHtml(x.source || "-")}</td>
      <td>${escapeHtml(x.campaign || "-")}</td>
      <td>${escapeHtml(x.groupName || x.groupId || "-")}</td>
      <td>${escapeHtml(x.error || "-")}</td>
    </tr>
  `).join("");
  els.errorLogsEmpty.classList.toggle("hidden", list.length > 0);
}

function renderFailedGroupsPage() {
  if (!els.failedGroupsBody || !els.failedGroupsEmpty) return;
  let list = accountFailedGroups();
  const latestOutcome = latestGroupOutcomeFromCampaigns();
  const latestOutcomeFromLogs = parseGroupOutcomesFromLogs();
  for (const [k, v] of latestOutcomeFromLogs.entries()) {
    latestOutcome.set(k, v);
  }
  const merged = [];
  const seen = new Set();
  for (const item of list) {
    const key = String(item.groupId || item.groupName || "");
    if (!key || seen.has(key)) continue;
    const out = latestOutcome.get(key);
    if (out === "completed") continue;
    seen.add(key);
    merged.push(item);
  }
  for (const c of accountCampaigns()) {
    for (const r of c.groupResults || []) {
      if (r.status !== "failed") continue;
      const gid = String(r.groupId || "");
      const key = gid || String(r.groupName || "");
      if (!key || seen.has(key)) continue;
      const out = latestOutcome.get(key);
      if (out === "completed") continue;
      seen.add(key);
      merged.push({
        groupId: gid || key,
        groupName: String(r.groupName || key),
        groupUrl: gid ? `https://www.facebook.com/groups/${gid}` : "",
        error: "",
        createdAt: nowIso()
      });
    }
  }
  const fromLogs = parseFailedGroupsFromLogs();
  for (const r of fromLogs) {
    const key = String(r.groupId || r.groupName || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(r);
  }
  if (merged.length && merged.length !== list.length) {
    list = merged;
    saveAccountFailedGroups(merged);
  } else {
    list = merged;
  }
  els.failedGroupsBody.innerHTML = list.map((g) => `
    <tr>
      <td>${escapeHtml(g.groupId || "-")}</td>
      <td>${escapeHtml(g.groupName || "-")}</td>
      <td>${g.groupUrl ? `<a href="${escapeHtml(g.groupUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(g.groupUrl)}</a>` : "-"}</td>
      <td>${escapeHtml(g.error || "-")}</td>
      <td><button class="btn small danger failedGroupDelete" data-id="${escapeHtml(g.groupId || g.groupName || "")}">Delete</button></td>
    </tr>
  `).join("");
  els.failedGroupsEmpty.classList.toggle("hidden", list.length > 0);

  for (const btn of document.querySelectorAll(".failedGroupDelete")) {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id") || "";
      if (!id) return;
      await removeGroupEverywhere(id);
      const updated = accountFailedGroups().filter((x) => String(x.groupId || "") !== String(id) && String(x.groupName || "") !== String(id));
      await saveAccountFailedGroups(updated);
      renderFailedGroupsPage();
      renderPostTemplates();
      renderGroupsPage();
      log(`Removed failed group: ${id}`);
    });
  }
}

function parseFailedGroupsFromLogs() {
  const outcomes = parseGroupOutcomesFromLogs();
  const acct = activeAccount();
  const groupMap = new Map((acct?.groups || []).map((g) => [String(g.name || ""), g]));
  const out = [];
  const seen = new Set();
  for (const entry of state.uiLogs || []) {
    const raw = String(entry.msg || "");
    if (!raw.startsWith("[FAILED]")) continue;
    const msg = raw.replace(/^\[FAILED\]\s*/, "");
    const parts = msg.split(" | ");
    const groupName = (parts[0] || "").trim();
    if (!groupName) continue;
    const g = groupMap.get(groupName);
    const gid = g ? String(g.id) : "";
    const key = gid || groupName;
    if (seen.has(key)) continue;
    if (outcomes.get(key) === "completed") continue;
    seen.add(key);
    let error = "";
    if (parts.length > 1) {
      try {
        const meta = JSON.parse(parts.slice(1).join(" | "));
        error = meta?.error || "";
      } catch (_) {
        error = "";
      }
    }
    out.push({
      groupId: gid || groupName,
      groupName,
      groupUrl: gid ? `https://www.facebook.com/groups/${gid}` : "",
      error: String(error || ""),
      createdAt: nowIso()
    });
  }
  return out;
}

function parseGroupOutcomesFromLogs() {
  const acct = activeAccount();
  const groupMap = new Map((acct?.groups || []).map((g) => [String(g.name || ""), g]));
  const byKey = new Map();
  for (const entry of state.uiLogs || []) {
    const raw = String(entry.msg || "");
    const isFailed = raw.startsWith("[FAILED]");
    const isPosted = raw.startsWith("[POSTED]");
    if (!isFailed && !isPosted) continue;
    const msg = raw.replace(/^\[[A-Z_]+\]\s*/, "");
    const parts = msg.split(" | ");
    const groupName = (parts[0] || "").trim();
    if (!groupName) continue;
    const g = groupMap.get(groupName);
    const gid = g ? String(g.id) : "";
    const key = gid || groupName;
    byKey.set(key, isPosted ? "completed" : "failed");
  }
  return byKey;
}

function parseMembersCount(membersText) {
  const toAsciiDigits = (input) => String(input || "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const s = toAsciiDigits(membersText).replace(/[،]/g, ",").trim().toLowerCase();
  if (!s) return 0;
  const numberMatch = s.match(/(\d+(?:[.,]\d+)?)/);
  if (!numberMatch) return 0;
  let numStr = String(numberMatch[1] || "");
  if (numStr.includes(",") && !numStr.includes(".")) {
    numStr = numStr.replace(",", ".");
  } else {
    numStr = numStr.replace(/,/g, "");
  }
  const raw = Number(numStr);
  if (!Number.isFinite(raw)) return 0;

  let scale = 1;
  if (/\b(m|mn|mil|million)\b|مليون/.test(s)) scale = 1000000;
  else if (/\b(k|thousand)\b|الف|ألف/.test(s)) scale = 1000;

  return Math.round(raw * scale);
}

function groupMembersCount(g) {
  const stored = Number(g?.membersCount);
  if (Number.isFinite(stored) && stored > 0) return stored;
  return parseMembersCount(g?.membersText || "");
}

function applyGroupsSort(groups, sortMode, failedSet) {
  const list = [...groups];
  if (sortMode === "name_asc") return list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" }));
  if (sortMode === "name_desc") return list.sort((a, b) => String(b.name || "").localeCompare(String(a.name || ""), undefined, { sensitivity: "base" }));
  if (sortMode === "members_desc") return list.sort((a, b) => groupMembersCount(b) - groupMembersCount(a));
  if (sortMode === "privacy") return list.sort((a, b) => String(a.privacy || "").localeCompare(String(b.privacy || "")));
  if (sortMode === "issue_first") {
    return list.sort((a, b) => {
      const ai = failedSet.has(String(a.id || "")) ? 1 : 0;
      const bi = failedSet.has(String(b.id || "")) ? 1 : 0;
      if (ai !== bi) return bi - ai;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }
  return list;
}

function applyOrderByIds(groups, orderedIds) {
  const byId = new Map(groups.map((g) => [String(g.id), g]));
  const used = new Set();
  const out = [];
  for (const id of orderedIds) {
    const key = String(id || "");
    const g = byId.get(key);
    if (g) {
      out.push(g);
      used.add(key);
    }
  }
  for (const g of groups) {
    const key = String(g.id || "");
    if (!used.has(key)) out.push(g);
  }
  return out;
}

function getDisplayGroupsForActiveAccount() {
  const acct = activeAccount();
  let allGroups = acct?.groups || [];
  const failedSet = new Set(
    accountFailedGroups()
      .map((x) => String(x.groupId || "").trim())
      .filter(Boolean)
  );
  if (isGroupReorderMode()) {
    const draft = accountGroupOrderDraft();
    if (draft.length) allGroups = applyOrderByIds(allGroups, draft);
  } else {
    allGroups = applyGroupsSort(allGroups, accountGroupsSortMode(), failedSet);
  }
  return allGroups;
}

function latestGroupOutcomeFromCampaigns() {
  const map = new Map();
  const campaigns = [...accountCampaigns()].sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
  for (const c of campaigns) {
    for (const r of c.groupResults || []) {
      const gid = String(r.groupId || "");
      const key = gid || String(r.groupName || "");
      if (!key) continue;
      if (r.status === "completed") map.set(key, "completed");
      else if (r.status === "failed") map.set(key, "failed");
    }
  }
  return map;
}

function renderGroupsPage() {
  if (!els.groupLists) return;
  const scrollWrap = els.groupsCards || document.querySelector(".tableWrap.groups");
  const prevScrollTop = scrollWrap ? scrollWrap.scrollTop : 0;
  const acct = activeAccount();
  let allGroups = acct?.groups || [];
  const q = String(els.groupsSearch?.value || "").trim().toLowerCase();
  const failedSet = new Set(
    accountFailedGroups()
      .map((x) => String(x.groupId || "").trim())
      .filter(Boolean)
  );
  const sortMode = accountGroupsSortMode();
  const reorderMode = isGroupReorderMode();
  if (reorderMode && !accountGroupOrderDraft().length) {
    state.groupOrderDraftByAccount[state.activeAccountId] = allGroups.map((g) => String(g.id || ""));
  }
  allGroups = getDisplayGroupsForActiveAccount();
  const groups = q
    ? allGroups.filter((g) => String(g.name || "").toLowerCase().includes(q) || String(g.id || "").includes(q))
    : allGroups;
  state.currentRenderedGroupIdsByAccount[state.activeAccountId] = allGroups.map((g) => String(g.id || ""));
  if (els.groupsSortMode) els.groupsSortMode.value = sortMode;
  if (els.btnToggleGroupReorder) {
    els.btnToggleGroupReorder.textContent = `Reorder: ${reorderMode ? "On" : "Off"}`;
  }
  if (els.btnSaveGroupOrder) {
    els.btnSaveGroupOrder.disabled = !reorderMode;
  }
  const errCountByGroup = new Map();
  for (const e of accountErrorLogs()) {
    const gid = String(e.groupId || "").trim();
    if (!gid) continue;
    errCountByGroup.set(gid, (errCountByGroup.get(gid) || 0) + 1);
  }
  if (els.groupsPageBody) {
    els.groupsPageBody.innerHTML = groups.map((g) => `
        <tr>
          <td><input type="checkbox" class="grpPageCheck" value="${g.id}" /></td>
          <td>${g.name || "-"}</td>
          <td>${g.id}</td>
          <td>${g.privacy || "-"}</td>
        </tr>
      `).join("");
  }
  if (els.groupsCards) {
    els.groupsCards.innerHTML = groups.map((g) => `
      <div class="groupCard ${reorderMode ? "reorderMode" : ""}" ${reorderMode ? `draggable="true" data-group-id="${escapeHtml(g.id)}"` : ""}>
        <div class="groupCardTop">
          <label><input type="checkbox" class="grpPageCheck" value="${escapeHtml(g.id)}" /> Select</label>
          <div class="row" style="margin:0">
            ${failedSet.has(String(g.id || "")) || (errCountByGroup.get(String(g.id || "")) || 0) > 0
              ? `<span class="tag failed">Issue${(errCountByGroup.get(String(g.id || "")) || 0) > 0 ? ` x${errCountByGroup.get(String(g.id || ""))}` : ""}</span>`
              : ""}
            <span class="tag ${String(g.privacy || "").toLowerCase().includes("private") ? "failed" : "completed"}">${escapeHtml(g.privacy || "group")}</span>
          </div>
        </div>
        <div class="groupCardPhotoWrap">
          ${g.photoUrl
            ? `<img class="groupCardPhoto" src="${escapeHtml(g.photoUrl)}" alt="group" />`
            : `<div class="groupCardPhotoPlaceholder">${escapeHtml((g.name || "?").slice(0, 1).toUpperCase())}</div>`}
        </div>
        <div class="groupCardName">${escapeHtml(g.name || "-")}</div>
        <div class="groupCardMeta">ID: ${escapeHtml(g.id || "-")}</div>
        <div class="groupCardMeta">${escapeHtml(g.membersText || "Members: -")}</div>
        <div class="groupCardActions">
          <a class="btn small" href="${escapeHtml(g.url || `https://www.facebook.com/groups/${g.id}`)}" target="_blank" rel="noopener noreferrer">Open</a>
          <button class="btn small danger groupCardDelete" data-id="${escapeHtml(g.id)}">Delete</button>
        </div>
      </div>
    `).join("");
  }
  if (scrollWrap) scrollWrap.scrollTop = prevScrollTop;
  const lists = accountGroupLists();
  els.groupLists.innerHTML = lists.length ? lists.map((gl) => `
      <div class="groupListCard">
        <div class="groupListCardHeader">
          <div><strong>${gl.name}</strong> <span class="muted">(${gl.groupIds.length} groups)</span></div>
          <div>
          <button class="btn small groupListUse" data-id="${gl.id}">Select</button>
          <button class="btn small danger groupListDelete" data-id="${gl.id}">Delete</button>
        </div>
      </div>
    </div>
  `).join("") : `<div class="emptyState">No saved lists yet.</div>`;

  for (const btn of document.querySelectorAll(".groupListUse")) {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const gl = lists.find((x) => x.id === id);
      if (!gl) return;
      for (const ch of document.querySelectorAll(".grpPageCheck")) {
        ch.checked = gl.groupIds.includes(ch.value);
      }
    });
  }
  for (const btn of document.querySelectorAll(".groupListDelete")) {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const gl = lists.find((x) => x.id === id);
      if (!gl) return;
      if (!confirm(`Delete group list?\n${gl.name}`)) return;
      saveAccountGroupLists(lists.filter((x) => x.id !== id)).then(renderGroupsPage);
    });
  }
  for (const btn of document.querySelectorAll(".groupCardDelete")) {
    btn.addEventListener("click", async () => {
      const gid = btn.getAttribute("data-id") || "";
      if (!gid) return;
      if (!confirm(`Delete this group?\n${gid}`)) return;
      await removeGroupEverywhere(gid);
      renderGroupsPage();
      renderPostTemplates();
      log(`Group deleted: ${gid}`);
    });
  }
  if (reorderMode && els.groupsCards) {
    let dragId = "";
    for (const card of document.querySelectorAll(".groupCard.reorderMode")) {
      card.addEventListener("dragstart", (ev) => {
        dragId = card.getAttribute("data-group-id") || "";
        ev.dataTransfer?.setData("text/plain", dragId);
      });
      card.addEventListener("dragover", (ev) => {
        ev.preventDefault();
      });
      card.addEventListener("drop", (ev) => {
        ev.preventDefault();
        const targetId = card.getAttribute("data-group-id") || "";
        const sourceId = dragId || ev.dataTransfer?.getData("text/plain") || "";
        if (!sourceId || !targetId || sourceId === targetId) return;
        const order = [...(state.groupOrderDraftByAccount[state.activeAccountId] || allGroups.map((g) => String(g.id || "")))];
        const from = order.indexOf(String(sourceId));
        const to = order.indexOf(String(targetId));
        if (from < 0 || to < 0) return;
        const [moved] = order.splice(from, 1);
        order.splice(to, 0, moved);
        state.groupOrderDraftByAccount[state.activeAccountId] = order;
        renderGroupsPage();
      });
    }
  }
}

async function removeGroupEverywhere(groupId) {
  const gid = String(groupId || "");
  if (!gid) return;
  const acct = activeAccount();
  if (acct) {
    acct.groups = (acct.groups || []).filter((g) => String(g.id) !== gid);
  }
  const posts = accountPostTemplates().map((p) => ({
    ...p,
    groupIds: (p.groupIds || []).filter((id) => String(id) !== gid)
  }));
  await saveAccountPostTemplates(posts);
  await persistState();
}

async function recordFailedGroup(groupId, groupName, error) {
  const gid = String(groupId || "").trim();
  const gname = String(groupName || "").trim();
  const key = gid || gname;
  if (!key) return;
  const list = accountFailedGroups();
  const existing = list.find((g) => String(g.groupId) === key);
  if (existing) {
    existing.error = error || existing.error || "";
    existing.updatedAt = nowIso();
  } else {
    list.unshift({
      groupId: key,
      groupName: gname || key,
      groupUrl: gid ? `https://www.facebook.com/groups/${gid}` : "",
      error: String(error || ""),
      createdAt: nowIso()
    });
  }
  await saveAccountFailedGroups(list.slice(0, 300));
}

async function recordErrorLog(entry) {
  const list = accountErrorLogs();
  list.unshift({
    ts: nowIso(),
    source: String(entry?.source || "ui"),
    campaign: String(entry?.campaign || ""),
    groupId: String(entry?.groupId || ""),
    groupName: String(entry?.groupName || ""),
    error: String(entry?.error || "Unknown error")
  });
  await saveAccountErrorLogs(list.slice(0, 300));
}

async function clearFailedGroup(groupId, groupName = "") {
  const gid = String(groupId || "").trim();
  const gname = String(groupName || "").trim();
  const key = gid || gname;
  if (!key) return;
  const current = accountFailedGroups();
  const next = current.filter((g) => String(g.groupId || "") !== key && String(g.groupName || "") !== gname);
  if (next.length !== current.length) {
    await saveAccountFailedGroups(next);
  }
}

async function bootstrap() {
  bindEvents();
  await loadState();
  await migrateTemplateMediaToIndexedDb();
  await compactIndexedDbMediaGarbage();
  await persistState();
  // Clear any stale preview plans on startup to force a new preview.
  state.previewPlansByAccount = {};
  await persistState();
  // Do not auto-stop background posting on popup open/reload.
  await markStaleProcessingCampaignsStopped();
  await ensureCurrentActorProfile();
  const n = new Date();
  const d = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  const t = `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
  if (els.scheduleDate && !els.scheduleDate.value) els.scheduleDate.value = d;
  if (els.scheduleTime && !els.scheduleTime.value) els.scheduleTime.value = t;
  renderAll();
  renderLogs();
  updateImageState();
  setView("results");
  setActiveMenu("results");
  window.addEventListener("error", (ev) => {
    const msg = ev?.error?.message || ev?.message || "Unhandled window error";
    recordErrorLog({ source: "window", error: msg });
  });
  window.addEventListener("unhandledrejection", (ev) => {
    const reason = ev?.reason;
    const msg = typeof reason === "string"
      ? reason
      : (reason?.message || JSON.stringify(reason || {}));
    recordErrorLog({ source: "promise", error: msg || "Unhandled promise rejection" });
  });
  window.addEventListener("beforeunload", () => {
    state.stopRequested = true;
  });
  setInterval(() => {
    updateCountdown();
    updateSyncCountdown();
  }, 1000);
  setInterval(async () => {
    await refreshRuntimeStateFromStorage();
    renderAll();
  }, 3000);
  setStatus("Ready");
  log("Auto dashboard loaded");
}

bootstrap().catch((e) => {
  setStatus("Init error");
  log(`Init failed: ${e.message}`);
});
