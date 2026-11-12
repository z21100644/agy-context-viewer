'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { fileURLToPath } = require('url');
const { spawn, spawnSync } = require('child_process');
const { analyzeSteps, summarize, add, empty, measure } = require('./meter-core');

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.json', '.jsonl', '.csv', '.tsv',
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.rb', '.go', '.rs',
  '.java', '.kt', '.c', '.cc', '.cpp', '.h', '.hpp', '.cs', '.swift',
  '.html', '.htm', '.css', '.scss', '.xml', '.svg', '.yaml', '.yml',
  '.toml', '.ini', '.conf', '.env', '.sql', '.sh', '.bash', '.ps1', '.bat', '.log'
]);

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']);

let cachedPython = undefined;
function resolvePython() {
  if (cachedPython !== undefined) return cachedPython;
  const home = os.homedir();
  const candidates = [];
  if (process.env.AG_METER_PYTHON) candidates.push(process.env.AG_METER_PYTHON);
  if (process.platform === 'win32') {
    const localPrograms = path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Programs', 'Python');
    if (fs.existsSync(localPrograms)) {
      for (const dir of fs.readdirSync(localPrograms).sort().reverse()) {
        candidates.push(path.join(localPrograms, dir, 'python.exe'));
      }
    }
  }
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p) && fs.statSync(p).size > 0) {
        cachedPython = p;
        return cachedPython;
      }
    } catch {}
  }
  for (const cmd of process.platform === 'win32' ? ['python', 'python3', 'py'] : ['python3', 'python']) {
    try {
      const check = spawnSync(cmd, ['-c', 'import sys; print(sys.executable)'], {
        encoding: 'utf8',
        timeout: 2500,
        windowsHide: true
      });
      if (check.status === 0 && check.stdout.trim()) {
        cachedPython = check.stdout.trim().split(/\r?\n/)[0];
        return cachedPython;
      }
    } catch {}
  }
  cachedPython = null;
  return null;
}

const filesCache = new Map();
const conversations = new Map();
let pythonQueue = Promise.resolve();

function request(origin, method, body, token) {
  const url = method ? `${origin}/exa.language_server_pb.LanguageServerService/${method}` : `${origin}/`;
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        rejectUnauthorized: false,
        method: method ? 'POST' : 'GET',
        headers: method
          ? {
              'Content-Type': 'application/json',
              'Connect-Protocol-Version': '1',
              'x-codeium-csrf-token': token
            }
          : {}
      },
      response => {
        const chunks = [];
        let size = 0;
        response.on('data', chunk => {
          size += chunk.length;
          if (size > 96 * 1024 * 1024) {
            req.destroy(new Error('本機回應過大，掃描不完整'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (response.statusCode !== 200) {
            reject(new Error(`本機介面 HTTP ${response.statusCode}`));
          } else {
            try {
              resolve(method ? JSON.parse(text) : text);
            } catch (e) {
              reject(e);
            }
          }
        });
      }
    );
    req.setTimeout(20000, () => req.destroy(new Error('本機介面讀取逾時')));
    req.on('error', reject);
    req.end(method ? JSON.stringify(body) : undefined);
  });
}

function pythonScan(items) {
  const task = pythonQueue.then(() => runPythonScan(items));
  pythonQueue = task.catch(() => {});
  return task;
}

function runPythonScan(items) {
  return new Promise((resolve, reject) => {
    const py = resolvePython();
    if (!py) return reject(new Error('未安裝 Python，略過 Office/PDF 深度解析'));
    const source = fs.readFileSync(path.join(__dirname, 'attachment_scan.py'), 'utf8');
    const child = spawn(py, ['-I', '-c', source, '--json-lines'], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let output = '';
    let errors = '';
    let timedOut = false;
    const completed = [];
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 60000);
    child.stdout.on('data', chunk => {
      output += chunk;
      let at;
      while ((at = output.indexOf('\n')) >= 0) {
        const line = output.slice(0, at).trim();
        output = output.slice(at + 1);
        if (line) {
          try {
            completed.push(JSON.parse(line));
          } catch {}
        }
      }
    });
    child.stderr.on('data', chunk => {
      if (errors.length < 1000) errors += chunk;
    });
    child.on('error', e => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', code => {
      clearTimeout(timer);
      const reason = timedOut
        ? '掃描逾時，未完成部分不計為零'
        : code !== 0
          ? '解析失敗：' + errors.slice(0, 120)
          : '未回傳附件解析結果';
      const done = new Set(completed.map(v => v.key));
      for (const item of items) {
        if (!done.has(item.key)) {
          completed.push({ key: item.key, ...empty(), status: 'unknown', unknownParts: [reason] });
        }
      }
      resolve(completed);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(items));
  });
}

