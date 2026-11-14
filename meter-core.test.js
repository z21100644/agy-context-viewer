'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeLocale,
  detectLocaleFromCandidates,
  summarize,
  classifySpeed,
  measure,
  analyzeSteps,
  computeContextShares,
  formatModelLabel,
  classifyRequestError,
  resolveModelQuota
} = require('./meter-core');

test('normalizeLocale & detectLocaleFromCandidates accurately map en / zh-CN / zh-TW and fallback to en', () => {
  assert.equal(normalizeLocale('en'), 'en');
  assert.equal(normalizeLocale('en-US'), 'en');
  assert.equal(normalizeLocale('en_GB.UTF-8'), 'en');
  assert.equal(normalizeLocale('zh-CN'), 'zh-CN');
  assert.equal(normalizeLocale('zh_CN.UTF-8'), 'zh-CN');
  assert.equal(normalizeLocale('zh-Hans'), 'zh-CN');
  assert.equal(normalizeLocale('zh-SG'), 'zh-CN');
  assert.equal(normalizeLocale('zh'), 'zh-CN');
  assert.equal(normalizeLocale('zh-TW'), 'zh-TW');
  assert.equal(normalizeLocale('zh_TW.UTF-8'), 'zh-TW');
  assert.equal(normalizeLocale('zh-Hant'), 'zh-TW');
  assert.equal(normalizeLocale('zh-HK'), 'zh-TW');
  assert.equal(normalizeLocale('zh-MO'), 'zh-TW');
  assert.equal(normalizeLocale('ja-JP'), 'en');
  assert.equal(normalizeLocale('C.UTF-8'), 'en');
  assert.equal(normalizeLocale(''), 'en');

  assert.equal(detectLocaleFromCandidates(['', 'C.UTF-8', 'zh-Hant-TW', 'en-US']), 'zh-TW');
  assert.equal(detectLocaleFromCandidates([null, 'zh-Hans-CN', 'en-US']), 'zh-CN');
  assert.equal(detectLocaleFromCandidates(['fr-FR', 'zh-TW']), 'en');
  assert.equal(detectLocaleFromCandidates([]), 'en');
});

test('summarize & classifySpeed parse server usage, cache split, and streaming speed across en / zh-CN / zh-TW', () => {
  const payload = {
    chatModel: {
      modelDisplayName: 'Gemini 2.5 Pro',
      timeToFirstToken: '0.85s',
      streamingDuration: '3.15s',
      usage: {
        inputTokens: 42000,
        cacheReadTokens: 158000,
        outputTokens: 200,
        thinkingOutputTokens: 80
      },
      chatStartMetadata: {
        contextWindowMetadata: {
          estimatedTokensUsed: 195000,
          maxContextTokens: 1000000
        }
      }
    }
  };

  const resEn = summarize(payload);
  assert.equal(resEn.status, 'reported');
  assert.equal(resEn.estimated, false);
  assert.equal(resEn.freshInput, 42000);
  assert.equal(resEn.cached, 158000);
  assert.equal(resEn.input, 200000);
  assert.equal(resEn.output, 200);
  assert.equal(resEn.thinking, 80);
  assert.equal(resEn.actual, 200200);
  assert.equal(resEn.budget, 1000000);
  assert.ok(Math.abs(resEn.percent - 20.02) < 0.001);
  assert.equal(resEn.speed.ttft, 0.85);
  assert.equal(resEn.speed.duration, 4);
  assert.equal(resEn.speed.tps, 50);
  assert.equal(resEn.speed.level, 'smooth');
  assert.equal(resEn.speed.label, 'Smooth');
  assert.equal(resEn.modelLabel, 'Gemini 2.5 Pro');

  assert.equal(summarize(payload, { lang: 'zh-CN' }).speed.label, '流畅');
  assert.equal(summarize(payload, { lang: 'zh-TW' }).speed.label, '流暢');

  assert.deepEqual(classifySpeed(60, 'en'), { level: 'fast', label: 'Fast', tone: 'good' });
  assert.deepEqual(classifySpeed(60, 'zh-CN'), { level: 'fast', label: '极速', tone: 'good' });
  assert.deepEqual(classifySpeed(60, 'zh-TW'), { level: 'fast', label: '極速', tone: 'good' });
  assert.deepEqual(classifySpeed(25, 'zh-TW'), { level: 'smooth', label: '流暢', tone: 'good' });
  assert.deepEqual(classifySpeed(10, 'en'), { level: 'fair', label: 'Fair', tone: 'warn' });
  assert.deepEqual(classifySpeed(9.9, 'en'), { level: 'slow', label: 'Slow', tone: 'danger' });
  assert.deepEqual(classifySpeed(9.9, 'zh-CN'), { level: 'slow', label: '偏慢', tone: 'danger' });
  assert.equal(classifySpeed(null), null);

  const tinyDur = summarize({
    chatModel: {
      timeToFirstToken: '0.02s',
      streamingDuration: '0.02s',
      usage: { inputTokens: 1000, outputTokens: 50 }
    }
  });
  assert.equal(tinyDur.speed.tps, null);
  assert.equal(tinyDur.speed.streamingTps, null);
});

