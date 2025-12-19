// sizeControl.js
// 1. 글자 크기: CSS 주입 방식 (기존 성공 로직 유지)
// 2. 화면 배율: Chrome Extension API 사용 (Native Zoom)

// ============================================================
// 1. 설정값 관리 및 초기화
// ============================================================
let currentFontScale = 1.0;
let currentScreenZoom = 1.0; 

function initSettings() {
    // 1. 폰트 설정 로드 (localStorage)
    const savedFont = localStorage.getItem('chatFontScale');
    if (savedFont) currentFontScale = parseFloat(savedFont);

    // 2. 줌 설정 로드 (localStorage 우선, 없으면 브라우저 확인)
    const savedZoom = localStorage.getItem('chatScreenZoom');
    if (savedZoom) {
        currentScreenZoom = parseFloat(savedZoom);
        // 저장된 배율이 있으면 즉시 적용 요청
        chrome.runtime.sendMessage({ 
            action: "SET_ZOOM", 
            zoomFactor: currentScreenZoom 
        });
        updateSliderUI();
    } else {
        try {
            chrome.runtime.sendMessage({ action: "GET_ZOOM" }, (response) => {
                if (response && response.zoomFactor) {
                    currentScreenZoom = response.zoomFactor;
                    updateSliderUI();
                }
            });
        } catch (e) {
            console.log("확장 프로그램 연결 대기 중...");
        }
    }
}

function saveFontSettings() {
    localStorage.setItem('chatFontScale', currentFontScale);
}

function saveZoomSettings() {
    localStorage.setItem('chatScreenZoom', currentScreenZoom);
}

// UI 업데이트 헬퍼 함수
function updateSliderUI() {
    const zInput = document.getElementById('zoom-input');
    const fInput = document.getElementById('font-input');

    if (zInput) zInput.value = Math.round(currentScreenZoom * 100);
    if (fInput) fInput.value = Math.round(currentFontScale * 100);
}

initSettings();

// ============================================================
// 2. 필수 CSS (팝오버 디자인)
// ============================================================
function injectCoreStyles() {
    if (document.getElementById('display-control-core-css')) return;

    const css = `
        /* 팝오버 UI 스타일 */
        .custom-display-popover {
            position: absolute;
            top: calc(100% + 8px); /* 버튼 바로 아래에 위치 */
            left: 0;
            width: 320px;
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 2147483647; 
            font-family: sans-serif;
            color: #333;
            display: none;
            text-align: left;
        }
        .custom-display-popover.active {
            display: block;
        }
        .popover-header { padding: 12px 16px; border-bottom: 1px solid #f0f0f0; font-weight: bold; font-size: 14px; }
        .popover-content { padding: 16px; }
        .control-row { margin-bottom: 20px; }
        .label-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; font-weight: 500; }
        .slider-row { display: flex; align-items: center; gap: 8px; }
        .ctrl-btn { width: 28px; height: 28px; background: #f5f5f5; border: 1px solid #d9d9d9; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold; }
        .ctrl-btn:hover { background: #e6f7ff; color: #1890ff; border-color: #1890ff; }
        .size-input { 
            width: 60px; 
            height: 28px; 
            text-align: center; 
            border: 1px solid #d9d9d9; 
            border-radius: 4px; 
            font-size: 13px; 
            outline: none;
        }
        .size-input:focus { border-color: #1890ff; box-shadow: 0 0 0 2px rgba(24,144,255,0.2); }
        .unit-span { font-size: 13px; color: #666; margin-left: -25px; pointer-events: none; z-index: 1; }
        .reset-btn { background: #fff; border: 1px solid #d9d9d9; padding: 4px 12px; border-radius: 4px; font-size: 12px; cursor: pointer; }
        .reset-btn:hover { border-color: #1890ff; color: #1890ff; }
    `;
    
    const style = document.createElement('style');
    style.id = 'display-control-core-css';
    style.textContent = css;
    document.head.appendChild(style);
}

