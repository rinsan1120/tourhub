let weatherData = {};
let loadedRegions = new Set();

// コメント「//」を削除してトリミングする汎用関数
function cleanLine(line) {
    return line.split('//')[0].trim();
}

function getWeatherIcon(code) {
    if (code === 0) return 'fa-sun'; 
    if (code <= 3) return 'fa-cloud-sun'; 
    if (code <= 67) return 'fa-cloud-rain'; 
    return 'fa-cloud';
}

function toggleWeather() {
    const h = document.querySelector('.weather-card-header'), c = document.querySelector('.weather-collapsible-content');
    h.classList.toggle('collapsed');
    // 開くときは maxHeight を一旦十分に大きくし、少し遅れて none にすることで制限をなくす
    if (h.classList.contains('collapsed')) {
        c.style.maxHeight = "0px";
    } else {
        c.style.maxHeight = "2000px"; // 十分な高さ
        setTimeout(() => { if(!h.classList.contains('collapsed')) c.style.maxHeight = "none"; }, 300);
    }
}

async function loadWeatherConfig() {
    try {
        const res = await fetch('./conf/weather.txt?t=' + Date.now()), text = await res.text();
        let currentRegion = "";
        text.split('\n').forEach(rawLine => {
            const line = cleanLine(rawLine);
            if(!line) return;
            if(line.startsWith('※')) {
                currentRegion = line.substring(1); weatherData[currentRegion] = [];
            } else if(line.includes(',') && currentRegion) {
                const [n, lat, lon, pref] = line.split(',');
                weatherData[currentRegion].push({ name: n.trim(), lat: parseFloat(lat), lon: parseFloat(lon), pref: pref.trim() });
            }
        });
        initWeatherDisplay();
    } catch (e) { document.getElementById('weather-panels-container').innerText = 'weather.txt 読込失敗'; }
}

async function fetchWeatherForRegion(region, rIdx) {
    if (loadedRegions.has(region)) return;
    const cities = weatherData[region];
    const lats = cities.map(c => c.lat).join(','), lons = cities.map(c => c.lon).join(',');
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTokyo`);
        const data = await res.json(), fArr = Array.isArray(data) ? data : [data];
        cities.forEach((loc, cIdx) => {
            const d = fArr[cIdx].daily;
            for(let i=0; i<3; i++) {
                const el = document.getElementById(`w-${rIdx}-${cIdx}-${i}`);
                if(el) el.innerHTML = `<i class="fa-solid ${getWeatherIcon(d.weather_code[i])}" style="font-size:1.1rem; display:block;"></i><span style="color:#3182ce; font-weight:bold;">${d.precipitation_probability_max[i]}%</span><div style="font-size:0.6rem;">${Math.round(d.temperature_2m_min[i])}/${Math.round(d.temperature_2m_max[i])}</div>`;
            }
        });
        loadedRegions.add(region);
    } catch (e) { console.error(e); }
}

function initWeatherDisplay() {
    const days = ["日","月","火","水","木","金","土"];
    let hHtml = `<div class="header-cell">エリア名</div>`;
    for(let i=0; i<3; i++) {
        const d = new Date(); d.setDate(d.getDate() + i);
        hHtml += `<div class="header-cell ${d.getDay()===0?'sun':(d.getDay()===6?'sat':'')}">${d.getMonth()+1}/${d.getDate()}(${days[d.getDay()]})</div>`;
    }
    document.getElementById('weather-header-row').innerHTML = hHtml;

    // パネルコンテナの取得と警告メッセージの挿入
    const panelsContainer = document.getElementById('weather-panels-container');
    if (!document.getElementById('weather-warning')) {
        const warningNote = document.createElement('div');
        warningNote.id = 'weather-warning';
        warningNote.style = "padding: 8px; font-size: 0.75rem; color: #e53e3e; background: #fff5f5; border-bottom: 1px solid #fed7d7; text-align: center;";
        warningNote.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> 海外データにつき精度が不安定です。出発前は必ず地点名から詳細予報を再確認してください。`;
        panelsContainer.before(warningNote);
    }

    const regions = Object.keys(weatherData);
    regions.forEach((region, rIdx) => {
        const tab = document.createElement('button');
        tab.className = `weather-tab ${rIdx === 0 ? 'active' : ''}`; tab.innerText = region;
        tab.onclick = (e) => {
            e.stopPropagation(); 
            document.querySelectorAll('.weather-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.weather-content-panel').forEach(p => p.style.display = 'none');
            tab.classList.add('active'); 
            document.getElementById(`panel-${rIdx}`).style.display = 'block';
            fetchWeatherForRegion(region, rIdx);
            const c = document.querySelector('.weather-collapsible-content'); 
            if(!document.querySelector('.weather-card-header').classList.contains('collapsed')) c.style.maxHeight = c.scrollHeight + "px";
        };
        document.getElementById('weather-tabs-container').appendChild(tab);

        const panel = document.createElement('div'); 
        panel.id = `panel-${rIdx}`; 
        panel.className = 'weather-content-panel'; 
        panel.style.display = rIdx === 0 ? 'block' : 'none';
        
        weatherData[region].forEach((loc, cIdx) => {
            const row = document.createElement('div'); row.className = 'weather-row';
            
            // 地点名を tenki.jp への検索リンクにする 
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(loc.name + ' 天気')}`;
            const nameHtml = `
                <span class="city-name">
                    <a href="${searchUrl}" target="_blank" style="text-decoration: none; color: #1a202c; border-bottom: 1px dashed #cbd5e1;">
                        ${loc.name} <i class="fa-solid fa-up-right-from-square" style="font-size: 0.6rem; color: #94a3b8;"></i>
                    </a>
                    <span class="pref-name">(${loc.pref})</span>
                </span>`;
            
            // 取得中のアニメーション表示
            row.innerHTML = nameHtml + [0,1,2].map(i => `<div class="forecast-unit" id="w-${rIdx}-${cIdx}-${i}"><i class="fa-solid fa-spinner fa-spin" style="font-size:0.8rem; color:#cbd5e1;"></i><div style="font-size:0.5rem; color:#94a3b8;">取得中...</div></div>`).join('');
            panel.appendChild(row);
        });
        panelsContainer.appendChild(panel);
        
        if (rIdx === 0) fetchWeatherForRegion(region, rIdx);
    });
}

async function refreshCurrentTabWeather() {
    const active = document.querySelector('.weather-tab.active'); if(!active) return;
    const region = active.innerText, rIdx = Array.from(document.querySelectorAll('.weather-tab')).indexOf(active);
    const btn = document.getElementById('refresh-weather-btn'); btn.disabled = true; btn.style.opacity = '0.5';
    loadedRegions.delete(region);
    await fetchWeatherForRegion(region, rIdx);
    setTimeout(() => { btn.disabled = false; btn.style.opacity = '1'; }, 60000);
}

function searchWeather() { 
    const v = document.getElementById('weather-input').value; 
    // 入力された文字に「 天気」を足してGoogleで検索
    if(v) window.open(`https://www.google.com/search?q=${encodeURIComponent(v + ' 天気')}`, '_blank'); 
}
