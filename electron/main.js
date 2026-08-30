const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn } = require("child_process");
const http = require("http");
const https = require("https");
const path = require("path");
const fs = require("fs");

// Matches server.js's own PORT_IN_USE_EXIT_CODE — kept as a plain literal
// here rather than shared/imported since the child runs as a wholly separate
// process (spawned, not required) and a one-line constant isn't worth a
// cross-file dependency.
const PORT_IN_USE_EXIT_CODE = 98;

/* Hardware acceleration — on.
 *
 * This was previously disabled unconditionally, on the strength of a GPU-process
 * failure ("GPU state invalid after WaitForGetOffsetInRange") seen on the Linux
 * box this project is developed on. Two things were wrong with that. The comment
 * claimed the app does "no 3D graphics", which stopped being true the moment
 * Kart Circuit, Block Realm and Rival Arena existed — all three are WebGL. And
 * the failure was a dev-machine driver problem that was being shipped to every
 * Windows and macOS user, where the GPU works fine.
 *
 * The cost of getting this wrong is not subtle: software-rendered WebGL is
 * roughly two orders of magnitude slower than a GPU, which is exactly the
 * "everything lags" symptom. Turning it on is the single largest performance
 * change available to this app.
 *
 * Safety net below: if the GPU process really does fall over, the app restarts
 * itself once in software mode and remembers, so a bad driver degrades instead
 * of breaking. Set MIMI_SOFTWARE_RENDER=1 to force that from the start.
 */
const SOFTWARE_FLAG = "use-software-render";
function softwareRenderRequested() {
  if (process.env.MIMI_SOFTWARE_RENDER === "1") return true;
  try {
    return fs.existsSync(path.join(app.getPath("userData"), SOFTWARE_FLAG));
  } catch (e) {
    return false;
  }
}

if (softwareRenderRequested()) {
  app.disableHardwareAcceleration();
} else {
  // Chromium blocklists a lot of perfectly capable drivers, and a blocklisted
  // GPU silently means software WebGL — the thing being fixed here.
  app.commandLine.appendSwitch("ignore-gpu-blocklist");
  app.commandLine.appendSwitch("enable-gpu-rasterization");
  app.commandLine.appendSwitch("enable-zero-copy");
}

/* If the GPU process dies, fall back rather than limp along or crash: record
 * the flag and relaunch once. The next start is software-rendered and stays
 * that way until the file is deleted. */
app.on("child-process-gone", (_event, details) => {
  if (details.type !== "GPU" || softwareRenderRequested()) return;
  try {
    fs.writeFileSync(path.join(app.getPath("userData"), SOFTWARE_FLAG), String(Date.now()));
  } catch (e) {
    return; // can't record it, so don't loop on a relaunch that won't stick
  }
  app.relaunch();
  app.exit(0);
});

/* Keep a portable build's data off the system drive.
 *
 * By default Electron saves to app.getPath("userData"), which on Windows is
 * C:\Users\<you>\AppData\Roaming — and that is where Chromium's localStorage
 * lives, so it holds the actual valuable things: profiles, keys, saved worlds,
 * every game's progress. Fine for an installed app, wrong for a portable one:
 * you copy the .exe to a D: drive or a USB stick expecting it to be
 * self-contained, and it quietly keeps writing to C: anyway.
 *
 * electron-builder's portable target sets PORTABLE_EXECUTABLE_DIR to the folder
 * the .exe was launched from, so when that's present everything is redirected
 * to a folder beside it. MIMI_DATA_DIR (below, for the server's own data/) is
 * derived from userData, so it follows automatically.
 *
 * Must run before the app is ready, hence its position up here.
 *
 * One honest caveat this cannot fix: the portable .exe is a self-extracting
 * archive, so Windows unpacks it to %TEMP% on launch. Nothing is *kept* there,
 * but if even that is unwanted, the .zip build extracts wherever you put it and
 * never touches TEMP at all.
 */
const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
if (portableDir) {
  app.setPath("userData", path.join(portableDir, "MimiGamesData"));
}

const PORT = process.env.PORT || 1764;

// Set by the extra Start Menu shortcuts (see electron/build/installer.nsh)
// so "Calculator (51 Mimi Games)" etc. jump straight into that tool instead
// of landing on the search-home screen like the main shortcut does.
function getLaunchAppId() {
  const arg = process.argv.find((a) => a.startsWith("--app="));
  return arg ? arg.slice("--app=".length) : null;
}
// Packaged builds never bundle certs/ (see build.files in package.json), so
// server.js's own hasCert check always falls back to plain HTTP there. Dev
// mode runs against the real repo checkout, which still has its certs/
// directory, so the server actually comes up as HTTPS there instead — check
// both rather than assume one, so this works unmodified in either case.

