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

function createPopupContent(name, lat, lng, description = "", category = "") {
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
    return html + `</div></div>`;
}

function toggleFullScreen() {
    if (!document.fullscreenElement) document.getElementById('map').requestFullscreen().catch(err => console.log(err));
    else document.exitFullscreen();
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
    const badge = document.getElementById('stats-badge');
    const legend = document.getElementById('legend-items');
    let pC = 0, lC = 0; // カウンター初期化
    
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
            "道の駅": { color: "#8c6450", type: "point" } // ★ここに追加
        };

        data.layers.forEach(layer => {
            const n = layer.properties.name || "未分類";
            const setting = layerSettings[n] || {};
            const color = setting.color || layer.properties.color || "#3182ce";
//レイヤーごとの集約に伴うコメントアウトここから 
/*           const group = L.layerGroup().addTo(map); 
            layerGroups[n] = group;
            
            if (layer.features) {
                layer.features.forEach(f => {
                    const c = f.geometry.coordinates;
                    if (f.geometry.type === "Point") {
                        const marker = L.circleMarker([c[1], c[0]], { radius: 9, fillColor: color, color: "#fff", weight: 2, fillOpacity: 0.9 }).addTo(group); */
//レイヤーごとの集約に伴うコメントアウトここまで
//レイヤーごと集約表示に伴う追加　ここから
            data.layers.forEach(layer => {
            const n = layer.properties.name || "未分類";
            const setting = layerSettings[n] || {};
            const color = setting.color || layer.properties.color || "#3182ce";
            
            // ★ここを変更：タイプに応じてグループを使い分ける
            const isPoint = (setting.type === "point");
            const group = isPoint ? L.markerClusterGroup({ disableClusteringAtZoom: 10 }).addTo(map) : L.layerGroup().addTo(map);
            layerGroups[n] = group;
            
            if (layer.features) {
                layer.features.forEach(f => {
                    const c = f.geometry.coordinates;
                    if (f.geometry.type === "Point") {
                        // ★markerClusterGroupの場合はaddLayerを使用
                        const marker = L.circleMarker([c[1], c[0]], { radius: 9, fillColor: color, color: "#fff", weight: 2, fillOpacity: 0.9 });
                        marker.bindPopup(createPopupContent(f.properties.name || "名称未設定", c[1], c[0], f.properties.description, n));
                        group.addLayer(marker); // addTo(group) から変更
                        pC++;
                    } else if (f.geometry.type === "LineString") {
                        // ...（線系の処理はそのまま）...
                        const latlngs = c.map(p => [p[1], p[0]]);
                        L.polyline(latlngs, { color: color, weight: 4, opacity: 0.8, interactive: false }).addTo(group);
                        const touchLine = L.polyline(latlngs, { color: 'transparent', weight: 24, opacity: 0, interactive: true }).addTo(group);
                        touchLine.bindPopup(createPopupContent(f.properties.name || "名道", c[0][1], c[0][0], f.properties.description, n));
                    }
                });
            }
            // ...（凡例生成の処理はそのまま）...
//レイヤーごと集約表示に伴う追加　ここまで
                        marker.bindPopup(createPopupContent(f.properties.name || "名称未設定", c[1], c[0], f.properties.description, n));
                        pC++;
                        } else if (f.geometry.type === "LineString") {
                            const latlngs = c.map(p => [p[1], p[0]]);
                            // 1. 見た目用の線
                            L.polyline(latlngs, { color: color, weight: 4, opacity: 0.8, interactive: false }).addTo(group);
                            // 2. 判定用の透明な太い線
                            const touchLine = L.polyline(latlngs, { color: 'transparent', weight: 24, opacity: 0, interactive: true }).addTo(group);
                            // 3. ポップアップのバインド
                            touchLine.bindPopup(createPopupContent(f.properties.name || "名道", c[0][1], c[0][0], f.properties.description, n));
                        }
                });
            }

            const isLine = (setting.type === "line");
            const item = document.createElement('div');
            item.className = 'legend-item';
            const badgeStyle = isLine ? `width:16px; height:4px; border-radius:2px;` : `width:10px; height:10px; border-radius:50%;`;
            item.innerHTML = `<input type="checkbox" checked onchange="toggleLayer('${n}', this.checked)"><span style="background:${color}; ${badgeStyle} display:inline-block; margin-right:6px;"></span><span>${n}</span>`;
            legend.appendChild(item);
        });
        badge.innerText = `点: ${pC} / 線: ${lC}`; // 反映
    } catch (e) {
        badge.innerText = "読込エラー";
    }
}
function toggleLayer(n, checked) { if (checked) map.addLayer(layerGroups[n]); else map.removeLayer(layerGroups[n]); }

updateGuideText();
updateMyLocation();
loadUmapData();
