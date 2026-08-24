// --- 地図制御（聖域：ロジック改変厳禁） ---
// setViewの第1引数は初期中心、第2引数は初期ズーム。変更するとサイトを開いた直後の地図位置と縮尺が変わります。
const map = L.map('map', { tap: false, doubleClickZoom: true }).setView([35.6895, 139.6917], 11);
// ベース地図タイルの取得先。変更すると背景地図の提供元や見た目、利用条件が変わります。
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

let myLocMarker = null, tempMarker = null;
// レイヤー名ごとのLeafletレイヤーを保持します。キー名が変わると凡例や表示切り替えとの対応に影響します。
const layerGroups = {};
// 高速道路ICレイヤーを識別する名前。変更するとuMapデータ内のレイヤー名や優先度設定との対応がずれます。
const HIGHWAY_IC_LAYER_NAME = "高速道路IC";
// PC幅で高速道路ICを表示し始めるズーム値。大きくするとより拡大しないと表示されず、小さくすると早い段階で表示されます。
const HIGHWAY_IC_MIN_ZOOM_PC = 11;
// モバイル/タッチ表示で高速道路ICを表示し始めるズーム値。PC用とは別にスマホでの見やすさを調整します。
const HIGHWAY_IC_MIN_ZOOM_MOBILE = 10;
// 高速道路ICマーカーに使う画像パス。変更すると地図上のICアイコン画像が変わります。
const HIGHWAY_IC_ICON_URL = "images/ic_logo.png";
// 座標移動機能で入力地点へ移動するときのズーム値。大きくするとより詳細に、小さくすると広域で表示されます。
const COORD_JUMP_ZOOM = 16;
// 表示範囲内Featureを一度に生成する件数。大きくすると描画完了は早くなりやすい一方、操作中の引っかかりが出やすくなります。
const MAP_FEATURE_GENERATION_CHUNK_SIZE = 40;
// requestIdleCallbackで待てる最大時間。大きくすると生成処理を待ちやすく、小さくすると細かく処理を返しやすくなります。
const MAP_GENERATION_IDLE_TIMEOUT_MS = 10;
// 地図データ読み込み完了メッセージを非表示にするまでの時間。大きくすると完了表示が長く残ります。
const MAP_LOADING_COMPLETE_HIDE_DELAY_MS = 800;
// 現在の表示範囲より少し外側まで先読み生成する倍率。大きくすると移動先の表示は滑らかになりやすい一方、生成対象が増えます。
const MAP_VIEWPORT_PREFETCH_SCALE = 1.4;
// 地図移動が止まってから追加Feature生成を始めるまでの待ち時間。大きくすると移動中の生成を抑え、小さくすると早く表示されます。
const MAP_VIEWPORT_STAY_DELAY_MS = 1000;
// 個別指定がないレイヤーのFeature生成優先度。数値が小さい優先度のレイヤーほど先に生成されます。
const MAP_LAYER_PRIORITY_DEFAULT = 2;
// ズームボタンをスマホ配置に切り替える画面幅条件。値を変えるとPC/スマホ扱いの境界が変わります。
const MAP_ZOOM_CONTROL_MOBILE_MEDIA_QUERY = '(max-width: 767px)';
// PC幅でのLeaflet標準ズームボタン位置。値を変えるとPC表示時の「+」「-」の配置が変わります。
const MAP_ZOOM_CONTROL_PC_POSITION = 'topleft';
// スマホ幅でのLeaflet標準ズームボタン位置。値を変えるとスマホ表示時の「+」「-」の配置が変わります。
const MAP_ZOOM_CONTROL_MOBILE_POSITION = 'bottomleft';
// レイヤーごとのFeature生成優先度。数値が小さいレイヤーほど、表示範囲内のスポットや線が先に生成されます。
const MAP_LAYER_GENERATION_PRIORITY = {
    "名道": 1,
    "景勝地": 1,
    "グルメ": 1,
    [HIGHWAY_IC_LAYER_NAME]: 3
};
// 読み込み中/完了/エラーの表示状態を管理します。直接変更すると読み込み状況表示の整合性に影響します。
const mapLoadingTasks = new Map();
// 表示範囲に応じて後から生成するFeature元データを保持します。直接変更すると地図上のスポット生成に影響します。
const mapFeatureSources = [];
// レイヤーごとの現在の表示希望状態です。falseのレイヤーは初期表示やFeature生成の対象外になります。
const mapLayerVisibility = {};
// ズーム制限があるレイヤーの最小ズーム設定を保持します。凡例ON時やズーム変更時の表示判定に使います。
const mapLayerMinZoomSettings = {};
let mapLoadingHideTimer = null;
let mapViewportGenerationTimer = null;
let mapViewportGenerationVersion = 0;
let mapViewportIsMoving = false;
let mapZoomControlPosition = null;

