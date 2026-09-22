// overlay.js - the small status box on the railway page, plus the alert
// (sound + notification + tab title). Nothing OS inspired, drawn inside a
// shadow root so the railway site's own CSS cannot break it.

window.RSOverlay = (() => {
  let host = null, root = null;
  const handlers = { stop: null, resume: null };
  const MARK = { info: "\u00b7", ok: "\u2713", warn: "!", error: "\u00d7" };
  const $ = (id) => root.getElementById(id);

  const CSS = `
    :host { all: initial; }
    .box {
      position: fixed; right: 16px; bottom: 16px; width: 300px; z-index: 2147483647;
      background-color: #000; color: #f4f4f1;
      background-image: radial-gradient(#262626 1px, transparent 1.3px); background-size: 12px 12px;
      border: 1px solid #f4f4f1; border-radius: 22px; padding: 14px 16px 16px;
      font: 12px/1.45 ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace;
      box-shadow: 0 6px 30px rgba(0,0,0,.45);
    }
    .head { display: flex; align-items: center; gap: 8px; }
    .led { width: 8px; height: 8px; border-radius: 50%; background: #d71921; flex: none; }
    .brand { font-weight: 800; letter-spacing: .16em; font-size: 11px; }
    .mode { margin-left: auto; font-size: 10px; letter-spacing: .14em; color: #8b8b85; }
    .mode.live { color: #d71921; }
    .x { all: unset; cursor: pointer; width: 20px; height: 20px; text-align: center; border: 1px solid #f4f4f1; border-radius: 50%; line-height: 18px; }
    .body { margin-top: 10px; }
    .min .body { display: none; }
    .kv { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; border-bottom: 1px dotted #55554f; }
    .kv span, .timer span { color: #8b8b85; letter-spacing: .14em; font-size: 10px; }
    .kv b { font-weight: 700; letter-spacing: .06em; text-align: right; }
    .timer { display: none; justify-content: space-between; align-items: baseline; gap: 10px; margin-top: 8px; padding: 8px 12px; border: 1px solid #d71921; border-radius: 999px; }
    .timer b { color: #d71921; font-size: 14px; letter-spacing: .06em; }
    .log { margin-top: 10px; max-height: 120px; overflow: auto; }
    .log div { padding: 1px 0; word-break: break-word; }
    .log .warn { color: #ffb020; } .log .error { color: #d71921; } .log .ok { color: #7ee2a8; }
    .btns { display: flex; gap: 8px; margin-top: 12px; }
    button.b { all: unset; box-sizing: border-box; flex: 1; text-align: center; cursor: pointer; padding: 8px 10px;
      border: 1px solid #f4f4f1; border-radius: 999px; font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
    button.b:hover { border-color: #d71921; }
    button.go { background: #d71921; border-color: #d71921; color: #fff; display: none; }
  `;

  function ensure() {
    if (host && host.isConnected) return;
    host = document.createElement("div");
    host.id = "bdrail-helper-overlay";
    root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${CSS}</style>
      <div class="box" id="box">
        <div class="head"><span class="led"></span><span class="brand">BD RAIL</span>
          <span class="mode" id="mode"></span><button class="x" id="min" title="Minimise">-</button></div>
        <div class="body">
          <div class="kv"><span>STEP</span><b id="step">IDLE</b></div>
          <div class="timer" id="timerRow"><span id="timerLabel"></span><b id="timerVal"></b></div>
          <div class="log" id="log"></div>
          <div class="btns"><button class="b go" id="resume">Continue</button><button class="b" id="stop">Stop</button></div>
        </div>
      </div>`;
    document.documentElement.appendChild(host);
    $("min").addEventListener("click", () => $("box").classList.toggle("min"));
    $("stop").addEventListener("click", () => handlers.stop && handlers.stop());
    $("resume").addEventListener("click", () => handlers.resume && handlers.resume());
  }

  function show() { ensure(); host.style.display = ""; }
  function hide() { if (host) host.style.display = "none"; }
  function reset() { ensure(); $("log").textContent = ""; $("step").textContent = "IDLE"; timer(null); paused(false); }
  function step(text) { ensure(); $("step").textContent = String(text).toUpperCase(); }
  function mode(text) { ensure(); const m = $("mode"); m.textContent = text; m.classList.toggle("live", text === "LIVE"); }
  function paused(flag) {
    ensure();
    const r = $("resume");
    r.style.display = flag ? "block" : "none";
    if (!flag) r.textContent = "Continue";
  }
  // Show the red button with your own label. Pressing it hides the button and runs fn.
  function offer(label, fn) {
    ensure();
    const r = $("resume");
    r.textContent = label;
    r.style.display = "block";
    handlers.resume = () => { r.style.display = "none"; r.textContent = "Continue"; fn(); };
  }
  function timer(label, value) {
    ensure();
    const row = $("timerRow");
    if (value == null) { row.style.display = "none"; return; }
    row.style.display = "flex";
    $("timerLabel").textContent = label;
    $("timerVal").textContent = value;
  }
  function log(text, level = "info") {
    ensure();
    const d = document.createElement("div");
    d.className = level;
    d.textContent = `${MARK[level] || MARK.info} ${text}`;
    const box = $("log");
    box.appendChild(d);
    while (box.children.length > 40) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
  }
  function onStop(fn) { handlers.stop = fn; }
  function onResume(fn) { handlers.resume = fn; }

  // ---- alert: sound + system notification + tab title ----
  function beep() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const now = ctx.currentTime;
      [0, 0.28, 0.56].forEach((t) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "square"; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, now + t);
        g.gain.exponentialRampToValueAtTime(0.25, now + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.2);
        o.connect(g); g.connect(ctx.destination);
        o.start(now + t); o.stop(now + t + 0.22);
      });
      setTimeout(() => ctx.close(), 1500);
    } catch (e) { /* Chrome may block sound until you click the page once. The notification still shows. */ }
  }

  let savedTitle = null;
  function flashTitle(text) {
    if (savedTitle === null) savedTitle = document.title;
    document.title = `(!) ${text}`;
    const restore = () => {
      if (savedTitle !== null) { document.title = savedTitle; savedTitle = null; }
      window.removeEventListener("focus", restore);
    };
    window.addEventListener("focus", restore);
  }

  function alertUser(title, message) {
    beep();
    flashTitle(title);
    try { chrome.runtime.sendMessage({ type: "NOTIFY", title, message }); } catch (e) { /* extension was reloaded: refresh the tab */ }
  }

  return { show, hide, reset, step, mode, paused, offer, timer, log, onStop, onResume, alert: alertUser };
})();
