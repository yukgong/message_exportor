// content.js - 채팅 내보내기 기능

let isProcessing = false;

function injectExportButtons() {
    const dateDividers = document.querySelectorAll('div[role="separator"]');
    dateDividers.forEach((divider) => {
        const wrapper = divider.querySelector('.MuiDivider-wrapper');
        if (!wrapper || wrapper.querySelector('.chat-export-group')) return;

        // ✅ wrapper에서 텍스트/버튼을 같은 기준으로 수직 중앙정렬
        wrapper.style.display = 'inline-flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '10px';
        
        const btnGroup = document.createElement('div');
        btnGroup.className = 'chat-export-group';

        btnGroup.style.display = 'inline-flex';
        btnGroup.style.gap = '5px';
        btnGroup.style.zIndex = '9999';

        btnGroup.appendChild(createIconButton('icon/clipboard.svg', '텍스트 복사', () => startScraping(divider, 'text')));
        btnGroup.appendChild(createIconButton('icon/capture.svg', '이미지 캡처', () => startScraping(divider, 'image')));
        btnGroup.appendChild(createIconButton('icon/text_file_download.svg', '텍스트 파일 저장', () => startTextFileScraping(divider)));

        wrapper.appendChild(btnGroup);
    });
}

function createIconButton(iconPath, title, onClick) {
    const btn = document.createElement('button');
    btn.className = 'export-btn';
    btn.title = title;
    btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
    };
    btn.style.cssText = `
        cursor: pointer;
        border: 1px solid #ddd;
        background: #fff url(${chrome.runtime.getURL(iconPath)}) no-repeat center;
        background-size: 18px 18px;
        border-radius: 6px;
        width: 28px;
        height: 28px;
    `;
    return btn;
}


// 고유 키 생성 (Top 제외, 내용 기반)
function generateMessageKey(parsed) {
    const sender = parsed.sender || "null";
    const time = parsed.time || "";
    const content = parsed.content || "";
    // ★ [수정] 24자 → 전체 content 사용하여 더 정확한 중복 감지
    const raw = `${time}__${sender}__${content}`;
    return btoa(unescape(encodeURIComponent(raw)));
}


// ============================================================
// 2. 핵심 로직: 스크롤 & 수집
// ============================================================

async function startScraping(startDivider, mode) {
    if (isProcessing) {
        alert("작업 중입니다. 잠시만 기다려주세요.");
        return;
    }
    isProcessing = true;

    // ★ 클릭한 날짜 구분선에서 상위 채팅방 정보 추출
    const chatRoomInfo = getChatRoomInfo(startDivider);

    const dateSpan = startDivider.querySelector('[aria-label]');
    const targetDateText = dateSpan
        ? dateSpan.innerText.trim()
        : extractDateFromText(startDivider.innerText);

    showLoadingOverlay(`[${targetDateText}] 수집 중...\n화면을 건드리지 마세요.`);

    const scroller = findScrollContainer(startDivider);
    if (!scroller) {
        alert("스크롤 영역을 찾을 수 없습니다.");
        hideLoadingOverlay();
        isProcessing = false;
        return;
    }

    const startRowElement = startDivider.closest('div[style*="position: absolute"]');
    if (!startRowElement) {
        alert("시작 위치를 찾을 수 없습니다.");
        hideLoadingOverlay();
        isProcessing = false;
        return;
    }
    const startRowTop = parseFloat(startRowElement.style.top);

    const collectedData = new Map();
    let reachedNextSeparator = false;

    startDivider.scrollIntoView({ block: "start", behavior: "instant" });
    await wait(800);

    let lastScrollTop = -1;
    let sameScrollCount = 0;

    // ================= LOOP =================
    while (true) {
        const rows = Array.from(scroller.querySelectorAll('div'))
            .filter(row => {
                const s = window.getComputedStyle(row);
                return s.position === 'absolute' && row.style.top;
            })
            .sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top));

        for (const row of rows) {
            const rowTop = parseFloat(row.style.top) || 0;

            if (rowTop < startRowTop - 1) continue;

            const separator = row.querySelector('div[role="separator"]');
            if (separator) {
                if (Math.abs(rowTop - startRowTop) > 5) {
                    reachedNextSeparator = true;
                    break;
                }
            }

            const parsed = parseMessageRow(row);
            if (!parsed) continue;

            const baseKey = generateMessageKey(parsed);
            const clone = row.cloneNode(true);
            copyComputedStyles(row, clone);

            if (collectedData.has(baseKey)) {
                const items = collectedData.get(baseKey);
                // ★ [수정] 가상 스크롤 위치 변동 대응: 24px → 100px로 확대
                const alreadyExists = items.some(item => Math.abs(item.top - rowTop) < 100);

                if (!alreadyExists) {
                    // 모든 기존 항목과 100px 이상 떨어져 있음 = 실제로 다른 메시지
                    items.push({ parsed, element: clone, top: rowTop });
                }
                // alreadyExists가 true면 = 같은 메시지의 재렌더링, 스킵
            } else {
                collectedData.set(baseKey, [{ parsed, element: clone, top: rowTop }]);
            }
        }

        if (reachedNextSeparator) break;

        const currentScrollTop = scroller.scrollTop;
        if (Math.abs(currentScrollTop - lastScrollTop) < 2) {
            sameScrollCount++;
            if (sameScrollCount > 5) break;
        } else {
            sameScrollCount = 0;
        }
        lastScrollTop = currentScrollTop;

        scroller.scrollBy(0, 300);
        await wait(500);
    }
    // ================= LOOP END =================

    let sortedItems = Array.from(collectedData.values())
        .flat()
        .sort((a, b) => a.top - b.top);

    if (sortedItems.length === 0) {
        alert("수집된 메시지가 없습니다.");
    } else if (mode === 'text') {
        processTextExport(sortedItems, targetDateText, chatRoomInfo);
    } else {
        await processImageExport(sortedItems, targetDateText, chatRoomInfo);
    }

    hideLoadingOverlay();
    isProcessing = false;

    startDivider.scrollIntoView({ block: "center" });
}