function yieldMapGeneration() {
    return new Promise(resolve => {
        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(resolve, { timeout: MAP_GENERATION_IDLE_TIMEOUT_MS });
        } else {
            setTimeout(resolve, 0);
        }
    });
}

function renderMapLoadingStatus() {
    const status = document.getElementById('map-loading-status');
    if (!status) return;

    clearTimeout(mapLoadingHideTimer);
    const tasks = Array.from(mapLoadingTasks.values());
    const activeTasks = tasks.filter(task => !task.done);
    const hasError = tasks.some(task => task.error);

    status.classList.remove('is-hidden');
    status.classList.toggle('is-error', hasError);

    if (activeTasks.length > 0) {
        const total = activeTasks.reduce((sum, task) => sum + task.total, 0);
        const completed = activeTasks.reduce((sum, task) => sum + task.completed, 0);
        status.textContent = total > 0
            ? `表示範囲のスポットを準備中... ${completed}/${total}`
            : "地図データを読み込み中...";
        return;
    }

    if (hasError) {
        status.textContent = "一部の地図データを読み込めませんでした";
        return;
    }

    status.textContent = "地図データの読み込みが完了しました";
    mapLoadingHideTimer = setTimeout(() => {
        status.classList.add('is-hidden');
    }, MAP_LOADING_COMPLETE_HIDE_DELAY_MS);
}

function startMapLoadingTask(id) {
    mapLoadingTasks.set(id, { completed: 0, total: 0, done: false, error: false });
    renderMapLoadingStatus();
}

function cancelMapLoadingTask(id) {
    if (!mapLoadingTasks.has(id)) return;
    mapLoadingTasks.delete(id);

    const remainingTasks = Array.from(mapLoadingTasks.values());
    const hasActiveTask = remainingTasks.some(task => !task.done);
    const hasError = remainingTasks.some(task => task.error);
    if (hasActiveTask || hasError) {
        renderMapLoadingStatus();
        return;
    }

    clearTimeout(mapLoadingHideTimer);
    const status = document.getElementById('map-loading-status');
    if (status) {
        status.classList.add('is-hidden');
        status.classList.remove('is-error');
    }
}

function getFeatureExtent(feature) {
    const coordinates = feature.geometry.coordinates;
    if (feature.geometry.type === "Point") {
        return {
            minLat: coordinates[1],
            maxLat: coordinates[1],
            minLng: coordinates[0],
            maxLng: coordinates[0]
        };
    }

    if (feature.geometry.type === "LineString" && coordinates.length > 0) {
        let minLat = Infinity;
        let maxLat = -Infinity;
        let minLng = Infinity;
        let maxLng = -Infinity;
        coordinates.forEach(([lng, lat]) => {
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
            minLng = Math.min(minLng, lng);
            maxLng = Math.max(maxLng, lng);
        });
        return { minLat, maxLat, minLng, maxLng };
    }

    return null;
}

function getPrefetchBounds() {
    const paddingRatio = (MAP_VIEWPORT_PREFETCH_SCALE - 1) / 2;
    return map.getBounds().pad(paddingRatio);
}

function extentIntersectsBounds(extent, bounds) {
    if (!extent) return false;
    return extent.maxLat >= bounds.getSouth() &&
        extent.minLat <= bounds.getNorth() &&
        extent.maxLng >= bounds.getWest() &&
        extent.minLng <= bounds.getEast();
}

function registerMapFeatureSource({ id, name, priority, features, createFeature, isEligible }) {
    mapFeatureSources.push({
        id,
        name,
        priority,
        createFeature,
        isEligible,
        generatedFeatureIndexes: new Set(),
        entries: features.map((feature, index) => ({
            feature,
            index,
            extent: getFeatureExtent(feature)
        }))
    });
}

function cancelMapViewportGeneration() {
    clearTimeout(mapViewportGenerationTimer);
    mapViewportGenerationTimer = null;
    mapViewportGenerationVersion++;
    cancelMapLoadingTask("viewport-features");
}

