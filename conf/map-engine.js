// --- 地図制御（聖域：ロジック改変厳禁） ---
// setViewの第1引数は初期中心、第2引数は初期ズーム。変更するとサイトを開いた直後の地図位置と縮尺が変わります。
const map = L.map('map', { tap: false, doubleClickZoom: true }).setView([35.6895, 139.6917], 11);
// ベース地図タイルの取得先。変更すると背景地図の提供元や見た目、利用条件が変わります。
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

let myLocMarker = null, tempMarker = null;
let isLocationTracking = false;
// GPSの微小移動と低速時の方位変動を抑えるしきい値。
const LOCATION_HEADING_MIN_DISTANCE_M = 5;
const LOCATION_HEADING_MIN_SPEED_MPS = 0.5;
const locationHeadingMobileQuery = window.matchMedia('(max-width: 767px), (pointer: coarse)');
let previousHeadingPosition = null;
let lastLocationHeading = null;
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
const MAP_VIEWPORT_STAY_DELAY_MS = 500;
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

    if (feature.geometry.type === "LineString" && Array.isArray(coordinates) && coordinates.length > 0) {
        let minLat = Infinity;
        let maxLat = -Infinity;
        let minLng = Infinity;
        let maxLng = -Infinity;
        coordinates.forEach(coordinate => {
            if (!isValidScenicRouteCoordinate(coordinate)) return;
            const [lng, lat] = coordinate;
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
    toggle.innerText = willOpen ? "場所を検索 ▲" : "場所を検索 ▼";
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

function updateLocationHeading(coords, latlng) {
    const distance = previousHeadingPosition ? map.distance(previousHeadingPosition, latlng) : null;
    const speed = typeof coords.speed === 'number' && Number.isFinite(coords.speed) && coords.speed >= 0
        ? coords.speed : null;
    const stationary = previousHeadingPosition && (speed !== null
        ? speed < LOCATION_HEADING_MIN_SPEED_MPS
        : distance < LOCATION_HEADING_MIN_DISTANCE_M);

    if (!stationary) {
        if (typeof coords.heading === 'number' && Number.isFinite(coords.heading) &&
            coords.heading >= 0 && coords.heading <= 360) {
            lastLocationHeading = coords.heading % 360;
        } else if (distance >= LOCATION_HEADING_MIN_DISTANCE_M) {
            // 球面上の初期方位角。経度差は±180度をまたぐ場合もsin/cosで扱える。
            const radians = Math.PI / 180;
            const lat1 = previousHeadingPosition[0] * radians;
            const lat2 = latlng[0] * radians;
            const deltaLng = (latlng[1] - previousHeadingPosition[1]) * radians;
            const y = Math.sin(deltaLng) * Math.cos(lat2);
            const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
            if (x !== 0 || y !== 0) lastLocationHeading = (Math.atan2(y, x) / radians + 360) % 360;
        }
    }
    previousHeadingPosition = latlng;
    renderLocationHeading();
}

function renderLocationHeading() {
    const headingElement = myLocMarker && myLocMarker.getElement()?.querySelector('.my-location-heading');
    if (!headingElement) return;
    const visible = locationHeadingMobileQuery.matches && isLocationTracking && Number.isFinite(lastLocationHeading);
    headingElement.classList.toggle('has-heading', visible);
    headingElement.style.setProperty('--location-heading', visible ? `${lastLocationHeading}deg` : '0deg');
}

if (locationHeadingMobileQuery.addEventListener) {
    locationHeadingMobileQuery.addEventListener('change', renderLocationHeading);
} else {
    locationHeadingMobileQuery.addListener(renderLocationHeading);
}

function updateMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.watchPosition((pos) => {
        const latlng = [pos.coords.latitude, pos.coords.longitude];
        if (!myLocMarker) {
            myLocMarker = L.marker(latlng, { icon: L.divIcon({ className: 'my-loc-con', html: '<div class="my-location-heading"><div class="my-location-marker"></div></div>', iconSize:[14,14], iconAnchor:[7,7] }) }).addTo(map);
        } else { myLocMarker.setLatLng(latlng); }
        updateLocationHeading(pos.coords, latlng);
        if (isLocationTracking) map.panTo(latlng, { animate: false });
    }, null, { enableHighAccuracy: true });
}

// flyToの第2引数は現在地へ移動するときのズーム値。大きくすると現在地周辺をより詳細に表示します。
function goToMyLocation() { if (myLocMarker) map.flyTo(myLocMarker.getLatLng(), 14); }

function setLocationTracking(enabled) {
    isLocationTracking = enabled;
    document.getElementById('map-wrapper').classList.toggle('is-location-tracking', enabled);
    const button = document.getElementById('location-tracking-btn');
    const label = enabled ? '現在地追従を停止' : '現在地追従を開始';
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = enabled ? '追従<br>ON' : '追従<br>OFF';
    renderLocationHeading();
}

function toggleLocationTracking() {
    setLocationTracking(!isLocationTracking);
    // panToはズームを指定せず、現在の倍率のまま中心だけを移動します。
    if (isLocationTracking && myLocMarker) map.panTo(myLocMarker.getLatLng(), { animate: false });
}

// 自動移動やズームでは解除せず、ユーザーのドラッグだけで解除します。
map.on('dragstart', () => {
    if (isLocationTracking) setLocationTracking(false);
});

function createPopupContent(name, lat, lng, description = "", category = "", showCopyCoords = category !== "名道") {
    const coords = `${lat},${lng}`;
    const gmapUrl = `https://www.google.com/maps/search/?api=1&query=${coords}`;
    const baseUrl = `https://www.google.com/maps/dir/?api=1&destination=${coords}&travelmode=driving`;
    const localUrl = `${baseUrl}&avoid=tolls,highways`;
    
    const btnStyle = "display: block; width: 100%; padding: 10px; margin-bottom: 8px; text-decoration: none; border-radius: 8px; font-weight: bold; text-align: center; font-size: 0.9rem; box-sizing: border-box;";

    let html = `<div class="spot-popup" style="text-align: center; min-width: 200px;">`;
    html += `<span style="font-weight: bold; font-size: 1.1rem; display: block; margin-bottom: 5px;">${name}</span>`;
    if (category) html += `<span style="font-size: 0.75rem; color: #3182ce; background: #ebf8ff; padding: 2px 8px; border-radius: 4px; margin-bottom: 10px; display: inline-block;">${category}</span>`;
    if (description) html += `<p class="popup-description" style="font-size:0.85rem; color:#444; margin-bottom:12px; text-align: left; line-height: 1.4;">${description.replace(/\n/g, '<br>')}</p>`;
    
    html += `<div class="popup-actions" style="display: flex; flex-direction: column; gap: 4px;">`;
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

const mapFullscreenWrapper = document.getElementById('map-wrapper');
let pseudoFullscreenSnapshot = null;
let mapFullscreenRequestPending = false;
let mapFullscreenResizeFrame = null;

// ネイティブの状態を優先し、他機能はこの関数から全画面相当の状態を参照する。
function getMapFullscreenMode() {
    if (document.fullscreenElement === mapFullscreenWrapper) return 'native';
    return pseudoFullscreenSnapshot ? 'pseudo' : 'none';
}

function isMapFullscreen() {
    return getMapFullscreenMode() !== 'none';
}

function resizeFullscreenMap() {
    if (mapFullscreenResizeFrame !== null) cancelAnimationFrame(mapFullscreenResizeFrame);
    mapFullscreenResizeFrame = requestAnimationFrame(() => {
        mapFullscreenResizeFrame = null;
        if (pseudoFullscreenSnapshot) {
            const viewport = window.visualViewport;
            const values = {
                top: viewport ? viewport.offsetTop : 0,
                left: viewport ? viewport.offsetLeft : 0,
                width: viewport ? viewport.width : window.innerWidth,
                height: viewport ? viewport.height : window.innerHeight
            };
            Object.entries(values).forEach(([name, value]) => {
                mapFullscreenWrapper.style.setProperty(`--map-viewport-${name}`, `${value}px`);
            });
        }
        // Leafletの非アニメーションpanで、サイズ変更前の中心を維持する。
        map.invalidateSize({ animate: false, pan: true, debounceMoveend: true });
        document.dispatchEvent(new Event('mapfullscreenresize'));
    });
}

function syncMapFullscreen() {
    const isFullscreen = isMapFullscreen();
    const button = document.querySelector('.fullscreen-btn');
    const label = isFullscreen ? '全画面解除' : '全画面表示';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.querySelector('i').className = isFullscreen ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
    resizeFullscreenMap();
    document.dispatchEvent(new CustomEvent('mapfullscreenchange', {
        detail: { mode: getMapFullscreenMode() }
    }));
}

function enterPseudoFullscreen() {
    if (pseudoFullscreenSnapshot) return;
    const legend = document.getElementById('legend');
    const legendAnchor = document.createComment('legend original position');
    legend.before(legendAnchor);
    const legendPanel = document.createElement('details');
    legendPanel.className = 'pseudo-fullscreen-legend';
    const summary = document.createElement('summary');
    summary.textContent = legend.querySelector('.legend-title').textContent;
    legendPanel.append(summary, legend);
    mapFullscreenWrapper.append(legendPanel);
    L.DomEvent.disableClickPropagation(legendPanel);
    L.DomEvent.disableScrollPropagation(legendPanel);
    pseudoFullscreenSnapshot = {
        x: window.scrollX,
        y: window.scrollY,
        bodyStyle: document.body.getAttribute('style'),
        rootOverflow: document.documentElement.style.overflow,
        legendAnchor,
        legendPanel
    };
    const { x, y } = pseudoFullscreenSnapshot;
    document.documentElement.style.overflow = 'hidden';
    Object.assign(document.body.style, {
        position: 'fixed', top: `${-y}px`, left: `${-x}px`, width: '100%', overflow: 'hidden'
    });
    mapFullscreenWrapper.classList.add('is-pseudo-fullscreen');
    syncMapFullscreen();
}

function exitPseudoFullscreen() {
    if (!pseudoFullscreenSnapshot) return;
    const snapshot = pseudoFullscreenSnapshot;
    pseudoFullscreenSnapshot = null;
    snapshot.legendAnchor.replaceWith(document.getElementById('legend'));
    snapshot.legendPanel.remove();
    mapFullscreenWrapper.classList.remove('is-pseudo-fullscreen');
    ['top', 'left', 'width', 'height'].forEach(name => {
        mapFullscreenWrapper.style.removeProperty(`--map-viewport-${name}`);
    });
    if (snapshot.bodyStyle === null) document.body.removeAttribute('style');
    else document.body.setAttribute('style', snapshot.bodyStyle);
    document.documentElement.style.overflow = snapshot.rootOverflow;
    // ガイド・雨雲のDOM位置も戻した後にスクロール位置を復元する。
    syncMapFullscreen();
    window.scrollTo({ left: snapshot.x, top: snapshot.y, behavior: 'instant' });
}

async function toggleFullScreen() {
    if (mapFullscreenRequestPending) return;
    if (pseudoFullscreenSnapshot) {
        exitPseudoFullscreen();
        return;
    }
    const exiting = !!document.fullscreenElement;
    if (!exiting && typeof mapFullscreenWrapper.requestFullscreen !== 'function') {
        enterPseudoFullscreen();
        return;
    }
    mapFullscreenRequestPending = true;
    try {
        if (exiting) await document.exitFullscreen();
        else await mapFullscreenWrapper.requestFullscreen();
    } catch (err) {
        // 拒否(TypeError/NotAllowedError等)を非対応として扱わない。
        if (!exiting && err.name === 'NotSupportedError') enterPseudoFullscreen();
        else {
            console.error('地図の全画面切り替えに失敗しました:', err);
            document.dispatchEvent(new CustomEvent('mapfullscreenerror', { detail: err }));
        }
    } finally {
        mapFullscreenRequestPending = false;
    }
}

document.addEventListener('fullscreenchange', syncMapFullscreen);
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && pseudoFullscreenSnapshot && !event.defaultPrevented) exitPseudoFullscreen();
});
window.addEventListener('resize', () => { if (isMapFullscreen()) resizeFullscreenMap(); });
window.addEventListener('orientationchange', () => { if (isMapFullscreen()) resizeFullscreenMap(); });
window.addEventListener('pageshow', () => { if (isMapFullscreen()) syncMapFullscreen(); });
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isMapFullscreen()) syncMapFullscreen();
});
if (window.visualViewport) {
    ['resize', 'scroll'].forEach(type => window.visualViewport.addEventListener(type, () => {
        if (pseudoFullscreenSnapshot) resizeFullscreenMap();
    }));
}

