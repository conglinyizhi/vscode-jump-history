import * as vscode from 'vscode';
import * as path from 'path';

export interface JumpRecord {
  from: { uri: vscode.Uri; range: vscode.Range };
  to: { uri: vscode.Uri; range: vscode.Range };
  timestamp: number;
}

const COLOR_POOL_SIZE = 6;

const TREE_ICON_COLORS = Array.from({ length: COLOR_POOL_SIZE }, (_, i) => {
  return new vscode.ThemeColor(`jumpHistory.highlight${i + 1}`);
});

const EDITOR_BG_COLORS = [
  'rgba(180, 100, 100, 0.15)',
  'rgba(100, 140, 100, 0.15)',
  'rgba(100, 120, 160, 0.15)',
  'rgba(160, 140, 80, 0.15)',
  'rgba(140, 100, 140, 0.15)',
  'rgba(80, 140, 150, 0.15)',
];

export class HistoryTreeProvider implements vscode.TreeDataProvider<HistoryNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<HistoryNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private stack: JumpRecord[] = [];
  private expanded: boolean = true; // 默认全部展开
  private treeView: vscode.TreeView<HistoryNode> | undefined;
  private nodeParentMap = new Map<HistoryNode, HistoryNode>();
  private decorationTypes: vscode.TextEditorDecorationType[];

  constructor() {
    this.decorationTypes = EDITOR_BG_COLORS.map((color) =>
      vscode.window.createTextEditorDecorationType({
        backgroundColor: color,
        isWholeLine: true,
        overviewRulerColor: color,
      })
    );
  }

  dispose() {
    this.decorationTypes.forEach((d) => d.dispose());
  }

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
      const colorIndex = i % COLOR_POOL_SIZE;
      const node = new HistoryNode(record, nextNode ? [nextNode] : [], i, this.expanded, colorIndex);
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
    this.refreshDecorations();
  }

  clear() {
    this.stack = [];
    this._onDidChangeTreeData.fire();
    this.refreshDecorations();
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

  refreshDecorations() {
    for (const editor of vscode.window.visibleTextEditors) {
      for (const dt of this.decorationTypes) {
        editor.setDecorations(dt, []);
      }
    }

    for (let i = 0; i < this.stack.length; i++) {
      const record = this.stack[i];
      const colorIndex = i % COLOR_POOL_SIZE;
      const dt = this.decorationTypes[colorIndex];

      const fromEditor = vscode.window.visibleTextEditors.find(
        (e) => e.document.uri.toString() === record.from.uri.toString()
      );
      if (fromEditor) {
        fromEditor.setDecorations(dt, [record.from.range]);
      }

      const toEditor = vscode.window.visibleTextEditors.find(
        (e) => e.document.uri.toString() === record.to.uri.toString()
      );
      if (toEditor) {
        toEditor.setDecorations(dt, [record.to.range]);
      }
    }
  }

  isExpanded(): boolean {
    return this.expanded;
  }

  copySelected(nodes: readonly HistoryNode[]) {
    const sorted = [...nodes].sort((a, b) => a.depth - b.depth);
    const lines = sorted.map((node) => {
      const relPath = vscode.workspace.asRelativePath(node.record.from.uri, false);
      const line = node.record.from.range.start.line + 1;
      return `at ${relPath}:${line}`;
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
    public readonly colorIndex: number,
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
    this.iconPath = new vscode.ThemeIcon('record', TREE_ICON_COLORS[colorIndex]);
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
