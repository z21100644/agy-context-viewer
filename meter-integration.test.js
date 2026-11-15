'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { scanFiles, getImageDimensions, readUiPrefs, writeUiPrefs, sanitizeUiPrefs } = require('./meter-collector');
const { loadAsarEngine } = require('./asar-engine');
const { install } = require('./install');
const { restore } = require('./restore');
const { resolveCliLocale } = require('./cli');

const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');

test('scanFiles natively parses local image dimensions and text files without Python', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-meter-scan-'));
  try {
    const pngBuf = Buffer.alloc(32);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(pngBuf, 0);
    pngBuf.writeUInt32BE(13, 8);
    pngBuf.write('IHDR', 12, 'ascii');
    pngBuf.writeUInt32BE(320, 16);
    pngBuf.writeUInt32BE(200, 20);
    const pngPath = path.join(tmpDir, 'mock.png');
    fs.writeFileSync(pngPath, pngBuf);

    const dims = getImageDimensions(pngBuf);
    assert.deepEqual(dims, { width: 320, height: 200 });

    const mdPath = path.join(tmpDir, 'notes.md');
    fs.writeFileSync(mdPath, '# 測試筆記\n這是一份本機 Markdown 附件內容。', 'utf8');

    const parsed = await scanFiles(
      [
        { uri: pngPath, name: 'mock.png', mime: 'image/png', references: 1, source: 'user' },
        { uri: mdPath, name: 'notes.md', mime: 'text/markdown', references: 2, source: 'user' },
        { uri: path.join(tmpDir, 'missing.txt'), name: 'missing.txt', mime: 'text/plain', references: 1, source: 'user' }
      ],
      'zh-TW'
    );

    assert.equal(parsed.length, 3);
    assert.equal(parsed[0].status, 'parsed');
    assert.equal(parsed[0].width, 320);
    assert.equal(parsed[0].height, 200);
    assert.equal(parsed[0].low, 258);

    assert.equal(parsed[1].status, 'parsed');
    assert.ok(parsed[1].chars > 10);
    assert.ok(parsed[1].low > 0);

    assert.equal(parsed[2].status, 'unknown');
    assert.ok(parsed[2].unknownParts[0].includes('附件不存在'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ASAR patch & lossless restore integrity verification (minimal core modules only)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-meter-asar-'));
  const prevStateEnv = process.env.AG_METER_STATE_DIR;
  process.env.AG_METER_STATE_DIR = path.join(tmpDir, 'state');

  try {
    const asar = loadAsarEngine();
    const srcApp = path.join(tmpDir, 'mock-app');
    fs.mkdirSync(path.join(srcApp, 'dist'), { recursive: true });
    fs.writeFileSync(
      path.join(srcApp, 'package.json'),
      JSON.stringify({ name: 'antigravity', version: '2.31.2' }, null, 2)
    );
    fs.writeFileSync(
      path.join(srcApp, 'dist', 'utils.js'),
      `"use strict";\nfunction createWindow(url, storageManager, options) {\n    const win = { titleBarStyle: 'hidden' };\n    void win.loadURL(url);\n    return win;\n}\n`
    );
    fs.writeFileSync(
      path.join(srcApp, 'dist', 'preload.js'),
      `"use strict";\nconst electron_1 = require("electron");\n`
    );
    fs.writeFileSync(path.join(srcApp, 'dist', 'untouched.js'), 'module.exports = 42;\n');

    const targetAsar = path.join(tmpDir, 'app.asar');
    await asar.createPackageWithOptions(srcApp, targetAsar, {});
    const originalHash = sha(fs.readFileSync(targetAsar));

    const manifest = await install({ path: targetAsar });
    assert.equal(manifest.version, '2.31.2');
    assert.deepEqual(manifest.added, [
      'dist/meter-main.js',
      'dist/meter-core.js',
      'dist/meter-renderer.js',
      'dist/meter-collector.js',
      'dist/local-api.js',
      'dist/attachment_scan.py'
    ]);

    const patchedPreload = asar.extractFile(targetAsar, 'dist/preload.js').toString('utf8');
    assert.ok(patchedPreload.includes('context-meter:scan'));
    assert.ok(patchedPreload.includes('context-meter:save-prefs'));
    assert.ok(!patchedPreload.includes('check-update'));
    assert.ok(!patchedPreload.includes('launch-cli'));
    assert.ok(!patchedPreload.includes('token-history'));

    assert.deepEqual(readUiPrefs(), {});
    assert.deepEqual(
      writeUiPrefs({ langMode: 'zh-TW', themeMode: 'dark', ignoredKey: 'evil', drawerOpen: 'bad' }),
      { langMode: 'zh-TW', themeMode: 'dark' }
    );
    assert.deepEqual(writeUiPrefs({ drawerOpen: true }), {
      langMode: 'zh-TW',
      themeMode: 'dark',
      drawerOpen: true
    });
    assert.deepEqual(readUiPrefs(), { langMode: 'zh-TW', themeMode: 'dark', drawerOpen: true });
    assert.deepEqual(sanitizeUiPrefs(['not-an-object']), {});

    const res = await restore();
    assert.equal(res.restored, targetAsar);
    assert.equal(sha(fs.readFileSync(targetAsar)), originalHash);
  } finally {
    if (prevStateEnv === undefined) delete process.env.AG_METER_STATE_DIR;
    else process.env.AG_METER_STATE_DIR = prevStateEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('CLI multi-language output supports --lang en / zh-CN / zh-TW', () => {
  assert.equal(resolveCliLocale('en'), 'en');
  assert.equal(resolveCliLocale('zh-CN'), 'zh-CN');
  assert.equal(resolveCliLocale('zh-TW'), 'zh-TW');

  const cliPath = path.join(__dirname, 'cli.js');
  const helpEn = execFileSync(process.execPath, [cliPath, 'help', '--lang', 'en'], { encoding: 'utf8' });
  assert.ok(helpEn.includes('Usage:'));

  const helpCn = execFileSync(process.execPath, [cliPath, 'help', '--lang', 'zh-CN'], { encoding: 'utf8' });
  assert.ok(helpCn.includes('一键持久化安装'));

  const helpTw = execFileSync(process.execPath, [cliPath, 'help', '--lang', 'zh-TW'], { encoding: 'utf8' });
  assert.ok(helpTw.includes('一鍵持久化安裝'));
});

test('Windows batch launchers preserve CRLF, avoid UTF-8 byte-offset corruption, and invoke cli.js', () => {
  for (const scriptName of ['install.bat', 'uninstall.bat']) {
    const scriptPath = path.join(__dirname, scriptName);
    const raw = fs.readFileSync(scriptPath);
    assert.notEqual(raw[0], 0xef, `${scriptName} must not start with UTF-8 BOM`);
    assert.equal(raw.filter(b => b > 127).length, 0, `${scriptName} must stay pure ASCII for cmd.exe seek safety`);
    const text = raw.toString('utf8');
    const lfCount = (text.match(/\n/g) || []).length;
    const crlfCount = (text.match(/\r\n/g) || []).length;
    assert.ok(lfCount > 0);
    assert.equal(crlfCount, lfCount, `${scriptName} must use CRLF line endings`);

    if (process.platform === 'win32') {
      const out = execFileSync(
        process.env.ComSpec || 'cmd.exe',
        ['/d', '/s', '/c', `""${scriptPath}" --help --lang zh-TW < nul"`],
        { encoding: 'utf8', windowsVerbatimArguments: true }
      );
      assert.ok(out.includes('一鍵持久化安裝'), `${scriptName} failed to invoke cli.js under cmd.exe`);
    }
  }
});
