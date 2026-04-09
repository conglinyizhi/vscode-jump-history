# VSCode Jump History — Agent 指南

> 本文件面向 AI 编程助手。如果你刚接触这个项目，请先阅读本文以了解项目结构、构建方式与开发约定。

---

## 项目概览

**vscode-jump-history** 是一个 VS Code 扩展插件，用于自动记录用户通过 **Ctrl + 点击** 或 **Go to Definition (F12)** 产生的源码跳转堆栈，并在左侧 Explorer 边栏中以嵌套树形结构展示跳转路径。点击历史节点可快速回到对应位置。

- **名称**: `vscode-jump-history`
- **版本**: `0.0.1`
- **最低 VS Code 引擎版本**: `^1.74.0`
- **入口文件**: `out/extension.js`
- **激活时机**: `onStartupFinished`（VS Code 启动完成后自动激活）

---

## 技术栈

- **语言**: TypeScript 5.x
- **运行时**: Node.js（VS Code Extension Host）
- **包管理器**: pnpm（存在 `pnpm-lock.yaml`）
- **核心依赖**:
  - `@types/vscode`: VS Code Extension API 类型定义
  - `@types/node`: Node.js 类型定义
  - `typescript`: 编译器

---

## 项目结构

```
.
├── src/
│   ├── extension.ts           # 插件主入口：注册事件监听、命令、跳转检测逻辑
│   └── historyTreeProvider.ts # TreeDataProvider：管理 JumpRecord 堆栈并渲染树节点
├── out/                       # TypeScript 编译输出（CommonJS + SourceMap）
├── package.json               # 插件清单（manifest）：views、commands、menus、activationEvents
├── tsconfig.json              # TypeScript 编译配置
├── pnpm-lock.yaml             # pnpm 锁定文件
├── .vscode/
│   ├── launch.json            # Extension Host 调试配置（F5 启动）
│   └── tasks.json             # 默认构建任务：运行 `npm run watch`
├── .vscodeignore              # 打包 .vsix 时排除的文件列表
├── vscode-jump-history-0.0.1.vsix  # 已构建的插件包
└── README.md                  # 面向用户的说明文档
```

### 核心模块说明

#### `src/extension.ts`

- 导出 `activate` 与 `deactivate` 函数。
- 在 `activate` 中：
  1. 实例化 `HistoryTreeProvider` 并注册到 `jumpHistory` Tree View。
  2. 订阅 `onDidChangeActiveTextEditor` 与 `onDidChangeTextEditorSelection` 事件，检测编辑器/选区变化。
  3. 注册两条命令：`jumpHistory.clear`（清空历史）和 `jumpHistory.goToLocation`（跳转到指定位置）。
- `checkAndRecordJump(uri, range)` 是核心检测逻辑：
  - 忽略同一文件 5 行以内的微小变化。
  - 对非 Go 相关文件排除 `http`/`https` 纯 URL 跳转。
  - 通过防抖（debounce，150ms）后，调用 `vscode.executeDefinitionProvider` 等 5 个 Provider 命令反推上一次位置是否指向当前位置。
  - 若匹配，则将 `from → to` 的跳转记录压入 `HistoryTreeProvider`。

#### `src/historyTreeProvider.ts`

- `JumpRecord` 接口：描述一次跳转（from、to、timestamp）。
- `HistoryTreeProvider`：实现 `vscode.TreeDataProvider<HistoryNode>`，内部维护一个 `JumpRecord[]` 堆栈。
- `buildPath()` 将堆栈从底向上构建为嵌套树节点（每个节点只有一个子节点），形成一条线性链路。
- `HistoryNode`：继承 `vscode.TreeItem`，显示目标文件基名与行号，描述为来源文件基名与行号，点击时触发 `jumpHistory.goToLocation`。

---

## 构建与开发命令

所有脚本定义在 `package.json` 的 `scripts` 字段中：

```bash
# 一次性编译 TypeScript
pnpm run compile

# 监听模式编译（开发时常用）
pnpm run watch
```

编译产物输出到 `out/` 目录，模块格式为 `CommonJS`，目标版本 `ES2020`，启用 `sourceMap`。

### 调试方式

1. 在 VS Code 中打开本项目。
2. 按 `F5`（或运行调试配置 "Run Extension"）。
3. 这会先执行默认构建任务 `npm run watch`，然后启动一个新的 Extension Host 窗口。
4. 在 Extension Host 窗口中打开任意代码项目，使用 `Ctrl + 点击` 或 `F12` 跳转定义，观察左侧 Explorer 的 **Jump History** 视图。

---

## 代码风格与约定

- **严格模式**: `tsconfig.json` 中启用了 `"strict": true`，要求所有代码符合 TypeScript 严格类型检查。
- **文件命名**: 使用小写驼峰（如 `extension.ts`、`historyTreeProvider.ts`）。
- **导入风格**: VS Code API 使用 `import * as vscode from 'vscode'`，Node 内置模块使用 `import * as path from 'path'`。
- **注释语言**: 项目中的注释和文档以**中文**为主。
- **错误处理**: Provider 查询使用 `.catch(() => undefined)` 静默忽略异常，整体逻辑包裹在 `try/catch` 中，错误输出到控制台并回退 `lastPosition`。

---

## 测试策略

- **当前状态**: 项目中**没有**自动化单元测试或集成测试。
- **测试方式**: 完全依赖手动在 Extension Host 中验证：
  1. 启动 Extension Host（F5）。
  2. 打开目标代码仓库，执行跳转操作。
  3. 检查 Jump History 视图是否正确记录、树形渲染是否正常、点击回跳是否准确、清空按钮是否生效。

---

## 打包与发布

- 使用 `vsce`（或 `@vscode/vsce`）工具打包为 `.vsix`：
  ```bash
  vsce package
  ```
- `.vscodeignore` 已配置排除以下文件：
  - `.vscode/`
  - `.vscode-test/`
  - `src/`
  - `.gitignore`
  - `tsconfig.json`
  - `pnpm-lock.yaml`
  - `node_modules/`
- 项目根目录已存在构建好的 `vscode-jump-history-0.0.1.vsix`。

---

## 安全与注意事项

- 插件通过 `vscode.commands.executeCommand` 调用内部 Provider 命令（如 `vscode.executeDefinitionProvider`）来反推跳转关系，这些命令是 VS Code 官方暴露的私有 API，行为在不同版本中可能略有差异。
- `isNavigatingFromHistory` 标志用于防止从历史记录点击回跳时触发新的跳转记录，避免循环。该标志在 `finally` 块中通过 `setTimeout(..., 300)` 复位，若修改此逻辑需注意竞态条件。
- 当前对 Go 文件做了特殊处理（`isGoRelated`），允许记录可能涉及 URL 的跳转；修改此逻辑时需考虑是否影响其他语言。

---

## 快速参考

| 操作     | 命令                       |
| -------- | -------------------------- |
| 编译     | `pnpm run compile`         |
| 监听编译 | `pnpm run watch`           |
| 调试     | 按 `F5`（Run Extension）   |
| 打包     | `vsce package`             |
| 清空历史 | `jumpHistory.clear`        |
| 回跳位置 | `jumpHistory.goToLocation` |