function requestMapViewportGeneration(immediate = false) {
    cancelMapViewportGeneration();
    const generationVersion = mapViewportGenerationVersion;

    if (immediate) {
        generateVisibleMapFeatures(generationVersion);
        return;
    }

    mapViewportGenerationTimer = setTimeout(() => {
        mapViewportGenerationTimer = null;
        generateVisibleMapFeatures(generationVersion);
    }, MAP_VIEWPORT_STAY_DELAY_MS);
}

function collectVisibleFeatureTasks(bounds) {
    return mapFeatureSources.map(source => ({
        source,
        candidates: source.entries.filter(entry =>
            !source.generatedFeatureIndexes.has(entry.index) &&
            (!source.isEligible || source.isEligible()) &&
            extentIntersectsBounds(entry.extent, bounds)
        ),
        nextIndex: 0
    })).filter(task => task.candidates.length > 0);
}

async function generateVisibleMapFeatures(generationVersion) {
    if (generationVersion !== mapViewportGenerationVersion || mapViewportIsMoving) return;

    const generationTasks = collectVisibleFeatureTasks(getPrefetchBounds());
    const totalFeatures = generationTasks.reduce((sum, task) => sum + task.candidates.length, 0);
    if (totalFeatures === 0) return;

    const loadingTaskId = "viewport-features";
    let completedFeatures = 0;
    startMapLoadingTask(loadingTaskId);
    updateMapLoadingTask(loadingTaskId, completedFeatures, totalFeatures);

    const priorities = [...new Set(generationTasks.map(task => task.source.priority))].sort((a, b) => a - b);
    for (const priority of priorities) {
        const tasksAtPriority = generationTasks.filter(task => task.source.priority === priority);
        let hasRemainingFeatures = true;

        while (hasRemainingFeatures) {
            if (generationVersion !== mapViewportGenerationVersion || mapViewportIsMoving) return;
            hasRemainingFeatures = false;

            for (const task of tasksAtPriority) {
                if (task.nextIndex >= task.candidates.length) continue;
                hasRemainingFeatures = true;
                const end = Math.min(
                    task.nextIndex + MAP_FEATURE_GENERATION_CHUNK_SIZE,
                    task.candidates.length
                );

                for (let i = task.nextIndex; i < end; i++) {
                    const entry = task.candidates[i];
                    if (task.source.generatedFeatureIndexes.has(entry.index)) continue;
                    task.source.createFeature(entry.feature);
                    task.source.generatedFeatureIndexes.add(entry.index);
                    completedFeatures++;
                }

                task.nextIndex = end;
                updateMapLoadingTask(loadingTaskId, completedFeatures, totalFeatures);
                await yieldMapGeneration();
                if (generationVersion !== mapViewportGenerationVersion || mapViewportIsMoving) return;
            }
        }
    }

    finishMapLoadingTask(loadingTaskId);
}

function initViewportFeatureGeneration() {
    map.on('movestart', () => {
        mapViewportIsMoving = true;
        cancelMapViewportGeneration();
    });
    map.on('moveend', () => {
        mapViewportIsMoving = false;
        requestMapViewportGeneration(false);
    });
}

function updateMapLoadingTask(id, completed, total) {
    const task = mapLoadingTasks.get(id);
    if (!task) return;
    task.completed = completed;
    task.total = total;
    renderMapLoadingStatus();
}

function finishMapLoadingTask(id, error = false) {
    const task = mapLoadingTasks.get(id);
    if (!task) return;
    task.completed = task.total;
    task.done = true;
    task.error = error;
    renderMapLoadingStatus();
}

function applyZoomControlPosition(isMobileWidth) {
    const nextPosition = isMobileWidth
        ? MAP_ZOOM_CONTROL_MOBILE_POSITION
        : MAP_ZOOM_CONTROL_PC_POSITION;

    if (mapZoomControlPosition === nextPosition) return;
    map.zoomControl.setPosition(nextPosition);
    mapZoomControlPosition = nextPosition;
}

function initResponsiveZoomControl() {
    if (!map.zoomControl || !window.matchMedia) return;

    const mobileWidthQuery = window.matchMedia(MAP_ZOOM_CONTROL_MOBILE_MEDIA_QUERY);
    const updateZoomControlPosition = () => applyZoomControlPosition(mobileWidthQuery.matches);

    updateZoomControlPosition();
    if (mobileWidthQuery.addEventListener) {
        mobileWidthQuery.addEventListener('change', updateZoomControlPosition);
    } else if (mobileWidthQuery.addListener) {
        mobileWidthQuery.addListener(updateZoomControlPosition);
    }
}