// In a packaged build, the hub's files live under resources/app (see the
// "extraResources" entry in package.json's build config); in dev, it's just
// the real repo checkout one directory up from this file.
const APP_DIR = app.isPackaged ? path.join(process.resourcesPath, "app") : path.join(__dirname, "..");
const SERVER_SCRIPT = path.join(APP_DIR, "server.js");

let serverProcess = null;
let mainWindow = null;
// Set once the window has actually loaded real content — distinguishes "the
// server crashed before we ever got going" (show a real dialog, this is the
// only sign of trouble the user will ever see) from "the server died after
// a normal session was already running" (less alarming, just close).
let windowLoaded = false;

// Runs server.js with Electron's own bundled Node (ELECTRON_RUN_AS_NODE makes
// the electron binary behave as a plain Node interpreter for this one child
// process) — no separate Node.js install needed on the user's machine.
// MIMI_DATA_DIR points profile storage at a real writable per-OS app-data
// directory instead of next to server.js, which is typically read-only once
// installed. No certs/ directory is bundled (see build.files in
// package.json), so server.js's own existing hasCert fallback serves plain
// HTTP automatically — the checked-in dev cert is only valid for one
// developer's own LAN IPs and would just show a broken/untrusted warning for
// anyone else. http://localhost is still a secure context in Chromium, so
// WebAuthn/passkeys and camera/mic keep working.
function startServer() {
  serverProcess = spawn(process.execPath, [SERVER_SCRIPT], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(PORT),
      MIMI_DATA_DIR: app.getPath("userData"),
    },
    stdio: "inherit",
  });
  serverProcess.on("exit", (code) => {
    serverProcess = null;
    if (windowLoaded) {
      // died mid-session rather than at startup — don't leave a stuck blank
      // window behind, but this isn't the "silent instant close" failure
      // mode, so no extra dialog needed
      if (mainWindow && !mainWindow.isDestroyed() && code !== 0) mainWindow.close();
      return;
    }
    // never got as far as loading anything — this IS the failure mode that
    // used to be a silent flash-then-gone with no explanation at all
    // (confirmed live: a taken port crashed the child instantly, and
    // without this, the app just vanished with nothing shown for it).
    // showMessageBoxSync, not showErrorBox — showErrorBox doesn't actually
    // block (confirmed live: no dialog window was ever visible, even
    // briefly, before app.quit() tore everything down right after it).
    // Sync genuinely waits for the user to dismiss it before this continues.
    try {
      if (code === PORT_IN_USE_EXIT_CODE) {
        dialog.showMessageBoxSync({
          type: "error",
          title: "51 Mimi Games",
          message: `Something's already using port ${PORT} — maybe another copy of this app is already running? Close it and try again.`,
        });
      } else if (code !== 0 && code !== null) {
        dialog.showMessageBoxSync({
          type: "error",
          title: "51 Mimi Games",
          message: `The app couldn't start (exit code ${code}). Try running it again — if this keeps happening, that code is worth mentioning if you ask for help.`,
        });
      }
    } catch (dialogErr) {
      console.error("dialog.showMessageBoxSync threw:", dialogErr);
    }
    app.quit();
  });
}

// Resolves with the real URL to load once the server answers on either
// protocol — whichever one server.js actually decided to use. Probed via
// 127.0.0.1 (fast, no DNS ambiguity) but resolves with the "localhost"
// equivalent: WebAuthn's rpID must be a real domain, and browsers flatly
// reject a literal IP address ("This is an invalid domain.", confirmed
// live) — "localhost" is explicitly spec-allowed and is this same machine
// either way, so passkeys only work end to end if that's what gets loaded.
function waitForServer(deadline = Date.now() + 15000) {
  const httpUrl = `http://127.0.0.1:${PORT}/`;
  const httpsUrl = `https://127.0.0.1:${PORT}/`;
  return new Promise((resolve, reject) => {
    const tryOnce = (url, client, options) =>
      new Promise((res) => {
        const req = client.get(url, options, (response) => {
          response.destroy();
          res(url);
        });
        req.on("error", () => res(null));
      });

    const attempt = async () => {
      const httpResult = await tryOnce(httpUrl, http);
      if (httpResult) { resolve(httpResult.replace("127.0.0.1", "localhost")); return; }
      // self-signed dev cert — this is our own bundled server, not a
      // third-party site, so skipping validation here is appropriate
      const httpsResult = await tryOnce(httpsUrl, https, { rejectUnauthorized: false });
      if (httpsResult) { resolve(httpsResult.replace("127.0.0.1", "localhost")); return; }

      if (Date.now() > deadline) {
        reject(new Error("Server did not start in time"));
        return;
      }
      setTimeout(attempt, 150);
    };
    attempt();
  });
}

