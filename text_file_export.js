// text_file_export.js - 텍스트 파일(.txt) 내보내기 기능
// capture_contents.js의 기존 함수들을 재활용하여 텍스트를 파일로 저장

let isTextFileProcessing = false;

// ============================================================
// 1. 버튼 주입 (기존 버튼 그룹에 추가)
// capture_contents.js의 injectExportButtons() 함수를 활용하여 텍스트 파일 내보내기 버튼 주입됨.

// ============================================================


// ============================================================
// 2. 스크래핑 로직 (capture_contents.js와 동일한 수집 로직)
// ============================================================
async function startTextFileScraping(startDivider) {
    if (isTextFileProcessing) {
        alert("작업 중입니다. 잠시만 기다려주세요.");
        return;
    }
    isTextFileProcessing = true;

    // 채팅방 정보 추출 (capture_contents.js의 전역 함수 사용)
    const chatRoomInfo = getChatRoomInfo(startDivider);

    const dateSpan = startDivider.querySelector('[aria-label]');
    const targetDateText = dateSpan
        ? dateSpan.innerText.trim()
        : extractDateFromTextFile(startDivider.innerText);

    showTextFileLoadingOverlay(`[${targetDateText}] 수집 중...\n화면을 건드리지 마세요.`);

    const scroller = findTextFileScrollContainer(startDivider);
    if (!scroller) {
        alert("스크롤 영역을 찾을 수 없습니다.");
        hideTextFileLoadingOverlay();
        isTextFileProcessing = false;
        return;
    }

    const startRowElement = startDivider.closest('div[style*="position: absolute"]');
    if (!startRowElement) {
        alert("시작 위치를 찾을 수 없습니다.");
        hideTextFileLoadingOverlay();
        isTextFileProcessing = false;
        return;
    }
    const startRowTop = parseFloat(startRowElement.style.top);

    const collectedData = new Map();
    let reachedNextSeparator = false;

    startDivider.scrollIntoView({ block: "start", behavior: "instant" });
    await waitTextFile(800);

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

            // capture_contents.js의 전역 함수 사용
            const parsed = parseMessageRow(row);
            if (!parsed) continue;

            const baseKey = generateTextFileMessageKey(parsed);

            if (collectedData.has(baseKey)) {
                const items = collectedData.get(baseKey);
                const alreadyExists = items.some(item => Math.abs(item.top - rowTop) < 100);

                if (!alreadyExists) {
                    items.push({ parsed, top: rowTop });
                }
            } else {
                collectedData.set(baseKey, [{ parsed, top: rowTop }]);
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
        await waitTextFile(500);
    }
    // ================= LOOP END =================

    let sortedItems = Array.from(collectedData.values())
        .flat()
        .sort((a, b) => a.top - b.top);

    if (sortedItems.length === 0) {
        alert("수집된 메시지가 없습니다.");
    } else {
        saveAsTextFile(sortedItems, targetDateText, chatRoomInfo);
    }

    hideTextFileLoadingOverlay();
    isTextFileProcessing = false;

    startDivider.scrollIntoView({ block: "center" });
}

// ============================================================
// 3. 텍스트 파일로 저장
// ============================================================
function saveAsTextFile(items, dateText, chatRoomInfo) {
    const { name, group } = chatRoomInfo || { name: '', group: '' };
    const roomInfo = name + (group ? ` (${group})` : '');

    let resultText = `=== [${dateText}] ${roomInfo} 대화 내용 ===\n\n`;

    let lastSender = "알 수 없음";

    let processedItems = items.map(item => {
        const { parsed } = item;
        const senderName = parsed.sender ? parsed.sender : lastSender;
        if (parsed.sender) lastSender = parsed.sender;
        return { ...parsed, sender: senderName };
    });

    // 시간 역방향 채우기
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

    // 파일로 다운로드
    const blob = new Blob([resultText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    const sanitizedRoomInfo = sanitizeTextFileName(name + (group ? `_${group}` : ''));
    const sanitizedDate = dateText.replace(/[^0-9]/g, '');
    link.download = `[${sanitizedRoomInfo}]${sanitizedDate}.txt`;
    link.href = url;
    link.click();
    
    URL.revokeObjectURL(url);

    showToast(`[${dateText}] ${roomInfo} 완료! ${processedItems.length}개의 메시지가 파일로 저장됨.`, 'success');
}

// ============================================================
// 유틸리티 함수 (충돌 방지를 위해 별도 정의)
// ============================================================

function generateTextFileMessageKey(parsed) {
    const sender = parsed.sender || "null";
    const time = parsed.time || "";
    const content = parsed.content || "";
    const raw = `${time}__${sender}__${content}`;
    return btoa(unescape(encodeURIComponent(raw)));
}

function sanitizeTextFileName(str) {
    return str.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_').substring(0, 30);
}

function findTextFileScrollContainer(el) {
    let current = el.parentElement;
    while (current) {
        const style = window.getComputedStyle(current);
        if (['auto', 'scroll'].includes(style.overflowY)) return current;
        current = current.parentElement;
        if (current === document.body) return window;
    }
    return window;
}

function waitTextFile(ms) { 
    return new Promise(r => setTimeout(r, ms)); 
}

function extractDateFromTextFile(text) {
    const match = text.match(/(\d{1,2}\.\d{2}\s*\([월화수목금토일]\))/);
    return match ? match[1] : text.replace(/[^0-9.\(\)월화수목금토일\s]/g, '').trim();
}

function showTextFileLoadingOverlay(text) {
    let overlay = document.getElementById('text-file-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'text-file-overlay';
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

function hideTextFileLoadingOverlay() {
    const overlay = document.getElementById('text-file-overlay');
    if (overlay) overlay.style.display = 'none';
}

// ============================================================
// 초기화
// ============================================================
setInterval(injectTextFileExportButton, 1000);
