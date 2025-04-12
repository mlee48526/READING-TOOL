const {
    eventSource,
    event_types,
    getCurrentChatId,
    getRequestHeaders,
    Popup,
} = SillyTavern.getContext();
import { addJQueryHighlight } from './jquery-highlight.js';
import { debounce, uuidv4 } from '../../../utils.js';
import { debounce_timeout } from '../../../constants.js';
import { t } from '../../../i18n.js';

// 메인 엘리먼트 참조
const sheld = /** @type {HTMLDivElement} */ (document.getElementById('sheld'));
const chat = /** @type {HTMLDivElement} */ (document.getElementById('chat'));
const movingDivs = /** @type {HTMLDivElement} */ (document.getElementById('movingDivs'));
const draggableTemplate = /** @type {HTMLTemplateElement} */ (document.getElementById('generic_draggable_template'));

// E북 뷰어 UI 요소
const eBookViewerBar = document.createElement('div');
const eBookSidebar = document.createElement('div');
const eBookToolbar = document.createElement('div');
const highlightsTab = document.createElement('div');
const notesTab = document.createElement('div');
const bookmarksTab = document.createElement('div');
const tabsContainer = document.createElement('div');

// 데이터 저장소
const eBookData = {
    highlights: {},
    notes: {},
    bookmarks: {},
    currentTab: 'highlights'
};

// 색상 팔레트
const colorPalette = [
    '#FFFF00', // 노랑
    '#90EE90', // 연두
    '#ADD8E6', // 연파랑
    '#FFB6C1', // 연분홍
    '#E6E6FA'  // 연보라
];

// 기본 색상 인덱스
let currentColorIndex = 0;

function createToolbarButton(id, icon, title, onClick) {
    const button = document.createElement('button');
    button.id = id;
    button.className = 'toolbar-button';
    button.title = title;

    const iconElement = document.createElement('i');
    iconElement.className = icon;
    button.appendChild(iconElement);

    button.addEventListener('click', onClick);
    return button;
}

function initEBookViewer() {
    // E북 툴바 초기화
    eBookToolbar.id = 'eBookToolbar';
    eBookToolbar.className = 'ebook-toolbar';

    // 툴바 버튼 추가
    const highlightButton = createToolbarButton(
        'highlightButton',
        'fa-solid fa-highlighter',
        t`Highlight selected text`,
        onHighlightClick
    );

    const noteButton = createToolbarButton(
        'noteButton',
        'fa-solid fa-sticky-note',
        t`Add note to selection`,
        onNoteClick
    );

    const bookmarkButton = createToolbarButton(
        'bookmarkButton',
        'fa-solid fa-bookmark',
        t`Add bookmark at current position`,
        onBookmarkClick
    );

    const colorButton = createToolbarButton(
        'colorButton',
        'fa-solid fa-palette',
        t`Change highlight color`,
        onColorClick
    );

    const sidebarButton = createToolbarButton(
        'sidebarButton',
        'fa-solid fa-columns',
        t`Toggle sidebar`,
        onSidebarToggle
    );

    // 색상 선택기 생성
    const colorSelector = document.createElement('div');
    colorSelector.id = 'colorSelector';
    colorSelector.className = 'color-selector';

    colorPalette.forEach((color, index) => {
        const colorOption = document.createElement('div');
        colorOption.className = 'color-option';
        colorOption.style.backgroundColor = color;
        colorOption.dataset.colorIndex = index.toString();
        colorOption.addEventListener('click', () => {
            currentColorIndex = index;
            document.querySelectorAll('.color-option').forEach(opt =>
                opt.classList.remove('selected'));
            colorOption.classList.add('selected');
            colorSelector.classList.remove('visible');
        });

        if (index === 0) {
            colorOption.classList.add('selected');
        }

        colorSelector.appendChild(colorOption);
    });

    colorButton.appendChild(colorSelector);

    // 툴바에 버튼 추가
    eBookToolbar.append(
        highlightButton,
        noteButton,
        bookmarkButton,
        colorButton,
        sidebarButton
    );

    // 사이드바 탭 초기화
    tabsContainer.className = 'ebook-tabs';

    // 하이라이트 탭
    highlightsTab.id = 'highlightsTab';
    highlightsTab.className = 'ebook-tab active';
    highlightsTab.textContent = t`Highlights`;
    highlightsTab.addEventListener('click', () => switchTab('highlights'));

    // 노트 탭
    notesTab.id = 'notesTab';
    notesTab.className = 'ebook-tab';
    notesTab.textContent = t`Notes`;
    notesTab.addEventListener('click', () => switchTab('notes'));

    // 북마크 탭
    bookmarksTab.id = 'bookmarksTab';
    bookmarksTab.className = 'ebook-tab';
    bookmarksTab.textContent = t`Bookmarks`;
    bookmarksTab.addEventListener('click', () => switchTab('bookmarks'));

    tabsContainer.append(highlightsTab, notesTab, bookmarksTab);

    // 사이드바 초기화
    initSidebar();

    // UI 요소 DOM에 추가
    sheld.insertBefore(eBookToolbar, chat);

    // 스타일 추가
    addEBookViewerStyles();

    // 이벤트 리스너 추가
    addTextSelectionListener();

    // 저장된 데이터 로드
    loadEBookData();

    // 데이터 변경 시 자동 저장
    eventSource.on(event_types.CHAT_CHANGED, saveEBookDataDebounced);
}

