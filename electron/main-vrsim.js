// A separate, clearly-labeled build ONLY for simulating Kart Circuit's VR
// mode with mouse/keyboard when no real headset is on hand. This is NOT the
// real shipped app — same server/game code underneath, but with the
// Immersive Web Emulator (Meta's actively-maintained WebXR emulator, MIT
// licensed: https://github.com/meta-quest/immersive-web-emulation-runtime)
// bundled and force-enabled for localhost, so clicking "Enter VR" in Kart
// Circuit gets a real (simulated) XRSession instead of "not supported" —
// exercising the actual VR code, not a fake preview.
//
// vrsim-extension/ was built from that repo's source with one small patch:
// the extension normally needs a one-click "enable" via its own toolbar
// icon (which a chrome-less Electron window has nowhere to show), so the
// patch makes it force-enable itself for localhost on every launch instead
// — see the "Local patch" block appended to its service-worker source.
const { app, BrowserWindow, Menu, shell, dialog, session } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const https = require("https");
const path = require("path");

app.setName("mini_games-vrsim"); // separate userData dir — don't mix test profiles into the real app's data

const PORT_IN_USE_EXIT_CODE = 98;

app.disableHardwareAcceleration();

// A different default port than both the real packaged app (1764) and the
// dev server (1765), so this can run alongside either without conflict.
const PORT = process.env.PORT || 1766;

const APP_DIR = app.isPackaged ? path.join(process.resourcesPath, "app") : path.join(__dirname, "..");
const SERVER_SCRIPT = path.join(APP_DIR, "server.js");
const EXTENSION_DIR = path.join(__dirname, "vrsim-extension");

let serverProcess = null;
let mainWindow = null;
let windowLoaded = false;

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
      if (mainWindow && !mainWindow.isDestroyed() && code !== 0) mainWindow.close();
      return;
    }
    try {
      if (code === PORT_IN_USE_EXIT_CODE) {
        dialog.showMessageBoxSync({
          type: "error",
          title: "51 Mimi Games — VR Simulator",
          message: `Something's already using port ${PORT} — close any other copy of this and try again.`,
        });
      } else if (code !== 0 && code !== null) {
        dialog.showMessageBoxSync({
          type: "error",
          title: "51 Mimi Games — VR Simulator",
          message: `The app couldn't start (exit code ${code}).`,
        });
      }
    } catch (dialogErr) {
      console.error("dialog.showMessageBoxSync threw:", dialogErr);
    }
    app.quit();
  });
}

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
      label: "51 Mimi Games — VR Simulator",
      submenu: [
        { role: "toggleFullScreen" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { label: "Dev", submenu: [{ role: "reload" }, { role: "toggleDevTools" }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  buildMenu();

  // Loaded into the DEFAULT session before the window is created, so its
  // content scripts are already registered by the time Kart Circuit's page
  // loads. See the "Local patch" note at the top of this file for why no
  // manual enable step is needed here.
  try {
    const ext = await session.defaultSession.loadExtension(EXTENSION_DIR, { allowFileAccess: true });
    console.log(`Loaded WebXR emulator extension: ${ext.name} v${ext.version}`);
  } catch (err) {
    console.error("Failed to load the WebXR emulator extension — Enter VR will report 'not supported':", err);
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#0a0f1a",
    autoHideMenuBar: true,
    webPreferences: {
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const url = await waitForServer();
  if (url.startsWith("https:")) {
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
  // Straight into Kart Circuit — the one thing this special build exists to test.
  await mainWindow.loadURL(url + "games/mario-kart/index.html");
  windowLoaded = true;
}

app.whenReady().then(async () => {
  startServer();
  try {
    await createWindow();
  } catch (err) {
    if (serverProcess) {
      dialog.showMessageBoxSync({
        type: "error",
        title: "51 Mimi Games — VR Simulator",
        message: "The app's background server didn't respond in time. Try running it again.",
      });
    }
    console.error("Failed to start VR simulator build:", err);
    app.quit();
  }

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