// 画面ONのユーザー設定と、OSが解除する実際のWake Lockは別に保持します。
const screenWakeLockMobileQuery = window.matchMedia(MAP_ZOOM_CONTROL_MOBILE_MEDIA_QUERY);
let screenWakeLockEnabled = false;
let screenWakeLockSentinel = null;
let screenWakeLockRequest = null;

function getScreenWakeLockContext() {
    return {
        isMobile: screenWakeLockMobileQuery.matches,
        isFullscreen: isMapFullscreen(),
        isVisible: document.visibilityState === 'visible'
    };
}

function renderScreenWakeLock() {
    const context = getScreenWakeLockContext();
    const button = document.getElementById('screen-wake-lock-btn');
    button.hidden = !(context.isMobile && context.isFullscreen);
    button.setAttribute('aria-pressed', String(screenWakeLockEnabled));
    const label = screenWakeLockEnabled ? '画面ONモードを停止' : '画面ONモードを開始';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = screenWakeLockEnabled ? '画面<br>ON' : '画面<br>OFF';
    document.getElementById('screen-wake-lock-status').hidden = !(
        context.isMobile && context.isFullscreen && context.isVisible &&
        screenWakeLockSentinel && !screenWakeLockSentinel.released
    );
}

async function releaseScreenWakeLockSentinel(sentinel) {
    if (!sentinel || sentinel.released) return;
    try {
        await sentinel.release();
    } catch (err) {
        // 解除の失敗を地図処理へ伝播させません。
        console.warn('画面ONモードの解除に失敗しました:', err);
    }
}

