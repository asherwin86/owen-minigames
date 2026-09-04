/* Video Board — a shared feed of real YouTube links this hub's players post
 * for each other, played through YouTube's own embedded player.
 *
 * There is no video hosting here at all, on purpose: this server's disk is
 * ephemeral (wiped on every redeploy — see server.js's own comment on that),
 * so an actual upload-and-host feature would quietly lose people's videos.
 * Only a video id and a title are ever stored; playback always streams
 * straight from YouTube's CDN via youtube-nocookie.com's embed player,
 * exactly like embedding a YouTube video on any other site.
 *
 * Two modes, a segmented toggle between them:
 *   Board          — what this hub's players have shared, filterable to
 *                    Everyone or just the ones you posted yourself.
 *   Watch Any Video — paste any real YouTube link and it plays right here,
 *                    with no need to post it to the board first.
 */
MimiGames.register({
  id: "video-board",
  title: "Video Board",
  emoji: "📺",
  category: "Apps",
  players: "1P",
  howTo: "Board shows YouTube links other players here have shared — filter to Everyone or just the ones you posted. Paste a video link to post it (its title fills in on its own), or paste a channel link to post its ~15 most recent uploads at once. Watch Any Video plays any real YouTube link straight away, no posting needed. Sign in to post to the board.",
  init(root, ctx) {
    const wrap = document.createElement("div");
    wrap.className = "vb-wrap";
    wrap.innerHTML = `
      <div class="vb-tabs">
        <button type="button" class="btn primary vb-tab" data-tab="board">📋 Board</button>
        <button type="button" class="btn vb-tab" data-tab="watch">▶️ Watch Any Video</button>
      </div>
      <div class="vb-board">
        <div class="vb-board-controls">
          <div class="vb-filter">
            <button type="button" class="btn primary vb-filter-btn" data-who="everyone">Everyone</button>
            <button type="button" class="btn vb-filter-btn" data-who="mine">Mine</button>
          </div>
          <button type="button" class="btn vb-refresh">↻ Refresh</button>
        </div>
        <div class="vb-post">
          <input type="text" class="vb-post-url" placeholder="Paste a video or channel link…" />
          <input type="text" class="vb-post-title" placeholder="Title" maxlength="120" />
          <button type="button" class="btn primary vb-post-btn">Post</button>
        </div>
        <p class="vb-post-hint"></p>
        <p class="vb-status"></p>
        <div class="vb-grid"></div>
      </div>
      <div class="vb-watch hidden">
        <div class="vb-watch-row">
          <input type="text" class="vb-watch-url" placeholder="Paste any YouTube link or video id…" />
          <button type="button" class="btn primary vb-watch-btn">Watch</button>
        </div>
        <div class="vb-watch-player"></div>
      </div>`;
    root.appendChild(wrap);

    const YOUTUBE_ID_RE = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})|^([A-Za-z0-9_-]{11})$/;
    function extractId(input) {
      const trimmed = (input || "").trim();
      const match = YOUTUBE_ID_RE.exec(trimmed);
      return match ? (match[1] || match[2]) : null;
    }
    const YOUTUBE_CHANNEL_RE = /youtube\.com\/(@[\w.-]{2,100}|channel\/UC[\w-]{20,}|c\/[\w.-]{2,100}|user\/[\w.-]{2,100})/i;
    function isChannelLink(input) {
      return YOUTUBE_CHANNEL_RE.test((input || "").trim());
    }
    function playerHtml(videoId) {
      return `<iframe width="100%" height="100%" src="https://www.youtube-nocookie.com/embed/${videoId}" title="YouTube video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
    }

    // ---------------------------------------------------------------- tabs
    const tabs = wrap.querySelectorAll(".vb-tab");
    const boardPane = wrap.querySelector(".vb-board");
    const watchPane = wrap.querySelector(".vb-watch");
    tabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        tabs.forEach((b) => b.classList.toggle("primary", b === btn));
        boardPane.classList.toggle("hidden", btn.dataset.tab !== "board");
        watchPane.classList.toggle("hidden", btn.dataset.tab !== "watch");
      });
    });

    // -------------------------------------------------------- watch-any-video
    const watchUrl = wrap.querySelector(".vb-watch-url");
    const watchPlayer = wrap.querySelector(".vb-watch-player");
    wrap.querySelector(".vb-watch-btn").addEventListener("click", () => {
      const id = extractId(watchUrl.value);
      watchPlayer.innerHTML = id ? playerHtml(id) : `<p class="vb-status">That doesn't look like a YouTube link.</p>`;
    });

    // ------------------------------------------------------------- board
    let who = "everyone";
    const filterBtns = wrap.querySelectorAll(".vb-filter-btn");
    filterBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        who = btn.dataset.who;
        filterBtns.forEach((b) => b.classList.toggle("primary", b === btn));
        renderBoard();
      });
    });

    const status = wrap.querySelector(".vb-status");
    const grid = wrap.querySelector(".vb-grid");
    let feed = [];

    async function loadFeed() {
      status.textContent = "Loading…";
      grid.innerHTML = "";
      const res = await window.MimiProfiles?.getVideoFeed?.(60);
      if (!res || !res.ok) {
        status.textContent = res?.msg || "Couldn't load the board right now.";
        feed = [];
        return;
      }
      feed = res.videos;
      status.textContent = feed.length ? "" : "Nothing posted yet — be the first.";
      renderBoard();
    }

    function renderBoard() {
      const mine = window.MimiProfiles?.currentName?.();
      const shown = who === "mine" ? feed.filter((v) => v.name === mine) : feed;
      grid.innerHTML = "";
      if (who === "mine" && !mine) {
        status.textContent = "Sign in to see which ones are yours.";
        return;
      }
      status.textContent = shown.length ? "" : (who === "mine" ? "You haven't posted any yet." : "Nothing posted yet — be the first.");
      shown.forEach((v) => {
        const card = document.createElement("div");
        card.className = "vb-card";
        card.innerHTML = `
          <div class="vb-thumb-wrap">
            <img class="vb-thumb" src="https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg" alt="" loading="lazy" />
            <span class="vb-play">▶</span>
          </div>
          <div class="vb-card-body">
            <strong class="vb-card-title"></strong>
            <span class="vb-card-by">posted by ${v.name}</span>
          </div>`;
        card.querySelector(".vb-card-title").textContent = v.title; // textContent — player-submitted
        card.querySelector(".vb-thumb-wrap").addEventListener("click", () => {
          card.querySelector(".vb-thumb-wrap").outerHTML = `<div class="vb-thumb-wrap vb-playing">${playerHtml(v.videoId)}</div>`;
        });
        grid.appendChild(card);
      });
    }

    wrap.querySelector(".vb-refresh").addEventListener("click", loadFeed);

    const postUrl = wrap.querySelector(".vb-post-url");
    const postTitle = wrap.querySelector(".vb-post-title");
    const postBtn = wrap.querySelector(".vb-post-btn");
    const postHint = wrap.querySelector(".vb-post-hint");

    // One field, auto-detected: a video link posts itself; a channel link
    // posts everything that channel's own recent-uploads feed returns. The
    // title field only means anything for a single video (a channel import
    // gets each video's own real title from the feed), so it hides itself
    // for a channel link rather than sitting there unused.
    function syncPostMode() {
      const url = postUrl.value.trim();
      if (isChannelLink(url)) {
        postTitle.classList.add("hidden");
        postBtn.textContent = "Post Channel";
        postHint.textContent = "Imports that channel's ~15 most recent uploads — YouTube's own limit on this feed, not one set here.";
      } else {
        postTitle.classList.remove("hidden");
        postBtn.textContent = "Post";
        postHint.textContent = "";
      }
    }
    postUrl.addEventListener("input", syncPostMode);
    syncPostMode();

    // Auto-fills the real title via YouTube's own public oEmbed endpoint —
    // no API key needed, the same endpoint any "paste a link, see a preview"
    // feature uses. Never overwrites something already typed, and only ever
    // runs for a single-video link (a channel import supplies its own
    // per-video titles server-side, see publish-channel).
    async function autofillTitle() {
      const url = postUrl.value.trim();
      if (postTitle.value.trim() || !extractId(url) || isChannelLink(url)) return;
      try {
        const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.title && !postTitle.value.trim()) postTitle.value = data.title;
      } catch (e) { /* best-effort — the poster can still type a title by hand */ }
    }
    postUrl.addEventListener("blur", autofillTitle);
    postUrl.addEventListener("paste", () => window.setTimeout(autofillTitle, 30));

    postBtn.addEventListener("click", async () => {
      if (!window.MimiProfiles?.isSignedIn?.()) { status.textContent = "Sign in to post to the board."; return; }
      const url = postUrl.value.trim();
      if (isChannelLink(url)) {
        status.textContent = "Importing that channel's recent uploads…";
        const res = await window.MimiProfiles.publishChannel(url);
        if (res && res.ok) {
          postUrl.value = ""; postTitle.value = ""; syncPostMode();
          status.textContent = `Posted ${res.count} video${res.count === 1 ? "" : "s"} from that channel.`;
          loadFeed();
        } else {
          status.textContent = res?.msg || "Couldn't import that channel — try again.";
        }
        return;
      }
      if (!extractId(url)) { status.textContent = "That doesn't look like a YouTube link."; return; }
      status.textContent = "Posting…";
      const res = await window.MimiProfiles.publishVideo(url, postTitle.value.trim());
      if (res && res.ok) {
        postUrl.value = ""; postTitle.value = "";
        loadFeed();
      } else {
        status.textContent = res?.msg || "Couldn't post that — try again.";
      }
    });

    loadFeed();
    ctx.setStatus("Board shows what's been shared here. Watch Any Video plays anything without posting it.");

    return () => { /* no timers/listeners outlive the stage clear */ };
  },
});
