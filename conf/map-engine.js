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
    const baseUrl = `https://www.google.com/maps/dir/?api=1&destination=$${coords}&travelmode=driving`;
    const localUrl = `${baseUrl}&avoid=tolls,highways`;
    // ★追加：ピン位置を保持したまま開くGoogleマップURL
    const gmapUrl = `https://www.google.com/maps/search/?api=1&query=$$${coords}`;
    
    let html = `<div style="text-align: center; min-width: 180px;">`;
    html += `<span style="font-weight: bold; font-size: 1.1rem; display: block; margin-bottom: 5px;">${name}</span>`;
    
    if (category) html += `<span style="font-size: 0.75rem; color: #3182ce; background: #ebf8ff; padding: 2px 8px; border-radius: 4px; margin-bottom: 10px; display: inline-block;">${category}</span>`;
    if (description) html += `<p style="font-size:0.85rem; color:#444; margin-bottom:10px; text-align: left; line-height: 1.4;">${description.replace(/\n/g, '<br>')}</p>`;
    
    // ★追加：Googleマップ遷移リンク
    html += `<a href="${gmapUrl}" target="_blank" style="display:block; margin-bottom:10px; color:#555; text-decoration:underline; font-size:0.85rem;">Googleマップで見る</a>`;
    
    html += `<div style="display: flex; flex-direction: column; gap: 8px;">`;
    html += `<a href="${baseUrl}" target="_blank" style="display: block; padding: 10px; background: #4285F4; color: white !important; text-decoration: none; border-radius: 8px; font-weight: bold;">高速使用</a>`;
    html += `<a href="${localUrl}" target="_blank" style="display: block; padding: 10px; background: #34A853; color: white !important; text-decoration: none; border-radius: 8px; font-weight: bold;">下道のみ</a>`;
    
    return html + `</div></div>`;
}

// ★追加：全画面機能関数
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
    const badge = document.getElementById('stats-badge'), legend = document.getElementById('legend-items');
    try {
        const res = await fetch('umap_backup_map.umap'), data = await res.json();
        let pC = 0, lC = 0;
        data.layers.forEach(layer => {
            const color = layer.properties.color || "#3182ce", n = layer.properties.name || "未分類";
            const group = L.layerGroup().addTo(map); layerGroups[n] = group;
            
            // ループ処理開始（前半の重複部分を削除したため、ここから安全にデータが読み込まれます）
            layer.features.forEach(f => {
                const c = f.geometry.coordinates;
                if (f.geometry.type === "Point") {
                    const marker = L.circleMarker([c[1], c[0]], { radius: 9, fillColor: color, color: "#fff", weight: 2, fillOpacity: 0.9 }).addTo(group);
                    marker.bindPopup(createPopupContent(f.properties.name || "名称未設定", c[1], c[0], f.properties.description, n));
                    pC++;
                } else if (f.geometry.type === "LineString") {
                    const latlngs = c.map(p => [p[1], p[0]]);

                    // 1. 【見た目用】シャープで細い実線
                    const visibleLine = L.polyline(latlngs, { 
                        color: color, 
                        weight: 4,         // ★ 線の見た目の細さ。大きいほど見た目の線が太くなる。
                        opacity: 0.8,
                        interactive: false 
                    }).addTo(group);

                    // 2. 【タップ判定用】完全に透明な極太線
                    const touchLine = L.polyline(latlngs, { 
                        color: 'transparent', 
                        weight: 24,        // ★ 見えないタップ判定の太さ（24pxあれば押し損ねがほぼゼロに）
                        opacity: 0,
                        bubblingMouseEvents: false,
                        interactive: true
                    }).addTo(group);
                    
                    // スマホでのタッチ時に、地図側の干渉イベントを完全に止める処理（判定用の太い線に適用）
                    touchLine.on('touchstart mousedown', (e) => { L.DomEvent.stopPropagation(e); });
                
                    // ポップアップは「判定用の太い線」に紐付ける
                    touchLine.bindPopup(createPopupContent(f.properties.name || "名称未設定の道", c[0][1], c[0][0], f.properties.description, n));
                    lC++;
                }
            });

            // レイヤー内に「線」が1本でも含まれているか自動判定する処理
            let hasLine = false;
            group.eachLayer((layer) => {
                if (layer instanceof L.Polyline) {
                    hasLine = true;
                }
            });

            // 凡例アイテムの作成（線の場合は横長の線デザインにする）
            const item = document.createElement('div');
            item.className = 'legend-item';
            
            // hasLine の状態（点か線か）によってアイコンの形状（CSS）を出し分ける
            const badgeStyle = hasLine 
                ? `width:16px; height:4px; border-radius:2px; margin-right:6px; flex-shrink:0; display:inline-block;` 
                : `width:10px; height:10px; border-radius:50%; margin-right:6px; flex-shrink:0; display:inline-block;`;

            item.innerHTML = `<input type="checkbox" checked onchange="toggleLayer('${n}', this.checked)"><span style="background:${color}; ${badgeStyle}"></span><span>${n}</span>`;
            legend.appendChild(item);

        }); // data.layers.forEach の閉じカッコ
        badge.innerText = `点: ${pC} / 線: ${lC}`;
    } catch (e) { badge.innerText = "読込エラー"; }
}
function toggleLayer(n, checked) { if (checked) map.addLayer(layerGroups[n]); else map.removeLayer(layerGroups[n]); }

// 初期化実行
updateGuideText();
updateMyLocation();
loadUmapData();
