'use strict';
/**
 * 零依賴極簡渲染層建置腳本 (build-renderer.js)
 *
 * 將 src/renderer/ 下的 styles.css、template.html、main.js
 * 組合輸出至根目錄的 meter-renderer.js。
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src', 'renderer');
const targetFile = path.join(rootDir, 'meter-renderer.js');

function buildRenderer() {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const meterVersion = pkg.version || '1.0.0';

  const styles = fs.readFileSync(path.join(srcDir, 'styles.css'), 'utf8').trim();
  const template = fs.readFileSync(path.join(srcDir, 'template.html'), 'utf8').trim();
  let mainTemplate = fs.readFileSync(path.join(srcDir, 'main.js'), 'utf8');

  const versionConst = `  const METER_VERSION = '${meterVersion}';\n`;
  if (!mainTemplate.includes('const METER_VERSION =')) {
    mainTemplate = mainTemplate.replace(/\(function \(\) \{/, `(function () {\n${versionConst}`);
  }

  const domString = `  shadow.innerHTML = \`<style>\n    ${styles
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\${/g, '\\${')}\n  </style>\n\n  ${template
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\${/g, '\\${')}\`;`;

  const output = mainTemplate.replace('  /* @INSERT_STYLES_AND_TEMPLATE */', () => domString);

  fs.writeFileSync(targetFile, output, 'utf8');
  console.log(`[建置成功] 渲染層建置完成: ${targetFile} (v${meterVersion}, ${Buffer.byteLength(output, 'utf8')} 位元組)`);
}

if (require.main === module) {
  buildRenderer();
}

module.exports = { buildRenderer };
