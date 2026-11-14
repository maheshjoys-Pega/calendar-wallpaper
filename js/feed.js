// Calendar Wallpaper — feed loading.
// Data path (BUILD-PROMPT §5): primary = companion loopback server GET /feed
// (deterministic, CORS-opened, token-checked). Fallback = relative bridge file
// inside the wallpaper folder. Last-good feed is kept in memory (and mirrored to
// localStorage when available) so a missing/corrupt source never blanks the art.
(function () {
  "use strict";
  var cfg = window.CW_CONFIG || {};
  var lastGood = null;

  function loopbackBase() {
    var h = cfg.handoff || {};
    return h.port ? "http://127.0.0.1:" + h.port : null;
  }

  function fetchJson(url, headers) {
    return fetch(url, { headers: headers || {}, cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    });
  }

  function validFeed(f) {
    return f && f.schema === 1 && Array.isArray(f.items);
  }

  function load() {
    var base = loopbackBase();
    var attempts = [];
    if (base) {
      attempts.push(fetchJson(base + "/feed", { "X-Calendar-Token": (cfg.handoff || {}).token || "" }));
    }
    attempts.push(fetchJson(cfg.bridgeFile || "data/bridge-feed.json"));
    // Try attempts in order until one yields a valid feed.
    var chain = Promise.reject(new Error("start"));
    attempts.forEach(function (p) {
      chain = chain.catch(function () { return p; }).then(function (f) {
        if (!validFeed(f)) throw new Error("invalid feed");
        return f;
      });
    });
    return chain.then(function (feed) {
      if (feed.items.length === 0) {
        // Guard (v1.2.1): an empty feed is never good news — a companion that
        // has not loaded the real feed yet must not blank the grid or evict
        // good cached data. Preference order: the in-memory last good, then
        // the localStorage cache, then the bundled bridge file (the chain
        // above stops at the first source that answers, so an empty loopback
        // reply means the bridge file was never asked — ask it now). An
        // empty feed is never written into localStorage, and it is rendered
        // only when nothing richer exists anywhere (genuine first run).
        if (lastGood && lastGood.items.length > 0) return lastGood;
        try {
          var cachedGuard = JSON.parse(localStorage.getItem("cw-feed") || "null");
          if (validFeed(cachedGuard) && cachedGuard.items.length > 0) {
            lastGood = cachedGuard;
            return cachedGuard;
          }
        } catch (e) { /* ignore */ }
        return fetchJson(cfg.bridgeFile || "data/bridge-feed.json").then(function (bf) {
          if (validFeed(bf) && bf.items.length > 0) {
            lastGood = bf;
            try { localStorage.setItem("cw-feed", JSON.stringify(bf)); } catch (e) { /* private mode */ }
            return bf;
          }
          return feed;
        }).catch(function () { return feed; });
      }
      lastGood = feed;
      try { localStorage.setItem("cw-feed", JSON.stringify(feed)); } catch (e) { /* private mode */ }
      return feed;
    }).catch(function () {
      if (lastGood) return lastGood;
      try {
        var cached = JSON.parse(localStorage.getItem("cw-feed") || "null");
        if (validFeed(cached)) { lastGood = cached; return cached; }
      } catch (e) { /* ignore */ }
      return null; // caller renders an empty grid over the art — never an error UI
    });
  }

  function postAdd(dateStr) {
    var base = loopbackBase();
    if (!base) return Promise.reject(new Error("no handoff configured"));
    return fetch(base + "/add", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Calendar-Token": (cfg.handoff || {}).token || ""
      },
      body: JSON.stringify({ date: dateStr })
    }).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.json().catch(function () { return { ok: true }; });
    });
  }

  function delay(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }

  // In-panel Add (v1.2.0): POST the full entry to the companion's /entries
  // route. Resolves with the merged pending item exactly as it appears in the
  // feed, so the panel can render it immediately. Rejects when the companion
  // is unreachable or refuses (the form keeps the typed data either way).
  // v1.3.0: retried (0s / 1.2s / 2.5s). The companion auto-starts with
  // Windows, but it can still be mid-start when the user saves; the route is
  // idempotent on clientId, so a retry can never duplicate the entry. Only
  // network-level failures retry — an HTTP answer (even an error) is final.
  function saveEntry(entry) {
    var base = loopbackBase();
    if (!base) return Promise.reject(new Error("no handoff configured"));
    function attempt() {
      return fetch(base + "/entries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Calendar-Token": (cfg.handoff || {}).token || ""
        },
        body: JSON.stringify(entry)
      }).then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        return r.json();
      });
    }
    return attempt()
      .catch(function () { return delay(1200).then(attempt); })
      .catch(function () { return delay(2500).then(attempt); });
  }

  function ping() {
    var base = loopbackBase();
    if (!base) return Promise.resolve(false);
    // The hand-off server token-checks every route, /ping included — without
    // the header this always came back 401 and the panel showed "offline".
    // v1.3.0: a few retries over ~6 s before declaring "off", so a companion
    // that is still starting (it auto-starts with Windows) is not misread.
    function attempt() {
      return fetchJson(base + "/ping", { "X-Calendar-Token": (cfg.handoff || {}).token || "" })
        .then(function () { return true; });
    }
    return attempt()
      .catch(function () { return delay(1500).then(attempt); })
      .catch(function () { return delay(2000).then(attempt); })
      .catch(function () { return delay(2500).then(attempt); })
      .catch(function () { return false; });
  }

  window.CWFeed = { load: load, postAdd: postAdd, ping: ping, saveEntry: saveEntry };
})();
