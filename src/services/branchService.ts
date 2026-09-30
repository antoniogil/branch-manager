import * as path from 'path';

import { BranchCommit, CommitChangedFile, CommitFileDiff } from '../models/branch';
import { Branch, RefType, Repository, Status } from '../types/git';
import { GitExtensionService } from './gitExtensionService';

type BranchRepository = Pick<Repository, 'diffBetween' | 'getBranches' | 'getCommit' | 'log' | 'rootUri' | 'show' | 'state'>;

export interface ScopedBranch {
    name: string;
    ahead: number;
    behind: number;
    isCurrent: boolean;
    isInOrigin: boolean;
}

export interface BranchesByScope {
    local: ScopedBranch[];
    origin: ScopedBranch[];
}

const gitExtensionService = new GitExtensionService();

const NO_COMMITS_PLACEHOLDER: BranchCommit = {
    hash: '-',
    fullHash: '-',
    message: 'No commits available for this branch',
    author: '-',
    date: '-',
};

function asDateString(value: Date | undefined): string {
    if (!value) {
        return '-';
    }

    return value.toISOString().slice(0, 10);
}

async function resolveRepositoryFromGitExtension(): Promise<BranchRepository | undefined> {
    return gitExtensionService.getPrimaryRepository();
}

function toRelativePath(repositoryRoot: string, absolutePath: string): string {
    const relativePath = path.relative(repositoryRoot, absolutePath).replace(/\\/g, '/');
    return relativePath.startsWith('../') ? absolutePath.replace(/\\/g, '/') : relativePath;
}

function mapStatus(status: Status): CommitChangedFile['status'] {
    switch (status) {
        case Status.INDEX_ADDED:
            return 'added';
        case Status.INDEX_DELETED:
            return 'deleted';
        case Status.INDEX_RENAMED:
            return 'renamed';
        case Status.INDEX_COPIED:
            return 'copied';
        case Status.INDEX_MODIFIED:
        case Status.TYPE_CHANGED:
            return 'modified';
        default:
            return 'unknown';
    }
}

async function safeShow(repository: BranchRepository, ref: string, filePath: string): Promise<string> {
    try {
        return await repository.show(ref, filePath);
    } catch {
        return '';
    }
}

export class BranchService {
    constructor(
        private readonly repositoryResolver: () => Promise<BranchRepository | undefined> = resolveRepositoryFromGitExtension
    ) { }

    async getBranchesByScope(): Promise<BranchesByScope> {
        const repository = await this.repositoryResolver();
        if (!repository) {
            return { local: [], origin: [] };
        }

        const currentLocalBranch = repository.state.HEAD?.name;

        const [localRefs, remoteRefs] = await Promise.all([
            repository.getBranches({ remote: false, sort: 'alphabetically' }),
            repository.getBranches({ remote: true, sort: 'alphabetically' }),
        ]);

        const originNames = new Set<string>();
        for (const ref of remoteRefs) {
            if (ref.type !== RefType.RemoteHead || !ref.name) {
                continue;
            }

            if (ref.remote && ref.remote !== 'origin') {
                continue;
            }

            if (ref.remote === 'origin') {
                if (ref.name.startsWith('origin/')) {
                    const normalizedName = ref.name.slice('origin/'.length);
                    if (normalizedName && normalizedName !== 'HEAD') {
                        originNames.add(normalizedName);
                    }
                } else if (ref.name !== 'HEAD') {
                    originNames.add(ref.name);
                }
            } else if (ref.name.startsWith('origin/')) {
                const normalizedName = ref.name.slice('origin/'.length);
                if (normalizedName && normalizedName !== 'HEAD') {
                    originNames.add(normalizedName);
                }
            }
        }

        const local = new Map<string, ScopedBranch>();
        for (const ref of localRefs) {
            if (ref.type === RefType.Head && ref.name) {
                const branch = ref as Branch;
                const hasOriginUpstream = branch.upstream?.remote === 'origin';
                local.set(ref.name, {
                    name: ref.name,
                    ahead: branch.ahead ?? 0,
                    behind: branch.behind ?? 0,
                    isCurrent: ref.name === currentLocalBranch,
                    isInOrigin: hasOriginUpstream || originNames.has(ref.name),
                });
            }
        }

        const origin = new Map<string, ScopedBranch>();
        for (const ref of remoteRefs) {
            if (ref.type !== RefType.RemoteHead || !ref.name) {
                continue;
            }

            if (ref.remote && ref.remote !== 'origin') {
                continue;
            }

            let normalizedName: string | undefined;
            if (ref.remote === 'origin') {
                normalizedName = ref.name.startsWith('origin/')
                    ? ref.name.slice('origin/'.length)
                    : ref.name;
            } else if (ref.name.startsWith('origin/')) {
                normalizedName = ref.name.slice('origin/'.length);
            }

            if (!normalizedName || normalizedName === 'HEAD') {
                continue;
            }

            const branch = ref as Branch;
            origin.set(normalizedName, {
                name: normalizedName,
                ahead: branch.ahead ?? 0,
                behind: branch.behind ?? 0,
                isCurrent: false,
                isInOrigin: true,
            });
        }

        return {
            local: [...local.values()].sort((a, b) => a.name.localeCompare(b.name)),
            origin: [...origin.values()].sort((a, b) => a.name.localeCompare(b.name)),
        };
    }

    async getBranchNames(): Promise<string[]> {
        const branches = await this.getBranchesByScope();
        return branches.local.map((branch) => branch.name);
    }

    async getBranchCommits(branchName: string, maxEntries = 25): Promise<BranchCommit[]> {
        const repository = await this.repositoryResolver();
        if (!repository) {
            return [NO_COMMITS_PLACEHOLDER];
        }

        const entries = await repository.log({ maxEntries, refNames: [branchName] });
        if (entries.length === 0) {
            return [NO_COMMITS_PLACEHOLDER];
        }

        return entries.map((entry) => ({
            hash: entry.hash.slice(0, 7),
            fullHash: entry.hash,
            message: entry.message,
            author: entry.authorName ?? '-',
            date: asDateString(entry.authorDate),
        }));
    }

    async getCommitChangedFiles(commitHash: string): Promise<CommitChangedFile[]> {
        const repository = await this.repositoryResolver();
        if (!repository || !commitHash || commitHash === '-') {
            return [];
        }

        const commit = await repository.getCommit(commitHash);
        const parentHash = commit.parents[0];
        if (!parentHash) {
            return [];
        }

        const changes = await repository.diffBetween(parentHash, commitHash);
        const rootPath = repository.rootUri.fsPath;

        return changes.map((change) => ({
            path: toRelativePath(rootPath, change.uri.fsPath),
            previousPath: change.renameUri
                ? toRelativePath(rootPath, change.originalUri.fsPath)
                : undefined,
            status: mapStatus(change.status),
        }));
    }

    async getCommitFileDiff(commitHash: string, filePath: string, previousPath?: string): Promise<CommitFileDiff> {
        const repository = await this.repositoryResolver();
        if (!repository || !commitHash || commitHash === '-') {
            return {
                path: filePath,
                previousPath,
                beforeContent: '',
                afterContent: '',
            };
        }

        const commit = await repository.getCommit(commitHash);
        const parentHash = commit.parents[0];
        const parentPath = previousPath ?? filePath;

        const [beforeContent, afterContent] = await Promise.all([
            parentHash ? safeShow(repository, parentHash, parentPath) : Promise.resolve(''),
            safeShow(repository, commitHash, filePath),
        ]);

        return {
            path: filePath,
            previousPath,
            beforeContent,
            afterContent,
        };
    }
}
