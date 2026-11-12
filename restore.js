'use strict';
process.noAsar = true;
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { getStateDir } = require('./asar-engine');

const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function tryHotDispose() {
  try {
    const appData = process.env.APPDATA || (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config'));
    const portFile = path.join(appData, 'Antigravity', 'DevToolsActivePort');
    if (!fs.existsSync(portFile)) return false;
    const port = Number(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]);
    if (!port) return false;
    const pages = await new Promise((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${port}/json/list`, res => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
      });
      req.setTimeout(2500, () => req.destroy(new Error('timeout')));
      req.on('error', reject);
    });
    const targets = pages.filter(p => p.type === 'page' && /^https:\/\/127\.0\.0\.1:\d+\//.test(p.url));
    for (const target of targets) {
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve, { once: true });
        ws.addEventListener('error', reject, { once: true });
      });
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'window.__AGContextMeter?.dispose()' } }));
      await new Promise(r => setTimeout(r, 100));
      ws.close();
    }
    return targets.length > 0;
  } catch {
    return false;
  }
}

async function restore(options = {}) {
  const customPathIdx = process.argv.indexOf('--path');
  const customPath = options.path || (customPathIdx >= 0 ? process.argv[customPathIdx + 1] : null);
  const stateManifest = path.join(getStateDir(), 'installation.json');
  const localManifest = path.join(__dirname, 'installation.json');
  const manifestPath = fs.existsSync(stateManifest) ? stateManifest : localManifest;
  if (!fs.existsSync(manifestPath)) {
    throw new Error('installation.json not found; nothing to restore.');
  }
  const info = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const previous = process.argv.includes('--previous') || Boolean(options.previous);
  // 智能选择最干净的原版备份：优先 pre-meter，其次 backup
  let backup = previous ? info.previousInstalledBackup : (info.previousInstalledBackup && fs.existsSync(info.previousInstalledBackup) && sha(info.previousInstalledBackup) === info.previousInstalledSha256 ? info.previousInstalledBackup : info.backup);
  let expected = (backup === info.previousInstalledBackup) ? info.previousInstalledSha256 : info.originalSha256;
  if (!backup || !fs.existsSync(backup) || sha(backup) !== expected) {
    if (info.backup && fs.existsSync(info.backup) && sha(info.backup) === info.originalSha256) {
      backup = info.backup;
      expected = info.originalSha256;
    } else {
      throw new Error('Backup checksum mismatch; refusing restore');
    }
  }
  if (!info.installed || !fs.existsSync(info.installed)) {
    throw new Error(`Target file not found: ${info.installed}`);
  }

  const currentInstalledSha = sha(info.installed);
  // 1. 当前文件已经等于目标备份时，幂等返回
  if (currentInstalledSha === expected) {
    await tryHotDispose();
    return { restored: info.installed, fromBackup: backup, alreadyRestored: true };
  }

  // 2. 目前檔案必須符合本次安裝紀錄的 patchedSha256，否則拒絕覆蓋以保護宿主
  if (currentInstalledSha !== info.patchedSha256) {
    throw new Error(`目標檔案 (${info.installed}) 驗證失敗：檔案內容已被宿主升級、第三方修補或其他操作改變（目前雜湊: ${currentInstalledSha.slice(0, 12)}...，預期修補雜湊: ${info.patchedSha256 ? info.patchedSha256.slice(0, 12) : 'null'}...），拒絕覆蓋還原以保護宿主檔案。`);
  }

  // 3. 目前檔案符合本次修補雜湊且備份驗證已通過，執行還原
  try {
    fs.copyFileSync(backup, info.installed);
  } catch (err) {
    if (err.code === 'EBUSY' || err.code === 'EPERM') {
      throw new Error(`無法還原目標檔案 (${info.installed})：檔案正被執行中的 Antigravity 鎖定。請先完全結束 Antigravity 用戶端後再執行！`);
    }
    throw err;
  }

  if (sha(info.installed) !== expected) {
    throw new Error('Restored file checksum mismatch');
  }

  await tryHotDispose();
  return { restored: info.installed, fromBackup: backup };
}

if (require.main === module) {
  restore()
    .then(() => console.log('Restored the exact pre-meter archive. Fully restart Antigravity for the change to take effect.'))
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = { restore, tryHotDispose };
