# VSCode Jump History

> [English README](./README.en.md)

自动记录你通过 **Ctrl + 点击** 或 **Go to Definition (F12)** 产生的源码跳转堆栈，并在左侧 Explorer 边栏中展示。

## 🚀 快速链接

- **DeepWiki 文档**: [https://deepwiki.com/conglinyizhi/vscode-jump-history](https://deepwiki.com/conglinyizhi/vscode-jump-history)

## ✨ 功能

- 自动追踪跨文件/跨位置的 Definition、Reference、Implementation、Type Definition、Declaration 跳转
- 在 Explorer 的 **Jump History** 视图中以嵌套堆栈形式展示跳转路径
- 点击历史节点可快速回到对应位置
- 支持一键清空历史
- 对 Go 语言特殊处理，支持包导入相关的 URL 跳转记录

## 🛠 使用方式

1. 在 VSCode 中打开本项目
2. 按 `F5` 启动 Extension Host 进行测试
3. 在测试窗口中打开任意代码项目，使用 `Ctrl + 点击` 或 `F12` 跳转定义
4. 左侧 Explorer 面板中的 **Jump History** 会自动记录跳转链路

## 📁 项目结构

```
.
├── src/
│   ├── extension.ts           # 插件主入口，监听编辑器变化并检测跳转
│   └── historyTreeProvider.ts # TreeView 数据提供者，渲染跳转堆栈
├── out/                       # 编译输出
├── package.json               # 插件配置
└── tsconfig.json              # TypeScript 配置
```

## 🔬 原理

插件通过监听 `onDidChangeActiveTextEditor` 和 `onDidChangeTextEditorSelection` 事件，在检测到显著的位置变化后，利用 VSCode 内置的 `vscode.executeDefinitionProvider` 等 Provider 反推该变化是否由一次符号导航操作引起。如果是，则将 `from → to` 的记录压入堆栈并在侧边栏中渲染。

## 📝 声明

- 本项目使用 [**kimi-cli**](https://github.com/moonshot-ai/kimi-cli) 辅助构建。
- 项目中绝大多数代码由 LLM 生成，属于 **Vibe Coding** 实践产物。

## 📜 许可证

[MIT](./LICENSE) © conglinyizhi
