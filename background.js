const STORAGE_KEYS = {
  campaignsByAccount: "auto_re_campaigns_by_account",
  runningCampaign: "auto_re_running_campaign",
  installedAt: "auto_re_installed_at",
  bgLogs: "auto_re_bg_logs",
  failedGroupsByAccount: "auto_re_failed_groups_by_account",
  errorLogsByAccount: "auto_re_error_logs_by_account"
};

const STEP_ALARM = "auto_re_campaign_step";
const DEV_NATIVE_HOST = "com.auto_re.logger";
let nativeLoggerBackoffUntil = 0;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ [STORAGE_KEYS.installedAt]: new Date().toISOString() });
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("ui/popup.html") });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== STEP_ALARM) return;
  await processCampaignStep();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "AUTO_RE_START_CAMPAIGN") {
      const result = await startCampaignInBackground(msg.payload || {});
      sendResponse(result);
      return;
    }
    if (msg?.type === "AUTO_RE_STOP_CAMPAIGN") {
      const result = await stopRunningCampaign(msg.payload || {});
      sendResponse(result);
      return;
    }
    if (msg?.type === "AUTO_RE_EXPORT_DEV_LOGS") {
      const result = await exportDeveloperLogs(msg.payload || {});
      sendResponse(result);
      return;
    }
    sendResponse({ ok: false, error: "Unknown message type" });
  })().catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
  return true;
});

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function setStorage(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}

function downloadViaApi(options) {
  return new Promise((resolve, reject) => {
    try {
      chrome.downloads.download(options, (downloadId) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || "Download failed"));
          return;
        }
        resolve(downloadId);
      });
    } catch (e) {
      reject(e);
    }
  });
}

function nativeSend(hostName, payload) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendNativeMessage(hostName, payload, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || "Native messaging failed"));
          return;
        }
        resolve(response || {});
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function sendDevLogToNative(entry) {
  if (Date.now() < nativeLoggerBackoffUntil) return;
  try {
    await nativeSend(DEV_NATIVE_HOST, {
      type: "log",
      source: "auto_re_extension",
      entry
    });
  } catch (e) {
    nativeLoggerBackoffUntil = Date.now() + 60 * 1000;
    console.warn("Native dev logger unavailable:", e.message || String(e));
  }
}

async function recordFailedGroup(accountId, groupId, groupName, error) {
  const gid = String(groupId || "");
  if (!gid || !accountId) return;
  const data = await getStorage([STORAGE_KEYS.failedGroupsByAccount]);
  const map = data[STORAGE_KEYS.failedGroupsByAccount] || {};
  const list = Array.isArray(map[accountId]) ? map[accountId] : [];
  const existing = list.find((g) => String(g.groupId) === gid);
  if (existing) {
    existing.error = error || existing.error || "";
    existing.updatedAt = new Date().toISOString();
  } else {
    list.unshift({
      groupId: gid,
      groupName: String(groupName || gid),
      groupUrl: `https://www.facebook.com/groups/${gid}`,
      error: String(error || ""),
      createdAt: new Date().toISOString()
    });
  }
  map[accountId] = list.slice(0, 300);
  await setStorage({ [STORAGE_KEYS.failedGroupsByAccount]: map });
}

async function recordErrorLog(accountId, entry) {
  if (!accountId) return;
  const data = await getStorage([STORAGE_KEYS.errorLogsByAccount]);
  const map = data[STORAGE_KEYS.errorLogsByAccount] || {};
  const list = Array.isArray(map[accountId]) ? map[accountId] : [];
  list.unshift({
    ts: new Date().toISOString(),
    source: String(entry?.source || "background"),
    campaign: String(entry?.campaign || ""),
    groupId: String(entry?.groupId || ""),
    groupName: String(entry?.groupName || ""),
    error: String(entry?.error || "Unknown error")
  });
  map[accountId] = list.slice(0, 300);
  await setStorage({ [STORAGE_KEYS.errorLogsByAccount]: map });
}

