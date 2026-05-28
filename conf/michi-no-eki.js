// conf/michi-no-eki.js

document.addEventListener('DOMContentLoaded', function() {
    
    // マーカークラスタグループの作成
    var stationMarkers = L.markerClusterGroup({
        disableClusteringAtZoom: 10
    });

    // GeoJSONを読み込んでマーカーを追加
    // ※htmlから見てgeojsonがどこにあるかパスを指定してください
    fetch('P35-18_Roadside_Station.geojson')
        .then(response => response.json())
        .then(data => {
            var geojsonLayer = L.geoJSON(data.features, {
                onEachFeature: function (feature, layer) {
                    var name = feature.properties.P35_006;
                    var url = feature.properties.P35_007;
                    var lat = feature.geometry.coordinates[1];
                    var lng = feature.geometry.coordinates[0];
                    
                    var popupContent = `
                        <h3>道の駅：${name}</h3>
                        <a href="${url}" target="_blank">公式サイト</a><br>
                        <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}" target="_blank">Googleマップで検索</a>
                    `;
                    layer.bindPopup(popupContent);
                }
            });
            
            stationMarkers.addLayer(geojsonLayer);
            map.addLayer(stationMarkers); // map-engine.jsで定義された map オブジェクトを使用
        })
        .catch(error => console.error('道の駅データの読み込みに失敗しました:', error));
});