function updateGuideText() {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    document.getElementById('guide-text').innerText = isTouch ? "長押しでピン設置" : "右クリックでピン設置";
}

function parseCoordinateInput(value) {
    const parts = value.trim().split(',');
    if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
        throw new Error("緯度,経度 の形式で入力してください。\n例: 35.675303,139.773553");
    }

    const lat = Number(parts[0].trim());
    const lng = Number(parts[1].trim());
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error("緯度,経度 の形式で入力してください。\n例: 35.675303,139.773553");
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new Error("緯度または経度の値が範囲外です。");
    }

    return { lat, lng };
}

function toggleCoordJumpPanel() {
    const toggle = document.getElementById('coord-jump-toggle');
    const panel = document.getElementById('coord-jump-panel');
    if (!toggle || !panel) return;

    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    toggle.innerText = willOpen ? "座標移動 ▲" : "座標移動 ▼";
    toggle.setAttribute('aria-expanded', String(willOpen));
}

function handleCoordJumpToggle(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    toggleCoordJumpPanel();
}

function jumpToInputCoordinates() {
    const input = document.getElementById('coord-jump-input');
    if (!input) return;

    try {
        const latlng = parseCoordinateInput(input.value);
        map.setView([latlng.lat, latlng.lng], COORD_JUMP_ZOOM);
        placeTempPin(latlng);
    } catch (err) {
        alert(err.message);
    }
}

function handleCoordJumpSubmit(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    jumpToInputCoordinates();
}

function initCoordJumpControl() {
    const guide = document.getElementById('operation-guide');
    const toggle = document.getElementById('coord-jump-toggle');
    const input = document.getElementById('coord-jump-input');
    const button = document.getElementById('coord-jump-btn');
    if (!toggle || !input || !button) return;

    if (guide && L.DomEvent) {
        L.DomEvent.disableClickPropagation(guide);
        L.DomEvent.disableScrollPropagation(guide);
    }

    toggle.addEventListener('click', handleCoordJumpToggle);
    toggle.addEventListener('touchend', handleCoordJumpToggle);
    button.addEventListener('click', handleCoordJumpSubmit);
    button.addEventListener('touchend', handleCoordJumpSubmit);
    input.addEventListener('focus', () => input.select());
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleCoordJumpSubmit(e);
    });
}

function updateMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.watchPosition((pos) => {
        const latlng = [pos.coords.latitude, pos.coords.longitude];
        if (!myLocMarker) {
            myLocMarker = L.marker(latlng, { icon: L.divIcon({ className: 'my-loc-con', html: '<div class="my-location-marker"></div>', iconSize:[14,14], iconAnchor:[7,7] }) }).addTo(map);
        } else { myLocMarker.setLatLng(latlng); }
    }, null, { enableHighAccuracy: true });
}

// flyToの第2引数は現在地へ移動するときのズーム値。大きくすると現在地周辺をより詳細に表示します。
function goToMyLocation() { if (myLocMarker) map.flyTo(myLocMarker.getLatLng(), 14); }

function createPopupContent(name, lat, lng, description = "", category = "", showCopyCoords = category !== "名道") {
    const coords = `${lat},${lng}`;
    const gmapUrl = `https://www.google.com/maps/search/?api=1&query=${coords}`;
    const baseUrl = `https://www.google.com/maps/dir/?api=1&destination=${coords}&travelmode=driving`;
    const localUrl = `${baseUrl}&avoid=tolls,highways`;
    
    const btnStyle = "display: block; width: 100%; padding: 10px; margin-bottom: 8px; text-decoration: none; border-radius: 8px; font-weight: bold; text-align: center; font-size: 0.9rem; box-sizing: border-box;";

    let html = `<div style="text-align: center; min-width: 200px;">`;
    html += `<span style="font-weight: bold; font-size: 1.1rem; display: block; margin-bottom: 5px;">${name}</span>`;
    if (category) html += `<span style="font-size: 0.75rem; color: #3182ce; background: #ebf8ff; padding: 2px 8px; border-radius: 4px; margin-bottom: 10px; display: inline-block;">${category}</span>`;
    if (description) html += `<p style="font-size:0.85rem; color:#444; margin-bottom:12px; text-align: left; line-height: 1.4;">${description.replace(/\n/g, '<br>')}</p>`;
    
    html += `<div style="display: flex; flex-direction: column; gap: 4px;">`;
    html += `<a href="${gmapUrl}" target="_blank" style="${btnStyle} background: #f6ad55; color: white;">Googleマップで開く</a>`;
    html += `<a href="${baseUrl}" target="_blank" style="${btnStyle} background: #4285F4; color: white;">ルート検索（高速）</a>`;
    html += `<a href="${localUrl}" target="_blank" style="${btnStyle} background: #34A853; color: white;">ルート検索（下道）</a>`;
    if (showCopyCoords) {
        html += `<button type="button" class="copy-coords-btn" data-lat="${lat}" data-lng="${lng}">緯度・経度をコピー</button>`;
    }
    return html + `</div></div>`;
}

