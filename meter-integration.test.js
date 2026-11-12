'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { scanFiles, getImageDimensions } = require('./meter-collector');
const { loadAsarEngine } = require('./asar-engine');
const { install } = require('./install');
const { restore } = require('./restore');

const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');

test('scanFiles 原生即時解析本機圖片尺寸與文字檔案（無需依賴 Python）', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-meter-scan-'));
  try {
    // 建立最小合法 320x200 PNG 標頭
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

    const parsed = await scanFiles([
      { uri: pngPath, name: 'mock.png', mime: 'image/png', references: 1, source: 'user' },
      { uri: mdPath, name: 'notes.md', mime: 'text/markdown', references: 2, source: 'user' },
      { uri: path.join(tmpDir, 'missing.txt'), name: 'missing.txt', mime: 'text/plain', references: 1, source: 'user' }
    ]);

    assert.equal(parsed.length, 3);
    assert.equal(parsed[0].status, 'parsed');
    assert.equal(parsed[0].width, 320);
    assert.equal(parsed[0].height, 200);
    assert.equal(parsed[0].low, 258);

    assert.equal(parsed[1].status, 'parsed');
    assert.ok(parsed[1].chars > 10);
    assert.ok(parsed[1].low > 0);

    assert.equal(parsed[2].status, 'unknown');
    assert.ok(parsed[2].unknownParts.length > 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ASAR 封裝修補與無損還原完整性驗證（僅注入極簡核心模組）', async () => {
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
    assert.ok(!patchedPreload.includes('check-update'));
    assert.ok(!patchedPreload.includes('launch-cli'));
    assert.ok(!patchedPreload.includes('token-history'));

    const res = await restore();
    assert.equal(res.restored, targetAsar);
    assert.equal(sha(fs.readFileSync(targetAsar)), originalHash);
  } finally {
    if (prevStateEnv === undefined) delete process.env.AG_METER_STATE_DIR;
    else process.env.AG_METER_STATE_DIR = prevStateEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