function releaseScreenWakeLock(resetSetting) {
    if (resetSetting) screenWakeLockEnabled = false;
    // 取得中にOFF/全画面解除/非表示になった場合、遅れて届く取得結果を無効化します。
    screenWakeLockRequest = null;
    const sentinel = screenWakeLockSentinel;
    screenWakeLockSentinel = null;
    renderScreenWakeLock();
    void releaseScreenWakeLockSentinel(sentinel);
}

async function requestScreenWakeLock() {
    const context = getScreenWakeLockContext();
    if (!context.isMobile || !context.isFullscreen || !context.isVisible ||
        screenWakeLockRequest || (screenWakeLockSentinel && !screenWakeLockSentinel.released)) return;

    const request = {};
    screenWakeLockRequest = request;
    try {
        if (!navigator.wakeLock || typeof navigator.wakeLock.request !== 'function') {
            throw new Error('Screen Wake Lock API非対応');
        }
        const sentinel = await navigator.wakeLock.request('screen');
        const currentContext = getScreenWakeLockContext();
        if (screenWakeLockRequest !== request || !currentContext.isMobile ||
            !currentContext.isFullscreen || !currentContext.isVisible) {
            await releaseScreenWakeLockSentinel(sentinel);
            return;
        }
        if (sentinel.released) throw new Error('Wake Lockは解除済みです');

        screenWakeLockSentinel = sentinel;
        sentinel.addEventListener('release', () => {
            if (screenWakeLockSentinel !== sentinel) return;
            screenWakeLockSentinel = null;
            // 設定は維持し、再取得はvisibleへの復帰時のみ行います。
            renderScreenWakeLock();
        });
        screenWakeLockEnabled = true;
    } catch (err) {
        if (screenWakeLockRequest === request) {
            screenWakeLockEnabled = false;
            console.warn('画面ONモードを有効にできませんでした:', err);
        }
    } finally {
        if (screenWakeLockRequest === request) screenWakeLockRequest = null;
        renderScreenWakeLock();
    }
}

