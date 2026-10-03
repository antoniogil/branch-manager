import * as vscode from 'vscode';

type BranchItemKind = 'scope' | 'group' | 'branch';

interface BranchDetails {
    name: string;
    ahead: number;
    behind: number;
    isCurrent: boolean;
    isInOrigin: boolean;
}

type BranchInput = string | BranchDetails;

interface BranchesByScope {
    local: BranchInput[];
    origin: BranchInput[];
}

export class BranchTreeItem extends vscode.TreeItem {
    readonly kind: BranchItemKind;
    readonly branchName?: string;

    constructor(
        label: string,
        kind: BranchItemKind,
        collapsibleState: vscode.TreeItemCollapsibleState,
        options?: {
            command?: vscode.Command;
            branchName?: string;
            tooltip?: string;
            id?: string;
            contextValue?: string;
        }
    ) {
        super(label, collapsibleState);
        this.kind = kind;
        this.branchName = options?.branchName;
        this.contextValue = options?.contextValue ?? kind;
        this.command = options?.command;
        this.tooltip = options?.tooltip;
        this.id = options?.id;
    }

    static createScope(label: string, id: string, collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Expanded): BranchTreeItem {
        return new BranchTreeItem(label, 'scope', collapsibleState, {
            id,
            contextValue: 'branchScope',
            tooltip: label,
        });
    }

    static createGroup(label: string, id: string): BranchTreeItem {
        return new BranchTreeItem(label, 'group', vscode.TreeItemCollapsibleState.Collapsed, {
            id,
            contextValue: 'branchGroup',
            tooltip: label,
        });
    }

    static createBranch(label: string, branchName: string, id: string): BranchTreeItem {
        return new BranchTreeItem(label, 'branch', vscode.TreeItemCollapsibleState.None, {
            id,
            branchName,
            contextValue: 'branch',
            tooltip: `Branch: ${branchName}`,
        });
    }

    isBranch(): this is BranchTreeItem & { branchName: string } {
        return this.kind === 'branch' && typeof this.branchName === 'string';
    }
}

export class BranchesTreeDataProvider implements vscode.TreeDataProvider<BranchTreeItem> {
    private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<BranchTreeItem | undefined>();
    readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

    private readonly branchItems = new Map<string, BranchTreeItem>();
    private readonly nodeById = new Map<string, BranchTreeItem>();
    private readonly childrenById = new Map<string, BranchTreeItem[]>();
    private readonly parentById = new Map<string, string | undefined>();
    private rootItems: BranchTreeItem[] = [];

    private readonly repositoryName: string;
    private localBranches: BranchDetails[];
    private originBranches: BranchDetails[] = [];

    constructor(branchNames: string[], repositoryName?: string) {
        this.repositoryName = repositoryName?.trim() || this.resolveDefaultRepositoryName();
        this.localBranches = this.normalizeBranchList(branchNames);
        this.rebuildBranchItems();
    }

    getBranchNames(): string[] {
        return [
            ...this.localBranches.map((branch) => branch.name),
            ...this.originBranches.map((branch) => `origin/${branch.name}`),
        ];
    }

    setBranchNames(branchNames: string[]): void {
        this.localBranches = this.normalizeBranchList(branchNames);
        this.originBranches = [];
        this.rebuildBranchItems();
        this.onDidChangeTreeDataEmitter.fire(undefined);
    }

    setBranches(branches: BranchesByScope): void {
        this.localBranches = this.normalizeBranchList(branches.local);
        this.originBranches = this.normalizeBranchList(branches.origin);
        this.rebuildBranchItems();
        this.onDidChangeTreeDataEmitter.fire(undefined);
    }

    getBranchItem(branchName: string): BranchTreeItem {
        return this.branchItems.get(branchName)
            ?? BranchTreeItem.createBranch(branchName, branchName, `branch:fallback:${branchName}`);
    }

    getCurrentBranchItem(): BranchTreeItem | undefined {
        const currentLocalBranch = this.localBranches.find((branch) => branch.isCurrent);
        if (!currentLocalBranch) {
            return undefined;
        }

        return this.branchItems.get(currentLocalBranch.name) ?? undefined;
    }

    getTreeItem(element: BranchTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: BranchTreeItem): vscode.ProviderResult<BranchTreeItem[]> {
        if (!element) {
            return this.rootItems;
        }

        return this.childrenById.get(element.id ?? '') ?? [];
    }

    getParent(element: BranchTreeItem): vscode.ProviderResult<BranchTreeItem> {
        const parentId = this.parentById.get(element.id ?? '');
        if (!parentId) {
            return undefined;
        }

        return this.nodeById.get(parentId);
    }

    private createBranchItem(displayName: string, fullBranchRef: string, branch: BranchDetails, isOriginBranch: boolean): BranchTreeItem {
        const item = BranchTreeItem.createBranch(displayName, fullBranchRef, `branch:${fullBranchRef}`);

        if (branch.isCurrent) {
            item.label = displayName;
        }

        item.description = `↑${branch.ahead} ↓${branch.behind}`;

        if (isOriginBranch || branch.isInOrigin) {
            item.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.green'));
        }

        item.command = {
            command: 'branchmanager.openBranchCommits',
            title: 'Open Branch Commits',
            arguments: [item],
        };

        return item;
    }