async function bgLog(message) {
  const entry = { ts: new Date().toISOString(), msg: String(message || "") };
  const data = await getStorage([STORAGE_KEYS.bgLogs]);
  const logs = Array.isArray(data[STORAGE_KEYS.bgLogs]) ? data[STORAGE_KEYS.bgLogs] : [];
  logs.push(entry);
  const trimmed = logs.slice(-500);
  await setStorage({ [STORAGE_KEYS.bgLogs]: trimmed });
  await sendDevLogToNative(entry);
}

function compactIsoForFilename(iso) {
  return String(iso || "")
    .replace(/[:]/g, "-")
    .replace(/\.\d+Z?$/, "")
    .replace(/[T]/g, "_");
}

async function exportDeveloperLogs(payload) {
  try {
    const accountId = String(payload?.accountId || "").trim();
    const data = await getStorage([
      STORAGE_KEYS.bgLogs,
      STORAGE_KEYS.campaignsByAccount,
      STORAGE_KEYS.failedGroupsByAccount,
      STORAGE_KEYS.errorLogsByAccount,
      STORAGE_KEYS.runningCampaign
    ]);
    const campaignsMap = data[STORAGE_KEYS.campaignsByAccount] || {};
    const failedMap = data[STORAGE_KEYS.failedGroupsByAccount] || {};
    const errorMap = data[STORAGE_KEYS.errorLogsByAccount] || {};
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      accountId: accountId || "all",
      runningCampaign: data[STORAGE_KEYS.runningCampaign] || null,
      bgLogs: Array.isArray(data[STORAGE_KEYS.bgLogs]) ? data[STORAGE_KEYS.bgLogs] : [],
      campaigns: accountId ? (campaignsMap[accountId] || []) : campaignsMap,
      failedGroups: accountId ? (failedMap[accountId] || []) : failedMap,
      errorLogs: accountId ? (errorMap[accountId] || []) : errorMap
    };
    const json = JSON.stringify(exportPayload, null, 2);
    const filename = `auto_re_dev_logs_${accountId || "all"}_${compactIsoForFilename(exportPayload.exportedAt)}.json`;
    const url = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
    const downloadId = await downloadViaApi({
      url,
      filename,
      saveAs: true
    });
    await bgLog(`Developer logs exported (${filename}).`);
    return { ok: true, downloadId, filename };
  } catch (e) {
    await bgLog(`Developer logs export failed: ${e.message || String(e)}`);
    return { ok: false, error: e.message || String(e) };
  }
}

function extractRegex(html, pattern) {
  const m = html.match(pattern);
  return m ? m[1] : "";
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
  return r.json();
}

async function uploadImageFromDataUrl(tokens, media) {
  const url = new URL("https://upload.facebook.com/ajax/react_composer/attachments/photo/upload");
  const qs = baseForm(tokens, "22", "25549");
  for (const [k, v] of qs.entries()) url.searchParams.set(k, v);

  const blob = await (await fetch(media.dataUrl)).blob();
  const file = new File([blob], media.name || `img_${Date.now()}.jpg`, {
    type: media.type || blob.type || "image/jpeg"
  });

  const fd = new FormData();
  fd.append("source", "8");
  fd.append("profile_id", tokens.actorId);
  fd.append("waterfallxapp", "comet");
  fd.append("upload_id", `upload_${Date.now()}`);
  fd.append("farr", file);
  const resp = await fetch(url.toString(), { method: "POST", credentials: "include", body: fd });
  const text = await resp.text();
  const cleaned = text.replace(/^for\s*\(;;\);\s*/, "");
  const data = JSON.parse(cleaned);
  const photoId = data?.payload?.photoID;
  if (!photoId) throw new Error("No photoID in upload response");
  return String(photoId);
}

