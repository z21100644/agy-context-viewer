# Antigravity 极简对话上下文查看器

[English](./README.md) | **简体中文** | [繁體中文](./README.zh-TW.md)

专为 Google Antigravity 2.x 打造的轻量、纯本地、零外部依赖对话上下文与生成性能监控插件，内置 **English / 简体中文 / 繁體中文** 多语言支持。

## 功能特色

- **单一自适应顶栏胶囊**：整合容量圆环、等宽百分比与动态生成速率（支持 `wide`／`compact`／`ring-only` 迟滞收折；空闲时自动隐藏速率占位符）。
- **多语言自适应与一键切换**：自动跟随 IDE／系统语言（非中文环境默认 English），面板顶栏内置 `EN`／`简`／`繁` 快捷切换按钮（跨重启持久化记忆），CLI 同时支持 `--lang` 参数。
- **核心容量与高占用提醒**：实时呈现实际上下文占比、缓存读取／新增输入／模型输出拆分与剩余可用容量；高占用（`>= 90%`）或请求异常时显示精炼单行提醒与 `/compact` 命令胶囊。
- **生成性能四栏格与速度分级**：并列显示「整体速率」（采用含首字延迟的端到端计算，含 `极速` `>=60`、`流畅` `>=25`、`良好` `>=10`、`偏慢` `<10 tok/s` 四级提醒标签；悬停可查看纯流式速率与首字延迟占比）、「首字延迟」、「总耗时」与「本轮产出」。
- **当前上下文占比抽屉**：按需展开堆叠比例条与精确收敛至 `100%` 的分类占比（系统提示与工具定义、工具调用与输出、模型回复、思考过程、用户消息、压缩摘要、附件内容），自动以最近一次 `/compact` 压缩点为界统计有效窗口。
- **纯本地零遥测**：100% 只读访问本地 `127.0.0.1` 接口，零外部网络请求、零自动更新检查、零后台历史账本写入；自动跟随 IDE 深浅色主题并支持手动切换。

---

## 快速安装与还原

### 方式一：一键脚本（推荐）
1. 先将 ZIP 压缩包完整解压至任意文件夹。
2. **Windows**：直接双击运行 `install.bat` 即可完成持久化安装并热挂载至当前窗口（无需关闭或重启 Antigravity；若系统未全局安装 Node.js，脚本会自动借用 Antigravity 内置运行环境完成部署）。如需卸载还原请双击 `uninstall.bat`。
3. **macOS / Linux**：在终端运行 `./install.sh` 安装，或 `./uninstall.sh` 还原。

### 方式二：CLI 命令行管理
需求：Node.js `>= 22.4.0`（零 `npm install` 第三方包依赖；Python 为选配，仅用于 PDF/Office 深度附件解析，普通文本与图片均由 Node.js 原生即时解析）。

```bash
# 1. 环境预检（自动检测语言，也可通过 --lang en|zh-CN|zh-TW 指定）
node cli.js check

# 2. 持久化注入 app.asar 并即时热挂载至当前运行中的窗口（无需重启）
node cli.js install

# 3. 查看当前安装与窗口实时状态
node cli.js status

# 4. 仅对当前窗口进行免改磁盘热挂载
node cli.js live

# 5. 无损还原安装前备份的原始 app.asar
node cli.js restore
```

> **提示**：当 Antigravity 客户端版本更新覆盖 `app.asar` 后，重新运行一次 `install.bat` 或 `node cli.js install` 即可重新挂载。

---

## 二次开发与重新打包

前端界面源码位于 `src/renderer/`（`template.html`、`styles.css`、`main.js`），切勿直接手改构建产物 `meter-renderer.js`：

```bash
# 重新编译单文件 Shadow DOM 渲染组件
npm run build:renderer

# 运行完整单元与集成测试
npm test

# 重新生成跨平台发布压缩包
npm run package
```

## 文件结构

```text
antigravity-context-viewer/
├── src/renderer/              # 前端界面源码 (template.html / styles.css / main.js)
├── scripts/                   # 零依赖渲染层构建与发布打包脚本
├── meter-core.js              # 上下文统计、速度分级、占比收敛、错误分类与多语言核心
├── meter-collector.js         # 本地只读对话轨迹与原生图片/文本解析器
├── meter-main.js              # Electron 主进程窗口挂载与只读 IPC 桥接
├── meter-renderer.js          # 构建生成的单文件 Shadow DOM 渲染组件
├── install.js / restore.js    # SHA-256 完整性校验的 ASAR 安装与无损还原器
├── asar-engine.js             # 原生 Node.js ASAR 封装引擎
├── install.bat / uninstall.bat# Windows 一键安装与无损还原脚本
└── cli.js                     # 多语言命令行管理工具
```
