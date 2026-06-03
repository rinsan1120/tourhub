// --- 地図制御（聖域：ロジック改変厳禁） ---
const map = L.map('map', { tap: false, doubleClickZoom: true }).setView([35.6895, 139.6917], 8);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

let myLocMarker = null, tempMarker = null;
const layerGroups = {};
const HIGHWAY_IC_LAYER_NAME = "高速道路IC";
const HIGHWAY_IC_MIN_ZOOM_PC = 11;
const HIGHWAY_IC_MIN_ZOOM_MOBILE = 10;
const HIGHWAY_IC_ICON_URL = "images/ic_logo.png";
const COORD_JUMP_ZOOM = 16;

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
const ONE_FINGER_ZOOM_TAP_INTERVAL = 350;
const ONE_FINGER_ZOOM_TAP_DISTANCE = 40;
const ONE_FINGER_ZOOM_STEP_DISTANCE = 70;
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
        oneFingerZoomState = {
            active: true,
            anchorLatLng: getTouchLatLng(touch),
            startY: touch.clientY,
            startZoom: map.getZoom(),
            lastZoom: map.getZoom(),
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
    const dy = oneFingerZoomState.startY - e.touches[0].clientY;
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
        clearLongPressTimer();
        oneFingerZoomState = null;
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

function updateZoomLimitedLayer(group, minZoom) {
    minZoom = resolveMinZoom(minZoom);
    if (map.getZoom() >= minZoom) {
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

    try {
        const res = await fetch('umap_backup_map.umap');
        const data = await res.json();
        const layerSettings = {
            "名道": { color: "#ff0000", type: "line" },
            "グルメ": { color: "#ff7f00", type: "point" },
            "温泉": { color: "#00ffff", type: "point" },
            "観光": { color: "#ff23ff", type: "point" },
            "キャンプ場": { color: "#00ff00", type: "point" },
            "宿": { color: "#808080", type: "point" },
            "景勝地": { color: "#0000ff", type: "point" },
            "道の駅": { color: "#8c6450", type: "point" },
            [HIGHWAY_IC_LAYER_NAME]: { color: "#2f3640", type: "point", cluster: false, minZoom: { pc: HIGHWAY_IC_MIN_ZOOM_PC, mobile: HIGHWAY_IC_MIN_ZOOM_MOBILE }, showInLegend: false, countInStats: false, iconUrl: HIGHWAY_IC_ICON_URL }
        };

        data.layers.forEach(layer => {
            const n = layer.properties.name || "未分類";
            const setting = layerSettings[n] || {};
            const color = setting.color || layer.properties.color || "#3182ce";

            // クラスタリング対応のグループ設定
            const isPoint = (setting.type === "point");
            const shouldCluster = isPoint && setting.cluster !== false;
            // レイヤーごとの色を適用したiconCreateFunctionを設定
            const group = shouldCluster ? L.markerClusterGroup({
                disableClusteringAtZoom: 10,
                iconCreateFunction: function(cluster) {
                    return L.divIcon({
                        html: `<div style="background-color:${color}; color:white; border-radius:50%; width:30px; height:30px; line-height:30px; text-align:center; opacity:0.9; font-size:12px;">${cluster.getChildCount()}</div>`,
                        className: 'marker-cluster-custom',
                        iconSize: L.point(30, 30)
                    });
                }
            }) : L.layerGroup();
            if (setting.minZoom) {
                updateZoomLimitedLayer(group, setting.minZoom);
                map.on('zoomend', () => updateZoomLimitedLayer(group, setting.minZoom));
                window.addEventListener('resize', () => updateZoomLimitedLayer(group, setting.minZoom));
            } else {
                group.addTo(map);
            }
            layerGroups[n] = group;
            
            if (layer.features) {
                layer.features.forEach(f => {
                    const c = f.geometry.coordinates;
                    if (f.geometry.type === "Point") {
                        const popupName = n === HIGHWAY_IC_LAYER_NAME
                            ? `${f.properties.name || "名称未設定"}IC`
                            : f.properties.name || "名称未設定";
                        const marker = setting.iconUrl
                            ? L.marker([c[1], c[0]], {
                                icon: L.icon({
                                    iconUrl: setting.iconUrl,
                                    iconSize: [18, 18],
                                    iconAnchor: [9, 9],
                                    popupAnchor: [0, -9]
                                })
                            })
                            : L.circleMarker([c[1], c[0]], { radius: 9, fillColor: color, color: "#fff", weight: 2, fillOpacity: 0.9 });
                        marker.bindPopup(createPopupContent(popupName, c[1], c[0], f.properties.description, n));
                        group.addLayer(marker);
                    } else if (f.geometry.type === "LineString") {
                        const latlngs = c.map(p => [p[1], p[0]]);
                        L.polyline(latlngs, { color: color, weight: 4, opacity: 0.8, interactive: false }).addTo(group);
                        const touchLine = L.polyline(latlngs, { color: 'transparent', weight: 24, opacity: 0, interactive: true }).addTo(group);
                        touchLine.bindPopup(createPopupContent(f.properties.name || "名道", c[0][1], c[0][0], f.properties.description, n, false));
                    }
                });
            }

            const isLine = (setting.type === "line");

            // IDで重複チェックを行う
            if (setting.showInLegend !== false && !document.getElementById('legend-item-' + n)) {
                const item = document.createElement('div');
                item.className = 'legend-item';
                item.id = 'legend-item-' + n; // 一意なIDを付与
                const badgeStyle = isLine ? `width:16px; height:4px; border-radius:2px;` : `width:10px; height:10px; border-radius:50%;`;
                item.innerHTML = `<input type="checkbox" checked onchange="toggleLayer('${n}', this.checked)"><span style="background:${color}; ${badgeStyle} display:inline-block; margin-right:6px;"></span><span>${n}</span>`;
                legend.appendChild(item);
            }
        });
    } catch (e) {
        console.error(e);
    }
}

function toggleLayer(n, checked) { 
    if (checked) map.addLayer(layerGroups[n]); 
    else map.removeLayer(layerGroups[n]); 
}

let mapInitialized = false;

function initMap() {
    if (mapInitialized) return;
    mapInitialized = true;
    updateGuideText();
    updateZoomBadge();
    map.on('zoomend', updateZoomBadge);
    initOneFingerZoomControl();
    initCoordJumpControl();
    updateMyLocation();
    loadUmapData();
}