function initSidebar() {
    if (!draggableTemplate) {
        console.warn(t`Draggable template not found. Sidebar will not be added.`);
        return;
    }

    const fragment = /** @type {DocumentFragment} */ (draggableTemplate.content.cloneNode(true));
    const draggable = fragment.querySelector('.draggable');
    const closeButton = fragment.querySelector('.dragClose');

    if (!draggable || !closeButton) {
        console.warn(t`Failed to find draggable or close button. Sidebar will not be added.`);
        return;
    }

    draggable.id = 'eBookSidebar';
    closeButton.addEventListener('click', onSidebarToggle);

    // 헤더 타이틀 추가
    const headerTitle = draggable.querySelector('.dragHeader h3');
    if (headerTitle) {
        headerTitle.textContent = t`E-Book Viewer`;
    }

    // 탭 컨테이너 추가
    draggable.appendChild(tabsContainer);

    // 콘텐츠 컨테이너 추가
    const contentContainer = document.createElement('div');
    contentContainer.id = 'eBookSidebarContent';
    contentContainer.className = 'ebook-sidebar-content';
    draggable.appendChild(contentContainer);

    movingDivs.appendChild(draggable);
}

function addEBookViewerStyles() {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'eBookViewerStyles';

    styleSheet.textContent = `
        .ebook-toolbar {
            display: flex;
            padding: 10px;
            background-color: var(--background-color);
            border-bottom: 1px solid var(--background-color2);
            gap: 10px;
        }

        .toolbar-button {
            background-color: var(--primary-color);
            color: var(--text-color);
            border: none;
            border-radius: 4px;
            padding: 8px;
            cursor: pointer;
            position: relative;
        }

        .toolbar-button:hover {
            background-color: var(--hover-color);
        }

        .highlight-yellow {
            background-color: #FFFF00;
            border-radius: 2px;
        }

        .highlight-green {
            background-color: #90EE90;
            border-radius: 2px;
        }

        .highlight-blue {
            background-color: #ADD8E6;
            border-radius: 2px;
        }

        .highlight-pink {
            background-color: #FFB6C1;
            border-radius: 2px;
        }

        .highlight-purple {
            background-color: #E6E6FA;
            border-radius: 2px;
        }

        .note-marker {
            background-color: #FFF59D;
            border-bottom: 1px dotted #FFA000;
            border-radius: 2px;
            cursor: help;
        }

        .bookmark-marker {
            position: relative;
        }

        .bookmark-marker::before {
            content: '';
            position: absolute;
            top: 0;
            right: -5px;
            width: 10px;
            height: 10px;
            background-color: #FF5252;
            border-radius: 50%;
        }

        .ebook-tabs {
            display: flex;
            border-bottom: 1px solid var(--background-color2);
        }

        .ebook-tab {
            padding: 10px 15px;
            cursor: pointer;
            background-color: var(--background-color);
            border-bottom: 2px solid transparent;
        }

        .ebook-tab.active {
            border-bottom: 2px solid var(--primary-color);
        }

        .ebook-sidebar-content {
            padding: 15px;
            overflow-y: auto;
            height: calc(100% - 100px);
        }

        .ebook-item {
            margin-bottom: 10px;
            padding: 10px;
            border-radius: 4px;
            background-color: var(--background-color2);
            position: relative;
        }

        .ebook-item-text {
            margin-bottom: 5px;
        }

        .ebook-item-meta {
            font-size: 0.8em;
            color: var(--text-color2);
        }

        .ebook-item-actions {
            position: absolute;
            top: 5px;
            right: 5px;
            display: flex;
            gap: 5px;
        }

        .ebook-item-action {
            cursor: pointer;
            font-size: 0.9em;
        }

        .color-selector {
            position: absolute;
            top: 100%;
            left: 0;
            display: none;
            background-color: var(--background-color);
            border: 1px solid var(--background-color2);
            border-radius: 4px;
            padding: 5px;
            z-index: 1000;
        }

        .color-selector.visible {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }

        .color-option {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            cursor: pointer;
            border: 2px solid transparent;
        }

        .color-option.selected {
            border-color: var(--primary-color);
        }

        #eBookSidebar {
            min-width: 300px;
            max-width: 400px;
            height: 70vh;
            display: none;
        }

        #eBookSidebar.visible {
            display: block;
        }
    `;

    document.head.appendChild(styleSheet);
}

