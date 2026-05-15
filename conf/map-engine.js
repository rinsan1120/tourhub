let map;
let markerLayers = {};
let userLocationMarker = null;

// ポップアップ内容の生成
function createPopupContent(name, lat, lng, description = "", category = "") {
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
    
    html += `<a href="${baseUrl}" target="_blank" style="display: block; padding: 10px; background: #4285F4; color: white !important; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 1rem; text-align: center;">`;
    html += `<i class="fa-solid fa-route"></i> 高速使用</a>`;
    
    html += `<a href="${localUrl}" target="_blank" style="display: block; padding: 10px; background: #34A853; color: white !important; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 1rem; text-align: center;">`;
    html += `<i class="fa-solid fa-road"></i> 下道のみ</a>`;
    
    return html + `</div></div>`;
}

// 地図の初期化
function initMap() {
    // 1. 地図オブジェクトの作成
    map = L.map('map', {
        tap: false,
        tapTolerance: 20,
        dragging: true,
        touchZoom: true
    }).setView([35.6812, 139.7671], 10);
    
    // 2. タイルレイヤーの追加
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // 3. 地図の準備が完全に整ってからマーカーを読み込む（少しだけ猶予を持たせる）
    setTimeout(() => {
        loadMapConfig();
    }, 100);
}

async function loadMapConfig() {
    try {
        const res = await fetch('conf/map.txt?t=' + Date.now());
        const text = await res.text();
        const legendItems = document.getElementById('legend-items');
        legendItems.innerHTML = '';

        let currentCategory = "";
        let colorMap = { "絶景道": "#e53e3e", "キャンプ場": "#38a169", "道の駅": "#3182ce", "その他": "#718096" };

        const lines = text.split('\n');
        for (const rawLine of lines) {
            const line = rawLine.split('//')[0].trim();
            if (!line) continue;

            if (line.startsWith('※')) {
                currentCategory = line.substring(1);
                markerLayers[currentCategory] = L.layerGroup().addTo(map);
                
                const color = colorMap[currentCategory] || "#718096";
                const item = document.createElement('div');
                item.className = 'legend-item';
                item.innerHTML = `<input type="checkbox" checked onchange="toggleLayer('${currentCategory}', this.checked)"><span class="legend-dot" style="background:${color}"></span>${currentCategory}`;
                legendItems.appendChild(item);
            } else if (line.includes(',') && currentCategory) {
                const [name, lat, lon, desc] = line.split(',');
                const color = colorMap[currentCategory] || "#718096";
                
                const customIcon = L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div style="background-color:${color}; width:12px; height:12px; border:2px solid white; border-radius:50%; box-shadow:0 0 3px rgba(0,0,0,0.4);"></div>`,
                    iconSize: [12, 12],
                    iconAnchor: [6, 6]
                });

                // マーカー生成：Androidでのタップ吸い込み防止を追加
                L.marker([parseFloat(lat), parseFloat(lon)], { 
                    icon: customIcon,
                    bubblingMouseEvents: false 
                })
                .bindPopup(createPopupContent(name.trim(), lat.trim(), lon.trim(), desc ? desc.trim() : "", currentCategory))
                .addTo(markerLayers[currentCategory]);
            }
        }
        updateStats();
    } catch (e) { console.error('map.txt 読込失敗', e); }
}

function toggleLayer(cat, checked) {
    if (checked) map.addLayer(markerLayers[cat]);
    else map.removeLayer(markerLayers[cat]);
}

function updateStats() {
    let total = 0;
    Object.values(markerLayers).forEach(layer => total += layer.getLayers().length);
    document.getElementById('stats-badge').innerText = `登録数: ${total}地点`;
    document.getElementById('guide-text').innerText = "地点タップでルート検索";
}

function goToMyLocation() {
    if (!navigator.geolocation) return alert("お使いのブラウザは位置情報に対応していません");
    navigator.geolocation.getCurrentPosition(pos => {
        const { latitude, longitude } = pos.coords;
        if (userLocationMarker) map.removeLayer(userLocationMarker);
        userLocationMarker = L.marker([latitude, longitude], {
            icon: L.divIcon({ className: 'my-loc-con', html: '<div class="my-location-marker"></div>', iconSize: [14, 14] })
        }).addTo(map);
        map.setView([latitude, longitude], 13);
    }, () => alert("位置情報の取得に失敗しました"));
}

// 起動
// window.onload = initMap;
