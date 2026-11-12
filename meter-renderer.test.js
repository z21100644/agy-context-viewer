'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { buildRenderer } = require('./scripts/build-renderer');

buildRenderer();
const coreSource = fs.readFileSync(path.join(__dirname, 'meter-core.js'), 'utf8');
const rendererSource = fs.readFileSync(path.join(__dirname, 'meter-renderer.js'), 'utf8');

function createHarness(options = {}) {
  const listeners = new Map();
  const winListeners = new Map();
  const storage = new Map();

  function makeNode(tag = 'div', id = '') {
    const attrs = new Map();
    const classes = new Set();
    const nodeListeners = new Map();
    const children = [];
    const style = {
      width: '',
      height: '',
      top: '',
      left: '',
      right: '',
      flexGrow: '0',
      cssText: '',
      setProperty(k, v) { this[k] = String(v); },
      removeProperty(k) { delete this[k]; }
    };

    const node = {
      tagName: tag.toUpperCase(),
      id,
      hidden: false,
      disabled: false,
      textContent: '',
      title: '',
      style,
      parentElement: null,
      children,
      get firstChild() { return children[0] || null; },
      get firstElementChild() { return children[0] || null; },
      get lastElementChild() { return children[children.length - 1] || null; },
      get isConnected() { return Boolean(this.parentElement); },
      classList: {
        add(...cs) { cs.forEach(c => classes.add(c)); },
        remove(...cs) { cs.forEach(c => classes.delete(c)); },
        contains(c) { return classes.has(c); }
      },
      get className() { return [...classes].join(' '); },
      set className(v) {
        classes.clear();
        String(v || '').split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
      },
      setAttribute(k, v) {
        attrs.set(k, String(v));
        if (k === 'id') this.id = String(v);
        if (k === 'class') this.className = String(v);
        if (k === 'hidden') this.hidden = true;
      },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      removeAttribute(k) {
        attrs.delete(k);
        if (k === 'hidden') this.hidden = false;
      },
      appendChild(child) {
        if (child.parentElement) {
          const idx = child.parentElement.children.indexOf(child);
          if (idx >= 0) child.parentElement.children.splice(idx, 1);
        }
        child.parentElement = this;
        children.push(child);
        return child;
      },
      insertBefore(child, ref) {
        if (child.parentElement) {
          const idx = child.parentElement.children.indexOf(child);
          if (idx >= 0) child.parentElement.children.splice(idx, 1);
        }
        child.parentElement = this;
        const at = children.indexOf(ref);
        if (at >= 0) children.splice(at, 0, child);
        else children.push(child);
        return child;
      },
      replaceChildren(...next) {
        for (const c of children) c.parentElement = null;
        children.length = 0;
        next.forEach(n => this.appendChild(n));
      },
      remove() {
        if (!this.parentElement) return;
        const idx = this.parentElement.children.indexOf(this);
        if (idx >= 0) this.parentElement.children.splice(idx, 1);
        this.parentElement = null;
      },
      addEventListener(type, fn) {
        if (!nodeListeners.has(type)) nodeListeners.set(type, []);
        nodeListeners.get(type).push(fn);
      },
      removeEventListener(type, fn) {
        const list = nodeListeners.get(type) || [];
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      },
      click() {
        for (const fn of nodeListeners.get('click') || []) fn({ target: this, preventDefault() {} });
      },
      getBoundingClientRect() {
        return { left: 900, right: 980, top: 8, bottom: 32, width: 80, height: 24 };
      },
      attachShadow() {
        const shadowElements = new Map();
        const shadow = {
          _innerHTML: '',
          get innerHTML() { return this._innerHTML; },
          set innerHTML(html) {
            this._innerHTML = html;
            shadowElements.clear();
            const tagRe = /<([a-zA-Z0-9-]+)([^>]*)>/g;
            let m;
            while ((m = tagRe.exec(html)) !== null) {
              const attrsStr = m[2] || '';
              const idMatch = attrsStr.match(/\bid="([^"]+)"/);
              if (idMatch) {
                const elem = makeNode(m[1], idMatch[1]);
                if (/\bhidden\b/.test(attrsStr)) elem.hidden = true;
                const clsMatch = attrsStr.match(/\bclass="([^"]+)"/);
                if (clsMatch) elem.className = clsMatch[1];
                shadowElements.set(idMatch[1], elem);
              }
            }
          },
          getElementById(targetId) {
            return shadowElements.get(targetId) || null;
          }
        };
        this.shadowRoot = shadow;
        return shadow;
      }
    };
    return node;
  }

  const head = makeNode('head');
  const body = makeNode('body');
  const docEl = makeNode('html');
  if (options.lightTheme) body.classList.add('vscode-light');

  const byId = new Map();
  const document = {
    hidden: false,
    head,
    body,
    documentElement: docEl,
    createElement(tag) {
      const n = makeNode(tag);
      return n;
    },
    getElementById(id) {
      for (const c of [...body.children, ...head.children]) {
        if (c.id === id) return c;
      }
      return byId.get(id) || null;
    },
    querySelector() { return null; },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const arr = listeners.get(type) || [];
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    }
  };

  const location = {
    protocol: 'https:',
    hostname: '127.0.0.1',
    pathname: options.pathname || '/'
  };

  const fetchMock = async () => ({
    ok: true,
    json: async () => ({
      generatorMetadata: options.generatorMetadata || []
    })
  });

  const scanResult = options.scanResult || {
    ok: true,
    data: {
      version: '1.0.0',
      conversation: '11111111-2222-3333-4444-555555555555',
      scannedAt: Date.now(),
      latest: null,
      session: {
        steps: 12,
        userMessages: 4,
        assistantMessages: 4,
        unknownFiles: 0,
        complete: true,
        total: { chars: 18000, bytes: 24000, low: 5200, high: 7800 },
        attachmentTotal: { chars: 0, bytes: 4096, low: 258, high: 258 },
        groups: {
          system: { low: 2000, high: 2800 },
          definitions: { low: 1000, high: 1500 },
          tools: { low: 800, high: 1200 },
          assistant: { low: 600, high: 900 },
          thinking: { low: 300, high: 500 },
          user: { low: 242, high: 642 },
          summaries: { low: 0, high: 0 }
        },
        attachments: [
          {
            name: 'diagram.png',
            status: 'parsed',
            width: 320,
            height: 240,
            low: 258,
            high: 258,
            references: 1,
            source: 'user',
            unknownParts: []
          }
        ]
      }
    }
  };

  let scanCalls = 0;
  const windowObj = {
    innerWidth: 1280,
    innerHeight: 800,
    outerWidth: 1280,
    location,
    document,
    __APP_CONFIG__: { csrfToken: 'test-csrf' },
    contextMeterAPI: {
      scan: async () => {
        scanCalls++;
        return scanResult;
      },
      syncOverlay: async () => ({ ok: true })
    },
    localStorage: {
      getItem: k => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v))
    },
    getComputedStyle: () => ({
      getPropertyValue: () => '',
      backgroundColor: options.lightTheme ? '#ffffff' : '#181818',
      paddingRight: '0px'
    }),
    matchMedia: () => ({ matches: Boolean(options.lightTheme) }),
    addEventListener(type, fn) {
      if (!winListeners.has(type)) winListeners.set(type, []);
      winListeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const arr = winListeners.get(type) || [];
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    }
  };

  const sandbox = {
    window: windowObj,
    document,
    location,
    navigator: { platform: 'Win32' },
    localStorage: windowObj.localStorage,
    fetch: fetchMock,
    AbortController,
    URL,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    console
  };
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(coreSource, sandbox);
  vm.runInContext(rendererSource, sandbox);

  const flush = () => new Promise(r => setTimeout(r, 35));
  const host = body.children.find(c => c.id === 'ag-context-meter');
  const el = id => host.shadowRoot.getElementById(id);

  return {
    sandbox,
    host,
    el,
    flush,
    getScanCalls: () => scanCalls,
    dispose: () => sandbox.__AGContextMeter.dispose()
  };
}