// ============================================================
// 3. 파싱 로직 (정렬 스타일 기반 감지)
// ============================================================

function parseMessageRow(node) {
    const hasContent = node.innerText.trim() ||
        node.querySelector('img') ||
        node.querySelector('div[role="button"]');
    if (!hasContent) return null;

    let sender = null;

    // 1. [핵심 변경] 클래스 이름 대신, 실제 CSS 스타일(정렬)을 확인하여 '나'인지 판단
    // flex-row-reverse(나) 혹은 justify-content: flex-end(나) 속성을 가진 자식 요소가 있는지 찾습니다.
    const isMyMessage = Array.from(node.querySelectorAll('div')).some(div => {
        const style = window.getComputedStyle(div);
        return (
            div.classList.contains('flex_row-reverse') || // 기존 클래스 체크
            style.flexDirection === 'row-reverse' ||      // 스타일 체크 1
            style.justifyContent === 'flex-end'           // 스타일 체크 2
        );
    });

    if (isMyMessage) {
        sender = "나";
    } else {
        // 2. 상대방일 경우 이름 추출
        // 상대방 메시지 컨테이너(왼쪽 정렬)가 있는지 확인
        const isOtherMessage = Array.from(node.querySelectorAll('div')).some(div => {
             const style = window.getComputedStyle(div);
             return (
                 div.classList.contains('flex_row') || 
                 style.flexDirection === 'row' || 
                 style.justifyContent === 'flex-start'
             );
        });

        if (isOtherMessage || !isMyMessage) { // 내가 아니면 기본적으로 상대방으로 간주
            // 이름이 있는 태그를 찾음 (기존 선택자 + 범용 선택자 추가)
            const nameNode = node.querySelector('[class*="MDSText--variant_chat-caption-M"]') || 
                             node.querySelector('[class*="caption"]'); // 혹시 모를 다른 캡션 클래스 대비
            
            if (nameNode) {
                sender = nameNode.innerText.trim();
            } else {
                // 이름이 없으면 '연속된 메시지'로 간주하여 null 반환 
                // (processTextExport에서 이전 화자 이름으로 채워짐)
                sender = null; 
            }
        }
    }

    let time = "";
    // 시간 추출 로직 (기존 유지하되 조금 더 안전하게)
    node.querySelectorAll('[class*="MDSText--variant_chat-small-text-R"]').forEach(t => {
        const txt = t.innerText.trim();
        // 시간 형식 (오전/오후 포함하거나 : 포함) 체크
        if ((txt.includes('오전') || txt.includes('오후')) && txt.includes(':')) {
            time = txt;
        }
    });

    let contents = [];

    // 이미지 추출
    node.querySelectorAll('img').forEach(img => {
        if (img.classList.contains('MuiAvatar-img') || img.closest('.MuiAvatar-root')) return;
        if (img.closest('.MuiChip-root') || img.closest('[role="button"]')) return;

        const alt = img.getAttribute('alt') || '';
        if (alt && !alt.startsWith('http')) {
            contents.push(`(이모티콘: ${alt})`);
        } else {
            contents.push(`(사진)`);
        }
    });

    // 파일 추출
    node.querySelectorAll('div[role="button"]').forEach(fileBtn => {
        if (fileBtn.closest('.MuiChip-root')) return;
        // 선택자 범위를 조금 넓혀서 찾기
        const fileNameEl = fileBtn.querySelector('[class*="subtitle"] span, span[class*="subtitle"], span[class*="body"]');
        if (fileNameEl) {
            const fileName = fileNameEl.innerText.trim();
            if (fileName) contents.push(`(파일: ${fileName})`);
        }
    });

    // 텍스트 추출
    const textBox = node.querySelector('div[role="textbox"]');
    if (textBox && textBox.innerText.trim()) {
        contents.push(textBox.innerText.trim());
    }

    if (contents.length === 0) return null;

    return { time, sender, content: contents.join('\n') };
}