function getImageDimensions(buf) {
  try {
    // PNG
    if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    // GIF
    if (buf.length >= 10 && (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a')) {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }
    // BMP
    if (buf.length >= 26 && buf[0] === 0x42 && buf[1] === 0x4d) {
      return { width: Math.abs(buf.readInt32LE(18)), height: Math.abs(buf.readInt32LE(22)) };
    }
    // WEBP
    if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
      const chunk = buf.toString('ascii', 12, 16);
      if (chunk === 'VP8X') {
        return {
          width: 1 + buf.readUIntLE(24, 3),
          height: 1 + buf.readUIntLE(27, 3)
        };
      }
      if (chunk === 'VP8 ' && buf.length >= 30) {
        return {
          width: buf.readUInt16LE(26) & 0x3fff,
          height: buf.readUInt16LE(28) & 0x3fff
        };
      }
      if (chunk === 'VP8L' && buf.length >= 25) {
        const b0 = buf[21];
        const b1 = buf[22];
        const b2 = buf[23];
        const b3 = buf[24];
        return {
          width: 1 + (((b1 & 0x3f) << 8) | b0),
          height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))
        };
      }
    }
    // JPEG
    if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let offset = 2;
      while (offset < buf.length - 8) {
        if (buf[offset] === 0xff && [0xc0, 0xc1, 0xc2, 0xc3].includes(buf[offset + 1])) {
          return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
        }
        if (buf[offset] === 0xff) {
          const len = buf.readUInt16BE(offset + 2);
          if (len < 2) break;
          offset += 2 + len;
        } else {
          offset++;
        }
      }
    }
  } catch {}
  return { width: null, height: null };
}

function calcImageTokens(w, h) {
  if (!w || !h) return [258, 1120];
  if (w <= 384 && h <= 384) return [258, 258];
  const tiles = Math.ceil(w / 768) * Math.ceil(h / 768);
  const tok = tiles * 258;
  return [tok, Math.max(tok, w > 384 || h > 384 ? 1120 : 258)];
}

function parseLocalNativeFile(filePath, stat, mime) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeLower = String(mime || '').toLowerCase();

  if ((IMAGE_EXTENSIONS.has(ext) || mimeLower.startsWith('image/')) && stat.size <= 32 * 1024 * 1024) {
    const fd = fs.openSync(filePath, 'r');
    try {
      const headSize = Math.min(stat.size, 65536);
      const buf = Buffer.alloc(headSize);
      fs.readSync(fd, buf, 0, headSize, 0);
      const dims = getImageDimensions(buf);
      const [low, high] = calcImageTokens(dims.width, dims.height);
      return {
        status: 'parsed',
        width: dims.width,
        height: dims.height,
        chars: 0,
        dimensions: dims.width ? `${dims.width}×${dims.height}` : null,
        bytes: stat.size,
        tokens: low,
        low,
        high,
        unknownParts: []
      };
    } finally {
      fs.closeSync(fd);
    }
  }

  if (
    (TEXT_EXTENSIONS.has(ext) || mimeLower.startsWith('text/') || mimeLower === 'application/json') &&
    stat.size <= 12 * 1024 * 1024
  ) {
    const buf = fs.readFileSync(filePath);
    if (!buf.subarray(0, Math.min(buf.length, 4096)).includes(0)) {
      const text = buf.toString('utf8');
      const m = measure(text);
      return {
        status: 'parsed',
        chars: m.chars,
        bytes: stat.size,
        tokens: m.tokens,
        low: m.low,
        high: m.high,
        unknownParts: []
      };
    }
  }

  return null;
}