function syncScreenWakeLockContext() {
    const context = getScreenWakeLockContext();
    if (!context.isMobile || !context.isFullscreen) {
        releaseScreenWakeLock(true);
    } else if (!context.isVisible) {
        releaseScreenWakeLock(false);
    } else {
        renderScreenWakeLock();
        if (screenWakeLockEnabled) void requestScreenWakeLock();
    }
}

const screenWakeLockButton = document.getElementById('screen-wake-lock-btn');
screenWakeLockButton.addEventListener('click', () => {
    if (screenWakeLockEnabled || screenWakeLockRequest) releaseScreenWakeLock(true);
    else void requestScreenWakeLock();
});
// 地図の既存タッチ/長押し処理へ、新しいボタン操作を流しません。
L.DomEvent.disableClickPropagation(screenWakeLockButton);
L.DomEvent.disableScrollPropagation(screenWakeLockButton);
document.addEventListener('mapfullscreenchange', syncScreenWakeLockContext);
document.addEventListener('visibilitychange', syncScreenWakeLockContext);
window.addEventListener('pagehide', () => releaseScreenWakeLock(false));
window.addEventListener('pageshow', syncScreenWakeLockContext);
if (screenWakeLockMobileQuery.addEventListener) {
    screenWakeLockMobileQuery.addEventListener('change', syncScreenWakeLockContext);
} else if (screenWakeLockMobileQuery.addListener) {
    screenWakeLockMobileQuery.addListener(syncScreenWakeLockContext);
}
renderScreenWakeLock();

