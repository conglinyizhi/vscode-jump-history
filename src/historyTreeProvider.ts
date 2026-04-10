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
  private expanded: boolean = true; // 默认全部展开
  private treeView: vscode.TreeView<HistoryNode> | undefined;
  private nodeParentMap = new Map<HistoryNode, HistoryNode>();

  registerTreeView(treeView: vscode.TreeView<HistoryNode>) {
    this.treeView = treeView;
  }

  getTreeItem(element: HistoryNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: HistoryNode): Thenable<HistoryNode[]> {
    if (!element) {
      return Promise.resolve(this.buildPath());
    }
    return Promise.resolve(element.children);
  }

  getParent(element: HistoryNode): vscode.ProviderResult<HistoryNode> {
    return this.nodeParentMap.get(element);
  }

  private buildPath(): HistoryNode[] {
    this.nodeParentMap.clear();
    if (this.stack.length === 0) {
      return [];
    }

    let nextNode: HistoryNode | undefined;
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const record = this.stack[i];
      const node = new HistoryNode(record, nextNode ? [nextNode] : [], i, this.expanded);
      if (nextNode) {
        this.nodeParentMap.set(nextNode, node);
      }
      nextNode = node;
    }

    return nextNode ? [nextNode] : [];
  }

  addJump(record: JumpRecord) {
    this.stack.push(record);
    // 新增节点时自动展开
    this.expanded = true;
    this._onDidChangeTreeData.fire();
    // 自动 reveal 最新节点
    if (this.treeView) {
      setTimeout(() => {
        const path = this.buildPath();
        if (path.length > 0) {
          let deepest = path[0];
          while (deepest.children.length > 0) {
            deepest = deepest.children[0];
          }
          Promise.resolve(this.treeView!.reveal(deepest, { expand: true, focus: false, select: true })).catch(() => {});
        }
      }, 50);
    }
  }

  clear() {
    this.stack = [];
    this._onDidChangeTreeData.fire();
  }

  async expandAll() {
    this.expanded = true;
    this._onDidChangeTreeData.fire();
    // 通过 TreeView API 递归展开所有节点
    if (this.treeView) {
      const roots = await this.getChildren();
      if (roots.length > 0) {
        setTimeout(() => {
          this.expandNode(roots[0]);
        }, 50);
      }
    }
  }

  async collapseAll() {
    this.expanded = false;
    this._onDidChangeTreeData.fire();
    // 通过 TreeView API 折叠所有节点
    if (this.treeView) {
      await vscode.commands.executeCommand('workbench.actions.treeView.jumpHistory.collapseAll');
    }
  }

  private async expandNode(node: HistoryNode) {
    await this.treeView!.reveal(node, { expand: true, focus: false, select: false });
    for (const child of node.children) {
      await this.expandNode(child);
    }
  }

  isExpanded(): boolean {
    return this.expanded;
  }

  copySelected(nodes: readonly HistoryNode[]) {
    const lines = nodes.map((node) => {
      return `${node.label}${node.description || ''}`.trim();
    });
    vscode.env.clipboard.writeText(lines.join('\n'));
  }
}

export class HistoryNode extends vscode.TreeItem {
  children: HistoryNode[] = [];

  constructor(
    public readonly record: JumpRecord,
    children: HistoryNode[],
    public readonly depth: number,
    expanded: boolean,
  ) {
    const toLine = record.to.range.start.line + 1;
    const fromLine = record.from.range.start.line + 1;
    const toFile = path.basename(record.to.uri.fsPath);
    const fromFile = path.basename(record.from.uri.fsPath);

    // 读取跳转之前（来源位置）的代码内容
    const codeLine = readLineFromFile(record.from.uri, record.from.range.start.line);

    super(
      `${fromFile}:${fromLine} → ${toFile}:${toLine}`,
      children.length > 0
        ? expanded
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );

    this.children = children;
    this.description = codeLine ? `  ${codeLine.trim()}` : '';
    this.tooltip = `From: ${record.from.uri.fsPath}:${fromLine}\nTo: ${record.to.uri.fsPath}:${toLine}`;
    this.command = {
      command: 'jumpHistory.goToLocation',
      title: 'Go to Location',
      arguments: [record.from],
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
    const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    if (doc && line >= 0 && line < doc.lineCount) {
      return doc.lineAt(line).text;
    }
  } catch {
    // 忽略读取失败的情况
  }
  return undefined;
}