test('首頁閒置狀態：單一膠囊簡潔顯示且隱藏速率佔位符', async () => {
  const h = createHarness({ pathname: '/' });
  try {
    await h.flush();
    assert.equal(h.el('badge-pct-val').textContent, '—');
    assert.equal(h.el('badge-speed-wrap').hidden, true);
    assert.equal(h.el('badge-speed-sep').hidden, true);
    assert.equal(h.el('panel').hidden, true);
  } finally {
    h.dispose();
  }
});

test('對話頁渲染：精確呈現容量百分比、快取拆分、生成速率與可折疊構成明細', async () => {
  const convId = '11111111-2222-3333-4444-555555555555';
  const h = createHarness({
    pathname: `/c/${convId}`,
    generatorMetadata: [
      {
        chatModel: {
          modelDisplayName: 'Gemini 2.5 Pro',
          timeToFirstToken: '0.62s',
          streamingDuration: '2.38s',
          usage: {
            inputTokens: 50000,
            cacheReadTokens: 200000,
            outputTokens: 150
          },
          chatStartMetadata: {
            contextWindowMetadata: {
              maxContextTokens: 1000000
            }
          }
        }
      }
    ]
  });

  try {
    await h.flush();
    assert.equal(h.el('badge-pct-val').textContent, '25%');
    assert.equal(h.el('badge-speed-wrap').hidden, false);
    assert.equal(h.el('speed-amount').textContent, '50 tok/s');

    // 點擊頂欄膠囊展開單一面板
    h.el('badge').click();
    assert.equal(h.el('panel').hidden, false);
    assert.equal(h.el('model').textContent, 'Gemini 2.5 Pro');
    assert.equal(h.el('key-badge').textContent, '正常');
    assert.equal(h.el('key-pct-hero').textContent, '25%');
    assert.equal(h.el('key-fraction').textContent, '250K / 1M');
    assert.equal(h.el('key-remaining').textContent, '剩餘 750K');
    assert.equal(h.el('alert-banner').hidden, true);
    assert.equal(h.el('speed-badge').textContent, '流暢');
    assert.ok(h.el('speed-badge').classList.contains('pill-good'));
    assert.equal(h.el('speed-val').textContent, '50 tok/s');
    assert.equal(h.el('speed-val').getAttribute('data-speed-tier'), 'smooth');
    assert.equal(h.el('badge-speed-wrap').getAttribute('data-speed-tier'), 'smooth');
    assert.ok(h.el('ctx-tip-detail').textContent.includes('50 tok/s (流暢)'));
    assert.equal(h.el('speed-ttft').textContent, '0.62s');
    assert.equal(h.el('speed-duration').textContent, '3s');
    assert.equal(h.el('speed-output').textContent, '150 tok');

    // 展開當前上下文占比明細抽屜
    assert.equal(h.el('drawer-body').hidden, true);
    h.el('btn-toggle-details').click();
    assert.equal(h.el('drawer-body').hidden, false);
    assert.equal(h.el('steps-pill').textContent, '12 步');
    assert.equal(h.el('session-total').textContent, '共 250K');
    assert.match(h.el('system').textContent, /^\d+(\.\d)?%$/);
    assert.match(h.el('tools').textContent, /^\d+(\.\d)?%$/);
    assert.equal(h.el('summaries').textContent, '0%');
    assert.ok(h.el('row-system').title.includes('tokens'));
    assert.equal(h.el('files'), null);
    assert.ok(h.el('row-attachment').title.includes('diagram.png'));
  } finally {
    h.dispose();
  }
});

