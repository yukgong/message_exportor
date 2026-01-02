// ============================================================
// 랜덤 태그 처리 기능
// ============================================================

/**
 * 랜덤 태그를 표시용 형식으로 변환
 * 예: "<random>1</random>\n<random>2</random>" → "/1 /2"
 */
function formatRandomTagsForDisplay(text) {
    // <random>...</random> 태그를 /... 형태로 변환
    return text.replace(/<random>([\s\S]*?)<\/random>/g, '/$1');
}

/**
 * <random>내용</random> 태그를 처리하여 랜덤으로 하나 선택
 * 예: "<random>1</random>\n<random>2</random>\n<random>3</random>"
 *     → "2" (랜덤 선택)
 */
function processRandomTags(text) {
    // <random>...</random> 패턴 찾기
    const randomPattern = /<random>([\s\S]*?)<\/random>/g;

    // 모든 매치 수집
    const matches = [];
    let match;
    while ((match = randomPattern.exec(text)) !== null) {
        matches.push({
            fullMatch: match[0],
            content: match[1],
            index: match.index
        });
    }

    // 랜덤 태그가 없으면 원본 반환
    if (matches.length === 0) {
        return text;
    }

    // 랜덤으로 하나 선택
    const randomIndex = Math.floor(Math.random() * matches.length);
    const selectedContent = matches[randomIndex].content;

    // 모든 <random>...</random> 태그와 그 사이의 공백/줄바꿈 제거하고 선택된 내용으로 대체
    // 첫 번째 태그부터 마지막 태그까지의 전체 영역을 선택된 내용으로 교체
    const firstMatch = matches[0];
    const lastMatch = matches[matches.length - 1];
    const startIndex = firstMatch.index;
    const endIndex = lastMatch.index + lastMatch.fullMatch.length;

    const before = text.substring(0, startIndex);
    const after = text.substring(endIndex);

    return before + selectedContent + after;
}

// ============================================================
// 템플릿 치환 기능 유틸
// ============================================================


  
// ============================================================
// 템플릿 치환 기능 (붙여넣기 감지)
// ============================================================

/**
 * 붙여넣기 시 템플릿 변수 자동 치환
 * capture phase에서 먼저 가로채고 클립보드 자체를 수정
 */
  