test('formatModelLabel formats placeholder model names and strips thinking tier suffixes', () => {
  assert.equal(formatModelLabel('MODEL_PLACEHOLDER_M37'), 'Model M37');
  assert.equal(formatModelLabel('Claude Sonnet 4.5'), 'Claude Sonnet 4.5');
  assert.equal(formatModelLabel('Gemini 4 Hydrogen (High)'), 'Gemini 4 Hydrogen');
  assert.equal(formatModelLabel('Gemini 4 Carbon (Medium)'), 'Gemini 4 Carbon');
  assert.equal(formatModelLabel('Claude Opus 5.5 (Extended Thinking)'), 'Claude Opus 5.5');
  assert.equal(formatModelLabel('Model X (Preview)'), 'Model X (Preview)');
  assert.equal(formatModelLabel(''), '');
});

test('classifyRequestError distinguishes context overflow vs Go context deadline timeout in all 3 locales', () => {
  const errText = 'input token count exceeds the maximum allowed limit of 983,040 tokens';
  const overflowEn = classifyRequestError(errText, { lang: 'en' });
  assert.equal(overflowEn.kind, 'context_overflow');
  assert.equal(overflowEn.serviceLimit, 983040);
  assert.equal(overflowEn.badgeText, 'Overflow');
  assert.ok(overflowEn.detail.includes('/compact'));

  const overflowCn = classifyRequestError(errText, { lang: 'zh-CN' });
  assert.equal(overflowCn.badgeText, '超限');
  assert.ok(overflowCn.detail.includes('服务器限制'));

  const overflowTw = classifyRequestError(errText, { lang: 'zh-TW' });
  assert.equal(overflowTw.badgeText, '超限');
  assert.ok(overflowTw.detail.includes('伺服器限制'));

  const deadlineEn = classifyRequestError('rpc error: code = DeadlineExceeded desc = context deadline exceeded', { lang: 'en' });
  assert.equal(deadlineEn.kind, 'network_error');
  assert.equal(deadlineEn.badgeText, 'Network');

  const deadlineTw = classifyRequestError('rpc error: code = DeadlineExceeded desc = context deadline exceeded', { lang: 'zh-TW' });
  assert.equal(deadlineTw.badgeText, '網路');

  const rateLimit = classifyRequestError('429 Too Many Requests: please retry in 12.5s', { lang: 'zh-CN' });
  assert.equal(rateLimit.kind, 'rate_limited');
  assert.equal(rateLimit.retryAfterSec, 12.5);
  assert.equal(rateLimit.badgeText, '限流');
});

test('classifyRequestError combines quota pool config and reset time across locales', () => {
  const configs = [
    {
      modelId: 'claude-sonnet-5-5',
      label: 'Claude Sonnet 5.5',
      quotaInfo: { remainingFraction: 0, resetTime: '2026-11-13T08:30:00.000Z' }
    }
  ];
  const quotaEn = resolveModelQuota('Claude Sonnet 5.5', configs, 'en');
  assert.equal(quotaEn.poolKey, 'claude-sonnet-5-5');
  assert.equal(quotaEn.poolName, 'Claude Sonnet 5.5 Quota Pool');

  const errEn = classifyRequestError('RESOURCE_EXHAUSTED: out of quota', {
    lang: 'en',
    currentModel: 'Claude Sonnet 5.5',
    cascadeModelConfigs: configs
  });
  assert.equal(errEn.kind, 'quota_exhausted');
  assert.equal(errEn.badgeText, 'No Quota');
  assert.ok(errEn.detail.includes('Claude Sonnet 5.5 Quota Pool'));

  const errCn = classifyRequestError('RESOURCE_EXHAUSTED: out of quota', {
    lang: 'zh-CN',
    currentModel: 'Claude Sonnet 5.5',
    cascadeModelConfigs: configs
  });
  assert.equal(errCn.badgeText, '额度耗尽');
  assert.ok(errCn.detail.includes('配额池'));

  const errTw = classifyRequestError('RESOURCE_EXHAUSTED: out of quota', {
    lang: 'zh-TW',
    currentModel: 'Claude Sonnet 5.5',
    cascadeModelConfigs: configs
  });
  assert.equal(errTw.badgeText, '額度耗盡');
  assert.ok(errTw.detail.includes('配額池'));
});

