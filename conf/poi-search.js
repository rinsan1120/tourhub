// OpenPOI APIの結果を将来永続保存する場合は、公式ライセンス要件に従い
// licensesとattributionsも保存し、再配布・加工公開時のライセンス条件を再確認すること。
(() => {
    'use strict';
    const SUGGEST_URL = 'https://api.openpoiapi.com/v1/suggest';
    const DEBOUNCE_MS = 300;
    const RESULT_LIMIT = 5;
    const VOCABULARY_LIMIT_WITH_FACILITIES = 2;
    const REQUEST_TIMEOUT_MS = 10000;
    const VIEWPORT_BOTTOM_MARGIN_PX = 80;
    const MIN_PANEL_HEIGHT_PX = 100;
    const input = document.getElementById('poi-search-input');
    const results = document.getElementById('poi-search-results');
    const status = document.getElementById('poi-search-status');
    const panel = document.getElementById('coord-jump-panel');
    const guide = document.getElementById('operation-guide');
    const wrapper = document.getElementById('map-wrapper');
    if (!input || !results || !status || !panel || !guide || !wrapper) return;

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
            placeTempPin({ lat: item.lat, lng: item.lng });
        }
        closePanel();
    }

    function renderCandidates(data, facilitiesOnly) {
        const vocabulary = facilitiesOnly ? [] : (Array.isArray(data.vocabulary) ? data.vocabulary : []);
        const facilities = Array.isArray(data.suggestions) ? data.suggestions : [];
        // 地名・再検索候補も5件の枠内に含め、施設はAPIの順序を維持する。
        const validFacilities = facilities.filter(item => item && typeof item.name === 'string' && validPoint(item.lng, item.lat))
            .map(item => ({ ...item, type: 'facility' }));
        const validVocabulary = vocabulary.filter(item => item && typeof item.label === 'string' && (
                (item.type === 'place' && (validBounds(item.bbox) ||
                    (Array.isArray(item.center) && validPoint(item.center[0], item.center[1])))) ||
                (['category', 'brand'].includes(item.type) && typeof item.query === 'string' && item.query.trim())
            ));
        candidates = [
            ...validVocabulary.slice(0, validFacilities.length ? VOCABULARY_LIMIT_WITH_FACILITIES : RESULT_LIMIT),
            ...validFacilities
        ].slice(0, RESULT_LIMIT);
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
        status.textContent = candidates.length ? '' : '候補が見つかりませんでした';
    }

    async function search(query, version, facilitiesOnly) {
        if (version !== generation || panel.hidden) return;
        const requestController = new AbortController();
        controller = requestController;
        const timeout = setTimeout(() => requestController.abort(), REQUEST_TIMEOUT_MS);
        status.textContent = '検索中…';
        try {
            const bounds = map.getBounds();
            const center = map.getCenter();
            const url = new URL(SUGGEST_URL);
            url.search = new URLSearchParams({
                q: query,
                bbox: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(','),
                center: [center.lng, center.lat].join(','),
                limit: String(RESULT_LIMIT),
                fields: 'minimal'
            }).toString();
            const response = await fetch(url, { signal: requestController.signal, cache: 'no-store', credentials: 'omit' });
            if (!response.ok) throw new Error('OpenPOI request failed');
            const data = await response.json();
            if (version !== generation || panel.hidden) return;
            if (!data || !Array.isArray(data.suggestions)) throw new Error('Invalid OpenPOI response');
            renderCandidates(data, facilitiesOnly);
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

    input.addEventListener('input', () => scheduleSearch());
    input.addEventListener('compositionstart', () => { composing = true; cancelSearch(); clearResults(); });
    input.addEventListener('compositionend', () => { composing = false; scheduleSearch(); });
    input.addEventListener('keydown', event => {
        if (event.isComposing || composing) return;
        if (event.key === 'Enter') {
            event.preventDefault();
            if (candidates.length) selectCandidate(candidates[0]);
            else scheduleSearch(true);
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
