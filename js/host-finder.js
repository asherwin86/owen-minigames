// Finds a 51 Mimi Games host on the visitor's own network and offers to jump to it.
//
// The Windows desktop app can host the whole site for other devices (see
// server.js, "Hosting for other devices"). It announces itself to the website,
// keyed by the router's public address, and this asks "is anything announced
// from where I am?". If so it offers a link to http://<lan-ip>:<port>/.
//
// A link, not a connection, on purpose. This page is https://, and browsers
// refuse to let an https page fetch or open a WebSocket to a plain-http LAN
// address (mixed content), and a probe would not say whether the host is
// reachable either. A top-level navigation is allowed, so the visitor is sent
// there, and from then on everything is same-origin with the host.
//
// What this deliberately does not do:
//  - run on a host or a LAN address (nothing to find; also stops a loop),
//  - run in the desktop app or the static GitHub Pages copy (no rendezvous),
//  - jump automatically unless the visitor ticked "always" — and even then not
//    twice in one session, so an unreachable host (guest Wi-Fi that isolates
//    devices) can't trap someone in a back-button loop.
(function () {
  const AUTO_KEY = "mimiAutoJoinHost";
  const DISMISS_KEY = "mimiHostDismissed";
  const TRIED_KEY = "mimiHostTried";

  const store = {
    get(area, k) { try { return window[area].getItem(k); } catch (e) { return null; } },
    set(area, k, v) { try { window[area].setItem(k, v); } catch (e) { /* storage unavailable */ } },
    del(area, k) { try { window[area].removeItem(k); } catch (e) { /* storage unavailable */ } },
  };

  function onHostAlready() {
    const h = location.hostname;
    return h === "localhost" || h === "[::1]" || h.endsWith(".local")
      || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
  }

  if (window.MIMI_STATIC_MODE === true || window.mimiDesktop || onHostAlready()) return;
  if (store.get("sessionStorage", DISMISS_KEY) === "1") return;
  if (new URLSearchParams(location.search).has("nohost")) return;

  function jumpUrl(hostUrl) {
    // Keep the visitor where they were (/snake, #room…), just on the host.
    return new URL(location.pathname + location.search + location.hash, hostUrl).href;
  }

  function show(host) {
    const url = jumpUrl(host.urls[0]);
    const autoOk = store.get("localStorage", AUTO_KEY) === "1" && store.get("sessionStorage", TRIED_KEY) !== "1";

    const bar = document.createElement("div");
    bar.setAttribute("role", "status");
    bar.style.cssText = "position:fixed; left:50%; bottom:92px; transform:translateX(-50%); z-index:9999; max-width:min(560px, calc(100vw - 32px)); display:flex; flex-wrap:wrap; gap:8px 12px; align-items:center; padding:12px 16px; border-radius:12px; background:var(--panel, #1c2230); color:var(--text, #fff); border:1px solid var(--border, #3a4258); box-shadow:0 8px 30px rgba(0,0,0,.45); font-size:.9rem; line-height:1.4;";

    const msg = document.createElement("span");
    msg.style.flex = "1 1 220px";
    msg.textContent = autoOk
      ? `Joining ${host.name} on your network…`
      : `🖥️ ${host.name} is hosting on your network. Play from it for a faster, local game.`;

    const go = document.createElement("button");
    go.type = "button";
    go.className = "btn primary";
    go.textContent = autoOk ? "Cancel" : "Join";

    const later = document.createElement("button");
    later.type = "button";
    later.className = "btn";
    later.textContent = "Not now";

    const alwaysLabel = document.createElement("label");
    alwaysLabel.style.cssText = "display:flex; gap:6px; align-items:center; font-size:.8rem; opacity:.85; cursor:pointer; flex-basis:100%;";
    const always = document.createElement("input");
    always.type = "checkbox";
    always.checked = store.get("localStorage", AUTO_KEY) === "1";
    alwaysLabel.append(always, document.createTextNode("Always join a host on my network automatically"));
    always.addEventListener("change", () => {
      if (always.checked) store.set("localStorage", AUTO_KEY, "1");
      else store.del("localStorage", AUTO_KEY);
    });

    let timer = null;
    const navigate = () => {
      store.set("sessionStorage", TRIED_KEY, "1");
      location.assign(url);
    };
    const close = () => {
      if (timer) clearTimeout(timer);
      store.set("sessionStorage", DISMISS_KEY, "1");
      bar.remove();
    };

    if (autoOk) {
      timer = setTimeout(navigate, 2500);
      go.addEventListener("click", close);
      later.hidden = true;
    } else {
      go.addEventListener("click", navigate);
      later.addEventListener("click", close);
    }

    bar.append(msg, go, later);
    if (host.urls.length > 1 && !autoOk) {
      const alt = document.createElement("span");
      alt.style.cssText = "flex-basis:100%; font-size:.8rem; opacity:.8;";
      alt.append("Not working? Try: ");
      host.urls.slice(1).forEach((u, i) => {
        if (i) alt.append(" · ");
        const a = document.createElement("a");
        a.href = jumpUrl(u);
        a.textContent = new URL(u).host;
        a.style.color = "inherit";
        alt.appendChild(a);
      });
      bar.appendChild(alt);
    }
    bar.appendChild(alwaysLabel);
    document.body.appendChild(bar);
  }

  async function find() {
    const ctrl = new AbortController();
    const abort = setTimeout(() => ctrl.abort(), 6000);
    try {
      const base = (window.MimiGames && window.MimiGames.getServerBase && window.MimiGames.getServerBase()) || "";
      const res = await fetch(`${base}/api/host/lookup`, { cache: "no-store", signal: ctrl.signal });
      if (!res.ok) return;
      const data = await res.json();
      // Trust nothing the response says about where to navigate: only a plain
      // private-network http(s) address with a port is ever offered. (The server
      // already builds these itself; this is for a server that isn't ours.)
      const SAFE = /^https?:\/\/(10\.\d{1,3}|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d{1,3}(\.\d{1,3})?:\d{4,5}\/$/;
      const hosts = data && data.ok && Array.isArray(data.hosts) ? data.hosts : [];
      for (const h of hosts) {
        const urls = Array.isArray(h.urls) ? h.urls.filter((u) => typeof u === "string" && SAFE.test(u)) : [];
        if (urls.length) { show({ name: String(h.name || "A computer").slice(0, 40), urls }); break; }
      }
    } catch (e) {
      // offline, site asleep, or no host announced: nothing to offer
    } finally {
      clearTimeout(abort);
    }
  }

  // After the hub has painted; this is a convenience, never worth delaying a load.
  if (document.readyState === "complete") setTimeout(find, 800);
  else window.addEventListener("load", () => setTimeout(find, 800));
})();