async function postToGroup(tokens, groupId, text, photoIds) {
  const attachments = photoIds.map((id) => ({ photo: { id } }));
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
      audience: { to_id: groupId },
      actor_id: tokens.actorId,
      client_mutation_id: "1"
    },
    feedLocation: "GROUP",
    feedbackSource: 0,
    groupID: null,
    scale: 1,
    renderLocation: "group",
    useDefaultActor: false,
    isGroup: true
  };
  const docId = attachments.length ? "9286110778162996" : "9469644099759635";
  const data = await fbGraphql(tokens, docId, "ComposerStoryCreateMutation", variables);
  const created = data?.data?.story_create || {};
  const storyNode = created.story || {};

  if (storyNode.url) return String(storyNode.url);

  const legacyId = storyNode.legacy_story_hideable_id || created.post_id || storyNode.post_id;
  if (legacyId) return `https://www.facebook.com/groups/${groupId}/permalink/${legacyId}`;

  let story = created.story_id || storyNode.id || "";
  if (!story) throw new Error("No story id returned");

  let numericPostId = "";
  try {
    const decoded = atob(story);
    const m = decoded.match(/(?:VK:|:)(\d+)$/);
    if (m) numericPostId = m[1];
  } catch (_) {
    // Ignore decode error and try direct parse below.
  }
  if (!numericPostId) {
    const mDirect = String(story).match(/(\d{6,})$/);
    if (mDirect) numericPostId = mDirect[1];
  }
  if (!numericPostId) throw new Error("Cannot parse post id");
  return `https://www.facebook.com/groups/${groupId}/permalink/${numericPostId}`;
}

function randomDelayMs(minMinutes, maxMinutes) {
  const min = Math.max(0, Number(minMinutes) || 0);
  const max = Math.max(min, Number(maxMinutes) || min);
  const randMin = min + Math.random() * (max - min);
  return Math.max(1000, Math.round(randMin * 60 * 1000));
}

async function getCampaignsMap() {
  const data = await getStorage([STORAGE_KEYS.campaignsByAccount]);
  return data[STORAGE_KEYS.campaignsByAccount] || {};
}

async function setCampaignsMap(map) {
  await setStorage({ [STORAGE_KEYS.campaignsByAccount]: map });
}

async function getRunningCampaign() {
  const data = await getStorage([STORAGE_KEYS.runningCampaign]);
  return data[STORAGE_KEYS.runningCampaign] || null;
}

async function setRunningCampaign(running) {
  await setStorage({ [STORAGE_KEYS.runningCampaign]: running });
}

async function updateCampaign(accountId, campaignId, updater) {
  const map = await getCampaignsMap();
  const list = Array.isArray(map[accountId]) ? map[accountId] : [];
  const idx = list.findIndex((x) => x.id === campaignId);
  if (idx < 0) return null;
  const next = updater({ ...list[idx] });
  list[idx] = next;
  map[accountId] = list;
  await setCampaignsMap(map);
  return next;
}

async function finalizeCampaign(accountId, campaignId, stopped = false) {
  await updateCampaign(accountId, campaignId, (c) => {
    if (stopped) {
      c.status = "stopped";
    } else {
      c.status = c.failedCount === 0 ? "completed" : "failed";
    }
    return c;
  });
  if (stopped) await bgLog("Campaign finalized with status: stopped.");
  await chrome.alarms.clear(STEP_ALARM);
  await setRunningCampaign(null);
}

async function startCampaignInBackground(payload) {
  const existing = await getRunningCampaign();
  if (existing && !existing.stopped) {
    await bgLog("Start blocked: another campaign is already running.");
    return { ok: false, error: "Another campaign is already running in background." };
  }
  const groupItems = Array.isArray(payload.groupItems) ? payload.groupItems : [];
  if (!payload.accountId || !payload.campaignId || !groupItems.length) {
    return { ok: false, error: "Invalid campaign payload." };
  }
  const running = {
    accountId: payload.accountId,
    campaignId: payload.campaignId,
    text: payload.text || "",
    mediaItems: Array.isArray(payload.mediaItems) ? payload.mediaItems : [],
    groupItems,
    nextIndex: 0,
    minIntervalMinutes: Number(payload.minIntervalMinutes) || 1,
    maxIntervalMinutes: Number(payload.maxIntervalMinutes) || 1,
    expectedActorId: payload.expectedActorId || "",
    stopped: false,
    startedAt: new Date().toISOString()
  };
  await setRunningCampaign(running);
  await chrome.alarms.clear(STEP_ALARM);
  chrome.alarms.create(STEP_ALARM, { when: Date.now() + 1000 });
  await bgLog(`Campaign started in background (campaign=${payload.campaignId}, groups=${groupItems.length}).`);
  return { ok: true };
}

