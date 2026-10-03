import * as vscode from 'vscode';

import { BranchCommitsPanelManager } from './panels/branchCommitsPanel';
import { BranchesTreeDataProvider, BranchTreeItem } from './providers/branchTreeDataProvider';
import { BranchService } from './services/branchService';
import { GitExtensionService } from './services/gitExtensionService';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const branchService = new BranchService();
	const gitExtensionService = new GitExtensionService();
	const branchesProvider = new BranchesTreeDataProvider([]);
	const treeView = vscode.window.createTreeView('branchmanager.branchesView', {
		treeDataProvider: branchesProvider,
		showCollapseAll: true,
	});

	const revealCurrentBranch = async (): Promise<void> => {
		const currentBranchItem = branchesProvider.getCurrentBranchItem();
		if (currentBranchItem) {
			await treeView.reveal(currentBranchItem, { select: true, focus: true, expand: true });
			return;
		}

		const rootItems = await branchesProvider.getChildren();
		const rootItem = Array.isArray(rootItems) ? rootItems[0] : undefined;
		if (rootItem) {
			await treeView.reveal(rootItem, { select: false, focus: false, expand: true });
		}
	};

	const refreshBranches = async (): Promise<void> => {
		const branches = await branchService.getBranchesByScope();
		branchesProvider.setBranches(branches);
		await revealCurrentBranch();
	};

	await refreshBranches();
	if (branchesProvider.getBranchNames().length === 0) {
		setTimeout(() => {
			void refreshBranches();
		}, 1500);
	}

	const gitWatchDisposable = await gitExtensionService.watchRepositoryChanges(() => {
		void refreshBranches();
	});

	const commitsPanelManager = new BranchCommitsPanelManager(branchService, context.extensionUri);

	const focusBranch = async (branchName: string): Promise<void> => {
		const branchItem = branchesProvider.getBranchItem(branchName);
		await treeView.reveal(branchItem, { select: true, focus: true });
		await commitsPanelManager.showForBranch(branchName);
	};

	treeView.onDidChangeSelection((event) => {
		const selectedBranch = event.selection[0];
		if (selectedBranch?.isBranch()) {
			void commitsPanelManager.showForBranch(selectedBranch.branchName);
		}
	});

	const openBranchCommitsCommand = vscode.commands.registerCommand(
		'branchmanager.openBranchCommits',
		async (branchItem?: { branchName: string } | string) => {
			if (branchesProvider.getBranchNames().length === 0) {
				await refreshBranches();
			}

			const branchName = typeof branchItem === 'string'
				? branchItem
				: branchItem?.branchName ?? branchesProvider.getBranchNames()[0];

			if (!branchName) {
				return;
			}

			await vscode.commands.executeCommand('branchmanager.branchesView.focus');
			await focusBranch(branchName);
		}
	);

	context.subscriptions.push(treeView, openBranchCommitsCommand, gitWatchDisposable);
}

export function deactivate() { }
