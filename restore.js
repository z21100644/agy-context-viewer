'use strict';
process.noAsar = true;
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { getStateDir } = require('./asar-engine');
const { normalizeLocale, detectEnvLocale } = require('./meter-core');

const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const RESTORE_I18N = {
  en: {
    noManifest: 'installation.json not found; nothing to restore.',
    backupMismatch: 'Backup checksum mismatch; refusing restore.',
    targetMissing: p => `Target file not found: ${p}`,
    hashChanged: (p, cur, exp) =>
      `Verification failed for (${p}): file has been modified by an update or external tool (current: ${cur}..., expected: ${exp}...). Refusing to overwrite.`,
    locked: p =>
      `Cannot restore target file (${p}): locked by a running Antigravity process. Please close Antigravity completely and retry.`,
    restoredMismatch: 'Restored file checksum mismatch.',
    cliDone: 'Restored the exact pre-meter archive. Restart Antigravity for the change to take effect.'
  },
  'zh-CN': {
    noManifest: '未找到安装记录 (installation.json)，无需还原。',
    backupMismatch: '备份文件哈希校验不匹配，拒绝还原。',
    targetMissing: p => `未找到目标文件: ${p}`,
    hashChanged: (p, cur, exp) =>
      `目标文件 (${p}) 校验失败：文件内容已被客户端升级或其他操作改变（当前哈希: ${cur}...，预期修补哈希: ${exp}...），拒绝覆盖还原以保护宿主文件。`,
    locked: p =>
      `无法还原目标文件 (${p})：文件正被运行中的 Antigravity 锁定。请先完全退出 Antigravity 客户端后再试！`,
    restoredMismatch: '还原后文件哈希校验不匹配。',
    cliDone: '已无损还原安装前的原始封装包。完全重启 Antigravity 后生效。'
  },
  'zh-TW': {
    noManifest: '找不到安裝紀錄 (installation.json)，無需還原。',
    backupMismatch: '備份檔案雜湊校驗不符，拒絕還原。',
    targetMissing: p => `找不到目標檔案: ${p}`,
    hashChanged: (p, cur, exp) =>
      `目標檔案 (${p}) 驗證失敗：檔案內容已被宿主升級、第三方修補或其他操作改變（目前雜湊: ${cur}...，預期修補雜湊: ${exp}...），拒絕覆蓋還原以保護宿主檔案。`,
    locked: p =>
      `無法還原目標檔案 (${p})：檔案正被執行中的 Antigravity 鎖定。請先完全結束 Antigravity 用戶端後再執行！`,
    restoredMismatch: '還原後檔案雜湊校驗不符。',
    cliDone: '已無損還原安裝前備份的官方封裝檔。完全重啟 Antigravity 後生效。'
  }
};

function getRestoreDict(lang) {
  const l = normalizeLocale(lang || detectEnvLocale('en'), 'en');
  return RESTORE_I18N[l] || RESTORE_I18N.en;
}

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
  const t = getRestoreDict(options.lang);
  const stateManifest = path.join(getStateDir(), 'installation.json');
  const localManifest = path.join(__dirname, 'installation.json');
  const manifestPath = fs.existsSync(stateManifest) ? stateManifest : localManifest;
  if (!fs.existsSync(manifestPath)) {
    throw new Error(t.noManifest);
  }
  const info = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const previous = process.argv.includes('--previous') || Boolean(options.previous);
  let backup = previous
    ? info.previousInstalledBackup
    : info.previousInstalledBackup &&
        fs.existsSync(info.previousInstalledBackup) &&
        sha(info.previousInstalledBackup) === info.previousInstalledSha256
      ? info.previousInstalledBackup
      : info.backup;
  let expected = backup === info.previousInstalledBackup ? info.previousInstalledSha256 : info.originalSha256;
  if (!backup || !fs.existsSync(backup) || sha(backup) !== expected) {
    if (info.backup && fs.existsSync(info.backup) && sha(info.backup) === info.originalSha256) {
      backup = info.backup;
      expected = info.originalSha256;
    } else {
      throw new Error(t.backupMismatch);
    }
  }
  if (!info.installed || !fs.existsSync(info.installed)) {
    throw new Error(t.targetMissing(info.installed));
  }

  const currentInstalledSha = sha(info.installed);
  if (currentInstalledSha === expected) {
    await tryHotDispose();
    return { restored: info.installed, fromBackup: backup, alreadyRestored: true };
  }

  if (currentInstalledSha !== info.patchedSha256) {
    throw new Error(
      t.hashChanged(
        info.installed,
        currentInstalledSha.slice(0, 12),
        info.patchedSha256 ? info.patchedSha256.slice(0, 12) : 'null'
      )
    );
  }

  try {
    fs.copyFileSync(backup, info.installed);
  } catch (err) {
    if (err.code === 'EBUSY' || err.code === 'EPERM') {
      throw new Error(t.locked(info.installed));
    }
    throw err;
  }

  if (sha(info.installed) !== expected) {
    throw new Error(t.restoredMismatch);
  }

  await tryHotDispose();
  return { restored: info.installed, fromBackup: backup };
}

if (require.main === module) {
  const t = getRestoreDict();
  restore()
    .then(() => console.log(t.cliDone))
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = { restore, tryHotDispose };
