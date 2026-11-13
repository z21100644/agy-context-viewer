'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  summarize,
  classifySpeed,
  measure,
  analyzeSteps,
  computeContextShares,
  formatModelLabel,
  classifyRequestError,
  resolveModelQuota
} = require('./meter-core');

test('summarize 精確解析伺服器回傳用量、快取拆分與串流速度', () => {
  const res = summarize({
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
  });

  assert.equal(res.status, 'reported');
  assert.equal(res.estimated, false);
  assert.equal(res.freshInput, 42000);
  assert.equal(res.cached, 158000);
  assert.equal(res.input, 200000);
  assert.equal(res.output, 200);
  assert.equal(res.thinking, 80);
  assert.equal(res.actual, 200200);
  assert.equal(res.budget, 1000000);
  assert.ok(Math.abs(res.percent - 20.02) < 0.001);
  assert.equal(res.speed.ttft, 0.85);
  assert.equal(res.speed.duration, 4);
  assert.equal(res.speed.tps, 50);
  assert.equal(res.speed.level, 'smooth');
  assert.equal(res.speed.label, '流暢');
  assert.equal(res.modelLabel, 'Gemini 2.5 Pro');

  assert.deepEqual(classifySpeed(60), { level: 'fast', label: '極速', tone: 'good' });
  assert.deepEqual(classifySpeed(25), { level: 'smooth', label: '流暢', tone: 'good' });
  assert.deepEqual(classifySpeed(10), { level: 'fair', label: '良好', tone: 'warn' });
  assert.deepEqual(classifySpeed(9.9), { level: 'slow', label: '偏慢', tone: 'danger' });
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

test('formatModelLabel 優雅格式化內部佔位符模型名稱並去除思考檔位後綴', () => {
  assert.equal(formatModelLabel('MODEL_PLACEHOLDER_M37'), 'Model M37');
  assert.equal(formatModelLabel('Claude Sonnet 4.5'), 'Claude Sonnet 4.5');
  assert.equal(formatModelLabel('Gemini 4 Hydrogen (High)'), 'Gemini 4 Hydrogen');
  assert.equal(formatModelLabel('Gemini 4 Carbon (Medium)'), 'Gemini 4 Carbon');
  assert.equal(formatModelLabel('Claude Opus 5.5 (Extended Thinking)'), 'Claude Opus 5.5');
  assert.equal(formatModelLabel('Model X (Preview)'), 'Model X (Preview)');
  assert.equal(formatModelLabel(''), '');
});

test('classifyRequestError 正確區分上下文超限與 Go context deadline 網路逾時', () => {
  const overflow = classifyRequestError('input token count exceeds the maximum allowed limit of 983,040 tokens');
  assert.equal(overflow.kind, 'context_overflow');
  assert.equal(overflow.serviceLimit, 983040);
  assert.equal(overflow.badgeText, '超限');

  const deadline = classifyRequestError('rpc error: code = DeadlineExceeded desc = context deadline exceeded');
  assert.equal(deadline.kind, 'network_error');
  assert.equal(deadline.badgeText, '網路');

  const rateLimit = classifyRequestError('429 Too Many Requests: please retry in 12.5s');
  assert.equal(rateLimit.kind, 'rate_limited');
  assert.equal(rateLimit.retryAfterSec, 12.5);
});

test('classifyRequestError 結合配額池設定顯示重置時間', () => {
  const configs = [
    {
      modelId: 'claude-sonnet-5-5',
      label: 'Claude Sonnet 5.5',
      quotaInfo: { remainingFraction: 0, resetTime: '2026-11-13T08:30:00.000Z' }
    }
  ];
  const quota = resolveModelQuota('Claude Sonnet 5.5', configs);
  assert.equal(quota.poolKey, 'claude-sonnet-5-5');

  const err = classifyRequestError('RESOURCE_EXHAUSTED: out of quota', {
    currentModel: 'Claude Sonnet 5.5',
    cascadeModelConfigs: configs
  });
  assert.equal(err.kind, 'quota_exhausted');
  assert.equal(err.badgeText, '額度耗盡');
  assert.ok(err.detail.includes('Claude Sonnet 5.5'));
});

test('非超限錯誤保留前一次有效上下文容量，不將既有進度歸零', () => {
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

test('analyzeSteps 以最近一次壓縮點為界統計當前有效上下文、工具呼叫與附件', () => {
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
        media: [{ uri: 'file:///d:/spec.png', mimeType: 'image/png' }]
      }
    },
    {
      errorMessage: {
        error: { shortError: '429 Too Many Requests' }
      }
    }
  ];

  const session = analyzeSteps(steps);
  assert.equal(session.steps, 6);
  assert.equal(session.activeSteps, 5);
  assert.equal(session.compacted, true);
  assert.equal(session.userMessages, 2);
  assert.equal(session.assistantMessages, 1);
  assert.equal(session.media.length, 1);
  assert.equal(session.media[0].name, 'spec.png');
  assert.equal(session.media[0].references, 2);
  assert.ok(session.groups.user.tokens > 0);
  assert.ok(session.groups.assistant.tokens > 0);
  assert.ok(session.groups.thinking.tokens > 0);
  assert.ok(session.groups.tools.tokens > 0);
  assert.ok(session.groups.summaries.tokens > 0);
  assert.equal(session.currentError.text, '429 Too Many Requests');

  const cjkMeasure = measure('繁體中文與 English 混合測試');
  assert.ok(cjkMeasure.tokens > 0);
  assert.ok(cjkMeasure.high >= cjkMeasure.low);
});

test('computeContextShares 計算當前上下文占比且總和精確收斂至 100%', () => {
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