// ============================================================
// 3. 메인 기능 주입 (버튼 및 팝오버 생성)
// ============================================================
function injectDisplayControl() {
    injectCoreStyles();
    applyOriginalFontScale(); // 폰트 적용

    // 이미 생성되었으면 중단
    if (document.getElementById('display-control-container')) return;

    // "채팅방 정렬" 버튼 찾기 (위치 기준)
    const sortButton = Array.from(document.querySelectorAll('button')).find(
        btn => btn.textContent.trim() === '채팅방 정렬'
    );
    if (!sortButton) return;
    const buttonGroup = sortButton.parentElement;

    // 헤더 z-index 보정
    const header = buttonGroup.closest('[class*="pos_sticky"]') || buttonGroup.closest('[class*="z_"]');
    if (header) header.style.setProperty('z-index', '99999', 'important');

    // 컨테이너
    const container = document.createElement('div');
    container.id = 'display-control-container';
    container.style.position = 'relative';
    container.style.display = 'inline-flex';

    // "배율 설정" 버튼
    const btn = document.createElement('button');
    btn.textContent = '배율 설정';
    btn.style.fontSize = '.875rem';
    btn.className = 'button__root button__root--size_xSmall button__root--variant_text button__root--color_primary button__root--selected_false button__root--strong_false button__root--fullWidth_false c_common.10 hover:bg_common.a1 active:after:op_100';
    btn.type = "button"; // 폼 제출 방지
    btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const p = document.getElementById('display-popover');
        if(p) {
            p.classList.toggle('active');
            // 팝오버 열 때 최신 줌 상태 다시 확인
            if(p.classList.contains('active')) initSettings();
        }
    };

    // 팝오버 내용
    const popover = document.createElement('div');
    popover.id = 'display-popover';
    popover.className = 'custom-display-popover';
    popover.innerHTML = `
        <div class="popover-header">화면 보기 설정</div>
        <div class="popover-content">
            <div class="control-row">
                <div class="label-row">
                    <span>화면 배율 (Zoom)</span>
                </div>
                <div class="slider-row">
                    <button class="ctrl-btn" type="button" id="zoom-minus">−</button>
                    <div style="position: relative; display: flex; align-items: center; flex: 1;">
                        <input type="text" id="zoom-input" class="size-input" value="${Math.round(currentScreenZoom * 100)}" style="width: 100%;">
                        <span class="unit-span">%</span>
                    </div>
                    <button class="ctrl-btn" type="button" id="zoom-plus">+</button>
                </div>
            </div>

            <div class="control-row">
                <div class="label-row">
                    <span>글자 크기 (Font)</span>
                </div>
                <div class="slider-row">
                    <button class="ctrl-btn" type="button" id="font-minus">−</button>
                    <div style="position: relative; display: flex; align-items: center; flex: 1;">
                        <input type="text" id="font-input" class="size-input" value="${Math.round(currentFontScale * 100)}" style="width: 100%;">
                        <span class="unit-span">%</span>
                    </div>
                    <button class="ctrl-btn" type="button" id="font-plus">+</button>
                </div>
            </div>
            <p style="font-size: 11px; color: #999; margin-bottom:16px;">입력 후 Enter / 입력란 포커스 상태에서 위,아래 방향키로 배율 조절 가능</p>
            <div style="text-align: right; border-top: 1px solid #eee; padding-top: 10px;">
                <button class="reset-btn" type="button" id="reset-all">설정 초기화</button>
            </div>
        </div>
    `;

    container.appendChild(btn);
    container.appendChild(popover);
    buttonGroup.insertBefore(container, sortButton);

    bindControlEvents(popover);
    updateSliderUI();
}