async function stopRunningCampaign(payload) {
  const running = await getRunningCampaign();
  if (!running) return { ok: true };
  if (payload?.campaignId && payload.campaignId !== running.campaignId) {
    return { ok: false, error: "This campaign is not currently running." };
  }
  if (payload?.accountId && payload.accountId !== running.accountId) {
    return { ok: false, error: "Running campaign belongs to another profile." };
  }
  running.stopped = true;
  await setRunningCampaign(running);
  await bgLog("Stop requested by user.");
  return { ok: true };
}

async function processCampaignStep() {
  const running = await getRunningCampaign();
  if (!running) return;

  if (running.stopped) {
    await bgLog("Campaign stopped before next step.");
    await finalizeCampaign(running.accountId, running.campaignId, true);
    return;
  }

  const current = running.groupItems[running.nextIndex];
  if (!current) {
    await bgLog("Campaign finished: all groups processed.");
    await finalizeCampaign(running.accountId, running.campaignId, false);
    return;
  }
  await bgLog(`Posting to group ${running.nextIndex + 1}/${running.groupItems.length}: ${current.name || current.id}`);

  let status = "completed";
  let url = "";
  let err = "";

  try {
    const tokens = await getTokens();
    if (running.expectedActorId && tokens.actorId !== running.expectedActorId) {
      throw new Error(`Logged actor changed: ${tokens.actorId}`);
    }
    const photoIds = await Promise.all((running.mediaItems || []).map((media) => uploadImageFromDataUrl(tokens, media)));
    url = await postToGroup(tokens, current.id, running.text, photoIds);
  } catch (e) {
    status = "failed";
    err = e.message || String(e);
    await recordFailedGroup(running.accountId, current.id, current.name || current.id, err);
    await recordErrorLog(running.accountId, {
      source: "background",
      campaign: running.campaignId,
      groupId: current.id,
      groupName: current.name || current.id,
      error: err
    });
  }
  if (status === "completed") await bgLog(`SUCCESS: ${current.name || current.id}`);
  else await bgLog(`FAILED: ${current.name || current.id} | ${err}`);

  await updateCampaign(running.accountId, running.campaignId, (c) => {
    if (status === "completed") c.postedCount = (c.postedCount || 0) + 1;
    else c.failedCount = (c.failedCount || 0) + 1;
    c.pendingCount = Math.max(0, (c.groupCount || 0) - ((c.postedCount || 0) + (c.failedCount || 0)));
    c.successRate = c.groupCount ? (c.postedCount / c.groupCount) * 100 : 0;
    c.groupResults = Array.isArray(c.groupResults) ? c.groupResults : [];
    c.groupResults.push({
      groupId: current.id,
      groupName: current.name || current.id,
      status,
      url: status === "completed" ? url : (err || "-"),
      ts: new Date().toISOString()
    });
    c.status = "processing";
    return c;
  });

  running.nextIndex += 1;
  if (running.nextIndex >= running.groupItems.length) {
    await bgLog("Campaign finalized after last group.");
    await finalizeCampaign(running.accountId, running.campaignId, false);
    return;
  }

  const waitMs = randomDelayMs(running.minIntervalMinutes, running.maxIntervalMinutes);
  await bgLog(`Waiting ${Math.round(waitMs / 1000)}s before next group.`);
  await setRunningCampaign(running);
  await chrome.alarms.clear(STEP_ALARM);
  chrome.alarms.create(STEP_ALARM, { when: Date.now() + waitMs });
}
