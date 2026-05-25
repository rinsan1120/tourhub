/**
 * BMW Motorrad Connected用 座標抽出エンジン
 * グローバル汚染を防ぐため即時関数でカプセル化
 */
(function() {
    // ★ここに後でGASのデプロイURLを入れる
    const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzUBQSI16ofrFHB9KoDQyAfZPqEwC3paiZAuCY9vl6WST1jLvlGqreCXwOa-Ws5qSXM_g/exec";

    window.addEventListener('DOMContentLoaded', () => {
        const inputUrl = document.getElementById('gmaps-url-input');
        const btnExtract = document.getElementById('extract-coord-btn');
        const resultArea = document.getElementById('extract-result-area');
        const outputCoord = document.getElementById('extracted-coord-output');
        const btnCopy = document.getElementById('copy-coord-btn');
        const msgBox = document.getElementById('extract-msg');

        if (!inputUrl || !btnExtract) return;

        // メッセージ表示用ヘルパー
        const showMessage = (msg, isError = true) => {
            msgBox.textContent = msg;
            msgBox.style.color = isError ? '#ef4444' : '#10b981';
        };

        // 抽出ボタンのクリックイベント
        btnExtract.addEventListener('click', async () => {
            const url = inputUrl.value.trim();
            
            if (!url) {
                showMessage('URLを入力してください');
                return;
            }

            // 簡単なURLバリデーション
            if (!url.includes('google') && !url.includes('goo.gl')) {
                showMessage('Google MapsのURLを入力してください');
                return;
            }

            // UIをローディング状態に
            showMessage('取得中...', false);
            btnExtract.disabled = true;
            btnExtract.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            resultArea.style.display = 'none';

            try {
                // CORS回避のためGETリクエストで送信
                const fetchUrl = `${GAS_WEB_APP_URL}?url=${encodeURIComponent(url)}`;
                const response = await fetch(fetchUrl);
                
                if (!response.ok) throw new Error('Network response was not ok');
                
                const data = await response.json();

                if (data.success && data.formatted) {
                    showMessage('');
                    outputCoord.value = data.formatted;
                    resultArea.style.display = 'flex';
                } else {
                    showMessage(data.message || '座標を取得できませんでした');
                }
            } catch (error) {
                console.error('Coord Extraction Error:', error);
                showMessage('通信エラーが発生しました');
                // エラーの正体を画面に出力させる
                showMessage(`通信エラー: ${error.message}`, true);
            } finally {
                // UI状態を復元
                btnExtract.disabled = false;
                btnExtract.innerHTML = '<i class="fa-solid fa-download"></i>';
            }
        });

        // コピーボタンのクリックイベント
        btnCopy.addEventListener('click', () => {
            if (!outputCoord.value) return;
            
            navigator.clipboard.writeText(outputCoord.value).then(() => {
                const originalHtml = btnCopy.innerHTML;
                btnCopy.innerHTML = '<i class="fa-solid fa-check"></i>';
                btnCopy.style.background = '#10b981';
                showMessage('コピーしました', false);
                
                setTimeout(() => {
                    btnCopy.innerHTML = originalHtml;
                    btnCopy.style.background = '#1a202c';
                    if(msgBox.textContent === 'コピーしました') showMessage('');
                }, 2000);
            }).catch(err => {
                console.error('Copy failed:', err);
                showMessage('コピーに失敗しました');
            });
        });
    });
})();
