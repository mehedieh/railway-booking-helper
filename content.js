// content.js - runs on eticket.railway.gov.bd pages.
// Fills the search form (Stage 1) and starts / stops the booking run (Stages 2-3).
// It never clicks Search.

(() => {
  const S = window.RS;
  const { sleep, waitFor, formatDate } = window.RSU;

  const q = (sel) => document.querySelector(sel);
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));

  // The site is built with Angular, which only notices changes when the
  // browser sends "input" / "change" events. So after setting a value we fire them.
  function setValue(el, value) {
    el.value = value;
    fire(el, "input");
    fire(el, "change");
  }

  function key(el, type, k) {
    el.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
  }

  function visibleSuggestions() {
    return [...document.querySelectorAll(S.autocompleteItems)].filter((li) => {
      const ul = li.closest("ul");
      return ul && getComputedStyle(ul).display !== "none" && li.getClientRects().length;
    });
  }

  function pickBest(items, wanted) {
    const w = wanted.trim().toLowerCase();
    const text = (li) => li.textContent.trim().toLowerCase();
    return (
      items.find((li) => text(li) === w) ||
      items.find((li) => text(li).startsWith(w)) ||
      items.find((li) => text(li).includes(w)) ||
      null
    );
  }

  // Station boxes: type the name, wait for the suggestion list, click the match.
  async function fillStation(input, name, label) {
    if (!name) return { field: label, ok: false, note: "No station saved in the popup." };
    input.focus();
    input.value = name;
    key(input, "keydown", name.slice(-1));
    fire(input, "input");
    key(input, "keyup", name.slice(-1));

    const items = await waitFor(() => {
      const v = visibleSuggestions();
      return v.length ? v : null;
    }, 3000);
    if (!items) {
      return { field: label, ok: false, note: `No suggestion list appeared for "${name}". Check the spelling, or send me the open list's HTML.` };
    }
    const match = pickBest(items, name);
    if (!match) {
      const seen = items.slice(0, 5).map((li) => li.textContent.trim()).join(", ");
      return { field: label, ok: false, note: `Suggestions appeared (${seen}) but none matched "${name}".` };
    }
    match.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    match.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await sleep(300);
    fire(input, "change");
    input.blur();
    const shown = input.value;
    return { field: label, ok: shown.toLowerCase().includes(name.trim().toLowerCase()), note: `Box now shows "${shown}".` };
  }

  function fillDate(input, iso) {
    const text = formatDate(iso, S.dateFormatInBox);
    if (!text) return { field: "Date", ok: false, note: "No valid date saved in the popup." };
    setValue(input, text); // the box is read-only for typing, but scripts can set it
    input.blur();
    return { field: "Date", ok: input.value === text, note: `Box now shows "${input.value}".` };
  }

  function fillClass(select, cls) {
    if (!cls) return { field: "Class", ok: false, note: "No class saved in the popup." };
    const has = [...select.options].some((o) => o.value === cls);
    if (!has) return { field: "Class", ok: false, note: `The site has no option "${cls}".` };
    setValue(select, cls);
    return { field: "Class", ok: select.value === cls, note: `Dropdown now shows "${select.value}".` };
  }

  async function fillSearchForm(b) {
    const from = await waitFor(() => q(S.form.from), 6000);
    if (!from) {
      return [{
        field: "Form", ok: false,
        note: "Search form not found. Open the train search page. If you see a 'Modify Search' button, click it first."
      }];
    }
    const to = q(S.form.to), date = q(S.form.date), cls = q(S.form.seatClass);
    if (!to || !date || !cls) {
      return [{ field: "Form", ok: false, note: "Some form fields are missing. The selectors in selectors.js may be out of date." }];
    }
    const results = [];
    results.push(await fillStation(from, b.from, "From"));
    await sleep(400);
    results.push(await fillStation(to, b.to, "To"));
    await sleep(400);
    results.push(fillDate(date, b.date));
    results.push(fillClass(cls, b.class1));
    return results;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === "FILL_SEARCH_FORM") {
      fillSearchForm(msg.booking)
        .then((results) => sendResponse({ results }))
        .catch((e) => sendResponse({ results: [{ field: "Error", ok: false, note: String(e) }] }));
      return true; // we will reply asynchronously
    }
    if (msg.type === "START_RUN") {
      const b = msg.booking;
      sendResponse(b.startMode === "scheduled" ? window.RSFlow.schedule(b) : window.RSFlow.start(b));
      return; // progress is shown in the status box on the page
    }
    if (msg.type === "STOP_RUN") {
      window.RSFlow.stop();
      sendResponse({ ok: true });
    }
  });
})();
