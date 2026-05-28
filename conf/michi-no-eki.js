// conf/michi-no-eki.js

// 道の駅の読み込み処理
async function loadMichiNoEki() {
    const layerName = "道の駅";
    const color = "#a0aec0"; // 道の駅用カラー（必要に応じて変更してください）

    try {
        const res = await fetch('P35-18_Roadside_Station.geojson');
        const data = await res.json();
        const group = L.markerClusterGroup({ disableClusteringAtZoom: 10 }).addTo(map);
        layerGroups[layerName] = group;

        data.features.forEach(f => {
            const c = f.geometry.coordinates; // [lng, lat]
            const name = f.properties.P35_006 || "名称不明";
            const url = f.properties.P35_007 || "";
            const desc = `公式サイト: <a href="${url}" target="_blank">${url}</a>`;
            
            // 既存の createPopupContent を使用して統一感を出す
            const marker = L.circleMarker([c[1], c[0]], { 
                radius: 7, fillColor: color, color: "#fff", weight: 2, fillOpacity: 0.8 
            }).addTo(group);
            
            marker.bindPopup(createPopupContent(name, c[1], c[0], desc, layerName));
        });

        // 凡例に追加
        const legend = document.getElementById('legend-items');
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `<input type="checkbox" checked onchange="toggleLayer('${layerName}', this.checked)"><span style="background:${color}; width:10px; height:10px; border-radius:50%; display:inline-block; margin-right:6px;"></span><span>${layerName}</span>`;
        legend.appendChild(item);

    } catch (e) {
        console.error("道の駅データの読み込みに失敗しました:", e);
    }
}

// マップの初期化が終わるのを待って実行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadMichiNoEki);
} else {
    loadMichiNoEki();
}
