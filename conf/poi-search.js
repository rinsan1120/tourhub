// OpenPOI APIの結果を将来永続保存する場合は、公式ライセンス要件に従い
// licensesとattributionsも保存し、再配布・加工公開時のライセンス条件を再確認すること。
(() => {
    'use strict';
    const SUGGEST_URL = 'https://api.openpoiapi.com/v1/suggest';
    const SEARCH_URL = 'https://api.openpoiapi.com/v1/search';
    const DEBOUNCE_MS = 300;
    const RESULT_LIMIT = 5;
    const SEARCH_FETCH_LIMIT = 15;
    const VOCABULARY_LIMIT_WITH_FACILITIES = 2;
    const REQUEST_TIMEOUT_MS = 10000;
    const VIEWPORT_BOTTOM_MARGIN_PX = 80;
    const MIN_PANEL_HEIGHT_PX = 100;
    const input = document.getElementById('poi-search-input');
    const searchButton = document.getElementById('poi-search-btn');
    const resultHeading = document.getElementById('poi-search-result-heading');
    const results = document.getElementById('poi-search-results');
    const status = document.getElementById('poi-search-status');
    const panel = document.getElementById('coord-jump-panel');
    const guide = document.getElementById('operation-guide');
    const wrapper = document.getElementById('map-wrapper');
    if (!input || !searchButton || !resultHeading || !results || !status || !panel || !guide || !wrapper) return;

    let debounceTimer = null;
    let controller = null;
    let generation = 0;
    let composing = false;
    let candidates = [];
    const guideAnchor = document.createComment('operation-guide original position');
    guide.before(guideAnchor);

    function cancelSearch() {
        generation++;
        clearTimeout(debounceTimer);
        if (controller) controller.abort();
        controller = null;
    }

    function clearResults() {
        candidates = [];
        results.replaceChildren();
        results.hidden = true;
        resultHeading.hidden = true;
        status.textContent = '';
    }

    function validPoint(lng, lat) {
        return typeof lng === 'number' && typeof lat === 'number' &&
            Number.isFinite(lng) && Number.isFinite(lat) &&
            lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
    }

    function validBounds(bbox) {
        return Array.isArray(bbox) && bbox.length === 4 &&
            validPoint(bbox[0], bbox[1]) && validPoint(bbox[2], bbox[3]) &&
            bbox[0] <= bbox[2] && bbox[1] <= bbox[3];
    }

    function closePanel() {
        cancelSearch();
        clearResults();
        input.blur(); // スマホのキーボードも閉じる。
        if (!panel.hidden) toggleCoordJumpPanel();
    }

    function selectCandidate(item) {
        if (item.type === 'category' || item.type === 'brand') {
            input.value = item.query;
            scheduleSearch(true, true);
            return;
        }
        if (item.type === 'place') {
            if (validBounds(item.bbox)) {
                const [minLng, minLat, maxLng, maxLat] = item.bbox;
                map.fitBounds([[minLat, minLng], [maxLat, maxLng]], { maxZoom: COORD_JUMP_ZOOM });
            } else if (Array.isArray(item.center) && validPoint(item.center[0], item.center[1])) {
                map.setView([item.center[1], item.center[0]], COORD_JUMP_ZOOM);
            } else return;
        } else {
            if (!validPoint(item.lng, item.lat)) return;
            map.setView([item.lat, item.lng], COORD_JUMP_ZOOM);
			placeTempPin({ lat: item.lat, lng: item.lng }, item.name);        
			}
        closePanel();
    }

    function renderCandidates(data, facilitiesOnly, mode) {
        const vocabulary = facilitiesOnly || mode === 'search' ? [] : (Array.isArray(data.vocabulary) ? data.vocabulary : []);
        const facilities = mode === 'search' ? data.results : data.suggestions;
        // suggestは語彙も含め5件、searchは有効な施設を15件まで。APIの順序を維持する。
        // searchの座標は数値文字列の場合もある。空文字・null等は地点として扱わない。
        const coordinateNumber = value => typeof value === 'number' ? value :
            typeof value === 'string' && value.trim() ? Number(value) : NaN;
        const validFacilities = facilities.filter(item => item && typeof item.name === 'string')
            .map(item => ({ ...item, lat: coordinateNumber(item.lat), lng: coordinateNumber(item.lng), type: 'facility' }))
            .filter(item => validPoint(item.lng, item.lat));
        const validVocabulary = vocabulary.filter(item => item && typeof item.label === 'string' && (
                (item.type === 'place' && (validBounds(item.bbox) ||
                    (Array.isArray(item.center) && validPoint(item.center[0], item.center[1])))) ||
                (['category', 'brand'].includes(item.type) && typeof item.query === 'string' && item.query.trim())
            ));
        const displayLimit = mode === 'search' ? SEARCH_FETCH_LIMIT : RESULT_LIMIT;
        candidates = [
            ...validVocabulary.slice(0, validFacilities.length ? VOCABULARY_LIMIT_WITH_FACILITIES : RESULT_LIMIT),
            ...validFacilities
        ].slice(0, displayLimit);
        results.replaceChildren();
        candidates.forEach(item => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'poi-search-candidate';
            const name = document.createElement('span');
            name.className = 'poi-search-name';
            name.textContent = item.type === 'facility' ? item.name : item.label;
            const type = document.createElement('span');
            type.className = 'poi-search-type';
            type.textContent = item.type === 'facility' ? '施設' : item.type === 'place' ? '地名' : '再検索';
            button.append(name, type);
            if (item.type === 'facility' && typeof item.address === 'string' && item.address) {
                const address = document.createElement('span');
                address.className = 'poi-search-address';
                address.textContent = item.address;
                button.append(address);
            }
            button.addEventListener('click', () => selectCandidate(item));
            results.append(button);
        });
        results.hidden = candidates.length === 0;
        resultHeading.hidden = mode !== 'search';
        status.textContent = candidates.length ? '' : mode === 'search' ? '検索結果が見つかりませんでした' : '候補が見つかりませんでした';
    }

    async function search(query, version, facilitiesOnly, mode = 'suggest') {
        if (version !== generation || panel.hidden) return;
        const requestController = new AbortController();
        controller = requestController;
        const timeout = setTimeout(() => requestController.abort(), REQUEST_TIMEOUT_MS);
        status.textContent = '検索中…';
        try {
            const url = new URL(mode === 'search' ? SEARCH_URL : SUGGEST_URL);
            const params = new URLSearchParams({
                q: query,
                limit: String(mode === 'search' ? SEARCH_FETCH_LIMIT : RESULT_LIMIT)
            });
            if (mode === 'suggest') params.set('fields', 'minimal');
            url.search = params.toString();
            const response = await fetch(url, { signal: requestController.signal, cache: 'no-store', credentials: 'omit' });
            if (!response.ok) throw new Error('OpenPOI request failed');
            const data = await response.json();
            if (version !== generation || panel.hidden) return;
            if (!data || !Array.isArray(mode === 'search' ? data.results : data.suggestions)) throw new Error('Invalid OpenPOI response');
            renderCandidates(data, facilitiesOnly, mode);
        } catch (error) {
            if (version !== generation || panel.hidden) return;
            clearResults();
            status.textContent = '場所を検索できませんでした';
        } finally {
            clearTimeout(timeout);
            if (controller === requestController) controller = null;
        }
    }

    function scheduleSearch(immediate = false, facilitiesOnly = false) {
        cancelSearch(); // debounce待機中にも旧リクエストを無効化する。
        clearResults();
        const query = input.value.trim();
        if (!query || composing || panel.hidden) return;
        const version = generation;
        if (immediate) search(query, version, facilitiesOnly);
        else debounceTimer = setTimeout(() => search(query, version, facilitiesOnly), DEBOUNCE_MS);
    }

    function submitSearch(event) {
        event.preventDefault();
        event.stopPropagation();
        if (composing || panel.hidden) return;
        cancelSearch();
        clearResults();
        const query = input.value.trim();
        if (query) search(query, generation, true, 'search');
    }

    searchButton.addEventListener('click', submitSearch);
    input.addEventListener('input', () => scheduleSearch());
    input.addEventListener('compositionstart', () => { composing = true; cancelSearch(); clearResults(); });
    input.addEventListener('compositionend', () => { composing = false; scheduleSearch(); });
    input.addEventListener('keydown', event => {
        if (event.isComposing || composing) return;
        if (event.key === 'Enter') {
            submitSearch(event);
        }
        if (event.key === 'ArrowDown' && candidates.length) {
            event.preventDefault();
            results.firstElementChild.focus();
        }
    });
    results.addEventListener('keydown', event => {
        if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
        event.preventDefault();
        const buttons = Array.from(results.children);
        const index = buttons.indexOf(document.activeElement);
        const next = index + (event.key === 'ArrowDown' ? 1 : -1);
        if (next < 0) input.focus();
        else buttons[Math.min(next, buttons.length - 1)].focus();
    });
    guide.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !panel.hidden) {
            event.preventDefault();
            event.stopPropagation();
            closePanel();
            document.getElementById('coord-jump-toggle').focus();
        }
    });

    function updatePanelHeight() {
        const viewport = window.visualViewport;
        const available = (viewport ? viewport.height + viewport.offsetTop : window.innerHeight) -
            panel.getBoundingClientRect().top - VIEWPORT_BOTTOM_MARGIN_PX;
        guide.style.setProperty('--poi-panel-max-height', `${Math.max(MIN_PANEL_HEIGHT_PX, available)}px`);
    }
    new MutationObserver(() => {
        if (panel.hidden) { cancelSearch(); clearResults(); }
        else updatePanelHeight();
    }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
    window.addEventListener('resize', updatePanelHeight);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updatePanelHeight);
        window.visualViewport.addEventListener('scroll', updatePanelHeight);
    }
    // 全画面要素の子へ同じガイドを移し、解除時は元のDOM位置へ戻す。
    document.addEventListener('fullscreenchange', () => {
        if (document.fullscreenElement === wrapper) wrapper.append(guide);
        else guideAnchor.after(guide);
        updatePanelHeight();
    });
    window.addEventListener('pagehide', () => { cancelSearch(); clearResults(); });
})();
