// --- 地図制御（聖域：ロジック改変厳禁） ---
const map = L.map('map', { tap: false, doubleClickZoom: true }).setView([35.6895, 139.6917], 8);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

let myLocMarker = null, tempMarker = null;
const layerGroups = {};

function updateGuideText() {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    document.getElementById('guide-text').innerText = isTouch ? "長押しでピン設置" : "右クリックでピン設置";
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

// 【重要機能】OS判定・高速/下道ルート検索ポップアップ
function createPopupContent(name, lat, lng, description = "", category = "") {
    // OSに関わらずGoogleマップアプリを優先起動するユニバーサルリンク
    const baseUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    const localUrl = `${baseUrl}&avoid=tolls,highways`;
    
    let html = `<div style="text-align: center; min-width: 180px;">`;
    html += `<span style="font-weight: bold; font-size: 1.1rem; display: block; margin-bottom: 5px;">${name}</span>`;
    
    if (category) {
        html += `<span style="font-size: 0.75rem; color: #3182ce; background: #ebf8ff; padding: 2px 8px; border-radius: 4px; margin-bottom: 10px; display: inline-block;">${category}</span>`;
    }
    
    if (description) {
        html += `<p style="font-size:0.85rem; color:#444; margin-bottom:10px; text-align: left; line-height: 1.4;">${description.replace(/\n/g, '<br>')}</p>`;
    }
    
    html += `<span style="font-size: 0.8rem; color: #666; display: block; border-top: 1px solid #eee; padding-top: 10px; margin-bottom: 8px;">この地点へのルートを検索</span>`;
    html += `<div style="display: flex; flex-direction: column; gap: 8px;">`;
    
    // 高速使用ボタン
    html += `<a href="${baseUrl}" target="_blank" style="display: block; padding: 10px; background: #4285F4; color: white !important; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 1rem; text-align: center;">`;
    html += `<i class="fa-solid fa-route"></i> 高速使用</a>`;
    
    // 下道のみボタン
    html += `<a href="${localUrl}" target="_blank" style="display: block; padding: 10px; background: #34A853; color: white !important; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 1rem; text-align: center;">`;
    html += `<i class="fa-solid fa-road"></i> 下道のみ</a>`;
    
    return html + `</div></div>`;
}

map.on('contextmenu', (e) => { placeTempPin(e.latlng); return false; });
let pressTimer;
map.on('touchstart', (e) => { if (e.originalEvent.touches.length === 1) pressTimer = setTimeout(() => placeTempPin(e.latlng), 800); });
map.on('touchend dblclick touchmove', () => clearTimeout(pressTimer));

function placeTempPin(latlng) {
    if (tempMarker) tempMarker.setLatLng(latlng);
    else tempMarker = L.marker(latlng).addTo(map);
    tempMarker.bindPopup(createPopupContent("指定した地点", latlng.lat, latlng.lng)).openPopup();
}

async function loadUmapData() {
    const badge = document.getElementById('stats-badge'), legend = document.getElementById('legend-items');
    try {
        const res = await fetch('umap_backup_map.umap'), data = await res.json();
        let pC = 0, lC = 0;
        data.layers.forEach(layer => {
            const color = layer.properties.color || "#3182ce", n = layer.properties.name || "未分類";
            const group = L.layerGroup().addTo(map); layerGroups[n] = group;
            const item = document.createElement('div');
            item.className = 'legend-item';
            item.innerHTML = `<input type="checkbox" checked onchange="toggleLayer('${n}', this.checked)"><span class="legend-dot" style="background:${color}"></span><span>${n}</span>`;
            legend.appendChild(item);
            layer.features.forEach(f => {
                const c = f.geometry.coordinates;
                if (f.geometry.type === "Point") {
                    const marker = L.circleMarker([c[1], c[0]], { radius: 9, fillColor: color, color: "#fff", weight: 2, fillOpacity: 0.9 }).addTo(group);
                    marker.bindPopup(createPopupContent(f.properties.name || "名称未設定", c[1], c[0], f.properties.description, n));
                    pC++;
            } else if (f.geometry.type === "LineString") {
                const line = L.polyline(c.map(p => [p[1], p[0]]), { color: color, weight: 6 }).addTo(group);
                line.bindPopup(createPopupContent(f.properties.name || "名称未設定の道", c[0][1], c[0][0], f.properties.description, n)); // ← これを足す
                lC++;
            }
            });
        });
        badge.innerText = `点: ${pC} / 線: ${lC}`;
    } catch (e) { badge.innerText = "読込エラー"; }
}
function toggleLayer(n, checked) { if (checked) map.addLayer(layerGroups[n]); else map.removeLayer(layerGroups[n]); }

// 初期化実行
updateGuideText();
updateMyLocation();
loadUmapData();