// ============================================================
// 4. 내보내기 (이미지 분할 저장 + 캐시 버스팅 적용)
// ============================================================

function processTextExport(items, dateText, chatRoomInfo) {
    const { name, group } = chatRoomInfo || getChatRoomInfo();
    const roomInfo = name + (group ? ` (${group})` : '');

    let resultText = `=== [${dateText}] ${roomInfo} 대화 내용 ===\n\n`;

    let lastSender = "알 수 없음";

    let processedItems = items.map(item => {
        const { parsed } = item;
        const senderName = parsed.sender ? parsed.sender : lastSender;
        if (parsed.sender) lastSender = parsed.sender;
        return { ...parsed, sender: senderName };
    });

    let lastTime = "";
    let lastSenderForTime = "";

    for (let i = processedItems.length - 1; i >= 0; i--) {
        const item = processedItems[i];
        if (item.time) {
            lastTime = item.time;
            lastSenderForTime = item.sender;
        } else if (item.sender === lastSenderForTime && lastTime) {
            item.time = lastTime;
        }
    }

    processedItems.forEach(item => {
        const timeStr = item.time ? `[${item.time}] ` : '';
        resultText += `${timeStr}${item.sender} : ${item.content}\n`;
    });

    navigator.clipboard.writeText(resultText).then(() => {
        alert(`[${dateText}] ${roomInfo} 완료! ${processedItems.length}개의 메시지 복사됨.`);
    });
}

// [수정] 이미지 분할 저장 + 로딩 대기 강화
async function processImageExport(items, dateText, chatRoomInfo) {
    const MAX_HEIGHT_PER_IMAGE = 2000;

    const container = document.createElement('div');
    container.style.cssText = `
        position: absolute; top: 0; left: 0; width: 360px; 
        background-color: #ffffff; z-index: -9999; padding: 16px;
        display: flex; flex-direction: column;
    `;
    document.body.appendChild(container);

    // ★ 원본 페이지의 CSS 규칙을 컨테이너에 주입
    injectStyleSheets(container);

    const createHeader = (text) => {
        const header = document.createElement('div');
        header.innerText = text;
        header.style.cssText = 'text-align: center; padding: 15px 0; color: #666; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid #eee;';
        return header;
    };

    let partCount = 1;
    container.appendChild(createHeader(`${dateText} (Part ${partCount})`));

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const clone = item.element;
        processCloneForImage(clone);

        container.appendChild(clone);

        // ★ 캐시 버스팅 로직 적용하여 이미지 로드
        await convertImagesToDataURL(clone);

        if (container.offsetHeight > MAX_HEIGHT_PER_IMAGE) {
            container.removeChild(clone);

            showLoadingOverlay(`이미지 저장 중... (Part ${partCount})`);
            await captureAndDownload(container, dateText, partCount, chatRoomInfo);

            container.innerHTML = '';
            partCount++;

            container.appendChild(createHeader(`${dateText} (Part ${partCount})`));
            container.appendChild(clone);

            await convertImagesToDataURL(clone);
        }
    }

    if (container.children.length > 1) {
        showLoadingOverlay(`이미지 저장 중... (Part ${partCount} - 완료)`);
        await captureAndDownload(container, dateText, partCount, chatRoomInfo);
    }

    document.body.removeChild(container);
}

