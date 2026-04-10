import * as vscode from 'vscode';
import { HistoryTreeProvider, HistoryNode, JumpRecord } from './historyTreeProvider';

let historyProvider: HistoryTreeProvider;
let lastPosition: { uri: vscode.Uri; range: vscode.Range } | undefined;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let isNavigatingFromHistory = false;
let lastHistoryTarget: { uri: vscode.Uri; range: vscode.Range } | undefined;

export function activate(context: vscode.ExtensionContext) {
  historyProvider = new HistoryTreeProvider();
  const treeView = vscode.window.createTreeView('jumpHistory', {
    treeDataProvider: historyProvider,
    canSelectMany: true,
  });
  historyProvider.registerTreeView(treeView);
  context.subscriptions.push(treeView);
  context.subscriptions.push({ dispose: () => historyProvider.dispose() });

  const updateLastPosition = (editor: vscode.TextEditor | undefined) => {
    if (editor) {
      lastPosition = { uri: editor.document.uri, range: editor.selection };
    }
  };

  updateLastPosition(vscode.window.activeTextEditor);

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        checkAndRecordJump(editor.document.uri, editor.selection);
      }
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((e) => {
      checkAndRecordJump(e.textEditor.document.uri, e.selections[0]);
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(() => {
      historyProvider.refreshDecorations();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('jumpHistory.clear', () => {
      historyProvider.clear();
      updateLastPosition(vscode.window.activeTextEditor);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('jumpHistory.expandAll', () => {
      historyProvider.expandAll();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('jumpHistory.copy', (node: HistoryNode) => {
      const selection = treeView.selection;
      const targets =
        node && selection.length > 0 && selection.includes(node)
          ? selection
          : node
            ? [node]
            : selection.length > 0
              ? selection
              : [];
      if (targets.length > 0) {
        historyProvider.copySelected(targets);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('jumpHistory.collapseAll', () => {
      historyProvider.collapseAll();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jumpHistory.goToLocation',
      async (location: { uri: vscode.Uri; range: vscode.Range }) => {
        isNavigatingFromHistory = true;
        lastHistoryTarget = location;
        try {
          const doc = await vscode.workspace.openTextDocument(location.uri);
          const editor = await vscode.window.showTextDocument(doc);
          editor.selection = new vscode.Selection(location.range.start, location.range.end);
          editor.revealRange(location.range, vscode.TextEditorRevealType.InCenter);
          lastPosition = { uri: editor.document.uri, range: editor.selection };
        } finally {
          setTimeout(() => {
            isNavigatingFromHistory = false;
          }, 800);
        }
      },
    ),
  );
}

async function checkAndRecordJump(uri: vscode.Uri, range: vscode.Range) {
  if (isNavigatingFromHistory) {
    lastPosition = { uri, range };
    return;
  }

  if (!lastPosition) {
    lastPosition = { uri, range };
    return;
  }

  const isSameFile = lastPosition.uri.toString() === uri.toString();
  const lineDiff = Math.abs(lastPosition.range.start.line - range.start.line);

  // 忽略微小的变化（同一文件内 5 行以内）
  if (isSameFile && lineDiff < 5) {
    lastPosition = { uri, range };
    return;
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(async () => {
    if (isNavigatingFromHistory) {
      lastPosition = { uri, range };
      return;
    }

    // 如果当前位置恰好是最近一次历史回跳的目标位置，说明是回跳的副作用，不应记录
    if (
      lastHistoryTarget &&
      lastHistoryTarget.uri.toString() === uri.toString() &&
      lastHistoryTarget.range.start.line === range.start.line
    ) {
      lastPosition = { uri, range };
      lastHistoryTarget = undefined;
      return;
    }

    try {
      const isGoRelated =
        lastPosition!.uri.fsPath.endsWith('.go') || uri.fsPath.endsWith('.go') || uri.toString().includes('.go');

      // 排除纯 URL 跳转（Go 的包导入跳转除外）
      if (!isGoRelated && (uri.scheme === 'http' || uri.scheme === 'https')) {
        lastPosition = { uri, range };
        return;
      }

      const providers = [
        'vscode.executeDefinitionProvider',
        'vscode.executeReferenceProvider',
        'vscode.executeImplementationProvider',
        'vscode.executeTypeDefinitionProvider',
        'vscode.executeDeclarationProvider',
      ];

      const results = await Promise.all(
        providers.map((cmd) =>
          Promise.resolve(
            vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
              cmd,
              lastPosition!.uri,
              lastPosition!.range.start,
            ),
          ).catch(() => undefined),
        ),
      );

      const isTarget = results.some(
        (locations: (vscode.Location[] | vscode.LocationLink[]) | undefined) =>
          locations &&
          locations.length > 0 &&
          locations.some((loc: vscode.Location | vscode.LocationLink) => locationMatches(loc, uri, range)),
      );

      if (isTarget) {
        const record: JumpRecord = {
          from: lastPosition!,
          to: { uri, range },
          timestamp: Date.now(),
        };
        historyProvider.addJump(record);
      }

      lastPosition = { uri, range };
    } catch (err) {
      console.error('[Jump History] Error checking jump:', err);
      lastPosition = { uri, range };
    }
  }, 150);
}

function locationMatches(loc: vscode.Location | vscode.LocationLink, uri: vscode.Uri, range: vscode.Range): boolean {
  if ('targetUri' in loc) {
    return loc.targetUri.toString() === uri.toString() && loc.targetRange.start.line === range.start.line;
  }
  return loc.uri.toString() === uri.toString() && loc.range.start.line === range.start.line;
}

export function deactivate() {}
