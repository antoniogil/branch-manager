function getVsCodeApi() {
    const globalObject = window;

    if (globalObject.__branchManagerVsCodeApi) {
        return globalObject.__branchManagerVsCodeApi;
    }

    if (typeof acquireVsCodeApi === 'function') {
        const api = acquireVsCodeApi();
        globalObject.__branchManagerVsCodeApi = api;
        return api;
    }

    return {
        postMessage() {
            return false;
        },
    };
}

const vscode = getVsCodeApi();

const mainLayout = document.getElementById('main-layout');
const commitsPane = document.getElementById('commits-pane');
const splitter = document.getElementById('splitter');
const details = document.getElementById('commit-details');
const filesList = document.getElementById('files-list');
const filesEmpty = document.getElementById('files-empty');
const diffPath = document.getElementById('diff-path');
const diffBefore = document.getElementById('diff-before');
const diffAfter = document.getElementById('diff-after');

let selectedCommitHash = '';
let selectedFilePath = '';
let selectedPreviousPath = undefined;
let isDraggingSplitter = false;
let isSyncingDiffScroll = false;

document.querySelectorAll('.commit-row').forEach((row) => {
    row.addEventListener('click', () => {
        if (row.classList.contains('is-disabled')) {
            return;
        }

        selectedCommitHash = row.dataset.commitHash || '';
        if (!selectedCommitHash) {
            return;
        }

        document.querySelectorAll('.commit-row').forEach((item) => {
            item.classList.remove('is-selected');
        });
        row.classList.add('is-selected');

        openDetailsAtHalf();
        filesList.innerHTML = '';
        filesEmpty.textContent = 'Loading changed files...';
        filesEmpty.style.display = 'block';
        diffPath.textContent = 'Diff';
        renderRawDiff('', '');

        vscode.postMessage({
            type: 'selectCommit',
            commitHash: selectedCommitHash,
        });
    });
});

window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'commitDetails') {
        if (message.commitHash !== selectedCommitHash) {
            return;
        }

        renderFiles(message.files || []);
        return;
    }

    if (message.type === 'commitFileDiff') {
        if (message.commitHash !== selectedCommitHash || message.path !== selectedFilePath) {
            return;
        }

        diffPath.textContent = message.path;
        renderHighlightedDiff(message.beforeContent || '', message.afterContent || '');
    }
});

diffBefore.addEventListener('scroll', () => {
    syncDiffScroll(diffBefore, diffAfter);
});

diffAfter.addEventListener('scroll', () => {
    syncDiffScroll(diffAfter, diffBefore);
});

splitter.addEventListener('pointerdown', (event) => {
    if (!details.classList.contains('is-open')) {
        return;
    }

    isDraggingSplitter = true;
    document.body.classList.add('is-resizing');
    splitter.setPointerCapture(event.pointerId);
    event.preventDefault();
});

splitter.addEventListener('pointermove', (event) => {
    if (!isDraggingSplitter) {
        return;
    }

    setTopPaneHeight(event.clientY);
});

splitter.addEventListener('pointerup', (event) => {
    if (!isDraggingSplitter) {
        return;
    }

    isDraggingSplitter = false;
    document.body.classList.remove('is-resizing');
    splitter.releasePointerCapture(event.pointerId);
});

splitter.addEventListener('pointercancel', () => {
    isDraggingSplitter = false;
    document.body.classList.remove('is-resizing');
});

window.addEventListener('resize', () => {
    if (!details.classList.contains('is-open')) {
        return;
    }

    const currentTop = commitsPane.getBoundingClientRect().height;
    setTopPaneHeight(currentTop);
});

function renderFiles(files) {
    filesList.innerHTML = '';

    if (!files.length) {
        filesEmpty.textContent = 'No changed files found for this commit.';
        filesEmpty.style.display = 'block';
        diffPath.textContent = 'Diff';
        renderRawDiff('', '');
        return;
    }

    filesEmpty.style.display = 'none';

    files.forEach((file, index) => {
        const item = document.createElement('li');
        item.className = 'file-item';
        item.dataset.path = file.path;
        item.dataset.previousPath = file.previousPath || '';

        const badge = document.createElement('span');
        badge.className = 'status-badge status-' + file.status;
        badge.textContent = statusLabel(file.status);

        const label = document.createElement('span');
        label.className = 'path-label';
        label.textContent = file.path;

        item.appendChild(badge);
        item.appendChild(label);

        item.addEventListener('click', () => {
            selectFile(item, file);
        });

        filesList.appendChild(item);

        if (index === 0) {
            selectFile(item, file);
        }
    });
}

function selectFile(item, file) {
    selectedFilePath = file.path;
    selectedPreviousPath = file.previousPath || undefined;

    filesList.querySelectorAll('.file-item').forEach((node) => {
        node.classList.remove('is-selected');
    });
    item.classList.add('is-selected');

    diffPath.textContent = file.path;
    renderRawDiff('Loading...', 'Loading...');

    vscode.postMessage({
        type: 'selectCommitFile',
        commitHash: selectedCommitHash,
        path: selectedFilePath,
        previousPath: selectedPreviousPath,
    });
}

function statusLabel(status) {
    switch (status) {
        case 'added':
            return 'A';
        case 'modified':
            return 'M';
        case 'deleted':
            return 'D';
        case 'renamed':
            return 'R';
        case 'copied':
            return 'C';
        default:
            return '?';
    }
}

function openDetailsAtHalf() {
    const wasClosed = !details.classList.contains('is-open');
    details.classList.add('is-open');
    commitsPane.classList.add('is-split');
    splitter.classList.add('is-open');

    if (wasClosed) {
        setTopPaneHeight(Math.floor(window.innerHeight / 2));
    }
}

