async function loadMichiNoEki() {
    const layerName = "道の駅";
    const color = "#8c6450";
    const loadingTaskId = "michi-no-eki";
    startMapLoadingTask(loadingTaskId);

    try {
        const res = await fetch('P35-18_Roadside_Station.geojson');
        const data = await res.json();
        
        // MarkerClusterGroupを作成して変数に格納
        const group = L.markerClusterGroup({ 
            disableClusteringAtZoom: 10,
            iconCreateFunction: function(cluster) {
                return L.divIcon({ 
                    // 道の駅の色 #8c6450 を使用
                    html: `<div style="background-color:#8c6450; color:white; border-radius:50%; width:30px; height:30px; line-height:30px; text-align:center; opacity:0.9; font-size:12px;">${cluster.getChildCount()}</div>`,
                    className: 'marker-cluster-custom',
                    iconSize: L.point(30, 30)
                });
            }
        });
        group.addTo(map);
        layerGroups[layerName] = group;

        updateMapLoadingTask(loadingTaskId, 0, data.features.length);
        registerMapFeatureSource({
            id: "michi-no-eki",
            name: layerName,
            priority: MAP_LAYER_PRIORITY_DEFAULT,
            features: data.features,
            createFeature(f) {
                const c = f.geometry.coordinates;
                const name = f.properties.P35_006 || "名称不明";
                const url = f.properties.P35_007 || "";
                const desc = `<a href="${url}" target="_blank">公式HPへ</a>`;

                const marker = L.circleMarker([c[1], c[0]], {
                    radius: 9, fillColor: color, color: "#fff", weight: 2, fillOpacity: 0.9
                });

                marker.bindPopup(createPopupContent(name, c[1], c[0], desc, layerName));
                group.addLayer(marker);
            }
        });
        updateMapLoadingTask(loadingTaskId, data.features.length, data.features.length);

        const legend = document.getElementById('legend-items');
        
        // IDで重複チェックを行う
        if (!document.getElementById('legend-item-' + layerName)) {
            const item = document.createElement('div');
            item.className = 'legend-item';
            item.id = 'legend-item-' + layerName; // 一意なIDを付与
            item.innerHTML = `<input type="checkbox" checked onchange="toggleLayer('${layerName}', this.checked)"><span style="background:${color}; width:10px; height:10px; border-radius:50%; display:inline-block; margin-right:6px;"></span><span>${layerName}</span>`;
            legend.appendChild(item);
        }

        finishMapLoadingTask(loadingTaskId);
        requestMapViewportGeneration(true);
    } catch (e) {
        console.error("道の駅データの読み込みに失敗しました:", e);
        finishMapLoadingTask(loadingTaskId, true);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadMichiNoEki);
} else {
    loadMichiNoEki();
}
