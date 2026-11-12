(function (root) {
  'use strict';

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

  function classifySpeed(tps) {
    const v = number(tps);
    if (v === null) return null;
    if (v >= 80) return { level: 'fast', label: '極速', tone: 'good' };
    if (v >= 35) return { level: 'smooth', label: '流暢', tone: 'good' };
    if (v >= 15) return { level: 'fair', label: '良好', tone: 'warn' };
    return { level: 'slow', label: '偏慢', tone: 'danger' };
  }

  function formatModelLabel(raw) {
    if (!raw || typeof raw !== 'string') return '';
    const trimmed = raw.trim();
    if (!trimmed) return '';
    const placeholder = trimmed.match(/^MODEL_PLACEHOLDER_([A-Z0-9_-]+)$/i);
    if (placeholder) return `Model ${placeholder[1]}`;
    return trimmed;
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

  function formatResetTimeZh(isoStr) {
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

  function resolveModelQuota(modelIdOrName, cascadeModelConfigs) {
    if (!Array.isArray(cascadeModelConfigs) || !cascadeModelConfigs.length || !modelIdOrName) {
      return null;
    }
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
    const poolNames = {
      'gemini-4-argon': 'Gemini 4 Argon 配額池',
      'gemini-3.8-flash': 'Gemini 3.8 Flash 配額池',
      'claude-opus-5-5': 'Claude Opus 5.5 配額池',
      'claude-sonnet-5-5': 'Claude Sonnet 5.5 配額池',
      'gpt-oss-120b': 'GPT-OSS 120B 配額池'
    };

    return {
      modelId: matched.modelId || '',
      label: matched.label || modelIdOrName,
      poolKey,
      poolName: poolNames[poolKey] || (matched.label ? `${matched.label} 配額池` : '模型配額池'),
      remainingFraction: typeof qi.remainingFraction === 'number' ? qi.remainingFraction : null,
      resetTime: qi.resetTime || null
    };
  }

  function classifyRequestError(input, options = {}) {
    const error = typeof input === 'string' ? input : String(input?.error || input?.message || '');
    const currentModel = options.currentModel || '';
    const cascadeConfigs = options.cascadeModelConfigs || [];
    const modelQuota = resolveModelQuota(currentModel, cascadeConfigs);

    if (!error) {
      return {
        kind: 'none',
        title: '正常',
        badgeText: '正常',
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
        title: '超出容量上限',
        badgeText: '超限',
        detail: `輸入超出伺服器限制${serviceLimit ? `（上限 ${serviceLimit.toLocaleString('en-US')} tokens）` : ''}，建議使用 /compact 或開啟新對話`,
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
      const resetTimeZh = modelQuota?.resetTime ? formatResetTimeZh(modelQuota.resetTime) : null;
      const poolName = modelQuota?.poolName || (currentModel ? `${formatModelLabel(currentModel)} 配額` : '模型配額');
      return {
        kind: 'quota_exhausted',
        title: '配額已用盡',
        badgeText: '額度耗盡',
        detail: `${poolName}已用盡${resetTimeZh ? `（預計 ${resetTimeZh} 重置）` : ''}，可切換其他可用模型`,
        serviceLimit: null,
        retryAfterSec: null,
        resetTime: modelQuota?.resetTime || null,
        resetTimeZh,
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
        title: '請求限流',
        badgeText: '限流',
        detail: `觸發伺服器頻率限制（429）${retryAfterSec ? `，請等待 ${retryAfterSec} 秒後重試` : '，請稍候重試'}`,
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
        title: '已取消',
        badgeText: '已取消',
        detail: '上次生成請求已取消，目前顯示最近一次有效上下文紀錄',
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
        title: '驗證異常',
        badgeText: '驗證',
        detail: '身分驗證失敗或權限不足，請確認帳號登入狀態',
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
        title: '服務繁忙',
        badgeText: '繁忙',
        detail: '模型伺服器暫時過載或維護中，請稍後重試',
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
      let cleanNet = '連線失敗或逾時';
      if (/deadline exceeded|timeout/i.test(error)) cleanNet = '連線或讀取逾時';
      else if (/ECONNRESET|socket hang up/i.test(error)) cleanNet = '連線被遠端重設';
      else if (/ECONNREFUSED/i.test(error)) cleanNet = '連線被拒絕';
      else if (/ENOTFOUND/i.test(error)) cleanNet = 'DNS 解析失敗';
      else if (/\bEOF\b/i.test(error)) cleanNet = '連線提前中斷 (EOF)';

      return {
        kind: 'network_error',
        title: '網路連線異常',
        badgeText: '網路',
        detail: `網路連線發生異常（${cleanNet}），非上下文超限`,
        serviceLimit: null,
        retryAfterSec: null,
        resetTime: null,
        modelOrPool: currentModel || null,
        diagnostic
      };
    }

    return {
      kind: 'unknown',
      title: '請求失敗',
      badgeText: '異常',
      detail: `請求未完成（${diagnostic}）`,
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
    const lastRetry = (m.retryInfos || []).at(-1);
    const error = String(lastRetry?.error || m.error || '');
    const model = m.modelDisplayName || m.responseModel || m.model || options.currentModel || '';

    const classification = error
      ? classifyRequestError(error, {
          currentModel: model,
          cascadeModelConfigs: options.cascadeModelConfigs || []
        })
      : { kind: 'none' };

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
    if (output && duration && duration > 0) {
      tps = Number((output / duration).toFixed(1));
    }
    let streamingTps = null;
    if (output && streamingSec && streamingSec > 0.05) {
      streamingTps = Number((output / streamingSec).toFixed(1));
    }

    const speedTier = classifySpeed(tps);
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

  function analyzeSteps(steps) {
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
            name: String(value.description || (mime.startsWith('image/') ? '內嵌圖片' : '內嵌附件')),
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

    // 定位最近一次上下文壓縮點（checkpoint 摘要），僅統計當前有效視窗內的步驟
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
    formatResetTimeZh
  };

  root.__AGContextMeterCore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
