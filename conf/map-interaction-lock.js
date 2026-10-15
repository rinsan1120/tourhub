// 入力だけを制限する。全画面・GPS・雨雲・Wake Lockの状態は変更しない。
(() => {
    const wrapper = document.getElementById('map-wrapper');
    const startButton = document.getElementById('map-lock-btn');
    const overlay = document.getElementById('map-lock-overlay');
    const unlockButton = document.getElementById('map-unlock-btn');
    const progress = document.getElementById('map-unlock-progress');
    const status = document.getElementById('map-lock-status');
    const UNLOCK_WINDOW_MS = 3000;
    const TAP_MOVE_LIMIT_PX = 10;
    const TAP_DURATION_LIMIT_MS = 600;
    const COMPATIBILITY_CLICK_MS = 700;
    const UNLOCK_TAP_COUNT = 3;
    const pointerEvents = typeof window.PointerEvent === 'function';
    const pointerIds = new Set();
    const inertSnapshots = new Map();
    const handlerSnapshots = new Map();
    let locked = false;
    let count = 0;
    let firstTapAt = 0;
    let timer = null;
    let candidate = null;
    let lastDirectInputAt = -Infinity;
    let lastTouchAt = -Infinity;
    let suppressClickUntil = 0;
    let previousFocus = null;

    function renderProgress() {
        progress.textContent = '●'.repeat(count) + '○'.repeat(UNLOCK_TAP_COUNT - count);
        unlockButton.setAttribute('aria-label', `操作ロック解除、3秒以内に3回。現在${count}回`);
        status.textContent = locked ? `操作ロック中。解除は3秒以内に3回。現在${count}回。` : '操作ロックを解除しました。';
    }

    function resetProgress() {
        clearTimeout(timer);
        timer = null;
        count = 0;
        firstTapAt = 0;
        renderProgress();
    }

    function protectChildren() {
        for (const child of wrapper.children) {
            if (child === overlay || child === status || inertSnapshots.has(child)) continue;
            inertSnapshots.set(child, child.getAttribute('inert'));
            child.setAttribute('inert', '');
        }
    }

    function setLocked(value, restoreFocus = true) {
        if (value === locked || (value && !isMobileFullscreenMapUI())) return;
        locked = value;
        candidate = null;
        pointerIds.clear();
        resetProgress();
        if (locked) {
            lastDirectInputAt = -Infinity;
            lastTouchAt = -Infinity;
            previousFocus = document.activeElement;
            cancelMapGestureForInteractionLock();
            // プログラムによるsetView/panTo等は継続し、ユーザー用ハンドラだけ保存・停止する。
            for (const name of ['dragging', 'touchZoom', 'doubleClickZoom', 'scrollWheelZoom', 'boxZoom', 'keyboard', 'tapHold']) {
                const handler = map[name];
                if (!handler) continue;
                handlerSnapshots.set(handler, handler.enabled());
                handler.disable();
            }
            overlay.hidden = false;
            protectChildren();
            wrapper.classList.add('is-interaction-locked');
            startButton.setAttribute('aria-pressed', 'true');
            unlockButton.focus({ preventScroll: true });
        } else {
            wrapper.classList.remove('is-interaction-locked');
            overlay.hidden = true;
            for (const [child, saved] of inertSnapshots) {
                if (saved === null) child.removeAttribute('inert');
                else child.setAttribute('inert', saved);
            }
            inertSnapshots.clear();
            for (const [handler, enabled] of handlerSnapshots) {
                if (enabled) handler.enable();
            }
            handlerSnapshots.clear();
            startButton.setAttribute('aria-pressed', 'false');
            if (restoreFocus && isMobileFullscreenMapUI() && previousFocus instanceof HTMLElement &&
                previousFocus.isConnected && !previousFocus.closest('[inert]')) {
                previousFocus.focus({ preventScroll: true });
            }
            previousFocus = null;
        }
    }

    function registerTap() {
        const now = performance.now();
        if (count && now - firstTapAt > UNLOCK_WINDOW_MS) resetProgress();
        if (count === 0) {
            firstTapAt = now;
            timer = setTimeout(resetProgress, UNLOCK_WINDOW_MS);
        }
        count++;
        if (count === UNLOCK_TAP_COUNT) setLocked(false);
        else renderProgress();
    }

    function onUnlock(target) { return target instanceof Node && unlockButton.contains(target); }
    function insideUnlock(x, y) {
        const rect = unlockButton.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }
    function beginTap(id, x, y, target) {
        lastDirectInputAt = performance.now();
        if (onUnlock(target)) candidate = { id, x, y, at: lastDirectInputAt };
        else { candidate = null; resetProgress(); }
    }
    function moveTap(id, x, y) {
        if (candidate && candidate.id === id && Math.hypot(x - candidate.x, y - candidate.y) > TAP_MOVE_LIMIT_PX) {
            candidate = null;
            resetProgress();
        }
    }
    function finishTap(id, x, y) {
        lastDirectInputAt = performance.now();
        const tap = candidate;
        candidate = null;
        if (tap && tap.id === id && insideUnlock(x, y) &&
            Math.hypot(x - tap.x, y - tap.y) <= TAP_MOVE_LIMIT_PX &&
            lastDirectInputAt - tap.at <= TAP_DURATION_LIMIT_MS) registerTap();
        else resetProgress();
        // 3回目のpointerup/touchend後に生成されるclickを地図へ通さない。
        suppressClickUntil = performance.now() + COMPATIBILITY_CLICK_MS;
    }

    function inputGate(event) {
        const type = event.type;
        if (!locked) {
            if (type === 'pointerdown' || type === 'touchstart' || type === 'keydown') suppressClickUntil = 0;
            if (type === 'click' && event.detail !== 0 && performance.now() < suppressClickUntil && wrapper.contains(event.target)) {
                if (event.cancelable) event.preventDefault();
                event.stopImmediatePropagation();
            }
            return;
        }
        // キーボードはフォーカス済み要素を含め捕捉。地図外のページ全体は無効化しない。
        if (!wrapper.contains(event.target) && !type.startsWith('key')) return;
        if (!pointerEvents && type.startsWith('pointer')) {
            event.stopImmediatePropagation();
            return; // 非採用のPointer経路で互換マウスを抑止しない。
        }
        if (event.cancelable) event.preventDefault();
        event.stopImmediatePropagation();

        if (pointerEvents && type.startsWith('pointer')) {
            if (type === 'pointerdown') {
                pointerIds.add(event.pointerId);
                if (pointerIds.size === 1 && event.isPrimary && event.button === 0) beginTap(event.pointerId, event.clientX, event.clientY, event.target);
                else { candidate = null; resetProgress(); }
            } else if (type === 'pointermove') moveTap(event.pointerId, event.clientX, event.clientY);
            else if (type === 'pointerup' || type === 'pointercancel') {
                pointerIds.delete(event.pointerId);
                if (type === 'pointerup' && pointerIds.size === 0) finishTap(event.pointerId, event.clientX, event.clientY);
                else { candidate = null; resetProgress(); }
            }
        } else if (!pointerEvents && type.startsWith('touch')) {
            lastTouchAt = lastDirectInputAt = performance.now();
            const touch = event.touches?.[0] || event.changedTouches?.[0];
            if (!touch) { candidate = null; resetProgress(); return; }
            if (type === 'touchstart' && event.touches.length === 1) beginTap(touch.identifier, touch.clientX, touch.clientY, event.target);
            else if (type === 'touchmove' && event.touches.length === 1) moveTap(touch.identifier, touch.clientX, touch.clientY);
            else if (type === 'touchend' && event.touches.length === 0) finishTap(touch.identifier, touch.clientX, touch.clientY);
            else { candidate = null; resetProgress(); }
        } else if (!pointerEvents && type.startsWith('mouse') && performance.now() - lastTouchAt > COMPATIBILITY_CLICK_MS) {
            if (type === 'mousedown' && event.button === 0) beginTap('mouse', event.clientX, event.clientY, event.target);
            else if (type === 'mousemove') moveTap('mouse', event.clientX, event.clientY);
            else if (type === 'mouseup' && event.button === 0) finishTap('mouse', event.clientX, event.clientY);
        } else if (type === 'keydown') {
            if (onUnlock(event.target) && ['Enter', ' '].includes(event.key)) {
                if (!event.repeat) { lastDirectInputAt = performance.now(); registerTap(); }
            } else if (event.key === 'Tab') unlockButton.focus({ preventScroll: true });
            else resetProgress();
        } else if (type === 'click') {
            // キーボードはkeydownで処理済み。ATの独立したclickだけここで受け付ける。
            if (onUnlock(event.target) && event.detail === 0 && performance.now() - lastDirectInputAt > COMPATIBILITY_CLICK_MS) registerTap();
            else if (!onUnlock(event.target)) resetProgress();
        }
    }

    // リスナーは初期化時の一度だけ登録する。Touch/互換clickを別タップとして数えない。
    const events = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel',
        'touchstart', 'touchmove', 'touchend', 'touchcancel', 'mousedown', 'mousemove', 'mouseup',
        'click', 'dblclick', 'contextmenu', 'wheel', 'keydown', 'keyup', 'keypress',
        'gesturestart', 'gesturechange', 'gestureend', 'dragstart', 'drop', 'selectstart', 'beforeinput', 'input', 'change'];
    events.forEach(type => document.addEventListener(type, inputGate, { capture: true, passive: false }));
    document.addEventListener('focusin', event => {
        if (locked && !onUnlock(event.target)) unlockButton.focus({ preventScroll: true });
    }, true);
    new MutationObserver(() => { if (locked) protectChildren(); }).observe(wrapper, { childList: true });
    startButton.addEventListener('click', () => setLocked(true));

    function syncContext() {
        const available = isMobileFullscreenMapUI();
        if (locked && (!available || document.visibilityState === 'hidden')) setLocked(false, false);
        startButton.hidden = !available;
    }
    document.addEventListener('mapfullscreenchange', syncContext);
    window.addEventListener('resize', syncContext);
    [screenWakeLockMobileQuery, mapFullscreenTouchQuery].forEach(query => {
        if (query.addEventListener) query.addEventListener('change', syncContext);
        else query.addListener(syncContext);
    });
    document.addEventListener('visibilitychange', () => setLocked(false, false));
    window.addEventListener('pagehide', () => setLocked(false, false));
    window.addEventListener('pageshow', () => { setLocked(false, false); syncContext(); });
    window.addEventListener('popstate', () => setLocked(false, false));
    // 初期読み込みでは解除通知を読み上げない。
    unlockButton.setAttribute('aria-label', '操作ロック解除、3秒以内に3回。現在0回');
    syncContext();
})();
