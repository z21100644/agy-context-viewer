# 開發與安裝指引 (AGENTS.md)

## 原始碼修改規範

- 前端介面請編輯 `src/renderer/`（`template.html`、`styles.css`、`main.js`），修改後執行 `npm run build:renderer` 產出 `meter-renderer.js`。
- 變更後請執行 `npm test` 驗證核心邏輯、渲染元件與 ASAR 封裝還原完整性。
- 執行期僅依賴 Node.js 內建模組與隨附的 `asar-engine.js`，無需執行 `npm install`。
- 維持純本機唯讀原則：禁止新增任何外部網路連線、遙測或磁碟背景帳本寫入。

## 安裝與熱掛載

需求為 Node.js `>= 22.4.0`（Python 為選配附件解析器）。

```sh
node cli.js check
node cli.js install
node cli.js status
```

- 可透過 `--path "<app.asar 路徑>"` 指定自訂安裝位置。
- 使用 CDP 熱注入時請保持 Antigravity 開啟，**切勿**從代理程式內部強制終止 `Antigravity.exe`。
- `node cli.js live`：免修改 `app.asar`，僅對目前執行中視窗進行記憶體熱掛載。
- `node cli.js restore`：校驗 SHA-256 並無損還原安裝前備份的官方 `app.asar`。