test('響應式遲滯收折與深淺色主題自動/手動切換、完整銷毀清理', async () => {
  const h = createHarness({ pathname: '/', lightTheme: true });
  try {
    await h.flush();
    assert.equal(h.sandbox.__AGContextMeter.theme(), 'light');
    assert.equal(h.host.getAttribute('data-theme'), 'light');

    h.el('theme-toggle').click(); // auto -> light (pinned)
    h.el('theme-toggle').click(); // light -> dark (pinned)
    assert.equal(h.sandbox.__AGContextMeter.theme(), 'dark');
    assert.equal(h.host.getAttribute('data-theme'), 'dark');

    // 遲滯寬度切換測試
    assert.equal(h.sandbox.__AGContextMeter.setAvailableWidthForTest(220), 'wide');
    assert.equal(h.sandbox.__AGContextMeter.setAvailableWidthForTest(120), 'compact');
    assert.equal(h.sandbox.__AGContextMeter.setAvailableWidthForTest(150), 'compact'); // 遲滯保護不抖動
    assert.equal(h.sandbox.__AGContextMeter.setAvailableWidthForTest(165), 'wide');
    assert.equal(h.sandbox.__AGContextMeter.setAvailableWidthForTest(55), 'ring-only');
  } finally {
    h.dispose();
    assert.equal(h.host.isConnected, false);
  }
});

