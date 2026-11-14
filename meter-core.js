(function (root) {
  'use strict';

  const SUPPORTED_LOCALES = ['en', 'zh-CN', 'zh-TW'];

  function cleanLocaleToken(raw) {
    if (!raw || typeof raw !== 'string') return '';
    return raw
      .trim()
      .replace(/\.[a-z0-9_-]+$/i, '')
      .replace(/@[a-z0-9_-]+$/i, '')
      .replace(/_/g, '-')
      .toLowerCase();
  }

  function isIgnoredLocaleToken(token) {
    return !token || token === 'c' || token === 'posix' || token === 'und' || token === 'auto';
  }

  function normalizeLocale(input, fallback = 'en') {
    const fb = SUPPORTED_LOCALES.includes(fallback) ? fallback : 'en';
    const s = cleanLocaleToken(input);
    if (isIgnoredLocaleToken(s)) return fb;

    if (
      s === 'zh-tw' ||
      s === 'zh-hk' ||
      s === 'zh-mo' ||
      s === 'cht' ||
      s === 'tc' ||
      s === 'tw' ||
      s.startsWith('zh-hant') ||
      (s.startsWith('zh-') && (s.includes('-tw') || s.includes('-hk') || s.includes('-mo') || s.includes('hant')))
    ) {
      return 'zh-TW';
    }

    if (s === 'zh' || s === 'chs' || s === 'sc' || s === 'cn' || s.startsWith('zh-')) {
      return 'zh-CN';
    }

    if (s === 'en' || s === 'english' || s.startsWith('en-')) {
      return 'en';
    }

    return fb;
  }

  function detectLocaleFromCandidates(candidates, fallback = 'en') {
    const fb = SUPPORTED_LOCALES.includes(fallback) ? fallback : 'en';
    if (Array.isArray(candidates)) {
      for (const raw of candidates) {
        const token = cleanLocaleToken(raw);
        if (!isIgnoredLocaleToken(token)) {
          return normalizeLocale(token, fb);
        }
      }
    }
    return fb;
  }

  function detectEnvLocale(fallback = 'en') {
    const candidates = [];
    if (typeof process === 'object' && process && process.env) {
      const env = process.env;
      candidates.push(env.AG_METER_LANG, env.AG_LANG, env.LC_ALL, env.LC_MESSAGES, env.LANGUAGE, env.LANG);
    }
    try {
      if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
        candidates.push(Intl.DateTimeFormat().resolvedOptions()?.locale);
      }
    } catch {}
    return detectLocaleFromCandidates(candidates, fallback);
  }

  const CORE_I18N = {
    en: {
      speed: {
        fast: 'Fast',
        smooth: 'Smooth',
        fair: 'Fair',
        slow: 'Slow'
      },
      poolSuffix: ' Quota Pool',
      defaultPool: 'Model Quota Pool',
      quotaSuffix: ' quota',
      defaultQuota: 'Model quota',
      inlineImage: 'Inline image',
      inlineAttachment: 'Inline attachment',
      errors: {
        noneTitle: 'Healthy',
        noneBadge: 'OK',
        overflowTitle: 'Context Limit Exceeded',
        overflowBadge: 'Overflow',
        overflowDetail: limitStr =>
          `Input exceeds server limit${limitStr ? ` (max ${limitStr} tokens)` : ''}. Try /compact or start a new chat`,
        quotaTitle: 'Quota Exhausted',
        quotaBadge: 'No Quota',
        quotaDetail: (poolName, resetStr) =>
          `${poolName} exhausted${resetStr ? ` (resets ~${resetStr})` : ''}. Switch to another available model`,
        rateTitle: 'Rate Limited',
        rateBadge: 'Rate Limit',
        rateDetail: sec =>
          `Server rate limit reached (429)${sec ? `. Retry in ${sec}s` : '. Please retry shortly'}`,
        canceledTitle: 'Canceled',
        canceledBadge: 'Canceled',
        canceledDetail: 'Last generation was canceled; showing most recent valid context',
        authTitle: 'Authentication Error',
        authBadge: 'Auth',
        authDetail: 'Authentication failed or insufficient permissions. Check your sign-in status',
        unavailTitle: 'Service Busy',
        unavailBadge: 'Busy',
        unavailDetail: 'Model server is temporarily overloaded or under maintenance. Please retry later',
        netTitle: 'Network Error',
        netBadge: 'Network',
        netDefault: 'connection failed or timed out',
        netTimeout: 'connection or read timeout',
        netReset: 'connection reset by peer',
        netRefused: 'connection refused',
        netDns: 'DNS lookup failed',
        netEof: 'unexpected EOF',
        netDetail: reason => `Network error (${reason}), not a context limit issue`,
        unknownTitle: 'Request Failed',
        unknownBadge: 'Error',
        unknownDetail: diag => `Request failed (${diag})`
      }
    },
    'zh-CN': {
      speed: {
        fast: '极速',
        smooth: '流畅',
        fair: '良好',
        slow: '偏慢'
      },
      poolSuffix: ' 配额池',
      defaultPool: '模型配额池',
      quotaSuffix: ' 配额',
      defaultQuota: '模型配额',
      inlineImage: '内嵌图片',
      inlineAttachment: '内嵌附件',
      errors: {
        noneTitle: '正常',
        noneBadge: '正常',
        overflowTitle: '超出容量上限',
        overflowBadge: '超限',
        overflowDetail: limitStr =>
          `输入超出服务器限制${limitStr ? `（上限 ${limitStr} tokens）` : ''}，建议使用 /compact 或开启新对话`,
        quotaTitle: '配额已用尽',
        quotaBadge: '额度耗尽',
        quotaDetail: (poolName, resetStr) =>
          `${poolName}已用尽${resetStr ? `（预计 ${resetStr} 重置）` : ''}，可切换其他可用模型`,
        rateTitle: '请求限流',
        rateBadge: '限流',
        rateDetail: sec =>
          `触发服务器频率限制（429）${sec ? `，请等待 ${sec} 秒后重试` : '，请稍候重试'}`,
        canceledTitle: '已取消',
        canceledBadge: '已取消',
        canceledDetail: '上次生成请求已取消，当前显示最近一次有效上下文记录',
        authTitle: '验证异常',
        authBadge: '验证',
        authDetail: '身份验证失败或权限不足，请确认账号登录状态',
        unavailTitle: '服务繁忙',
        unavailBadge: '繁忙',
        unavailDetail: '模型服务器暂时过载或维护中，请稍后重试',
        netTitle: '网络连接异常',
        netBadge: '网络',
        netDefault: '连接失败或超时',
        netTimeout: '连接或读取超时',
        netReset: '连接被远端重置',
        netRefused: '连接被拒绝',
        netDns: 'DNS 解析失败',
        netEof: '连接提前中断 (EOF)',
        netDetail: reason => `网络连接发生异常（${reason}），非上下文超限`,
        unknownTitle: '请求失败',
        unknownBadge: '异常',
        unknownDetail: diag => `请求未完成（${diag}）`
      }
    },
    'zh-TW': {
      speed: {
        fast: '極速',
        smooth: '流暢',
        fair: '良好',
        slow: '偏慢'
      },
      poolSuffix: ' 配額池',
      defaultPool: '模型配額池',
      quotaSuffix: ' 配額',
      defaultQuota: '模型配額',
      inlineImage: '內嵌圖片',
      inlineAttachment: '內嵌附件',
      errors: {
        noneTitle: '正常',
        noneBadge: '正常',
        overflowTitle: '超出容量上限',
        overflowBadge: '超限',
        overflowDetail: limitStr =>
          `輸入超出伺服器限制${limitStr ? `（上限 ${limitStr} tokens）` : ''}，建議使用 /compact 或開啟新對話`,
        quotaTitle: '配額已用盡',
        quotaBadge: '額度耗盡',
        quotaDetail: (poolName, resetStr) =>
          `${poolName}已用盡${resetStr ? `（預計 ${resetStr} 重置）` : ''}，可切換其他可用模型`,
        rateTitle: '請求限流',
        rateBadge: '限流',
        rateDetail: sec =>
          `觸發伺服器頻率限制（429）${sec ? `，請等待 ${sec} 秒後重試` : '，請稍候重試'}`,
        canceledTitle: '已取消',
        canceledBadge: '已取消',
        canceledDetail: '上次生成請求已取消，目前顯示最近一次有效上下文紀錄',
        authTitle: '驗證異常',
        authBadge: '驗證',
        authDetail: '身分驗證失敗或權限不足，請確認帳號登入狀態',
        unavailTitle: '服務繁忙',
        unavailBadge: '繁忙',
        unavailDetail: '模型伺服器暫時過載或維護中，請稍後重試',
        netTitle: '網路連線異常',
        netBadge: '網路',
        netDefault: '連線失敗或逾時',
        netTimeout: '連線或讀取逾時',
        netReset: '連線被遠端重設',
        netRefused: '連線被拒絕',
        netDns: 'DNS 解析失敗',
        netEof: '連線提前中斷 (EOF)',
        netDetail: reason => `網路連線發生異常（${reason}），非上下文超限`,
        unknownTitle: '請求失敗',
        unknownBadge: '異常',
        unknownDetail: diag => `請求未完成（${diag}）`
      }
    }
  };

  function getCoreDict(lang) {
    const resolved = normalizeLocale(lang, 'en');
    return { lang: resolved, dict: CORE_I18N[resolved] || CORE_I18N.en };
  }

  const number = value =>
    value !== undefined && value !== null && Number.isFinite(Number(value)) && Number(value) >= 0
      ? Number(value)
      : null;

  function parseDurationSec(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
    const match = String(value).trim().match(/^([\d.]+)\s*s?$/i);
    if (!match) return null;
    const num = parseFloat(match[1]);
    return Number.isFinite(num) && num >= 0 ? num : null;
  }

  function classifySpeed(tps, lang = 'en') {
    const v = number(tps);
    if (v === null) return null;
    const { dict } = getCoreDict(lang);
    if (v >= 60) return { level: 'fast', label: dict.speed.fast, tone: 'good' };
    if (v >= 25) return { level: 'smooth', label: dict.speed.smooth, tone: 'good' };
    if (v >= 10) return { level: 'fair', label: dict.speed.fair, tone: 'warn' };
    return { level: 'slow', label: dict.speed.slow, tone: 'danger' };
  }

  function formatModelLabel(raw) {
    if (!raw || typeof raw !== 'string') return '';
    const trimmed = raw.trim();
    if (!trimmed) return '';
    const placeholder = trimmed.match(/^MODEL_PLACEHOLDER_([A-Z0-9_-]+)$/i);
    if (placeholder) return `Model ${placeholder[1]}`;
    return trimmed
      .replace(
        /\s*\((?:minimal|low|medium|high|max|auto|thinking|extended thinking|(?:minimal|low|medium|high|max)\s+thinking)\)\s*$/i,
        ''
      )
      .trim();
  }

  function getModelPoolKey(raw) {
    if (!raw) return 'unknown';
    const s = String(raw).toLowerCase();
    if (s.includes('argon') || s.includes('gemini-4-argon')) return 'gemini-4-argon';
    if (s.includes('flash') || s.includes('gemini-3.8-flash')) return 'gemini-3.8-flash';
    if (s.includes('opus') || s.includes('claude-opus')) return 'claude-opus-5-5';
    if (s.includes('sonnet') || s.includes('claude-sonnet')) return 'claude-sonnet-5-5';
    if (s.includes('gpt-oss')) return 'gpt-oss-120b';
    return s.replace(/[^a-z0-9_-]/g, '');
  }

  function formatResetTime(isoStr) {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      if (Number.isNaN(d.getTime())) return String(isoStr);
      const m = d.getMonth() + 1;
      const day = d.getDate();
      const h = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${m}/${day} ${h}:${min}`;
    } catch {
      return String(isoStr);
    }
  }

  function resolveModelQuota(modelIdOrName, cascadeModelConfigs, lang = 'en') {
    if (!Array.isArray(cascadeModelConfigs) || !cascadeModelConfigs.length || !modelIdOrName) {
      return null;
    }
    const { dict } = getCoreDict(lang);
    const poolKey = getModelPoolKey(modelIdOrName);
    const targetStr = String(modelIdOrName).toLowerCase();

    let matched = cascadeModelConfigs.find(c => {
      const mId = String(c.modelId || '').toLowerCase();
      const lbl = String(c.label || '').toLowerCase();
      return mId === targetStr || lbl === targetStr;
    });

    if (!matched && poolKey !== 'unknown') {
      matched = cascadeModelConfigs.find(c => getModelPoolKey(c.modelId || c.label) === poolKey);
    }
    if (!matched) return null;

    const qi = matched.quotaInfo || {};
    const poolBaseNames = {
      'gemini-4-argon': 'Gemini 4 Argon',
      'gemini-3.8-flash': 'Gemini 3.8 Flash',
      'claude-opus-5-5': 'Claude Opus 5.5',
      'claude-sonnet-5-5': 'Claude Sonnet 5.5',
      'gpt-oss-120b': 'GPT-OSS 120B'
    };
    const baseName = poolBaseNames[poolKey];

    return {
      modelId: matched.modelId || '',
      label: matched.label || modelIdOrName,
      poolKey,
      poolName: baseName
        ? `${baseName}${dict.poolSuffix}`
        : matched.label
          ? `${matched.label}${dict.poolSuffix}`
          : dict.defaultPool,
      remainingFraction: typeof qi.remainingFraction === 'number' ? qi.remainingFraction : null,
      resetTime: qi.resetTime || null
    };
  }

  function classifyRequestError(input, options = {}) {
    const { lang, dict } = getCoreDict(options.lang);
    const errDict = dict.errors;
    const error = typeof input === 'string' ? input : String(input?.error || input?.message || '');
    const currentModel = options.currentModel || '';
    const cascadeConfigs = options.cascadeModelConfigs || [];
    const modelQuota = resolveModelQuota(currentModel, cascadeConfigs, lang);

    if (!error) {
      return {
        kind: 'none',
        lang,
        title: errDict.noneTitle,
        badgeText: errDict.noneBadge,
        detail: '',
        serviceLimit: null,
        retryAfterSec: null,
        resetTime: null,
        modelOrPool: modelQuota?.poolName || currentModel || null,
        diagnostic: ''
      };
    }

    let diagnostic = error.replace(/https?:\/\/[^\s"']+/g, '<API>').trim();
    if (diagnostic.length > 120) diagnostic = diagnostic.slice(0, 117) + '...';

    const isDeadlineTimeout = /context deadline exceeded|deadline exceeded|stream idle timeout/i.test(error);
    const overflowMatch =
      !isDeadlineTimeout &&
      error.match(
        /input token count exceeds|context\s*(?:window|length|tokens?|limit|size|capacity)?.{0,35}(?:exceed|too long)|maximum context length|prompt exceeds maximum context length|max_tokens exceeded/i
      );
    if (overflowMatch) {
      const serviceLimit = number(
        error.match(/(?:allowed|limit(?:\s+of)?|length(?:\s+is|\s+of)?)\s*[:=]?\s*([\d,]+)/i)?.[1]?.replaceAll(',', '')
      );
      return {
        kind: 'context_overflow',
        lang,
        title: errDict.overflowTitle,
        badgeText: errDict.overflowBadge,
        detail: errDict.overflowDetail(serviceLimit ? serviceLimit.toLocaleString('en-US') : ''),
        serviceLimit,
        retryAfterSec: null,
        resetTime: null,
        modelOrPool: currentModel || null,
        diagnostic
      };
    }

    const explicitQuotaMatch =
      /(?:quota\s*(?:exceeded|reached|limit|exhausted)|out\s+of\s+quota|exhausted.*(?:capacity|quota)|resource_exhausted.*(?:quota|capacity|billing)|free\s+tier\s+quota|daily\s+quota|weekly\s+quota)/i.test(
        error
      );
    const quotaZeroEvidence = Boolean(
      modelQuota && typeof modelQuota.remainingFraction === 'number' && modelQuota.remainingFraction <= 0.0001
    );

    if (explicitQuotaMatch || quotaZeroEvidence) {
      const formattedReset = modelQuota?.resetTime ? formatResetTime(modelQuota.resetTime) : null;
      const poolName =
        modelQuota?.poolName || (currentModel ? `${formatModelLabel(currentModel)}${dict.quotaSuffix}` : dict.defaultQuota);
      return {
        kind: 'quota_exhausted',
        lang,
        title: errDict.quotaTitle,
        badgeText: errDict.quotaBadge,
        detail: errDict.quotaDetail(poolName, formattedReset),
        serviceLimit: null,
        retryAfterSec: null,
        resetTime: modelQuota?.resetTime || null,
        resetTimeFormatted: formattedReset,
        resetTimeZh: formattedReset,
        modelOrPool: poolName,
        diagnostic
      };
    }

    const rateLimitMatch = /(?:rate\s*limit|too\s*many\s*requests|\b429\b|RateLimitError|RESOURCE_EXHAUSTED.*rate)/i.test(error);
    if (rateLimitMatch) {
      const retryMatch = error.match(/(?:retry\s+in|retry-after|wait)\s*[:=]?\s*([\d.]+)\s*(?:s|sec|seconds)?/i);
      const retryAfterSec = retryMatch ? parseFloat(retryMatch[1]) : null;
      return {
        kind: 'rate_limited',
        lang,
        title: errDict.rateTitle,
        badgeText: errDict.rateBadge,
        detail: errDict.rateDetail(retryAfterSec),
        serviceLimit: null,
        retryAfterSec,
        resetTime: null,
        modelOrPool: currentModel || null,
        diagnostic
      };
    }

    const canceledMatch = /(?:context canceled by user|user cancelled|request was aborted|AbortError)/i.test(error);
    if (canceledMatch) {
      return {
        kind: 'canceled',
        lang,
        title: errDict.canceledTitle,
        badgeText: errDict.canceledBadge,
        detail: errDict.canceledDetail,
        serviceLimit: null,
        retryAfterSec: null,
        resetTime: null,
        modelOrPool: currentModel || null,
        diagnostic
      };
    }

    const authMatch = /(?:UNAUTHENTICATED|PERMISSION_DENIED|\b401\b|\b403\b|invalid api key|credentials expired|permission denied)/i.test(
      error
    );
    if (authMatch) {
      return {
        kind: 'auth_error',
        lang,
        title: errDict.authTitle,
        badgeText: errDict.authBadge,
        detail: errDict.authDetail,
        serviceLimit: null,
        retryAfterSec: null,
        resetTime: null,
        modelOrPool: currentModel || null,
        diagnostic
      };
    }

    const unavailMatch = /(?:UNAVAILABLE|\b503\b|\b502\b|\b504\b|server overloaded|high demand|Bad Gateway|Service Unavailable)/i.test(
      error
    );
    if (unavailMatch) {
      return {
        kind: 'service_unavailable',
        lang,
        title: errDict.unavailTitle,
        badgeText: errDict.unavailBadge,
        detail: errDict.unavailDetail,
        serviceLimit: null,
        retryAfterSec: null,
        resetTime: null,
        modelOrPool: currentModel || null,
        diagnostic
      };
    }

    const netMatch =
      /(?:\bEOF\b|idle timeout|deadline exceeded|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|socket hang up|fetch failed|Failed to fetch|NetworkError)/i.test(
        error
      );
    if (netMatch) {
      let cleanNet = errDict.netDefault;
      if (/deadline exceeded|timeout/i.test(error)) cleanNet = errDict.netTimeout;
      else if (/ECONNRESET|socket hang up/i.test(error)) cleanNet = errDict.netReset;
      else if (/ECONNREFUSED/i.test(error)) cleanNet = errDict.netRefused;
      else if (/ENOTFOUND/i.test(error)) cleanNet = errDict.netDns;
      else if (/\bEOF\b/i.test(error)) cleanNet = errDict.netEof;

      return {
        kind: 'network_error',
        lang,
        title: errDict.netTitle,
        badgeText: errDict.netBadge,
        detail: errDict.netDetail(cleanNet),
        serviceLimit: null,
        retryAfterSec: null,
        resetTime: null,
        modelOrPool: currentModel || null,
        diagnostic
      };
    }

    return {
      kind: 'unknown',
      lang,
      title: errDict.unknownTitle,
      badgeText: errDict.unknownBadge,
      detail: errDict.unknownDetail(diagnostic),
      serviceLimit: null,
      retryAfterSec: null,
      resetTime: null,
      modelOrPool: currentModel || null,
      diagnostic
    };
  }

  function summarize(metadata, options = {}) {
    const m = metadata?.chatModel;
    if (!m) return null;
    const lang = normalizeLocale(options.lang, 'en');
    const lastRetry = (m.retryInfos || []).at(-1);
    const error = String(lastRetry?.error || m.error || '');
    const model = m.modelDisplayName || m.responseModel || m.model || options.currentModel || '';

    const classification = error
      ? classifyRequestError(error, {
          lang,
          currentModel: model,
          cascadeModelConfigs: options.cascadeModelConfigs || []
        })
      : { kind: 'none', lang };

    const exceeded = classification.kind === 'context_overflow';
    const network = classification.kind === 'network_error';
    const serviceLimit = classification.serviceLimit || null;

    const usage = lastRetry ? lastRetry.usage : m.usage;
    const input = number(usage?.inputTokens);
    const cached = number(usage?.cacheReadTokens);
    const output = number(usage?.outputTokens);
    const thinking = number(usage?.thinkingOutputTokens);
    const responseTokens = number(usage?.responseOutputTokens);
    const hasInput = (input || 0) + (cached || 0) > 0;

    const prevContext = options.previousValidContext || null;
    let actual = hasInput && !error ? (input || 0) + (cached || 0) + (output || 0) : null;
    if (actual === null && prevContext && prevContext.actual != null && !exceeded) {
      actual = prevContext.actual;
    }

    const context = m.chatStartMetadata?.contextWindowMetadata;
    const estimate = number(context?.estimatedTokensUsed) || prevContext?.estimate || null;
    const budget = number(context?.maxContextTokens) || prevContext?.budget || null;

    const ttft = parseDurationSec(m.timeToFirstToken);
    const streamingSec = parseDurationSec(m.streamingDuration);
    const duration = ttft !== null && streamingSec !== null ? ttft + streamingSec : (ttft ?? streamingSec ?? null);

    let tps = null;
    if (output && duration && duration > 0.05) {
      tps = Number((output / duration).toFixed(1));
    }
    let streamingTps = null;
    if (output && streamingSec && streamingSec > 0.05) {
      streamingTps = Number((output / streamingSec).toFixed(1));
    }

    const speedTier = classifySpeed(tps, lang);
    const speed =
      tps !== null || duration !== null || output !== null
        ? {
            tps,
            streamingTps,
            level: speedTier?.level || null,
            label: speedTier?.label || null,
            tone: speedTier?.tone || null,
            duration: duration !== null ? Number(duration.toFixed(2)) : null,
            ttft: ttft !== null ? Number(ttft.toFixed(2)) : null,
            streamingSec: streamingSec !== null ? Number(streamingSec.toFixed(2)) : null,
            outputTokens: output ?? 0,
            thinkingTokens: thinking ?? 0,
            responseTokens: responseTokens ?? (output ?? 0)
          }
        : null;

    let status = 'pending';
    if (exceeded) status = 'exceeded';
    else if (network) status = 'network';
    else if (classification.kind === 'quota_exhausted') status = 'quota_exhausted';
    else if (classification.kind === 'rate_limited') status = 'rate_limited';
    else if (classification.kind === 'auth_error') status = 'auth_error';
    else if (classification.kind === 'service_unavailable') status = 'service_unavailable';
    else if (classification.kind === 'canceled') status = 'canceled';
    else if (error) status = 'failed';
    else if (actual !== null) status = 'reported';
    else if (estimate > 0) status = 'estimated';

    const usedVal = actual ?? (estimate > 0 ? estimate : null);
    const percentVal = actual !== null && budget > 0 && !exceeded ? (actual / budget) * 100 : null;

    return {
      used: usedVal,
      actual,
      estimate: estimate > 0 ? estimate : null,
      budget: budget > 0 ? budget : null,
      serviceLimit,
      exceeded,
      network,
      error,
      errorClassification: classification,
      estimated: actual === null,
      freshInput: hasInput && !error ? (input || 0) : (prevContext?.freshInput ?? null),
      input: hasInput && !error ? (input || 0) + (cached || 0) : (prevContext?.input ?? null),
      cached: hasInput && !error ? (cached || 0) : (prevContext?.cached ?? 0),
      output: output !== null && !error ? output : (prevContext?.output ?? null),
      thinking: thinking !== null && !error ? thinking : (prevContext?.thinking ?? 0),
      percent: percentVal,
      model,
      modelLabel: formatModelLabel(model),
      status,
      speed
    };
  }

  function measure(text) {
    text = String(text || '');
    if (!text) return empty();
    let chars = 0;
    let bytes = 0;
    let cjk = 0;
    for (const char of text) {
      const c = char.codePointAt(0);
      chars++;
      bytes += c <= 127 ? 1 : c <= 2047 ? 2 : c <= 65535 ? 3 : 4;
      if ((c >= 0x2e80 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff)) cjk++;
    }
    const tokens = Math.max(1, Math.round((chars - cjk) / 3.7 + cjk * 1.15));
    return {
      chars,
      bytes,
      tokens,
      low: Math.max(1, Math.floor(tokens * 0.9)),
      high: Math.ceil(tokens * 1.1)
    };
  }

  function add(a, b) {
    for (const k of ['chars', 'bytes', 'tokens', 'low', 'high']) a[k] = (a[k] || 0) + (b[k] || 0);
    return a;
  }

  const empty = () => ({ chars: 0, bytes: 0, tokens: 0, low: 0, high: 0 });

  function computeContextShares(entries) {
    const clean = (entries || []).map(e => ({
      id: e.id,
      weight: Math.max(0, Number(e.weight) || 0)
    }));
    const totalWeight = clean.reduce((sum, e) => sum + e.weight, 0);
    const shares = {};
    if (totalWeight <= 0) {
      for (const e of clean) {
        shares[e.id] = { weight: 0, ratio: 0, percent: 0, text: '0%' };
      }
      return { totalWeight: 0, shares };
    }

    const tiny = [];
    const major = [];
    for (const e of clean) {
      if (e.weight <= 0) {
        shares[e.id] = { weight: 0, ratio: 0, percent: 0, text: '0%' };
        continue;
      }
      const ratio = e.weight / totalWeight;
      const rawPct = ratio * 100;
      if (rawPct < 0.1) {
        tiny.push({ ...e, ratio, rawPct });
        shares[e.id] = { weight: e.weight, ratio, percent: rawPct, text: '<0.1%' };
      } else {
        const rawTenths = rawPct * 10;
        const baseTenths = Math.max(1, Math.floor(rawTenths));
        major.push({
          ...e,
          ratio,
          rawPct,
          baseTenths,
          frac: rawTenths - Math.floor(rawTenths)
        });
      }
    }

    if (major.length > 0) {
      const tinyTenths = tiny.reduce((sum, x) => sum + x.rawPct * 10, 0);
      const targetTenths = Math.max(major.length, Math.round(1000 - tinyTenths));
      let currentSum = major.reduce((sum, x) => sum + x.baseTenths, 0);
      let diff = targetTenths - currentSum;

      if (diff > 0) {
        const byRemDesc = major.slice().sort((a, b) => b.frac - a.frac);
        for (let i = 0; i < diff; i++) {
          byRemDesc[i % byRemDesc.length].baseTenths += 1;
        }
      } else if (diff < 0) {
        const byRemAsc = major.filter(x => x.baseTenths > 1).sort((a, b) => a.frac - b.frac);
        let idx = 0;
        while (diff < 0 && byRemAsc.length > 0) {
          const item = byRemAsc[idx % byRemAsc.length];
          if (item.baseTenths > 1) {
            item.baseTenths -= 1;
            diff += 1;
          }
          idx++;
          if (idx > byRemAsc.length * 10) break;
        }
      }

      for (const m of major) {
        const pct = m.baseTenths / 10;
        shares[m.id] = {
          weight: m.weight,
          ratio: m.ratio,
          percent: pct,
          text: m.baseTenths === 1000 ? '100%' : `${pct.toFixed(1)}%`
        };
      }
    }

    return { totalWeight, shares };
  }

  function analyzeSteps(steps, options = {}) {
    const { dict } = getCoreDict(options.lang);
    const groups = {
      user: empty(),
      assistant: empty(),
      thinking: empty(),
      tools: empty(),
      summaries: empty()
    };
    const media = new Map();
    let userMessages = 0;
    let assistantMessages = 0;
    let latestStepError = null;
    let lastUserAt = -1;
    let lastAssistantAt = -1;
    const skip = new Set([
      'metadata',
      'userConfig',
      'lastUserConfig',
      'userAgentSpec',
      'activeUserState',
      'thinkingSignature',
      'thumbnail',
      'inlineData',
      'media',
      'modelUsage',
      'tokenUsage',
      'mendelExperimentIds'
    ]);

    function content(value) {
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      if (!value) return '';
      if (Array.isArray(value)) return value.map(content).join('\n');
      return Object.entries(value)
        .filter(([key]) => !skip.has(key))
        .map(([key, v]) => `${key}: ${content(v)}`)
        .join('\n');
    }

    function attachments(value, source, withinStep = new Set()) {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        for (const v of value) attachments(v, source, withinStep);
        return;
      }
      if (value.uri && (value.mimeType || value.inlineData !== undefined)) {
        const key = String(value.uri);
        if (!withinStep.has(key)) {
          withinStep.add(key);
          const prior = media.get(key);
          if (prior) prior.references++;
          else {
            media.set(key, {
              uri: key,
              name: String(value.description || key.split(/[\\/]/).pop()),
              mime: String(value.mimeType || ''),
              references: 1,
              source
            });
          }
        }
      } else if (value.inlineData && !value.uri) {
        const key = `inline-${media.size}`;
        const rawData = typeof value.inlineData === 'string' ? value.inlineData : value.inlineData.data || '';
        const mime = String(value.mimeType || value.inlineData.mimeType || '');
        if (!withinStep.has(key)) {
          withinStep.add(key);
          media.set(key, {
            uri: `inline:${key}`,
            inlineData: rawData,
            name: String(value.description || (mime.startsWith('image/') ? dict.inlineImage : dict.inlineAttachment)),
            mime,
            references: 1,
            source
          });
        }
      }
      for (const [key, v] of Object.entries(value)) {
        if (!skip.has(key) || key === 'media') attachments(v, source, withinStep);
      }
    }

    // Locate the most recent context compaction checkpoint and count steps within the active window
    let activeStart = 0;
    for (let i = steps.length - 1; i >= 0; i--) {
      const cp = steps[i]?.checkpoint;
      if (cp && String(cp.sessionSummary || cp.summary || '').trim().length > 0) {
        activeStart = i;
        break;
      }
    }

    for (let i = activeStart; i < steps.length; i++) {
      const s = steps[i];
      if (s.userInput) {
        userMessages++;
        lastUserAt = i;
        const u = s.userInput;
        const rawUserText = u.userResponse || (u.items || []).map(item => item.text || '').join('\n');
        const summaryMatch = rawUserText.match(/<CONTEXT_SUMMARY>[\s\S]*?<\/CONTEXT_SUMMARY>/i);
        if (summaryMatch) {
          add(groups.summaries, measure(summaryMatch[0]));
          const rest = rawUserText.replace(summaryMatch[0], '').trim();
          if (rest) add(groups.user, measure(rest));
        } else {
          add(groups.user, measure(rawUserText));
        }
        attachments(u.media?.length ? u.media : u.items, 'user');
      } else if (s.plannerResponse) {
        assistantMessages++;
        lastAssistantAt = i;
        add(
          groups.assistant,
          measure(s.plannerResponse.modifiedResponse || s.plannerResponse.response || s.plannerResponse.text || '')
        );
        add(groups.thinking, measure(s.plannerResponse.thinking || ''));
        const prTools = s.plannerResponse.toolCalls || s.plannerResponse.tool_calls;
        if (prTools) add(groups.tools, measure(content(prTools)));
        attachments(s.plannerResponse, 'assistant');
      } else if (s.errorMessage) {
        const e = s.errorMessage.error || {};
        latestStepError = {
          index: i,
          text: e.modelErrorMessage || e.shortError || e.fullError || '',
          id: e.errorId || ''
        };
      } else if (s.checkpoint) {
        add(groups.summaries, measure(s.checkpoint.sessionSummary || s.checkpoint.summary || ''));
      } else {
        const payload = Object.fromEntries(
          Object.entries(s).filter(([k]) => !['type', 'status', 'metadata', 'error'].includes(k))
        );
        add(groups.tools, measure(content(payload)));
        attachments(payload, 'assistant');
      }
    }

    const total = Object.values(groups).reduce(add, empty());
    const currentError =
      latestStepError && latestStepError.index > Math.max(lastUserAt, lastAssistantAt) ? latestStepError : null;

    return {
      groups,
      total,
      media: [...media.values()],
      steps: steps.length,
      activeSteps: steps.length - activeStart,
      compacted: activeStart > 0,
      userMessages,
      assistantMessages,
      currentError
    };
  }

  const api = {
    SUPPORTED_LOCALES,
    normalizeLocale,
    detectLocaleFromCandidates,
    detectEnvLocale,
    summarize,
    measure,
    add,
    empty,
    computeContextShares,
    analyzeSteps,
    parseDurationSec,
    classifySpeed,
    formatModelLabel,
    classifyRequestError,
    resolveModelQuota,
    formatResetTime,
    formatResetTimeZh: formatResetTime
  };

  root.__AGContextMeterCore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
