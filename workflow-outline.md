# LINE 打卡機器人工作流程規畫書 (v3.2 - Multi-Lang)

## 📌 概述
本系統為全功能的員工考勤與業績管理系統，支援多語系 (繁體中文/越南文)、多人同時段排班與彈性開攤邏輯，並包含 **結算補正機制**。
核心觸發指令：**「打卡」**

---

## 🚀 核心優化邏輯 (v3.2 Update)
1.  **多語系支援 (Multi-Language)**：
    *   **註冊時**：新員工需先選擇語言 (🇹🇼 繁中 / 🇻🇳 越文)。
    *   **對話中**：所有回覆訊息、選單皆根據該員工的語言偏好顯示。
    *   **指令辨識**：支援雙語指令 (如 `上班` / `Bắt đầu`)。

2.  **鈔票 vs 總結算**：
    *   **營業中回報**：通常只數鈔票 (快速回報)。
    *   **收攤結算**：數鈔票 + 零錢 (精準總額)。
    *   **業績補正**：允許收攤金額 < 營業中金額 (例如找零誤差或拿去做支出)，系統會記錄為「最終結算」。

3.  **單一狀態管理**：
    *   所有操作皆依賴 `current_step` 與 `temp_data` 欄位運作，確保流程封閉且強健。

---

## 🔄 詳細判斷流程 (State-Driven V6 - Multi-Lang)

> 核心邏輯：**功能導向狀態轉移 (Function-Based State Transition)**
> 狀態儲存：`員工管理` Sheet (欄位: `current_step`, `temp_data`, `last_active`, `language`)

此版本加入了 **多語系支援 (Multi-Language Support)**，針對台灣與越南员工提供對應介面。