// 실제 캡처 및 다운로드 함수
async function captureAndDownload(element, dateText, partNum, chatRoomInfo) {
    try {
        const canvas = await html2canvas(element, {
            useCORS: true,
            allowTaint: true,
            scale: 2,
            backgroundColor: '#ffffff',
            ignoreElements: (el) => el.style.display === 'none',
            // ★ [수정] CSP 정책 충돌 방지를 위한 옵션 추가
            foreignObjectRendering: false,
            logging: false
        });

        // ★ 채팅방 정보 추가
        const { name, group } = chatRoomInfo || getChatRoomInfo();
        const roomInfo = sanitizeFileName(name + (group ? `_${group}` : ''));
        
        const link = document.createElement('a');
        const fileName = `[${roomInfo}]${dateText.replace(/[^0-9]/g, '')}_${partNum}.png`;
        link.download = fileName;
        link.href = canvas.toDataURL('image/png');
        link.click();

        await wait(1000);
    } catch (e) {
        console.error(e);
        alert(`이미지 변환 실패 (Part ${partNum}): ` + e.message);
    }
}

// ============================================================
// ★ 복구된 핵심 함수: 캐시 버스팅 (?t=...) 적용
// ============================================================
async function convertImagesToDataURL(containerOrElement) {
    const imgs = containerOrElement.tagName === 'IMG'
        ? [containerOrElement]
        : Array.from(containerOrElement.querySelectorAll('img'));

    const promises = imgs.map(async (img) => {
        if (!img.src || img.src.startsWith('data:')) return;

        try {
            // [복구됨] 아까 잘 동작했던 그 로직!
            // URL에 현재 시간을 붙여서 브라우저가 캐시된(CORS 없는) 이미지를 쓰지 않고
            // 새로운 요청(CORS 포함)을 보내도록 유도합니다.
            const url = new URL(img.src);
            url.searchParams.set('t', Date.now());

            const response = await fetch(url.toString(), { cache: 'no-cache' });
            if (!response.ok) throw new Error('Network response was not ok');

            const blob = await response.blob();

            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    img.src = reader.result;
                    resolve();
                };
                // 로드 실패 시에도 멈추지 않도록 resolve 처리
                reader.onerror = () => {
                    console.warn('FileReader failed');
                    resolve();
                };
                reader.readAsDataURL(blob);
            });
        } catch (err) {
            // 실패 시 그냥 넘어감 (화면에는 엑박으로 나오겠지만 멈추진 않음)
            console.warn('이미지 변환 실패 (Cache Busting 시도했으나 실패):', img.src, err);
            return Promise.resolve();
        }
    });

    await Promise.all(promises);
}


// ============================================================
// 유틸리티
// ============================================================

// ★ 채팅방 정보(이름/그룹명) 추출
function getChatRoomInfo(fromElement) {
    // fromElement가 있으면 해당 요소의 상위 chat-container를 찾음
    const chatContainer = fromElement
        ? fromElement.closest('.chat-container')
        : document.querySelector('.chat-container');

    if (!chatContainer) return { name: '', group: '' };

    // 이름 추출 (MDSText--variant_subtitle3-B 내 span)
    const nameEl = chatContainer.querySelector('.MDSText--variant_subtitle3-B span');
    const name = nameEl ? nameEl.innerText.trim() : '';

    // 그룹명 추출 (MDSText--variant_chat-small-text-R 내 span)
    const groupEl = chatContainer.querySelector('.MDSText--variant_chat-small-text-R span');
    const group = groupEl ? groupEl.innerText.trim() : '';

    return { name, group };
}

// 파일명용 문자열 정리 (특수문자 제거)
function sanitizeFileName(str) {
    return str.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_').substring(0, 30);
}