function buildMenu() {
  const template = [
    {
      label: "51 Mimi Games",
      submenu: [
        { role: "toggleFullScreen" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
  ];
  if (!app.isPackaged) {
    template.push({ label: "Dev", submenu: [{ role: "reload" }, { role: "toggleDevTools" }] });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  buildMenu();
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#0a0f1a",
    autoHideMenuBar: true,
    webPreferences: {
      sandbox: true,
    },
  });

  // any link that would open a new browser window/tab (e.g. the private
  // page viewer's target=_blank fallback) should open in the user's real
  // default browser, not spawn another app window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const url = await waitForServer();
  if (url.startsWith("https:")) {
    // dev-mode only (packaged builds never bundle certs/, so they're always
    // plain HTTP) — the checked-in dev cert is self-signed for this
    // developer's own LAN IPs, so Chromium would otherwise show a hard
    // certificate-error interstitial instead of the app. Matched by host:port
    // rather than a literal "https://" prefix — the multiplayer relay's own
    // wss:// connection hits this same event and needs the same bypass, or
    // its handshake just fails silently in a retry loop.
    const ourHost = `localhost:${PORT}`;
    app.on("certificate-error", (event, webContents, requestUrl, error, certificate, callback) => {
      if (webContents === mainWindow?.webContents && requestUrl.includes(ourHost)) {
        event.preventDefault();
        callback(true);
        return;
      }
      callback(false);
    });
  }
  const launchAppId = getLaunchAppId();
  const targetUrl = launchAppId ? `${url}?app=${encodeURIComponent(launchAppId)}` : url;
  await mainWindow.loadURL(targetUrl);
  windowLoaded = true;
}

// The update feed (see package.json's build.publish) is a real public GitHub
// Releases endpoint with a normally-trusted cert, so no TLS bypass is needed
// here (unlike the old self-signed-cert dev-machine feed this replaced).
function checkForUpdates() {
  if (!app.isPackaged) return; // no installed app to update, and no app-update.yml bundled in dev anyway
  autoUpdater.checkForUpdates();
}

autoUpdater.on("error", (err) => {
  // The common case here is simply "the dev machine hosting the update feed
  // isn't reachable right now" — must never interrupt normal play with a
  // dialog for that. Logged only.
  console.error("Auto-update check failed:", err?.message || err);
});

autoUpdater.on("update-downloaded", (info) => {
  // Async, not Sync — never force a restart on someone who might be
  // mid-game. Declining just means the update applies the next time the
  // app quits normally on its own (electron-updater's default behavior for
  // an already-downloaded update).
  dialog.showMessageBox({
    type: "info",
    title: "51 Mimi Games",
    message: `A new version (${info.version}) is ready.`,
    detail: "Restart now to update, or keep playing — it'll update next time you quit.",
    buttons: ["Restart & Update", "Later"],
    defaultId: 0,
    cancelId: 1,
  }).then((result) => {
    if (result.response !== 0) return;
    // Not autoUpdater.quitAndInstall(): electron-updater always re-launches
    // the nsis-web bootstrapper with a --package-file=<cached 7z> argument
    // to skip re-downloading, but that flag hits a real bug in this
    // electron-builder version's NSIS template — the installer exits after
    // ~20s having silently done nothing (confirmed live, repeatedly: no
    // window, no files written, and it had already deleted the OLD install
    // first, leaving neither version installed). A plain launch of the same
    // installer with no extra arguments — the exact form verified live to
    // install and launch correctly — re-downloads the small (~1.5MB)
    // bootstrapper's payload itself, which costs a few seconds but actually
    // works.
    const installerPath = info.downloadedFile;
    if (installerPath) {
      spawn(installerPath, [], { detached: true, stdio: "ignore" }).unref();
    }
    app.quit();
  });
});

app.whenReady().then(async () => {
  startServer();
  try {
    await createWindow();
  } catch (err) {
    // a genuine timeout (server never answered, but never exited/crashed
    // either) — distinct from the crash path above, which already shows its
    // own dialog and quits well before this 15s deadline would ever be
    // reached, hence the serverProcess guard: don't double-dialog the same
    // failure two different ways
    if (serverProcess) {
      dialog.showMessageBoxSync({
        type: "error",
        title: "51 Mimi Games",
        message: "The app's background server didn't respond in time. Try running it again.",
      });
    }
    console.error("Failed to start 51 Mimi Games:", err);
    app.quit();
  }

  // Delayed, not on startup — never let an update check slow down or block
  // getting the actual window on screen.
  setTimeout(checkForUpdates, 10000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
