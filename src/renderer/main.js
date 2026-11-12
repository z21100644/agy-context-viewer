(function () {
  'use strict';
  if (location.protocol !== 'https:' || location.hostname !== '127.0.0.1') return;
  globalThis.__AGContextMeter?.dispose();

  const {
    summarize,
    classifySpeed,
    formatModelLabel,
    classifyRequestError,
    computeContextShares
  } = globalThis.__AGContextMeterCore || {};

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
    if (typeof classifySpeed === 'function') return classifySpeed(sp.tps);
    if (sp.tps >= 80) return { level: 'fast', label: '極速', tone: 'good' };
    if (sp.tps >= 35) return { level: 'smooth', label: '流暢', tone: 'good' };
    if (sp.tps >= 15) return { level: 'fair', label: '良好', tone: 'warn' };
    return { level: 'slow', label: '偏慢', tone: 'danger' };
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
    drawerOpen: false
  };

  try {
    state.drawerOpen = typeof localStorage !== 'undefined' && localStorage.getItem('ag_ctx_drawer_open') === '1';
  } catch {}

  const route = () => location.pathname.match(/^\/c\/([a-f\d-]{36})(?:\/|$)/i)?.[1] || null;

  // ==========================================================================
  // 1. 主題偵測與 Windows 標題列色彩同步
  // ==========================================================================
  let currentThemeMode = 'auto';
  try {
    const savedMode = typeof localStorage !== 'undefined' && localStorage.getItem('ag_theme_mode');
    if (savedMode === 'light' || savedMode === 'dark' || savedMode === 'auto') {
      currentThemeMode = savedMode;
    }
  } catch {}

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
    host.setAttribute('data-theme', activeTheme);
    const btn = el('theme-toggle');
    if (btn) {
      const modeLabel =
        currentThemeMode === 'auto'
          ? `跟隨 IDE（目前${activeTheme === 'light' ? '淺色' : '深色'}）`
          : currentThemeMode === 'light'
            ? '固定淺色'
            : '固定深色';
      btn.title = `主題：${modeLabel}（點擊切換）`;
    }
    syncNativeOverlayTheme();
  }

  function cycleTheme() {
    if (currentThemeMode === 'auto') currentThemeMode = 'light';
    else if (currentThemeMode === 'light') currentThemeMode = 'dark';
    else currentThemeMode = 'auto';
    try {
      localStorage?.setItem('ag_theme_mode', currentThemeMode);
    } catch {}
    applyTheme();
  }

  let themeObserver = null;
  try {
    if (typeof MutationObserver !== 'undefined') {
      themeObserver = new MutationObserver(() => applyTheme());
      if (document.documentElement) {
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['class', 'style', 'data-theme']
        });
      }
      if (document.body) {
        themeObserver.observe(document.body, {
          attributes: true,
          attributeFilter: ['class', 'style', 'data-theme']
        });
      }
    }
  } catch {}

  applyTheme();

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
      const targetW = 364;
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
    if (persist) {
      try {
        localStorage?.setItem('ag_ctx_drawer_open', state.drawerOpen ? '1' : '0');
      } catch {}
    }
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
    if (d.errorClassification && d.errorClassification.kind && d.errorClassification.kind !== 'none') {
      return d.errorClassification;
    }
    if (d.error && typeof classifyRequestError === 'function') {
      return classifyRequestError(d.error, {
        currentModel: d.model || '',
        cascadeModelConfigs: state.cascadeModelConfigs
      });
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
    const pctEl = el('badge-pct-val');
    const sepEl = el('badge-speed-sep');
    const speedWrap = el('badge-speed-wrap');
    const liveDot = el('badge-live-dot');
    const speedAmt = el('speed-amount');
    const srAmt = el('amount');

    if (!state.route) {
      if (pctEl) pctEl.textContent = '—';
      if (srAmt) srAmt.textContent = '未開啟對話';
      if (sepEl) sepEl.hidden = true;
      if (speedWrap) {
        speedWrap.hidden = true;
        speedWrap.removeAttribute('data-speed-tier');
      }
      return;
    }

    if (errInfo && errInfo.kind !== 'canceled') {
      if (pctEl) pctEl.textContent = errInfo.badgeText || '異常';
      if (srAmt) srAmt.textContent = errInfo.title || '異常';
    } else if (pct != null) {
      const rounded = pct > 0 && pct < 1 ? 1 : Math.round(pct);
      if (pctEl) pctEl.textContent = `${rounded}%`;
      if (srAmt) srAmt.textContent = `${short(d?.actual)} (${rounded}%)`;
    } else if (d?.estimate && d?.budget) {
      const estPct = Math.min(99, Math.max(1, Math.round((d.estimate / d.budget) * 100)));
      if (pctEl) pctEl.textContent = `~${estPct}%`;
      if (srAmt) srAmt.textContent = `約 ${short(d.estimate)}`;
    } else {
      if (pctEl) pctEl.textContent = '—';
      if (srAmt) srAmt.textContent = d?.actual != null ? short(d.actual) : '估算中';
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
    const tipPct = el('ctx-tip-pct');
    const tipDet = el('ctx-tip-detail');
    if (!tipPct || !tipDet) return;

    if (!state.route) {
      tipPct.textContent = '尚未開啟對話';
      tipDet.textContent = '進入對話後自動追蹤上下文容量';
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
      tipPct.textContent = `${usedRound}% 已用 · 剩餘 ${short(remTokens)}`;
      tipDet.textContent = `${short(d.actual)} / ${short(d.budget)} tokens${incomplete ? '（含未知附件）' : ''}${speedSuffix}`;
    } else if (d?.actual != null) {
      tipPct.textContent = `已用 ${short(d.actual)} tokens`;
      tipDet.textContent = `未回傳視窗上限${speedSuffix}`;
    } else if (d?.estimate != null) {
      tipPct.textContent = `預估 ≈ ${short(d.estimate)} tokens`;
      tipDet.textContent = `${d.budget ? `上限 ${short(d.budget)}` : '待伺服器回傳實際值'}${speedSuffix}`;
    } else if (session) {
      const estTok = Math.round(tokenWeight(session.total));
      tipPct.textContent = estTok > 0 ? `已載入 ${session.activeSteps ?? session.steps} 步對話` : '已開啟對話';
      tipDet.textContent = '等待首次模型請求回傳容量';
    } else {
      tipPct.textContent = '正在讀取上下文…';
      tipDet.textContent = '同步對話狀態中';
    }

    if (state.tooltipOpen) positionContextTooltip();
  }

  function renderUsageChips(d, session) {
    const container = el('usage-chips');
    if (!container) return;
    container.replaceChildren();

    if (!state.route) {
      const span = document.createElement('span');
      span.textContent = '開啟對話後自動同步實際用量';
      container.appendChild(span);
      return;
    }

    if (d?.actual != null) {
      const cached = d.cached || 0;
      const fresh = d.freshInput != null ? d.freshInput : Math.max(0, (d.input || 0) - cached);
      const out = d.output || 0;

      const items = [];
      if (cached > 0) items.push({ label: `快取 ${short(cached)}`, cls: 'u-dot u-dot-cache' });
      items.push({ label: `輸入 ${short(fresh)}`, cls: 'u-dot' });
      items.push({ label: `輸出 ${short(out)}`, cls: 'u-dot u-dot-out' });

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
    hint.textContent = d?.estimate
      ? '目前為用戶端估算，模型回覆後將更新為精確用量'
      : session
        ? '尚無模型呼叫紀錄，下方可檢視當前上下文占比'
        : '正在同步目前對話資料…';
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
    const cmdRe = /(^|\s)(\/[a-z][a-z0-9-]*)(?=\s|$)/g;
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
    const stepsPill = el('steps-pill');
    const sessionTotal = el('session-total');
    if (stepsPill) {
      if (session) {
        const shownSteps = session.activeSteps ?? session.steps;
        stepsPill.hidden = false;
        stepsPill.textContent = `${shownSteps} 步`;
        stepsPill.title = session.compacted
          ? `壓縮後有效 ${shownSteps} 步（歷史共 ${session.steps} 步） · ${session.userMessages} 則提問 · ${session.assistantMessages} 則回覆`
          : `${session.userMessages} 則提問 · ${session.assistantMessages} 則回覆`;
      } else {
        stepsPill.hidden = true;
      }
    }

    const { entries, totalWeight, shares } = getSessionCategoryWeights(session);

    if (sessionTotal) {
      if (!session) {
        sessionTotal.textContent = state.scanBusy ? '計算中…' : state.route ? '待掃描' : '—';
      } else if (d?.actual != null) {
        sessionTotal.textContent = `共 ${short(d.actual)}${incomplete ? ' +' : ''}`;
      } else if (d?.estimate != null) {
        sessionTotal.textContent = `約 ${short(d.estimate)}${incomplete ? ' +' : ''}`;
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
          valEl.textContent = share.weight > 0 ? `${share.text}+` : '未知占比';
        } else {
          valEl.textContent = share.text;
        }
      }
      if (rowEl) {
        const isZero = Boolean(session && share.weight === 0 && !(item.id === 'attachment-total' && incomplete));
        rowEl.setAttribute('data-zero', isZero ? 'true' : 'false');
        let tip = '';
        if (session && share.ratio > 0 && d?.actual != null) {
          tip = `約 ${short(Math.round(d.actual * share.ratio))} tokens（占當前上下文 ${share.text}）`;
        } else if (session && share.ratio > 0) {
          tip = `占當前上下文 ${share.text}`;
        }
        if (item.id === 'attachment-total' && session?.attachments?.length) {
          const names = session.attachments.slice(0, 4).map(a => a.name).join('、');
          const more = session.attachments.length > 4 ? ` 等 ${session.attachments.length} 個檔案` : '';
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
      updatedEl.textContent = ts > 0 ? `${new Date(ts).toLocaleTimeString([], { hour12: false })} 更新` : '—';
    }
  }

  function render() {
    if (state.disposed) return;
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
        keyBadge.textContent = '待命';
        keyBadge.className = 'status-pill pill-muted';
      }
      const heroPct = el('key-pct-hero');
      if (heroPct) heroPct.textContent = '—';
      const heroFrac = el('key-fraction');
      if (heroFrac) heroFrac.textContent = '尚未開啟對話';
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
        idleSpBadge.textContent = '待命';
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
        keyBadge.textContent = '超限';
        keyBadge.className = 'status-pill pill-danger';
      }
      if (heroPct) heroPct.textContent = '100%+';
      const limit = d?.serviceLimit || d?.budget;
      if (heroFrac) heroFrac.textContent = limit ? `超出 ${short(limit)} 上限` : '超出伺服器容量上限';
      if (heroRem) heroRem.textContent = '剩餘 0';
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
          keyBadge.textContent = '吃緊';
          keyBadge.className = 'status-pill pill-danger';
        } else if (rawPct >= 75) {
          keyBadge.textContent = '偏高';
          keyBadge.className = 'status-pill pill-warn';
        } else {
          keyBadge.textContent = '正常';
          keyBadge.className = 'status-pill pill-good';
        }
      }
      if (heroPct) heroPct.textContent = `${rawPct < 10 ? rawPct.toFixed(1) : Math.round(rawPct)}%`;
      if (heroFrac) heroFrac.textContent = `${short(d.actual)} / ${short(d.budget)}`;
      if (heroRem) heroRem.textContent = `剩餘 ${short(remainVal)}`;
      if (barFill) barFill.style.width = `${Math.min(100, Math.max(1.2, rawPct)).toFixed(1)}%`;
      if (cacheFill) {
        const cachePct = d.cached > 0 ? Math.min(rawPct, (d.cached / d.budget) * 100) : 0;
        cacheFill.style.width = `${cachePct.toFixed(1)}%`;
      }
    } else if (d?.actual != null) {
      if (keyBadge) {
        keyBadge.textContent = isHardError ? errInfo.badgeText : '已記錄';
        keyBadge.className = isHardError ? 'status-pill pill-danger' : 'status-pill pill-good';
      }
      if (heroPct) heroPct.textContent = short(d.actual);
      if (heroFrac) heroFrac.textContent = 'tokens（未提供上限）';
      if (heroRem) heroRem.textContent = '';
      if (barFill) barFill.style.width = '0%';
      if (cacheFill) cacheFill.style.width = '0%';
    } else if (d?.estimate != null) {
      const estPct = d.budget ? Math.min(100, (d.estimate / d.budget) * 100) : null;
      if (keyBadge) {
        keyBadge.textContent = isHardError ? errInfo.badgeText : '估算';
        keyBadge.className = isHardError ? 'status-pill pill-danger' : 'status-pill pill-muted';
      }
      if (heroPct) heroPct.textContent = estPct != null ? `~${Math.round(estPct)}%` : `~${short(d.estimate)}`;
      if (heroFrac) heroFrac.textContent = d.budget ? `約 ${short(d.estimate)} / ${short(d.budget)}` : 'tokens（本機估算）';
      if (heroRem) heroRem.textContent = d.budget ? `約剩 ${short(Math.max(0, d.budget - d.estimate))}` : '';
      if (barFill) barFill.style.width = estPct != null ? `${estPct.toFixed(1)}%` : '0%';
      if (cacheFill) cacheFill.style.width = '0%';
    } else {
      if (keyBadge) {
        keyBadge.textContent = isHardError ? errInfo.badgeText : state.scanBusy ? '同步中' : '就緒';
        keyBadge.className = isHardError ? 'status-pill pill-danger' : 'status-pill pill-muted';
      }
      if (heroPct) heroPct.textContent = '—';
      if (heroFrac) {
        heroFrac.textContent = session
          ? `已載入 ${session.activeSteps ?? session.steps} 步對話`
          : '等待請求資料';
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
      renderAlertBanner('danger', '空間即將耗盡，建議 /compact 壓縮或開啟新對話');
    } else if (stale && state.requestError) {
      renderAlertBanner('warn', `即時統計讀取延遲（${state.requestError}）`);
    } else if (incomplete) {
      renderAlertBanner('warn', `有 ${session.unknownFiles} 個附件無法本機解析，實際用量可能高於估算`);
    } else if (state.scanError && !session) {
      renderAlertBanner('warn', state.scanError);
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
        spBadge.textContent = state.requestBusy ? '計算' : '待命';
        spBadge.className = 'speed-pill pill-muted';
      }
    }

    if (sp?.tps != null || sp?.duration != null || sp?.outputTokens) {
      const ttftShare =
        sp.ttft != null && sp.duration != null && sp.duration > 0
          ? Math.round((sp.ttft / sp.duration) * 100)
          : null;
      const tipParts = [];
      if (sp.tps != null) {
        tipParts.push(`整體速率 ${sp.tps} tok/s${spTier ? `（${spTier.label}）` : ''}`);
      }
      if (sp.streamingTps) {
        tipParts.push(`純串流速率 ${sp.streamingTps} tok/s`);
      }
      if (ttftShare != null && ttftShare >= 50) {
        tipParts.push(`首字延遲占耗時 ${ttftShare}%`);
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
        spTtft.title = sp.ttft != null ? `首字延遲 ${sp.ttft}s` : '';
      }
      if (spDur) {
        spDur.textContent = fmtSec(sp.duration);
        spDur.title =
          sp.duration != null
            ? `總耗時 ${sp.duration}s${sp.streamingSec != null ? ` · 串流輸出 ${sp.streamingSec}s` : ''}`
            : '';
      }
      if (spOut) {
        spOut.textContent = sp.outputTokens ? `${short(sp.outputTokens)} tok` : '—';
        spOut.title = sp.outputTokens
          ? `本輪輸出 ${fmt(sp.outputTokens)} tokens${sp.thinkingTokens ? `（含思考 ${fmt(sp.thinkingTokens)}）` : ''}`
          : '';
      }
    } else {
      if (spBadge) spBadge.title = '';
      if (spVal) {
        spVal.textContent = state.requestBusy ? '生成中…' : '—';
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
      if (!csrf) throw new Error('背景服務尚未就緒');
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
        state.requestError = e.name === 'AbortError' ? '讀取逾時' : e.message;
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
        result = await window.contextMeterAPI.scan(id, force);
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
            body: JSON.stringify({ id, force }),
            signal: controller.signal
          });
          if (!response.ok) throw new Error(`掃描介面 HTTP ${response.status}`);
          result = await response.json();
        } finally {
          clearTimeout(timeout);
          state.controllers.delete(controller);
        }
      } else {
        throw new Error('重啟 Antigravity 後啟用完整對話構成掃描');
      }

      if (generation !== state.generation || state.disposed) return;
      if (!result?.ok) throw new Error(result?.error || '掃描失敗');

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
        currentThemeMode = mode;
        try {
          localStorage?.setItem('ag_theme_mode', mode);
        } catch {}
        applyTheme();
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
      layoutMode: state.layoutMode
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
