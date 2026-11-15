'use strict';
const fs = require('fs');
const path = require('path');
const { ipcMain, app } = require('electron');
const { collect, readUiPrefs, writeUiPrefs } = require('./meter-collector');

function getMeterSource() {
  try {
    const prefsCode = `globalThis.__AGContextMeterPrefs = ${JSON.stringify(readUiPrefs())};`;
    const coreCode = fs.readFileSync(path.join(__dirname, 'meter-core.js'), 'utf8');
    const rendererCode = fs.readFileSync(path.join(__dirname, 'meter-renderer.js'), 'utf8');
    return `${prefsCode}\n${coreCode}\n${rendererCode}\ntrue;`;
  } catch {
    return '';
  }
}

function isLocalMainFrameSender(event) {
  try {
    const rawUrl = event?.senderFrame?.url || event?.sender?.getURL?.() || '';
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' || url.hostname !== '127.0.0.1') return null;
    if (event.senderFrame && event.sender?.mainFrame && event.senderFrame !== event.sender.mainFrame) return null;
    return url;
  } catch {
    return null;
  }
}

function resolveTargetWindow(sender) {
  try {
    const { BrowserWindow } = require('electron');
    const direct = BrowserWindow.fromWebContents(sender);
    if (direct && !direct.isDestroyed()) return direct;
  } catch {}
  try {
    const utils = require('./utils');
    if (typeof utils.resolveHubWindowFromWebContents === 'function') {
      const hubWin = utils.resolveHubWindowFromWebContents(sender);
      if (hubWin && !hubWin.isDestroyed?.()) return hubWin;
    }
  } catch {}
  return null;
}

let registered = false;
const boundWindows = new WeakSet();
const boundWebContents = new WeakSet();
const injectionTimers = new WeakMap();

const { detectEnvLocale, normalizeLocale } = require('./meter-core');

function mainWinError(lang) {
  const l = normalizeLocale(lang || detectEnvLocale('en'), 'en');
  if (l === 'zh-CN') return '仅允许本地主窗口调用';
  if (l === 'zh-TW') return '僅允許本機主視窗呼叫';
  return 'Only local main window calls are allowed';
}

