// flow.js - Stages 2 and 3: train -> class -> BOOK NOW -> coach -> seats ->
// CONTINUE PURCHASE -> stop at the OTP window.
//
// What this file NEVER does:
//   - type into login, CAPTCHA or OTP fields, or press Verify
//   - go anywhere near payment
// When the site needs you, it pauses, alerts you, and waits.

window.RSFlow = (() => {
  const S = window.RS, U = window.RSU, O = window.RSOverlay;
  let run = null;

  // Speed profiles. k scales every pause between actions; poll is how often
  // the page is checked. The real floor is the site's own response time,
  // because each step still waits for the page to confirm before moving on.
  const SPEEDS = {
    human: { k: 1,    poll: 250 },   // original pacing, about a second between actions
    fast:  { k: 0.12, poll: 40 },    // about 0.1 to 0.25 s between actions
    max:   { k: 0.02, poll: 20 }     // almost no artificial delay
  };
  let speed = SPEEDS.fast;

  class Stopped extends Error {}
  const check = () => { if (!run || run.abort) throw new Stopped("stopped"); };
  const pause = async (min, max) => { await U.sleep(U.jitter(min * speed.k, max * speed.k)); check(); };
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
  const q = (root, sel) => root.querySelector(sel);

  // ------------------------------------------------------------------
  // Waiting, and pausing when the site needs YOU
  // ------------------------------------------------------------------
  function blocker() {
    if (location.pathname.toLowerCase().includes(S.pause.loginUrlPart)) return "This looks like the login page.";
    const pw = document.querySelector(S.pause.loginPassword);
    if (pw && U.visible(pw)) return "A login form is on screen.";
    for (const sel of S.pause.captcha) {
      const el = document.querySelector(sel);
      if (el && U.visible(el)) return "A CAPTCHA is on screen.";
    }
    return null;
  }

  // Separate from blocker() because this one scans page text, which is
  // slower, so it is only checked between retry attempts, not on every poll.
  function sessionLost() {
    const body = U.norm(document.body.innerText || "").slice(0, 6000);
    for (const phrase of S.pause.sessionPhrases) {
      if (body.includes(U.norm(phrase))) return `The page says: "${phrase}".`;
    }
    if (!document.querySelector(S.form.container) && !document.querySelectorAll(S.results.classRow).length) {
      return "The train list and search form both disappeared.";
    }
    return null;
  }

  // If login or CAPTCHA shows up: stop, alert, and wait until it is gone
  // (or until you press Continue in the status box). Returns ms spent waiting.
  async function guard() {
    if (Date.now() < run.ignoreUntil) return 0;
    const why = blocker();
    if (!why) return 0;
    const t0 = Date.now();
    O.step("PAUSED");
    O.log(`${why} Please do it yourself. I will continue after.`, "warn");
    O.paused(true);
    O.alert("BD Rail: your turn", why);
    while (blocker()) {
      check();
      if (run.forceResume) { run.forceResume = false; run.ignoreUntil = Date.now() + 60000; break; }
      await U.sleep(500);
    }
    O.paused(false);
    O.log("Continuing.", "ok");
    return Date.now() - t0;
  }

  // Poll until fn() is truthy. Time spent paused for you does not count.
  async function until(fn, timeout = 10000, every = speed.poll) {
    let end = Date.now() + timeout;
    for (;;) {
      check();
      end += await guard();
      const v = fn();
      if (v) return v;
      if (Date.now() > end) return null;
      await U.sleep(every);
    }
  }

  // Wait until you press Continue in the status box.
  async function waitForUser(message) {
    O.paused(true);
    O.log(message, "warn");
    O.alert("BD Rail: your turn", message);
    run.forceResume = false;
    while (!run.forceResume) { check(); await U.sleep(400); }
    run.forceResume = false;
    O.paused(false);
  }

  function end(message, level = "info") {
    O.step("FINISHED");
    O.log(message, level);
    if (level === "warn" || level === "error") O.alert("BD Rail", message);
  }

  // ------------------------------------------------------------------
  // Stage 2: find the train card and the class box
  // ------------------------------------------------------------------
  // The card is found structurally: climb from a class row while the parent
  // still contains only ONE class row. No guessed class names needed.
  function cardOf(row) {
    let el = row;
    while (el.parentElement && el.parentElement !== document.body) {
      const p = el.parentElement;
      if (p.querySelectorAll(S.results.classRow).length !== 1) break;
      el = p;
    }
    return el;
  }

  function trainMatches(card, wanted) {
    const w = U.norm(wanted);
    if (!w) return false;
    const text = U.norm(card.innerText || card.textContent);
    if (/^\d{2,4}$/.test(w)) {
      // Train numbers appear in brackets, e.g. "SUBORNO EXPRESS (701)".
      if (/\(\s*\d{2,4}\s*\)/.test(text)) return new RegExp(`\\(\\s*${w}\\s*\\)`).test(text);
      return new RegExp(`\\b${w}\\b`).test(text);
    }
    return text.includes(w);
  }

  function findCard(train) {
    return [...document.querySelectorAll(S.results.classRow)].map(cardOf).find((c) => trainMatches(c, train)) || null;
  }

  function classInfo(card, cls) {
    const box = [...card.querySelectorAll(S.results.classBox)].find((b) => {
      const n = q(b, S.results.className);
      return n && U.norm(n.textContent) === U.norm(cls);
    });
    if (!box) return null;
    const seatsEl = q(box, S.results.classSeats);
    const m = seatsEl && /\d+/.exec(seatsEl.textContent);
    const seats = m ? parseInt(m[0], 10) : null;
    const btn = q(box, S.results.bookNow);
    const canBook = !!btn && !btn.disabled && U.visible(btn) && seats !== 0;
    return { box, seats, btn, canBook };
  }

  // ------------------------------------------------------------------
  // Stage 3: coach and seats
  // ------------------------------------------------------------------
  async function pickCoach(layout, n) {
    const sel = q(layout, S.seat.coachSelect);
    if (!sel) { O.log("Coach dropdown not found. Check selectors.js.", "error"); return false; }
    const opts = [...sel.options].map((o, i) => {
      const m = /^(.*?)\s*-\s*(\d+)\s*seat/i.exec(o.textContent.trim());
      return m ? { i, value: o.value, name: m[1].trim(), count: parseInt(m[2], 10) } : null;
    }).filter(Boolean);
    O.log("Coaches: " + opts.map((o) => `${o.name} ${o.count}`).join(", "));
    const cur = opts.find((o) => o.i === sel.selectedIndex);
    const pick = cur && cur.count >= n ? cur : opts.find((o) => o.count >= n);
    if (!pick) { O.log(`No single coach has ${n} seat(s).`, "warn"); return false; }
    if (pick !== cur) {
      await pause(120, 280);
      sel.value = pick.value;
      fire(sel, "change");
      const shown = await until(() => {
        const d = q(layout, S.seat.coachLabel);
        return d && U.norm(d.textContent.split(":").pop()) === U.norm(pick.name);
      }, 5000);
      if (!shown) { O.log(`Coach ${pick.name} did not open.`, "error"); return false; }
    }
    O.log(`Coach ${pick.name} (${pick.count} seats)`);
    const ready = await until(() => q(layout, `${S.seat.seat}.${S.seat.cls.available}`), 5000);
    return !!ready;
  }

  // Read the seat map into a simple list.
  function scanSeats(layout) {
    const out = [];
    layout.querySelectorAll(S.seat.row).forEach((row, r) => {
      const groups = row.querySelectorAll(S.seat.group);
      groups.forEach((grp, g) => {
        const btns = [...grp.querySelectorAll(S.seat.seat)].filter((b) => (b.title || b.textContent).trim());
        btns.forEach((b, i) => {
          const c = b.classList;
          out.push({
            title: (b.title || b.textContent).trim(),
            row: r,
            window: (g === 0 && i === 0) || (g === groups.length - 1 && i === btns.length - 1),
            selected: c.contains(S.seat.cls.selected),
            available: c.contains(S.seat.cls.available) && !c.contains(S.seat.cls.selected) &&
                       !c.contains(S.seat.cls.booked) && !c.contains(S.seat.cls.hidden) && !b.disabled
          });
        });
      });
    });
    return out;
  }

  function findSeatButton(layout, title) {
    return [...layout.querySelectorAll(S.seat.seat)].find((b) => (b.title || b.textContent).trim() === title) || null;
  }

  // Prefer n seats in the same row, otherwise just the first n.
  function pickTogether(list, n) {
    const rows = new Map();
    list.forEach((s) => { if (!rows.has(s.row)) rows.set(s.row, []); rows.get(s.row).push(s); });
    for (const seats of rows.values()) if (seats.length >= n) return seats.slice(0, n);
    return list.slice(0, n);
  }

  function parseWanted(text) {
    return String(text || "").split(/[\s,;]+/).map((t) => t.trim().toUpperCase()).filter(Boolean);
  }

  // Decide which seats to click. Returns a list, or null meaning "skip this train".
  function planSeats(seats, n, b) {
    const avail = seats.filter((s) => s.available);
    if (avail.length < n) return null;
    const fillRest = (chosen) => {
      if (chosen.length >= n) return chosen.slice(0, n);
      if (b.fallback === "skip") return null;
      const rest = avail.filter((s) => !chosen.includes(s));
      return chosen.concat(pickTogether(rest, n - chosen.length));
    };

    if (b.seatPref === "window") {
      return fillRest(pickTogether(avail.filter((s) => s.window), n).slice(0, n));
    }
    if (b.seatPref === "specific") {
      const wanted = parseWanted(b.seatNumbers);
      if (!wanted.length) { O.log("No specific seats typed. Using any seat.", "warn"); return pickTogether(avail, n); }
      const chosen = [];
      for (const w of wanted) {
        const s = avail.find((a) => !chosen.includes(a) && (a.title.toUpperCase() === w || a.title.toUpperCase().endsWith("-" + w)));
        if (s) chosen.push(s);
        if (chosen.length >= n) break;
      }
      if (!chosen.length) O.log("None of those seat numbers were free. Labels look like CHA-12, so type 12 or CHA-12.", "warn");
      return fillRest(chosen);
    }
    return pickTogether(avail, n);
  }

  // Click seats one at a time, with pauses, and confirm each one locked.
  async function lockSeats(layout, plan, n) {
    const already = scanSeats(layout).filter((s) => s.selected).map((s) => s.title);
    if (already.length) O.log(`Already selected: ${already.join(", ")}`, "warn");
    const chosen = [...already];
    const tried = new Set(already);
    let queue = plan.map((s) => s.title).filter((t) => !tried.has(t));
    let guardRuns = 0;
    while (chosen.length < n && guardRuns++ < n + 6) {
      if (!queue.length) {
        const more = pickTogether(scanSeats(layout).filter((s) => s.available && !tried.has(s.title)), n - chosen.length);
        if (!more.length) break;
        queue = more.map((s) => s.title);
      }
      const title = queue.shift();
      tried.add(title);
      const btn = findSeatButton(layout, title);
      if (!btn) continue;
      await pause(120, 260);
      btn.click();
      const ok = await until(() => {
        const b = findSeatButton(layout, title);
        return b && b.classList.contains(S.seat.cls.selected);
      }, 3500);
      if (ok) { chosen.push(title); O.log(`Selected ${title}`, "ok"); }
      else O.log(`${title} did not lock (maybe just taken).`, "warn");
    }
    return chosen;
  }

  async function closePanel(layout) {
    const btn = q(layout, S.seat.closeBtn);
    if (btn) { await pause(100, 200); btn.click(); }
    await until(() => !layout.isConnected || !U.visible(layout), 4000);
    await pause(100, 180);
  }

  // Never waits for you. One option: use it. Several: use the one whose name
  // matches your From station, otherwise the site's first option, and say so.
  async function ensureBoarding(layout, b) {
    const sel = q(layout, S.seat.boarding);
    if (!sel) { O.log("Boarding station box not found. I will carry on.", "warn"); return; }
    const opts = [...sel.options].filter((o) => o.value);
    if (!opts.length) return;
    let pick = opts[0];
    if (opts.length > 1) {
      const from = U.norm(b.from);
      const match = from && opts.find((o) => U.norm(o.textContent).includes(from));
      if (match) pick = match;
      else O.log(`${opts.length} boarding stations. Using the first. Check it on the next page.`, "warn");
    }
    sel.value = pick.value;
    fire(sel, "change");
    O.log(`Boarding: ${pick.textContent.trim()}`);
  }

  // ------------------------------------------------------------------
  // The OTP window: hand over to you
  // ------------------------------------------------------------------
  const otpVisible = () => {
    const el = document.querySelector(S.otp.container);
    return el && U.visible(el) ? el : null;
  };
  const timerText = (sel) => {
    const els = [...document.querySelectorAll(sel)];
    const el = els.find((e) => U.visible(e)) || els[0];
    return el ? el.textContent.trim() : "";
  };

  async function handOverAtOtp() {
    O.step("OTP - YOUR TURN");
    O.log("OTP window is open. Type the code yourself. I will not touch it.", "ok");
    O.alert("BD Rail: enter your OTP", "Your seats are held. The payment timer is running.");
    const first = document.querySelector(S.otp.input);
    if (first) first.focus();
    while (otpVisible()) {
      check();
      const pay = timerText(S.otp.paymentTimer);
      const resend = timerText(S.otp.resendTimer);
      if (pay || resend) O.timer("TIME LEFT", `${pay || "--:--"}  \u00b7  resend ${resend || "--:--"}`);
      await U.sleep(1000);
    }
    O.timer(null);
    O.step("HANDED OVER");
    O.log("OTP window closed. Payment is all yours.", "ok");
  }

  async function waitForOtp() {
    O.step("WAITING FOR OTP");
    let got = await until(otpVisible, 20000);
    if (!got) {
      O.log("OTP window not seen yet. If the site asks for anything (passenger details, CAPTCHA), please do it. I keep watching.", "warn");
      O.alert("BD Rail: check the page", "OTP window not seen yet. The site may need something from you.");
      got = await until(otpVisible, 600000);
    }
    if (!got) return end("Gave up waiting for the OTP window.", "error");
    await handOverAtOtp();
  }

  // Press CONTINUE PURCHASE and make sure the site really reacted.
  // Tries a normal click, then a fuller mouse sequence, then a form submit.
  const reactWait = () => (speed.k < 1 ? 2500 : 4000);
  async function pressContinue(btn) {
    const before = location.href;
    const reacted = () => otpVisible() || !btn.isConnected || !U.visible(btn) || location.href !== before;

    btn.click();
    if (await until(reacted, reactWait())) return true;

    O.log("No reaction yet. Trying a fuller click.", "warn");
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      btn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
    if (await until(reacted, reactWait())) return true;

    O.log("Still nothing. Trying the form's own submit.", "warn");
    const form = btn.closest("form");
    if (form && form.requestSubmit) form.requestSubmit(btn);
    else if (form) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    return !!(await until(reacted, reactWait()));
  }

  async function continueAndHandOver(btn) {
    O.step("CONTINUE");
    if (btn.disabled) {
      O.log("CONTINUE PURCHASE is greyed out. Waiting a few seconds.", "warn");
      await until(() => !btn.disabled, 8000);
    }
    await pause(120, 260);
    O.log("Pressing CONTINUE PURCHASE");
    const worked = await pressContinue(btn);
    if (!worked) {
      O.log("The site did not react to the click. Press CONTINUE PURCHASE yourself. I keep watching for the OTP window.", "error");
      O.alert("BD Rail: press CONTINUE PURCHASE", "The site did not react to my click. Please press it yourself.");
    }
    await waitForOtp();
  }

  // ------------------------------------------------------------------
  // Seat-hold countdown: best-effort. See selectors.js for why this is a
  // heuristic. Runs in the background; never blocks or fails the run.
  // ------------------------------------------------------------------
  function watchSeatHold(layout) {
    let stopped = false;
    const stop = () => { stopped = true; };
    (async () => {
      while (!stopped && run && !run.abort && layout.isConnected) {
        const el = [...layout.querySelectorAll(S.seatHoldTimer)].find((e) => U.visible(e) && U.looksLikeClock(e.textContent));
        if (el) O.timer("SEAT HOLD", el.textContent.trim());
        await U.sleep(1000);
      }
      O.timer(null);
    })();
    return stop;
  }

  // ------------------------------------------------------------------
  // One candidate: a train + class pair
  // ------------------------------------------------------------------
  async function tryCandidate(cand, b, n) {
    const card = findCard(cand.train);
    if (!card) return "skip";
    const info = classInfo(card, cand.cls);
    if (!info || !info.canBook) return "skip";

    O.step("BOOK NOW");
    O.log(`${cand.train} / ${cand.cls}: pressing BOOK NOW`);
    await pause(100, 220);
    info.btn.click();
    const layout = await until(() => {
      const l = q(card, S.seat.layout) || document.querySelector(S.seat.layout);
      return l && q(l, S.seat.seat) ? l : null;
    }, 10000);
    if (!layout) { O.log("The seat map did not open.", "error"); return "skip"; }

    O.step("COACH");
    if (!(await pickCoach(layout, n))) { await closePanel(layout); return "skip"; }

    const stopWatch = watchSeatHold(layout);
    try {
      O.step("SEATS");
      const plan = planSeats(scanSeats(layout), n, b);
      if (!plan) {
        O.log("Preferred seats are gone. Skipping this train.", "warn");
        await closePanel(layout);
        return "skip";
      }
      const chosen = await lockSeats(layout, plan, n);
      if (chosen.length < n) {
        end(`Only ${chosen.length} of ${n} seat(s) locked (${chosen.join(", ") || "none"}). Nothing more done. Finish or release them yourself.`, "error");
        return "done";
      }
      const rows = [...layout.querySelectorAll(S.seat.panelRows)]
        .map((tr) => [...tr.children].map((td) => td.textContent.trim()).join(" | "));
      O.log("Seat details: " + (rows.join(" ; ") || chosen.join(", ")), "ok");

      O.step("BOARDING");
      await ensureBoarding(layout, b);

      const cont = q(layout, S.seat.continueBtn);
      if (!cont) { end("CONTINUE PURCHASE button not found. Check selectors.js.", "error"); return "done"; }

      if (b.dryRun) {
        end(`DRY-RUN: stopped before CONTINUE PURCHASE with ${chosen.join(", ")} selected.`, "ok");
        O.log("Dry-run is ON, so I did not press it. Press the red button below to continue for real, or turn Dry-run off in the popup for an instant run next time.", "warn");
        O.alert("BD Rail: dry-run finished", `Stopped before CONTINUE PURCHASE. Seats: ${chosen.join(", ")}`);
        O.offer("Continue purchase now", () => goLive(cont));
        return "done";
      }

      // LIVE: goes straight to CONTINUE PURCHASE, no manual confirmation step.
      await continueAndHandOver(cont);
      return "done";
    } finally {
      stopWatch();
    }
  }

  // ------------------------------------------------------------------
  // Retrying: wait between attempts, counting down in the status box.
  // A stale session pauses (via guard-style handling) instead of failing.
  // ------------------------------------------------------------------
  async function waitRetry(seconds) {
    O.step("WAITING");
    let remain = seconds;
    while (remain > 0) {
      check();
      await guard();
      O.timer("NEXT TRY", U.fmtDuration(remain * 1000));
      await U.sleep(1000);
      remain--;
    }
    O.timer(null);
  }

  async function refreshCheck() {
    check();
    await guard();
    const why = sessionLost();
    if (!why) return true;
    O.step("PAUSED");
    O.log(`${why} Reopen the search results yourself (use 'Open search page' again if needed), then press Continue here.`, "warn");
    await waitForUser("Waiting for the train list to come back.");
    return !sessionLost();
  }

  // ------------------------------------------------------------------
  // Main
  // ------------------------------------------------------------------
  async function main(b) {
    const n = Math.min(4, Math.max(1, parseInt(b.seats, 10) || 1));
    const retryEvery = Math.max(2, parseInt(b.retryEvery, 10) || 5);
    const maxTries = Math.max(1, parseInt(b.maxTries, 10) || 50);
    O.mode(b.dryRun ? "DRY-RUN" : "LIVE");
    const spd = SPEEDS[b.speed] ? b.speed : "fast";
    if (b.dryRun) O.log(`Mode: DRY-RUN (${spd}). I will NOT press CONTINUE PURCHASE. Turn Dry-run off in the popup for a live run.`, "warn");
    else O.log(`Mode: LIVE (${spd}). I will press CONTINUE PURCHASE and stop at the OTP window.`, "ok");

    const trains = [b.train1, b.train2, b.train3].filter(Boolean);
    const classes = [b.class1, b.class2].filter(Boolean);
    if (!trains.length) return end("Type at least one preferred train in the popup.", "error");
    if (!classes.length) return end("Choose at least one class in the popup.", "error");

    for (let attempt = 1; attempt <= maxTries; attempt++) {
      check();
      O.step(maxTries > 1 ? `TRY ${attempt}/${maxTries}` : "FIND TRAIN");
      if (attempt > 1 && !(await refreshCheck())) continue;

      const rows = await until(() => {
        const r = document.querySelectorAll(S.results.classRow);
        return r.length ? r : null;
      }, attempt === 1 ? 15000 : 6000);
      if (!rows) {
        if (attempt === 1) return end("No train list on this page. Use 'Open search page', wait for the trains to load, then press Start.", "error");
        O.log("Train list not visible this try.", "warn");
      } else if (attempt === 1) {
        O.log(`Found ${rows.length} train(s) on the page.`);
      }

      const candidates = [];
      for (const train of trains) {
        const card = findCard(train);
        if (!card) { if (attempt === 1) O.log(`"${train}" is not on this list.`, "warn"); continue; }
        for (const cls of classes) {
          const info = classInfo(card, cls);
          if (!info) { if (attempt === 1) O.log(`${train}: no ${cls} class.`, "warn"); continue; }
          if (!info.canBook) continue; // sold out; quiet after the first try, to keep the log readable
          if (info.seats !== null && info.seats < n) continue;
          candidates.push({ train, cls });
        }
      }

      for (const cand of candidates) {
        check();
        const result = await tryCandidate(cand, b, n);
        if (result === "done") return;
      }

      if (attempt < maxTries) {
        O.log(candidates.length
          ? `Attempt ${attempt}: every candidate was skipped.`
          : `Attempt ${attempt}: no seats yet.`, "warn");
        await waitRetry(retryEvery);
      }
    }
    end(`Gave up after ${maxTries} attempt(s). No seats appeared.`, "warn");
  }

  function stop() {
    cancelSchedule();
    if (run && !run.abort) { run.abort = true; O.log("Stopped.", "warn"); O.step("STOPPED"); O.paused(false); }
  }

  // Run fn as the active run: stoppable, and errors show in the status box.
  function runGuarded(fn) {
    const mine = (run = { abort: false, forceResume: false, ignoreUntil: 0 });
    O.show();
    O.onStop(stop);
    O.onResume(() => { if (run) run.forceResume = true; });
    fn()
      .catch((e) => {
        if (e instanceof Stopped) return;
        O.step("ERROR");
        O.log(String((e && e.message) || e), "error");
        console.error("[BD Rail helper]", e);
      })
      .finally(() => { mine.abort = true; });
  }

  // After a dry-run: press CONTINUE PURCHASE for real and hand over at the OTP window.
  function goLive(btn) {
    if (run && !run.abort) return;
    if (!btn || !btn.isConnected) { O.log("The seat panel is gone. Press Start booking again with Dry-run off.", "error"); return; }
    O.mode("LIVE");
    runGuarded(() => continueAndHandOver(btn));
  }

  function start(booking) {
    speed = SPEEDS[booking.speed] || SPEEDS.fast;
    if (run && !run.abort) { O.show(); O.log("Already running.", "warn"); return { ok: false, note: "Already running." }; }
    cancelSchedule();
    O.show(); O.reset();
    runGuarded(() => main(booking));
    return { ok: true };
  }

  // ------------------------------------------------------------------
  // Scheduler: wait until a chosen clock time, counting down in the status
  // box, then start the run automatically. HH:MM is read from a 24-hour
  // <input type="time">. If that time has already passed today, it is
  // assumed to mean tomorrow.
  // ------------------------------------------------------------------
  let scheduleTimer = null;

  function cancelSchedule() {
    if (scheduleTimer) { clearTimeout(scheduleTimer); scheduleTimer = null; }
  }

  function targetTime(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
    if (!m) return null;
    const t = new Date();
    t.setHours(Number(m[1]), Number(m[2]), 0, 0);
    if (t.getTime() <= Date.now() + 1000) t.setDate(t.getDate() + 1);
    return t;
  }

  function schedule(booking) {
    if (run && !run.abort) { O.show(); O.log("Already running.", "warn"); return { ok: false, note: "Already running." }; }
    const target = targetTime(booking.startTime);
    if (!target) { O.show(); O.log("Start time is not set. Pick a time, or choose 'Start now'.", "error"); return { ok: false, note: "Start time is not set." }; }

    cancelSchedule();
    speed = SPEEDS[booking.speed] || SPEEDS.fast;
    O.show(); O.reset();
    O.mode(booking.dryRun ? "DRY-RUN" : "LIVE");
    O.step("SCHEDULED");
    O.log(`Waiting to start at ${target.toLocaleTimeString()}.`, "ok");
    O.onStop(stop);
    O.onResume(() => {}); // the Continue button has nothing to do before start

    const tick = () => {
      const left = target.getTime() - Date.now();
      if (left <= 0) {
        scheduleTimer = null;
        O.timer(null);
        O.log("Starting now.", "ok");
        runGuarded(() => main(booking));
        return;
      }
      O.timer("STARTS IN", U.fmtDuration(left));
      scheduleTimer = setTimeout(tick, left > 60000 ? 1000 : 200);
    };
    tick();
    return { ok: true };
  }

  return { start, stop, schedule };
})();