function processCloneForImage(element, originalElement) {
    if (originalElement) copyComputedStyles(originalElement, element);
    element.style.position = 'relative';
    element.style.top = 'auto';
    element.style.left = 'auto';
    element.style.transform = 'none';
    element.style.width = '100%';


    // ★ 글자 요소들 위치 보정
    element.querySelectorAll('p').forEach(el => {
        el.style.setProperty('line-height', '1.2', 'important');
        el.style.setProperty('margin', '0', 'important');
        el.style.setProperty('padding', '0', 'important');
        el.style.setProperty('position', 'relative', 'important');
        el.style.setProperty('top', '-8px', 'important');
    });

    element.querySelectorAll('span').forEach(el => {
        el.style.setProperty('line-height', '1.2', 'important');
        el.style.setProperty('overflow', 'visible', 'important');
        el.style.setProperty('position', 'relative', 'important');
        el.style.setProperty('text-overflow', 'clip', 'important');
        el.style.setProperty('-webkit-line-clamp', 'unset', 'important');
        el.style.setProperty('top', '-4px', 'important');
    });

    // ★ file 
    element.querySelectorAll('div[role="button"]').forEach(el => {
        el.style.setProperty('height', 'auto', 'important');
    });

    // ★ Chip 
    element.querySelectorAll('.MuiChip-root').forEach(el => {
        el.style.setProperty('height', '24px', 'important');
    });

    // ★ Chip 내부 span - 다른 스타일 적용
    element.querySelectorAll('.MuiChip-root span').forEach(el => {
        el.style.setProperty('position', 'relative', 'important');
        el.style.setProperty('top', '-8px', 'important');
        el.style.setProperty('line-height', '1', 'important');
    });

    element.querySelectorAll('.export-btn').forEach(el => {
        el.style.setProperty('display', 'none', 'important');
    });

    // 4. [정렬 보정] "나"의 메시지 오른쪽 정렬 풀림 방지
    // 원본에 flex-row-reverse(나) 클래스가 있다면 flex 설정을 강제합니다.
    if (element.querySelector('.flex_row-reverse')) {
        const flexContainer = element.querySelector('.d_flex.items_flex-end');
        if (flexContainer) {
            flexContainer.style.justifyContent = 'flex-end'; // 오른쪽 정렬 강제
            flexContainer.style.width = '100%';
        }
    }
}

function copyComputedStyles(source, target) {
    // 레이아웃은 건드리지 않고, 텍스트/색상만 백업용으로 복사
    const visualStyles = ['font-family', 'color'];
    try {
        const s = window.getComputedStyle(source);
        visualStyles.forEach(p => target.style.setProperty(p, s.getPropertyValue(p)));
        for (let i = 0; i < source.children.length && i < target.children.length; i++) {
            copyComputedStyles(source.children[i], target.children[i]);
        }
    } catch (e) { }
}

function injectStyleSheets(container) {
    const styleEl = document.createElement('style');
    let cssText = '';

    // 페이지의 모든 스타일시트에서 CSS 규칙 수집
    for (const sheet of document.styleSheets) {
        try {
            if (sheet.cssRules) {
                for (const rule of sheet.cssRules) {
                    cssText += rule.cssText + '\n';
                }
            }
        } catch (e) {
            // CORS 제한으로 접근 못하는 외부 스타일시트는 무시
            console.warn('Cannot access stylesheet:', sheet.href);
        }
    }

    styleEl.textContent = cssText;
    container.prepend(styleEl); // 컨테이너 맨 앞에 삽입
}

function findScrollContainer(el) {
    let current = el.parentElement;
    while (current) {
        const style = window.getComputedStyle(current);
        if (['auto', 'scroll'].includes(style.overflowY)) return current;
        current = current.parentElement;
        if (current === document.body) return window;
    }
    return window;
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function extractDateFromText(text) {
    const match = text.match(/(\d{1,2}\.\d{2}\s*\([월화수목금토일]\))/);
    return match ? match[1] : text.replace(/[^0-9.\(\)월화수목금토일\s]/g, '').trim();
}

function showLoadingOverlay(text) {
    let overlay = document.getElementById('chat-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'chat-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.7); z-index: 999999;
            display: flex; justify-content: center; align-items: center;
            color: #fff; font-size: 20px; white-space: pre-line; text-align: center;
        `;
        document.body.appendChild(overlay);
    }
    overlay.innerText = text;
    overlay.style.display = 'flex';
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('chat-overlay');
    if (overlay) overlay.style.display = 'none';
}


// 초기화
setInterval(injectExportButtons, 1000);
