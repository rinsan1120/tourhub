let map;
let markerLayers = {};
let userLocationMarker = null;

// ポップアップ内容の生成（Android/iOS/PC共通）
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
    // 【重要】Androidでのタップ干渉を防ぐ設定を追加
    map = L.map('map', {
        tap: false,
        tapTolerance: 20
    }).setView([35.6812, 139.7671], 10);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    loadUMapData();
}

// uMap (umap_backup_map.umap) のデータを読み込んで表示
async function loadUMapData() {
    try {
        const res = await fetch('./umap_backup_map.umap?t=' + Date.now());
        const data = await res.json();
        const legendItems = document.getElementById('legend-items');
        legendItems.innerHTML = '';

        // レイヤーごとに処理
        data.layers.forEach(layerData => {
            const categoryName = layerData.name;
            const color = layerData.settings.color || "#718096";
            
            // 各カテゴリ用のレイヤーグループ作成
            markerLayers[categoryName] = L.layerGroup().addTo(map);

            // 凡例の追加
            const item = document.createElement('div');
            item.className = 'legend-item';
            item.innerHTML = `<input type="checkbox" checked onchange="toggleLayer('${categoryName}', this.checked)"><span class="legend-dot" style="background:${color}"></span>${categoryName}`;
            legendItems.appendChild(item);

            // 地点（features）の追加
            layerData.features.forEach(feature => {
                const [lon, lat] = feature.geometry.coordinates;
                const name = feature.properties.name || "名称未設定";
                const description = feature.properties.description || "";

                const customIcon = L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div style="background-color:${color}; width:12px; height:12px; border:2px solid white; border-radius:50%; box-shadow:0 0 3px rgba(0,0,0,0.4);"></div>`,
                    iconSize: [12, 12],
                    iconAnchor: [6, 6]
                });

                // 【重要】Androidでのタップ吸い込み防止を追加
                L.marker([lat, lon], { 
                    icon: customIcon,
                    bubblingMouseEvents: false 
                })
                .bindPopup(createPopupContent(name, lat, lon, description, categoryName))
                .addTo(markerLayers[categoryName]);
            });
        });
        updateStats();
    } catch (e) {
        console.error('umap読み込み失敗', e);
        document.getElementById('stats-badge').innerText = 'データ読み込み失敗';
    }
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
