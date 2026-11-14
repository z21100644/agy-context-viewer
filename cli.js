#!/usr/bin/env node
'use strict';
process.noAsar = true;

/**
 * Antigravity Context Meter CLI
 * Cross-platform installer, live CDP hot-injector, and lifecycle manager
 * Supports multi-language output: English (en), Simplified Chinese (zh-CN), Traditional Chinese (zh-TW).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { loadAsarEngine, getStateDir } = require('./asar-engine');
const { install, findAsarPath, tryHotInject } = require('./install');
const { restore } = require('./restore');
const { resolvePython } = require('./meter-collector');
const { normalizeLocale, detectEnvLocale } = require('./meter-core');

const asar = loadAsarEngine();

const CLI_I18N = {
  en: {
    checkHeader: '🔍 [Antigravity Context Viewer] Running environment preflight check...',
    checkNode: (ver, exec) => `  - Node.js runtime: ${ver} (${exec})`,
    checkAsarOk: (p, ver) => `  - Antigravity path: ${p} (v${ver})`,
    checkAsarFail: msg => `  ❌ Failed to detect Antigravity path: ${msg}`,
    checkPyNone: 'not detected (optional; core context stats unaffected)',
    checkPy: py => `  - Python deep attachment parser: ${py}`,
    checkCdpOk: port => `connected (port ${port})`,
    checkCdpIdle: 'client not running or debug port closed',
    checkCdp: state => `  - Live window CDP status: ${state}`,
    checkDone: '✅ Environment check passed!',
    installStart: '🚀 [Antigravity Context Viewer] Installing context monitor...',
    installAsarDone: (p, ver, count) =>
      `✅ ASAR persistent patch complete: ${p} (Antigravity v${ver}, verified ${count} original files)`,
    installLiveNow: 'active immediately (no restart needed)',
    installLiveNext: 'will take effect on next Antigravity launch',
    installLiveStatus: state => `✅ Live window hot-mount status: ${state}`,
    liveNoWindow:
      'No running Antigravity main window detected. Please launch Antigravity first or run `node cli.js install`.',
    liveDone: '✅ Hot-injected into the running Antigravity window via CDP!',
    restoreDone: p => `✅ Losslessly restored official archive: ${p}`,
    execFailed: '❌ Execution failed:',
    usage: `Usage:
  node cli.js install [--path <app.asar>] [--lang <en|zh-CN|zh-TW>]  Persistently install & hot-inject into active window
  node cli.js live [--lang <en|zh-CN|zh-TW>]                         Diskless CDP hot-mount into active window
  node cli.js status [--path <app.asar>]                             Inspect install state & live conversation usage (JSON)
  node cli.js check [--path <app.asar>] [--lang <en|zh-CN|zh-TW>]    Run environment preflight check
  node cli.js restore [--lang <en|zh-CN|zh-TW>]                      Losslessly uninstall & restore verified backup`
  },
  'zh-CN': {
    checkHeader: '🔍 [Antigravity 对话上下文查看器] 正在执行环境预检...',
    checkNode: (ver, exec) => `  - Node.js 运行环境: ${ver} (${exec})`,
    checkAsarOk: (p, ver) => `  - Antigravity 路径: ${p} (v${ver})`,
    checkAsarFail: msg => `  ❌ Antigravity 路径检测失败: ${msg}`,
    checkPyNone: '未检测到（基础上下文统计不受影响）',
    checkPy: py => `  - Python 附件深度解析器: ${py}`,
    checkCdpOk: port => `已连接 (端口 ${port})`,
    checkCdpIdle: '客户端未运行或未开启调试端口',
    checkCdp: state => `  - 运行中窗口 CDP 状态: ${state}`,
    checkDone: '✅ 环境预检通过！',
    installStart: '🚀 [Antigravity 对话上下文查看器] 正在安装上下文可视化组件...',
    installAsarDone: (p, ver, count) =>
      `✅ ASAR 持久化注入完成: ${p} (Antigravity v${ver}, 校验 ${count} 个原始文件)`,
    installLiveNow: '已即时生效（无需重启）',
    installLiveNext: '将于下次启动 Antigravity 时自动生效',
    installLiveStatus: state => `✅ 运行中窗口热挂载状态: ${state}`,
    liveNoWindow: '未检测到运行中的 Antigravity 主窗口，请先打开 Antigravity 或使用 node cli.js install。',
    liveDone: '✅ 已通过 CDP 热注入当前运行的 Antigravity 窗口！',
    restoreDone: p => `✅ 已无损还原官方封装包: ${p}`,
    execFailed: '❌ 执行失败:',
    usage: `用法:
  node cli.js install [--path <app.asar>] [--lang <en|zh-CN|zh-TW>]  一键持久化安装并热注入当前运行窗口
  node cli.js live [--lang <en|zh-CN|zh-TW>]                         免改磁盘 CDP 热挂载至当前运行窗口
  node cli.js status [--path <app.asar>]                             查看安装状态与当前对话实时上下文用量 (JSON)
  node cli.js check [--path <app.asar>] [--lang <en|zh-CN|zh-TW>]    执行前置环境健康检查
  node cli.js restore [--lang <en|zh-CN|zh-TW>]                      一键无损卸载并还原备份`
  },
  'zh-TW': {
    checkHeader: '🔍 [Antigravity 對話上下文檢視器] 正在執行環境預檢...',
    checkNode: (ver, exec) => `  - Node.js 執行環境: ${ver} (${exec})`,
    checkAsarOk: (p, ver) => `  - Antigravity 路徑: ${p} (v${ver})`,
    checkAsarFail: msg => `  ❌ Antigravity 路徑偵測失敗: ${msg}`,
    checkPyNone: '未偵測到（基礎上下文統計不受影響）',
    checkPy: py => `  - Python 附件深度解析器: ${py}`,
    checkCdpOk: port => `已連線 (連接埠 ${port})`,
    checkCdpIdle: '用戶端未執行或未開啟除錯連接埠',
    checkCdp: state => `  - 執行中視窗 CDP 狀態: ${state}`,
    checkDone: '✅ 環境預檢通過！',
    installStart: '🚀 [Antigravity 對話上下文檢視器] 正在安裝上下文視覺化元件...',
    installAsarDone: (p, ver, count) =>
      `✅ ASAR 持久化注入完成: ${p} (Antigravity v${ver}, 驗證 ${count} 個原始檔案)`,
    installLiveNow: '已即時生效（無需重啟）',
    installLiveNext: '將於下次啟動 Antigravity 時自動生效',
    installLiveStatus: state => `✅ 執行中視窗熱掛載狀態: ${state}`,
    liveNoWindow: '未偵測到執行中的 Antigravity 主視窗，請先開啟 Antigravity 或使用 node cli.js install。',
    liveDone: '✅ 已透過 CDP 熱注入目前執行的 Antigravity 視窗！',
    restoreDone: p => `✅ 已無損還原官方封裝檔: ${p}`,
    execFailed: '❌ 執行失敗:',
    usage: `用法:
  node cli.js install [--path <app.asar>] [--lang <en|zh-CN|zh-TW>]  一鍵持久化安裝並熱注入目前執行視窗
  node cli.js live [--lang <en|zh-CN|zh-TW>]                         免改磁碟 CDP 熱掛載至目前執行視窗
  node cli.js status [--path <app.asar>]                             查看安裝狀態與目前對話即時上下文用量 (JSON)
  node cli.js check [--path <app.asar>] [--lang <en|zh-CN|zh-TW>]    執行前置環境健康檢查
  node cli.js restore [--lang <en|zh-CN|zh-TW>]                      一鍵無損解除安裝並還原備份`
  }
};

function parseFlagValue(args, flagName) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flagName) return args[i + 1] || null;
    if (args[i].startsWith(`${flagName}=`)) return args[i].slice(flagName.length + 1) || null;
  }
  return null;
}

function resolveCliLocale(explicitLang) {
  if (explicitLang) return normalizeLocale(explicitLang, 'en');
  return detectEnvLocale('en');
}

function getCliDict(explicitLang) {
  const lang = resolveCliLocale(explicitLang);
  return { lang, t: CLI_I18N[lang] || CLI_I18N.en };
}

function getDevToolsPort() {
  const appData = process.env.APPDATA || (process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support')
    : path.join(os.homedir(), '.config'));
  const portFile = path.join(appData, 'Antigravity', 'DevToolsActivePort');
  if (!fs.existsSync(portFile)) return null;
  const port = Number(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]);
  return Number.isFinite(port) && port > 0 ? port : null;
}

async function queryLiveWindow() {
  const port = getDevToolsPort();
  if (!port) return { running: false };
  try {
    const pages = await new Promise((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${port}/json/list`, res => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
      });
      req.setTimeout(2500, () => req.destroy(new Error('timeout')));
      req.on('error', reject);
    });
    const target = pages.find(p => p.type === 'page' && /^https:\/\/127\.0\.0\.1:\d+\//.test(p.url));
    if (!target) return { running: true, cdpPort: port, pageFound: false };
    const origin = new URL(target.url).origin;

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    const status = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 4000);
      ws.addEventListener('message', ev => {
        const d = JSON.parse(ev.data);
        if (d.id === 1) {
          clearTimeout(timer);
          resolve(d.result?.result?.value || null);
        }
      });
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: `(() => {
            const s = window.__AGContextMeter?.snapshot();
            const root = document.getElementById('ag-context-meter')?.shadowRoot;
            return {
              active: Boolean(window.__AGContextMeter),
              version: window.__AGContextMeter?.version || null,
              language: window.__AGContextMeter?.language?.() || null,
              hasIpcBridge: Boolean(window.contextMeterAPI?.scan),
              badgeText: root?.getElementById('badge-pct-val')?.textContent || null,
              route: s?.route || null,
              latest: s?.latest || null
            };
          })()`,
          returnByValue: true
        }
      }));
    });
    ws.close();
    return { running: true, cdpPort: port, pageFound: true, origin, ...status };
  } catch (e) {
    return { running: false, error: e.message };
  }
}

async function ensureLiveBridgeIfNeeded() {
  const live = await queryLiveWindow();
  if (!live.running || !live.pageFound || live.hasIpcBridge) return;
  const stateDir = getStateDir();
  const statePath = path.join(stateDir, '.live-session.json');
  const legacyPath = path.join(__dirname, '.live-session.json');
  const liveSessionPath = fs.existsSync(statePath) ? statePath : legacyPath;

  let alive = false;
  let existingInfo = null;
  if (fs.existsSync(liveSessionPath)) {
    try {
      const info = JSON.parse(fs.readFileSync(liveSessionPath, 'utf8'));
      existingInfo = info;
      process.kill(info.pid, 0);
      if (!live.origin || info.origin === live.origin) {
        alive = true;
      }
    } catch {}
  }
  if (!alive) {
    if (existingInfo?.pid) {
      try { process.kill(existingInfo.pid); } catch {}
    }
    try { if (fs.existsSync(statePath)) fs.unlinkSync(statePath); } catch {}
    try { if (fs.existsSync(legacyPath)) fs.unlinkSync(legacyPath); } catch {}

    const child = spawn(process.execPath, [path.join(__dirname, 'live-host.js')], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();

    const maxWaitMs = 5000;
    const intervalMs = 150;
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, intervalMs));
      const checkPath = fs.existsSync(statePath) ? statePath : (fs.existsSync(legacyPath) ? legacyPath : null);
      if (checkPath) {
        try {
          const info = JSON.parse(fs.readFileSync(checkPath, 'utf8'));
          if (info && info.pid && (!live.origin || info.origin === live.origin)) {
            process.kill(info.pid, 0);
            alive = true;
            break;
          }
        } catch {}
      }
    }
  }
}

async function cmdStatus(customPath) {
  let asarPath = null;
  let version = null;
  let asarPatched = false;
  try {
    asarPath = findAsarPath(customPath);
    version = JSON.parse(asar.extractFile(asarPath, 'package.json').toString('utf8')).version;
    const utilsSource = asar.extractFile(asarPath, 'dist/utils.js').toString('utf8');
    asarPatched = utilsSource.includes('installContextMeter(win)');
  } catch {}

  const live = await queryLiveWindow();
  const py = resolvePython();
  const report = {
    asarPath,
    antigravityVersion: version,
    asarPatched,
    liveWindow: live,
    pythonAttachmentScanner: py || 'unavailable (optional)'
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

async function cmdCheck(customPath, explicitLang) {
  const { t } = getCliDict(explicitLang);
  console.log(t.checkHeader);
  console.log(t.checkNode(process.version, process.execPath));
  try {
    const asarPath = findAsarPath(customPath);
    const version = JSON.parse(asar.extractFile(asarPath, 'package.json').toString('utf8')).version;
    console.log(t.checkAsarOk(asarPath, version));
  } catch (e) {
    console.error(t.checkAsarFail(e.message));
    process.exitCode = 1;
    return;
  }
  const py = resolvePython();
  console.log(t.checkPy(py || t.checkPyNone));
  const live = await queryLiveWindow();
  console.log(t.checkCdp(live.running ? t.checkCdpOk(live.cdpPort) : t.checkCdpIdle));
  console.log(t.checkDone);
}

function findPositionalCommand(args) {
  const flagsWithValues = new Set(['--path', '--lang']);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (flagsWithValues.has(a)) {
      i++;
      continue;
    }
    if (a.startsWith('-')) continue;
    return a.toLowerCase();
  }
  return 'install';
}

async function main() {
  const args = process.argv.slice(2);
  const customPath = parseFlagValue(args, '--path');
  const langArg = parseFlagValue(args, '--lang');
  const { lang, t } = getCliDict(langArg);
  process.env.AG_METER_LANG = lang;

  const cmd = args.includes('--help') || args.includes('-h') ? 'help' : findPositionalCommand(args);

  if (cmd === 'install') {
    console.log(t.installStart);
    await ensureLiveBridgeIfNeeded();
    const manifest = await install({ path: customPath, lang });
    await tryHotInject();
    console.log(t.installAsarDone(manifest.installed, manifest.version, manifest.originalFilesVerified));
    console.log(t.installLiveStatus(manifest.liveInjected ? t.installLiveNow : t.installLiveNext));
  } else if (cmd === 'live') {
    await ensureLiveBridgeIfNeeded();
    const ok = await tryHotInject();
    if (!ok) throw new Error(t.liveNoWindow);
    console.log(t.liveDone);
  } else if (cmd === 'restore' || cmd === 'uninstall') {
    const res = await restore({ lang });
    console.log(t.restoreDone(res.restored));
  } else if (cmd === 'status') {
    await cmdStatus(customPath);
  } else if (cmd === 'check') {
    await cmdCheck(customPath, lang);
  } else {
    console.log(t.usage);
  }
}

if (require.main === module) {
  const langArg = parseFlagValue(process.argv.slice(2), '--lang');
  const { t } = getCliDict(langArg);
  main().catch(error => {
    console.error(t.execFailed, error.message);
    process.exitCode = 1;
  });
}

module.exports = { cmdStatus, cmdCheck, resolveCliLocale };