function attachCopyCoordsHandler(e) {
    const popupElement = e.popup.getElement();
    if (!popupElement) return;

    popupElement.querySelectorAll('.copy-coords-btn').forEach(btn => {
        if (btn.dataset.copyHandlerAttached === 'true') return;
        btn.dataset.copyHandlerAttached = 'true';

        btn.addEventListener('click', async () => {
            const originalText = '緯度・経度をコピー';
            const lat = btn.dataset.lat;
            const lng = btn.dataset.lng;

            try {
                await navigator.clipboard.writeText(`${lat}, ${lng}`);
                btn.textContent = 'コピーしました';
                setTimeout(() => { btn.textContent = originalText; }, 1500);
            } catch (err) {
                console.error('座標のコピーに失敗しました:', err);
                btn.textContent = 'コピー失敗';
                setTimeout(() => { btn.textContent = originalText; }, 1500);
            }
        });
    });
}

function toggleFullScreen() {
    if (!document.fullscreenElement) document.getElementById('map').requestFullscreen().catch(err => console.log(err));
    else document.exitFullscreen();
}

map.on('contextmenu', (e) => { placeTempPin(e.latlng); return false; });
map.on('popupopen', attachCopyCoordsHandler);
let pressTimer;
// ダブルタップとみなす最大間隔。大きくするとゆっくりした2回タップでもズーム扱いになりやすくなります。
const ONE_FINGER_ZOOM_TAP_INTERVAL = 350;
// ダブルタップとみなす2回のタップ位置の許容距離。大きくすると多少ずれたタップも同じ操作として扱います。
const ONE_FINGER_ZOOM_TAP_DISTANCE = 40;
// ワンハンドズーム中に1段階ズームを変えるための指の移動量。小さくすると少しの上下移動でズームが変わります。
const ONE_FINGER_ZOOM_STEP_DISTANCE = 70;
// タップではなく移動操作とみなす距離。小さくすると微小な指ぶれでも移動扱いになりやすくなります。
const ONE_FINGER_ZOOM_MOVE_DISTANCE = 10;
let oneFingerZoomState = null;

function clearLongPressTimer() {
    clearTimeout(pressTimer);
    pressTimer = null;
}

function getTouchPoint(touch) {
    return L.point(touch.clientX, touch.clientY);
}

function getTouchLatLng(touch) {
    return map.containerPointToLatLng(map.mouseEventToContainerPoint(touch));
}

function clampZoom(zoom) {
    const minZoom = map.getMinZoom();
    const maxZoom = map.getMaxZoom();
    return Math.max(minZoom, Math.min(maxZoom, zoom));
}

function handleOneFingerZoomStart(e) {
    if (!isMobileMapView() || e.touches.length !== 1) return;

    const touch = e.touches[0];
    const now = Date.now();
    const point = getTouchPoint(touch);
    const previousTap = oneFingerZoomState && oneFingerZoomState.lastTap;

    if (
        previousTap &&
        now - previousTap.time <= ONE_FINGER_ZOOM_TAP_INTERVAL &&
        point.distanceTo(previousTap.point) <= ONE_FINGER_ZOOM_TAP_DISTANCE
    ) {
        clearLongPressTimer();
        const draggingWasEnabled = map.dragging.enabled();
        if (draggingWasEnabled) {
            map.dragging.disable();
        }
        oneFingerZoomState = {
            active: true,
            anchorLatLng: getTouchLatLng(touch),
            startPoint: point,
            startY: touch.clientY,
            startZoom: map.getZoom(),
            lastZoom: map.getZoom(),
            moved: false,
            draggingWasEnabled,
            lastTap: null
        };
        L.DomEvent.preventDefault(e);
        L.DomEvent.stopPropagation(e);
        return;
    }

    oneFingerZoomState = { active: false, lastTap: { time: now, point } };
}

