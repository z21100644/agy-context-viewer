# Antigravity 極簡對話上下文檢視器

[English](./README.md) | [简体中文](./README.zh-CN.md) | **繁體中文**

專為 Google Antigravity 2.x 打造的輕量、純本機、零外部依賴對話上下文與生成效能監控插件，內建 **English / 简体中文 / 繁體中文** 多語系支援。

## 功能特色

- **單一自適應頂欄膠囊**：整合容量圓環、等寬百分比與動態生成速率（支援 `wide`／`compact`／`ring-only` 遲滯收折；閒置時自動隱藏速率佔位符）。
- **多語系自動偵測與一鍵切換**：自動跟隨 IDE／系統語系（非中文語系預設 English），面板頂欄內建 `EN`／`简`／`繁` 快速切換按鈕（跨重啟持久化記憶），CLI 亦支援 `--lang` 參數。
- **核心容量與高占用提醒**：即時呈現實際上下文佔比、快取讀取／新增輸入／模型輸出拆分、剩餘可用容量；高占用（`>= 90%`）或請求異常時顯示精煉單行提醒與 `/compact` 指令膠囊。
- **生成效能四欄格與速度分級**：並列顯示「整體速率」（採含首字延遲之端到端計算，含 `極速` `>=60`、`流暢` `>=25`、`良好` `>=10`、`偏慢` `<10 tok/s` 四級提醒標籤；懸停可檢視純串流速率與首字延遲占比）、「首字延遲」、「總耗時」與「本輪產出」。
- **當前上下文占比抽屜**：按需展開堆疊比例條與精確收斂至 `100%` 的分類占比（系統提示與工具定義、工具呼叫與輸出、模型回覆、思考過程、使用者訊息、壓縮摘要、附件內容），自動以最近一次 `/compact` 壓縮點為界統計有效視窗。
- **純本機零遙測**：100% 唯讀存取本機 `127.0.0.1` 介面，零外部網路請求、零自動更新檢查、零背景歷史帳本寫入；自動跟隨 IDE 深淺色主題並支援手動切換。

---

## 快速安裝與還原

### 方式一：一鍵腳本（推薦）
1. 先將 ZIP 壓縮包完整解壓縮至任意資料夾。
2. **Windows**：直接雙擊執行 `install.bat` 即可完成持久化安裝並熱掛載至目前視窗（無需關閉或重啟 Antigravity；若系統未全域安裝 Node.js，腳本會自動借用 Antigravity 內建執行環境完成部署）。欲移除還原請雙擊 `uninstall.bat`。
3. **macOS / Linux**：於終端機執行 `./install.sh` 安裝，或 `./uninstall.sh` 還原。

### 方式二：CLI 命令列管理
需求：Node.js `>= 22.4.0`（零 `npm install` 第三方套件依賴；Python 為選配，僅用於 PDF/Office 深度附件解析，一般文字與圖片皆由 Node.js 原生即時解析）。

```bash
# 1. 環境預檢（自動偵測語系，亦可透過 --lang en|zh-CN|zh-TW 指定）
node cli.js check

# 2. 持久化注入 app.asar 並即時熱掛載至目前執行中的視窗（無需重啟）
node cli.js install

# 3. 查看目前安裝與視窗即時狀態
node cli.js status

# 4. 僅對目前視窗進行免改磁碟熱掛載
node cli.js live

# 5. 無損還原安裝前備份的原始 app.asar
node cli.js restore
```

> **提示**：當 Antigravity 客戶端版本更新覆寫 `app.asar` 後，重新執行一次 `install.bat` 或 `node cli.js install` 即可重新掛載。

---

## 二次開發與重新打包

前端介面原始碼位於 `src/renderer/`（`template.html`、`styles.css`、`main.js`），切勿直接手改建置產物 `meter-renderer.js`：

```bash
# 重新編譯單檔 Shadow DOM 渲染元件
npm run build:renderer

# 執行完整單元與整合測試
npm test

# 重新產出發佈壓縮包
npm run package
```

## 檔案結構

```text
antigravity-context-viewer/
├── src/renderer/              # 前端介面原始碼 (template.html / styles.css / main.js)
├── scripts/                   # 零依賴渲染層建置與發佈打包腳本
├── meter-core.js              # 上下文統計、速度分級、占比收斂、錯誤分類與多語系核心
├── meter-collector.js         # 本機唯讀對話軌跡與原生圖片/文字解析器
├── meter-main.js              # Electron 主程序視窗掛載與唯讀 IPC 橋接
├── meter-renderer.js          # 建置產出的單檔 Shadow DOM 渲染元件
├── install.js / restore.js    # SHA-256 完整性驗證之 ASAR 安裝與無損還原器
├── asar-engine.js             # 原生 Node.js ASAR 封裝引擎
├── install.bat / uninstall.bat# Windows 一鍵安裝與無損還原腳本
└── cli.js                     # 多語系命令列管理工具
```
