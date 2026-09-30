import * as vscode from 'vscode';

import { API, GitExtension, Repository } from '../types/git';

export class GitExtensionService {
    private gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');

    async getApi(): Promise<API | undefined> {
        if (!this.gitExtension) {
            return undefined;
        }

        const extensionExports = this.gitExtension.isActive
            ? this.gitExtension.exports
            : await this.gitExtension.activate();

        return extensionExports?.getAPI(1);
    }

    async getPrimaryRepository(): Promise<Repository | undefined> {
        const api = await this.getApi();
        if (!api || api.repositories.length === 0) {
            return undefined;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return api.repositories[0];
        }

        for (const folder of workspaceFolders) {
            const match = api.repositories.find((repository) =>
                repository.rootUri.fsPath.toLowerCase() === folder.uri.fsPath.toLowerCase()
            );

            if (match) {
                return match;
            }
        }

        return api.repositories[0];
    }

    async watchRepositoryChanges(onChange: () => void): Promise<vscode.Disposable> {
        const api = await this.getApi();
        if (!api) {
            return new vscode.Disposable(() => { });
        }

        const repositoryStateListeners = new Map<Repository, vscode.Disposable>();

        const attachStateListener = (repository: Repository): void => {
            if (repositoryStateListeners.has(repository)) {
                return;
            }

            repositoryStateListeners.set(repository, repository.state.onDidChange(onChange));
        };

        const detachStateListener = (repository: Repository): void => {
            const disposable = repositoryStateListeners.get(repository);
            disposable?.dispose();
            repositoryStateListeners.delete(repository);
        };

        for (const repository of api.repositories) {
            attachStateListener(repository);
        }

        const subscriptions: vscode.Disposable[] = [
            api.onDidOpenRepository((repository) => {
                attachStateListener(repository);
                onChange();
            }),
            api.onDidCloseRepository((repository) => {
                detachStateListener(repository);
                onChange();
            }),
            api.onDidChangeState(onChange),
        ];

        return new vscode.Disposable(() => {
            for (const subscription of subscriptions) {
                subscription.dispose();
            }

            for (const listener of repositoryStateListeners.values()) {
                listener.dispose();
            }

            repositoryStateListeners.clear();
        });
    }
}
