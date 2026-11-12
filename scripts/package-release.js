#!/usr/bin/env node
'use strict';

/**
 * 零外部依賴跨平台發佈打包腳本 (Pure Node.js PKZIP Builder)
 * 自動重新編譯 meter-renderer.js，並產出各平台執行包、完整可攜包與 SHA-256 校驗檔。
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { buildRenderer } = require('./build-renderer');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist', 'release');

const COMMON_FILES = [
  'cli.js',
  'install.js',
  'restore.js',
  'live-host.js',
  'local-api.js',
  'meter-main.js',
  'meter-core.js',
  'meter-renderer.js',
  'meter-collector.js',
  'attachment_scan.py',
  'asar-engine.js',
  'package.json',
  'README.md',
  'AGENTS.md',
  'LICENSE'
];

const DEV_SOURCE_FILES = [
  'src/renderer/template.html',
  'src/renderer/styles.css',
  'src/renderer/main.js',
  'scripts/build-renderer.js',
  'scripts/package-release.js',
  'meter-core.test.js',
  'meter-renderer.test.js',
  'meter-integration.test.js'
];

const PLATFORMS = [
  { name: 'windows_amd64', scripts: ['install.bat', 'uninstall.bat'] },
  { name: 'windows_arm64', scripts: ['install.bat', 'uninstall.bat'] },
  { name: 'darwin_amd64', scripts: ['install.sh', 'uninstall.sh'] },
  { name: 'darwin_arm64', scripts: ['install.sh', 'uninstall.sh'] },
  { name: 'linux_amd64', scripts: ['install.sh', 'uninstall.sh'] },
  { name: 'linux_arm64', scripts: ['install.sh', 'uninstall.sh'] }
];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0;
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  return { dosDate, dosTime };
}

function normalizeFileBuffer(relPath, rawBuf) {
  if (relPath.endsWith('.sh')) {
    const lf = rawBuf.toString('utf8').replace(/\r\n/g, '\n');
    return { data: Buffer.from(lf, 'utf8'), mode: 0o100755 };
  }
  if (relPath.endsWith('.bat')) {
    const crlf = rawBuf.toString('utf8').replace(/\r?\n/g, '\r\n');
    return { data: Buffer.from(crlf, 'utf8'), mode: 0o100644 };
  }
  return { data: rawBuf, mode: 0o100644 };
}

function writeZipArchive(zipPath, entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosDate, dosTime } = getDosDateTime();

  for (const entry of entries) {
    const arcName = entry.arcName.replace(/\\/g, '/');
    const nameBuf = Buffer.from(arcName, 'utf8');
    const uncompressed = entry.data;
    const compressed = zlib.deflateRawSync(uncompressed, { level: 9 });
    const crc = crc32(uncompressed);
    const flags = 0x0800; // UTF-8 filename flag
    const method = 8; // DEFLATE

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(flags, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(uncompressed.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE((3 << 8) | 20, 4); // Unix attrs + 2.0
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(flags, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(uncompressed.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(((entry.mode || 0o100644) << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  fs.writeFileSync(zipPath, Buffer.concat([...localParts, centralBuf, eocd]));
}

function sha256File(filepath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filepath)).digest('hex');
}

function collectEntries(relFiles, prefix = '') {
  const entries = [];
  for (const rel of relFiles) {
    const srcPath = path.join(ROOT_DIR, rel);
    if (!fs.existsSync(srcPath)) {
      throw new Error(`找不到打包所需檔案: ${rel}`);
    }
    const { data, mode } = normalizeFileBuffer(rel, fs.readFileSync(srcPath));
    entries.push({
      arcName: prefix ? `${prefix}/${rel}` : rel,
      data,
      mode
    });
  }
  return entries;
}

function buildReleases() {
  buildRenderer();
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  const version = pkg.version || '1.0.0';

  fs.mkdirSync(DIST_DIR, { recursive: true });
  for (const name of fs.readdirSync(DIST_DIR)) {
    if (name.endsWith('.zip') || name === 'checksums.txt') {
      fs.unlinkSync(path.join(DIST_DIR, name));
    }
  }

  console.log(`[打包] 正在建置 Antigravity Context Viewer v${version} 發佈套件...`);
  const createdPackages = [];

  for (const plat of PLATFORMS) {
    const zipFilename = `antigravity-context-viewer_${version}_${plat.name}.zip`;
    const zipPath = path.join(DIST_DIR, zipFilename);
    const entries = collectEntries([...COMMON_FILES, ...plat.scripts]);
    writeZipArchive(zipPath, entries);
    const sizeKb = (fs.statSync(zipPath).size / 1024).toFixed(1);
    console.log(`  + ${zipFilename} (${sizeKb} KB)`);
    createdPackages.push(zipPath);
  }

  const portableFiles = [
    ...COMMON_FILES,
    'install.bat',
    'uninstall.bat',
    'install.sh',
    'uninstall.sh',
    ...DEV_SOURCE_FILES
  ];
  const portableZipName = `antigravity-context-viewer_${version}_zh-TW_portable.zip`;
  const portableZipPath = path.join(DIST_DIR, portableZipName);
  writeZipArchive(portableZipPath, collectEntries(portableFiles, 'antigravity-context-viewer'));
  const portableSizeKb = (fs.statSync(portableZipPath).size / 1024).toFixed(1);
  console.log(`  + ${portableZipName} (${portableSizeKb} KB)`);
  createdPackages.push(portableZipPath);

  const checksumLines = createdPackages.map(p => `${sha256File(p)}  ${path.basename(p)}`);
  const checksumPath = path.join(DIST_DIR, 'checksums.txt');
  fs.writeFileSync(checksumPath, checksumLines.join('\n') + '\n', 'utf8');
  console.log(`  + checksums.txt (${checksumLines.length} 筆 SHA-256 校驗碼)`);
  console.log(`[完成] 所有插件發佈包已輸出至: ${DIST_DIR}`);

  return { distDir: DIST_DIR, portableZipPath, createdPackages };
}

if (require.main === module) {
  buildReleases();
}

module.exports = { buildReleases };