    private appendBranchTree(parent: BranchTreeItem, branchDisplayPath: string, fullBranchRef: string, branch: BranchDetails, isOriginBranch: boolean): void {
        const parts = branchDisplayPath.split('/').filter(Boolean);
        if (parts.length === 0) {
            return;
        }

        let currentParentId = parent.id ?? '';
        let pathAccumulator = '';

        for (let index = 0; index < parts.length; index++) {
            const part = parts[index];
            const isLeaf = index === parts.length - 1;

            if (isLeaf) {
                const leafItem = this.createBranchItem(part, fullBranchRef, branch, isOriginBranch);
                const leafChildren = this.childrenById.get(currentParentId) ?? [];
                leafChildren.push(leafItem);
                this.childrenById.set(currentParentId, leafChildren);
                this.registerNode(leafItem, currentParentId);
                this.branchItems.set(fullBranchRef, leafItem);
                return;
            }

            pathAccumulator = pathAccumulator ? `${pathAccumulator}/${part}` : part;
            const groupId = `group:${parent.id}:${pathAccumulator}`;
            const existingGroup = this.nodeById.get(groupId);

            if (existingGroup) {
                currentParentId = groupId;
                continue;
            }

            const groupItem = BranchTreeItem.createGroup(part, groupId);
            const groupChildren = this.childrenById.get(currentParentId) ?? [];
            groupChildren.push(groupItem);
            this.childrenById.set(currentParentId, groupChildren);
            this.registerNode(groupItem, currentParentId);
            this.childrenById.set(groupId, []);

            currentParentId = groupId;
        }
    }

    private registerNode(item: BranchTreeItem, parentId: string | undefined): void {
        if (!item.id) {
            return;
        }

        this.nodeById.set(item.id, item);
        this.parentById.set(item.id, parentId);
    }

    private registerScope(scope: BranchTreeItem, parent?: BranchTreeItem): void {
        const parentId = parent?.id;

        if (parentId) {
            const siblings = this.childrenById.get(parentId) ?? [];
            siblings.push(scope);
            this.childrenById.set(parentId, siblings);
        } else {
            this.rootItems.push(scope);
        }

        this.registerNode(scope, parentId);
        this.childrenById.set(scope.id ?? '', []);
    }

    private resolveDefaultRepositoryName(): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        return workspaceFolder?.name?.trim() || 'Repository';
    }

    private sortChildrenRecursive(nodeId: string): void {
        const children = this.childrenById.get(nodeId);
        if (!children || children.length === 0) {
            return;
        }

        children.sort((a, b) => {
            const aIsFolder = a.kind !== 'branch';
            const bIsFolder = b.kind !== 'branch';

            if (aIsFolder !== bIsFolder) {
                return aIsFolder ? -1 : 1;
            }

            return this.asLabelText(a).localeCompare(this.asLabelText(b));
        });

        for (const child of children) {
            this.sortChildrenRecursive(child.id ?? '');
        }
    }

    private addScopeBranches(scope: BranchTreeItem, branches: BranchDetails[], toFullRef: (name: string) => string, isOriginBranch: boolean): void {
        for (const branch of branches) {
            const fullRef = toFullRef(branch.name);
            this.appendBranchTree(scope, branch.name, fullRef, branch, isOriginBranch);
        }
    }

    private addDefaultScopes(): void {
        const repositoryScope = BranchTreeItem.createScope(this.repositoryName, 'scope:repository');
        this.registerScope(repositoryScope);

        const localScope = BranchTreeItem.createScope('Local branches', 'scope:local');
        this.registerScope(localScope, repositoryScope);
        this.addScopeBranches(localScope, this.localBranches, (name) => name, false);

        const originScope = BranchTreeItem.createScope('origin', 'scope:origin', vscode.TreeItemCollapsibleState.Collapsed);
        this.registerScope(originScope, repositoryScope);
        this.addScopeBranches(originScope, this.originBranches, (name) => `origin/${name}`, true);

        this.sortChildrenRecursive(repositoryScope.id ?? '');
    }

    private clearState(): void {
        this.branchItems.clear();
        this.nodeById.clear();
        this.childrenById.clear();
        this.parentById.clear();
        this.rootItems = [];
    }

    private normalizeBranchList(branches: BranchInput[]): BranchDetails[] {
        const normalized = new Map<string, BranchDetails>();

        for (const branch of branches) {
            const details = typeof branch === 'string'
                ? { name: branch, ahead: 0, behind: 0, isCurrent: false, isInOrigin: false }
                : {
                    name: branch.name,
                    ahead: branch.ahead ?? 0,
                    behind: branch.behind ?? 0,
                    isCurrent: branch.isCurrent ?? false,
                    isInOrigin: branch.isInOrigin ?? false,
                };

            normalized.set(details.name, details);
        }

        return [...normalized.values()].sort((a, b) => a.name.localeCompare(b.name));
    }

    private asLabelText(item: BranchTreeItem): string {
        if (typeof item.label === 'string') {
            return item.label;
        }

        return item.label?.label ?? '';
    }

    private normalizeBranches(): void {
        this.localBranches = this.normalizeBranchList(this.localBranches);
        this.originBranches = this.normalizeBranchList(this.originBranches);
    }

    private rebuildBranchItems(): void {
        this.clearState();
        this.normalizeBranches();
        this.addDefaultScopes();
    }
}
