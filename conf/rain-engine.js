// 気象庁の雨雲だけを管理する独立レイヤー。既存の地図移動・追従・Wake Lockには触れません。
(() => {
    const DATA_ROOT = 'https://www.jma.go.jp/bosai/jmatile/data/nowc';
    const CACHE_TTL_MS = 5 * 60 * 1000;
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
    const error = document.getElementById('rain-error');
    let enabled = false;
    let offset = 0;
    let version = 0;
    let layer = null;
    let cache = null;
    let pending = null;
    let refreshTimer = null;
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

    async function getTimes() {
        if (cache && performance.now() - cache.fetchedAt < CACHE_TTL_MS) return cache;
        if (pending) return pending;
        pending = (async () => {
            const controller = new AbortController();
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
                cache = { current, forecasts: forecasts.filter(item => item.baseMs === newestBase), fetchedAt: performance.now() };
                return cache;
            } finally {
                clearTimeout(timeout);
                controller.abort();
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
    }

    function stop() {
        enabled = false;
        version++;
        clearTimeout(refreshTimer);
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
        error.textContent = '雨雲情報を取得できませんでした';
        error.hidden = false;
        clearTimeout(errorTimer);
        errorTimer = setTimeout(() => { error.hidden = true; }, ERROR_HIDE_MS);
    }

    function scheduleRefresh() {
        clearTimeout(refreshTimer);
        if (enabled && document.visibilityState === 'visible' && cache) {
            refreshTimer = setTimeout(() => void update(), Math.max(0, CACHE_TTL_MS - (performance.now() - cache.fetchedAt)));
        }
    }

    async function update() {
        const requestVersion = ++version;
        try {
            const times = await getTimes();
            if (!enabled || requestVersion !== version) return;
            const time = selectTime(times);
            const url = `${DATA_ROOT}/${time.basetime}/none/${time.validtime}/surf/hrpns/{z}/{x}/{y}.png`;
            if (layer && layer._url === url) {
                scheduleRefresh();
                return;
            }
            clearTimeout(tileTimer);
            if (layer) {
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
            layer = nextLayer;
            nextLayer.on('tileerror', () => { if (enabled && layer === nextLayer) fail(); });
            nextLayer.on('loading', () => {
                clearTimeout(tileTimer);
                tileTimer = setTimeout(() => { if (enabled && layer === nextLayer) fail(); }, TILE_TIMEOUT_MS);
            });
            nextLayer.on('load', () => {
                if (layer === nextLayer) clearTimeout(tileTimer);
            });
            validTime.textContent = new Intl.DateTimeFormat('ja-JP', {
                timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit'
            }).format(new Date(time.validMs));
            nextLayer.addTo(map);
            scheduleRefresh();
        } catch (err) {
            if (enabled && requestVersion === version) fail();
        }
    }

    TIME_OFFSETS.forEach(minutes => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.minutes = String(minutes);
        button.textContent = minutes === 0 ? '現在' : `+${minutes}分`;
        button.addEventListener('click', () => {
            if (!enabled) return;
            offset = minutes;
            render();
            void update();
        });
        options.appendChild(button);
    });
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
    document.addEventListener('visibilitychange', () => {
        clearTimeout(refreshTimer);
        if (enabled && document.visibilityState === 'visible') void update();
    });
    window.addEventListener('pagehide', () => { clearTimeout(refreshTimer); });
    window.addEventListener('pageshow', () => { if (enabled) void update(); });
    render();
})();
