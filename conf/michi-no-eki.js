async function loadMichiNoEki() {
    const layerName = "道の駅";
    const color = "#8c6450";

    try {
        const res = await fetch('P35-18_Roadside_Station.geojson');
        const data = await res.json();
        
        // MarkerClusterGroupを作成して変数に格納
        const group = L.markerClusterGroup({ disableClusteringAtZoom: 10 });
        // addTo(map) を呼び出すのは、グループ作成の直後ではなく、マーカー追加の後でもOKですが、先に呼び出す場合は変数に入れる
        group.addTo(map); 
        layerGroups[layerName] = group;

        data.features.forEach(f => {
            const c = f.geometry.coordinates;
            const name = f.properties.P35_006 || "名称不明";
            const url = f.properties.P35_007 || "";
            const desc = `<a href="${url}" target="_blank">公式HPへ</a>`;
            
            const marker = L.circleMarker([c[1], c[0]], { 
                radius: 9, fillColor: color, color: "#fff", weight: 2, fillOpacity: 0.9 
            });
            
            marker.bindPopup(createPopupContent(name, c[1], c[0], desc, layerName));
            group.addLayer(marker); // ここでaddLayerを使用
        });

        const legend = document.getElementById('legend-items');
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `<input type="checkbox" checked onchange="toggleLayer('${layerName}', this.checked)"><span style="background:${color}; width:10px; height:10px; border-radius:50%; display:inline-block; margin-right:6px;"></span><span>${layerName}</span>`;
        legend.appendChild(item);

    } catch (e) {
        console.error("道の駅データの読み込みに失敗しました:", e);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadMichiNoEki);
} else {
    loadMichiNoEki();
}