// 全画面の状態遷移とは独立した表示調整。Wake Lock・ズームの既存幅条件は変更しない。
const MAP_FULLSCREEN_UI_PHONE_SHORT_SIDE_MAX = 767;
const mapFullscreenTouchQuery = window.matchMedia('(pointer: coarse) and (hover: none)');
function isMobileMapUI() {
    const screenShortSide = Math.min(window.screen.width, window.screen.height);
    return screenWakeLockMobileQuery.matches ||
        (mapFullscreenTouchQuery.matches && screenShortSide > 0 &&
            screenShortSide <= MAP_FULLSCREEN_UI_PHONE_SHORT_SIDE_MAX);
}
function isMobileFullscreenMapUI() {
    return isMapFullscreen() && isMobileMapUI();
}

(() => {
    const wrapper = mapFullscreenWrapper;
    const column = document.getElementById('map-action-buttons');
    const guide = document.getElementById('operation-guide');
    const wakeStatus = document.getElementById('screen-wake-lock-status');
    const BUTTON_STAGES = [
        { size: 56, gap: 8 }, { size: 52, gap: 6 },
        { size: 48, gap: 6 }, { size: 44, gap: 4 }
    ];
    const TOP_MARGIN = 18;
    const BOTTOM_MARGIN = 24; // Leaflet帰属表示を避ける。
    const SIDE_MARGIN = 10;
    const PANEL_GAP = 8;
    const COLUMN_PADDING = 4;
    const SCROLLBAR_SPACE = 16;
    const NORMAL_STAGE = { size: 44, gap: 10 };
    const NORMAL_TOP_MARGIN = 10;
    let frame = null;

    function layout() {
        frame = null;
        if (!isMobileMapUI()) return;
        const fullscreen = isMobileFullscreenMapUI();
        const rect = wrapper.getBoundingClientRect();
        const viewport = window.visualViewport;
        // 通常表示は地図に対する絶対配置。ページスクロールへ追従させない。
        const visibleTop = fullscreen ? Math.max(rect.top, viewport ? viewport.offsetTop : 0) - rect.top : 0;
        const visibleBottom = fullscreen ? Math.min(rect.bottom, viewport ? viewport.offsetTop + viewport.height : window.innerHeight) - rect.top : rect.height;
        const style = getComputedStyle(wrapper);
        const safe = edge => parseFloat(style.getPropertyValue(`--map-ui-safe-${edge}`)) || 0;
        const minStage = fullscreen ? BUTTON_STAGES[BUTTON_STAGES.length - 1] : NORMAL_STAGE;
        const usableHeight = visibleBottom - visibleTop - safe('top') - safe('bottom') - BOTTOM_MARGIN;
        // 極短画面では余白から先に縮め、現在地と列内の1ボタン分を確保する。
        const padding = Math.min(COLUMN_PADDING, Math.max(0, (usableHeight - minStage.size * 2 - minStage.gap) / 2));
        const margin = Math.min(fullscreen ? TOP_MARGIN : NORMAL_TOP_MARGIN,
            Math.max(0, usableHeight - minStage.size * 2 - minStage.gap - padding * 2));
        const top = visibleTop + safe('top') + margin;
        const available = Math.max(0, visibleBottom - safe('bottom') - BOTTOM_MARGIN - top);
        const count = Array.from(column.children).filter(button => !button.hidden && getComputedStyle(button).display !== 'none').length;
        const columnHeight = stage => count * stage.size + Math.max(0, count - 1) * stage.gap;
        const stages = fullscreen ? BUTTON_STAGES : [NORMAL_STAGE];
        const stage = stages.find(item => columnHeight(item) + item.size + item.gap <= available - padding * 2) || minStage;
        const columnAvailable = Math.max(0, available - stage.size - stage.gap);
        const scrolling = columnHeight(stage) > columnAvailable - padding * 2;
        column.classList.toggle('is-scrollable', scrolling);
        column.classList.toggle('is-exit-pinned', scrolling && columnAvailable >= stage.size * 2 + stage.gap + padding * 2);
        const columnWidth = stage.size + COLUMN_PADDING * 2 + (scrolling ? SCROLLBAR_SPACE : 0);
        const set = (name, value) => wrapper.style.setProperty(`--map-ui-${name}`, `${value}px`);
        set('button-size', stage.size);
        set('button-gap', stage.gap);
        set('column-width', columnWidth);
        set('column-top', top);
        set('column-height', columnAvailable);
        set('column-padding', padding);
        set('location-bottom', rect.height - visibleBottom + safe('bottom') + BOTTOM_MARGIN);
        set('location-right', safe('right') + SIDE_MARGIN + columnWidth - COLUMN_PADDING - stage.size);
        const zoom = wrapper.querySelector('.leaflet-control-zoom');
        const zoomRight = zoom ? zoom.getBoundingClientRect().right - rect.left : safe('left');
        set('content-left', Math.max(safe('left'), zoomRight) + SIDE_MARGIN);
        set('content-right', safe('right') + SIDE_MARGIN + columnWidth + PANEL_GAP);
        if (!fullscreen) {
            guide.style.setProperty('--map-mobile-controls-right', `${safe('right') + SIDE_MARGIN + columnWidth + PANEL_GAP}px`);
            return;
        }
        set('guide-top', visibleTop + safe('top') + TOP_MARGIN);
        const guideBottom = guide.getBoundingClientRect().bottom - rect.top;
        set('status-top', guideBottom + PANEL_GAP);
        const statusBottom = wakeStatus.hidden ? guideBottom : wakeStatus.getBoundingClientRect().bottom - rect.top;
        const legend = wrapper.querySelector('.pseudo-fullscreen-legend');
        const footer = legend ? Math.max(BOTTOM_MARGIN, rect.bottom - legend.getBoundingClientRect().top + PANEL_GAP) : safe('bottom') + BOTTOM_MARGIN;
        set('panel-bottom', rect.height - visibleBottom + footer);
        set('panel-height', Math.max(0, visibleBottom - footer - statusBottom - PANEL_GAP));
    }

    function sync() {
        const active = isMobileMapUI();
        wrapper.classList.toggle('is-mobile-map-ui', active);
        wrapper.classList.toggle('is-mobile-fullscreen-ui', isMobileFullscreenMapUI());
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        if (active) frame = requestAnimationFrame(layout);
        else {
            guide.style.removeProperty('--map-mobile-controls-right');
            column.classList.remove('is-scrollable');
            column.classList.remove('is-exit-pinned');
            column.scrollTop = 0;
            Array.from(wrapper.style).filter(name => name.startsWith('--map-ui-')).forEach(name => wrapper.style.removeProperty(name));
        }
    }

    // 列は地図の兄弟DOM。スクロールの既定動作を残して地図へは伝播させない。
    L.DomEvent.disableClickPropagation(column);
    L.DomEvent.disableScrollPropagation(column);
    L.DomEvent.on(column, 'touchmove', L.DomEvent.stopPropagation);
    document.addEventListener('mapfullscreenchange', sync);
    document.addEventListener('mapfullscreenresize', sync);
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', sync);
        window.visualViewport.addEventListener('scroll', sync);
    }
    [screenWakeLockMobileQuery, mapFullscreenTouchQuery].forEach(query => {
        if (query.addEventListener) query.addEventListener('change', sync);
        else query.addListener(sync);
    });
    new MutationObserver(sync).observe(wrapper, {
        subtree: true, attributes: true,
        attributeFilter: ['hidden', 'aria-pressed', 'open']
    });
    sync();
})();

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