function setTopPaneHeight(requestedHeight) {
    const minTop = 120;
    const minBottom = 160;
    const maxTop = Math.max(minTop, window.innerHeight - minBottom);
    const nextHeight = Math.max(minTop, Math.min(requestedHeight, maxTop));
    mainLayout.style.setProperty('--top-pane-height', nextHeight + 'px');
}

function syncDiffScroll(source, target) {
    if (isSyncingDiffScroll) {
        return;
    }

    isSyncingDiffScroll = true;
    const sourceRange = source.scrollHeight - source.clientHeight;
    const targetRange = target.scrollHeight - target.clientHeight;
    const ratio = sourceRange <= 0 ? 0 : source.scrollTop / sourceRange;
    target.scrollTop = Math.max(0, ratio * targetRange);
    isSyncingDiffScroll = false;
}

function renderRawDiff(beforeText, afterText) {
    const beforeLines = splitLines(beforeText).map((line) => ({ text: line, type: 'context' }));
    const afterLines = splitLines(afterText).map((line) => ({ text: line, type: 'context' }));
    renderDiffColumn(diffBefore, beforeLines);
    renderDiffColumn(diffAfter, afterLines);
    diffBefore.scrollTop = 0;
    diffAfter.scrollTop = 0;
}

function renderHighlightedDiff(beforeText, afterText) {
    const beforeLines = splitLines(beforeText);
    const afterLines = splitLines(afterText);
    const alignedRows = buildAlignedDiffRows(beforeLines, afterLines);

    renderDiffColumn(
        diffBefore,
        alignedRows.map((row) => ({ text: row.beforeText, type: row.beforeType }))
    );
    renderDiffColumn(
        diffAfter,
        alignedRows.map((row) => ({ text: row.afterText, type: row.afterType }))
    );

    diffBefore.scrollTop = 0;
    diffAfter.scrollTop = 0;
}

function renderDiffColumn(container, rows) {
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();

    rows.forEach((row) => {
        const line = document.createElement('div');
        line.className = 'diff-line';

        if (row.type === 'added') {
            line.classList.add('is-added');
        } else if (row.type === 'removed') {
            line.classList.add('is-removed');
        }

        const lineText = row.text === '' ? ' ' : row.text;
        if (row.text === '') {
            line.classList.add('is-empty');
        }
        line.textContent = lineText;
        fragment.appendChild(line);
    });

    container.appendChild(fragment);
}

function splitLines(text) {
    if (!text) {
        return [];
    }

    return text.replace(/\r\n/g, '\n').split('\n');
}

function buildAlignedDiffRows(beforeLines, afterLines) {
    const complexityLimit = 1500000;
    if (beforeLines.length * afterLines.length > complexityLimit) {
        return buildFallbackRows(beforeLines, afterLines);
    }

    const dp = [];
    for (let i = 0; i <= beforeLines.length; i += 1) {
        dp[i] = new Array(afterLines.length + 1).fill(0);
    }

    for (let i = 1; i <= beforeLines.length; i += 1) {
        for (let j = 1; j <= afterLines.length; j += 1) {
            if (beforeLines[i - 1] === afterLines[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    const operations = [];
    let i = beforeLines.length;
    let j = afterLines.length;

    while (i > 0 && j > 0) {
        if (beforeLines[i - 1] === afterLines[j - 1]) {
            operations.push({ type: 'context', beforeText: beforeLines[i - 1], afterText: afterLines[j - 1] });
            i -= 1;
            j -= 1;
        } else if (dp[i - 1][j] >= dp[i][j - 1]) {
            operations.push({ type: 'removed', beforeText: beforeLines[i - 1], afterText: '' });
            i -= 1;
        } else {
            operations.push({ type: 'added', beforeText: '', afterText: afterLines[j - 1] });
            j -= 1;
        }
    }

    while (i > 0) {
        operations.push({ type: 'removed', beforeText: beforeLines[i - 1], afterText: '' });
        i -= 1;
    }

    while (j > 0) {
        operations.push({ type: 'added', beforeText: '', afterText: afterLines[j - 1] });
        j -= 1;
    }

    operations.reverse();

    return operations.map((operation) => {
        if (operation.type === 'context') {
            return {
                beforeText: operation.beforeText,
                afterText: operation.afterText,
                beforeType: 'context',
                afterType: 'context',
            };
        }

        if (operation.type === 'removed') {
            return {
                beforeText: operation.beforeText,
                afterText: '',
                beforeType: 'removed',
                afterType: 'context',
            };
        }

        return {
            beforeText: '',
            afterText: operation.afterText,
            beforeType: 'context',
            afterType: 'added',
        };
    });
}

function buildFallbackRows(beforeLines, afterLines) {
    const maxLen = Math.max(beforeLines.length, afterLines.length);
    const rows = [];

    for (let index = 0; index < maxLen; index += 1) {
        const beforeText = beforeLines[index] ?? '';
        const afterText = afterLines[index] ?? '';

        if (beforeText === afterText) {
            rows.push({ beforeText, afterText, beforeType: 'context', afterType: 'context' });
            continue;
        }

        if (beforeText && !afterText) {
            rows.push({ beforeText, afterText: '', beforeType: 'removed', afterType: 'context' });
            continue;
        }

        if (!beforeText && afterText) {
            rows.push({ beforeText: '', afterText, beforeType: 'context', afterType: 'added' });
            continue;
        }

        rows.push({ beforeText, afterText: '', beforeType: 'removed', afterType: 'context' });
        rows.push({ beforeText: '', afterText, beforeType: 'context', afterType: 'added' });
    }

    return rows;
}