async function scanFiles(media) {
  const results = new Map();
  const work = [];
  for (const item of media) {
    try {
      if (item.inlineData) {
        const mime = String(item.mime || '').toLowerCase();
        const buf = Buffer.from(item.inlineData, 'base64');
        if (mime.startsWith('image/')) {
          const dims = getImageDimensions(buf);
          const [low, high] = calcImageTokens(dims.width, dims.height);
          results.set(item.uri, {
            status: 'parsed',
            width: dims.width,
            height: dims.height,
            chars: 0,
            dimensions: dims.width ? `${dims.width}×${dims.height}` : null,
            bytes: buf.length,
            tokens: low,
            low,
            high,
            unknownParts: []
          });
          continue;
        }
        if (mime.startsWith('text/') || mime === 'application/json' || mime === 'text/csv') {
          const text = buf.toString('utf8');
          const m = measure(text);
          results.set(item.uri, {
            status: 'parsed',
            chars: text.length,
            bytes: buf.length,
            tokens: m.tokens,
            low: m.low,
            high: m.high,
            unknownParts: []
          });
          continue;
        }
        const est = Math.ceil(buf.length / 4);
        results.set(item.uri, {
          status: 'parsed',
          chars: buf.length,
          bytes: buf.length,
          tokens: est,
          low: Math.ceil(est * 0.9),
          high: Math.ceil(est * 1.1),
          unknownParts: []
        });
        continue;
      }

      if (!item.uri || /^https?:/i.test(item.uri)) throw new Error('無可用本機附件');
      const targetPath = item.uri.startsWith('file:') ? fileURLToPath(item.uri) : item.uri;
      if (!fs.existsSync(targetPath)) throw new Error('附件不存在或已移除');
      const target = fs.realpathSync(targetPath);
      const stat = fs.statSync(target);
      if (!stat.isFile()) throw new Error('附件不是一般檔案');
      const cacheKey = `${target.toLowerCase()}|${stat.size}|${stat.mtimeMs}`;

      if (filesCache.has(cacheKey)) {
        results.set(item.uri, filesCache.get(cacheKey));
        continue;
      }

      const nativeParsed = parseLocalNativeFile(target, stat, item.mime);
      if (nativeParsed) {
        filesCache.set(cacheKey, nativeParsed);
        results.set(item.uri, nativeParsed);
        continue;
      }

      work.push({ key: item.uri, path: target, cacheKey });
    } catch (e) {
      results.set(item.uri, { ...empty(), status: 'unknown', unknownParts: [item.reason || e.message] });
    }
  }

  if (work.length) {
    try {
      const parsed = await pythonScan(work.map(({ key, path: p }) => ({ key, path: p })));
      for (const result of parsed) {
        const job = work.find(w => w.key === result.key);
        if (job) {
          filesCache.set(job.cacheKey, result);
          results.set(job.key, result);
        }
      }
    } catch (e) {
      for (const job of work) {
        results.set(job.key, { ...empty(), status: 'unknown', unknownParts: [e.message] });
      }
    }
  }

  return media.map(item => {
    const r = results.get(item.uri) || { ...empty(), status: 'unknown', unknownParts: ['未回傳附件統計'] };
    const tokens = r.tokens != null ? r.tokens : Math.round(((r.low || 0) + (r.high || 0)) / 2);
    return {
      ...item,
      ...r,
      tokens,
      uri: undefined,
      key: undefined
    };
  });
}