// ロック開始前に残った長押し・片指ズームだけを終了し、GPS追従には触れない。
function cancelMapGestureForInteractionLock() {
    clearLongPressTimer();
    if (oneFingerZoomState && oneFingerZoomState.active) {
        handleOneFingerZoomEnd(new Event('touchcancel', { cancelable: true }));
    }
    oneFingerZoomState = null;
}

// setTimeoutの800msは長押しピン設置までの待ち時間。大きくすると長押し判定が遅く、小さくすると誤設置しやすくなります。
map.on('touchstart', (e) => { if (e.originalEvent.touches.length === 1) pressTimer = setTimeout(() => placeTempPin(e.latlng), 800); });
map.on('touchend dblclick touchmove', clearLongPressTimer);

function placeTempPin(latlng, name = "指定した地点") {
    if (tempMarker) tempMarker.setLatLng(latlng);
    else tempMarker = L.marker(latlng).addTo(map);
    tempMarker.bindPopup(createPopupContent(name, latlng.lat, latlng.lng)).openPopup();
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

function isValidScenicRouteCoordinate(coordinate) {
    return Array.isArray(coordinate) && coordinate.length >= 2 &&
        Number.isFinite(coordinate[0]) && Math.abs(coordinate[0]) <= 180 &&
        Number.isFinite(coordinate[1]) && Math.abs(coordinate[1]) <= 90;
}

// クリックされた名道だけを現在の投影で調べる。無効な頂点を挟む区間は線分にしない。
function getNearestScenicRouteLatLng(latlng, coordinates) {
    if (!latlng || !isValidScenicRouteCoordinate([latlng.lng, latlng.lat]) || !Array.isArray(coordinates)) return null;
    const clickPoint = map.latLngToLayerPoint(latlng);
    let previous = null;
    let nearestPoint = null;
    let nearestDistance = Infinity;
    let nearestVertex = null;
    let vertexDistance = Infinity;
    for (const coordinate of coordinates) {
        if (!isValidScenicRouteCoordinate(coordinate)) {
            previous = null;
            continue;
        }
        const vertex = L.latLng(coordinate[1], coordinate[0]);
        const point = map.latLngToLayerPoint(vertex);
        const distance = clickPoint.distanceTo(point);
        if (distance < vertexDistance) {
            nearestVertex = vertex;
            vertexDistance = distance;
        }
        if (previous) {
            const candidate = L.LineUtil.closestPointOnSegment(clickPoint, previous, point);
            const candidateDistance = clickPoint.distanceTo(candidate);
            if (candidateDistance < nearestDistance) {
                nearestPoint = candidate;
                nearestDistance = candidateDistance;
            }
        }
        previous = point;
    }
    const result = nearestPoint ? map.layerPointToLatLng(nearestPoint) : nearestVertex;
    return result && isValidScenicRouteCoordinate([result.lng, result.lat]) ? result : null;
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
                        // 名道の不正な頂点は描画へ渡さず、原本と最近接計算用の座標列は保持する。
                        const routeCoordinates = n === "名道"
                            ? (Array.isArray(c) ? c.filter(isValidScenicRouteCoordinate) : []) : c;
                        if (n === "名道" && routeCoordinates.length === 0) return;
                        const latlngs = routeCoordinates.map(p => [p[1], p[0]]);
                        // weightを変えるとルート線の太さ、opacityを変えると線の濃さが変わります。
                        L.polyline(latlngs, { color: color, weight: 4, opacity: 0.8, interactive: false }).addTo(group);
                        // 透明なクリック領域です。weightを大きくすると線をタップ/クリックしやすくなります。
                        const touchLine = L.polyline(latlngs, { color: 'transparent', weight: 24, opacity: 0, interactive: true }).addTo(group);
                        if (n === "名道") {
                            let popupContent = createPopupContent(f.properties.name || "名道",
                                routeCoordinates[0][1], routeCoordinates[0][0], f.properties.description, n, false);
                            // bindPopupの標準click処理より先に内容を用意し、開閉・配置はLeafletへ任せる。
                            touchLine.on('click', event => {
                                const nearest = getNearestScenicRouteLatLng(event.latlng, c);
                                popupContent = nearest ? createPopupContent(f.properties.name || "名道",
                                    nearest.lat, nearest.lng, f.properties.description, n, false) : '';
                            });
                            touchLine.bindPopup(() => popupContent);
                        } else {
                            touchLine.bindPopup(createPopupContent(f.properties.name || "名道", c[0][1], c[0][0], f.properties.description, n, false));
                        }
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
