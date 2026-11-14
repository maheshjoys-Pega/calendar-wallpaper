// Calendar Wallpaper — month grid renderer + day-focus state.
// Design Law #1: wallpaper art first, calendar second. No chrome in State 0.
(function () {
  "use strict";
  var cfg = window.CW_CONFIG || {};
  var SOURCE_ORDER = ["google", "birthday", "reminder", "deadline"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];
  var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  var feed = null;
  var byDate = {};       // "yyyy-mm-dd" -> items[]
  var focused = null;    // focused date string while State 1 is open
  var formOpen = false;  // the in-panel add form is showing (v1.2.0)
  var formTarget = "google";
  var backdropIdx = 0;
  var backdropTimer = null;

  // ---------- date helpers (all local, date-only strings never UTC-shifted) ----------
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function key(y, m, d) { return y + "-" + pad(m + 1) + "-" + pad(d); }
  function keyOf(date) { return key(date.getFullYear(), date.getMonth(), date.getDate()); }
  function parseKey(k) { var p = k.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(k, n) { var d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); }
  function todayKey() { return keyOf(new Date()); }
  function fmtTime(iso) {
    if (!iso) return "";
    var t = iso.split("T")[1] || "";
    var hh = +t.substr(0, 2), mm = t.substr(3, 2);
    var ap = hh >= 12 ? "PM" : "AM"; var h12 = hh % 12 === 0 ? 12 : hh % 12;
    return h12 + ":" + mm + " " + ap;
  }
  function shortTime(iso) { // for micro-labels: "9:00"
    if (!iso) return "";
    var t = iso.split("T")[1] || ""; var hh = +t.substr(0, 2);
    return (hh % 12 === 0 ? 12 : hh % 12) + ":" + t.substr(3, 2);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function indexItems(f) {
    byDate = {};
    (f.items || []).forEach(function (it) {
      if (!it.date) return;
      var end = it.endDate || it.date;
      var cur = it.date, guard = 0;
      while (cur <= end && guard++ < 62) {
        (byDate[cur] = byDate[cur] || []).push(it);
        cur = addDays(cur, 1);
      }
    });
    Object.keys(byDate).forEach(function (k) {
      byDate[k].sort(function (a, b) {
        if (!!a.allDay !== !!b.allDay) return a.allDay ? 1 : -1;      // timed first
        return String(a.start || "").localeCompare(String(b.start || ""));
      });
    });
  }

  // ---------- backdrops ----------
  function backdropList() {
    var list = (cfg.bundledBackdrops || []).slice();
    var ui = (feed && feed.ui) || {};
    (ui.backdrops || []).forEach(function (b) {
      var src = typeof b === "string" ? b : b.src;
      if (src && list.indexOf(src) < 0) list.push(src);
    });
    return list;
  }
  function rotationMinutes() {
    var ui = (feed && feed.ui) || {};
    return typeof ui.rotationMinutes === "number" ? ui.rotationMinutes : (cfg.rotationMinutes || 0);
  }
  function applyBackdrop(idx, instant) {
    var list = backdropList();
    if (!list.length) return;
    backdropIdx = ((idx % list.length) + list.length) % list.length;
    var front = document.getElementById("bg-front");
    var back = document.getElementById("bg-back");
    var showEl = front.classList.contains("on") ? back : front;
    var hideEl = showEl === front ? back : front;
    showEl.src = list[backdropIdx];
    if (instant) {
      showEl.classList.add("on"); hideEl.classList.remove("on");
    } else {
      // force reflow so the opacity transition runs
      void showEl.offsetWidth;
      showEl.classList.add("on"); hideEl.classList.remove("on");
    }
  }
  function scheduleRotation() {
    if (backdropTimer) { clearInterval(backdropTimer); backdropTimer = null; }
    var mins = rotationMinutes();
    if (mins > 0 && backdropList().length > 1) {
      backdropTimer = setInterval(function () { applyBackdrop(backdropIdx + 1, false); }, mins * 60000);
    }
  }
  function nextBackdrop() {
    applyBackdrop(backdropIdx + 1, false);
    scheduleRotation();  // restart the auto-rotation clock from this scene
  }

  // ---------- header ----------
  function nextUpLine(now) {
    var t = todayKey();
    var best = null;
    ((feed && feed.items) || []).forEach(function (it) {
      if (it.date < t) return;
      if (!best || it.date < best.date || (it.date === best.date && (it.start || "") < (best.start || ""))) best = it;
    });
    if (!best) return "";
    var days = Math.round((parseKey(best.date) - parseKey(t)) / 86400000);
    if (days > 21) return "";
    var when = days === 0 ? "today" : days === 1 ? "tomorrow" : "in " + days + " days";
    return esc(best.title) + " · " + when;
  }
  function renderHeader(now) {
    document.getElementById("month-name").textContent = MONTHS[now.getMonth()];
    document.getElementById("date-line").textContent =
      DOW_FULL[now.getDay()] + ", " + MONTHS[now.getMonth()] + " " + now.getDate() + " · " + now.getFullYear();
    var nu = nextUpLine(now);
    var nuEl = document.getElementById("next-up");
    nuEl.textContent = nu; nuEl.style.display = nu ? "" : "none";
    // agenda strip
    var strip = document.getElementById("agenda");
    if (cfg.agendaStrip === false) { strip.style.display = "none"; return; }
    strip.style.display = "";
    var items = (byDate[todayKey()] || []).slice(0, 3);
    if (!items.length) {
      strip.innerHTML = '<div class="agenda-line empty">Nothing on today</div>';
      return;
    }
    strip.innerHTML = items.map(function (it) {
      var time = it.allDay ? "All day" : fmtTime(it.start);
      var cake = it.source === "birthday" ? "🎂 " : "";
      return '<div class="agenda-line"><span class="agenda-time">' + esc(time) + '</span>' +
        '<span class="agenda-title">' + cake + esc(it.title) + (it.pending ? ' <span class="pend">pending</span>' : "") + "</span></div>";
    }).join("");
  }

  // ---------- grid ----------
  function cellHtml(dateStr, now) {
    var items = byDate[dateStr] || [];
    var d = parseKey(dateStr);
    var classes = ["cell"];
    if (d.getMonth() !== now.getMonth()) classes.push("other");
    if (dateStr < todayKey()) classes.push("past");
    if (d.getDay() === 0 || d.getDay() === 6) classes.push("weekend");
    if (dateStr === todayKey()) classes.push("today");
    var html = '<div class="' + classes.join(" ") + '" data-date="' + dateStr + '">';
    var flagged = items.some(function (it) {
      return it.source === "deadline" && (it.severity === "soon" || it.severity === "urgent");
    });
    if (flagged) {
      var urgent = items.some(function (it) { return it.source === "deadline" && it.severity === "urgent"; });
      html += '<span class="flag' + (urgent ? " urgent" : "") + '" title="Deadline or expiry near">⚑</span>';
    }
    html += '<div class="daynum">' + d.getDate() + "</div>";
    var labelledSources = {};
    items.slice(0, 3).forEach(function (it) {
      labelledSources[it.source] = true;
      var label = it.allDay ? it.title : shortTime(it.start) + " " + it.title;
      if (it.source === "birthday") label = "🎂 " + it.title;
      html += '<div class="label src-' + it.source + (it.pending ? " pending" : "") + '" title="' + esc(it.title) + '">' + esc(label) + "</div>";
    });
    // dots: sources of remaining items + pending markers
    var dots = [];
    items.slice(3).forEach(function (it) {
      if (!labelledSources[it.source] && dots.indexOf(it.source) < 0) dots.push(it.source);
    });
    var hasPending = items.some(function (it) { return it.pending; });
    var hidden = Math.max(0, items.length - 3);
    if (dots.length || hasPending || hidden > 0) {
      html += '<div class="dots">';
      dots.slice(0, 4).forEach(function (s) { html += '<span class="dot src-' + s + '"></span>'; });
      if (hasPending) html += '<span class="dot pending" title="Pending sync"></span>';
      if (hidden > 0) html += '<span class="more">+' + hidden + "</span>";
      html += "</div>";
    }
    html += "</div>";
    return html;
  }

  function renderGrid(now) {
    var grid = document.getElementById("grid");
    var first = new Date(now.getFullYear(), now.getMonth(), 1);
    var last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    var weeks = Math.ceil((first.getDay() + last.getDate()) / 7); // rows this month needs
    var start = new Date(first); start.setDate(1 - first.getDay()); // back to Sunday
    var html = "";
    for (var i = 0; i < weeks * 7; i++) {
      var d = new Date(start); d.setDate(start.getDate() + i);
      if (d.getMonth() !== now.getMonth()) {
        html += '<div class="cell blank"></div>'; // current month only: no neighbour-month days
      } else {
        html += cellHtml(keyOf(d), now);
      }
    }
    grid.style.gridTemplateRows = "repeat(" + weeks + ", 1fr)";
    grid.innerHTML = html;
    grid.querySelectorAll(".cell[data-date]").forEach(function (el) {
      el.addEventListener("dblclick", function () { openDay(el.getAttribute("data-date")); });
    });
  }

  // ---------- State 1: day focus ----------
  function showDayChrome() {
    // Day list + footer visible, add form hidden (the panel's resting state).
    formOpen = false;
    document.getElementById("panel-form").hidden = true;
    document.getElementById("panel-body").style.display = "";
    document.getElementById("panel-foot").style.display = "";
  }
  function closeDay() {
    focused = null;
    showDayChrome();
    document.getElementById("panel").classList.remove("open");
  }
  function openDay(dateStr) {
    if (formOpen) showDayChrome();
    focused = dateStr;
    var panel = document.getElementById("panel");
    var d = parseKey(dateStr);
    document.getElementById("panel-date").textContent =
      DOW_FULL[d.getDay()] + ", " + MONTHS[d.getMonth()] + " " + d.getDate();
    var items = (byDate[dateStr] || []).slice();
    items.sort(function (a, b) {
      var sa = SOURCE_ORDER.indexOf(a.source), sb = SOURCE_ORDER.indexOf(b.source);
      if (sa !== sb) return sa - sb;
      return String(a.start || "").localeCompare(String(b.start || ""));
    });
    var body = document.getElementById("panel-body");
    if (!items.length) {
      body.innerHTML = '<div class="panel-empty">Nothing on this day.</div>';
    } else {
      body.innerHTML = items.map(function (it) {
        var time = it.allDay ? "All day" : fmtTime(it.start) + (it.end ? " – " + fmtTime(it.end) : "");
        var sub = it.location || it.notes || "";
        var extra = "";
        if (it.source === "birthday" && it.turningAge) extra = " · turning " + it.turningAge;
        if (it.source === "deadline" && it.severity && it.severity !== "info")
          extra = ' · <span class="sev sev-' + it.severity + '">' + it.severity + "</span>";
        var cake = it.source === "birthday" ? "🎂 " : "";
        return '<div class="prow src-' + it.source + '">' +
          '<div class="ptime">' + esc(time) + "</div>" +
          '<div class="pmain"><div class="ptitle">' + cake + esc(it.title) + extra +
          (it.pending ? ' <span class="pend">pending sync</span>' : "") + "</div>" +
          (sub ? '<div class="psub">' + esc(sub) + "</div>" : "") + "</div></div>";
      }).join("");
    }
    panel.classList.add("open");
    if (window.CWFeed && CWFeed.ping) {
      CWFeed.ping().then(function (ok) {
        var dot = document.getElementById("conn-dot");
        if (dot) dot.className = "conn-dot " + (ok ? "ok" : "off");
      });
    }
  }

  // ---------- State 1: in-panel add form (v1.2.0) ----------
  // "＋ Add entry" swaps the panel body for this form — no separate window.
  // Save posts the full entry to the companion's /entries route; the window
  // app (tray / Ctrl+Alt+C) remains as the other way in.
  function el(id) { return document.getElementById(id); }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0, v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  function tzOffsetStr(d) {
    var off = -d.getTimezoneOffset();
    var sign = off < 0 ? "-" : "+";
    var a = Math.abs(off);
    return sign + pad(Math.floor(a / 60)) + ":" + pad(a % 60);
  }
  function isoLocal(dateStr, hhmm) {
    var p = dateStr.split("-"), t = hhmm.split(":");
    var d = new Date(+p[0], +p[1] - 1, +p[2], +t[0], +t[1], 0);
    return dateStr + "T" + pad(+t[0]) + ":" + pad(+t[1]) + ":00" + tzOffsetStr(d);
  }

  // To-do rows (v1.3.1, Mahesh Nov 14): exactly ONE editing row (always
  // last) plus committed read-only rows above it. Enter commits the editing
  // row — it becomes plain text with only its checkbox — and a fresh
  // editing row opens below. Ticking a checkbox strikes the item through;
  // the tick is what buildNotes serialises as ☑ into the saved entry.
  function todoRowShell(done) {
    var row = document.createElement("div");
    row.className = "ftodo";
    var cb = document.createElement("input");
    cb.type = "checkbox"; cb.className = "ft-done"; cb.checked = !!done;
    cb.addEventListener("change", function () {
      row.classList.toggle("done", cb.checked);
    });
    if (done) row.classList.add("done");
    row.appendChild(cb);
    return row;
  }
  function addTodoRow(text, done, afterRow) {
    // The editing row: checkbox + text input (no buttons). Returns the input.
    var row = todoRowShell(done);
    row.classList.add("editing");
    var tx = document.createElement("input");
    tx.type = "text"; tx.className = "ft-text"; tx.placeholder = "To-do item";
    tx.autocomplete = "off"; tx.value = text || "";
    row.appendChild(tx);
    if (afterRow && afterRow.parentNode === el("f-todos")) afterRow.after(row);
    else el("f-todos").appendChild(row);
    return tx;
  }
  function commitTodoRow(row) {
    // Editing row -> read-only row: checkbox + plain text, nothing else.
    // An empty row is discarded instead of committed.
    var tx = row.querySelector(".ft-text");
    if (!tx) return;
    var text = tx.value.trim();
    if (!text) { row.remove(); return; }
    var label = document.createElement("span");
    label.className = "ft-label";
    label.textContent = text;
    label.title = "Click to edit";
    tx.replaceWith(label);
    row.classList.remove("editing");
    row.classList.add("committed");
  }
  function editingTodoRow() { return el("f-todos").querySelector(".ftodo.editing"); }
  function ensureEditingRow() {
    var ed = editingTodoRow();
    if (ed) return ed.querySelector(".ft-text");
    return addTodoRow("", false);
  }
  function maybeAutofillTitle() {
    // A to-do entry needs no separate title — it is simply "To do list".
    var t = el("f-title");
    if (!t.value.trim()) t.value = "To do list";
  }
  function collectTodos() {
    var out = [];
    el("f-todos").querySelectorAll(".ftodo").forEach(function (row) {
      var tx = row.querySelector(".ft-text");
      var lb = row.querySelector(".ft-label");
      out.push({
        text: tx ? tx.value : (lb ? lb.textContent : ""),
        done: row.querySelector(".ft-done").checked
      });
    });
    return out;
  }
  // Same serialisation as the companion window: notes first, then "To-do:"
  // with one ☑/☐ line per non-empty item. Null when there is nothing.
  function buildNotes(notesText, todos) {
    var parts = [];
    var n = (notesText || "").trim();
    if (n) parts.push(n);
    var items = todos.filter(function (t) { return t.text.trim(); });
    if (items.length) {
      parts.push("To-do:\n" + items.map(function (t) {
        return (t.done ? "☑ " : "☐ ") + t.text.trim();
      }).join("\n"));
    }
    return parts.length ? parts.join("\n") : null;
  }

  function formError(msg) { el("f-error").textContent = msg || ""; }
  function setTarget(t) {
    formTarget = t;
    el("f-tg-google").classList.toggle("on", t === "google");
    el("f-tg-reminder").classList.toggle("on", t === "reminder");
  }

  function openForm() {
    if (!focused) return;
    formOpen = true;
    el("panel-body").style.display = "none";
    el("panel-foot").style.display = "none";
    el("panel-hint").textContent = "";
    el("panel-form").hidden = false;
    el("f-title").value = "";
    el("f-allday").checked = true;
    el("f-times").hidden = true;
    el("f-start").value = "10:00";
    el("f-end").value = "10:30";
    setTarget("google");
    el("f-notes").value = "";
    el("f-todos").innerHTML = "";
    addTodoRow("", false);
    formError("");
    el("f-save").disabled = false;
    setTimeout(function () { el("f-title").focus(); }, 60);
  }

  function cancelForm() {
    showDayChrome();
    if (focused) openDay(focused);
  }

  function saveForm() {
    var todos = collectTodos();
    var title = el("f-title").value.trim();
    if (!title && todos.some(function (t) { return t.text.trim(); })) {
      // A to-do list needs no separate title — it is simply "To do list",
      // so the title requirement never blocks saving one (v1.3.1).
      title = "To do list";
    }
    if (!title) { formError("A title is required."); el("f-title").focus(); return; }
    var allDay = el("f-allday").checked;
    var start = null, end = null;
    if (!allDay) {
      var sv = el("f-start").value, ev = el("f-end").value;
      if (!sv || !ev) { formError("Pick a start and end time."); return; }
      if (ev <= sv) { formError("End time must be after start time."); return; }
      start = isoLocal(focused, sv);
      end = isoLocal(focused, ev);
    }
    var entry = {
      clientId: uuid(),
      title: title,
      date: focused,
      allDay: allDay,
      start: start,
      end: end,
      target: formTarget,
      notes: buildNotes(el("f-notes").value, todos)
    };
    if (!window.CWFeed || !CWFeed.saveEntry) {
      formError("Companion isn’t responding. It starts with Windows on its own — wait a few seconds and press Save again. Your entry is kept.");
      return;
    }
    var saveBtn = el("f-save");
    saveBtn.disabled = true;
    formError("");
    CWFeed.saveEntry(entry).then(function (item) {
      // Show the new pending item right away, in the panel and the grid.
      if (item && item.id) {
        if (!feed) feed = { schema: 1, items: [] };
        feed.items = (feed.items || []).filter(function (i) { return i.id !== item.id; });
        feed.items.push(item);
      }
      saveBtn.disabled = false;
      showDayChrome();
      render();
    }).catch(function () {
      // Keep everything typed — the user can retry once the app is running.
      saveBtn.disabled = false;
      formError("Companion isn’t responding. It starts with Windows on its own — wait a few seconds and press Save again. Your entry is kept.");
    });
  }

  // ---------- main render ----------
  function render() {
    var now = new Date();
    if (feed) indexItems(feed); else byDate = {};
    renderHeader(now);
    renderGrid(now);
    if (focused && !formOpen) openDay(focused); // never wipe a half-typed form on a background poll
  }

  function refresh() {
    if (!window.CWFeed) { render(); return; }
    CWFeed.load().then(function (f) {
      var changed = !feed || !f || feed.generatedAt !== (f && f.generatedAt);
      if (f) feed = f;
      render();
      if (changed) { applyBackdrop(backdropIdx, true); scheduleRotation(); }
    });
  }

  function scheduleMidnight() {
    var now = new Date();
    var mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
    setTimeout(function () { refresh(); scheduleMidnight(); }, mid - now);
  }

  function init() {
    document.getElementById("panel-close").addEventListener("click", closeDay);
    document.getElementById("panel-add").addEventListener("click", openForm);
    document.getElementById("f-allday").addEventListener("change", function () {
      document.getElementById("f-times").hidden = this.checked;
    });
    document.getElementById("f-tg-google").addEventListener("click", function () { setTarget("google"); });
    document.getElementById("f-tg-reminder").addEventListener("click", function () { setTarget("reminder"); });
    // To-do rows (v1.3.1, Mahesh Nov 14): no "+ Add item" button. Enter
    // commits the typed item — it turns read-only (text + checkbox only) —
    // and opens a fresh editing row below; Enter never submits the form,
    // and Enter on an empty row adds nothing. Backspace in the empty
    // editing row pulls the last committed item back into it (to fix or
    // clear it); clicking a committed item does the same.
    el("f-todos").addEventListener("keydown", function (e) {
      var tx = e.target;
      if (!tx || !tx.classList || !tx.classList.contains("ft-text")) return;
      var row = tx.closest(".ftodo");
      if (!row) return;
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        if (!tx.value.trim()) return;
        commitTodoRow(row);
        maybeAutofillTitle();
        ensureEditingRow().focus();
      } else if (e.key === "Backspace" && tx.value === "") {
        e.preventDefault();
        var committed = el("f-todos").querySelectorAll(".ftodo.committed");
        var last = committed[committed.length - 1];
        if (last) {
          var done = last.querySelector(".ft-done").checked;
          tx.value = last.querySelector(".ft-label").textContent;
          last.remove();
          row.querySelector(".ft-done").checked = done;
          row.classList.toggle("done", done);
          var v = tx.value; tx.value = ""; tx.value = v; // caret to the end
        }
      }
    });
    // Clicking a committed item loads it back into the editing row (which
    // stays last); anything half-typed there is committed first.
    el("f-todos").addEventListener("click", function (e) {
      var lb = e.target;
      if (!lb || !lb.classList || !lb.classList.contains("ft-label")) return;
      var row = lb.closest(".ftodo");
      if (!row) return;
      var ed = editingTodoRow();
      if (ed) {
        var cur = ed.querySelector(".ft-text");
        if (cur && cur.value.trim()) commitTodoRow(ed); else ed.remove();
      }
      var done = row.querySelector(".ft-done").checked;
      var tx = addTodoRow(lb.textContent, done);
      row.remove();
      tx.focus();
      var v = tx.value; tx.value = ""; tx.value = v; // caret to the end
    });
    document.getElementById("f-save").addEventListener("click", saveForm);
    document.getElementById("f-cancel").addEventListener("click", cancelForm);
    document.addEventListener("keydown", function (e) {
      if (!focused) return;
      if (formOpen) {
        if (e.key === "Escape") cancelForm();
        return; // no day-hopping while typing in the form
      }
      if (e.key === "Escape") closeDay();
      if (e.key === "ArrowLeft") openDay(addDays(focused, -1));
      if (e.key === "ArrowRight") openDay(addDays(focused, 1));
    });
    var nb = document.getElementById("backdrop-next");
    if (nb) nb.addEventListener("click", function (e) { e.stopPropagation(); nextBackdrop(); });
    refresh();
    applyBackdrop(0, true);
    scheduleRotation();
    setInterval(refresh, (cfg.feedPollSeconds || 60) * 1000);
    scheduleMidnight();
  }
  // The v1.3.0 shell loads this file dynamically (hosted code path), which
  // can land AFTER DOMContentLoaded has already fired — run init right away
  // in that case instead of waiting for an event that will never come again.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Lively "Customize" controls (LivelyProperties.json) land here.
  window.livelyPropertyListener = function (name, val) {
    if (name === "rotation") { cfg.rotationMinutes = [0, 15, 30, 60][+val] || 0; scheduleRotation(); }
    if (name === "nextBackdrop") { nextBackdrop(); }
    if (name === "agendaStrip") { cfg.agendaStrip = !!val; render(); }
  };

  window.CWCalendar = { refresh: refresh };
})();