function registerIpcOnce() {
  if (registered) return;
  registered = true;

  ipcMain.handle('context-meter:scan', async (event, id, force, lang) => {
    const url = isLocalMainFrameSender(event);
    if (!url) throw new Error(mainWinError(lang));
    try {
      return { ok: true, data: await collect(url.origin, id, { force: force === true, lang }) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('context-meter:save-prefs', async (event, patch) => {
    if (!isLocalMainFrameSender(event)) throw new Error(mainWinError());
    try {
      return { ok: true, prefs: writeUiPrefs(patch) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('context-meter:sync-overlay', async (event, options) => {
    try {
      const targetWin = resolveTargetWindow(event.sender);
      if (!targetWin || targetWin.isDestroyed?.()) return { ok: false };
      if (process.platform === 'win32') {
        try {
          if (typeof targetWin.setMenuBarVisibility === 'function') targetWin.setMenuBarVisibility(false);
          targetWin.autoHideMenuBar = true;
        } catch {}
      }
      if (typeof targetWin.setTitleBarOverlay !== 'function') return { ok: true };
      const patch = {};
      if (options && typeof options.color === 'string') patch.color = options.color;
      if (options && typeof options.symbolColor === 'string') patch.symbolColor = options.symbolColor;
      const rawHeight = options?.height ?? options?.heightCssPx;
      if (options && Number.isFinite(Number(rawHeight)) && Number(rawHeight) >= 24 && Number.isFinite(Number(rawHeight)) && Number(rawHeight) <= 64) {
        patch.height = Math.round(Number(rawHeight));
      }
      targetWin.setTitleBarOverlay(patch);
      return { ok: true, patch };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

function syncWindowOverlayHeight(win) {
  try {
    if (!win || process.platform === 'darwin' || win.isDestroyed?.() || typeof win.setTitleBarOverlay !== 'function') return;
    const zf = typeof win.webContents?.getZoomFactor === 'function' ? win.webContents.getZoomFactor() : 1;
    const targetH = Math.max(28, Math.min(60, Math.round(40 * (Number.isFinite(zf) && zf > 0 ? zf : 1))));
    win.setTitleBarOverlay({ height: targetH });
  } catch {}
}

async function ensureMeterInjected(win, options = {}) {
  try {
    if (!win || win.isDestroyed?.()) return false;
    const wc = win.webContents;
    if (!wc || wc.isDestroyed?.()) return false;
    const url = wc.getURL?.() || '';
    if (!/^https:\/\/127\.0\.0\.1:\d+\//.test(url)) {
      const attempt = Number(options.attempt || 0);
      const delays = [300, 600, 1000, 1800];
      if (attempt < delays.length && !win.isDestroyed?.()) {
        const prevTimer = injectionTimers.get(win);
        if (prevTimer) clearTimeout(prevTimer);
        const t = setTimeout(() => {
          injectionTimers.delete(win);
          void ensureMeterInjected(win, { ...options, attempt: attempt + 1 });
        }, delays[attempt]);
        injectionTimers.set(win, t);
      }
      return false;
    }

    syncWindowOverlayHeight(win);

    if (!options.force) {
      try {
        const alive = await wc.executeJavaScript(
          'Boolean(window.__AGContextMeter && document.getElementById("ag-context-meter") && (window.__AGContextMeter.ensureAlive ? window.__AGContextMeter.ensureAlive() : true))'
        );
        if (alive === true) return true;
      } catch {}
    }

    const runtimeSource = getMeterSource();
    if (!runtimeSource) return false;
    await wc.executeJavaScript(runtimeSource);
    return true;
  } catch (error) {
    const attempt = Number(options.attempt || 0);
    const delays = [350, 1200];
    if (attempt < delays.length && win && !win.isDestroyed?.()) {
      const prevTimer = injectionTimers.get(win);
      if (prevTimer) clearTimeout(prevTimer);
      const t = setTimeout(() => {
        injectionTimers.delete(win);
        void ensureMeterInjected(win, { ...options, attempt: attempt + 1 });
      }, delays[attempt]);
      injectionTimers.set(win, t);
    }
    return false;
  }
}

exports.ensureMeterInjected = ensureMeterInjected;

exports.installContextMeter = function (win) {
  registerIpcOnce();
  if (!win || win.isDestroyed?.()) return;

  if (!boundWindows.has(win)) {
    boundWindows.add(win);
    if (process.platform === 'win32') {
      try {
        if (typeof win.setMenuBarVisibility === 'function') win.setMenuBarVisibility(false);
        win.autoHideMenuBar = true;
      } catch {}
    }
    const onWinVisibleOrActive = () => {
      void ensureMeterInjected(win, { force: false });
    };
    win.on?.('show', onWinVisibleOrActive);
    win.on?.('restore', onWinVisibleOrActive);
    win.on?.('focus', onWinVisibleOrActive);
  }

  const wc = win.webContents;
  if (wc && !boundWebContents.has(wc)) {
    boundWebContents.add(wc);
    wc.on('did-finish-load', () => void ensureMeterInjected(win, { force: true }));
    wc.on('dom-ready', () => void ensureMeterInjected(win, { force: false }));
    wc.on('did-navigate', () => void ensureMeterInjected(win, { force: false }));
    wc.on('did-navigate-in-page', () => void ensureMeterInjected(win, { force: false }));
    wc.on('zoom-changed', () => syncWindowOverlayHeight(win));
  }
};

try {
  if (app && typeof app.on === 'function') {
    app.on('browser-window-created', (_event, win) => {
      try {
        exports.installContextMeter(win);
        void ensureMeterInjected(win, { force: false });
      } catch {}
    });
    app.on('activate', () => {
      try {
        const { BrowserWindow } = require('electron');
        for (const w of BrowserWindow.getAllWindows?.() || []) {
          exports.installContextMeter(w);
          void ensureMeterInjected(w, { force: false });
        }
      } catch {}
    });
  }
} catch {}
