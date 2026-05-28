// conf/michi-no-eki.js

async function loadMichiNoEki() {
    const layerName = "道の駅";
    const color = "#a0aec0";

    try {
        const res = await fetch('P35-18_Roadside_Station.geojson');
        const data = await res.json();
        
        // MarkerClusterGroupを使用
        const group = L.markerClusterGroup({
            disableClusteringAtZoom: 10
        }).addTo(map);
        
        layerGroups[layerName] = group;

        data.features.forEach(f => {
            const c = f.geometry.coordinates;
            const name = f.properties.P35_006 || "名称不明";
            const url = f.properties.P35_007 || "";
            const desc = `<a href="${url}" target="_blank">公式HPへ</a>`;
            
            const marker = L.circleMarker([c[1], c[0]], { 
                radius: 7, fillColor: color, color: "#fff", weight: 2, fillOpacity: 0.8 
            });
            
            marker.bindPopup(createPopupContent(name, c[1], c[0], desc, layerName));
            
            // クラスタグループに追加
            group.addLayer(marker);
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

// ページ読み込み時に実行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadMichiNoEki);
} else {
    loadMichiNoEki();
}
