#!/usr/bin/env node
'use strict';
process.noAsar = true;

/**
 * Antigravity Context Meter CLI
 * Cross-platform installer, live CDP hot-injector, and lifecycle manager
 * Format aligned with antigravity-chinese for one-command human & AI Agent execution.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { loadAsarEngine, getStateDir } = require('./asar-engine');
const { install, findAsarPath, tryHotInject } = require('./install');
const { restore } = require('./restore');
const { resolvePython } = require('./meter-collector');

const asar = loadAsarEngine();
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

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

async function cmdCheck(customPath) {
  console.log('🔍 [Antigravity 對話上下文檢視器] 正在執行環境預檢...');
  console.log(`  - Node.js 執行環境: ${process.version} (${process.execPath})`);
  try {
    const asarPath = findAsarPath(customPath);
    const version = JSON.parse(asar.extractFile(asarPath, 'package.json').toString('utf8')).version;
    console.log(`  - Antigravity 路徑: ${asarPath} (v${version})`);
  } catch (e) {
    console.error(`  ❌ Antigravity 路徑偵測失敗: ${e.message}`);
    process.exitCode = 1;
    return;
  }
  const py = resolvePython();
  console.log(`  - Python 附件深度解析器: ${py || '未偵測到（基礎上下文統計不受影響）'}`);
  const live = await queryLiveWindow();
  console.log(`  - 執行中視窗 CDP 狀態: ${live.running ? `已連線 (連接埠 ${live.cdpPort})` : '用戶端未執行或未開啟除錯連接埠'}`);
  console.log('✅ 環境預檢通過！');
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = (args.find(a => !a.startsWith('-')) || 'install').toLowerCase();
  const pathIdx = args.indexOf('--path');
  const customPath = pathIdx >= 0 ? args[pathIdx + 1] : null;

  if (cmd === 'install') {
    console.log('🚀 [Antigravity 對話上下文檢視器] 正在安裝上下文視覺化元件...');
    await ensureLiveBridgeIfNeeded();
    const manifest = await install({ path: customPath });
    await tryHotInject();
    console.log(`✅ ASAR 持久化注入完成: ${manifest.installed} (Antigravity v${manifest.version}, 驗證 ${manifest.originalFilesVerified} 個原始檔案)`);
    console.log(`✅ 執行中視窗熱掛載狀態: ${manifest.liveInjected ? '已即時生效（無需重啟）' : '將於下次啟動 Antigravity 時自動生效'}`);
  } else if (cmd === 'live') {
    await ensureLiveBridgeIfNeeded();
    const ok = await tryHotInject();
    if (!ok) throw new Error('未偵測到執行中的 Antigravity 主視窗，請先開啟 Antigravity 或使用 node cli.js install。');
    console.log('✅ 已透過 CDP 熱注入目前執行的 Antigravity 視窗！');
  } else if (cmd === 'restore' || cmd === 'uninstall') {
    const res = await restore();
    console.log(`✅ 已無損還原官方封裝檔: ${res.restored}`);
  } else if (cmd === 'status') {
    await cmdStatus(customPath);
  } else if (cmd === 'check') {
    await cmdCheck(customPath);
  } else {
    console.log(`用法:
  node cli.js install [--path <app.asar>]   一鍵持久化安裝並熱注入目前執行視窗
  node cli.js live                          免改磁碟 CDP 熱掛載至目前執行視窗
  node cli.js status                        查看安裝狀態與目前對話即時上下文用量
  node cli.js check                         執行前置環境健康檢查
  node cli.js restore                       一鍵無損解除安裝並還原備份`);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ 執行失敗:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { cmdStatus, cmdCheck };