test('non-overflow error preserves previous valid context occupancy', () => {
  const prev = summarize({
    chatModel: {
      model: 'Gemini 2.5 Pro',
      usage: { inputTokens: 50000, cacheReadTokens: 100000, outputTokens: 1000 },
      chatStartMetadata: { contextWindowMetadata: { maxContextTokens: 1000000 } }
    }
  });

  const afterNetErr = summarize(
    {
      chatModel: {
        model: 'Gemini 2.5 Pro',
        retryInfos: [{ error: 'ECONNRESET: socket hang up' }]
      }
    },
    { previousValidContext: prev }
  );

  assert.equal(afterNetErr.status, 'network');
  assert.equal(afterNetErr.exceeded, false);
  assert.equal(afterNetErr.actual, 151000);
  assert.equal(afterNetErr.budget, 1000000);
});

test('analyzeSteps scopes active context window from latest compaction checkpoint and localizes inline media', () => {
  const steps = [
    {
      userInput: {
        userResponse: '壓縮前的早期對話不應計入當前視窗',
        media: [{ uri: 'file:///d:/old.png', mimeType: 'image/png' }]
      }
    },
    {
      checkpoint: {
        sessionSummary: '已整理先前架構討論重點'
      }
    },
    {
      userInput: {
        userResponse: '請檢查這張架構圖與說明',
        media: [
          { uri: 'file:///d:/spec.png', mimeType: 'image/png' },
          { uri: 'file:///d:/spec.png', mimeType: 'image/png' }
        ]
      }
    },
    {
      plannerResponse: {
        thinking: '先閱讀圖檔尺寸與內容',
        response: '這是一張系統架構圖。',
        toolCalls: [{ name: 'read_file', args: { Path: 'd:/spec.md' } }]
      }
    },
    {
      userInput: {
        userResponse: '再對照一次同一張圖',
        media: [
          { uri: 'file:///d:/spec.png', mimeType: 'image/png' },
          { inlineData: 'aGVsbG8=', mimeType: 'image/png' }
        ]
      }
    },
    {
      errorMessage: {
        error: { shortError: '429 Too Many Requests' }
      }
    }
  ];

  const sessionEn = analyzeSteps(steps, { lang: 'en' });
  assert.equal(sessionEn.steps, 6);
  assert.equal(sessionEn.activeSteps, 5);
  assert.equal(sessionEn.compacted, true);
  assert.equal(sessionEn.userMessages, 2);
  assert.equal(sessionEn.assistantMessages, 1);
  assert.equal(sessionEn.media.length, 2);
  assert.equal(sessionEn.media[0].name, 'spec.png');
  assert.equal(sessionEn.media[0].references, 2);
  assert.equal(sessionEn.media[1].name, 'Inline image');
  assert.equal(analyzeSteps(steps, { lang: 'zh-CN' }).media[1].name, '内嵌图片');
  assert.equal(analyzeSteps(steps, { lang: 'zh-TW' }).media[1].name, '內嵌圖片');
  assert.equal(sessionEn.currentError.text, '429 Too Many Requests');

  const cjkMeasure = measure('繁體中文、简体中文與 English 混合測試');
  assert.ok(cjkMeasure.tokens > 0);
  assert.ok(cjkMeasure.high >= cjkMeasure.low);
});

test('computeContextShares converges active context shares strictly to 100%', () => {
  const { totalWeight, shares } = computeContextShares([
    { id: 'system', weight: 40000 },
    { id: 'tools', weight: 11500 },
    { id: 'thinking', weight: 360 },
    { id: 'user', weight: 195 },
    { id: 'assistant', weight: 0 },
    { id: 'summaries', weight: 0 },
    { id: 'attachment-total', weight: 0 }
  ]);
  assert.equal(totalWeight, 52055);
  assert.equal(shares.system.text, '76.8%');
  assert.equal(shares.tools.text, '22.1%');
  assert.equal(shares.thinking.text, '0.7%');
  assert.equal(shares.user.text, '0.4%');
  assert.equal(shares.assistant.text, '0%');
  const sumPct =
    shares.system.percent + shares.tools.percent + shares.thinking.percent + shares.user.percent;
  assert.equal(Number(sumPct.toFixed(1)), 100.0);

  const tinyRes = computeContextShares([
    { id: 'system', weight: 100000 },
    { id: 'user', weight: 20 }
  ]);
  assert.equal(tinyRes.shares.user.text, '<0.1%');
  assert.equal(tinyRes.shares.system.text, '100%');
});