function handleOneFingerZoomMove(e) {
    if (!oneFingerZoomState || !oneFingerZoomState.active || e.touches.length !== 1) return;

    clearLongPressTimer();
    const touch = e.touches[0];
    const point = getTouchPoint(touch);
    if (point.distanceTo(oneFingerZoomState.startPoint) >= ONE_FINGER_ZOOM_MOVE_DISTANCE) {
        oneFingerZoomState.moved = true;
    }

    const dy = touch.clientY - oneFingerZoomState.startY;
    const zoomDelta = Math.trunc(dy / ONE_FINGER_ZOOM_STEP_DISTANCE);
    const nextZoom = clampZoom(oneFingerZoomState.startZoom + zoomDelta);

    if (nextZoom !== oneFingerZoomState.lastZoom) {
        oneFingerZoomState.lastZoom = nextZoom;
        map.setZoomAround(oneFingerZoomState.anchorLatLng, nextZoom, { animate: false });
    }

    L.DomEvent.preventDefault(e);
    L.DomEvent.stopPropagation(e);
}

function handleOneFingerZoomEnd(e) {
    if (oneFingerZoomState && oneFingerZoomState.active) {
        const { draggingWasEnabled } = oneFingerZoomState;
        clearLongPressTimer();
        try {
            if (e.type === 'touchend' && !oneFingerZoomState.moved) {
                const nextZoom = clampZoom(map.getZoom() + 1);
                if (nextZoom !== map.getZoom()) {
                    map.setZoomAround(oneFingerZoomState.anchorLatLng, nextZoom);
                }
            }
        } finally {
            oneFingerZoomState = null;
            if (draggingWasEnabled) {
                map.dragging.enable();
            }
        }
        L.DomEvent.preventDefault(e);
        L.DomEvent.stopPropagation(e);
    }
}

function initOneFingerZoomControl() {
    const container = map.getContainer();
    container.addEventListener('touchstart', handleOneFingerZoomStart, { passive: false });
    container.addEventListener('touchmove', handleOneFingerZoomMove, { passive: false });
    container.addEventListener('touchend', handleOneFingerZoomEnd, { passive: false });
    container.addEventListener('touchcancel', handleOneFingerZoomEnd, { passive: false });
}

// setTimeoutの800msは長押しピン設置までの待ち時間。大きくすると長押し判定が遅く、小さくすると誤設置しやすくなります。
map.on('touchstart', (e) => { if (e.originalEvent.touches.length === 1) pressTimer = setTimeout(() => placeTempPin(e.latlng), 800); });
map.on('touchend dblclick touchmove', clearLongPressTimer);

function placeTempPin(latlng) {
    if (tempMarker) tempMarker.setLatLng(latlng);
    else tempMarker = L.marker(latlng).addTo(map);
    tempMarker.bindPopup(createPopupContent("指定した地点", latlng.lat, latlng.lng)).openPopup();
}

function isMobileMapView() {
    return window.matchMedia('(max-width: 767px)').matches ||
        window.matchMedia('(pointer: coarse)').matches ||
        ('ontouchstart' in window) ||
        navigator.maxTouchPoints > 0;
}

function resolveMinZoom(minZoom) {
    if (typeof minZoom === 'number') return minZoom;
    if (!minZoom) return 0;
    return isMobileMapView() ? (minZoom.mobile ?? minZoom.pc) : minZoom.pc;
}

function isLayerVisibleByDefault(setting) {
    return setting.defaultVisible !== false;
}

function isLayerEligibleForDisplay(name, minZoom) {
    if (mapLayerVisibility[name] === false) return false;
    if (!minZoom) return true;
    return map.getZoom() >= resolveMinZoom(minZoom);
}

function updateZoomLimitedLayer(name, group, minZoom) {
    minZoom = resolveMinZoom(minZoom);
    if (mapLayerVisibility[name] !== false && map.getZoom() >= minZoom) {
        if (!map.hasLayer(group)) map.addLayer(group);
    } else if (map.hasLayer(group)) {
        map.removeLayer(group);
    }
}

function updateZoomBadge() {
    const badge = document.getElementById('stats-badge');
    if (!badge) return;
    badge.innerText = `Zoom: ${map.getZoom()}`;
}