test('低速個位數 tok/s 提醒指示：面板標籤顯示偏慢告警、頂欄膠囊與懸停提示同步標記', async () => {
  const convId = '11111111-2222-3333-4444-555555555555';
  const h = createHarness({
    pathname: `/c/${convId}`,
    generatorMetadata: [
      {
        chatModel: {
          modelDisplayName: 'Gemini 4 Carbon (Medium)',
          timeToFirstToken: '14.2s',
          streamingDuration: '0.8s',
          usage: {
            inputTokens: 120000,
            outputTokens: 90
          },
          chatStartMetadata: {
            contextWindowMetadata: { maxContextTokens: 256000 }
          }
        }
      }
    ]
  });

  try {
    await h.flush();
    assert.equal(h.el('speed-amount').textContent, '6 tok/s');
    assert.equal(h.el('badge-speed-wrap').getAttribute('data-speed-tier'), 'slow');
    assert.equal(h.el('speed-badge').textContent, '偏慢');
    assert.ok(h.el('speed-badge').classList.contains('pill-danger'));
    assert.equal(h.el('speed-val').getAttribute('data-speed-tier'), 'slow');
    assert.ok(h.el('ctx-tip-detail').textContent.includes('6 tok/s (偏慢)'));
    assert.ok(h.el('speed-val').title.includes('首字延遲占耗時'));
  } finally {
    h.dispose();
  }
});

test('高占用（>=90%）提醒欄：單行精煉文案並將 /compact 渲染為指令膠囊', async () => {
  const convId = '11111111-2222-3333-4444-555555555555';
  const h = createHarness({
    pathname: `/c/${convId}`,
    generatorMetadata: [
      {
        chatModel: {
          modelDisplayName: 'Gemini 4 Carbon (Medium)',
          timeToFirstToken: '12.8s',
          streamingDuration: '5.2s',
          usage: {
            inputTokens: 2000,
            cacheReadTokens: 233000,
            outputTokens: 582
          },
          chatStartMetadata: {
            contextWindowMetadata: { maxContextTokens: 256000 }
          }
        }
      }
    ]
  });

  try {
    await h.flush();
    assert.equal(h.el('key-badge').textContent, '吃緊');
    assert.equal(h.el('alert-banner').hidden, false);
    assert.equal(h.el('alert-banner').getAttribute('data-tone'), 'danger');

    const parts = h.el('alert-text').children;
    const fullText = parts.map(n => n.textContent).join('');
    assert.equal(fullText, '空間即將耗盡，建議 /compact 壓縮或開啟新對話');

    const cmdChip = parts.find(n => n.tagName === 'CODE');
    assert.ok(cmdChip);
    assert.equal(cmdChip.className, 'alert-cmd');
    assert.equal(cmdChip.textContent, '/compact');
  } finally {
    h.dispose();
  }
});
