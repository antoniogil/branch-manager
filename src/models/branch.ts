export interface BranchCommit {
    hash: string;
    fullHash: string;
    message: string;
    author: string;
    date: string;
}

export interface CommitChangedFile {
    path: string;
    previousPath?: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'unknown';
}

export interface CommitFileDiff {
    path: string;
    previousPath?: string;
    beforeContent: string;
    afterContent: string;
}
