// conf/michi-no-eki.js

async function loadMichiNoEki() {
    const layerName = "道の駅";
    const color = "#a0aec0";

    try {
        const res = await fetch('P35-18_Roadside_Station.geojson');
        const data = await res.json();
        console.log("読み込んだデータ件数:", data.features.length); // ログ1
        
        const group = L.layerGroup().addTo(map);
        layerGroups[layerName] = group;

        data.features.forEach(f => {
            const c = f.geometry.coordinates;
            const name = f.properties.P35_006 || "名称不明";
            const url = f.properties.P35_007 || "";
            const desc = `<a href="${url}" target="_blank">公式HPへ</a>`;
            
            // ログ2: 座標が正しいか、マーカーが作られているか確認
            console.log("マーカー作成中:", name, c[1], c[0]); 
            
            const marker = L.circleMarker([c[1], c[0]], { 
                radius: 7, fillColor: color, color: "#fff", weight: 2, fillOpacity: 0.8 
            }).addTo(group);
            
            marker.bindPopup(createPopupContent(name, c[1], c[0], desc, layerName));
        });

    } catch (e) {
        console.error("道の駅データの読み込みに失敗しました:", e);
    }
}

// 実行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadMichiNoEki);
} else {
    loadMichiNoEki();
}