// ============================================================
// 4. 이벤트 핸들러
// ============================================================
function bindControlEvents(popover) {
    popover.onclick = (e) => e.stopPropagation();
    
    // 줌 요청 처리
    const requestZoom = (val) => {
        currentScreenZoom = Math.max(0.25, Math.min(3.0, val));
        updateSliderUI();
        saveZoomSettings(); // localStorage에 저장
        chrome.runtime.sendMessage({ action: "SET_ZOOM", zoomFactor: currentScreenZoom });
    };

    // 폰트 요청 처리
    const updateFont = (val) => {
        currentFontScale = Math.max(0.5, Math.min(2.5, val));
        updateSliderUI();
        applyOriginalFontScale();
        saveFontSettings(); // localStorage에 저장
    };

    // 공통 입력창 이벤트 바인딩 (Enter 및 방향키)
    const setupInputEvents = (inputId, updateFn, currentValGetter, step) => {
        const input = popover.querySelector(`#${inputId}`);
        if (!input) return;

        input.onkeydown = (e) => {
            let currentVal = Math.round(currentValGetter() * 100);
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                updateFn((currentVal + step) / 100);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                updateFn((currentVal - step) / 100);
            } else if (e.key === 'Enter') {
                const val = parseInt(input.value);
                if (!isNaN(val)) updateFn(val / 100);
                input.blur();
            }
        };

        input.onblur = () => {
            const val = parseInt(input.value);
            if (!isNaN(val)) updateFn(val / 100);
            else updateSliderUI(); // 복구
        };
    };

    // 이벤트 연결
    setupInputEvents('zoom-input', requestZoom, () => currentScreenZoom, 5);
    setupInputEvents('font-input', updateFont, () => currentFontScale, 5);

    popover.querySelector('#zoom-minus').onclick = () => requestZoom(currentScreenZoom - 0.05);
    popover.querySelector('#zoom-plus').onclick = () => requestZoom(currentScreenZoom + 0.05);
    popover.querySelector('#font-minus').onclick = () => updateFont(currentFontScale - 0.05);
    popover.querySelector('#font-plus').onclick = () => updateFont(currentFontScale + 0.05);

    popover.querySelector('#reset-all').onclick = () => {
        requestZoom(1.0);
        updateFont(1.0);
    };

    document.addEventListener('click', (e) => {
        const container = document.getElementById('display-control-container');
        if (container && !container.contains(e.target)) {
            const p = document.getElementById('display-popover');
            if (p) p.classList.remove('active');
        }
    });
}

// ============================================================
// 5. 폰트 스타일 적용 (기존 로직)
// ============================================================
function applyOriginalFontScale() {
    let styleTag = document.getElementById('chat-font-scale-style');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'chat-font-scale-style';
        document.head.appendChild(styleTag);
    }

    styleTag.textContent = `
        /* 설정 메뉴 및 실행 버튼(보기 설정, 템플릿 관리) 폰트 스케일링 */
        #display-control-container > button,
        #template-btn-container > button,
        .custom-display-popover, 
        .custom-display-popover input, 
        .custom-display-popover button,
        .custom-display-popover p { 
            font-size: calc(13px * ${currentFontScale}) !important; 
        }
        .popover-header { font-size: calc(14px * ${currentFontScale}) !important; }
        .label-row span:first-child { font-size: calc(13px * ${currentFontScale}) !important; }
        .unit-span { font-size: calc(13px * ${currentFontScale}) !important; }

        /* 기존 채팅창 폰트 스케일링 */
        div[role="textbox"], div[role="textbox"] * { font-size: calc(14px * ${currentFontScale}) !important; }
        [class*="MDSText--variant_chat-caption-M"], [class*="caption"] { font-size: calc(12px * ${currentFontScale}) !important; }
        [class*="MDSText--variant_chat-small-text-R"] { font-size: calc(11px * ${currentFontScale}) !important; }
        div[role="separator"] span, .MuiDivider-wrapper { font-size: calc(13px * ${currentFontScale}) !important; }
        [class*="subtitle"] span, span[class*="body"] { font-size: calc(13px * ${currentFontScale}) !important; }
        .MuiChip-label { font-size: calc(12px * ${currentFontScale}) !important; }
        .MDSText--variant_subtitle3-B span { font-size: calc(16px * ${currentFontScale}) !important; }
    `;
}

// 실행
setInterval(injectDisplayControl, 1000);