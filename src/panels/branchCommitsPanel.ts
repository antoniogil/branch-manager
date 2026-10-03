import * as vscode from 'vscode';

import { BranchCommit, CommitChangedFile } from '../models/branch';
import { BranchService } from '../services/branchService';

export function renderCommitsTableHtml(
  commits: BranchCommit[],
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  branchName = '',
): string {
  const rows = commits
    .map(
      (commit) => `
<tr class="commit-row${commit.fullHash === '-' ? ' is-disabled' : ''}" data-commit-hash="${escapeHtml(commit.fullHash)}">
        <td>${escapeHtml(getShortCommitTitle(commit.message))}</td>
        <td>${escapeHtml(commit.author)}</td>
        <td>${escapeHtml(formatDateForDisplay(commit.date))}</td>
        <td class="commit-hash-cell">
          ${commit.fullHash === '-'
            ? escapeHtml(commit.hash)
            : `<button type="button" class="commit-hash-link" data-commit-hash="${escapeHtml(commit.fullHash)}" aria-label="Copy commit ${escapeHtml(commit.fullHash)}">${escapeHtml(commit.hash)}</button>`}
        </td>
</tr>`
    )
    .join('');

  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'branchCommits.css'));
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'branchCommits.js'));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Branch Commits</title>
  <link rel="stylesheet" href="${styleUri}" />
</head>
<body data-branch-name="${escapeHtml(branchName)}">
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
      <div id="files-splitter" class="files-splitter" role="separator" aria-orientation="vertical" aria-label="Resize files list"></div>
      <div class="diff-pane">
        <div class="pane-header">
          <div class="pane-title" id="diff-path">Diff</div>
          <div class="diff-controls" aria-label="Diff navigation controls">
            <button id="diff-prev" class="diff-nav-button" type="button" aria-label="Previous change" title="Previous change">↑</button>
            <button id="diff-next" class="diff-nav-button" type="button" aria-label="Next change" title="Next change">↓</button>
          </div>
        </div>
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

  <script src="${scriptUri}"></script>
</body>
</html>`;
}
export class BranchCommitsPanelManager {
  private panel: vscode.WebviewPanel | undefined;
  private webviewMessageDisposable: vscode.Disposable | undefined;
  private readonly outputChannel = vscode.window.createOutputChannel('BranchManager Debug');

  constructor(
    private readonly branchService: BranchService,
    private readonly extensionUri: vscode.Uri,
  ) { }

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
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'media'),
        ],
      }
    );

    this.panel.onDidDispose(() => {
      this.webviewMessageDisposable?.dispose();
      this.webviewMessageDisposable = undefined;
      this.panel = undefined;
    });

    this.attachWebviewMessageHandler();

    this.panel.title = `Commits: ${branchName}`;
    const commits = await this.branchService.getBranchCommits(branchName, 50, 0);
    this.panel.webview.html = renderCommitsTableHtml(commits, this.panel.webview, this.extensionUri, branchName);
    this.panel.reveal(vscode.ViewColumn.Active, false);
  }

  private attachWebviewMessageHandler(): void {
    if (!this.panel) {
      return;
    }

    this.webviewMessageDisposable?.dispose();
    this.webviewMessageDisposable = this.panel.webview.onDidReceiveMessage(async (message: { type?: string; commitHash?: string; path?: string; previousPath?: string; branchName?: string; offset?: number }) => {
      try {
        if (!this.panel || !message?.type) {
          return;
        }

        if (message.type === 'loadMoreCommits') {
          const branchName = message.branchName ?? this.panel.title.replace(/^Commits:\s*/i, '');
          const offset = typeof message.offset === 'number' ? message.offset : 0;
          const commits = await this.branchService.getBranchCommits(branchName, 50, offset);

          await this.panel.webview.postMessage({
            type: 'appendCommits',
            commits,
            offset: offset + commits.length,
            hasMore: commits.length === 50,
          });
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

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  const day = String(parsedDate.getDate()).padStart(2, '0');
  const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
  const year = String(parsedDate.getFullYear());
  const hours = String(parsedDate.getHours()).padStart(2, '0');
  const minutes = String(parsedDate.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

