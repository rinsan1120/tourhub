// 気象庁の雨雲だけを管理する独立レイヤー。既存の地図移動・追従・Wake Lockには触れません。
(() => {
    const DATA_ROOT = 'https://www.jma.go.jp/bosai/jmatile/data/nowc';
    const CACHE_TTL_MS = 5 * 60 * 1000;
    const AUTO_REFRESH_MS = 10 * 60 * 1000;
    const JSON_TIMEOUT_MS = 10000;
    const TILE_TIMEOUT_MS = 15000;
    const ERROR_HIDE_MS = 5000;
    const MINUTE_MS = 60 * 1000;
    const TIME_TOLERANCE_MS = 5 * MINUTE_MS;
    const TIME_OFFSETS = [0, 10, 20, 30, 40, 50, 60];
    const OPACITY = 0.55;
    const PANE_Z_INDEX = 350; // tilePane(200)より上、ルートのoverlayPane(400)より下。
    const MIN_NATIVE_ZOOM = 4;
    const MAX_NATIVE_ZOOM = 10;
    const NATIVE_ZOOM_STEP = 2;
    const toggle = document.getElementById('rain-toggle-btn');
    const panel = document.getElementById('rain-panel');
    const options = document.getElementById('rain-time-options');
    const validTime = document.getElementById('rain-valid-time');
    const updatedTime = document.getElementById('rain-updated-time');
    const error = document.getElementById('rain-error');
    const compactHost = document.getElementById('rain-compact-host');
    const mapWrapper = document.getElementById('map-wrapper');
    const compactQuery = window.matchMedia('(max-width: 767px)');
    const previousTime = document.getElementById('rain-time-prev');
    const currentTime = document.getElementById('rain-time-current');
    const nextTime = document.getElementById('rain-time-next');
    let timeListOpen = false;
    let enabled = false;
    let offset = 0;
    let version = 0;
    let layer = null;
    let cache = null;
    let pending = null;
    let pendingController = null;
    let refreshTimer = null;
    let nextRefreshAt = null;
    let automaticUpdating = false;
    let pageActive = true;
    let cancelReplacement = null;
    let tileTimer = null;
    let errorTimer = null;

    // 現行気象庁設定はzoomUse="even"。Leaflet 1.9.4の標準ズーム制限後、偶数へ丸める。
    const RainTileLayer = L.TileLayer.extend({
        _clampZoom(zoom) {
            const nativeZoom = L.TileLayer.prototype._clampZoom.call(this, zoom);
            return Math.floor(nativeZoom / NATIVE_ZOOM_STEP) * NATIVE_ZOOM_STEP;
        }
    });

    function parseTime(value) {
        if (typeof value !== 'string' || !/^\d{14}$/.test(value)) return NaN;
        const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}Z`;
        const time = Date.parse(iso);
        return Number.isFinite(time) && new Date(time).toISOString().replace(/\D/g, '').slice(0, 14) === value ? time : NaN;
    }

    function readTimes(data) {
        if (!Array.isArray(data)) throw new Error('Invalid nowcast times');
        return data.filter(item => item && Array.isArray(item.elements) && item.elements.includes('hrpns'))
            .map(item => ({ ...item, baseMs: parseTime(item.basetime), validMs: parseTime(item.validtime) }))
            .filter(item => Number.isFinite(item.baseMs) && Number.isFinite(item.validMs));
    }

    async function getTimes(force = false) {
        if (pending) return pending;
        if (!force && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache;
        pending = (async () => {
            const controller = new AbortController();
            pendingController = controller;
            const timeout = setTimeout(() => controller.abort(), JSON_TIMEOUT_MS);
            try {
                const results = await Promise.all(['N1', 'N2'].map(async name => {
                    const response = await fetch(`${DATA_ROOT}/targetTimes_${name}.json`, {
                        signal: controller.signal, cache: 'no-cache'
                    });
                    if (!response.ok) throw new Error(`Nowcast HTTP ${response.status}`);
                    return readTimes(await response.json());
                }));
                const observations = results[0].filter(item => item.basetime === item.validtime);
                const current = observations.sort((a, b) => b.validMs - a.validMs)[0];
                const forecasts = results[1].filter(item => item.validMs > item.baseMs);
                if (!current || !forecasts.length) throw new Error('Missing nowcast times');
                // 更新境界に複数の予測系列があっても、最新の基準時刻の系列だけを使う。
                const newestBase = Math.max(...forecasts.map(item => item.baseMs));
                cache = { current, forecasts: forecasts.filter(item => item.baseMs === newestBase), fetchedAt: Date.now() };
                return cache;
            } finally {
                clearTimeout(timeout);
                controller.abort();
                if (pendingController === controller) pendingController = null;
            }
        })();
        try { return await pending; }
        finally { pending = null; }
    }

    function selectTime(times) {
        if (offset === 0) return times.current;
        const target = times.current.validMs + offset * MINUTE_MS;
        const nearest = times.forecasts.reduce((best, item) =>
            !best || Math.abs(item.validMs - target) < Math.abs(best.validMs - target) ? item : best, null);
        if (!nearest || Math.abs(nearest.validMs - target) > TIME_TOLERANCE_MS) throw new Error('Missing forecast time');
        return nearest;
    }

    function render() {
        toggle.hidden = false;
        toggle.setAttribute('aria-pressed', String(enabled));
        panel.hidden = !enabled;
        options.querySelectorAll('button').forEach(button => {
            button.setAttribute('aria-pressed', String(Number(button.dataset.minutes) === offset));
        });
        renderCompactBar();
    }

    function renderCompactBar() {
        if (!enabled) timeListOpen = false;
        currentTime.textContent = `${offset === 0 ? '現在' : `+${offset}分`} ${validTime.textContent}`.trim();
        previousTime.disabled = offset === TIME_OFFSETS[0];
        nextTime.disabled = offset === TIME_OFFSETS[TIME_OFFSETS.length - 1];
        currentTime.setAttribute('aria-expanded', String(timeListOpen));
        panel.classList.toggle('is-time-list-open', timeListOpen);
    }

    function syncRainLayout() {
        const compact = compactQuery.matches && document.fullscreenElement !== mapWrapper;
        timeListOpen = false;
        panel.classList.toggle('is-compact', compact);
        // 通常表示では地図の外へ出し、既存の地図上ボタンの位置を維持する。
        const host = compact ? compactHost : mapWrapper;
        if (panel.parentElement !== host) host.appendChild(panel);
        renderCompactBar();
    }

    function chooseOffset(minutes) {
        if (!enabled) return;
        const restoreFocus = timeListOpen;
        offset = minutes;
        timeListOpen = false;
        render();
        if (restoreFocus) currentTime.focus();
        void update();
    }

    function stop() {
        enabled = false;
        version++;
        clearTimeout(refreshTimer);
        refreshTimer = null;
        nextRefreshAt = null;
        if (automaticUpdating && pendingController) pendingController.abort();
        if (cancelReplacement) cancelReplacement();
        clearTimeout(tileTimer);
        if (layer) {
            const oldLayer = layer;
            layer = null;
            oldLayer.off('tileerror loading load');
            map.removeLayer(oldLayer);
        }
        validTime.textContent = '';
        render();
    }

    function fail() {
        stop();
        cache = null;
        showError('雨雲情報を取得できませんでした');
    }

    function showError(message) {
        error.textContent = message;
        error.hidden = false;
        clearTimeout(errorTimer);
        errorTimer = setTimeout(() => { error.hidden = true; }, ERROR_HIDE_MS);
    }

    function formatTime(time) {
        return new Intl.DateTimeFormat('ja-JP', {
            timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit'
        }).format(new Date(time));
    }

    function canAutoRefresh() {
        return enabled && screenWakeLockEnabled && pageActive && document.visibilityState === 'visible';
    }

    function scheduleRefresh() {
        clearTimeout(refreshTimer);
        refreshTimer = null;
        if (!canAutoRefresh()) {
            nextRefreshAt = null;
            if (automaticUpdating && pendingController) pendingController.abort();
            if (cancelReplacement) cancelReplacement();
            return;
        }
        if (automaticUpdating) return;
        if (nextRefreshAt === null) nextRefreshAt = Date.now() + AUTO_REFRESH_MS;
        refreshTimer = setTimeout(() => {
            refreshTimer = null;
            if (canAutoRefresh()) void update(true);
        }, Math.max(0, nextRefreshAt - Date.now()));
    }

    // 自動更新は新しいタイルの読み込み完了まで旧レイヤーを残す。
    function replaceAutomatically(nextLayer, time, fetchedAt, requestVersion) {
        return new Promise(resolve => {
            const oldLayer = layer;
            let timeout;
            const finish = (success, reportError = false) => {
                if (cancelReplacement !== cancel) return;
                cancelReplacement = null;
                clearTimeout(timeout);
                nextLayer.off('tileerror loading load');
                if (success && enabled && requestVersion === version && canAutoRefresh()) {
                    layer = nextLayer;
                    nextLayer.setOpacity(OPACITY);
                    oldLayer.off('tileerror loading load');
                    map.removeLayer(oldLayer);
                    attachTileHandlers(nextLayer);
                    validTime.textContent = formatTime(time.validMs);
                    updatedTime.textContent = `雨雲更新：${formatTime(fetchedAt)}`;
                    error.hidden = true;
                } else {
                    map.removeLayer(nextLayer);
                    if (reportError) showError('雨雲情報を更新できませんでした');
                }
                resolve(success);
            };
            const cancel = () => finish(false);
            cancelReplacement = cancel;
            nextLayer.setOpacity(0);
            nextLayer.on('tileerror', () => finish(false, true));
            nextLayer.on('load', () => finish(true));
            timeout = setTimeout(() => finish(false, true), TILE_TIMEOUT_MS);
            nextLayer.addTo(map);
            // 日本の表示範囲外など、取得対象タイルがない場合にも完了させる。
            if (cancelReplacement === cancel && !nextLayer.isLoading()) finish(true);
        });
    }

    function attachTileHandlers(nextLayer) {
        nextLayer.on('tileerror', () => { if (enabled && layer === nextLayer) fail(); });
        nextLayer.on('loading', () => {
            clearTimeout(tileTimer);
            tileTimer = setTimeout(() => { if (enabled && layer === nextLayer) fail(); }, TILE_TIMEOUT_MS);
        });
        nextLayer.on('load', () => {
            if (layer === nextLayer) clearTimeout(tileTimer);
        });
    }

    async function update(automatic = false) {
        if (automatic && (!canAutoRefresh() || automaticUpdating)) return;
        if (cancelReplacement) cancelReplacement();
        if (automatic) {
            automaticUpdating = true;
            clearTimeout(refreshTimer);
            refreshTimer = null;
        }
        const requestVersion = ++version;
        try {
            const times = await getTimes(automatic);
            if (!enabled || requestVersion !== version || (automatic && !canAutoRefresh())) return;
            const time = selectTime(times);
            const url = `${DATA_ROOT}/${time.basetime}/none/${time.validtime}/surf/hrpns/{z}/{x}/{y}.png`;
            if (layer && layer._url === url) {
                updatedTime.textContent = `雨雲更新：${formatTime(times.fetchedAt)}`;
                error.hidden = true;
                return;
            }
            clearTimeout(tileTimer);
            if (layer && !automatic) {
                layer.off('tileerror loading load');
                map.removeLayer(layer);
            }
            if (!map.getPane('rainPane')) {
                const pane = map.createPane('rainPane');
                pane.style.zIndex = String(PANE_Z_INDEX);
                pane.style.pointerEvents = 'none';
            }
            const nextLayer = new RainTileLayer(url, {
                pane: 'rainPane', opacity: OPACITY,
                minNativeZoom: MIN_NATIVE_ZOOM, maxNativeZoom: MAX_NATIVE_ZOOM,
                // maxZoomを指定しないことで既存地図のズーム上限を変えない。
                bounds: [[20, 118], [48, 150]], noWrap: true
            });
            if (automatic && layer) {
                await replaceAutomatically(nextLayer, time, times.fetchedAt, requestVersion);
                return;
            }
            layer = nextLayer;
            attachTileHandlers(nextLayer);
            validTime.textContent = formatTime(time.validMs);
            nextLayer.addTo(map);
            updatedTime.textContent = `雨雲更新：${formatTime(times.fetchedAt)}`;
            error.hidden = true;
        } catch (err) {
            if (enabled && requestVersion === version) {
                if (automatic && layer) {
                    if (canAutoRefresh()) showError('雨雲情報を更新できませんでした');
                } else fail();
            }
        } finally {
            if (automatic) {
                automaticUpdating = false;
                nextRefreshAt = null;
            }
            scheduleRefresh();
        }
    }

    TIME_OFFSETS.forEach(minutes => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.minutes = String(minutes);
        button.textContent = minutes === 0 ? '現在' : `+${minutes}分`;
        button.addEventListener('click', () => {
            chooseOffset(minutes);
        });
        options.appendChild(button);
    });
    previousTime.addEventListener('click', () => {
        const index = TIME_OFFSETS.indexOf(offset);
        if (index > 0) chooseOffset(TIME_OFFSETS[index - 1]);
    });
    nextTime.addEventListener('click', () => {
        const index = TIME_OFFSETS.indexOf(offset);
        if (index < TIME_OFFSETS.length - 1) chooseOffset(TIME_OFFSETS[index + 1]);
    });
    currentTime.addEventListener('click', () => {
        timeListOpen = !timeListOpen;
        renderCompactBar();
    });
    panel.addEventListener('keydown', event => {
        if (event.key === 'Escape' && timeListOpen) {
            timeListOpen = false;
            renderCompactBar();
            currentTime.focus();
        }
    });
    document.addEventListener('fullscreenchange', syncRainLayout);
    if (compactQuery.addEventListener) compactQuery.addEventListener('change', syncRainLayout);
    else compactQuery.addListener(syncRainLayout);
    // 自動更新の既存描画を監視し、コンパクト表示だけを同期する。
    new MutationObserver(renderCompactBar).observe(validTime, { childList: true });
    toggle.addEventListener('click', () => {
        if (enabled) { stop(); return; }
        error.hidden = true;
        clearTimeout(errorTimer);
        offset = 0;
        enabled = true;
        render();
        void update();
    });
    // 地図とは別の兄弟DOMに置き、タッチやスクロールを地図へ伝播させない。
    [toggle, panel].forEach(element => {
        L.DomEvent.disableClickPropagation(element);
        L.DomEvent.disableScrollPropagation(element);
        L.DomEvent.on(element, 'touchmove', L.DomEvent.stopPropagation);
    });
    // 非同期のWake Lock取得/解除を含め、既存UIが描画した設定変更だけを監視する。
    new MutationObserver(scheduleRefresh).observe(document.getElementById('screen-wake-lock-btn'), {
        attributes: true, attributeFilter: ['aria-pressed']
    });
    function resumeRefresh() {
        if (canAutoRefresh() && cache && Date.now() - cache.fetchedAt >= CACHE_TTL_MS) void update(true);
        else scheduleRefresh();
    }
    document.addEventListener('visibilitychange', resumeRefresh);
    window.addEventListener('pagehide', () => {
        pageActive = false;
        clearTimeout(refreshTimer);
        refreshTimer = null;
        nextRefreshAt = null;
        if (automaticUpdating && pendingController) pendingController.abort();
        if (cancelReplacement) cancelReplacement();
    });
    window.addEventListener('pageshow', () => {
        pageActive = true;
        resumeRefresh();
    });
    syncRainLayout();
    render();
})();