function addTextSelectionListener() {
    document.addEventListener('mouseup', debounce(() => {
        const selection = window.getSelection();
        const hasSelection = selection && selection.toString().trim().length > 0;

        // 선택된 텍스트가 있을 때만 관련 버튼 활성화
        const highlightButton = document.getElementById('highlightButton');
        const noteButton = document.getElementById('noteButton');

        if (highlightButton) highlightButton.disabled = !hasSelection;
        if (noteButton) noteButton.disabled = !hasSelection;
    }, 100));
}

// 하이라이트 함수
function onHighlightClick() {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim().length === 0) return;

    const range = selection.getRangeAt(0);
    if (!range) return;

    // 메시지 범위 내의 선택만 처리
    const container = range.commonAncestorContainer;
    const messageElement = findMessageElement(container);
    if (!messageElement) return;

    // 범위 정보 저장
    const messageId = messageElement.id;
    const color = colorPalette[currentColorIndex];
    const highlightId = uuidv4();
    const highlightClass = `highlight-${getColorClass(currentColorIndex)}`;

    // 하이라이트 마크업
    const highlightSpan = document.createElement('span');
    highlightSpan.className = highlightClass;
    highlightSpan.dataset.highlightId = highlightId;

    try {
        range.surroundContents(highlightSpan);

        // 하이라이트 정보 저장
        eBookData.highlights[highlightId] = {
            id: highlightId,
            messageId: messageId,
            text: selection.toString(),
            color: color,
            colorIndex: currentColorIndex,
            timestamp: new Date().toISOString()
        };

        // 사이드바 업데이트 및 저장
        updateSidebar();
        saveEBookData();
    } catch (e) {
        console.error('Failed to create highlight:', e);
        Popup.show.warning('Failed to create highlight. The selection may cross multiple elements.');
    }

    // 선택 해제
    selection.removeAllRanges();
}

// 노트 추가 함수
function onNoteClick() {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim().length === 0) return;

    const range = selection.getRangeAt(0);
    if (!range) return;

    // 메시지 범위 내의 선택만 처리
    const container = range.commonAncestorContainer;
    const messageElement = findMessageElement(container);
    if (!messageElement) return;

    // 사용자에게 노트 내용 입력 요청
    Popup.show.input(t`Enter note text`).then(noteText => {
        if (!noteText) return;

        // 범위 정보 저장
        const messageId = messageElement.id;
        const noteId = uuidv4();

        // 노트 마크업
        const noteSpan = document.createElement('span');
        noteSpan.className = 'note-marker';
        noteSpan.dataset.noteId = noteId;
        noteSpan.title = noteText;

        try {
            range.surroundContents(noteSpan);

            // 노트 정보 저장
            eBookData.notes[noteId] = {
                id: noteId,
                messageId: messageId,
                text: selection.toString(),
                note: noteText,
                timestamp: new Date().toISOString()
            };

            // 사이드바 업데이트 및 저장
            updateSidebar();
            saveEBookData();
        } catch (e) {
            console.error('Failed to create note:', e);
            Popup.show.warning('Failed to create note. The selection may cross multiple elements.');
        }

        // 선택 해제
        selection.removeAllRanges();
    });
}

// 북마크 추가 함수
function onBookmarkClick() {
    // 현재 위치에 북마크 삽입
    const messageElements = chat.querySelectorAll('.mes');
    if (messageElements.length === 0) return;

    // 스크롤 위치와 가장 가까운 메시지 찾기
    const scrollTop = chat.scrollTop;
    let closestMessage = null;
    let minDistance = Infinity;

    messageElements.forEach(message => {
        const distance = Math.abs(message.offsetTop - scrollTop);
        if (distance < minDistance) {
            minDistance = distance;
            closestMessage = message;
        }
    });

    if (!closestMessage) return;

    // 북마크 이름 입력 요청
    Popup.show.input(t`Enter bookmark name`).then(bookmarkName => {
        if (!bookmarkName) return;

        const messageId = closestMessage
