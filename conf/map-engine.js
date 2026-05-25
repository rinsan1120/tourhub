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

// 【修正箇所】変数埋め込みに $ を追加しました
function createPopupContent(name, lat, lng, description = "", category = "") {
    const coords = `${lat},${lng}`;
    const baseUrl = `https://www.google.com/maps/dir/?api=1&destination=$$${coords}&travelmode=driving`;
    const localUrl = `${baseUrl}&avoid=tolls,highways`;
    const gmapUrl = `https://www.google.com/maps/search/?api=1&query=$$$${coords}`;
    
    let html = `<div style="text-align: center; min-width: 180px;">`;
    html += `<span style="font-weight: bold; font-size: 1.1rem; display: block; margin-bottom: 5px;">${name}</span>`;
    
    if (category) html += `<span style="font-size: 0.75rem; color: #3182ce; background: #ebf8ff; padding: 2px 8px; border-radius: 4px; margin-bottom: 10px; display: inline-block;">${category}</span>`;
    if (description) html += `<p style="font-size:0.85rem; color:#444; margin-bottom:10px; text-align: left; line-height: 1.4;">${description.replace(/\n/g, '<br>')}</p>`;
    
    html += `<a href="${gmapUrl}" target="_blank" style="display:block; margin-bottom:10px; color:#555; text-decoration:underline; font-size:0.85rem;">Googleマップで見る</a>`;
    
    html += `<div style="display: flex; flex-direction: column; gap: 8px;">`;
    html += `<a href="${baseUrl}" target="_blank" style="display: block; padding: 10px; background: #4285F4; color: white !important; text-decoration: none; border-radius: 8px; font-weight: bold;">高速使用</a>`;
    html += `<a href="${localUrl}" target="_blank" style="display: block; padding: 10px; background: #34A853; color: white !important; text-decoration: none; border-radius: 8px; font-weight: bold;">下道のみ</a>`;
    
    return html + `</div></div>`;
}

// 全画面機能
function toggleFullScreen() {
    if (!document.fullscreenElement) document.getElementById('map').requestFullscreen().catch(err => console.log(err));
    else document.exitFullscreen();
}

// ...以下略（placeTempPin以降は変更なしでOK）
