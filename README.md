# LINE 打卡機器人 v15 (n8n Workflow) - StoreOps Bot

這是一個基於 n8n 開發的進階 LINE 打卡系統，支援多門市管理、業績回報、拍照存證以及 Google Sheets 自動紀錄。

## 🌟 主要功能
- **全自動打卡流程**：上班/下班/中途打卡。
- **門市管理**：自動判斷門市及開攤狀態（首位開攤/小幫手/中途）。
- **業績彙整**：在下班及中途打卡時自動詢問業績並紀錄。
- **證據紀錄**：整合 Google Drive，打卡時需拍照並自動重新命名 (格式：`[店名][暱稱] 2026/02/05 下午 4:11:47.jpg`)。
- **跨平台支持**：支持繁體中文與越南語切換。
- **異常預防**：自動校正 Google Sheet 資料行數與日期格式，避免重複紀錄或更新失敗。

## 📁 檔案說明
- `line-clock-in-bot-v15-unified.json`: 最終整合完成的 n8n 工作流檔案。

## 🚀 如何使用
1. 在 n8n 中點擊 "Import from File" 並選擇 `line-clock-in-bot-v15-unified.json`。
2. 配置相關認證 (Credentials)：
   - Google Sheets API
   - LINE Messaging API
   - Google Drive API
3. 確保 Google Sheet 的試算表 ID 與工作表名稱正確。

## 🛠️ 維護與技術細節
- 本版本已修正 `E0` 行數錯誤以及日期格式不一致導致的重複紀錄問題。
- 採用 `YYYY/MM/DD` 作為跨節點的標準日期比對格式。
- 工作流中包含自動錯誤導引至 FALLBACK 的處理邏輯。