```mermaid
flowchart TD
    %% --- 入口 ---
    Start([LINE Webhook 觸發]) --> Init[取得 UserID / 訊息內容]
    Init --> CheckUser{查詢員工表?}
    
    %% ==========================================
    %% 1. 註冊功能流程 (Function: Register)
    %% ==========================================
    CheckUser -- 無此 ID --> AutoRegister[自動註冊]
    subgraph RegisterFunc [註冊功能區]
        AutoRegister --> GetProfile[取得 LINE 個資]
        GetProfile --> SetStateLang[<b>標記狀態: WAIT_LANG</b><br/>(等待選語言)]
        SetStateLang --> ReplyLang[回覆 Flex Menu:<br/>🇹🇼 繁體中文 | 🇻🇳 Tiếng Việt]
        
        ReplyLang --> WaitLang([等待選擇...])
        WaitLang --> CheckLang{輸入為語言?}
        
        CheckLang -- 是 --> SetLang[<b>更新員工表</b><br/>Language: zh-TW / vi-VN]
        SetLang --> SetStateReg[<b>標記狀態: WAIT_REG_PHOTO</b><br/>(等待證件照)]
        SetStateReg --> ReplyReg[回覆 (依語言):<br/>請拍攝證件照 / Vui lòng chụp ảnh ID]
    end

    %% ==========================================
    %% 2. 狀態檢查與路由 (State Routing)
    %% ==========================================
    CheckUser -- 有此 ID --> ReadState[讀取 current_step & last_active]
    
    %% --- Opt: 超時檢查 (Timeout Check) ---
    ReadState --> CheckTimeout{超過 10 分鐘?}
    CheckTimeout -- 是 --> ResetTimeout[<b>重置狀態 (IDLE)</b>]
    ResetTimeout --> ReplyTimeout[回覆 (依語言):<br/>操作逾時 / Hết thời gian]
    ReplyTimeout --> EndCmd
    
    %% --- Opt: 取消指令 (Cancellation) ---
    CheckTimeout -- 否 --> CheckCancel{輸入為 '取消'?<br/>(或 Cancel/Hủy)}
    CheckCancel -- 是 --> DoCancel[<b>重置狀態 (IDLE)</b>]
    DoCancel --> ReplyCancel[回覆 (依語言):<br/>已取消 / Đã hủy]
    ReplyCancel --> EndCmd

    %% --- 正常路由 ---
    CheckCancel -- 否 --> SwitchState{判斷狀態}

    %% --- 閒置狀態 (IDLE) - 接收指令 ---
    SwitchState -- "IDLE" --> CmdCheck{指令判斷}
    CmdCheck -- "上班 / Bắt đầu" --> SetStateStore[<b>標記狀態: WAIT_STORE</b>]
    SetStateStore --> ReplyStore[回覆 (依語言):<br/>請選擇門市 / Chọn cửa hàng]
    
    CmdCheck -- "下班 / Kết thúc" --> CheckRev{需回報業績?}
    CheckRev -- 否 --> SetStateOut[<b>標記狀態: WAIT_PHOTO_OUT</b><br/>(等待下班照)<br/>暫存: 行號]
    SetStateOut --> ReplyOut[回覆 (依語言):<br/>請拍攝下班照 / Chụp ảnh tan ca]

    %% --- 狀態: 等待選店 (WAIT_STORE) ---
    SwitchState -- "WAIT_STORE" --> StoreInput{輸入為文字?}
    StoreInput -- 是 --> SetStateIn[<b>標記狀態: WAIT_PHOTO_IN</b><br/>(等待上班照)<br/>暫存: 店名]
    SetStateIn --> ReplyIn[回覆 (依語言):<br/>請拍攝上班照 / Chụp ảnh đi làm]

    %% ==========================================
    %% 3. 照片處理 (Photo & State Mapping)
    %% ==========================================
    SwitchState -- "WAIT_REG_PHOTO" --> PhotoProcess
    SwitchState -- "WAIT_PHOTO_IN" --> PhotoProcess
    SwitchState -- "WAIT_PHOTO_OUT" --> PhotoProcess
    
    CheckLang -.-> PhotoProcess  %% 接回註冊的照片等待

    subgraph PhotoFunc [照片處理與回覆中心]
        PhotoProcess{收到圖片?} -- 否 (文字) --> ReplyErrPhoto[回覆: 請傳送照片<br/>(或輸入'取消')]
        PhotoProcess -- 是 --> CommonProc[下載 -> 上傳 Drive -> 分享]
        CommonProc --> ActionSwitch{<b>依據狀態決定去處</b>}

        %% 分支 A: 註冊流程
        ActionSwitch -- "WAIT_REG_PHOTO" --> ExecReg[<b>執行註冊寫入</b><br/>更新: 證件照欄位<br/>狀態: 在職]
        ExecReg --> ReplyDoneReg[<b>回覆註冊成功</b><br/>顯示: 員工資訊]

        %% 分支 B: 上班流程
        ActionSwitch -- "WAIT_PHOTO_IN" --> ExecIn[<b>執行上班打卡</b><br/>讀取暫存 (店名)<br/>新增: 上班紀錄+照片]
        ExecIn --> ReplyDoneIn[<b>回覆上班成功</b><br/>顯示: 上班時間/地點]
        
        %% 分支 C: 下班流程
        ActionSwitch -- "WAIT_PHOTO_OUT" --> ExecOut[<b>執行下班打卡</b><br/>讀取暫存 (行號)<br/>更新: 下班紀錄+照片<br/>計算: 工時]
        ExecOut --> ReplyDoneOut[<b>回覆下班成功</b><br/>顯示: 下班時間/工時]

        ReplyDoneReg & ReplyDoneIn & ReplyDoneOut --> Reset[<b>重置狀態 (IDLE)</b>]
    end
```

## 多語系實作策略

1.  **資料庫擴充**：
    *   `員工管理` 表單新增 `Language` 欄位 (預設 `zh-TW`)。
    *   數值：`zh-TW` (台灣), `vi-VN` (越南)。

2.  **註冊流程變更**：
    *   新用戶第一次互動時，不直接要照片，而是先跳出 **語言選擇選單 (Flex Message)**。
    *   選擇語言後，將偏好寫入 `Language` 欄位，之後所有對話皆依據此欄位決定文案。

3.  **關鍵字擴充**：
    *   **上班**：同時辨識 `上班`, `Clock In`, `Bắt đầu`.
    *   **下班**：同時辨識 `下班`, `Clock Out`, `Kết thúc`.
    *   **取消**：同時辨識 `取消`, `Cancel`, `Hủy`.

---

## 🗄️ 資料庫結構 (Google Sheets)

### 3. 員工工時紀錄 (`Timesheet`)
(無變動，略)

---

## 💡 補正與紀錄機制
(無變動，略)
