async function loadMichiNoEki() {
    const layerName = "道の駅";
    const color = "#a0aec0";

    try {
        const res = await fetch('P35-18_Roadside_Station.geojson');
        const data = await res.json();
        
        // プラグインを使わず、既存の layerGroups に直接追加
        const group = L.layerGroup().addTo(map);
        layerGroups[layerName] = group;

        data.features.forEach(f => {
            const c = f.geometry.coordinates;
            const name = f.properties.P35_006;
            const url = f.properties.P35_007;
            const desc = `公式サイト: <a href="${url}" target="_blank">${url}</a>`;
            
            const marker = L.circleMarker([c[1], c[0]], { 
                radius: 7, fillColor: color, color: "#fff", weight: 2, fillOpacity: 0.8 
            }).addTo(group);
            
            marker.bindPopup(createPopupContent(name, c[1], c[0], desc, layerName));
        });

        // 凡例追加処理はそのまま
        // ...（以下略）
    } catch (e) {
        console.error("エラー:", e);
    }
}
