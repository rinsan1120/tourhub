/* Page navigation and normal-screen panels. Map/GPS/fullscreen engines remain shared. */
(() => {
    const MOBILE_QUERY = '(max-width: 767px), (pointer: coarse) and (max-width: 1023px)';
    const SHEET_STATES = ['peek', 'full'];
    const DRAG_THRESHOLD_PX = 8;
    const SNAP_DURATION_MS = 220;
    const VELOCITY_PROJECTION_MS = 180;
    const sheetContainer = document.querySelector('.map-container');
    const sheetBody = document.querySelector('.hub-panel-body');
    let drag = null, animation = null, suppressClickUntil = 0;
    function stops() {
        const height = sheetContainer.clientHeight;
        return [88, Math.max(88, height * .72)];
    }
    function paintHeight(height) {
        sheetContainer.style.setProperty('--sheet-height', `${height}px`);
    }
    function cancelAnimation() {
        if (animation !== null) cancelAnimationFrame(animation);
        animation = null;
    }
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

    function setSheet(state, smooth = false) {
        cancelAnimation();
        const startHeight = panel.getBoundingClientRect().height;
        const target = stops()[SHEET_STATES.indexOf(state)];
        panel.dataset.sheet = state;
        document.querySelector('.map-container').dataset.sheet = state;
        handle.setAttribute('aria-expanded', String(state !== 'peek'));
        handle.setAttribute('aria-label', state === 'full' ? '操作パネルを縮める' : '操作パネルを広げる');
        // A collapsed sheet must not retain keyboard focus in its clipped content.
        if (state === 'peek' && panel.querySelector('.hub-panel-body').contains(document.activeElement)) handle.focus();
        panel.querySelector('.hub-panel-body').inert = mobile.matches && state === 'peek';
        if (mobile.matches && smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
            const started = performance.now();
            function step(now) {
                const progress = Math.min(1, (now - started) / SNAP_DURATION_MS);
                paintHeight(startHeight + (target - startHeight) * (1 - (1 - progress) ** 3));
                if (progress < 1) animation = requestAnimationFrame(step);
                else { animation = null; sheetContainer.style.removeProperty('--sheet-height'); }
            }
            animation = requestAnimationFrame(step);
        } else sheetContainer.style.removeProperty('--sheet-height');
        resizeMap();
    }
    function selectPanel(name, expand = true) {
        tabs.forEach(tab => {
            const selected = tab.dataset.panel === name;
            tab.setAttribute('aria-selected', String(selected));
            tab.tabIndex = selected ? 0 : -1;
            document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
        });
        if (mobile.matches && expand && panel.dataset.sheet === 'peek') setSheet('full', true);
    }
    tabs.forEach(tab => {
        tab.addEventListener('click', () => selectPanel(tab.dataset.panel));
        tab.addEventListener('keydown', event => {
            const availableTabs = mobile.matches ? tabs.filter(item => item.dataset.panel !== 'place') : tabs;
            const current = availableTabs.indexOf(tab);
            let next;
            if (event.key === 'ArrowRight') next = (current + 1) % availableTabs.length;
            if (event.key === 'ArrowLeft') next = (current + availableTabs.length - 1) % availableTabs.length;
            if (event.key === 'Home') next = 0;
            if (event.key === 'End') next = availableTabs.length - 1;
            if (next === undefined) return;
            event.preventDefault(); availableTabs[next].focus(); selectPanel(availableTabs[next].dataset.panel);
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
            document.dispatchEvent(new Event('hubscreenchange'));
            if (name === 'weather' && document.querySelector('.weather-card-header').classList.contains('collapsed')) toggleWeather();
        });
    });

    if (location.hash === '#radio') document.querySelector('.hub-navigation [data-screen=radio]').click();

    handle.addEventListener('click', event => {
        if (performance.now() < suppressClickUntil) { event.preventDefault(); return; }
        setSheet(SHEET_STATES[(SHEET_STATES.indexOf(panel.dataset.sheet) + 1) % SHEET_STATES.length], true);
    });
    function beginDrag(y) {
        if (!mobile.matches || isMapFullscreen()) return;
        suppressClickUntil = 0;
        cancelAnimation();
        drag = { y, lastY:y, time:performance.now(), height:panel.getBoundingClientRect().height, velocity:0, active:false };
    }
    function moveDrag(y, event) {
        if (!drag) return;
        const delta = drag.y - y;
        if (!drag.active) {
            if (Math.abs(delta) < DRAG_THRESHOLD_PX) return;
            drag.active = true;
            sheetBody.inert = false;
            panel.classList.add('is-dragging');
        }
        if (event.cancelable) event.preventDefault();
        const now = performance.now();
        drag.velocity = (drag.lastY - y) / Math.max(1, now - drag.time);
        drag.lastY = y; drag.time = now;
        const heights = stops();
        paintHeight(Math.max(heights[0], Math.min(heights[1], drag.height + delta)));
    }
    function endDrag(cancelled = false) {
        if (!drag) return;
        const previous = drag; drag = null;
        panel.classList.remove('is-dragging');
        if (!previous.active) return;
        suppressClickUntil = performance.now() + 400;
        const velocity = performance.now() - previous.time < 100 && !cancelled ? previous.velocity : 0;
        const projected = panel.getBoundingClientRect().height + velocity * VELOCITY_PROJECTION_MS;
        const heights = stops();
        const closest = heights.reduce((best, height, index) => Math.abs(height - projected) < Math.abs(heights[best] - projected) ? index : best, 0);
        setSheet(SHEET_STATES[closest], true);
    }
    handle.addEventListener('pointerdown', event => {
        if (event.pointerType === 'touch' || !event.isPrimary || event.button !== 0) return;
        beginDrag(event.clientY); handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', event => { if (event.pointerType !== 'touch') moveDrag(event.clientY, event); });
    handle.addEventListener('pointerup', event => { if (event.pointerType !== 'touch') endDrag(); });
    handle.addEventListener('pointercancel', () => endDrag(true));
    [handle].forEach(surface => {
        surface.addEventListener('touchstart', event => {
            if (event.touches.length !== 1) { endDrag(true); return; }
            beginDrag(event.touches[0].clientY);
        }, { passive:true });
        surface.addEventListener('touchmove', event => {
            if (event.touches.length !== 1) { endDrag(true); return; }
            moveDrag(event.touches[0].clientY, event);
        }, { passive:false });
        surface.addEventListener('touchend', () => endDrag());
        surface.addEventListener('touchcancel', () => endDrag(true));
    });
    window.addEventListener('resize', () => { endDrag(true); setSheet(panel.dataset.sheet); });
    document.addEventListener('mapfullscreenchange', () => { endDrag(true); cancelAnimation(); sheetContainer.style.removeProperty('--sheet-height'); });
    handle.addEventListener('keydown', event => {
        if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const index = SHEET_STATES.indexOf(panel.dataset.sheet);
        setSheet(event.key === 'Home' ? 'peek' : event.key === 'End' ? 'full' : SHEET_STATES[Math.max(0, Math.min(SHEET_STATES.length - 1, index + (event.key === 'ArrowUp' ? 1 : -1)))]);
    });
    mobile.addEventListener('change', () => {
        setSheet(panel.dataset.sheet);
        if (mobile.matches && document.getElementById('tab-place').getAttribute('aria-selected') === 'true') selectPanel('nearby', false);
    });
    setSheet('peek');
    if (mobile.matches) selectPanel('nearby', false);

    // Leaflet's contentupdate precedes auto-pan. Mobile and fullscreen popups use auto-pan.
    let selectedPopup = null;
    let selectedContent = null;
    L.Popup.addInitHook(function () {
        this.on('contentupdate', () => {
            this.options.autoPan = isMapFullscreen() || mobile.matches;
            attachCopyCoordsHandler({ popup: this });
            if (!mobile.matches && this.isOpen() && (this !== selectedPopup || this.getContent() !== selectedContent)) showPlace(this);
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
    map.on('popupopen', event => { if (!mobile.matches) showPlace(event.popup); });
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
    layerPanel.querySelector('.hub-layer-close').addEventListener('click', () => { layerPanel.open = false; layerPanel.querySelector('summary').focus(); });
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