async function collect(origin, id, options = {}) {
  if (!/^https:\/\/127\.0\.0\.1:\d+$/.test(origin) || !/^[a-f\d-]{36}$/i.test(id)) {
    throw new Error('無效本機對話');
  }
  const key = `${origin}/${id}`;
  const previous = conversations.get(key);
  if (previous?.pending) return previous.pending;
  if (options.force) filesCache.clear();
  if (!options.force && previous?.result && Date.now() - previous.at < 10000) return previous.result;

  const task = (async () => {
    const html = await request(origin);
    const token = JSON.parse(html.match(/window\.__APP_CONFIG__\s*=\s*(.*?);/)[1]).csrfToken;
    const call = (method, body) => request(origin, method, body, token);

    const [full, userStatusRes] = await Promise.all([
      call('GetCascadeTrajectory', { cascadeId: id, trajectoryVerbosity: 3 }),
      call('GetUserStatus', {}).catch(() => null)
    ]);
    const cascadeModelConfigs = userStatusRes?.userStatus?.cascadeModelConfigData?.clientModelConfigs || [];

    const trajectory = full.trajectory;
    if (!trajectory) throw new Error('未取得對話歷史');
    const steps = trajectory.steps || [];
    const expected = Number(full.numTotalSteps ?? steps.length);
    while (steps.length < expected) {
      const page = await call('GetCascadeTrajectorySteps', {
        cascadeId: id,
        stepOffset: steps.length,
        trajectoryVerbosity: 3
      });
      if (!page.steps?.length) throw new Error(`歷史僅取得 ${steps.length}/${expected} 步`);
      steps.push(...page.steps);
    }

    const session = analyzeSteps(steps);
    const attachments = await scanFiles(session.media);
    const attachmentTotal = empty();
    for (const a of attachments) {
      const n = a.references || 1;
      add(
        attachmentTotal,
        Object.fromEntries(['chars', 'bytes', 'tokens', 'low', 'high'].map(k => [k, (a[k] || 0) * n]))
      );
    }
    const total = add({ ...session.total }, attachmentTotal);

    let latest = null;
    const count = Number(full.numTotalGeneratorMetadata ?? trajectory.generatorMetadata?.length ?? 0);
    const tail = await call('GetCascadeTrajectoryGeneratorMetadata', {
      cascadeId: id,
      generatorMetadataOffset: Math.max(0, count - 3),
      includeMessages: false
    });

    let latestModel = null;
    for (const m of (tail.generatorMetadata || []).slice().reverse()) {
      latest = summarize(m, { cascadeModelConfigs });
      if (latest) {
        latestModel = m.chatModel;
        break;
      }
    }

    const system = latestModel
      ? measure((latestModel.promptSections || []).map(p => p.content || '').join('\n') || latestModel.systemPrompt || '')
      : empty();
    const definitions = latestModel ? measure(JSON.stringify(latestModel.tools || [])) : empty();
    session.groups.system = system;
    session.groups.definitions = definitions;
    add(total, system);
    add(total, definitions);

    if (session.currentError) {
      const fromStep = summarize(
        { chatModel: { retryInfos: [{ error: session.currentError.text }] } },
        {
          currentModel: latest?.model || latestModel?.modelDisplayName || latestModel?.model || '',
          cascadeModelConfigs,
          previousValidContext: latest
        }
      );
      if (fromStep?.error) {
        latest = {
          ...(latest || {}),
          error: fromStep.error,
          errorClassification: fromStep.errorClassification,
          exceeded: fromStep.exceeded,
          network: fromStep.network,
          serviceLimit: fromStep.serviceLimit || latest?.serviceLimit || null,
          status: fromStep.status,
          actual: fromStep.exceeded ? null : (latest?.actual ?? null),
          percent: fromStep.exceeded ? null : (latest?.percent ?? null),
          estimated: latest?.actual == null
        };
      }
    }

    const unknownFiles = attachments.filter(a => a.status !== 'parsed').length;
    const result = {
      version: '1.0.0',
      conversation: id,
      latest,
      cascadeModelConfigs,
      session: {
        ...session,
        media: undefined,
        attachmentTotal,
        total,
        attachments,
        unknownFiles,
        complete: unknownFiles === 0
      },
      scannedAt: Date.now()
    };
    conversations.set(key, { result, at: Date.now() });
    return result;
  })();

  conversations.set(key, { ...previous, pending: task });
  try {
    return await task;
  } catch (e) {
    conversations.delete(key);
    throw e;
  }
}

module.exports = {
  collect,
  scanFiles,
  pythonScan,
  resolvePython,
  getImageDimensions,
  calcImageTokens
};
