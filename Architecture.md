# 人員打卡系統 - 完整架構文檔

> **版本**: v1.0  
> **更新日期**: 2026-02-06  
> **適用平台**: N8N + LINE Bot + Google Sheets

---

## 📋 目錄

1. [系統概覽](#系統概覽)
2. [資料表結構](#資料表結構)
3. [完整節點架構](#完整節點架構)
4. [節點詳細配置](#節點詳細配置)
5. [連接關係](#連接關係)
6. [測試流程](#測試流程)

---

## 🎯 系統概覽

### 核心功能
- ✅ LINE Bot 打卡系統
- ✅ 雙語支援（中文/越南文）
- ✅ 自動判斷上下班
- ✅ 三種上班模式（開攤/中途/小幫手）
- ✅ 業績記錄與工時計算
- ✅ 照片上傳功能

### 技術架構
```
LINE Bot Webhook
    ↓
統一前置處理（時間計算 + 訊息解析）
    ↓
查詢員工資料（Google Sheets）
    ↓
超級路由（狀態機）
    ↓
業務邏輯分支（7個分支）
    ↓
資料寫入（Google Sheets）
    ↓
LINE 回覆訊息
```

### 狀態機流程
```
IDLE → 輸入「打卡」 → WAIT_STORE → WAIT_REVENUE（下班） → WAIT_PHOTO → IDLE
                                   ↓
                                WAIT_PHOTO（上班）→ IDLE
```

---

## 📊 資料表結構

### Google Sheets 表單 ID
```
1ILgphAVTKI5KIpCJKrT5anlF4GQK8YoHf8JAtAnMN7o
```

### Sheet 1: 員工資料 (gid=821432754)

| 欄位名稱 | 說明 | 範例 |
|---------|------|------|
| UserID | LINE User ID | U1234567890abcdef |
| 暱稱 | 員工暱稱 | 小明 |
| Language | 語言設定 | zh-TW / vi-VN |
| current_step | 當前狀態 | IDLE / WAIT_STORE / WAIT_PHOTO |
| temp_data | 暫存資料 | JSON 字串 |

### Sheet 2: 打卡記錄 (gid=1677241005)

| 欄位名稱 | 說明 | 範例 |
|---------|------|------|
| 日期 | 工作日 | 2026/02/06 |
| 員工姓名 | 員工暱稱 | 小明 |
| 店名 | 門市名稱 | 板橋店 |
| 上班時間 | HH:MM:SS | 09:30:00 |
| 下班時間 | HH:MM:SS | 18:00:00 |
| 工時 | 小數（小時） | 8.50 |
| 打卡記錄 | 操作記錄 | [上班][2026/02/06 09:30:00][照片URL] |
| 業績記錄 | 業績金額 | 5000 |
| 備註 | 額外說明 | 小幫手(免業績) |

### Sheet 3: 業績記錄 (gid=120439598)

| 欄位名稱 | 說明 | 範例 |
|---------|------|------|
| 日期 | 短日期 | 02/06 |
| 店名 | 門市名稱 | 板橋店 |
| 開攤時間 | 首位開攤時間 | 09:30 |
| 操作記錄 | 操作歷史 | [小明][開攤][2026/02/06 09:30:00] |

---

## 🏗️ 完整節點架構

### 總共 24 個節點

#### 第一層：接收與預處理（節點 1-5）
1. LINE Webhook
2. 統一前置處理
3. 查詢員工資料
4. 超級路由
5. 路由分支（7個出口）

#### 第二層：業務邏輯（節點 6-16）
6. 新員工歡迎
7. 設定語言
8. 查詢今日打卡記錄
9. 判斷上下班
10. 生成門市選單（上班）
11. 查詢今日業績
12. 業績輸入驗證
13. 組裝上班照片請求
14. 組裝下班照片請求
15. 處理照片上傳
16. 處理取消

#### 第三層：資料寫入與回覆（節點 17-24）
17. 合併所有路徑
18. 更新員工狀態
19. 準備 Sheets 更新
20. 判斷更新類型
21. 新增記錄（Append）
22. 更新記錄（Update）
23. 回覆 LINE
24. Webhook Response

---

## 🔧 節點詳細配置

---

### 節點 1: LINE Webhook

**類型**: `n8n-nodes-base.webhook`

**配置**:
```json
{
  "httpMethod": "POST",
  "path": "line-hr",
  "responseMode": "lastNode"
}
```

**說明**: 接收 LINE Bot 的 Webhook 事件

---

### 節點 2: 統一前置處理

**類型**: `n8n-nodes-base.code`

**JavaScript 程式碼**:
```javascript
const body = $input.item.json.body;
const events = body.events || [];

if (events.length === 0) {
  return { json: { error: 'no_events' } };
}

const evt = events[0];
const now = new Date();
const twOffset = 8 * 60 * 60 * 1000;
const twNow = new Date(now.getTime() + twOffset);

// 計算工作日（早上6點為分界線）
const workDayThreshold = 6;
let workDate = new Date(twNow);
if (twNow.getUTCHours() < workDayThreshold) {
  workDate.setDate(workDate.getDate() - 1);
}

const workDay = `${workDate.getUTCFullYear()}/${String(workDate.getUTCMonth()+1).padStart(2,'0')}/${String(workDate.getUTCDate()).padStart(2,'0')}`;
const shortDate = `${String(workDate.getUTCMonth()+1).padStart(2,'0')}/${String(workDate.getUTCDate()).padStart(2,'0')}`;
const currentTime = `${String(twNow.getUTCHours()).padStart(2,'0')}:${String(twNow.getUTCMinutes()).padStart(2,'0')}:${String(twNow.getUTCSeconds()).padStart(2,'0')}`;
const realDate = `${twNow.getUTCFullYear()}/${String(twNow.getUTCMonth()+1).padStart(2,'0')}/${String(twNow.getUTCDate()).padStart(2,'0')}`;
const fullTimestamp = `${realDate} ${currentTime}`;

const msgType = evt.message?.type || evt.type;
const replyToken = evt.replyToken;
const userId = evt.source?.userId || '';
let msgText = '';
let msgId = '';
let postbackData = '';

if (msgType === 'message' && evt.message.type === 'text') {
  msgText = evt.message.text || '';
  msgId = evt.message.id;
} else if (msgType === 'message' && evt.message.type === 'image') {
  msgId = evt.message.id;
} else if (evt.type === 'postback') {
  postbackData = evt.postback?.data || '';
}

// 解析 Postback 參數
const pbParams = {};
postbackData.split('&').forEach(p => { 
  const [k, v] = p.split('='); 
  if (k && v) pbParams[k] = decodeURIComponent(v); 
});

return {
  json: {
    msgType,
    msgText,
    msgId,
    postbackData,
    postbackAction: pbParams.action || '',
    postbackValue: pbParams.value || '',
    replyToken,
    userId,
    workDay,
    shortDate,
    currentTime,
    realDate,
    fullTimestamp,
    timestamp: now.getTime()
  }
};
```

**輸出欄位說明**:
- `msgType`: 訊息類型（message/postback）
- `msgText`: 文字訊息內容
- `msgId`: 訊息 ID
- `postbackAction`: Postback 動作
- `postbackValue`: Postback 值
- `workDay`: 工作日（2026/02/06）
- `shortDate`: 短日期（02/06）
- `currentTime`: 當前時間（HH:MM:SS）
- `fullTimestamp`: 完整時間戳

---

### 節點 3: 查詢員工資料

**類型**: `n8n-nodes-base.googleSheets`

**配置**:
```json
{
  "operation": "lookup",
  "documentId": "1ILgphAVTKI5KIpCJKrT5anlF4GQK8YoHf8JAtAnMN7o",
  "sheetName": "員工資料",
  "lookupColumn": "UserID",
  "lookupValue": "={{ $json.userId }}"
}
```

**說明**: 根據 UserID 查詢員工資料

---

### 節點 4: 超級路由

**類型**: `n8n-nodes-base.code`

**JavaScript 程式碼**:
```javascript
const prev = $('統一前置處理').item.json;
const emp = $input.item.json;

// 檢查是否為新員工
const isNewUser = !emp.UserID;

if (isNewUser) {
  return { 
    json: { 
      ...prev, 
      route: 'new_user',
      emp: {}
    } 
  };
}

// 讀取員工狀態
const step = emp.current_step || 'IDLE';
let tempData = {};
try {
  tempData = JSON.parse(emp.temp_data || '{}');
} catch(e) {
  tempData = {};
}

// 載入翻譯
const lang = emp.Language || 'zh-TW';
const translations = {
  'zh-TW': {
    selectStore: '📍 請選擇門市:',
    askRevenue: '💰 請輸入當前業績 (純數字):',
    photoIn: '📸 請上傳上班照片',
    photoOut: '📸 請上傳下班照片',
    cancel: '❌ 已取消操作',
    clockInSuccess: '✅ 上班打卡成功！',
    clockOutSuccess: '✅ 下班打卡成功！',
    invalidNumber: '❌ 請輸入有效的數字',
    welcome: '✅ 語言設定完成！\n\n📋 使用說明：\n• 輸入「打卡」開始/結束工作\n• 系統會自動判斷上下班\n\n祝您工作順利！💪'
  },
  'vi-VN': {
    selectStore: '📍 Vui lòng chọn cửa hàng:',
    askRevenue: '💰 Nhập doanh thu hiện tại (chỉ số):',
    photoIn: '📸 Tải ảnh chấm công vào',
    photoOut: '📸 Tải ảnh chấm công ra',
    cancel: '❌ Đã hủy',
    clockInSuccess: '✅ Chấm công vào thành công!',
    clockOutSuccess: '✅ Chấm công ra thành công!',
    invalidNumber: '❌ Vui lòng nhập số hợp lệ',
    welcome: '✅ Đã cài ngôn ngữ!\n\n📋 Hướng dẫn:\n• Nhập "Chấm công" để bắt đầu/kết thúc\n• Hệ thống tự động phân biệt\n\nChúc làm việc vui!'
  }
};
const t = translations[lang];

// 取消操作
if (prev.postbackAction === 'cancel') {
  return { 
    json: { 
      ...prev, 
      emp,
      route: 'cancel',
      t
    } 
  };
}

// 語言選擇
if (step === 'WAIT_LANG' && prev.postbackAction === 'lang') {
  return { 
    json: { 
      ...prev, 
      emp,
      route: 'set_language',
      selectedLang: prev.postbackValue,
      t
    } 
  };
}

// 等待選擇門市
if (step === 'WAIT_STORE' && prev.postbackAction === 'select_store') {
  return { 
    json: { 
      ...prev, 
      emp,
      route: 'store_selected',
      store: prev.postbackValue,
      tempData,
      t
    } 
  };
}

// 等待輸入業績
if (step === 'WAIT_REVENUE' && prev.msgType === 'text') {
  return { 
    json: { 
      ...prev, 
      emp,
      route: 'revenue_input',
      tempData,
      t
    } 
  };
}

// 等待上傳照片
if (step === 'WAIT_PHOTO' && prev.msgType === 'image') {
  return { 
    json: { 
      ...prev, 
      emp,
      route: 'photo_uploaded',
      tempData,
      t
    } 
  };
}

// IDLE 狀態 - 判斷打卡指令
if (step === 'IDLE' && (prev.msgText === '打卡' || prev.msgText === 'Chấm công')) {
  return { 
    json: { 
      ...prev, 
      emp,
      route: 'start_clock',
      tempData,
      t
    } 
  };
}

// 其他情況
return { 
  json: { 
    ...prev, 
    emp,
    route: 'unknown',
    t
  } 
};
```

**路由輸出**:
- `new_user`: 新員工（需選擇語言）
- `set_language`: 設定語言完成
- `start_clock`: 開始打卡流程
- `store_selected`: 門市已選擇
- `revenue_input`: 業績已輸入
- `photo_uploaded`: 照片已上傳
- `cancel`: 取消操作
- `unknown`: 未知指令

---

### 節點 5: 路由分支

**類型**: 7 個 `n8n-nodes-base.if` 節點

依序建立以下 IF 節點，每個節點判斷 `$json.route` 是否等於對應值：

1. **分支-新員工**: `route === 'new_user'`
2. **分支-設定語言**: `route === 'set_language'`
3. **分支-開始打卡**: `route === 'start_clock'`
4. **分支-門市已選**: `route === 'store_selected'`
5. **分支-業績已輸入**: `route === 'revenue_input'`
6. **分支-照片已上傳**: `route === 'photo_uploaded'`
7. **分支-取消**: `route === 'cancel'`

**IF 節點配置範例**（以「新員工」為例）:
```json
{
  "conditions": {
    "options": {
      "caseSensitive": true,
      "typeValidation": "strict"
    },
    "conditions": [
      {
        "leftValue": "={{ $json.route }}",
        "rightValue": "new_user",
        "operator": {
          "type": "string",
          "operation": "equals"
        }
      }
    ],
    "combinator": "and"
  }
}
```

---

### 節點 6: 新員工歡迎

**類型**: `n8n-nodes-base.code`

**JavaScript 程式碼**:
```javascript
const d = $json;

return {
  json: {
    ...d,
    replyMessages: [{
      type: 'text',
      text: '👋 歡迎！請選擇您的語言 / Chọn ngôn ngữ:',
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'postback',
              label: '🇹🇼 中文',
              data: 'action=lang&value=zh-TW'
            }
          },
          {
            type: 'action',
            action: {
              type: 'postback',
              label: '🇻🇳 Tiếng Việt',
              data: 'action=lang&value=vi-VN'
            }
          }
        ]
      }
    }],
    updateEmployeeData: {
      UserID: d.userId,
      current_step: 'WAIT_LANG',
      temp_data: ''
    }
  }
};
```

---

### 節點 7: 設定語言

**類型**: `n8n-nodes-base.code`

**JavaScript 程式碼**:
```javascript
const d = $json;
const selectedLang = d.selectedLang;
const t = d.t;

return {
  json: {
    ...d,
    replyMessages: [{
      type: 'text',
      text: t.welcome
    }],
    updateEmployeeData: {
      UserID: d.userId,
      暱稱: d.emp['暱稱'] || '新員工',
      Language: selectedLang,
      current_step: 'IDLE',
      temp_data: ''
    }
  }
};
```

---

### 節點 8: 查詢今日打卡記錄

**類型**: `n8n-nodes-base.googleSheets`

**配置**:
```json
{
  "operation": "search",
  "documentId": "1ILgphAVTKI5KIpCJKrT5anlF4GQK8YoHf8JAtAnMN7o",
  "sheetName": "打卡記錄",
  "filtersUI": {
    "values": [
      {
        "lookupColumn": "日期",
        "lookupValue": "={{ $json.workDay }}"
      },
      {
        "lookupColumn": "員工姓名",
        "lookupValue": "={{ $json.emp['暱稱'] }}"
      }
    ]
  }
}
```

---

### 節點 9: 判斷上下班

**類型**: `n8n-nodes-base.code`

**JavaScript 程式碼**:
```javascript
const d = $json;
const t = d.t;
const records = $input.all();

// 尋找今日是否有未完成的打卡記錄
let hasUnfinishedClock = false;
let attendanceRowNumber = null;
let clockInTime = null;
let store = null;

for (const record of records) {
  if (!record.json['下班時間'] || record.json['下班時間'] === '') {
    hasUnfinishedClock = true;
    attendanceRowNumber = record.json.row_number;
    clockInTime = record.json['上班時間'];
    store = record.json['店名'];
    break;
  }
}

if (hasUnfinishedClock) {
  // 下班流程
  return {
    json: {
      ...d,
      action: 'clockout',
      attendanceRowNumber,
      clockInTime,
      store
    }
  };
} else {
  // 上班流程
  return {
    json: {
      ...d,
      action: 'clockin'
    }
  };
}
```

---

### 節點 10: 生成門市選單（上班）

**類型**: `n8n-nodes-base.code`

**JavaScript 程式碼**:
```javascript
const d = $json;
const t = d.t;

// 門市列表
const stores = ['板橋店', '土城店', '三重店', '新莊店'];

// 生成 QuickReply 按鈕
const quickReplyItems = stores.map(store => ({
  type: 'action',
  action: {
    type: 'postback',
    label: store,
    data: `action=select_store&value=${encodeURIComponent(store)}`
  }
}));

// 加入取消按鈕
quickReplyItems.push({
  type: 'action',
  action: {
    type: 'postback',
    label: '❌ 取消',
    data: 'action=cancel'
  }
});

return {
  json: {
    ...d,
    replyMessages: [{
      type: 'text',
      text: t.selectStore,
      quickReply: {
        items: quickReplyItems
      }
    }],
    updateEmployeeData: {
      UserID: d.userId,
      current_step: 'WAIT_STORE',
      temp_data: JSON.stringify({ action: 'clockin' })
    }
  }
};
```

---

### 節點 11: 查詢今日業績

**類型**: `n8n-nodes-base.googleSheets`

**配置**:
```json
{
  "operation": "search",
  "documentId": "1ILgphAVTKI5KIpCJKrT5anlF4GQK8YoHf8JAtAnMN7o",
  "sheetName": "業績記錄",
  "filtersUI": {
    "values": [
      {
        "lookupColumn": "日期",
        "lookupValue": "={{ $json.shortDate }}"
      },
      {
        "lookupColumn": "店名",
        "lookupValue": "={{ $json.store }}"
      }
    ]
  }
}
```

---

### 節點 12: 業績輸入驗證

**類型**: `n8n-nodes-base.code`

**JavaScript 程式碼**:
```javascript
const d = $json;
const t = d.t;
const revenue = d.msgText.trim();

// 驗證是否為數字
if (!/^\d+$/.test(revenue)) {
  return {
    json: {
      ...d,
      replyMessages: [{
        type: 'text',
        text: t.invalidNumber
      }]
    }
  };
}

// 驗證通過，進入照片上傳階段
return {
  json: {
    ...d,
    revenue: parseInt(revenue),
    replyMessages: [{
      type: 'text',
      text: t.photoOut,
      quickReply: {
        items: [{
          type: 'action',
          action: {
            type: 'postback',
            label: '❌ 取消',
            data: 'action=cancel'
          }
        }]
      }
    }],
    updateEmployeeData: {
      UserID: d.userId,
      current_step: 'WAIT_PHOTO',
      temp_data: JSON.stringify({
        action: 'clockout',
        store: d.tempData.store,
        attendanceRowNumber: d.tempData.attendanceRowNumber,
        clockInTime: d.tempData.clockInTime,
        revenue: parseInt(revenue)
      })
    }
  }
};
```

---

### 節點 13: 組裝上班照片請求

**類型**: `n8n-nodes-base.code`

**JavaScript 程式碼**:
```javascript
const d = $json;
const t = d.t;
const store = d.store;
const revenueRecords = $input.all();

// 判斷打卡類型
let clockInType = 'midshift'; // 預設中途上班
let revenueRowNumber = null;
let revenue = null;

// 檢查是否為首位開攤
if (revenueRecords.length === 0) {
  clockInType = 'opener';
} else {
  // 已有業績記錄，判斷是否為小幫手
  const hasRevenue = revenueRecords[0].json['開攤時間'];
  if (hasRevenue) {
    clockInType = 'helper'; // 有開攤時間就是小幫手
  } else {
    // 中途上班需要記錄當前業績
    revenueRowNumber = revenueRecords[0].json.row_number;
    revenue = revenueRecords[0].json['當前業績'] || 0;
  }
}

return {
  json: {
    ...d,
    clockInType,
    revenueRowNumber,
    revenue,
    replyMessages: [{
      type: 'text',
      text: t.photoIn,
      quickReply: {
        items: [{
          type: 'action',
          action: {
            type: 'postback',
            label: '❌ 取消',
            data: 'action=cancel'
          }
        }]
      }
    }],
    updateEmployeeData: {
      UserID: d.userId,
      current_step: 'WAIT_PHOTO',
      temp_data: JSON.stringify({
        action: 'clockin',
        store,
        clockInType,
        revenueRowNumber,
        revenue
      })
    }
  }
};
```

---

### 節點 14: 組裝下班照片請求

**類型**: `n8n-nodes-base.code`

**JavaScript 程式碼**:
```javascript
const d = $json;
const t = d.t;

return {
  json: {
    ...d,
    replyMessages: [{
      type: 'text',
      text: t.askRevenue,
      quickReply: {
        items: [{
          type: 'action',
          action: {
            type: 'postback',
            label: '❌ 取消',
            data: 'action=cancel'
          }
        }]
      }
    }],
    updateEmployeeData: {
      UserID: d.userId,
      current_step: 'WAIT_REVENUE',
      temp_data: JSON.stringify({
        action: 'clockout',
        store: d.store,
        attendanceRowNumber: d.attendanceRowNumber,
        clockInTime: d.clockInTime
      })
    }
  }
};
```

---

### 節點 15: 處理照片上傳

**類型**: `n8n-nodes-base.code`

**JavaScript 程式碼**:
```javascript
const d = $json;
const tempData = d.tempData;
const action = tempData.action;
const t = d.t;

const photoUrl = `https://api.line.me/v2/bot/message/${d.msgId}/content`;

let sheetUpdates = [];
let successMsg = '';

if (action === 'clockin') {
  const store = tempData.store;
  const clockInType = tempData.clockInType;
  const revenueRowNumber = tempData.revenueRowNumber;

  if (clockInType === 'opener') {
    sheetUpdates.push({
      type: 'revenue_append',
      sheetId: 'gid=120439598',
      data: {
        '日期': d.shortDate,
        '店名': store,
        '開攤時間': d.currentTime.substring(0, 5),
        '操作記錄': `[${d.emp['暱稱']}][開攤][${d.fullTimestamp}]`
      }
    });
  } else if (clockInType === 'midshift' && tempData.revenue) {
    sheetUpdates.push({
      type: 'revenue_update',
      sheetId: 'gid=120439598',
      rowNumber: revenueRowNumber,
      data: {
        '操作記錄': `[${d.emp['暱稱']}][中途上班][當前業績:${tempData.revenue}][${d.fullTimestamp}]`
      }
    });
  }

  const remark = clockInType === 'helper' ? '小幫手(免業績)' : '';
  sheetUpdates.push({
    type: 'attendance_append',
    sheetId: 'gid=1677241005',
    data: {
      '日期': d.workDay,
      '員工姓名': d.emp['暱稱'],
      '店名': store,
      '上班時間': d.currentTime,
      '下班時間': '',
      '工時': '',
      '打卡記錄': `[上班][${d.fullTimestamp}][${photoUrl}]`,
      '業績記錄': '',
      '備註': remark
    }
  });

  successMsg = `${t.clockInSuccess}\n📍 店名: ${store}\n⏰ 時間: ${d.currentTime}\n📝 類型: ${clockInType === 'opener' ? '首位開攤' : clockInType === 'helper' ? '小幫手' : '中途上班'}`;

} else {
  const store = tempData.store;
  const attendanceRowNumber = tempData.attendanceRowNumber;
  const clockInTime = tempData.clockInTime;
  const revenue = tempData.revenue || 0;

  function parseTime(timeStr) {
    const [hour, min, sec] = timeStr.split('').map(Number);
    return hour * 3600 + min * 60 + (sec || 0);
  }

  const inSeconds = parseTime(clockInTime);
  const outSeconds = parseTime(d.currentTime);
  let workSeconds = outSeconds - inSeconds;
  if (workSeconds < 0) workSeconds += 24 * 3600;

  const workHours = (workSeconds / 3600).toFixed(2);
  const hours = Math.floor(workSeconds / 3600);
  const minutes = Math.floor((workSeconds % 3600) / 60);
  const workTimeDisplay = `${hours}小時${minutes}分`;

  sheetUpdates.push({
    type: 'attendance_update',
    sheetId: 'gid=1677241005',
    rowNumber: attendanceRowNumber,
    data: {
      '下班時間': d.currentTime,
      '工時': workHours,
      '打卡記錄': `[下班][${d.fullTimestamp}][${photoUrl}]`,
      '業績記錄': `${revenue}`
    }
  });

  successMsg = `${t.clockOutSuccess}\n📍 店名: ${store}\n⏰ 上班: ${clockInTime}\n⏰ 下班: ${d.currentTime}\n⏱️ 工時: ${workTimeDisplay}\n💰 業績: ${revenue}`;
}

return {
  json: {
    ...d,
    replyMessages: [{
      type: 'text',
      text: successMsg
    }],
    updateEmployeeData: {
      UserID: d.userId,
      current_step: 'IDLE',
      temp_data: ''
    },
    sheetUpdates
  }
};
```

---

### 節點 16: 處理取消

**類型**: `n8n-nodes-base.code`

**JavaScript 程式碼**:
```javascript
const d = $json;
const t = d.t;

return {
  json: {
    ...d,
    replyMessages: [{
      type: 'text',
      text: t.cancel
    }],
    updateEmployeeData: {
      UserID: d.userId,
      current_step: 'IDLE',
      temp_data: ''
    }
  }
};
```

---

### 節點 17: 合併所有路徑

**類型**: `n8n-nodes-base.merge`

**配置**:
```json
{
  "mode": "mergeByPosition",
  "options": {}
}
```

**說明**: 將所有分支的輸出合併成一條路徑

---

### 節點 18: 更新員工狀態

**類型**: `n8n-nodes-base.googleSheets`

**配置**:
```json
{
  "operation": "update",
  "documentId": "1ILgphAVTKI5KIpCJKrT5anlF4GQK8YoHf8JAtAnMN7o",
  "sheetName": "員工資料",
  "columns": {
    "mappingMode": "autoMapInputData"
  },
  "options": {
    "lookupColumn": "UserID"
  }
}
```

**說明**: 根據 `updateEmployeeData` 更新員工狀態

---

### 節點 19: 準備 Sheets 更新

**類型**: `n8n-nodes-base.code`

**JavaScript 程式碼**:
```javascript
const d = $json;
const sheetUpdates = d.sheetUpdates || [];

if (sheetUpdates.length === 0) {
  return { json: { ...d, skipSheetUpdates: true } };
}

return sheetUpdates.map(update => ({
  json: {
    ...d,
    updateType: update.type,
    sheetId: update.sheetId,
    rowNumber: update.rowNumber,
    ...update.data
  }
}));
```

---

### 節點 20: 判斷更新類型

**類型**: `n8n-nodes-base.if`

**條件**: `$json.updateType` 包含 `"append"`

---

### 節點 21: 新增記錄（Append）

**類型**: `n8n-nodes-base.googleSheets`

**配置**:
```json
{
  "operation": "append",
  "documentId": "1ILgphAVTKI5KIpCJKrT5anlF4GQK8YoHf8JAtAnMN7o",
  "sheetName": "={{ $json.sheetId }}",
  "columns": {
    "mappingMode": "autoMapInputData"
  }
}
```

---

### 節點 22: 更新記錄（Update）

**類型**: `n8n-nodes-base.googleSheets`

**配置**:
```json
{
  "operation": "update",
  "documentId": "1ILgphAVTKI5KIpCJKrT5anlF4GQK8YoHf8JAtAnMN7o",
  "sheetName": "={{ $json.sheetId }}",
  "columns": {
    "mappingMode": "autoMapInputData"
  },
  "options": {
    "lookupColumn": "row_number"
  }
}
```

---

### 節點 23: 回覆 LINE

**類型**: `n8n-nodes-base.httpRequest`

**配置**:
```json
{
  "method": "POST",
  "url": "https://api.line.me/v2/bot/message/reply",
  "authentication": "predefinedCredentialType",
  "nodeCredentialType": "lineApi",
  "sendHeaders": true,
  "headerParameters": {
    "parameters": [
      {
        "name": "Authorization",
        "value": "Bearer YOUR_LINE_CHANNEL_ACCESS_TOKEN"
      },
      {
        "name": "Content-Type",
        "value": "application/json"
      }
    ]
  },
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={{ { \"replyToken\": $json.replyToken, \"messages\": $json.replyMessages } }}"
}
```

---

### 節點 24: Webhook Response

**類型**: `n8n-nodes-base.respondToWebhook`

**配置**:
```json
{
  "respondWith": "json",
  "responseBody": "={{ { \"status\": \"ok\", \"timestamp\": $now } }}"
}
```

---

## 🔗 連接關係

### 主流程
```
LINE Webhook 
  → 統一前置處理 
  → 查詢員工資料 
  → 超級路由 
  → [7個分支IF節點]
```

### 分支 1: 新員工
```
分支-新員工 (True)
  → 新員工歡迎
  → 合併所有路徑
```

### 分支 2: 設定語言
```
分支-設定語言 (True)
  → 設定語言
  → 合併所有路徑
```

### 分支 3: 開始打卡
```
分支-開始打卡 (True)
  → 查詢今日打卡記錄
  → 判斷上下班
  → IF (action === 'clockin')
      True → 查詢今日業績 → 組裝上班照片請求 → 合併所有路徑
      False → 組裝下班照片請求 → 合併所有路徑
```

### 分支 4: 門市已選
```
分支-門市已選 (True)
  → 查詢今日業績
  → 組裝上班照片請求
  → 合併所有路徑
```

### 分支 5: 業績已輸入
```
分支-業績已輸入 (True)
  → 業績輸入驗證
  → 合併所有路徑
```

### 分支 6: 照片已上傳
```
分支-照片已上傳 (True)
  → 處理照片上傳
  → 合併所有路徑
```

### 分支 7: 取消
```
分支-取消 (True)
  → 處理取消
  → 合併所有路徑
```

### 資料寫入與回覆
```
合併所有路徑
  → 更新員工狀態
  → 準備Sheets更新
  → 判斷更新類型
      True (append) → 新增記錄 → 合併
      False (update) → 更新記錄 → 合併
  → 回覆LINE
  → Webhook Response
```

---

## 🧪 測試流程

### 1. 新員工首次使用
```
1. 用戶發送任意訊息
2. 系統回覆語言選單
3. 用戶選擇語言（中文/越南文）
4. 系統回覆歡迎訊息
```

### 2. 上班打卡（首位開攤）
```
1. 用戶輸入「打卡」
2. 系統回覆門市選單
3. 用戶選擇門市
4. 系統回覆「請上傳上班照片」
5. 用戶上傳照片
6. 系統回覆成功訊息（含門市、時間、類型）
7. Google Sheets 自動記錄
```

### 3. 下班打卡
```
1. 用戶輸入「打卡」
2. 系統回覆「請輸入當前業績」
3. 用戶輸入數字（例如：5000）
4. 系統回覆「請上傳下班照片」
5. 用戶上傳照片
6. 系統回覆成功訊息（含工時、業績）
7. Google Sheets 自動更新
```

### 4. 取消操作
```
1. 在任何階段點擊「❌ 取消」按鈕
2. 系統回覆「已取消操作」
3. 狀態重置為 IDLE
```

---

## 📝 重要注意事項

### Google Sheets 權限
- 確保 N8N 的 Google OAuth2 憑證有讀寫權限
- 所有工作表需開啟「編輯權限」

### LINE Bot 設定
- Webhook URL: `https://your-n8n.com/webhook/line-hr`
- 需開啟「Webhook」功能
- 需開啟「Use webhook」開關

### 時區設定
- 系統使用台灣時區（UTC+8）
- 工作日以早上 6:00 為分界線

### 資料格式
- 日期格式: `YYYY/MM/DD`
- 時間格式: `HH:MM:SS`
- 工時格式: 小數（例如：8.50）

---

## 🐛 常見問題排除

### Q1: 導入 JSON 失敗
**A**: 手動建立節點，逐個複製程式碼

### Q2: Google Sheets 查詢失敗
**A**: 檢查工作表名稱、欄位名稱是否正確

### Q3: LINE 回覆失敗
**A**: 檢查 Channel Access Token 是否正確

### Q4: 照片 URL 無法存取
**A**: 照片 URL 有效期限 30 分鐘，需及時下載

---

## 📧 聯絡資訊

如有問題請回報：
- 系統版本: v1.0
- 文檔版本: 2026-02-06

---

**🎉 恭喜！架構文檔已完成！**

按照此文檔逐步建立，即可完成整個系統。建議先建立前 5 個節點測試基礎流程，再逐步添加業務邏輯。
