import * as vscode from 'vscode';

import { BranchCommit, CommitChangedFile } from '../models/branch';
import { BranchService } from '../services/branchService';

export function renderCommitsTableHtml(commits: BranchCommit[]): string {
  const rows = commits
    .map(
      (commit) => `
			<tr class="commit-row${commit.fullHash === '-' ? ' is-disabled' : ''}" data-commit-hash="${escapeHtml(commit.fullHash)}">
        <td>${escapeHtml(getShortCommitTitle(commit.message))}</td>
				<td>${escapeHtml(commit.author)}</td>
        <td>${escapeHtml(formatDateForDisplay(commit.date))}</td>
        <td>${escapeHtml(commit.hash)}</td>
			</tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Branch Commits</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: var(--vscode-font-family);
    }

    html, body {
      height: 100%;
    }

    body {
      margin: 0;
      padding: 0;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      overflow: hidden;
    }

    body.is-resizing {
      user-select: none;
      cursor: row-resize;
    }

    .main-layout {
      display: flex;
      flex-direction: column;
      height: 100vh;
      max-height: 100vh;
      --top-pane-height: 50vh;
    }

    .commits-pane {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
    }

    .commits-pane.is-split {
      flex: 0 0 var(--top-pane-height);
      min-height: 120px;
    }

    .splitter {
      display: none;
      height: 6px;
      flex: 0 0 6px;
      cursor: row-resize;
      border-top: 1px solid var(--vscode-panel-border);
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-lineHighlightBackground);
    }

    .splitter.is-open {
      display: block;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      table-layout: fixed;
    }

    th, td {
      padding: 6px 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
      text-align: left;
      vertical-align: top;
      font-size: 12px;
      line-height: 1.35;
    }

    td {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .commit-row {
      cursor: pointer;
    }

    .commit-row.is-disabled {
      cursor: default;
      opacity: 0.7;
    }

    .commit-row.is-selected {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }

    th {
      font-weight: 600;
      background: var(--vscode-editor-lineHighlightBackground);
    }

    tr:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .details {
      display: none;
      border-top: 1px solid var(--vscode-panel-border);
      min-height: 160px;
      flex: 1 1 auto;
      min-width: 0;
    }

    .details.is-open {
      display: flex;
    }

    .files-pane {
      width: 34%;
      min-width: 240px;
      min-height: 0;
      border-right: 1px solid var(--vscode-panel-border);
      display: flex;
      flex-direction: column;
    }

    .diff-pane {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
    }

    .pane-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-lineHighlightBackground);
    }

    .files-list {
      margin: 0;
      padding: 0;
      list-style: none;
      overflow: auto;
      flex: 1;
    }

    .file-item {
      border-bottom: 1px solid var(--vscode-panel-border);
      padding: 6px 8px;
      cursor: pointer;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .file-item:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .file-item.is-selected {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }

    .status-badge {
      font-size: 10px;
      font-weight: 600;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 1px 4px;
      text-transform: uppercase;
      flex: 0 0 auto;
    }

    .status-added {
      color: var(--vscode-gitDecoration-addedResourceForeground);
    }

    .status-modified {
      color: var(--vscode-gitDecoration-modifiedResourceForeground);
    }

    .status-deleted {
      color: var(--vscode-gitDecoration-deletedResourceForeground);
    }

    .status-renamed, .status-copied {
      color: var(--vscode-gitDecoration-stageModifiedResourceForeground, var(--vscode-gitDecoration-modifiedResourceForeground));
    }

    .path-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .diff-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      min-height: 0;
      flex: 1;
    }

    .diff-column {
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .diff-column + .diff-column {
      border-left: 1px solid var(--vscode-panel-border);
    }

    .diff-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      padding: 6px 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    pre {
      margin: 0;
      padding: 8px;
      overflow: auto;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      line-height: 1.4;
      white-space: pre;
      flex: 1;
    }

    .diff-scroll {
      flex: 1;
      min-height: 0;
      overflow-y: scroll;
      overflow-x: auto;
      scrollbar-gutter: stable;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      line-height: 1.45;
      border-top: 0;
    }

    .diff-line {
      padding: 0 8px;
      min-height: 20px;
      white-space: pre;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .diff-line.is-added {
      background: var(--vscode-diffEditor-insertedTextBackground, rgba(46, 160, 67, 0.25));
    }

    .diff-line.is-removed {
      background: var(--vscode-diffEditor-removedTextBackground, rgba(248, 81, 73, 0.25));
    }

    .diff-line.is-empty {
      color: transparent;
    }

    .placeholder {
      padding: 8px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div id="main-layout" class="main-layout">
    <div id="commits-pane" class="commits-pane">
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Author</th>
            <th>Date</th>
            <th>ID</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>

    <div id="splitter" class="splitter" role="separator" aria-orientation="horizontal" aria-label="Resize commit details"></div>

    <section id="commit-details" class="details" aria-live="polite">
      <div class="files-pane">
        <div class="pane-title">Files</div>
        <ul id="files-list" class="files-list"></ul>
        <div id="files-empty" class="placeholder">Select a commit to view changed files.</div>
      </div>
      <div class="diff-pane">
        <div class="pane-title" id="diff-path">Diff</div>
        <div class="diff-grid">
          <div class="diff-column">
            <div class="diff-title">Before</div>
            <div id="diff-before" class="diff-scroll"></div>
          </div>
          <div class="diff-column">
            <div class="diff-title">After</div>
            <div id="diff-after" class="diff-scroll"></div>
          </div>
        </div>
      </div>
    </section>
  </div>

  <script>
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

      return text.replace(/\\r\\n/g, '\\n').split('\\n');
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

  </script>
</body>
</html>`;
}

export class BranchCommitsPanelManager {
  private panel: vscode.WebviewPanel | undefined;
  private webviewMessageDisposable: vscode.Disposable | undefined;
  private readonly outputChannel = vscode.window.createOutputChannel('BranchManager Debug');

  constructor(private readonly branchService: BranchService) { }

  private logError(scope: string, error: unknown, details?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const payload = {
      scope,
      ...(details ?? {}),
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    };
    this.outputChannel.appendLine(`[${timestamp}] ${JSON.stringify(payload)}`);
  }

  async showForBranch(branchName: string): Promise<void> {
    if (this.panel) {
      this.panel.dispose();
      this.panel = undefined;
    }

    this.panel = vscode.window.createWebviewPanel(
      'branchmanager.commits',
      'Branch Commits',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    this.panel.onDidDispose(() => {
      this.webviewMessageDisposable?.dispose();
      this.webviewMessageDisposable = undefined;
      this.panel = undefined;
    });

    this.attachWebviewMessageHandler();

    this.panel.title = `Commits: ${branchName}`;
    const commits = await this.branchService.getBranchCommits(branchName);
    this.panel.webview.html = renderCommitsTableHtml(commits);
    this.panel.reveal(vscode.ViewColumn.Active, false);
  }

  private attachWebviewMessageHandler(): void {
    if (!this.panel) {
      return;
    }

    this.webviewMessageDisposable?.dispose();
    this.webviewMessageDisposable = this.panel.webview.onDidReceiveMessage(async (message: { type?: string; commitHash?: string; path?: string; previousPath?: string }) => {
      try {
        if (!this.panel || !message?.type) {
          return;
        }

        if (!message.commitHash) {
          return;
        }

        if (message.type === 'selectCommit') {
          const files = await this.branchService.getCommitChangedFiles(message.commitHash);
          await this.panel.webview.postMessage({
            type: 'commitDetails',
            commitHash: message.commitHash,
            files: files.map((file) => mapFileForWebview(file)),
          });
          return;
        }

        if (message.type === 'selectCommitFile' && message.path) {
          const diff = await this.branchService.getCommitFileDiff(
            message.commitHash,
            message.path,
            message.previousPath
          );

          await this.panel.webview.postMessage({
            type: 'commitFileDiff',
            commitHash: message.commitHash,
            path: diff.path,
            beforeContent: diff.beforeContent,
            afterContent: diff.afterContent,
          });
        }
      } catch (error) {
        this.logError('onDidReceiveMessage', error, {
          type: message?.type,
          commitHash: message?.commitHash,
          path: message?.path,
        });
      }
    });
  }
}

function getShortCommitTitle(message: string): string {
  const firstLine = message.split(/\r?\n/, 1)[0]?.trim() ?? '';
  const maxLength = 72;

  if (firstLine.length <= maxLength) {
    return firstLine;
  }

  return `${firstLine.slice(0, maxLength - 1)}...`;
}

function mapFileForWebview(file: CommitChangedFile): CommitChangedFile {
  return {
    path: file.path,
    previousPath: file.previousPath,
    status: file.status,
  };
}

function formatDateForDisplay(value: string): string {
  if (value === '-' || !value) {
    return '-';
  }

  const parts = value.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    if (year.length === 4 && month.length === 2 && day.length === 2) {
      return `${day}/${month}/${year}`;
    }
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  const day = String(parsedDate.getDate()).padStart(2, '0');
  const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
  const year = String(parsedDate.getFullYear());
  return `${day}/${month}/${year}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
