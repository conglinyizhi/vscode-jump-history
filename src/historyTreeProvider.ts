import * as vscode from 'vscode';
import * as path from 'path';

export interface JumpRecord {
    from: { uri: vscode.Uri; range: vscode.Range };
    to: { uri: vscode.Uri; range: vscode.Range };
    timestamp: number;
}

export class HistoryTreeProvider implements vscode.TreeDataProvider<HistoryNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<HistoryNode | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private stack: JumpRecord[] = [];

    getTreeItem(element: HistoryNode): vscode.TreeItem {
        return element;
    }

    getChildren(element?: HistoryNode): Thenable<HistoryNode[]> {
        if (!element) {
            return Promise.resolve(this.buildPath());
        }
        return Promise.resolve(element.children);
    }

    private buildPath(): HistoryNode[] {
        if (this.stack.length === 0) {
            return [];
        }

        let nextNode: HistoryNode | undefined;
        for (let i = this.stack.length - 1; i >= 0; i--) {
            const record = this.stack[i];
            const node = new HistoryNode(
                record,
                nextNode ? [nextNode] : [],
                i
            );
            nextNode = node;
        }

        return nextNode ? [nextNode] : [];
    }

    addJump(record: JumpRecord) {
        this.stack.push(record);
        this._onDidChangeTreeData.fire();
    }

    clear() {
        this.stack = [];
        this._onDidChangeTreeData.fire();
    }
}

export class HistoryNode extends vscode.TreeItem {
    children: HistoryNode[] = [];

    constructor(
        public readonly record: JumpRecord,
        children: HistoryNode[],
        public readonly depth: number
    ) {
        const toLine = record.to.range.start.line + 1;
        const fromLine = record.from.range.start.line + 1;
        const toFile = path.basename(record.to.uri.fsPath);
        const fromFile = path.basename(record.from.uri.fsPath);

        // 读取目标行的代码内容
        const codeLine = readLineFromFile(record.to.uri, record.to.range.start.line);

        super(
            `${fromFile}:${fromLine} → ${toFile}:${toLine}`,
            children.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
        );

        this.children = children;
        this.description = codeLine ? `  ${codeLine.trim()}` : '';
        this.tooltip = `From: ${record.from.uri.fsPath}:${fromLine}\nTo: ${record.to.uri.fsPath}:${toLine}`;
        this.command = {
            command: 'jumpHistory.goToLocation',
            title: 'Go to Location',
            arguments: [record.from]
        };
        this.iconPath = new vscode.ThemeIcon('arrow-right');
        this.contextValue = 'jumpRecord';
    }
}

/**
 * 从指定 uri 的文档中读取某一行的内容
 */
function readLineFromFile(uri: vscode.Uri, line: number): string | undefined {
    try {
        const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
        if (doc && line >= 0 && line < doc.lineCount) {
            return doc.lineAt(line).text;
        }
    } catch {
        // 忽略读取失败的情况
    }
    return undefined;
}