function initPasteTemplateHandler() {
    document.addEventListener('paste', (e) => {
        // 1. 현재 포커스된 요소를 직접 사용 (ID 검색보다 안전)
        const editor = document.activeElement;
        
        // 에디터 확인 (ID가 ChattingMessageRichEditor인지 확인)
        if (!editor || editor.id !== 'ChattingMessageRichEditor') return;
        
        const clipboardText = e.clipboardData.getData('text');
        
        // 템플릿 변수가 없으면 기본 동작
        if (!clipboardText.includes('{{')) return;
        
        // ★ 수정: getTemplateVariables에 editor를 전달하여 현재 채팅방 정보를 정확히 가져오게 함
        const variables = getTemplateVariables(editor);
        
        // 치환 실행
        const replacedText = replaceTemplateVariables(clipboardText, variables);
        
        // 변경된 것이 없으면 기본 동작
        if (replacedText === clipboardText) return;
        
        // 2. 기본 동작 차단 (치환이 확실할 때만)
        e.preventDefault();
        e.stopPropagation();
        
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            
            // 3. 텍스트를 줄 단위로 분리
            const lines = replacedText.split(/\r?\n/);
            const fragment = document.createDocumentFragment();
            let lastNode = null; // 마지막으로 삽입된 노드를 추적
            
            lines.forEach((line, index) => {
                // 텍스트 내용 삽입
                if (line) {
                    lastNode = document.createTextNode(line);
                    fragment.appendChild(lastNode);
                }
                // 줄바꿈 위치에 실제 <br> 태그 삽입
                if (index < lines.length - 1) {
                    lastNode = document.createElement('br');
                    fragment.appendChild(lastNode);
                }
            });
            
            // 4. 에디터에 직접 주입
            range.insertNode(fragment);
            
            // 5. 커서를 마지막 삽입된 노드 뒤로 이동
            if (lastNode) {
                range.setStartAfter(lastNode);
                range.setEndAfter(lastNode);
                selection.removeAllRanges();
                selection.addRange(range);
            }
            
        }
        
        // 6. 에디터에 변경 사실 알림
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        
        // 치환 완료 알림
        const replacedCount = (clipboardText.match(/\{\{/g) || []).length;
        if (replacedCount > 0) {
            showToast(`템플릿 적용! (${replacedCount}개 변수 치환됨)`, 'success');
        }
    }, true);
}
/**
 * 에디터 외 다른 요소에서의 붙여넣기 처리
 */
function handlePasteInOtherElements(e) {
    const activeElement = document.activeElement;

    if (!isEditableElement(activeElement)) return;

    // 템플릿 모달(추가/수정 폼) 내부에서는 치환하지 않음
    const templateModal = document.getElementById('template-modal');
    if (templateModal && templateModal.contains(activeElement)) {
        return; // 기본 붙여넣기 동작 유지
    }

    const clipboardText = e.clipboardData.getData('text');

    if (!clipboardText.includes('{{')) return;

    const variables = getTemplateVariables(activeElement);
    const replacedText = replaceTemplateVariables(clipboardText, variables);

    if (replacedText === clipboardText) return;

    e.preventDefault();

    if (activeElement.isContentEditable || activeElement.getAttribute('role') === 'textbox') {
        document.execCommand('insertText', false, replacedText);
    } else {
        const start = activeElement.selectionStart;
        const end = activeElement.selectionEnd;
        const value = activeElement.value;
        activeElement.value = value.substring(0, start) + replacedText + value.substring(end);
        activeElement.selectionStart = activeElement.selectionEnd = start + replacedText.length;
    }

    const replacedCount = (clipboardText.match(/\{\{\w+\}\}/g) || []).length -
        (replacedText.match(/\{\{\w+\}\}/g) || []).length;

    if (replacedCount > 0) {
        showToast(`템플릿 적용! (${replacedCount}개 변수 치환됨)`, 'success');
    }
}

// ============================================================
// 템플릿 관리 UI
// ============================================================

let templatePanelOpen = false;

/**
 * 템플릿 버튼 주입 (글자 크기 버튼 옆에)
 */
function injectTemplateButton() {
    // 1. 이미 버튼이 생성되었으면 중단
    if (document.getElementById('template-btn-container')) return;

    // 2. 타겟 위치 찾기: "채팅방 정렬" 버튼 찾기
    // ID가 없으므로 모든 버튼 중 텍스트가 '채팅방 정렬'인 것을 찾습니다.
    const allButtons = Array.from(document.querySelectorAll('button'));
    const targetButton = allButtons.find(btn => btn.textContent.trim() === '채팅방 정렬');

    // 3. 타겟이 아직 로드되지 않았으면 0.5초 뒤 재시도 (로그 출력)
    if (!targetButton) {
        // console.log('템플릿 버튼 위치 찾는 중... (채팅방 정렬 버튼 대기)');
        setTimeout(injectTemplateButton, 500);
        return;
    }

    // 4. 부모 컨테이너 확인
    const buttonGroup = targetButton.parentElement;
    if (!buttonGroup) return;

    // 5. 템플릿 버튼 컨테이너 생성
    const templateBtnContainer = document.createElement('div');
    templateBtnContainer.id = 'template-btn-container';
    templateBtnContainer.style.position = 'relative';
    templateBtnContainer.style.display = 'inline-flex';

    // 6. 템플릿 버튼 생성 (기존 버튼과 동일한 클래스 적용하여 디자인 통일)
    const templateBtn = document.createElement('button');
    templateBtn.id = 'template-btn';
    // 사이트의 원래 버튼 클래스를 그대로 복사
    templateBtn.className = 'button__root button__root--size_xSmall button__root--variant_text button__root--color_primary button__root--selected_false button__root--strong_false button__root--fullWidth_false c_common.10 hover:bg_common.a1 active:after:op_100';
    templateBtn.setAttribute('type', 'button');
    templateBtn.textContent = '템플릿 관리'; // innerHTML 대신 textContent 권장

    // 버튼 클릭 이벤트
    templateBtn.addEventListener('click', function (e) {
        e.preventDefault();
        console.log("템플릿 관리 버튼 클릭됨");
        toggleTemplatePanel(); // 패널 열기 함수 호출
    });

    templateBtnContainer.appendChild(templateBtn);

    // 7. "채팅방 정렬" 버튼 바로 앞에 삽입
    buttonGroup.insertBefore(templateBtnContainer, targetButton);

    console.log('%c[성공] 템플릿 관리 버튼이 생성되었습니다.', 'color: green; font-weight: bold;');
}

// 스크립트 로드 시 실행 (혹은 document ready 후 실행)
injectTemplateButton();

/**
 * 입력창 옆에 미니 템플릿 버튼 주입
 */
function injectInputTemplateButton() {
    // 모든 send-message-button-group 찾기 (여러 채팅창 지원)
    const buttonGroups = document.querySelectorAll('div[role="send-message-button-group"]');

    buttonGroups.forEach(group => {
        // 이미 버튼이 있으면 스킵
        if (group.querySelector('#input-template-btn, .input-template-btn')) return;

        // 이모티콘 버튼 찾기: 원형 얼굴 SVG path로 찾기
        const buttons = group.querySelectorAll('button');
        let emojiBtn = null;

        for (const btn of buttons) {
            // 이모티콘 버튼의 SVG는 원형(21.5 12)과 얼굴 특징을 가짐
            const svg = btn.querySelector('svg');
            if (svg) {
                const pathD = svg.innerHTML;
                // 이모티콘 버튼 특징: 원형 + 눈(M9 9, M14 10) + 입(M10.036 14)
                if (pathD.includes('21.5 12') && pathD.includes('M9 9') && pathD.includes('M14 10')) {
                    emojiBtn = btn;
                    break;
                }
            }
        }

        if (!emojiBtn) return;

        // 템플릿 버튼 생성
        const btn = document.createElement('button');
        btn.className = 'input-template-btn ' + emojiBtn.className;
        btn.innerHTML = `
            <img src="${chrome.runtime.getURL('icon/text-copy.svg')}" 
                alt="" 
                width="24" 
                height="24" />
        `;
        btn.title = '빠른 템플릿';
        btn.setAttribute('type', 'button');
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleMiniTemplatePanel(e);
        });

        // 이모티콘 버튼 뒤에 삽입
        emojiBtn.insertAdjacentElement('afterend', btn);
    });
}

// 현재 활성화된 채팅 컨테이너 저장
let activeChatContainerForMiniPanel = null;

/**
 * 활성 채팅 컨테이너 찾기
 */
function findActiveChatContainer() {
    return activeChatContainerForMiniPanel || document.querySelector('.chat-container');
}

/**
 * 미니 템플릿 패널 토글 (입력창 전용)
 */
async function toggleMiniTemplatePanel(e) {
    if (e) e.stopPropagation();

    const existingPanel = document.getElementById('mini-template-panel');

    if (existingPanel) {
        existingPanel.style.animation = 'miniPanelOut 0.15s ease-in forwards';
        setTimeout(() => existingPanel.remove(), 150);
        activeChatContainerForMiniPanel = null;
        return;
    }

    // 클릭된 버튼 또는 가장 가까운 템플릿 버튼 찾기
    const btn = e?.target?.closest('.input-template-btn') || document.querySelector('.input-template-btn');
    const btnRect = btn ? btn.getBoundingClientRect() : null;

    // 버튼이 속한 채팅 컨테이너 저장 (입력창을 포함하는 상위 요소)
    // send-message-button-group -> 상위로 올라가서 입력창 영역 찾기
    const buttonGroup = btn?.closest('div[role="send-message-button-group"]');
    if (buttonGroup) {
        // 버튼 그룹의 부모들 중 입력창을 포함하는 요소 찾기
        let parent = buttonGroup.parentElement;
        while (parent && parent !== document.body) {
            if (parent.querySelector('#ChattingMessageRichEditor')) {
                activeChatContainerForMiniPanel = parent;
                break;
            }
            parent = parent.parentElement;
        }
    }

    // 못 찾았으면 버튼 기준으로 가장 가까운 채팅 영역
    if (!activeChatContainerForMiniPanel) {
        activeChatContainerForMiniPanel = btn?.closest('.chat-container') ||
            btn?.closest('[class*="bd-t_0.5px"]')?.parentElement;
    }

    await renderMiniTemplatePanel(btnRect);
}

