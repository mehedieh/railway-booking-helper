// selectors.js
// ---------------------------------------------------------------
// EVERY site-specific selector and format lives in this one file.
// If the railway site changes and something stops working,
// this is the only file you should need to edit.
//
// Legend:
//   VERIFIED   = copied from real page HTML that you pasted.
//   UNVERIFIED = a guess. Test it, and send me the real HTML if it fails.
// ---------------------------------------------------------------

window.RS = {
  origin: "https://eticket.railway.gov.bd",

  // ---- Search page (Stage 1) -------------------------------------
  // VERIFIED (from your URL): query names are fromcity, tocity, doj, class.
  searchUrlBase: "https://eticket.railway.gov.bd/booking/train/search",
  dateFormatInUrl: "DD-MMM-YYYY",
  // UNVERIFIED: how the date must be written INSIDE the Date of Journey box.
  // Options: "DD-MMM-YYYY" (21-Sep-2026) or "DD/MM/YYYY" (21/09/2026).
  dateFormatInBox: "DD-MMM-YYYY",

  // VERIFIED: the search form.
  form: {
    container: "app-modify-search",
    from: "#dest_from",
    to: "#dest_to",
    date: "#doj",
    seatClass: "#choose_class",
    submit: "button.search-train-btn"       // never clicked by this extension
  },
  // UNVERIFIED: the suggestion list under the From/To boxes.
  autocompleteItems: "ul.ui-autocomplete li.ui-menu-item",

  // ---- Train results (Stage 2) -----------------------------------
  // VERIFIED: the row of class boxes inside one train card.
  // The train NAME / NUMBER is found by text, not by a selector: the code
  // climbs from this row to the card that holds only this one row.
  results: {
    classRow: "div.seat-classes-row",
    classBox: ".single-seat-class",
    className: ".seat-class-name",          // e.g. SNIGDHA
    classSeats: ".all-seats",               // e.g. 30
    bookNow: "button.book-now-btn"          // a sold-out class is assumed to lack this button or have it disabled (UNVERIFIED)
  },

  // ---- Seat map (Stage 3) ----------------------------------------
  // VERIFIED: everything in this block comes from the seat page HTML you pasted.
  seat: {
    layout: "app-seat-layout",
    coachSelect: "#select-bogie",           // options look like "CHA - 30 Seat(s)"
    coachLabel: ".deck-text",               // text looks like "Coach : CHA"
    row: ".seat-row",
    group: ".seat-in-row",                  // each row has two groups (left pair, right pair)
    seat: "button.btn-seat",
    cls: {
      available: "seat-available",
      selected: "seat-selected",
      booked: "seat-booked",
      hidden: "seat-hidden"                 // blank spaces in the layout, never clickable
    },
    panelRows: "#tbl_seat_list tr.seat-info-row-last",   // the "Seat Details" table
    boarding: "#boardingpoint",
    continueBtn: "button.continue-btn",     // "CONTINUE PURCHASE"
    closeBtn: "button.btn-close-seat-layout"
  },
  // ASSUMPTION: window seats are the first seat of the left group and the
  // last seat of the right group in each row. Check this on a real coach.

  // ---- OTP window (Stage 3) --------------------------------------
  // VERIFIED (from the OTP page you pasted). The extension only READS these.
  // It never types into the OTP boxes and never presses Verify.
  otp: {
    container: "#confirm-booking-otp-verification",
    input: "input.rec-otp",
    paymentTimer: ".countdown-clock",       // "Remaining, to initiate your payment process"
    resendTimer: ".resend-otp-div .timer"
  },

  // ---- Pause detectors ------------------------------------------
  // UNVERIFIED and only used to PAUSE. If one of these is on screen the
  // extension stops, alerts you, and waits. It never touches login or CAPTCHA.
  pause: {
    loginUrlPart: "/login",
    loginPassword: 'input[type="password"]',
    captcha: [
      'iframe[src*="recaptcha/api2/bframe"]',
      'iframe[title*="challenge" i]',
      'img[src*="captcha" i]',
      'input[name*="captcha" i]'
    ],
    // UNVERIFIED: plain-text phrases that mean "your session is gone, log in
    // again". Used during retries so a stale session pauses instead of
    // silently failing. Send me the real message if you ever see one and
    // this list doesn't catch it.
    sessionPhrases: [
      "session has expired",
      "session expired",
      "session timed out",
      "please login again",
      "please log in again"
    ]
  },

  // ---- Seat-hold / lock countdown (Stage 4) -----------------------
  // UNVERIFIED heuristic: no real page showed us a countdown while seats are
  // being selected, only the payment countdown on the OTP page (see above).
  // This scans for anything that LOOKS like a timer near the seat panel, so
  // if the site does show a hold countdown here, it still gets mirrored to
  // the status box. If it never fires, that's fine - the OTP timer still works.
  seatHoldTimer: '[class*="timer" i], [class*="countdown" i], [class*="remaining" i]'
};
