/* Page navigation and normal-screen panels. Map/GPS/fullscreen engines remain shared. */
(() => {
    const MOBILE_QUERY = '(max-width: 767px), (pointer: coarse) and (max-width: 1023px)';
    const SHEET_STATES = ['peek', 'half', 'full'];
    const SHEET_SWIPE_THRESHOLD_PX = 32;
    const mobile = window.matchMedia(MOBILE_QUERY);
    const wrapper = document.getElementById('map-wrapper');
    const panel = document.getElementById('map-panel');
    const handle = document.getElementById('sheet-handle');
    const place = document.getElementById('selected-place');
    const emptyPlace = place.innerHTML;
    const tabs = [...document.querySelectorAll('[data-panel]')];
    const layerPanel = document.querySelector('.hub-layer-panel');
    let resizeFrame = null;

    function resizeMap() {
        if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
            resizeFrame = null;
            if (!document.getElementById('screen-map').hidden && wrapper.clientWidth && wrapper.clientHeight) {
                map.invalidateSize({ animate: false, pan: true, debounceMoveend: true });
                document.dispatchEvent(new Event('mapfullscreenresize'));
            }
        });
    }
    new ResizeObserver(resizeMap).observe(wrapper);

    function setSheet(state) {
        panel.dataset.sheet = state;
        document.querySelector('.map-container').dataset.sheet = state;
        handle.setAttribute('aria-expanded', String(state !== 'peek'));
        handle.setAttribute('aria-label', state === 'full' ? '操作パネルを縮める' : '操作パネルを広げる');
        // A collapsed sheet must not retain keyboard focus in its clipped content.
        if (state === 'peek' && panel.querySelector('.hub-panel-body').contains(document.activeElement)) handle.focus();
        panel.querySelector('.hub-panel-body').inert = mobile.matches && state === 'peek';
        resizeMap();
    }
    function selectPanel(name, expand = true) {
        tabs.forEach(tab => {
            const selected = tab.dataset.panel === name;
            tab.setAttribute('aria-selected', String(selected));
            tab.tabIndex = selected ? 0 : -1;
            document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
        });
        if (mobile.matches && expand && panel.dataset.sheet === 'peek') setSheet('half');
    }
    tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => selectPanel(tab.dataset.panel));
        tab.addEventListener('keydown', event => {
            let next;
            if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
            if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
            if (event.key === 'Home') next = 0;
            if (event.key === 'End') next = tabs.length - 1;
            if (next === undefined) return;
            event.preventDefault(); tabs[next].focus(); selectPanel(tabs[next].dataset.panel);
        });
    });
    document.querySelectorAll('[data-screen]').forEach(button => {
        button.addEventListener('click', () => {
            const name = button.dataset.screen;
            document.querySelectorAll('.hub-screen').forEach(screen => { screen.hidden = screen.id !== `screen-${name}`; });
            document.querySelectorAll('.hub-navigation [data-screen]').forEach(link => {
                if (link.dataset.screen === name) link.setAttribute('aria-current', 'page');
                else link.removeAttribute('aria-current');
            });
            // The same Leaflet instance, layers and selected popup stay alive while hidden.
            window.scrollTo({ top: 0, behavior: 'instant' });
            if (name === 'map') resizeMap();
            else document.querySelector(`#screen-${name} .hub-screen-title`).focus({ preventScroll: true });
            if (name === 'weather' && document.querySelector('.weather-card-header').classList.contains('collapsed')) toggleWeather();
        });
    });

    handle.addEventListener('click', () => {
        if (handle.dataset.swiped) { delete handle.dataset.swiped; return; }
        setSheet(SHEET_STATES[(SHEET_STATES.indexOf(panel.dataset.sheet) + 1) % SHEET_STATES.length]);
    });
    let dragStart = null;
    handle.addEventListener('pointerdown', event => {
        if (!mobile.matches || !event.isPrimary) return;
        dragStart = event.clientY; handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointerup', event => {
        if (dragStart === null) return;
        const distance = dragStart - event.clientY; dragStart = null;
        if (Math.abs(distance) < SHEET_SWIPE_THRESHOLD_PX) return;
        const index = SHEET_STATES.indexOf(panel.dataset.sheet);
        setSheet(SHEET_STATES[Math.max(0, Math.min(SHEET_STATES.length - 1, index + (distance > 0 ? 1 : -1)))]);
        handle.dataset.swiped = 'true';
        setTimeout(() => { delete handle.dataset.swiped; }, 0);
    });
    handle.addEventListener('pointercancel', () => { dragStart = null; });
    handle.addEventListener('keydown', event => {
        if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const index = SHEET_STATES.indexOf(panel.dataset.sheet);
        setSheet(event.key === 'Home' ? 'peek' : event.key === 'End' ? 'full' : SHEET_STATES[Math.max(0, Math.min(SHEET_STATES.length - 1, index + (event.key === 'ArrowUp' ? 1 : -1)))]);
    });
    mobile.addEventListener('change', () => setSheet(panel.dataset.sheet));
    setSheet('peek');

    // Leaflet's contentupdate precedes auto-pan. Normal panels need no map movement;
    // fullscreen retains Leaflet's original popup auto-pan and description controls.
    let selectedPopup = null;
    let selectedContent = null;
    L.Popup.addInitHook(function () {
        this.on('contentupdate', () => {
            this.options.autoPan = isMapFullscreen();
            attachCopyCoordsHandler({ popup: this });
            if (this.isOpen() && (this !== selectedPopup || this.getContent() !== selectedContent)) showPlace(this);
        });
    });
    function showPlace(popup) {
        const content = popup.getElement()?.querySelector('.spot-popup');
        if (!content) return;
        selectedPopup = popup;
        selectedContent = popup.getContent();
        const copy = content.cloneNode(true);
        copy.querySelectorAll('[data-copy-handler-attached]').forEach(button => { delete button.dataset.copyHandlerAttached; });
        const description = copy.querySelector('.popup-description-trigger');
        if (description) {
            const body = document.createElement('div');
            body.className = 'hub-place-description';
            const text = description.dataset.description;
            if (/<(?:a\s|br\s*\/?[>])/i.test(text)) {
                const parsed = new DOMParser().parseFromString(text, 'text/html');
                function appendText(node, target) {
                    if (node.nodeType === Node.TEXT_NODE) { target.append(node.textContent); return; }
                    if (node.nodeName === 'BR') { target.append(document.createElement('br')); return; }
                    if (node.nodeName === 'A' && /^https?:\/\//i.test(node.getAttribute('href') || '')) {
                        const link = document.createElement('a');
                        link.href = node.getAttribute('href'); link.target = '_blank'; link.rel = 'noopener noreferrer';
                        link.textContent = node.textContent; target.append(link); return;
                    }
                    node.childNodes.forEach(child => appendText(child, target));
                }
                parsed.body.childNodes.forEach(node => appendText(node, body));
            } else body.textContent = text;
            copy.append(body); description.remove();
        }
        place.replaceChildren(copy);
        // Reuse the existing clipboard behavior and exact coordinate values.
        attachCopyCoordsHandler({ popup: { getElement: () => place } });
        if (!isMapFullscreen()) selectPanel('place');
    }
    map.on('popupopen', event => showPlace(event.popup));
    map.on('popupclose', () => { selectedPopup = null; selectedContent = null; place.innerHTML = emptyPlace; });
    function syncFullscreen() {
        const fullscreen = isMapFullscreen();
        document.body.classList.toggle('hub-map-fullscreen', fullscreen);
        wrapper.classList.toggle('hub-normal-map', !fullscreen);
        if (fullscreen) closeMapDescription();
        resizeMap();
        // Refresh the existing popup after the fullscreen viewport has resized.
        // This restores its usual auto-pan, including a popup opened in the side panel.
        requestAnimationFrame(() => { if (selectedPopup?.isOpen()) selectedPopup.update(); });
    }
    document.addEventListener('mapfullscreenchange', syncFullscreen);
    syncFullscreen();
    L.DomEvent.disableClickPropagation(layerPanel);
    L.DomEvent.disableScrollPropagation(layerPanel);

    document.getElementById('map-weather-form').addEventListener('submit', event => {
        event.preventDefault();
        const input = document.getElementById('weather-input');
        input.value = document.getElementById('map-weather-input').value;
        searchWeather();
    });
    document.getElementById('weather-input').addEventListener('keydown', event => {
        if (event.key === 'Enter') searchWeather();
    });
    const weatherHeading = document.querySelector('.weather-card-header');
    weatherHeading.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleWeather(); }
    });
    new MutationObserver(() => weatherHeading.setAttribute('aria-expanded', String(!weatherHeading.classList.contains('collapsed'))))
        .observe(weatherHeading, { attributes: true, attributeFilter: ['class'] });

})();
