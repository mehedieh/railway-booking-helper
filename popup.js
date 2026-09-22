// popup.js - saves your details and drives the two Stage 1 buttons.
// Nothing here is sent anywhere. Details stay in chrome.storage.local on this computer.
// Passwords are never asked for and never stored.

const S = window.RS;
const { formatDate } = window.RSU;

// The class values are copied from the site's own dropdown.
const CLASSES = ["AC_B", "AC_S", "SNIGDHA", "F_BERTH", "F_SEAT", "F_CHAIR",
                 "S_CHAIR", "SHOVAN", "SHULOV", "AC_CHAIR"];

const TEXT_FIELDS = ["from", "to", "date", "train1", "train2", "train3", "class1", "class2",
                     "seats", "seatPref", "seatNumbers", "fallback", "startMode", "startTime",
                     "retryEvery", "maxTries", "speed"];

const DEFAULTS = {
  from: "", to: "", date: "", train1: "", train2: "", train3: "",
  class1: "", class2: "", seats: "1", seatPref: "any", seatNumbers: "",
  fallback: "any", startMode: "now", startTime: "08:00",
  retryEvery: "5", maxTries: "50", speed: "fast", dryRun: false
};

const $ = (id) => document.getElementById(id);

function fillClassOptions() {
  for (const id of ["class1", "class2"]) {
    const sel = $(id);
    sel.innerHTML = `<option value="">${id === "class1" ? "Choose..." : "None"}</option>` +
      CLASSES.map((c) => `<option value="${c}">${c}</option>`).join("");
  }
}

// Seat count is a row of four round buttons that write into the hidden #seats field.
function buildSeatDots() {
  const wrap = $("seatDots");
  for (const n of [1, 2, 3, 4]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = String(n);
    btn.addEventListener("click", () => {
      $("seats").value = String(n);
      syncSeatDots();
      save();
    });
    wrap.appendChild(btn);
  }
}

function syncSeatDots() {
  const current = $("seats").value || "1";
  [...$("seatDots").children].forEach((btn) =>
    btn.setAttribute("aria-pressed", String(btn.textContent === current)));
}

function readForm() {
  const b = {};
  for (const id of TEXT_FIELDS) b[id] = $(id).value.trim();
  b.dryRun = $("dryRun").checked;
  return b;
}

function writeForm(b) {
  for (const id of TEXT_FIELDS) $(id).value = b[id] ?? "";
  $("dryRun").checked = !!b.dryRun;
  syncSeatDots();
}

let savedTimer;
async function save() {
  await chrome.storage.local.set({ booking: readForm() });
  $("saved").textContent = "Saved";
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => ($("saved").textContent = ""), 1200);
}

function say(text) { $("msg").textContent = text; }

// Button 1: open the search page using the values in the address bar.
function openSearchPage() {
  const b = readForm();
  const missing = ["from", "to", "date", "class1"].filter((k) => !b[k]);
  if (missing.length) { say("Please fill in: " + missing.join(", ")); return; }
  const params = new URLSearchParams({
    fromcity: b.from,
    tocity: b.to,
    doj: formatDate(b.date, S.dateFormatInUrl),
    class: b.class1
  });
  chrome.tabs.create({ url: `${S.searchUrlBase}?${params.toString()}` });
  say("Opened the search page in a new tab. This does not press Search for you.");
}

// Button 2: ask the page script to fill the form on the current tab.
async function fillFormOnPage() {
  const b = readForm();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.startsWith(S.origin + "/")) {
    say("Switch to the Bangladesh Railway e-ticket tab first, then click this again.");
    return;
  }
  say("Filling the form...");
  try {
    const reply = await chrome.tabs.sendMessage(tab.id, { type: "FILL_SEARCH_FORM", booking: b });
    say(reply.results.map((r) => `${r.ok ? "OK   " : "CHECK"} ${r.field}: ${r.note}`).join("\n") +
        "\n\nI did not press Search. Please check the values, then press it yourself.");
  } catch (e) {
    say("Could not reach the page. Refresh the railway tab (F5) and try again. " +
        "Tabs that were open before you installed the extension need a refresh.");
  }
}

async function activeRailwayTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.startsWith(S.origin + "/")) return null;
  return tab;
}

// Button 3: start the booking run on the current railway tab.
async function startRun() {
  const b = readForm();
  const missing = ["train1", "class1"].filter((k) => !b[k]);
  if (missing.length) { say("Please fill in: " + missing.join(", ")); return; }
  const tab = await activeRailwayTab();
  if (!tab) { say("Switch to the railway train list tab first (use 'Open search page'), then press Start."); return; }
  try {
    const reply = await chrome.tabs.sendMessage(tab.id, { type: "START_RUN", booking: b });
    if (reply && reply.ok === false) { say(reply.note || "Could not start."); return; }
    const mode = b.dryRun
      ? "DRY-RUN. Watch the status box on the page. I will stop before CONTINUE PURCHASE."
      : "LIVE. I will press CONTINUE PURCHASE without asking and stop at the OTP window.";
    say(b.startMode === "scheduled"
      ? `Scheduled for ${b.startTime || "the time you set"}, then ${mode}`
      : `Started now, ${mode}`);
  } catch (e) {
    say("Could not reach the page. Refresh the railway tab (F5) and try again.");
  }
}

async function stopRun() {
  const tab = await activeRailwayTab();
  if (!tab) { say("Switch to the railway tab first."); return; }
  try { await chrome.tabs.sendMessage(tab.id, { type: "STOP_RUN" }); say("Stop sent."); }
  catch (e) { say("Could not reach the page. Refresh the railway tab (F5)."); }
}

document.addEventListener("DOMContentLoaded", async () => {
  fillClassOptions();
  buildSeatDots();
  const stored = await chrome.storage.local.get("booking");
  writeForm({ ...DEFAULTS, ...(stored.booking || {}) });
  document.querySelectorAll("input, select").forEach((el) => {
    el.addEventListener("change", save);
    el.addEventListener("input", save);
  });
  $("startBtn").addEventListener("click", startRun);
  $("stopBtn").addEventListener("click", stopRun);
  $("openBtn").addEventListener("click", openSearchPage);
  $("fillBtn").addEventListener("click", fillFormOnPage);
});