async function loadUmapData() {
    const legend = document.getElementById('legend-items');
    const loadingTaskId = "umap";
    startMapLoadingTask(loadingTaskId);

    try {
        const res = await fetch('umap_backup_map.umap');
        const data = await res.json();
        // layerSettingsは、uMap内のレイヤー名ごとに表示方法を上書きする設定です。
        // colorを変えると、マーカー・線・クラスタ・凡例バッジの色が変わります。
        // typeを"line"にすると線レイヤー扱い、"point"にすると点マーカー/クラスタ扱いになります。
        // clusterをfalseにすると、Pointでもクラスタ化せず個別マーカーとして表示します。
        // minZoomを指定すると、そのズーム以上のときだけ地図上に表示されます。
        // showInLegendをfalseにすると、「表示レイヤーの切り替え」に表示されなくなります。
        // countInStatsをfalseにすると、統計表示などの件数集計対象から外すための設定として使えます。
        // iconUrlを指定すると、円形マーカーではなく指定画像アイコンで表示します。
        // defaultVisibleをfalseにすると、初期状態では非表示かつ凡例チェックOFFになります。
        const layerSettings = {
            "名道": { color: "#ff0000", type: "line", defaultVisible: true },
            "グルメ": { color: "#ff7f00", type: "point", defaultVisible: true },
            "温泉": { color: "#00ffff", type: "point", defaultVisible: true },
            "観光": { color: "#ff23ff", type: "point", defaultVisible: true },
            "キャンプ場": { color: "#00ff00", type: "point", defaultVisible: true },
            "宿": { color: "#808080", type: "point", defaultVisible: true },
            "景勝地": { color: "#0000ff", type: "point", defaultVisible: true },
            "道の駅": { color: "#8c6450", type: "point", defaultVisible: false },
            [HIGHWAY_IC_LAYER_NAME]: { color: "#2f3640", type: "point", cluster: false, minZoom: { pc: HIGHWAY_IC_MIN_ZOOM_PC, mobile: HIGHWAY_IC_MIN_ZOOM_MOBILE }, showInLegend: true, countInStats: false, iconUrl: HIGHWAY_IC_ICON_URL, defaultVisible: false }
        };

        let totalFeatures = 0;

        data.layers.forEach(layer => {
            const n = layer.properties.name || "未分類";
            const setting = layerSettings[n] || {};
            const color = setting.color || layer.properties.color || "#3182ce";
            const defaultVisible = isLayerVisibleByDefault(setting);
            mapLayerVisibility[n] = defaultVisible;
            if (setting.minZoom) {
                mapLayerMinZoomSettings[n] = setting.minZoom;
            }

            // クラスタリング対応のグループ設定
            const isPoint = (setting.type === "point");
            const shouldCluster = isPoint && setting.cluster !== false;
            // レイヤーごとの色を適用したiconCreateFunctionを設定
            const group = shouldCluster ? L.markerClusterGroup({
                // このズーム以上ではクラスタを解除して個別マーカー表示にします。小さくすると早く個別表示になります。
                disableClusteringAtZoom: 10,
                iconCreateFunction: function(cluster) {
                    return L.divIcon({
                        // width/height/line-height/font-sizeを変えると、クラスタ丸バッジの大きさや文字サイズが変わります。
                        html: `<div style="background-color:${color}; color:white; border-radius:50%; width:30px; height:30px; line-height:30px; text-align:center; opacity:0.9; font-size:12px;">${cluster.getChildCount()}</div>`,
                        className: 'marker-cluster-custom',
                        // クラスタアイコンのクリック領域とLeaflet上のサイズを指定します。html側のサイズと合わせて調整します。
                        iconSize: L.point(30, 30)
                    });
                }
            }) : L.layerGroup();
            if (setting.minZoom) {
                updateZoomLimitedLayer(n, group, setting.minZoom);
                map.on('zoomend', () => updateZoomLimitedLayer(n, group, setting.minZoom));
                window.addEventListener('resize', () => updateZoomLimitedLayer(n, group, setting.minZoom));
            } else if (defaultVisible) {
                group.addTo(map);
            }
            layerGroups[n] = group;

            const features = layer.features || [];
            totalFeatures += features.length;
            registerMapFeatureSource({
                id: `umap:${n}`,
                name: n,
                priority: MAP_LAYER_GENERATION_PRIORITY[n] ?? MAP_LAYER_PRIORITY_DEFAULT,
                features,
                isEligible: setting.minZoom
                    ? () => isLayerEligibleForDisplay(n, setting.minZoom)
                    : () => isLayerEligibleForDisplay(n),
                createFeature(f) {
                    const c = f.geometry.coordinates;
                    if (f.geometry.type === "Point") {
                        const popupName = n === HIGHWAY_IC_LAYER_NAME
                            ? `${f.properties.name || "名称未設定"}IC`
                            : f.properties.name || "名称未設定";
                        const marker = setting.iconUrl
                            ? L.marker([c[1], c[0]], {
                                icon: L.icon({
                                    iconUrl: setting.iconUrl,
                                    // 画像アイコンの表示サイズ。大きくすると地図上のアイコンが大きく表示されます。
                                    iconSize: [18, 18],
                                    // アイコン画像内のどの位置を座標に合わせるか。値を変えるとマーカー位置の見え方がずれます。
                                    iconAnchor: [9, 9],
                                    // ポップアップの吹き出し位置。値を変えるとアイコンに対するポップアップ表示位置が変わります。
                                    popupAnchor: [0, -9]
                                })
                            })
                            // radiusは円形マーカーの大きさ、weightは白枠の太さ、fillOpacityは塗りの濃さを調整します。
                            : L.circleMarker([c[1], c[0]], { radius: 9, fillColor: color, color: "#fff", weight: 2, fillOpacity: 0.9 });
                        marker.bindPopup(createPopupContent(popupName, c[1], c[0], f.properties.description, n));
                        group.addLayer(marker);
                    } else if (f.geometry.type === "LineString") {
                        const latlngs = c.map(p => [p[1], p[0]]);
                        // weightを変えるとルート線の太さ、opacityを変えると線の濃さが変わります。
                        L.polyline(latlngs, { color: color, weight: 4, opacity: 0.8, interactive: false }).addTo(group);
                        // 透明なクリック領域です。weightを大きくすると線をタップ/クリックしやすくなります。
                        const touchLine = L.polyline(latlngs, { color: 'transparent', weight: 24, opacity: 0, interactive: true }).addTo(group);
                        touchLine.bindPopup(createPopupContent(f.properties.name || "名道", c[0][1], c[0][0], f.properties.description, n, false));
                    }
                }
            });

            const isLine = (setting.type === "line");

            // IDで重複チェックを行う
            if (setting.showInLegend !== false && !document.getElementById('legend-item-' + n)) {
                const item = document.createElement('div');
                item.className = 'legend-item';
                item.id = 'legend-item-' + n; // 一意なIDを付与
                // 線レイヤーは横線、点レイヤーは丸で凡例バッジを表示します。サイズを変えると凡例上の見た目が変わります。
                const badgeStyle = isLine ? `width:16px; height:4px; border-radius:2px;` : `width:10px; height:10px; border-radius:50%;`;
                // defaultVisibleがtrueなら初期チェックON、falseなら初期チェックOFFになります。
                const checkedAttr = defaultVisible ? ' checked' : '';
                item.innerHTML = `<input type="checkbox"${checkedAttr} onchange="toggleLayer('${n}', this.checked)"><span style="background:${color}; ${badgeStyle} display:inline-block; margin-right:6px;"></span><span>${n}</span>`;
                legend.appendChild(item);
            }
        });

        updateMapLoadingTask(loadingTaskId, 0, totalFeatures);
        updateMapLoadingTask(loadingTaskId, totalFeatures, totalFeatures);
        finishMapLoadingTask(loadingTaskId);
        requestMapViewportGeneration(true);
    } catch (e) {
        console.error(e);
        finishMapLoadingTask(loadingTaskId, true);
    }
}

function toggleLayer(n, checked) {
    const group = layerGroups[n];
    if (!group) return;

    mapLayerVisibility[n] = checked;
    const minZoom = mapLayerMinZoomSettings[n];
    if (checked) {
        if (!minZoom || map.getZoom() >= resolveMinZoom(minZoom)) {
            map.addLayer(group);
        }
        requestMapViewportGeneration(true);
    } else {
        map.removeLayer(group);
    }
}

let mapInitialized = false;

function initMap() {
    if (mapInitialized) return;
    mapInitialized = true;
    initResponsiveZoomControl();
    updateGuideText();
    updateZoomBadge();
    map.on('zoomend', updateZoomBadge);
    initOneFingerZoomControl();
    initCoordJumpControl();
    initViewportFeatureGeneration();
    updateMyLocation();
    loadUmapData();
}