/**
 * 미니 템플릿 패널 렌더링 (Ant Design 스타일)
 */
async function renderMiniTemplatePanel(anchorRect) {
    const oldPanel = document.getElementById('mini-template-panel');
    if (oldPanel) oldPanel.remove();

    const templates = await getTemplates();

    const panel = document.createElement('div');
    panel.id = 'mini-template-panel';

    // Ant Design 스타일 + 위쪽 방향으로 열림
    panel.style.cssText = `
        position: fixed;
        width: 320px;
        max-height: 360px;
        background: #fff;
        border-radius: 8px;
        box-shadow: 0 6px 16px 0 rgba(0, 0, 0, 0.08),
                    0 3px 6px -4px rgba(0, 0, 0, 0.12),
                    0 9px 28px 8px rgba(0, 0, 0, 0.05);
        z-index: 99999;
        overflow: hidden;
        animation: miniPanelIn 0.15s ease-out;
    `;

    // 위치 계산 (버튼 위쪽으로 열림, 화면 밖으로 나가지 않도록)
    if (anchorRect) {
        const panelWidth = 320;
        const panelHeight = 360;
        const margin = 8;

        // bottom 계산 (버튼 위쪽)
        let bottomPos = window.innerHeight - anchorRect.top + margin;

        // right 계산 (버튼 기준)
        let rightPos = window.innerWidth - anchorRect.right;

        // 화면 왼쪽으로 넘어가는지 확인
        const leftEdge = window.innerWidth - rightPos - panelWidth;
        if (leftEdge < margin) {
            rightPos = window.innerWidth - panelWidth - margin;
        }

        // 화면 오른쪽으로 넘어가는지 확인
        if (rightPos < margin) {
            rightPos = margin;
        }

        // 화면 위쪽으로 넘어가는지 확인 (위로 열 공간이 부족하면 아래로)
        if (bottomPos + panelHeight > window.innerHeight - margin) {
            // 아래쪽으로 열기
            panel.style.top = `${anchorRect.bottom + margin}px`;
            panel.style.bottom = 'auto';
        } else {
            panel.style.bottom = `${bottomPos}px`;
        }

        panel.style.right = `${rightPos}px`;
    }

    // 애니메이션 스타일
    if (!document.getElementById('mini-panel-animation-style')) {
        const style = document.createElement('style');
        style.id = 'mini-panel-animation-style';
        style.textContent = `
            @keyframes miniPanelIn {
                from { transform: translateY(8px) scale(0.95); opacity: 0; }
                to { transform: translateY(0) scale(1); opacity: 1; }
            }
            @keyframes miniPanelOut {
                from { transform: translateY(0) scale(1); opacity: 1; }
                to { transform: translateY(8px) scale(0.95); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    // 템플릿 목록
    const listContainer = document.createElement('div');
    listContainer.style.cssText = `
        max-height: 300px;
        overflow-y: auto;
    `;

    if (templates.length === 0) {
        listContainer.innerHTML = `
            <div style="padding: 32px 16px; text-align: center; color: #333; font-size: 13px;">
                등록된 템플릿이 없습니다.
            </div>
        `;
    } else {
        templates.forEach(template => {
            const item = createMiniTemplateItem(template);
            listContainer.appendChild(item);
        });
    }

    panel.appendChild(listContainer);
    document.body.appendChild(panel);

    // 패널 포커스 (단축키 감지를 위해)
    panel.setAttribute('tabindex', '-1');
    panel.focus();

    // 단축키 핸들러 추가
    const shortcutHandler = createMiniPanelShortcutHandler(templates);
    document.addEventListener('keydown', shortcutHandler);
    panel.dataset.shortcutHandlerActive = 'true';

    // 패널 외부 클릭 시 닫기
    setTimeout(() => {
        document.addEventListener('click', handleMiniPanelOutsideClick);
    }, 50);
}

/**
 * 미니 패널 단축키 핸들러 생성
 */
function createMiniPanelShortcutHandler(templates) {
    const handler = async (e) => {
        const panel = document.getElementById('mini-template-panel');
        if (!panel) {
            document.removeEventListener('keydown', handler);
            return;
        }

        // ESC로 패널 닫기
        if (e.key === 'Escape') {
            panel.style.animation = 'miniPanelOut 0.15s ease-in forwards';
            setTimeout(() => panel.remove(), 150);
            document.removeEventListener('keydown', handler);
            document.removeEventListener('click', handleMiniPanelOutsideClick);
            return;
        }

        // 단축키로 템플릿 복사
        const key = e.key.toUpperCase();
        const matchedTemplate = templates.find(t => t.shortcut && t.shortcut.toUpperCase() === key);

        if (matchedTemplate) {
            e.preventDefault();
            e.stopPropagation();

            // 랜덤 태그 처리 + 줄바꿈을 Carriage Return으로 변환 (soft break 시도)
            const textToCopy = processRandomTags(matchedTemplate.text);

            try {
                await navigator.clipboard.writeText(textToCopy);
            } catch (err) {
                const textarea = document.createElement('textarea');
                textarea.value = textToCopy;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }

            // 패널 닫기
            panel.style.animation = 'miniPanelOut 0.15s ease-in forwards';
            setTimeout(() => panel.remove(), 150);
            document.removeEventListener('keydown', handler);
            document.removeEventListener('click', handleMiniPanelOutsideClick);

            // 입력창 포커스
            setTimeout(() => {
                let inputEditor = null;

                if (activeChatContainerForMiniPanel) {
                    inputEditor = activeChatContainerForMiniPanel.querySelector('#ChattingMessageRichEditor') ||
                        activeChatContainerForMiniPanel.querySelector('[contenteditable="true"]');
                }

                if (!inputEditor) {
                    inputEditor = document.querySelector('#ChattingMessageRichEditor') ||
                        document.querySelector('div[role="textbox"] [contenteditable="true"]');
                }

                if (inputEditor) {
                    inputEditor.focus();
                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(inputEditor);
                    range.collapse(false);
                    selection.removeAllRanges();
                    selection.addRange(range);
                }

                activeChatContainerForMiniPanel = null;
            }, 100);

            showToast(`[${key}] 복사 완료! Ctrl+V로 붙여넣기 하세요.`, 'success');
        }
    };

    return handler;
}

/**
 * 미니 패널 외부 클릭 핸들러
 */
function handleMiniPanelOutsideClick(e) {
    const panel = document.getElementById('mini-template-panel');
    const clickedBtn = e.target.closest('.input-template-btn');

    if (panel && !panel.contains(e.target) && !clickedBtn) {
        panel.style.animation = 'miniPanelOut 0.15s ease-in forwards';
        setTimeout(() => panel.remove(), 150);
        document.removeEventListener('click', handleMiniPanelOutsideClick);
    }
}

/**
 * 미니 템플릿 아이템 생성 (컴팩트 + Antd 스타일)
 */
function createMiniTemplateItem(template) {
    const item = document.createElement('div');
    item.style.cssText = `
        padding: 10px 16px;
        border-bottom: 1px solid #f5f5f5;
        cursor: pointer;
        transition: background 0.1s;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
    `;

    // 랜덤 태그를 /형태로 변환 후 변수 하이라이트
    const displayText = formatRandomTagsForDisplay(template.text);
    const highlightedText = escapeHtml(displayText).replace(
        /\{\{([\w.]+)\}\}/g,
        '<span style="color:#1890ff;font-weight:500;">{{$1}}</span>'
    );

    // 단축키 표시
    const shortcutBadge = template.shortcut
        ? `<span style="background:#e8e8ff;color:#667eea;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-left:6px;">${template.shortcut}</span>`
        : '';

    item.innerHTML = `
        <div style="flex: 1; min-width: 0;">
          <div style="display:flex; align-items:center; gap:6px; min-width:0;">
            <!-- ✅ 여기: 제목줄 레이아웃 수정 -->
                <div style="
                font-weight:600; color:#333; font-size:12px;
                min-width:0; flex:0 1 auto;
                white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
                ">${escapeHtml(template.name)}</div>

                ${template.shortcut ? `
                <span style="
                    flex:0 0 auto;
                    background:#e8e8ff; color:#667eea;
                    padding:2px 6px; border-radius:4px;
                    font-size:10px; font-weight:600;
                    white-space:nowrap;
                ">${escapeHtml(template.shortcut)}</span>
                ` : ''}
          </div>
      
          <div style="
            font-size: 12px;
            color: #333;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          ">${highlightedText}</div>
        </div>
      
        <button class="mini-copy-btn" style="
          flex-shrink: 0;
          background: rgba(0,0,0,0.08);
          border: none;
          padding: 4px;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.1s;
          white-space: nowrap;
        ">
          <img src="${chrome.runtime.getURL('icon/copy.svg')}" alt="" width="20" height="20" />
        </button>
      `;

    item.onmouseenter = () => {
        item.style.background = 'rgba(0,0,0,0.08)';
    };
    item.onmouseleave = () => {
        item.style.background = 'rgba(0,0,0,0)';
    };

    // 복사 버튼 hover
    const copyBtn = item.querySelector('.mini-copy-btn');
    copyBtn.onmouseenter = () => copyBtn.style.background = 'rgba(0,0,0,0.12)';
    copyBtn.onmouseleave = () => copyBtn.style.background = 'rgba(0,0,0,0.08)';

    // 복사 버튼 클릭
    copyBtn.onclick = async (e) => {
        e.stopPropagation();

        // 복사 전에 입력창 찾아두기 (패널이 속한 채팅방)
        const panel = document.getElementById('mini-template-panel');
        const chatContainer = panel?.closest('.chat-container') ||
            document.querySelector('.chat-container:has(.input-template-btn)') ||
            findActiveChatContainer();

        // 랜덤 태그 처리
        // 랜덤 태그 처리 + 줄바꿈을 Carriage Return으로 변환 (soft break 시도)
        const textToCopy = processRandomTags(template.text);

        try {
            await navigator.clipboard.writeText(textToCopy);
            afterCopyAction(chatContainer);
        } catch (err) {
            const textarea = document.createElement('textarea');
            textarea.value = textToCopy;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            afterCopyAction(chatContainer);
        }
    };

    // 복사 후 동작: 패널 닫기 + 입력창 포커스
    function afterCopyAction() {
        // 1. 패널 닫기
        const panel = document.getElementById('mini-template-panel');
        if (panel) {
            panel.style.animation = 'miniPanelOut 0.15s ease-in forwards';
            setTimeout(() => panel.remove(), 150);
            document.removeEventListener('click', handleMiniPanelOutsideClick);
        }

        // 2. 입력창 포커스 (저장해둔 채팅 컨테이너에서 찾기)
        setTimeout(() => {
            let inputEditor = null;

            // 저장된 컨테이너에서 입력창 찾기
            if (activeChatContainerForMiniPanel) {
                inputEditor = activeChatContainerForMiniPanel.querySelector('#ChattingMessageRichEditor') ||
                    activeChatContainerForMiniPanel.querySelector('[contenteditable="true"]');
            }

            // 못 찾으면 전체에서 찾기
            if (!inputEditor) {
                inputEditor = document.querySelector('#ChattingMessageRichEditor') ||
                    document.querySelector('div[role="textbox"] [contenteditable="true"]');
            }

            if (inputEditor) {
                inputEditor.focus();
                // 커서를 맨 끝으로 이동
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(inputEditor);
                range.collapse(false); // false = 끝으로
                selection.removeAllRanges();
                selection.addRange(range);
            }

            // 컨테이너 초기화
            activeChatContainerForMiniPanel = null;
        }, 100);

        // 3. 토스트
        showToast('복사 완료! Ctrl+V로 붙여넣기 하세요.', 'success');
    }

    // 아이템 전체 클릭해도 복사
    item.onclick = (e) => {
        if (!e.target.classList.contains('mini-copy-btn')) {
            copyBtn.click();
        }
    };

    return item;
}

// 템플릿 패널 위치 저장 (재렌더링 시 사용)
let savedPanelStyle = null;

/**
 * 템플릿 패널 토글
 */
async function toggleTemplatePanel(e, fromInput = false) {
    if (e) {
        e.stopPropagation();
    }

    const existingPanel = document.getElementById('template-panel');

    if (existingPanel) {
        existingPanel.style.animation = 'slideOutPanel 0.3s ease-in forwards';
        setTimeout(() => existingPanel.remove(), 300);
        templatePanelOpen = false;
        savedPanelStyle = null; // 위치 초기화
        document.removeEventListener('click', handlePanelOutsideClick);
        return;
    }

    templatePanelOpen = true;

    // 버튼 위치 기준으로 패널 위치 계산
    let anchorRect = null;
    if (fromInput) {
        const inputBtn = document.getElementById('input-template-btn');
        if (inputBtn) anchorRect = inputBtn.getBoundingClientRect();
    } else {
        const templateBtn = document.getElementById('template-btn');
        if (templateBtn) anchorRect = templateBtn.getBoundingClientRect();
    }

    // 위치 스타일 계산 및 저장
    if (anchorRect) {
        if (fromInput) {
            savedPanelStyle = {
                bottom: `${window.innerHeight - anchorRect.top + 8}px`,
                right: `${window.innerWidth - anchorRect.right}px`,
                top: 'auto',
                left: 'auto'
            };
        } else {
            savedPanelStyle = {
                top: `${anchorRect.bottom + 8}px`,
                left: `${anchorRect.left}px`,
                bottom: 'auto',
                right: 'auto'
            };
        }
    }

    await renderTemplatePanel();
}

/**
 * 템플릿 패널 렌더링
 */
async function renderTemplatePanel() {
    // 기존 패널 제거 (애니메이션 없이)
    const oldPanel = document.getElementById('template-panel');
    const isRerender = !!oldPanel;
    if (oldPanel) oldPanel.remove();

    const templates = await getTemplates();
    const variables = getTemplateVariables();

    const panel = document.createElement('div');
    panel.id = 'template-panel';

    // 기본 스타일 (재렌더링 시 애니메이션 제거)
    panel.style.cssText = `
        position: fixed;
        width: 340px;
        max-height: 450px;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        z-index: 99999;
        overflow: hidden;
        ${isRerender ? '' : 'animation: slideInPanel 0.1s ease-out;'}
    `;

    // 저장된 위치 적용
    if (savedPanelStyle) {
        panel.style.top = savedPanelStyle.top;
        panel.style.left = savedPanelStyle.left;
        panel.style.bottom = savedPanelStyle.bottom;
        panel.style.right = savedPanelStyle.right;
    } else {
        // fallback
        panel.style.top = '60px';
        panel.style.left = '200px';
    }

    // 애니메이션 스타일
    if (!document.getElementById('panel-animation-style')) {
        const style = document.createElement('style');
        style.id = 'panel-animation-style';
        style.textContent = `
            @keyframes slideInPanel {
                from { transform: translateY(10px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            @keyframes slideOutPanel {
                from { transform: translateY(0); opacity: 1; }
                to { transform: translateY(10px); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    // 헤더
    const header = document.createElement('div');
    header.style.cssText = `
        background: #fff;
        color: #333;
        padding: 8px 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom:0.5px solid #f0f0f0;
    `;

    header.innerHTML = `
        <div style="font-weight: 600; font-size: .875rem;">템플릿 관리</div>
        <div style="display: flex; gap: 6px; align-items: center;">
            <button id="template-import-btn" style="
                background: rgba(0, 0, 0, 0.08);
                border: none;
                color: #333;
                padding: 4px;
                border-radius: 6px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
            " title="템플릿 업로드"><img src="${chrome.runtime.getURL('icon/upload.svg')}" alt="" width="16" height="16" /></button>
            <button id="template-export-btn" style="
                background: rgba(0, 0, 0, 0.08);
                border: none;
                color: #333;
                padding: 4px;
                border-radius: 6px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
            " title="템플릿 다운로드"><img src="${chrome.runtime.getURL('icon/download.svg')}" alt="" width="16" height="16" /></button>
            <button id="template-add-btn" style="
                background: rgba(0, 0, 0, 0.08);
                border: none;
                color: #000;
                padding: 4px 8px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
            "><img src="${chrome.runtime.getURL('icon/add.svg')}" alt="" width="16" height="16" /><span class="sr-only">추가</span></button>
            <button id="template-close-btn" style="
                background: rgba(0,0,0,0.08);
                border: none;
                color: #333;
                padding: 4px;
                border-radius: 6px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
            "><img src="${chrome.runtime.getURL('icon/close.svg')}" alt="" width="16" height="16" /></button>
        </div>
    `;
    panel.appendChild(header);

    // 템플릿 목록
    const listContainer = document.createElement('div');
    listContainer.id = 'template-list';
    listContainer.style.cssText = `
        max-height: 300px;
        overflow-y: auto;
        padding: 6px 0;
    `;

    templates.forEach(template => {
        const item = createTemplateItem(template, variables);
        listContainer.appendChild(item);
    });

    if (templates.length === 0) {
        listContainer.innerHTML = `
            <div style="padding: 30px 16px; text-align: center; color: #999; font-size: 13px;">
                템플릿이 없습니다.<br>"+ 추가" 버튼을 눌러 추가해보세요!
            </div>
        `;
    }

    panel.appendChild(listContainer);
    document.body.appendChild(panel);

    // 이벤트
    document.getElementById('template-add-btn').onclick = (e) => {
        e.stopPropagation();
        showAddTemplateForm();
    };
    document.getElementById('template-close-btn').onclick = (e) => {
        e.stopPropagation();
        toggleTemplatePanel();
    };
    document.getElementById('template-export-btn').onclick = (e) => {
        e.stopPropagation();
        exportTemplates();
    };
    document.getElementById('template-import-btn').onclick = (e) => {
        e.stopPropagation();
        importTemplates();
    };

    // 패널 외부 클릭 시 닫기
    setTimeout(() => {
        document.addEventListener('click', handlePanelOutsideClick);
    }, 100);
}

function handlePanelOutsideClick(e) {
    const panel = document.getElementById('template-panel');
    const templateBtn = document.getElementById('template-btn');
    const inputBtn = document.getElementById('input-template-btn');
    const modal = document.getElementById('template-modal');

    // 모달이 열려있으면 무시
    if (modal) return;

    if (panel && !panel.contains(e.target) &&
        e.target !== templateBtn && e.target !== inputBtn &&
        !templateBtn?.contains(e.target) && !inputBtn?.contains(e.target)) {
        toggleTemplatePanel();
        document.removeEventListener('click', handlePanelOutsideClick);
    }
}

/**
 * 템플릿 내보내기 (JSON 파일 다운로드)
 */
async function exportTemplates() {
    const templates = await getTemplates();

    const exportData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        templates: templates
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `templates_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`${templates.length}개 템플릿을 내보냈습니다!`, 'success');
}

/**
 * 업로드 선택 다이얼로그 표시
 */
function showImportChoiceDialog(existingCount, importCount, onChoice) {
    const existingModal = document.getElementById('import-choice-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'import-choice-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5);
        z-index: 99999999;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    modal.innerHTML = `
        <div style="
            background: white;
            border-radius: 16px;
            width: 340px;
            padding: 24px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        ">
            <h3 style="margin: 0 0 12px 0; color: #333; font-size: 16px; font-weight: 700;">템플릿 업로드</h3>
            <p style="margin: 0 0 20px 0; color: #666; font-size: 13px; line-height: 1.6;">
                현재 <strong>${existingCount}개</strong>의 템플릿이 있습니다.<br>
                가져올 템플릿: <strong>${importCount}개</strong>
            </p>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <button id="import-add-btn" style="
                    padding: 12px 16px;
                    border: 1px solid #ddd;
                    background: white;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 13px;
                    text-align: left;
                    transition: background 0.1s;
                ">
                    <strong style="color: #1890ff;">새로 추가</strong>
                    <div style="color: #888; font-size: 11px; margin-top: 4px;">기존 ${existingCount}개 + 새로운 ${importCount}개</div>
                </button>
                <button id="import-replace-btn" style="
                    padding: 12px 16px;
                    border: 1px solid #ddd;
                    background: white;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 13px;
                    text-align: left;
                    transition: background 0.1s;
                ">
                    <strong style="color: #f5222d;">기존 삭제 및 교체</strong>
                    <div style="color: #888; font-size: 11px; margin-top: 4px;">기존 ${existingCount}개 삭제 → ${importCount}개로 교체</div>
                </button>
                <button id="import-cancel-btn" style="
                    padding: 10px 16px;
                    border: none;
                    background: #f5f5f5;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 13px;
                    color: #666;
                ">취소</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // 이벤트
    document.getElementById('import-add-btn').onclick = () => {
        modal.remove();
        onChoice('add');
    };
    document.getElementById('import-replace-btn').onclick = () => {
        modal.remove();
        onChoice('replace');
    };
    document.getElementById('import-cancel-btn').onclick = () => {
        modal.remove();
        onChoice('cancel');
    };
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.remove();
            onChoice('cancel');
        }
    };

    // 버튼 hover 효과
    const addBtn = document.getElementById('import-add-btn');
    const replaceBtn = document.getElementById('import-replace-btn');
    addBtn.onmouseenter = () => addBtn.style.background = '#f0f7ff';
    addBtn.onmouseleave = () => addBtn.style.background = 'white';
    replaceBtn.onmouseenter = () => replaceBtn.style.background = '#fff2f0';
    replaceBtn.onmouseleave = () => replaceBtn.style.background = 'white';
}

/**
 * 템플릿 업로드 (JSON 파일 업로드)
 */
function importTemplates() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            // 데이터 검증
            let templates = [];

            // 새 형식 (version 포함)
            if (data.version && data.templates) {
                templates = data.templates;
            }
            // 구 형식 (배열 직접)
            else if (Array.isArray(data)) {
                templates = data;
            } else {
                throw new Error('올바른 템플릿 파일 형식이 아닙니다.');
            }

            // 템플릿 유효성 검사
            if (!templates.every(t => t.name && t.text)) {
                throw new Error('일부 템플릿에 필수 필드(name, text)가 없습니다.');
            }

            // 기존 템플릿과 병합할지 덮어쓸지 확인
            const existingTemplates = await getTemplates();

            if (existingTemplates.length > 0) {
                // 커스텀 다이얼로그 표시
                showImportChoiceDialog(existingTemplates.length, templates.length, async (choice) => {
                    if (choice === 'add') {
                        // 병합: 새 ID 부여
                        const maxId = Math.max(...existingTemplates.map(t => t.id), 0);
                        const newTemplates = templates.map((t, i) => ({
                            ...t,
                            id: maxId + i + 1
                        }));
                        await saveTemplates([...existingTemplates, ...newTemplates]);
                        showToast(`${templates.length}개 템플릿을 추가했습니다!`, 'success');
                    } else if (choice === 'replace') {
                        // 덮어쓰기: ID 재부여
                        const newTemplates = templates.map((t, i) => ({
                            ...t,
                            id: i + 1
                        }));
                        await saveTemplates(newTemplates);
                        showToast(`${templates.length}개 템플릿으로 교체했습니다!`, 'success');
                    }
                    // 패널 새로고침
                    await renderTemplatePanel();
                });
            } else {
                // 기존 템플릿이 없으면 바로 업로드
                const newTemplates = templates.map((t, i) => ({
                    ...t,
                    id: i + 1
                }));
                await saveTemplates(newTemplates);
                showToast(`${templates.length}개 템플릿을 가져왔습니다!`, 'success');
                await renderTemplatePanel();
            }

        } catch (err) {
            console.error('템플릿 업로드 오류:', err);
            alert('템플릿 업로드 실패: ' + err.message);
        }
    };

    input.click();
}

/**
 * 템플릿 아이템 생성
 */
function createTemplateItem(template, variables) {
    const item = document.createElement('div');
    item.className = 'template-item';
    item.style.cssText = `
        padding: 10px 12px;
        transition: background 0.1s;
    `;

    // 원본 텍스트 그대로 표시 ({{name}} 등 변수 유지)
    const originalText = template.text;

    // 랜덤 태그를 /형태로 변환 후 변수 하이라이트
    const displayText = formatRandomTagsForDisplay(template.text);
    const highlightedText = escapeHtml(displayText).replace(
        /\{\{([\w.]+)\}\}/g,
        '<span style="color:#1890ff;font-weight:500;">{{$1}}</span>'
    );

    // 단축키 표시
    const shortcutBadge = template.shortcut
        ? `<span style="background:#e8e8ff;color:#667eea;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-left:6px;">${template.shortcut}</span>`
        : '';

    item.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div style="flex:1; min-width:0;">
            <!-- ✅ 여기: 제목줄 레이아웃 수정 -->
            <div style="display:flex; align-items:center; gap:6px; min-width:0;">
                <div style="
                font-weight:600; color:#333; font-size:12px;
                min-width:0; flex:0 1 auto;
                white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
                ">${escapeHtml(template.name)}</div>

                ${template.shortcut ? `
                <span style="
                    flex:0 0 auto;
                    background:#e8e8ff; color:#667eea;
                    padding:2px 6px; border-radius:4px;
                    font-size:10px; font-weight:600;
                    white-space:nowrap;
                ">${escapeHtml(template.shortcut)}</span>
                ` : ''}
            </div>
      
            <div style="
              font-size:12px;
              color:#666;
              line-height:1.5;
              display:-webkit-box;
              -webkit-line-clamp:2;
              -webkit-box-orient:vertical;
              overflow:hidden;
            ">${highlightedText}</div>
          </div>
      
          <div style="display:flex; gap:2px; flex-shrink:0;">
            <button class="template-copy-btn" style="background:#f0f0f0;border:none;cursor:pointer;padding:4px;border-radius:4px;" title="복사">
              <img src="${chrome.runtime.getURL('icon/copy.svg')}" alt="" width="16" height="16" />
            </button>
            <button class="template-edit-btn" data-id="${template.id}" style="background:#f0f0f0;border:none;cursor:pointer;padding:4px;border-radius:4px;" title="수정">
              <img src="${chrome.runtime.getURL('icon/edit.svg')}" alt="" width="16" height="16" />
            </button>
            <button class="template-delete-btn" data-id="${template.id}" style="background:#f0f0f0;border:none;cursor:pointer;padding:4px;border-radius:4px;" title="삭제">
              <img src="${chrome.runtime.getURL('icon/delete.svg')}" alt="" width="16" height="16" />
            </button>
          </div>
        </div>
      `;

    item.onmouseenter = () => item.style.background = '#f5f5f5';
    item.onmouseleave = () => item.style.background = 'transparent';

    // 복사 버튼 - 랜덤 태그 처리 후 복사 (붙여넣기 시 자동 치환됨)
    item.querySelector('.template-copy-btn').onclick = async (e) => {
        e.stopPropagation();

        // 랜덤 태그 처리 + 줄바꿈을 Carriage Return으로 변환 (soft break 시도)
        const textToCopy = processRandomTags(originalText);

        try {
            await navigator.clipboard.writeText(textToCopy);
            showToast('복사 완료! 붙여넣기하면 자동 치환됩니다.', 'success');
        } catch (err) {
            // fallback
            const textarea = document.createElement('textarea');
            textarea.value = textToCopy;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('복사 완료! 붙여넣기하면 자동 치환됩니다.', 'success');
        }
    };

    // 수정 버튼
    item.querySelector('.template-edit-btn').onclick = (e) => {
        e.stopPropagation();
        showEditTemplateForm(template);
    };

    // 삭제 버튼
    item.querySelector('.template-delete-btn').onclick = async (e) => {
        e.stopPropagation();
        if (confirm(`"${template.name}" 템플릿을 삭제할까요?`)) {
            await deleteTemplate(template.id);
            await renderTemplatePanel();
            showToast('템플릿이 삭제되었습니다.', 'info');
        }
    };

    return item;
}

/**
 * 템플릿 추가 폼 표시
 */
function showAddTemplateForm() {
    showTemplateForm(null, '새 템플릿 추가', async (name, text, shortcut) => {
        await addTemplate(name, text, shortcut);
        await renderTemplatePanel();
        showToast('새 템플릿이 추가되었습니다!', 'success');
    });
}

/**
 * 템플릿 수정 폼 표시
 */
function showEditTemplateForm(template) {
    showTemplateForm(template, '템플릿 수정', async (name, text, shortcut) => {
        await updateTemplate(template.id, name, text, shortcut);
        await renderTemplatePanel();
        showToast('템플릿이 수정되었습니다!', 'success');
    });
}

/**
 * 템플릿 입력 폼 (추가/수정 공용)
 */
function showTemplateForm(template, title, onSave) {
    const existingModal = document.getElementById('template-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'template-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5);
        z-index: 9999999;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    modal.innerHTML = `
        <div style="
            background: white;
            border-radius: 16px;
            width: 380px;
            padding: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        ">
            <h3 style="margin: 0 0 16px 0; color: #333; font-size: 16px; font-weight: 700;">${title}</h3>
            <div style="margin-bottom: 14px; display: flex; gap: 10px;">
                <div style="flex: 1;">
                    <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">템플릿 이름</label>
                    <input type="text" id="template-name-input" value="${template?.name || ''}" style="
                        width: 100%;
                        padding: 10px 12px;
                        border: 1px solid #ddd;
                        border-radius: 8px;
                        font-size: 14px;
                        box-sizing: border-box;
                    " placeholder="예: 📚 인사말">
                </div>
                <div style="width: 80px;">
                    <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">단축키</label>
                    <input type="text" id="template-shortcut-input" value="${template?.shortcut || ''}" maxlength="1" style="
                        width: 100%;
                        padding: 10px 12px;
                        border: 1px solid #ddd;
                        border-radius: 8px;
                        font-size: 14px;
                        box-sizing: border-box;
                        text-align: center;
                        text-transform: uppercase;
                    " placeholder="1">
                </div>
            </div>
            <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">템플릿 내용</label>
                <textarea id="template-text-input" style="
                    width: 100%;
                    height: 100px;
                    padding: 10px 12px;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    font-size: 14px;
                    resize: vertical;
                    box-sizing: border-box;
                    font-family: inherit;
                " placeholder="{{name.part.sweet}}, 안녕~">${template?.text || ''}</textarea>
            <details id="template-guide-details" style="background: #f8f9ff; border-radius: 8px; overflow: hidden;">
                <summary style="padding: 10px 14px; cursor: pointer; font-size: 12px; font-weight: 600; color: #333; user-select: none; display: flex; align-items: center; gap: 6px;">
                    <span style="transition: transform 0.1s;" id="guide-arrow">▶</span>
                    사용 가이드
                </summary>
                <div style="padding: 0 14px 12px 14px; font-size: 11px; color: #555; line-height: 1.8;">
                    <div style="margin-bottom: 10px;">
                        <strong style="color:#333;">📝 이름 변수:</strong><br>
                        <code style="background:#e8e8ff;padding:2px 6px;border-radius:3px;color:#667eea;">{{name.full}}</code> 이름 전체<br>
                        <code style="background:#e8e8ff;padding:2px 6px;border-radius:3px;color:#667eea;">{{name.part.hard}}</code> OO 학생<br>
                        <code style="background:#e8e8ff;padding:2px 6px;border-radius:3px;color:#667eea;">{{name.part.sweet}}</code> OO아 / OO야<br>
                        <code style="background:#e8e8ff;padding:2px 6px;border-radius:3px;color:#667eea;">{{name.part.plain}}</code> OO이 / OO
                    </div>
                    <div style="margin-bottom: 10px;">
                        <strong style="color:#333;">🎲 랜덤 문구:</strong><br>
                        <code style="background:#fff3e8;padding:2px 6px;border-radius:3px;color:#e67e22;">&lt;random&gt;문구1&lt;/random&gt;</code><br>
                        <code style="background:#fff3e8;padding:2px 6px;border-radius:3px;color:#e67e22;">&lt;random&gt;문구2&lt;/random&gt;</code><br>
                        <span style="color:#888;">→ 복사 시 문구1, 문구2 중 랜덤 선택</span>
                    </div>
                    <div>
                        <p><strong style="color:#333;">⌨️ 단축키:</strong><br> 미니 패널에서 키를 누르면 바로 복사됨.<br> 숫자/영문/기호 가능 (한글 안 됨)</p>
                    </div>
                </div>
            </details>
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button id="template-cancel-btn" style="
                    padding: 10px 18px;
                    border: 1px solid #ddd;
                    background: white;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 13px;
                ">취소</button>
                <button id="template-save-btn" style="
                    padding: 10px 18px;
                    border: none;
                    background: rgba(0,0,0,0.8);
                    color: #fff;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 13px;
                ">저장</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // 가이드 접기/펼치기 화살표 애니메이션
    const guideDetails = document.getElementById('template-guide-details');
    const guideArrow = document.getElementById('guide-arrow');
    if (guideDetails && guideArrow) {
        guideDetails.addEventListener('toggle', () => {
            guideArrow.style.transform = guideDetails.open ? 'rotate(90deg)' : 'rotate(0deg)';
        });
    }

    // 포커스
    document.getElementById('template-name-input').focus();

    // 취소
    document.getElementById('template-cancel-btn').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    // 저장
    document.getElementById('template-save-btn').onclick = () => {
        const name = document.getElementById('template-name-input').value.trim();
        const text = document.getElementById('template-text-input').value.trim();
        const shortcut = document.getElementById('template-shortcut-input').value.trim().toUpperCase();

        if (!name || !text) {
            alert('이름과 내용을 모두 입력해주세요.');
            return;
        }

        onSave(name, text, shortcut);
        modal.remove();
    };

    // Enter 키로 저장 (textarea 제외)
    document.getElementById('template-name-input').onkeydown = (e) => {
        if (e.key === 'Enter') {
            document.getElementById('template-save-btn').click();
        }
    };
}

/**
 * HTML 이스케이프
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// 초기화
// ============================================================

initPasteTemplateHandler();

// 버튼 주입 (주기적으로 확인)
setInterval(() => {
    injectTemplateButton();
    injectInputTemplateButton();
}, 1000);


