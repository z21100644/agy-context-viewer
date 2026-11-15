(function () {
  'use strict';
  if (location.protocol !== 'https:' || location.hostname !== '127.0.0.1') return;
  globalThis.__AGContextMeter?.dispose();

  const {
    summarize,
    classifySpeed,
    formatModelLabel,
    classifyRequestError,
    computeContextShares,
    normalizeLocale: coreNormalizeLocale,
    detectLocaleFromCandidates
  } = globalThis.__AGContextMeterCore || {};

  const LANG_CYCLE = ['en', 'zh-CN', 'zh-TW'];

  function normalizeLang(input, fallback = 'en') {
    if (typeof coreNormalizeLocale === 'function') return coreNormalizeLocale(input, fallback);
    if (!input || typeof input !== 'string') return fallback;
    const s = input.trim().replace(/_/g, '-').toLowerCase();
    if (!s || s === 'auto' || s === 'c' || s === 'posix') return fallback;
    if (s === 'zh-tw' || s === 'zh-hk' || s === 'zh-mo' || s.startsWith('zh-hant') || s.includes('-tw') || s.includes('-hk')) {
      return 'zh-TW';
    }
    if (s === 'zh' || s.startsWith('zh-')) return 'zh-CN';
    if (s === 'en' || s.startsWith('en-')) return 'en';
    return fallback;
  }

  const UI_I18N = {
    en: {
      langShort: 'EN',
      langName: 'English',
      langAria: 'Switch language',
      langTitleAuto: name => `Language: Auto (${name}) · Click to switch`,
      langTitlePinned: name => `Language: ${name} (Click to switch)`,
      badgeAria: 'Context window & generation monitor',
      panelAria: 'Context window monitor panel',
      panelTitle: 'Context Window',
      refreshTitle: 'Rescan conversation & attachments',
      themeAria: 'Switch light/dark theme',
      themeAuto: isLight => `Auto (${isLight ? 'Light' : 'Dark'})`,
      themeLight: 'Light',
      themeDark: 'Dark',
      themeTitle: modeLabel => `Theme: ${modeLabel} · Click to switch`,
      closeAria: 'Close panel',
      closeTitle: 'Close (Esc)',
      speedLabel: 'Speed',
      speedLabelTitle: 'Output ÷ Total time (incl. TTFT)',
      ttftLabel: 'TTFT',
      ttftLabelTitle: 'Time to First Token',
      durationLabel: 'Duration',
      outputLabel: 'Output',
      drawerTitle: 'Context Breakdown',
      catSystem: 'System Prompt & Tools',
      catTools: 'Tool Calls & Outputs',
      catAssistant: 'Model Responses',
      catThinking: 'Thinking Process',
      catUser: 'User Messages',
      catSummaries: 'Compacted Summaries',
      catAttachment: 'Attachments',
      compFootnote: 'Weighted by active context window sections',
      noActiveChat: 'No active chat',
      tipIdleDetail: 'Context usage tracks automatically in a chat',
      errorFallback: 'Error',
      approxVal: v => `~${v}`,
      estimating: 'Estimating',
      tipActualBudget: (pct, rem) => `${pct}% used · ${rem} left`,
      incompleteSuffix: ' (incl. unparsed files)',
      tipActualOnly: used => `${used} tokens used`,
      tipNoLimit: 'Window limit unavailable',
      tipEst: est => `Est. ≈ ${est} tokens`,
      tipLimit: lim => `Limit ${lim}`,
      tipAwaitActual: 'Awaiting server usage',
      loadedSteps: n => `Loaded ${n} ${n === 1 ? 'step' : 'steps'}`,
      chatOpened: 'Chat opened',
      tipWaitFirst: 'Waiting for first model response',
      tipReading: 'Reading context…',
      tipSyncing: 'Syncing chat state',
      usageIdleHint: 'Actual usage syncs automatically when a chat opens',
      chipCache: v => `Cache ${v}`,
      chipInput: v => `Input ${v}`,
      chipOutput: v => `Output ${v}`,
      hintEst: 'Client-side estimate; updates to exact usage after reply',
      hintNoCalls: 'No model calls yet; see context breakdown below',
      hintSyncing: 'Syncing conversation data…',
      stepsCount: n => `${n} ${n === 1 ? 'step' : 'steps'}`,
      stepsTitleCompacted: (shown, total, u, a) =>
        `${shown} active steps after compaction (${total} total) · ${u} ${u === 1 ? 'prompt' : 'prompts'} · ${a} ${a === 1 ? 'reply' : 'replies'}`,
      stepsTitleNormal: (u, a) =>
        `${u} ${u === 1 ? 'prompt' : 'prompts'} · ${a} ${a === 1 ? 'reply' : 'replies'}`,
      scanning: 'Scanning…',
      pendingScan: 'Pending',
      totalVal: (v, inc) => `Total ${v}${inc ? ' +' : ''}`,
      approxTotalVal: (v, inc) => `~${v}${inc ? ' +' : ''}`,
      unknownShare: 'Unknown',
      rowTipActual: (tok, pct) => `~${tok} tokens (${pct} of active context)`,
      rowTipShare: pct => `${pct} of active context`,
      fileJoiner: ', ',
      moreFiles: total => ` (${total} files total)`,
      updatedAt: timeStr => `Updated ${timeStr}`,
      statusIdle: 'Idle',
      statusOverflow: 'Overflow',
      statusTight: 'Tight',
      statusHigh: 'High',
      statusOk: 'OK',
      statusRecorded: 'Recorded',
      statusEst: 'Est.',
      statusSyncing: 'Syncing',
      statusReady: 'Ready',
      overLimit: lim => `Over ${lim} limit`,
      overServerLimit: 'Over server capacity limit',
      zeroLeft: '0 left',
      leftVal: v => `${v} left`,
      approxLeftVal: v => `~${v} left`,
      tokensNoLimit: 'tokens (no limit reported)',
      tokensLocalEst: 'tokens (local estimate)',
      waitingRequestData: 'Waiting for request data',
      alertHighOccupancy: 'Context nearly full. Run /compact or start a new chat',
      alertStale: err => `Live stats delayed (${err})`,
      alertUnknownFiles: n =>
        `${n} ${n === 1 ? 'attachment' : 'attachments'} could not be parsed locally; actual usage may be higher`,
      speedMeasuring: 'Live',
      speedGenerating: 'Generating…',
      speedStreamingTps: tps => `Streaming ${tps} tok/s`,
      speedIncludesTtft: 'Includes TTFT',
      speedTtftShare: pct => `TTFT ${pct}%`,
      ttftTitle: sec => `Time to first token: ${sec}s`,
      durTitle: (dur, stream) => `Total ${dur}s${stream != null ? ` · Streaming ${stream}s` : ''}`,
      outTitle: (out, thk) => `Output ${out} tokens${thk ? ` (incl. ${thk} thinking)` : ''}`,
      speedFallback: { fast: 'Fast', smooth: 'Smooth', fair: 'Fair', slow: 'Slow' },
      errNotReady: 'Background service not ready',
      errTimeout: 'Read timeout',
      errScanHttp: code => `Scan bridge HTTP ${code}`,
      errRestartForScan: 'Restart Antigravity to enable full context breakdown scan',
      errScanFailed: 'Scan failed',
      errInvalidConv: 'Invalid local conversation',
      errNoTrajectory: 'Conversation history unavailable',
      errLocalApiTimeout: 'Local API read timeout',
      errResponseTooLarge: 'Local response too large; scan incomplete',
      errMainWinOnly: 'Only local main window calls are allowed',
      errPayloadTooLarge: 'Request payload too large'
    },
    'zh-CN': {
      langShort: '简',
      langName: '简体中文',
      langAria: '切换界面语言',
      langTitleAuto: name => `语言：跟随 IDE（${name}）· 点击切换`,
      langTitlePinned: name => `语言：${name}（点击切换）`,
      badgeAria: '对话上下文与生成监控',
      panelAria: '上下文窗口监控面板',
      panelTitle: '上下文窗口',
      refreshTitle: '重新扫描对话与附件',
      themeAria: '切换深浅色主题',
      themeAuto: isLight => `跟随 IDE（当前${isLight ? '浅色' : '深色'}）`,
      themeLight: '固定浅色',
      themeDark: '固定深色',
      themeTitle: modeLabel => `主题：${modeLabel}（点击切换）`,
      closeAria: '关闭面板',
      closeTitle: '关闭 (Esc)',
      speedLabel: '整体速率',
      speedLabelTitle: '产出 ÷ 总耗时（含首字延迟）',
      ttftLabel: '首字延迟',
      ttftLabelTitle: '',
      durationLabel: '总耗时',
      outputLabel: '本轮产出',
      drawerTitle: '当前上下文占比',
      catSystem: '系统提示与工具定义',
      catTools: '工具调用与输出',
      catAssistant: '模型回复',
      catThinking: '思考过程',
      catUser: '用户消息',
      catSummaries: '压缩摘要',
      catAttachment: '附件内容',
      compFootnote: '按当前有效窗口各区块权重计算',
      noActiveChat: '尚未开启对话',
      tipIdleDetail: '进入对话后自动追踪上下文容量',
      errorFallback: '异常',
      approxVal: v => `约 ${v}`,
      estimating: '估算中',
      tipActualBudget: (pct, rem) => `${pct}% 已用 · 剩余 ${rem}`,
      incompleteSuffix: '（含未知附件）',
      tipActualOnly: used => `已用 ${used} tokens`,
      tipNoLimit: '未返回窗口上限',
      tipEst: est => `预估 ≈ ${est} tokens`,
      tipLimit: lim => `上限 ${lim}`,
      tipAwaitActual: '待服务器返回实际值',
      loadedSteps: n => `已加载 ${n} 步对话`,
      chatOpened: '已开启对话',
      tipWaitFirst: '等待首次模型请求返回容量',
      tipReading: '正在读取上下文…',
      tipSyncing: '同步对话状态中',
      usageIdleHint: '开启对话后自动同步实际用量',
      chipCache: v => `缓存 ${v}`,
      chipInput: v => `输入 ${v}`,
      chipOutput: v => `输出 ${v}`,
      hintEst: '当前为客户端估算，模型回复后将更新为精确用量',
      hintNoCalls: '尚无模型调用记录，下方可查看当前上下文占比',
      hintSyncing: '正在同步当前对话数据…',
      stepsCount: n => `${n} 步`,
      stepsTitleCompacted: (shown, total, u, a) =>
        `压缩后有效 ${shown} 步（历史共 ${total} 步） · ${u} 条提问 · ${a} 条回复`,
      stepsTitleNormal: (u, a) => `${u} 条提问 · ${a} 条回复`,
      scanning: '计算中…',
      pendingScan: '待扫描',
      totalVal: (v, inc) => `共 ${v}${inc ? ' +' : ''}`,
      approxTotalVal: (v, inc) => `约 ${v}${inc ? ' +' : ''}`,
      unknownShare: '未知占比',
      rowTipActual: (tok, pct) => `约 ${tok} tokens（占当前上下文 ${pct}）`,
      rowTipShare: pct => `占当前上下文 ${pct}`,
      fileJoiner: '、',
      moreFiles: total => ` 等 ${total} 个文件`,
      updatedAt: timeStr => `${timeStr} 更新`,
      statusIdle: '待命',
      statusOverflow: '超限',
      statusTight: '吃紧',
      statusHigh: '偏高',
      statusOk: '正常',
      statusRecorded: '已记录',
      statusEst: '估算',
      statusSyncing: '同步中',
      statusReady: '就绪',
      overLimit: lim => `超出 ${lim} 上限`,
      overServerLimit: '超出服务器容量上限',
      zeroLeft: '剩余 0',
      leftVal: v => `剩余 ${v}`,
      approxLeftVal: v => `约剩 ${v}`,
      tokensNoLimit: 'tokens（未提供上限）',
      tokensLocalEst: 'tokens（本地估算）',
      waitingRequestData: '等待请求数据',
      alertHighOccupancy: '空间即将耗尽，建议 /compact 压缩或开启新对话',
      alertStale: err => `实时统计读取延迟（${err}）`,
      alertUnknownFiles: n => `有 ${n} 个附件无法本地解析，实际用量可能高于估算`,
      speedMeasuring: '计算',
      speedGenerating: '生成中…',
      speedStreamingTps: tps => `纯流式 ${tps} tok/s`,
      speedIncludesTtft: '含首字延迟计算',
      speedTtftShare: pct => `首字占 ${pct}%`,
      ttftTitle: sec => `首字延迟 ${sec}s`,
      durTitle: (dur, stream) => `总耗时 ${dur}s${stream != null ? ` · 流式输出 ${stream}s` : ''}`,
      outTitle: (out, thk) => `本轮产出 ${out} tokens${thk ? `（含思考 ${thk}）` : ''}`,
      speedFallback: { fast: '极速', smooth: '流畅', fair: '良好', slow: '偏慢' },
      errNotReady: '后台服务尚未就绪',
      errTimeout: '读取超时',
      errScanHttp: code => `扫描接口 HTTP ${code}`,
      errRestartForScan: '重启 Antigravity 后启用完整对话构成扫描',
      errScanFailed: '扫描失败',
      errInvalidConv: '无效本地对话',
      errNoTrajectory: '未获取对话历史',
      errLocalApiTimeout: '本地接口读取超时',
      errResponseTooLarge: '本地响应过大，扫描不完整',
      errMainWinOnly: '仅允许本地主窗口调用',
      errPayloadTooLarge: '请求超出大小限制'
    },
    'zh-TW': {
      langShort: '繁',
      langName: '繁體中文',
      langAria: '切換介面語言',
      langTitleAuto: name => `語言：跟隨 IDE（${name}）· 點擊切換`,
      langTitlePinned: name => `語言：${name}（點擊切換）`,
      badgeAria: '對話上下文與生成監控',
      panelAria: '上下文視窗監控面板',
      panelTitle: '上下文視窗',
      refreshTitle: '重新掃描對話與附件',
      themeAria: '切換深淺色主題',
      themeAuto: isLight => `跟隨 IDE（目前${isLight ? '淺色' : '深色'}）`,
      themeLight: '固定淺色',
      themeDark: '固定深色',
      themeTitle: modeLabel => `主題：${modeLabel}（點擊切換）`,
      closeAria: '關閉面板',
      closeTitle: '關閉 (Esc)',
      speedLabel: '整體速率',
      speedLabelTitle: '產出 ÷ 總耗時（含首字延遲）',
      ttftLabel: '首字延遲',
      ttftLabelTitle: '',
      durationLabel: '總耗時',
      outputLabel: '本輪產出',
      drawerTitle: '當前上下文占比',
      catSystem: '系統提示與工具定義',
      catTools: '工具呼叫與輸出',
      catAssistant: '模型回覆',
      catThinking: '思考過程',
      catUser: '使用者訊息',
      catSummaries: '壓縮摘要',
      catAttachment: '附件內容',
      compFootnote: '依當前有效視窗各區塊權重計算',
      noActiveChat: '尚未開啟對話',
      tipIdleDetail: '進入對話後自動追蹤上下文容量',
      errorFallback: '異常',
      approxVal: v => `約 ${v}`,
      estimating: '估算中',
      tipActualBudget: (pct, rem) => `${pct}% 已用 · 剩餘 ${rem}`,
      incompleteSuffix: '（含未知附件）',
      tipActualOnly: used => `已用 ${used} tokens`,
      tipNoLimit: '未回傳視窗上限',
      tipEst: est => `預估 ≈ ${est} tokens`,
      tipLimit: lim => `上限 ${lim}`,
      tipAwaitActual: '待伺服器回傳實際值',
      loadedSteps: n => `已載入 ${n} 步對話`,
      chatOpened: '已開啟對話',
      tipWaitFirst: '等待首次模型請求回傳容量',
      tipReading: '正在讀取上下文…',
      tipSyncing: '同步對話狀態中',
      usageIdleHint: '開啟對話後自動同步實際用量',
      chipCache: v => `快取 ${v}`,
      chipInput: v => `輸入 ${v}`,
      chipOutput: v => `輸出 ${v}`,
      hintEst: '目前為用戶端估算，模型回覆後將更新為精確用量',
      hintNoCalls: '尚無模型呼叫紀錄，下方可檢視當前上下文占比',
      hintSyncing: '正在同步目前對話資料…',
      stepsCount: n => `${n} 步`,
      stepsTitleCompacted: (shown, total, u, a) =>
        `壓縮後有效 ${shown} 步（歷史共 ${total} 步） · ${u} 則提問 · ${a} 則回覆`,
      stepsTitleNormal: (u, a) => `${u} 則提問 · ${a} 則回覆`,
      scanning: '計算中…',
      pendingScan: '待掃描',
      totalVal: (v, inc) => `共 ${v}${inc ? ' +' : ''}`,
      approxTotalVal: (v, inc) => `約 ${v}${inc ? ' +' : ''}`,
      unknownShare: '未知占比',
      rowTipActual: (tok, pct) => `約 ${tok} tokens（占當前上下文 ${pct}）`,
      rowTipShare: pct => `占當前上下文 ${pct}`,
      fileJoiner: '、',
      moreFiles: total => ` 等 ${total} 個檔案`,
      updatedAt: timeStr => `${timeStr} 更新`,
      statusIdle: '待命',
      statusOverflow: '超限',
      statusTight: '吃緊',
      statusHigh: '偏高',
      statusOk: '正常',
      statusRecorded: '已記錄',
      statusEst: '估算',
      statusSyncing: '同步中',
      statusReady: '就緒',
      overLimit: lim => `超出 ${lim} 上限`,
      overServerLimit: '超出伺服器容量上限',
      zeroLeft: '剩餘 0',
      leftVal: v => `剩餘 ${v}`,
      approxLeftVal: v => `約剩 ${v}`,
      tokensNoLimit: 'tokens（未提供上限）',
      tokensLocalEst: 'tokens（本機估算）',
      waitingRequestData: '等待請求資料',
      alertHighOccupancy: '空間即將耗盡，建議 /compact 壓縮或開啟新對話',
      alertStale: err => `即時統計讀取延遲（${err}）`,
      alertUnknownFiles: n => `有 ${n} 個附件無法本機解析，實際用量可能高於估算`,
      speedMeasuring: '計算',
      speedGenerating: '生成中…',
      speedStreamingTps: tps => `純串流 ${tps} tok/s`,
      speedIncludesTtft: '含首字延遲計算',
      speedTtftShare: pct => `首字占 ${pct}%`,
      ttftTitle: sec => `首字延遲 ${sec}s`,
      durTitle: (dur, stream) => `總耗時 ${dur}s${stream != null ? ` · 串流輸出 ${stream}s` : ''}`,
      outTitle: (out, thk) => `本輪輸出 ${out} tokens${thk ? `（含思考 ${thk}）` : ''}`,
      speedFallback: { fast: '極速', smooth: '流暢', fair: '良好', slow: '偏慢' },
      errNotReady: '背景服務尚未就緒',
      errTimeout: '讀取逾時',
      errScanHttp: code => `掃描介面 HTTP ${code}`,
      errRestartForScan: '重啟 Antigravity 後啟用完整對話構成掃描',
      errScanFailed: '掃描失敗',
      errInvalidConv: '無效本機對話',
      errNoTrajectory: '未取得對話歷史',
      errLocalApiTimeout: '本機介面讀取逾時',
      errResponseTooLarge: '本機回應過大，掃描不完整',
      errMainWinOnly: '僅允許本機主視窗呼叫',
      errPayloadTooLarge: '請求超出大小限制'
    }
  };

  function formatRuntimeError(raw, t) {
    if (!raw) return '';
    const msg = String(raw);
    if (msg === '__ERR_NOT_READY__' || msg === '背景服務尚未就緒' || msg === '后台服务尚未就绪' || msg === 'Background service not ready') {
      return t.errNotReady;
    }
    if (msg === '__ERR_TIMEOUT__' || msg === '讀取逾時' || msg === '读取超时' || msg === 'Read timeout') {
      return t.errTimeout;
    }
    if (
      msg === '__ERR_RESTART_SCAN__' ||
      msg === '重啟 Antigravity 後啟用完整對話構成掃描' ||
      msg === '重启 Antigravity 后启用完整对话构成扫描' ||
      msg === 'Restart Antigravity to enable full context breakdown scan'
    ) {
      return t.errRestartForScan;
    }
    if (msg === '__ERR_SCAN_FAILED__' || msg === '掃描失敗' || msg === '扫描失败' || msg === 'Scan failed') {
      return t.errScanFailed;
    }
    if (msg === '無效本機對話' || msg === '无效本地对话' || msg === 'Invalid local conversation') return t.errInvalidConv;
    if (msg === '未取得對話歷史' || msg === '未获取对话历史' || msg === 'Conversation history unavailable') return t.errNoTrajectory;
    if (msg === '本機介面讀取逾時' || msg === '本地接口读取超时' || msg === 'Local API read timeout') return t.errLocalApiTimeout;
    if (msg === '本機回應過大，掃描不完整' || msg === '本地响应过大，扫描不完整' || msg === 'Local response too large; scan incomplete') {
      return t.errResponseTooLarge;
    }
    if (msg === '僅允許本機主視窗呼叫' || msg === '仅允许本地主窗口调用' || msg === 'Only local main window calls are allowed') {
      return t.errMainWinOnly;
    }
    if (msg === '請求超出大小限制' || msg === '请求超出大小限制' || msg === 'Request payload too large') {
      return t.errPayloadTooLarge;
    }
    const scanHttp = msg.match(/^(?:__ERR_SCAN_HTTP__|掃描介面 HTTP|扫描接口 HTTP|Scan bridge HTTP)\s*(\d+)$/i);
    if (scanHttp) return t.errScanHttp(scanHttp[1]);
    return msg;
  }

  const host = document.createElement('div');
  host.id = 'ag-context-meter';
  host.setAttribute('data-layout', 'wide');
  host.setAttribute('data-dock', 'fixed');
  host.setAttribute('data-window-active', 'true');
  host.setAttribute('data-occupancy', 'normal');
  const shadow = host.attachShadow({ mode: 'open' });

  const RING_RADIUS = 5.75;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

  /* @INSERT_STYLES_AND_TEMPLATE */

  (document.body || document.documentElement).appendChild(host);
  const el = id => shadow.getElementById(id);

  // ==========================================================================
  // 0. 跨重啟連接埠無關偏好持久化與多語系偵測 (English / 简体中文 / 繁體中文)
  // ==========================================================================
  const PREF_SPECS = {
    langMode: {
      storageKey: 'ag_lang_mode',
      fallback: 'auto',
      parse: v => (v === 'auto' || v === 'en' || v === 'zh-CN' || v === 'zh-TW' ? v : null),
      toRaw: v => String(v)
    },
    themeMode: {
      storageKey: 'ag_theme_mode',
      fallback: 'auto',
      parse: v => (v === 'auto' || v === 'light' || v === 'dark' ? v : null),
      toRaw: v => String(v)
    },
    drawerOpen: {
      storageKey: 'ag_ctx_drawer_open',
      fallback: false,
      parse: v => (typeof v === 'boolean' ? v : v === '1' || v === 'true' ? true : v === '0' || v === 'false' ? false : null),
      toRaw: v => (v ? '1' : '0')
    }
  };

  function readCookieValue(name) {
    try {
      const rawCookie = typeof document !== 'undefined' && typeof document.cookie === 'string' ? document.cookie : '';
      if (!rawCookie) return null;
      const prefix = `${encodeURIComponent(name)}=`;
      for (const part of rawCookie.split(';')) {
        const trimmed = part.trim();
        if (trimmed.startsWith(prefix)) return decodeURIComponent(trimmed.slice(prefix.length));
      }
    } catch {}
    return null;
  }

  function writeCookieValue(name, rawVal) {
    try {
      if (typeof document === 'undefined' || !('cookie' in document)) return;
      const secure = location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(rawVal)}; path=/; max-age=31536000; SameSite=Lax${secure}`;
    } catch {}
  }

  function hasPrefsBridge() {
    return Boolean(
      (typeof window !== 'undefined' && typeof window.contextMeterAPI?.savePrefs === 'function') ||
        (typeof window !== 'undefined' && window.__AGContextMeterLive?.port)
    );
  }

  function pushPrefsToHost(patch) {
    try {
      if (typeof window !== 'undefined' && typeof window.contextMeterAPI?.savePrefs === 'function') {
        void Promise.resolve(window.contextMeterAPI.savePrefs(patch)).catch(() => {});
        return;
      }
      const live = typeof window !== 'undefined' ? window.__AGContextMeterLive : null;
      if (live?.port && typeof fetch === 'function') {
        void fetch(`http://127.0.0.1:${live.port}/prefs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-AG-Context-Token': live.token },
          body: JSON.stringify(patch)
        }).catch(() => {});
      }
    } catch {}
  }

  function loadPref(prefKey) {
    const spec = PREF_SPECS[prefKey];
    let lsVal = null;
    try {
      lsVal = spec.parse(typeof localStorage !== 'undefined' ? localStorage.getItem(spec.storageKey) : null);
    } catch {}
    const cookieVal = spec.parse(readCookieValue(spec.storageKey));
    const diskVal = spec.parse(globalThis.__AGContextMeterPrefs?.[prefKey]);

    const candidates = hasPrefsBridge() ? [diskVal, cookieVal, lsVal] : [lsVal, cookieVal, diskVal];
    const resolved = candidates.find(v => v !== null);
    if (resolved === undefined) return spec.fallback;

    const rawStr = spec.toRaw(resolved);
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(spec.storageKey) !== rawStr) {
        localStorage.setItem(spec.storageKey, rawStr);
      }
    } catch {}
    writeCookieValue(spec.storageKey, rawStr);
    if (diskVal === null && hasPrefsBridge()) {
      pushPrefsToHost({ [prefKey]: resolved });
    }
    return resolved;
  }

  function savePref(prefKey, value) {
    const spec = PREF_SPECS[prefKey];
    const valid = spec.parse(value);
    if (valid === null) return;
    const rawStr = spec.toRaw(valid);
    try {
      localStorage?.setItem(spec.storageKey, rawStr);
    } catch {}
    writeCookieValue(spec.storageKey, rawStr);
    if (!globalThis.__AGContextMeterPrefs || typeof globalThis.__AGContextMeterPrefs !== 'object') {
      globalThis.__AGContextMeterPrefs = {};
    }
    globalThis.__AGContextMeterPrefs[prefKey] = valid;
    pushPrefsToHost({ [prefKey]: valid });
  }

  let currentLangMode = loadPref('langMode');

  function detectHostLocale() {
    try {
      const docLang = document.documentElement?.getAttribute?.('lang') || document.documentElement?.lang || '';
      const bodyLang = document.body?.getAttribute?.('lang') || document.body?.lang || '';
      const cfgLang =
        (typeof window !== 'undefined' && (window.__APP_CONFIG__?.locale || window.__APP_CONFIG__?.language)) || '';
      const navLang = (typeof navigator !== 'undefined' && navigator.language) || '';
      const navLangs =
        typeof navigator !== 'undefined' && Array.isArray(navigator.languages) ? navigator.languages : [];
      const candidates = [docLang, bodyLang, cfgLang, navLang, ...navLangs];
      if (typeof detectLocaleFromCandidates === 'function') {
        return detectLocaleFromCandidates(candidates, 'en');
      }
      for (const c of candidates) {
        if (c && String(c).trim()) return normalizeLang(c, 'en');
      }
    } catch {}
    return 'en';
  }

  function resolveLanguage() {
    if (currentLangMode === 'en' || currentLangMode === 'zh-CN' || currentLangMode === 'zh-TW') {
      return currentLangMode;
    }
    return detectHostLocale();
  }

  const getDict = () => UI_I18N[resolveLanguage()] || UI_I18N.en;

  const fmt = v => (v == null ? '—' : Math.round(v).toLocaleString('en-US'));
  const short = v => {
    if (v == null) return '—';
    if (v >= 1e9) return `${parseFloat((v / 1e9).toFixed(2))}B`;
    if (v >= 1e6) return `${parseFloat((v / 1e6).toFixed(2))}M`;
    if (v >= 1000) {
      const k = v / 1000;
      return k >= 100 ? `${Math.round(k)}K` : `${parseFloat(k.toFixed(1))}K`;
    }
    return String(Math.round(v));
  };
  const tokenWeight = value => {
    if (!value) return 0;
    if (typeof value.tokens === 'number') return value.tokens;
    if (typeof value.chars === 'number' && value.chars > 0 && typeof value.bytes === 'number') {
      const cjkEst = Math.max(0, Math.min(value.chars, (value.bytes - value.chars) / 2));
      return Math.max(1, Math.round((value.chars - cjkEst) / 3.7 + cjkEst * 1.15));
    }
    if (value.low && value.high) return value.low;
    return ((value.low || 0) + (value.high || 0)) / 2;
  };
  const formatPct = pct => {
    if (!pct || pct <= 0) return '0%';
    if (pct < 0.1) return '<0.1%';
    if (pct >= 99.95) return '100%';
    return `${pct.toFixed(1)}%`;
  };
  const fmtSec = sec => {
    if (sec == null || !Number.isFinite(sec)) return '—';
    if (sec >= 100) {
      const m = Math.floor(sec / 60);
      const s = Math.round(sec % 60);
      return s === 60 ? `${m + 1}m 00s` : `${m}m ${String(s).padStart(2, '0')}s`;
    }
    return sec >= 10 ? `${sec.toFixed(1)}s` : `${parseFloat(sec.toFixed(2))}s`;
  };
  const getSpeedTier = sp => {
    if (!sp || sp.tps == null) return null;
    const lang = resolveLanguage();
    if (typeof classifySpeed === 'function') return classifySpeed(sp.tps, lang);
    const fb = getDict().speedFallback;
    if (sp.tps >= 60) return { level: 'fast', label: fb.fast, tone: 'good' };
    if (sp.tps >= 25) return { level: 'smooth', label: fb.smooth, tone: 'good' };
    if (sp.tps >= 10) return { level: 'fair', label: fb.fair, tone: 'warn' };
    return { level: 'slow', label: fb.slow, tone: 'danger' };
  };

  const state = {
    route: undefined,
    count: 0,
    lastScannedCount: -1,
    lastScannedActual: null,
    latest: null,
    requestAt: 0,
    requestError: '',
    requestBusy: false,
    requestNext: 0,
    scanBusy: false,
    scanPendingAt: 0,
    scanError: '',
    scan: null,
    cascadeModelConfigs: [],
    generation: 0,
    controllers: new Set(),
    disposed: false,
    layoutMode: 'wide',
    tooltipOpen: false,
    drawerOpen: loadPref('drawerOpen')
  };

  const route = () => location.pathname.match(/^\/c\/([a-f\d-]{36})(?:\/|$)/i)?.[1] || null;

  // ==========================================================================
  // 1. 主題偵測、多語系靜態標籤同步與 Windows 標題列色彩同步
  // ==========================================================================
  let currentThemeMode = loadPref('themeMode');

  function parseLuminance(colorStr) {
    if (!colorStr || typeof colorStr !== 'string') return null;
    const s = colorStr.trim();
    const hexMatch = s.replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(hexMatch)) {
      const full = hexMatch.length === 3 ? hexMatch.split('').map(c => c + c).join('') : hexMatch;
      const num = parseInt(full, 16);
      const r = (num >> 16) & 255;
      const g = (num >> 8) & 255;
      const b = num & 255;
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
    const rgbMatch = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgbMatch) {
      return (0.299 * Number(rgbMatch[1]) + 0.587 * Number(rgbMatch[2]) + 0.114 * Number(rgbMatch[3])) / 255;
    }
    return null;
  }

  function detectHostTheme() {
    try {
      const body = document.body;
      const doc = document.documentElement;
      if (
        body?.classList?.contains('theme-light') ||
        body?.classList?.contains('light') ||
        doc?.classList?.contains('light') ||
        body?.classList?.contains('vscode-light')
      ) {
        return 'light';
      }
      if (
        body?.classList?.contains('theme-dark') ||
        body?.classList?.contains('dark') ||
        doc?.classList?.contains('dark') ||
        body?.classList?.contains('vscode-dark')
      ) {
        return 'dark';
      }
      if (doc?.style?.colorScheme === 'light') return 'light';
      if (doc?.style?.colorScheme === 'dark') return 'dark';
      if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function' && (body || doc)) {
        const cs = window.getComputedStyle(body || doc);
        const lum = parseLuminance(cs.getPropertyValue('--background') || cs.backgroundColor);
        if (lum != null) return lum > 0.55 ? 'light' : 'dark';
      }
      if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)')?.matches) {
        return 'light';
      }
    } catch {}
    return 'dark';
  }

  function resolveTheme() {
    if (currentThemeMode === 'light' || currentThemeMode === 'dark') return currentThemeMode;
    return detectHostTheme();
  }

  let lastSyncedOverlayKey = '';
  function syncNativeOverlayTheme() {
    try {
      if (typeof window === 'undefined') return;
      const isLight = resolveTheme() === 'light';
      const rootEl = document.body || document.documentElement;
      const cs = rootEl && typeof window.getComputedStyle === 'function' ? window.getComputedStyle(rootEl) : null;
      const bg = cs?.getPropertyValue?.('--background')?.trim() || (isLight ? '#FAFAFA' : '#131313');
      const fg = cs?.getPropertyValue?.('--foreground')?.trim() || (isLight ? '#383A42' : '#FAFAFA');
      const overlayKey = `${bg}|${fg}|40`;
      if (overlayKey === lastSyncedOverlayKey) return;
      lastSyncedOverlayKey = overlayKey;
      if (typeof window.contextMeterAPI?.syncOverlay === 'function') {
        void window.contextMeterAPI.syncOverlay({ color: bg, symbolColor: fg, height: 40, heightCssPx: 40 });
      } else if (typeof window.electronNative?.setTitleBarOverlay === 'function') {
        void window.electronNative.setTitleBarOverlay({ color: bg, symbolColor: fg });
      }
    } catch {}
  }

  function applyTheme() {
    const activeTheme = resolveTheme();
    const t = getDict();
    host.setAttribute('data-theme', activeTheme);
    const btn = el('theme-toggle');
    if (btn) {
      btn.setAttribute('aria-label', t.themeAria);
      const modeLabel =
        currentThemeMode === 'auto'
          ? t.themeAuto(activeTheme === 'light')
          : currentThemeMode === 'light'
            ? t.themeLight
            : t.themeDark;
      btn.title = t.themeTitle(modeLabel);
    }
    syncNativeOverlayTheme();
  }

  function applyThemeMode(nextMode) {
    currentThemeMode = nextMode;
    savePref('themeMode', currentThemeMode);
    applyTheme();
  }

  function cycleTheme() {
    const next = currentThemeMode === 'auto' ? 'light' : currentThemeMode === 'light' ? 'dark' : 'auto';
    applyThemeMode(next);
  }

  let initialized = false;
  function applyStaticLabels() {
    const lang = resolveLanguage();
    const t = UI_I18N[lang] || UI_I18N.en;
    host.setAttribute('lang', lang);

    el('badge')?.setAttribute('aria-label', t.badgeAria);
    el('panel')?.setAttribute('aria-label', t.panelAria);
    if (el('panel-title')) el('panel-title').textContent = t.panelTitle;

    const refreshBtn = el('refresh');
    if (refreshBtn) {
      refreshBtn.setAttribute('aria-label', t.refreshTitle);
      refreshBtn.title = t.refreshTitle;
    }

    const langBtn = el('lang-toggle');
    if (langBtn) {
      langBtn.textContent = t.langShort;
      langBtn.setAttribute('aria-label', t.langAria);
      langBtn.title = currentLangMode === 'auto' ? t.langTitleAuto(t.langName) : t.langTitlePinned(t.langName);
    }

    const closeBtn = el('close');
    if (closeBtn) {
      closeBtn.setAttribute('aria-label', t.closeAria);
      closeBtn.title = t.closeTitle;
    }

    const spLbl = el('label-speed');
    if (spLbl) {
      spLbl.textContent = t.speedLabel;
      spLbl.title = t.speedLabelTitle;
    }
    const ttftLbl = el('label-ttft');
    if (ttftLbl) {
      ttftLbl.textContent = t.ttftLabel;
      ttftLbl.title = t.ttftLabelTitle;
    }
    if (el('label-duration')) el('label-duration').textContent = t.durationLabel;
    if (el('label-output')) el('label-output').textContent = t.outputLabel;

    if (el('drawer-title')) el('drawer-title').textContent = t.drawerTitle;
    if (el('label-cat-system')) el('label-cat-system').textContent = t.catSystem;
    if (el('label-cat-tools')) el('label-cat-tools').textContent = t.catTools;
    if (el('label-cat-assistant')) el('label-cat-assistant').textContent = t.catAssistant;
    if (el('label-cat-thinking')) el('label-cat-thinking').textContent = t.catThinking;
    if (el('label-cat-user')) el('label-cat-user').textContent = t.catUser;
    if (el('label-cat-summaries')) el('label-cat-summaries').textContent = t.catSummaries;
    if (el('label-cat-attachment')) el('label-cat-attachment').textContent = t.catAttachment;
    if (el('comp-footnote')) el('comp-footnote').textContent = t.compFootnote;

    applyTheme();
    if (initialized) render();
  }

  function applyLanguageMode(nextMode) {
    const prevLang = resolveLanguage();
    currentLangMode = nextMode;
    savePref('langMode', currentLangMode);
    applyStaticLabels();
    if (prevLang !== resolveLanguage() && state.route && state.scan?.session?.unknownFiles > 0 && !state.scanBusy) {
      void scan(state.generation, state.route, false);
    }
  }

  function cycleLanguage() {
    const detected = detectHostLocale();
    const active = resolveLanguage();
    const idx = LANG_CYCLE.indexOf(active);
    const nextLang = LANG_CYCLE[(idx + 1) % LANG_CYCLE.length];
    applyLanguageMode(nextLang === detected ? 'auto' : nextLang);
  }

  let themeObserver = null;
  try {
    if (typeof MutationObserver !== 'undefined') {
      themeObserver = new MutationObserver(() => {
        applyTheme();
        if (currentLangMode === 'auto' && host.getAttribute('lang') !== resolveLanguage()) {
          applyStaticLabels();
        }
      });
      if (document.documentElement) {
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['class', 'style', 'data-theme', 'lang']
        });
      }
      if (document.body) {
        themeObserver.observe(document.body, {
          attributes: true,
          attributeFilter: ['class', 'style', 'data-theme', 'lang']
        });
      }
    }
  } catch {}

  const onLanguageChange = () => {
    if (currentLangMode === 'auto') applyStaticLabels();
  };
  try {
    window.addEventListener?.('languagechange', onLanguageChange);
  } catch {}

  applyStaticLabels();

  // ==========================================================================
  // 2. 宿主頂欄掛載、Windows 視窗控制鈕留白與寬度自適應
  // ==========================================================================
  let resizeObserver = null;
  let observedTitlebar = null;
  let elevatedStackAncestor = null;

  function findHostTitlebar() {
    try {
      return typeof document.querySelector === 'function'
        ? document.querySelector('[class*="@container/titlebar"]')
        : null;
    } catch {
      return null;
    }
  }

  function findTopRightCluster() {
    try {
      if (typeof document.querySelector !== 'function') return null;
      const auxToggle = document.querySelector('[data-testid="toggle-aux-sidebar"]');
      if (auxToggle?.closest) {
        const cluster = auxToggle.closest('div.absolute.right-0.top-0');
        if (cluster) return cluster;
      }
      return document.querySelector('div.h-screen.w-screen > div.flex-1 > div.absolute.right-0.top-0.z-50');
    } catch {
      return null;
    }
  }

  function computeWindowControlsWidth(topRight) {
    try {
      const plat = (typeof navigator !== 'undefined' && navigator.platform) || '';
      if (/^Mac|iPhone|iPad/i.test(plat)) return 0;
      if (topRight?.getBoundingClientRect) {
        const tr = topRight.getBoundingClientRect();
        if (tr.height > 0 && tr.top >= 20) return 0;
      }
      const vw = (typeof window !== 'undefined' && window.innerWidth) || 0;
      const wco = typeof navigator !== 'undefined' ? navigator.windowControlsOverlay : null;
      if (wco?.visible && typeof wco.getTitlebarAreaRect === 'function') {
        const rect = wco.getTitlebarAreaRect();
        if (rect && rect.width > 0 && vw > 0 && rect.width < vw) {
          return Math.max(0, Math.ceil(vw - rect.right));
        }
      }
      let zoomFactor = 1;
      if (typeof window !== 'undefined') {
        const nativeZoom = window.electronNative?.getZoomLevel?.();
        if (typeof nativeZoom === 'number' && nativeZoom >= 0.25 && nativeZoom <= 5) {
          zoomFactor = nativeZoom;
        } else if (window.outerWidth > 0 && window.innerWidth > 0) {
          const ratio = window.outerWidth / window.innerWidth;
          if (ratio >= 0.25 && ratio <= 5) zoomFactor = ratio;
        }
      }
      const rawCssWidth = Math.ceil(138 / zoomFactor);
      let existingSpacerWidth = 0;
      if (topRight?.querySelectorAll) {
        for (const sp of topRight.querySelectorAll('div[aria-hidden="true"]')) {
          if (sp.id !== 'ag-wco-spacer' && sp.getBoundingClientRect) {
            existingSpacerWidth += Math.round(sp.getBoundingClientRect().width || parseFloat(sp.style?.width) || 0);
          }
        }
      }
      return Math.max(0, rawCssWidth - existingSpacerWidth);
    } catch {
      return 98;
    }
  }

  function syncWindowControlsOverlay() {
    if (state.disposed) return;
    try {
      const topRight = findTopRightCluster();
      const wcoWidth = computeWindowControlsWidth(topRight);
      if (topRight && typeof document.createElement === 'function') {
        let spacer = typeof document.getElementById === 'function' ? document.getElementById('ag-wco-spacer') : null;
        if (wcoWidth > 0) {
          if (!spacer || spacer.parentElement !== topRight) {
            spacer?.remove?.();
            spacer = document.createElement('div');
            spacer.id = 'ag-wco-spacer';
            spacer.setAttribute('aria-hidden', 'true');
            topRight.appendChild(spacer);
          }
          const targetCss = `width:${wcoWidth}px;height:100%;flex-shrink:0;pointer-events:none;`;
          if (spacer.style.cssText !== targetCss) spacer.style.cssText = targetCss;
        } else if (spacer) {
          spacer.remove();
        }
      }

      if (document.head && typeof document.createElement === 'function') {
        let styleEl = typeof document.getElementById === 'function' ? document.getElementById('ag-topbar-host-fix') : null;
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = 'ag-topbar-host-fix';
          document.head.appendChild(styleEl);
        }
        const cssText = [
          '[data-aux-pane-focus-scope="true"] > div[data-active-tab-id] {',
          '  padding-right: calc(var(--right-cluster-width, 140px) - 4px) !important;',
          '}',
          wcoWidth > 0
            ? [
                '[class*="@container/titlebar"],',
                '[data-aux-pane-focus-scope="true"] > div[data-active-tab-id],',
                'div[role="navigation"][aria-label] > div.shrink-0:first-child { -webkit-app-region: drag; }',
                '[class*="@container/titlebar"] button, [class*="@container/titlebar"] a, [class*="@container/titlebar"] input,',
                '[class*="@container/titlebar"] [role="button"], [data-testid="pane-titlebar-toolbar"] > *,',
                '[data-aux-pane-focus-scope="true"] > div[data-active-tab-id] button,',
                '[data-aux-pane-focus-scope="true"] > div[data-active-tab-id] [data-tab-id],',
                'div[role="navigation"][aria-label] > div.shrink-0:first-child button,',
                'div[role="navigation"][aria-label] > div.shrink-0:first-child a,',
                '#ag-context-meter { -webkit-app-region: no-drag; }'
              ].join('\n')
            : ''
        ].join('\n');
        if (styleEl.textContent !== cssText) styleEl.textContent = cssText;
      }
      syncNativeOverlayTheme();
    } catch {}
  }

  function updateFixedFallbackPosition() {
    if (host.getAttribute?.('data-dock') === 'flow') {
      host.style.right = '';
      host.style.top = '';
      return;
    }
    try {
      const vw = (typeof window !== 'undefined' && window.innerWidth) || 1280;
      let rightOffset = 144;
      const anchor = findTopRightCluster();
      if (anchor?.getBoundingClientRect) {
        const r = anchor.getBoundingClientRect();
        if (r.width > 0 && r.left > 0 && r.left < vw) {
          rightOffset = Math.max(144, Math.ceil(vw - r.left + 6));
        }
      }
      host.style.top = '6px';
      host.style.right = `${rightOffset}px`;
    } catch {}
  }

  // 三段遲滯寬度自適應：wide <-> compact <-> ring-only
  function computeNextLayoutMode(availWidth, currentMode) {
    if (availWidth == null || Number.isNaN(availWidth)) return 'wide';
    if (currentMode === 'wide') {
      if (availWidth < 68) return 'ring-only';
      if (availWidth < 145) return 'compact';
      return 'wide';
    }
    if (currentMode === 'compact') {
      if (availWidth >= 160) return 'wide';
      if (availWidth < 68) return 'ring-only';
      return 'compact';
    }
    if (availWidth >= 160) return 'wide';
    if (availWidth >= 82) return 'compact';
    return 'ring-only';
  }

  function measureAvailableWidth() {
    try {
      const titlebar = findHostTitlebar();
      if (titlebar?.getBoundingClientRect) {
        const tbRect = titlebar.getBoundingClientRect();
        if (tbRect.width > 0) {
          const titleEl = titlebar.firstElementChild;
          const titleInner = titleEl?.firstElementChild;
          const contentStart = titleInner?.getBoundingClientRect
            ? Math.max(8, titleInner.getBoundingClientRect().left - tbRect.left)
            : tbRect.left < 168
              ? 168 - tbRect.left
              : 12;
          const titleRealW = titleEl?.scrollWidth ? Math.min(300, titleEl.scrollWidth) : 150;
          const minTitleWidth = Math.max(140, titleRealW);
          let nativeButtonsWidth = 64;
          let rightPad = 8;
          const rightGroup = host.parentElement;
          if (rightGroup && rightGroup !== titlebar) {
            const auxOpen = typeof document.querySelector === 'function' && !!document.querySelector('[data-testid="aux-pane-sash"]');
            const root = typeof document.querySelector === 'function' ? document.querySelector('div.h-screen.w-screen') : null;
            const rightClusterVar = root?.style?.getPropertyValue?.('--right-cluster-width')?.trim() || '';
            if (auxOpen) rightPad = 8;
            else if (rightClusterVar) rightPad = Math.max(8, (parseFloat(rightClusterVar) || 44) - 4);
            else if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
              rightPad = parseFloat(window.getComputedStyle(rightGroup).paddingRight) || 0;
            }
            if (rightGroup.children) {
              let sum = 0;
              for (const child of rightGroup.children) {
                if (child !== host && child.getBoundingClientRect) {
                  sum += child.getBoundingClientRect().width;
                }
              }
              if (sum > 0) nativeButtonsWidth = sum + 6;
            }
          }
          return tbRect.width - contentStart - minTitleWidth - rightPad - nativeButtonsWidth;
        }
      }
      if (typeof window !== 'undefined' && window.innerWidth) return window.innerWidth - 340;
    } catch {}
    return 320;
  }

  function applyLayoutMode(nextMode) {
    if (!nextMode) return;
    state.layoutMode = nextMode;
    host.setAttribute('data-layout', nextMode);
  }

  function updateResponsiveLayout() {
    if (state.disposed) return;
    syncWindowControlsOverlay();
    const avail = measureAvailableWidth();
    applyLayoutMode(computeNextLayoutMode(avail, state.layoutMode));
    if (state.tooltipOpen) positionContextTooltip();
    if (!el('panel')?.hidden) positionFloatingPanel();
  }

  function ensureHostDocked() {
    if (state.disposed) return;
    syncWindowControlsOverlay();
    const titlebar = findHostTitlebar();
    if (titlebar) {
      try {
        const convPane = titlebar.closest?.('div.flex[style*="min-width"]');
        if (convPane?.style && (!convPane.style.flexGrow || convPane.style.flexGrow === '0')) {
          convPane.style.flexGrow = '1';
        }
      } catch {}

      let targetContainer = titlebar;
      try {
        const rightGroup = titlebar.querySelector(':scope > div.shrink-0') || titlebar.lastElementChild;
        if (rightGroup && rightGroup !== titlebar.firstElementChild) targetContainer = rightGroup;
      } catch {}

      if (host.parentElement !== targetContainer) {
        if (targetContainer.firstChild && targetContainer !== titlebar) {
          targetContainer.insertBefore(host, targetContainer.firstChild);
        } else {
          targetContainer.appendChild(host);
        }
      }
      host.setAttribute('data-dock', 'flow');
      host.style.right = '';
      host.style.top = '';

      if (observedTitlebar !== titlebar) {
        observedTitlebar = titlebar;
        try {
          if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver.observe(titlebar);
            if (document.body) resizeObserver.observe(document.body);
          }
        } catch {}
      }
    } else {
      const fallbackParent = document.body || document.documentElement;
      if (fallbackParent && host.parentElement !== fallbackParent) fallbackParent.appendChild(host);
      host.setAttribute('data-dock', 'fixed');
      updateFixedFallbackPosition();
    }
    updateResponsiveLayout();
  }

  try {
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => updateResponsiveLayout());
      if (document.body) resizeObserver.observe(document.body);
    }
  } catch {}

  const onWindowResize = () => updateResponsiveLayout();
  const onWindowFocus = () => host.setAttribute('data-window-active', 'true');
  const onWindowBlur = () => host.setAttribute('data-window-active', 'false');
  try {
    window.addEventListener?.('resize', onWindowResize);
    window.addEventListener?.('focus', onWindowFocus);
    window.addEventListener?.('blur', onWindowBlur);
    navigator?.windowControlsOverlay?.addEventListener?.('geometrychange', onWindowResize);
  } catch {}

  ensureHostDocked();

  // ==========================================================================
  // 3. 浮動定位、懸停氣泡與面板互動
  // ==========================================================================
  function syncHostStackingElevation(elevate) {
    try {
      if (elevate) {
        const z0 = host.closest?.('div.relative.z-0');
        if (z0?.style) {
          elevatedStackAncestor = z0;
          z0.style.zIndex = '40';
        }
      } else if (elevatedStackAncestor?.style) {
        elevatedStackAncestor.style.zIndex = '';
        elevatedStackAncestor = null;
      }
    } catch {}
  }

  function getLeftSidebarRight(vw) {
    try {
      const navEl = typeof document.querySelector === 'function' ? document.querySelector('div[role="navigation"]') : null;
      if (navEl?.getBoundingClientRect) {
        const nr = navEl.getBoundingClientRect();
        if (nr.width > 0 && nr.left <= 8 && nr.right > 0 && nr.right < vw - 260) {
          return Math.ceil(nr.right);
        }
      }
    } catch {}
    return 0;
  }

  function positionContextTooltip() {
    const tip = el('context-tooltip');
    const badge = el('badge');
    if (!tip || !badge?.getBoundingClientRect) return;
    try {
      const bRect = badge.getBoundingClientRect();
      if (bRect.width === 0 && bRect.height === 0) return;
      const tRect = tip.getBoundingClientRect ? tip.getBoundingClientRect() : { width: 180, height: 48 };
      const tipW = tRect.width || 180;
      const tipH = tRect.height || 48;
      const vw = (typeof window !== 'undefined' && window.innerWidth) || 1280;
      const vh = (typeof window !== 'undefined' && window.innerHeight) || 800;
      const gap = 6;

      let top = bRect.bottom + gap;
      if (top + tipH > vh - 8 && bRect.top > tipH + gap + 6) {
        top = bRect.top - tipH - gap;
      }
      top = Math.max(6, Math.min(vh - tipH - 6, Math.round(top)));

      let left = Math.round(bRect.right - tipW);
      if (bRect.width > tipW) left = Math.round(bRect.left + (bRect.width - tipW) / 2);
      left = Math.max(8, Math.min(vw - tipW - 8, left));

      tip.style.top = `${top}px`;
      tip.style.left = `${left}px`;
    } catch {}
  }

  let hoverTimer = null;
  function showContextTooltip(immediate = false) {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    const openNow = () => {
      const tip = el('context-tooltip');
      if (!tip || !el('panel')?.hidden) return;
      state.tooltipOpen = true;
      tip.setAttribute('data-visible', 'true');
      positionContextTooltip();
    };
    if (immediate) openNow();
    else hoverTimer = setTimeout(openNow, 90);
  }

  function hideContextTooltip() {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    const tip = el('context-tooltip');
    if (!tip) return;
    state.tooltipOpen = false;
    tip.setAttribute('data-visible', 'false');
  }

  function positionFloatingPanel() {
    const panelEl = el('panel');
    const badge = el('badge');
    if (!panelEl || !host.getBoundingClientRect) return;
    try {
      const bRect = badge?.getBoundingClientRect?.() || host.getBoundingClientRect();
      if (bRect.width === 0 && bRect.height === 0) return;
      const vw = (typeof window !== 'undefined' && window.innerWidth) || 1280;
      const vh = (typeof window !== 'undefined' && window.innerHeight) || 800;
      const minLeft = Math.max(12, getLeftSidebarRight(vw) + 12);
      const targetW = 376;
      const maxAvailW = Math.max(260, vw - minLeft - 12);
      const effW = Math.min(targetW, maxAvailW);

      const top = Math.max(36, Math.min(vh - 120, Math.round(bRect.bottom + 6)));
      let left = Math.round(bRect.right - effW);
      left = Math.min(left, vw - effW - 12);
      left = Math.max(minLeft, left);

      panelEl.style.top = `${top}px`;
      panelEl.style.left = `${left}px`;
      panelEl.style.maxWidth = `${maxAvailW}px`;
      panelEl.style.transformOrigin = 'top right';
    } catch {}
  }

  function setDrawerExpanded(expanded, persist = true) {
    state.drawerOpen = Boolean(expanded);
    const body = el('drawer-body');
    const btn = el('btn-toggle-details');
    if (body) body.hidden = !state.drawerOpen;
    btn?.setAttribute('aria-expanded', String(state.drawerOpen));
    if (persist) savePref('drawerOpen', state.drawerOpen);
  }

  setDrawerExpanded(state.drawerOpen, false);

  function togglePanel(forceOpen) {
    const panelEl = el('panel');
    const badge = el('badge');
    if (!panelEl) return;
    const willOpen = typeof forceOpen === 'boolean' ? forceOpen : panelEl.hidden;
    if (willOpen) {
      hideContextTooltip();
      panelEl.hidden = false;
      badge?.setAttribute('aria-expanded', 'true');
      syncHostStackingElevation(true);
      positionFloatingPanel();
    } else {
      panelEl.hidden = true;
      badge?.setAttribute('aria-expanded', 'false');
      syncHostStackingElevation(false);
    }
  }

  const badgeEl = el('badge');
  badgeEl?.addEventListener('click', () => togglePanel());
  badgeEl?.addEventListener('mouseenter', () => showContextTooltip(false));
  badgeEl?.addEventListener('mouseleave', () => hideContextTooltip());
  badgeEl?.addEventListener('focus', () => showContextTooltip(true));
  badgeEl?.addEventListener('blur', () => hideContextTooltip());

  el('close')?.addEventListener('click', () => togglePanel(false));
  el('lang-toggle')?.addEventListener('click', () => cycleLanguage());
  el('theme-toggle')?.addEventListener('click', () => cycleTheme());
  el('btn-toggle-details')?.addEventListener('click', () => setDrawerExpanded(!state.drawerOpen, true));
  el('refresh')?.addEventListener('click', () => {
    if (state.route && !state.scanBusy) void scan(state.generation, state.route, true);
  });

  const onOutsideClick = e => {
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    if (!path.includes(host)) {
      togglePanel(false);
      hideContextTooltip();
    }
  };

  const onEscapeKey = e => {
    if (e.key === 'Escape' && !el('panel')?.hidden) {
      togglePanel(false);
      hideContextTooltip();
      badgeEl?.focus?.();
    }
  };

  document.addEventListener('click', onOutsideClick);
  document.addEventListener('keydown', onEscapeKey);

  // ==========================================================================
  // 4. 狀態整合與高可讀性渲染
  // ==========================================================================
  function withStepError(value, metadata) {
    const error = state.scan?.session?.currentError;
    if (!error || value?.error) return value;
    const lastStep = Math.max(
      -1,
      ...(metadata?.stepIndices || []),
      metadata?.chatModel?.chatStartMetadata?.startStepIndex ?? -1
    );
    if (lastStep > error.index) return value;
    const failure = summarize(
      { chatModel: { retryInfos: [{ error: error.text }] } },
      {
        lang: resolveLanguage(),
        currentModel: value?.model || state.latest?.model || '',
        cascadeModelConfigs: state.cascadeModelConfigs,
        previousValidContext: value
      }
    );
    return {
      ...(value || {}),
      error: failure.error,
      errorClassification: failure.errorClassification,
      exceeded: failure.exceeded,
      network: failure.network,
      serviceLimit: failure.serviceLimit || value?.serviceLimit || null,
      status: failure.status,
      used: value?.used ?? failure?.used ?? null,
      actual: failure.exceeded ? null : (value?.actual ?? null),
      estimate: value?.estimate ?? failure?.estimate ?? null,
      budget: value?.budget ?? failure?.budget ?? null,
      percent: failure.exceeded ? 100 : (value?.percent ?? null),
      estimated: value?.actual == null
    };
  }

  function resolveErrorInfo(d) {
    if (!d) return null;
    const lang = resolveLanguage();
    if (d.error && typeof classifyRequestError === 'function') {
      return classifyRequestError(d.error, {
        lang,
        currentModel: d.model || '',
        cascadeModelConfigs: state.cascadeModelConfigs
      });
    }
    if (d.errorClassification && d.errorClassification.kind && d.errorClassification.kind !== 'none') {
      return d.errorClassification;
    }
    return null;
  }

  function getSessionCategoryWeights(session) {
    if (!session) return { entries: [], totalWeight: 0, shares: {} };
    const sysWeight = tokenWeight(session.groups?.system) + tokenWeight(session.groups?.definitions);
    const entries = [
      { id: 'system', rowId: 'row-system', segId: 'seg-sys', weight: sysWeight },
      { id: 'tools', rowId: 'row-tools', segId: 'seg-tool', weight: tokenWeight(session.groups?.tools) },
      { id: 'assistant', rowId: 'row-assistant', segId: 'seg-ast', weight: tokenWeight(session.groups?.assistant) },
      { id: 'thinking', rowId: 'row-thinking', segId: 'seg-thk', weight: tokenWeight(session.groups?.thinking) },
      { id: 'user', rowId: 'row-user', segId: 'seg-usr', weight: tokenWeight(session.groups?.user) },
      { id: 'summaries', rowId: 'row-summaries', segId: 'seg-sum', weight: tokenWeight(session.groups?.summaries) },
      { id: 'attachment-total', rowId: 'row-attachment', segId: 'seg-att', weight: tokenWeight(session.attachmentTotal) }
    ];
    if (typeof computeContextShares === 'function') {
      const { totalWeight, shares } = computeContextShares(entries);
      return { entries, totalWeight, shares };
    }
    const totalWeight = entries.reduce((s, e) => s + e.weight, 0);
    const shares = {};
    for (const e of entries) {
      const ratio = totalWeight > 0 ? e.weight / totalWeight : 0;
      shares[e.id] = { weight: e.weight, ratio, percent: ratio * 100, text: formatPct(ratio * 100) };
    }
    return { entries, totalWeight, shares };
  }

  function updateRing(pct, exceeded, estimated) {
    const ringFill = el('ring-fill');
    if (!ringFill) return;
    if (exceeded) {
      ringFill.setAttribute('data-ring-state', 'exceeded');
      ringFill.setAttribute('stroke-dasharray', `${RING_CIRCUMFERENCE.toFixed(2)} ${RING_CIRCUMFERENCE.toFixed(2)}`);
      ringFill.style.opacity = '1';
      return;
    }
    if (pct != null) {
      ringFill.setAttribute('data-ring-state', 'determinate');
      if (pct <= 0) {
        ringFill.setAttribute('stroke-dasharray', `0 ${RING_CIRCUMFERENCE.toFixed(2)}`);
        ringFill.style.opacity = '0';
      } else {
        const arcLen = Math.max(1.8, (Math.min(100, pct) / 100) * RING_CIRCUMFERENCE);
        ringFill.setAttribute('stroke-dasharray', `${arcLen.toFixed(2)} ${RING_CIRCUMFERENCE.toFixed(2)}`);
        ringFill.style.opacity = '1';
      }
      return;
    }
    ringFill.setAttribute('data-ring-state', estimated ? 'estimated' : 'unknown');
    ringFill.setAttribute('stroke-dasharray', '2.6 4.2');
    ringFill.style.opacity = '0.52';
  }

  function updateTopCapsule(d, pct, errInfo) {
    const t = getDict();
    const pctEl = el('badge-pct-val');
    const sepEl = el('badge-speed-sep');
    const speedWrap = el('badge-speed-wrap');
    const liveDot = el('badge-live-dot');
    const speedAmt = el('speed-amount');
    const srAmt = el('amount');

    if (!state.route) {
      if (pctEl) pctEl.textContent = '—';
      if (srAmt) srAmt.textContent = t.noActiveChat;
      if (sepEl) sepEl.hidden = true;
      if (speedWrap) {
        speedWrap.hidden = true;
        speedWrap.removeAttribute('data-speed-tier');
      }
      return;
    }

    if (errInfo && errInfo.kind !== 'canceled') {
      if (pctEl) pctEl.textContent = errInfo.badgeText || t.errorFallback;
      if (srAmt) srAmt.textContent = errInfo.title || t.errorFallback;
    } else if (pct != null) {
      const rounded = pct > 0 && pct < 1 ? 1 : Math.round(pct);
      if (pctEl) pctEl.textContent = `${rounded}%`;
      if (srAmt) srAmt.textContent = `${short(d?.actual)} (${rounded}%)`;
    } else if (d?.estimate && d?.budget) {
      const estPct = Math.min(99, Math.max(1, Math.round((d.estimate / d.budget) * 100)));
      if (pctEl) pctEl.textContent = `~${estPct}%`;
      if (srAmt) srAmt.textContent = t.approxVal(short(d.estimate));
    } else {
      if (pctEl) pctEl.textContent = '—';
      if (srAmt) srAmt.textContent = d?.actual != null ? short(d.actual) : t.estimating;
    }

    const sp = d?.speed;
    const spTier = getSpeedTier(sp);
    if (speedWrap) {
      if (spTier) speedWrap.setAttribute('data-speed-tier', spTier.level);
      else speedWrap.removeAttribute('data-speed-tier');
    }
    if (state.requestBusy) {
      if (sepEl) sepEl.hidden = false;
      if (speedWrap) speedWrap.hidden = false;
      if (liveDot) liveDot.hidden = false;
      if (speedAmt) speedAmt.textContent = sp?.tps != null ? `${sp.tps} tok/s` : '';
    } else if (sp?.tps != null) {
      if (sepEl) sepEl.hidden = false;
      if (speedWrap) speedWrap.hidden = false;
      if (liveDot) liveDot.hidden = true;
      if (speedAmt) speedAmt.textContent = `${sp.tps} tok/s`;
    } else {
      if (sepEl) sepEl.hidden = true;
      if (speedWrap) speedWrap.hidden = true;
    }
  }

  function updateTooltipText(d, session, pct, errInfo, incomplete) {
    const t = getDict();
    const tipPct = el('ctx-tip-pct');
    const tipDet = el('ctx-tip-detail');
    if (!tipPct || !tipDet) return;

    if (!state.route) {
      tipPct.textContent = t.noActiveChat;
      tipDet.textContent = t.tipIdleDetail;
      return;
    }

    const spTier = getSpeedTier(d?.speed);
    const speedSuffix =
      d?.speed?.tps != null ? ` · ${d.speed.tps} tok/s${spTier ? ` (${spTier.label})` : ''}` : '';

    if (errInfo && errInfo.kind !== 'canceled') {
      tipPct.textContent = `${errInfo.title}`;
      tipDet.textContent = errInfo.detail;
      return;
    }

    if (d?.actual != null && d?.budget) {
      const usedRound = pct > 0 && pct < 1 ? 1 : Math.round(pct);
      const remTokens = Math.max(0, d.budget - d.actual);
      tipPct.textContent = t.tipActualBudget(usedRound, short(remTokens));
      tipDet.textContent = `${short(d.actual)} / ${short(d.budget)} tokens${incomplete ? t.incompleteSuffix : ''}${speedSuffix}`;
    } else if (d?.actual != null) {
      tipPct.textContent = t.tipActualOnly(short(d.actual));
      tipDet.textContent = `${t.tipNoLimit}${speedSuffix}`;
    } else if (d?.estimate != null) {
      tipPct.textContent = t.tipEst(short(d.estimate));
      tipDet.textContent = `${d.budget ? t.tipLimit(short(d.budget)) : t.tipAwaitActual}${speedSuffix}`;
    } else if (session) {
      const estTok = Math.round(tokenWeight(session.total));
      tipPct.textContent = estTok > 0 ? t.loadedSteps(session.activeSteps ?? session.steps) : t.chatOpened;
      tipDet.textContent = t.tipWaitFirst;
    } else {
      tipPct.textContent = t.tipReading;
      tipDet.textContent = t.tipSyncing;
    }

    if (state.tooltipOpen) positionContextTooltip();
  }

  function renderUsageChips(d, session) {
    const t = getDict();
    const container = el('usage-chips');
    if (!container) return;
    container.replaceChildren();

    if (!state.route) {
      const span = document.createElement('span');
      span.textContent = t.usageIdleHint;
      container.appendChild(span);
      return;
    }

    if (d?.actual != null) {
      const cached = d.cached || 0;
      const fresh = d.freshInput != null ? d.freshInput : Math.max(0, (d.input || 0) - cached);
      const out = d.output || 0;

      const items = [];
      if (cached > 0) items.push({ label: t.chipCache(short(cached)), cls: 'u-dot u-dot-cache' });
      items.push({ label: t.chipInput(short(fresh)), cls: 'u-dot' });
      items.push({ label: t.chipOutput(short(out)), cls: 'u-dot u-dot-out' });

      for (const it of items) {
        const chip = document.createElement('span');
        chip.className = 'u-chip';
        const dot = document.createElement('i');
        dot.className = it.cls;
        const txt = document.createElement('span');
        txt.textContent = it.label;
        chip.appendChild(dot);
        chip.appendChild(txt);
        container.appendChild(chip);
      }
      return;
    }

    const hint = document.createElement('span');
    hint.textContent = d?.estimate ? t.hintEst : session ? t.hintNoCalls : t.hintSyncing;
    container.appendChild(hint);
  }

  function renderAlertBanner(tone, message) {
    const alertBanner = el('alert-banner');
    if (!alertBanner) return;
    if (!message) {
      alertBanner.hidden = true;
      return;
    }
    alertBanner.hidden = false;
    alertBanner.setAttribute('data-tone', tone || 'neutral');
    const target = el('alert-text') || alertBanner;
    target.replaceChildren();

    const str = String(message);
    const cmdRe = /(^|[\s(（])(\/[a-z][a-z0-9-]*)(?=[\s.,;!?，。；！）)]|$)/g;
    let lastIndex = 0;
    let m;
    while ((m = cmdRe.exec(str)) !== null) {
      const prefixEnd = m.index + m[1].length;
      if (prefixEnd > lastIndex) {
        const span = document.createElement('span');
        span.textContent = str.slice(lastIndex, prefixEnd);
        target.appendChild(span);
      }
      const code = document.createElement('code');
      code.className = 'alert-cmd';
      code.textContent = m[2];
      target.appendChild(code);
      lastIndex = prefixEnd + m[2].length;
    }
    if (lastIndex < str.length) {
      const span = document.createElement('span');
      span.textContent = str.slice(lastIndex);
      target.appendChild(span);
    }
  }

  const COMP_EMPTY_ROWS = [
    { id: 'system', rowId: 'row-system', segId: 'seg-sys' },
    { id: 'tools', rowId: 'row-tools', segId: 'seg-tool' },
    { id: 'assistant', rowId: 'row-assistant', segId: 'seg-ast' },
    { id: 'thinking', rowId: 'row-thinking', segId: 'seg-thk' },
    { id: 'user', rowId: 'row-user', segId: 'seg-usr' },
    { id: 'summaries', rowId: 'row-summaries', segId: 'seg-sum' },
    { id: 'attachment-total', rowId: 'row-attachment', segId: 'seg-att' }
  ];

  function renderComposition(d, session, incomplete) {
    const t = getDict();
    const stepsPill = el('steps-pill');
    const sessionTotal = el('session-total');
    if (stepsPill) {
      if (session) {
        const shownSteps = session.activeSteps ?? session.steps;
        stepsPill.hidden = false;
        stepsPill.textContent = t.stepsCount(shownSteps);
        stepsPill.title = session.compacted
          ? t.stepsTitleCompacted(shownSteps, session.steps, session.userMessages, session.assistantMessages)
          : t.stepsTitleNormal(session.userMessages, session.assistantMessages);
      } else {
        stepsPill.hidden = true;
      }
    }

    const { entries, totalWeight, shares } = getSessionCategoryWeights(session);

    if (sessionTotal) {
      if (!session) {
        sessionTotal.textContent = state.scanBusy ? t.scanning : state.route ? t.pendingScan : '—';
      } else if (d?.actual != null) {
        sessionTotal.textContent = t.totalVal(short(d.actual), incomplete);
      } else if (d?.estimate != null) {
        sessionTotal.textContent = t.approxTotalVal(short(d.estimate), incomplete);
      } else {
        sessionTotal.textContent = totalWeight > 0 ? '100%' : '0%';
      }
    }

    const rows = entries.length ? entries : COMP_EMPTY_ROWS;
    for (const item of rows) {
      const valEl = el(item.id);
      const rowEl = el(item.rowId);
      const share = shares[item.id] || { weight: 0, ratio: 0, percent: 0, text: '0%' };
      if (valEl) {
        if (!session) {
          valEl.textContent = '—';
        } else if (item.id === 'attachment-total' && incomplete) {
          valEl.textContent = share.weight > 0 ? `${share.text}+` : t.unknownShare;
        } else {
          valEl.textContent = share.text;
        }
      }
      if (rowEl) {
        const isZero = Boolean(session && share.weight === 0 && !(item.id === 'attachment-total' && incomplete));
        rowEl.setAttribute('data-zero', isZero ? 'true' : 'false');
        let tip = '';
        if (session && share.ratio > 0 && d?.actual != null) {
          tip = t.rowTipActual(short(Math.round(d.actual * share.ratio)), share.text);
        } else if (session && share.ratio > 0) {
          tip = t.rowTipShare(share.text);
        }
        if (item.id === 'attachment-total' && session?.attachments?.length) {
          const names = session.attachments.slice(0, 4).map(a => a.name).join(t.fileJoiner);
          const more = session.attachments.length > 4 ? t.moreFiles(session.attachments.length) : '';
          tip = tip ? `${tip} · ${names}${more}` : `${names}${more}`;
        }
        rowEl.title = tip;
      }
      if (item.segId) {
        const segEl = el(item.segId);
        if (segEl) {
          segEl.style.flexGrow = session && share.ratio > 0 ? String(Math.max(0.025, share.ratio)) : '0';
        }
      }
    }

    const updatedEl = el('updated');
    if (updatedEl) {
      const ts = Math.max(state.requestAt || 0, state.scan?.scannedAt || 0);
      updatedEl.textContent = ts > 0 ? t.updatedAt(new Date(ts).toLocaleTimeString([], { hour12: false })) : '—';
    }
  }

  function render() {
    if (state.disposed) return;
    const t = getDict();
    host.hidden = false;
    host.setAttribute('data-has-session', state.route ? 'true' : 'false');
    ensureHostDocked();

    const refreshBtn = el('refresh');
    if (refreshBtn) {
      refreshBtn.disabled = !state.route || state.scanBusy;
      refreshBtn.setAttribute('data-busy', state.scanBusy ? 'true' : 'false');
    }

    if (!state.route) {
      host.setAttribute('data-occupancy', 'normal');
      updateRing(null, false, false);
      updateTopCapsule(null, null, null);
      updateTooltipText(null, null, null, null, false);

      const modelEl = el('model');
      if (modelEl) modelEl.hidden = true;
      const keyBadge = el('key-badge');
      if (keyBadge) {
        keyBadge.textContent = t.statusIdle;
        keyBadge.className = 'status-pill pill-muted';
      }
      const heroPct = el('key-pct-hero');
      if (heroPct) heroPct.textContent = '—';
      const heroFrac = el('key-fraction');
      if (heroFrac) heroFrac.textContent = t.noActiveChat;
      const heroRem = el('key-remaining');
      if (heroRem) heroRem.textContent = '';
      const barFill = el('key-bar-fill');
      if (barFill) barFill.style.width = '0%';
      const cacheFill = el('bar-cache-fill');
      if (cacheFill) cacheFill.style.width = '0%';
      const alertBanner = el('alert-banner');
      if (alertBanner) alertBanner.hidden = true;

      renderUsageChips(null, null);
      const idleSpBadge = el('speed-badge');
      if (idleSpBadge) {
        idleSpBadge.textContent = t.statusIdle;
        idleSpBadge.className = 'speed-pill pill-muted';
        idleSpBadge.title = '';
      }
      const idleSpVal = el('speed-val');
      if (idleSpVal) {
        idleSpVal.textContent = '—';
        idleSpVal.removeAttribute('data-speed-tier');
        idleSpVal.title = '';
      }
      if (el('speed-ttft')) el('speed-ttft').textContent = '—';
      if (el('speed-duration')) el('speed-duration').textContent = '—';
      if (el('speed-output')) el('speed-output').textContent = '—';
      renderComposition(null, null, false);
      return;
    }

    const d = state.latest;
    const session = state.scan?.session;
    const errInfo = resolveErrorInfo(d);
    const isHardError = Boolean(errInfo && errInfo.kind !== 'none' && errInfo.kind !== 'canceled');
    const stale = Boolean(state.requestError || (state.requestAt && Date.now() - state.requestAt > 25000));
    const incomplete = Boolean(session?.unknownFiles > 0);
    const exceeded = Boolean(d?.exceeded || errInfo?.kind === 'context_overflow');

    let pct = null;
    if (exceeded) {
      pct = 100;
    } else if (d?.percent != null && !stale) {
      pct = Math.min(100, Math.max(0, d.percent));
    } else if (d?.actual != null && d?.budget && !stale) {
      pct = Math.min(100, Math.max(0, (d.actual / d.budget) * 100));
    }

    let occupancy = 'normal';
    if (exceeded || isHardError || (pct != null && pct >= 90)) occupancy = 'danger';
    else if ((pct != null && pct >= 75) || stale) occupancy = 'warn';
    host.setAttribute('data-occupancy', occupancy);

    updateRing(pct, exceeded, d?.estimated);
    updateTopCapsule(d, pct, errInfo);
    updateTooltipText(d, session, pct, errInfo, incomplete);

    // 模型標籤
    const modelEl = el('model');
    if (modelEl) {
      const rawModel = d?.model || '';
      const label = d?.modelLabel || (typeof formatModelLabel === 'function' ? formatModelLabel(rawModel) : rawModel);
      if (label) {
        modelEl.hidden = false;
        modelEl.textContent = label;
        modelEl.title = rawModel;
      } else {
        modelEl.hidden = true;
      }
    }

    // 狀態膠囊與主視覺數字
    const keyBadge = el('key-badge');
    const heroPct = el('key-pct-hero');
    const heroFrac = el('key-fraction');
    const heroRem = el('key-remaining');
    const barFill = el('key-bar-fill');
    const cacheFill = el('bar-cache-fill');

    if (exceeded) {
      if (keyBadge) {
        keyBadge.textContent = t.statusOverflow;
        keyBadge.className = 'status-pill pill-danger';
      }
      if (heroPct) heroPct.textContent = '100%+';
      const limit = d?.serviceLimit || d?.budget;
      if (heroFrac) heroFrac.textContent = limit ? t.overLimit(short(limit)) : t.overServerLimit;
      if (heroRem) heroRem.textContent = t.zeroLeft;
      if (barFill) barFill.style.width = '100%';
      if (cacheFill) cacheFill.style.width = '0%';
    } else if (d?.actual != null && d?.budget) {
      const rawPct = (d.actual / d.budget) * 100;
      const remainVal = Math.max(0, d.budget - d.actual);
      if (keyBadge) {
        if (isHardError) {
          keyBadge.textContent = errInfo.badgeText;
          keyBadge.className = 'status-pill pill-danger';
        } else if (rawPct >= 90) {
          keyBadge.textContent = t.statusTight;
          keyBadge.className = 'status-pill pill-danger';
        } else if (rawPct >= 75) {
          keyBadge.textContent = t.statusHigh;
          keyBadge.className = 'status-pill pill-warn';
        } else {
          keyBadge.textContent = t.statusOk;
          keyBadge.className = 'status-pill pill-good';
        }
      }
      if (heroPct) heroPct.textContent = `${rawPct < 10 ? rawPct.toFixed(1) : Math.round(rawPct)}%`;
      if (heroFrac) heroFrac.textContent = `${short(d.actual)} / ${short(d.budget)}`;
      if (heroRem) heroRem.textContent = t.leftVal(short(remainVal));
      if (barFill) barFill.style.width = `${Math.min(100, Math.max(1.2, rawPct)).toFixed(1)}%`;
      if (cacheFill) {
        const cachePct = d.cached > 0 ? Math.min(rawPct, (d.cached / d.budget) * 100) : 0;
        cacheFill.style.width = `${cachePct.toFixed(1)}%`;
      }
    } else if (d?.actual != null) {
      if (keyBadge) {
        keyBadge.textContent = isHardError ? errInfo.badgeText : t.statusRecorded;
        keyBadge.className = isHardError ? 'status-pill pill-danger' : 'status-pill pill-good';
      }
      if (heroPct) heroPct.textContent = short(d.actual);
      if (heroFrac) heroFrac.textContent = t.tokensNoLimit;
      if (heroRem) heroRem.textContent = '';
      if (barFill) barFill.style.width = '0%';
      if (cacheFill) cacheFill.style.width = '0%';
    } else if (d?.estimate != null) {
      const estPct = d.budget ? Math.min(100, (d.estimate / d.budget) * 100) : null;
      if (keyBadge) {
        keyBadge.textContent = isHardError ? errInfo.badgeText : t.statusEst;
        keyBadge.className = isHardError ? 'status-pill pill-danger' : 'status-pill pill-muted';
      }
      if (heroPct) heroPct.textContent = estPct != null ? `~${Math.round(estPct)}%` : `~${short(d.estimate)}`;
      if (heroFrac) {
        heroFrac.textContent = d.budget ? `${t.approxVal(short(d.estimate))} / ${short(d.budget)}` : t.tokensLocalEst;
      }
      if (heroRem) heroRem.textContent = d.budget ? t.approxLeftVal(short(Math.max(0, d.budget - d.estimate))) : '';
      if (barFill) barFill.style.width = estPct != null ? `${estPct.toFixed(1)}%` : '0%';
      if (cacheFill) cacheFill.style.width = '0%';
    } else {
      if (keyBadge) {
        keyBadge.textContent = isHardError ? errInfo.badgeText : state.scanBusy ? t.statusSyncing : t.statusReady;
        keyBadge.className = isHardError ? 'status-pill pill-danger' : 'status-pill pill-muted';
      }
      if (heroPct) heroPct.textContent = '—';
      if (heroFrac) {
        heroFrac.textContent = session
          ? t.loadedSteps(session.activeSteps ?? session.steps)
          : t.waitingRequestData;
      }
      if (heroRem) heroRem.textContent = '';
      if (barFill) barFill.style.width = '0%';
      if (cacheFill) cacheFill.style.width = '0%';
    }

    renderUsageChips(d, session);

    // 警示橫幅（僅在異常、超限、高佔用或含未知附件時顯示，健康狀態零干擾）
    if (errInfo && errInfo.kind !== 'none') {
      renderAlertBanner(errInfo.kind === 'canceled' ? 'neutral' : 'danger', errInfo.detail);
    } else if (pct != null && pct >= 90) {
      renderAlertBanner('danger', t.alertHighOccupancy);
    } else if (stale && state.requestError) {
      renderAlertBanner('warn', t.alertStale(formatRuntimeError(state.requestError, t)));
    } else if (incomplete) {
      renderAlertBanner('warn', t.alertUnknownFiles(session.unknownFiles));
    } else if (state.scanError && !session) {
      renderAlertBanner('warn', formatRuntimeError(state.scanError, t));
    } else {
      renderAlertBanner(null, '');
    }

    // 生成效能四欄格
    const sp = d?.speed;
    const spBadge = el('speed-badge');
    const spVal = el('speed-val');
    const spTtft = el('speed-ttft');
    const spDur = el('speed-duration');
    const spOut = el('speed-output');
    const spTier = getSpeedTier(sp);

    if (spBadge) {
      if (spTier) {
        spBadge.textContent = spTier.label;
        spBadge.className = `speed-pill pill-${spTier.tone}`;
      } else {
        spBadge.textContent = state.requestBusy ? t.speedMeasuring : t.statusIdle;
        spBadge.className = 'speed-pill pill-muted';
      }
    }

    if (sp?.tps != null || sp?.duration != null || sp?.outputTokens) {
      const ttftShare =
        sp.ttft != null && sp.duration != null && sp.duration > 0
          ? Math.round((sp.ttft / sp.duration) * 100)
          : null;
      const tipParts = [];
      if (sp.streamingTps) {
        tipParts.push(t.speedStreamingTps(sp.streamingTps));
      } else if (sp.tps != null) {
        tipParts.push(t.speedIncludesTtft);
      }
      if (ttftShare != null && ttftShare >= 50) {
        tipParts.push(t.speedTtftShare(ttftShare));
      }
      const speedTip = tipParts.join(' · ');

      if (spBadge) spBadge.title = speedTip;
      if (spVal) {
        spVal.textContent = sp.tps != null ? `${sp.tps} tok/s` : '—';
        if (spTier) spVal.setAttribute('data-speed-tier', spTier.level);
        else spVal.removeAttribute('data-speed-tier');
        spVal.title = speedTip;
      }
      if (spTtft) {
        spTtft.textContent = fmtSec(sp.ttft);
        spTtft.title = sp.ttft != null ? t.ttftTitle(sp.ttft) : '';
      }
      if (spDur) {
        spDur.textContent = fmtSec(sp.duration);
        spDur.title = sp.duration != null ? t.durTitle(sp.duration, sp.streamingSec) : '';
      }
      if (spOut) {
        spOut.textContent = sp.outputTokens ? `${short(sp.outputTokens)} tok` : '—';
        spOut.title = sp.outputTokens
          ? t.outTitle(fmt(sp.outputTokens), sp.thinkingTokens ? fmt(sp.thinkingTokens) : '')
          : '';
      }
    } else {
      if (spBadge) spBadge.title = '';
      if (spVal) {
        spVal.textContent = state.requestBusy ? t.speedGenerating : '—';
        spVal.removeAttribute('data-speed-tier');
        spVal.title = '';
      }
      if (spTtft) {
        spTtft.textContent = '—';
        spTtft.title = '';
      }
      if (spDur) {
        spDur.textContent = '—';
        spDur.title = '';
      }
      if (spOut) {
        spOut.textContent = '—';
        spOut.title = '';
      }
    }

    renderComposition(d, session, incomplete);
  }

  // ==========================================================================
  // 5. 輕量按需輪詢與智慧增量掃描（閒置時零全量重掃）
  // ==========================================================================
  async function requestPoll(generation, id) {
    state.requestBusy = true;
    const controller = new AbortController();
    state.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const csrf = window.__APP_CONFIG__?.csrfToken;
      if (!csrf) throw new Error('__ERR_NOT_READY__');
      const offset = Math.max(0, state.count - 3);
      const response = await fetch(
        '/exa.language_server_pb.LanguageServerService/GetCascadeTrajectoryGeneratorMetadata',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Connect-Protocol-Version': '1',
            'x-codeium-csrf-token': csrf
          },
          body: JSON.stringify({
            cascadeId: id,
            generatorMetadataOffset: offset,
            includeMessages: false
          }),
          signal: controller.signal
        }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (generation !== state.generation || state.disposed) return;
      const rows = data.generatorMetadata || [];
      const newCount = rows.length ? offset + rows.length : 0;
      const prevActual = state.latest?.actual ?? null;

      state.count = newCount;
      for (let i = rows.length - 1; i >= 0; i--) {
        const value = summarize(rows[i], {
          lang: resolveLanguage(),
          cascadeModelConfigs: state.cascadeModelConfigs,
          previousValidContext: state.latest
        });
        if (value) {
          state.latest = withStepError(value, rows[i]);
          break;
        }
      }
      state.requestAt = Date.now();
      state.requestError = '';

      // 僅在對話產生新步驟或最新實際用量更新時，才排程對話構成重掃
      const actualChanged = state.latest?.actual != null && state.latest.actual !== prevActual;
      if (newCount !== state.lastScannedCount || actualChanged) {
        state.scanPendingAt = Date.now() + 1000;
      }
    } catch (e) {
      if (generation === state.generation && !state.disposed) {
        state.requestError = e.name === 'AbortError' ? '__ERR_TIMEOUT__' : e.message;
      }
    } finally {
      clearTimeout(timeout);
      state.controllers.delete(controller);
      if (generation === state.generation && !state.disposed) {
        state.requestBusy = false;
        const hidden = typeof document !== 'undefined' && document.hidden;
        state.requestNext = Date.now() + (hidden ? 15000 : 2500);
        render();
      }
    }
  }

  async function scan(generation, id, force = false) {
    state.scanBusy = true;
    state.scanPendingAt = 0;
    render();
    try {
      let result;
      if (window.contextMeterAPI?.scan) {
        result = await window.contextMeterAPI.scan(id, force, resolveLanguage());
      } else if (window.__AGContextMeterLive?.port) {
        const live = window.__AGContextMeterLive;
        const controller = new AbortController();
        state.controllers.add(controller);
        const timeout = setTimeout(() => controller.abort(), 90000);
        try {
          const response = await fetch(`http://127.0.0.1:${live.port}/scan`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-AG-Context-Token': live.token
            },
            body: JSON.stringify({ id, force, lang: resolveLanguage() }),
            signal: controller.signal
          });
          if (!response.ok) throw new Error(`__ERR_SCAN_HTTP__ ${response.status}`);
          result = await response.json();
        } finally {
          clearTimeout(timeout);
          state.controllers.delete(controller);
        }
      } else {
        throw new Error('__ERR_RESTART_SCAN__');
      }

      if (generation !== state.generation || state.disposed) return;
      if (!result?.ok) throw new Error(result?.error || '__ERR_SCAN_FAILED__');

      state.scan = result.data;
      state.scanError = '';
      state.lastScannedCount = state.count;
      if (Array.isArray(result.data.cascadeModelConfigs) && result.data.cascadeModelConfigs.length) {
        state.cascadeModelConfigs = result.data.cascadeModelConfigs;
      }
      if (result.data.scannedAt >= state.requestAt && result.data.latest) {
        state.latest = result.data.latest;
        state.requestAt = result.data.scannedAt;
      }
      state.latest = withStepError(state.latest);
      state.lastScannedActual = state.latest?.actual ?? null;
    } catch (e) {
      if (generation === state.generation && !state.disposed) {
        state.scanError = e.message;
      }
    } finally {
      if (generation === state.generation && !state.disposed) {
        state.scanBusy = false;
        render();
      }
    }
  }

  function tick() {
    if (state.disposed) return;
    if (!host.isConnected || (host.getAttribute('data-dock') !== 'flow' && findHostTitlebar())) {
      ensureHostDocked();
    }
    const id = route();
    if (id !== state.route) {
      for (const controller of state.controllers) controller.abort();
      state.controllers.clear();
      state.generation++;
      Object.assign(state, {
        route: id,
        count: 0,
        lastScannedCount: -1,
        lastScannedActual: null,
        latest: null,
        requestAt: 0,
        requestError: '',
        requestBusy: false,
        requestNext: 0,
        scanBusy: false,
        scanPendingAt: id ? Date.now() : 0,
        scanError: '',
        scan: null
      });
      togglePanel(false);
      hideContextTooltip();
      render();
    }
    if (id && !state.requestBusy && Date.now() >= state.requestNext) {
      void requestPoll(state.generation, id);
    }
    if (id && !state.scanBusy && state.scanPendingAt > 0 && Date.now() >= state.scanPendingAt) {
      void scan(state.generation, id, false);
    }
  }

  const onRouteHint = () => {
    if (route() !== state.route) tick();
  };
  window.addEventListener?.('popstate', onRouteHint);
  window.addEventListener?.('hashchange', onRouteHint);

  initialized = true;
  const timer = setInterval(tick, 900);
  tick();

  globalThis.__AGContextMeter = {
    version: typeof METER_VERSION !== 'undefined' ? METER_VERSION : '1.0.0',
    ensureAlive: () => {
      if (state.disposed) return false;
      ensureHostDocked();
      render();
      return true;
    },
    theme: () => resolveTheme(),
    setTheme: mode => {
      if (mode === 'light' || mode === 'dark' || mode === 'auto') {
        applyThemeMode(mode);
      }
    },
    language: () => resolveLanguage(),
    languageMode: () => currentLangMode,
    setLanguage: mode => {
      if (mode === 'auto') {
        applyLanguageMode('auto');
        return;
      }
      if (typeof mode === 'string' && mode.trim()) {
        const norm = normalizeLang(mode, '');
        if (norm === 'en' || norm === 'zh-CN' || norm === 'zh-TW') {
          applyLanguageMode(norm);
        }
      }
    },
    getLayoutMode: () => state.layoutMode,
    setAvailableWidthForTest: width => {
      applyLayoutMode(computeNextLayoutMode(width, state.layoutMode));
      return state.layoutMode;
    },
    repositionPanelsForTest: () => positionFloatingPanel(),
    snapshot: () => ({
      route: state.route,
      count: state.count,
      latest: state.latest,
      scan: state.scan,
      requestError: state.requestError,
      scanError: state.scanError,
      scanBusy: state.scanBusy,
      layoutMode: state.layoutMode,
      language: resolveLanguage(),
      languageMode: currentLangMode
    }),
    dispose() {
      state.disposed = true;
      if (hoverTimer) clearTimeout(hoverTimer);
      for (const controller of state.controllers) controller.abort();
      clearInterval(timer);
      syncHostStackingElevation(false);
      try { themeObserver?.disconnect(); } catch {}
      try { resizeObserver?.disconnect(); } catch {}
      try {
        window.removeEventListener?.('resize', onWindowResize);
        window.removeEventListener?.('focus', onWindowFocus);
        window.removeEventListener?.('blur', onWindowBlur);
        window.removeEventListener?.('popstate', onRouteHint);
        window.removeEventListener?.('hashchange', onRouteHint);
        window.removeEventListener?.('languagechange', onLanguageChange);
        navigator?.windowControlsOverlay?.removeEventListener?.('geometrychange', onWindowResize);
      } catch {}
      document.removeEventListener('click', onOutsideClick);
      document.removeEventListener('keydown', onEscapeKey);
      try { document.getElementById?.('ag-wco-spacer')?.remove?.(); } catch {}
      try { document.getElementById?.('ag-topbar-host-fix')?.remove?.(); } catch {}
      host.remove();
    }
  };
})();
