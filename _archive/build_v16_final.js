
const fs = require('fs');

const gSheetId = '1ILgphAVTKI5KIpCJKrT5anlF4GQK8YoHf8JAtAnMN7o';
const gSheetCred = { googleSheetsOAuth2Api: { id: 'p8ybn4LezMchfmzj', name: 'Google Sheets account' } };
const lineCred = { lineMessagingApi: { id: 'UiiMHjlAZGMI80LW', name: '打卡機器人' } };
const driveCred = { googleDriveOAuth2Api: { id: 'p8ybn4LezMchfmzj', name: 'Google Sheets account' } };

const nodes = [];
const connections = {};

function addNode(node) {
    nodes.push(node);
}

function addConnection(source, target, sourceIndex = 0, targetIndex = 0) {
    if (!connections[source]) connections[source] = { main: [] };
    while (connections[source].main.length <= sourceIndex) connections[source].main.push([]);

    // Ensure the target array exists for the specific sourceIndex
    if (!connections[source].main[sourceIndex]) {
        connections[source].main[sourceIndex] = [];
    }

    connections[source].main[sourceIndex].push({ node: target, type: 'main', index: targetIndex });
}

// --- Node Definitions (SKILL Compliant) ---

// 1. LINE Webhook
addNode({
    parameters: { httpMethod: 'POST', path: 'line-hr', responseMode: 'lastNode', options: {} },
    name: 'LINE Webhook',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [0, 0]
});

// 2. 統一前置處理 (Unified Preprocessing)
addNode({
    parameters: {
        jsCode: `const { DateTime } = require('luxon');
// SKILL: Access webhook data via .body
const body = $input.first().json.body;
const events = body.events || [];

if (events.length === 0) {
  return [{ json: { error: 'no_events' } }];
}

const evt = events[0];
// 使用 Luxon 設定台灣時間
const now = DateTime.now().setZone('Asia/Taipei');

// 計算工作日（早上6點為分界線）
const workDate = now.hour < 6 ? now.minus({ days: 1 }) : now;

const workDay = workDate.toFormat('yyyy/MM/dd');
const shortDate = workDate.toFormat('MM/dd');
const currentTime = now.toFormat('HH:mm:ss');
const realDate = now.toFormat('yyyy/MM/dd');
const fullTimestamp = \`\${realDate} \${currentTime}\`;

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
if (postbackData) {
    postbackData.split('&').forEach(p => { 
      const [k, v] = p.split('='); 
      if (k && v) pbParams[k] = decodeURIComponent(v); 
    });
}

// SKILL: Return array of objects with json property
return [{
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
    timestamp: now.toMillis()
  }
}];`
    },
    name: '統一前置處理',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [200, 0]
});

// 3. 查詢員工資料
addNode({
    parameters: {
        operation: 'lookup',
        documentId: { __rl: true, value: gSheetId, mode: 'id' },
        sheetName: { __rl: true, value: '員工資料', mode: 'name' },
        lookupColumn: 'UserID',
        lookupValue: '={{ $json.userId }}', // Uses input from Preprocessing
        options: {}
    },
    name: '查詢員工資料',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [400, 0],
    credentials: gSheetCred
});

// 4. 超級路由 (Super Router)
addNode({
    parameters: {
        jsCode: `// SKILL: Use $node to access specific previous node data
// Preprocessing data is preserved in '統一前置處理' node
const prev = $node["統一前置處理"].json; 
// Employee data comes from direct input ('查詢員工資料')
const emp = $input.first().json;

// 檢查是否為新員工 (Lookup returns empty or specific structure if not found? 
// Usually n8n GS Lookup keeps input if not found but 'match' might fail. 
// Assuming if UserID is missing in output or generic error. 
// If 'lookup' found nothing, it might return empty or input. 
// Let's assume if 'UserID' is missing in emp (or it's the input userId) it's new.
// Actually, if lookup fails, n8n usually stops or returns empty depending on settings.
// We assume it returns something. If emp matches prev.userId (input), it means no enrichment happened?
// Safer: Check if a known column from Sheet exists, e.g. '姓名' or 'UserID' from Sheet.)
const isNewUser = !emp['姓名'] && !emp['暱稱']; // Adjust key based on Sheet

if (isNewUser) {
  return [{ 
    json: { 
      ...prev, 
      route: 'new_user',
      emp: {}
    } 
  }];
}

// 讀取員工狀態
let step = emp.current_step || 'IDLE';
let tempData = {};
try {
  tempData = JSON.parse(emp.temp_data || '{}');
} catch(e) {
  tempData = {};
}

// 逾時邏輯 (10分鐘)
const lastActive = parseInt(emp.last_active || 0);
const nowMillis = prev.timestamp;
if (step !== 'IDLE' && (nowMillis - lastActive) > 600000) {
  step = 'IDLE';
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
    welcome: '✅ 語言設定完成！\\n\\n📋 使用說明：\\n• 輸入「打卡」開始/結束工作\\n• 系統會自動判斷上下班\\n\\n祝您工作順利！💪'
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
    welcome: '✅ Đã cài ngôn ngữ!\\n\\n📋 Hướng dẫn:\\n• Nhập "Chấm công" để bắt đầu/kết thúc\\n• Hệ thống tự động phân biệt\\n\\nChúc làm việc vui!'
  }
};
const t = translations[lang];

let route = 'unknown';
let outputJson = { ...prev, emp, t, tempData };
let updateEmployeeData = null;

// 路由邏輯

// 1. 取消操作
if (prev.postbackAction === 'cancel') {
  route = 'cancel';
}
// 2. 語言選擇
else if (step === 'WAIT_LANG' && prev.postbackAction === 'lang') {
  route = 'set_language';
  outputJson.selectedLang = prev.postbackValue;
}
// 3. 等待選擇門市
else if (step === 'WAIT_STORE' && prev.postbackAction === 'select_store') {
  route = 'store_selected';
  outputJson.store = prev.postbackValue;
}
// 4. 等待輸入業績
else if (step === 'WAIT_REVENUE' && prev.msgType === 'text') {
  route = 'revenue_input';
  outputJson.revenueText = prev.msgText; // Explicitly pass text
}
// 5. 等待上傳照片
else if (step === 'WAIT_PHOTO' && prev.msgType === 'image') {
  route = 'photo_uploaded';
}
// 6. IDLE 狀態 - 判斷打卡指令
else if (step === 'IDLE' && (prev.msgText === '打卡' || prev.msgText === 'Chấm công')) {
  route = 'start_clock';
}

// 處理逾時重置的持久化
if (step === 'IDLE' && emp.current_step !== 'IDLE') {
    updateEmployeeData = {
        UserID: emp.UserID,
        current_step: 'IDLE',
        temp_data: ''
    };
}

outputJson.route = route;
if (updateEmployeeData) outputJson.updateEmployeeData = updateEmployeeData;

return [{ json: outputJson }];`
    },
    name: '超級路由',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [600, 0]
});

// 5. 狀態分流 (Switch)
addNode({
    parameters: {
        rules: {
            values: [
                { value: 'new_user', outputKey: 'new_user' },
                { value: 'set_language', outputKey: 'set_language' },
                { value: 'start_clock', outputKey: 'start_clock' },
                { value: 'store_selected', outputKey: 'store_selected' },
                { value: 'revenue_input', outputKey: 'revenue_input' },
                { value: 'photo_uploaded', outputKey: 'photo_uploaded' },
                { value: 'cancel', outputKey: 'cancel' }
            ]
        },
        dataProperty: 'route',
        fallbackOutput: 7
    },
    name: '狀態分流',
    type: 'n8n-nodes-base.switch',
    typeVersion: 3.2,
    position: [900, 0]
});

// --- Branches ---

// Branch 1: 新員工歡迎
addNode({
    parameters: {
        jsCode: `const d = $input.first().json;
return [{
  json: {
    ...d,
    replyMessages: [{
      type: 'text',
      text: '👋 歡迎！請選擇您的語言 / Chọn ngôn ngữ:',
      quickReply: {
        items: [
          { type: 'action', action: { type: 'postback', label: '🇹🇼 中文', data: 'action=lang&value=zh-TW' } },
          { type: 'action', action: { type: 'postback', label: '🇻🇳 Tiếng Việt', data: 'action=lang&value=vi-VN' } }
        ]
      }
    }],
    updateEmployeeData: {
        UserID: d.userId,
        current_step: 'WAIT_LANG',
        temp_data: ''
    }
  }
}];`
    },
    name: '新員工歡迎',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1200, -400]
});

// Branch 2: 設定語言
addNode({
    parameters: {
        jsCode: `const d = $input.first().json;
return [{
  json: {
    ...d,
    replyMessages: [{ type: 'text', text: d.t.welcome }],
    updateEmployeeData: {
      UserID: d.userId,
      暱稱: d.emp['暱稱'] || '新員工',
      Language: d.selectedLang,
      current_step: 'IDLE',
      temp_data: ''
    }
  }
}];`
    },
    name: '設定語言',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1200, -300]
});

// Branch 3: 查詢今日打卡
addNode({
    parameters: {
        operation: 'getMany',
        documentId: { __rl: true, value: gSheetId, mode: 'id' },
        sheetName: { __rl: true, value: '員工工時紀錄', mode: 'name' },
        filtersUI: {
            values: [
                { lookupColumn: '日期', lookupValue: '={{ $json.workDay }}' },
                { lookupColumn: '員工姓名', lookupValue: '={{ $json.emp[\'暱稱\'] }}' }
            ]
        },
        options: {}
    },
    name: '查詢今日打卡',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [1200, -200],
    credentials: gSheetCred
});

// 判斷上下班
addNode({
    parameters: {
        jsCode: `
// SKILL: Use $node to get explicit context
const d = $node["狀態分流"].json; // Original data passed through Switch
const records = $input.all().map(i => i.json); // Sheet results

let hasUnfinishedClock = false;
let attendanceRowNumber = null;
let clockInTime = null;
let store = null;

for (const record of records) {
  if (!record['下班時間']) {
    hasUnfinishedClock = true;
    attendanceRowNumber = record.row_number; 
    clockInTime = record['上班時間'];
    store = record['店名'];
    break;
  }
}

const action = hasUnfinishedClock ? 'clockout' : 'clockin';

return [{
  json: {
    ...d,
    action,
    attendanceRowNumber,
    clockInTime,
    store
  }
}];`
    },
    name: '判斷上下班',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1400, -200]
});

// 檢查動作類型 (Switch preferred)
addNode({
    parameters: {
        rules: {
            values: [
                { value: 'clockin', outputKey: 'clockin' }
            ]
        },
        dataProperty: 'action',
        fallbackOutput: 1 // Default to clockout
    },
    name: '檢查動作類型',
    type: 'n8n-nodes-base.switch',
    typeVersion: 3.2,
    position: [1600, -200]
});

// 生成門市選單 (Clock In)
addNode({
    parameters: {
        jsCode: `const d = $input.first().json;
const stores = ['板橋店', '土城店', '三重店', '新莊店'];

const quickReplyItems = stores.map(store => ({
  type: 'action',
  action: { type: 'postback', label: store, data: \`action=select_store&value=\${encodeURIComponent(store)}\` }
}));
quickReplyItems.push({
  type: 'action',
  action: { type: 'postback', label: '❌ 取消', data: 'action=cancel' }
});

return [{
  json: {
    ...d,
    replyMessages: [{ type: 'text', text: d.t.selectStore, quickReply: { items: quickReplyItems } }],
    updateEmployeeData: {
      UserID: d.userId,
      current_step: 'WAIT_STORE',
      temp_data: JSON.stringify({ action: 'clockin' })
    }
  }
}];`
    },
    name: '生成門市選單',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1800, -250]
});

// Branch 4: 查詢今日業績
addNode({
    parameters: {
        operation: 'getMany',
        documentId: { __rl: true, value: gSheetId, mode: 'id' },
        sheetName: { __rl: true, value: '每日業績紀錄', mode: 'name' },
        filtersUI: {
            values: [
                { lookupColumn: '日期', lookupValue: '={{ $json.shortDate }}' },
                { lookupColumn: '店名', lookupValue: '={{ $json.store }}' }
            ]
        },
        options: {}
    },
    name: '查詢今日業績',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [1200, -100],
    credentials: gSheetCred
});

// 準備上班照片請求
addNode({
    parameters: {
        jsCode: `
const d = $node["狀態分流"].json;
const revenueRecords = $input.all().map(i => i.json);

let clockInType = 'midshift';
let revenueRowNumber = null;
let revenue = null;

if (revenueRecords.length === 0 || (revenueRecords.length === 1 && !revenueRecords[0].row_number)) { 
  // Empty check might vary based on n8n version returning empty array or empty object
  clockInType = 'opener';
} else {
  // Check if first record has '開攤時間'
  // Note: if getMany returns data, it's an array.
  const first = revenueRecords[0];
  if (first['開攤時間']) {
    clockInType = 'helper'; 
  } else {
    revenueRowNumber = first.row_number;
    revenue = first['當前業績'] || 0;
  }
}

return [{
  json: {
    ...d,
    clockInType,
    revenueRowNumber,
    revenue,
    replyMessages: [{
      type: 'text',
      text: d.t.photoIn,
      quickReply: { items: [{ type: 'action', action: { type: 'postback', label: '❌ 取消', data: 'action=cancel' } }] }
    }],
    updateEmployeeData: {
      UserID: d.userId,
      current_step: 'WAIT_PHOTO',
      temp_data: JSON.stringify({ action: 'clockin', store: d.store, clockInType, revenueRowNumber, revenue })
    }
  }
}];`
    },
    name: '準備上班照片請求',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1400, -100]
});

// Branch 5: 業績輸入驗證
addNode({
    parameters: {
        jsCode: `const d = $input.first().json;
const revenue = d.revenueText.trim();

if (!/^\\d+$/.test(revenue)) {
  return [{
    json: {
      ...d,
      replyMessages: [{ type: 'text', text: d.t.invalidNumber }]
    }
  }];
}

return [{
  json: {
    ...d,
    revenue: parseInt(revenue),
    replyMessages: [{
      type: 'text',
      text: d.t.photoOut,
      quickReply: { items: [{ type: 'action', action: { type: 'postback', label: '❌ 取消', data: 'action=cancel' } }] }
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
}];`
    },
    name: '業績輸入驗證',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1200, 0]
});

// 準備下班照片請求 (Clock Out Flow from Check Action Type False path)
addNode({
    parameters: {
        jsCode: `const d = $input.first().json;
return [{
  json: {
    ...d,
    replyMessages: [{
      type: 'text',
      text: d.t.askRevenue,
      quickReply: { items: [{ type: 'action', action: { type: 'postback', label: '❌ 取消', data: 'action=cancel' } }] }
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
}];`
    },
    name: '準備下班照片請求',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1800, -150]
});

// Branch 6: 下載與上傳
// 下載照片
addNode({
    parameters: {
        method: 'GET',
        url: '={{ "https://api-data.line.me/v2/bot/message/" + $json.msgId + "/content" }}',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'lineMessagingApi',
        responseFormat: 'file',
        options: {}
    },
    name: '下載照片',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [900, 400],
    credentials: lineCred
});

// 上傳至 Drive
addNode({
    parameters: {
        operation: 'upload',
        fileContent: 'data', // Expects binary property 'data' from Download node
        parentId: { __rl: true, value: '1k4rfsjHYYXO8He7MUbTZoNJivDJkcn2a', mode: 'id' },
        options: {}
    },
    name: '上傳至 Drive',
    type: 'n8n-nodes-base.googleDrive',
    typeVersion: 3,
    position: [1000, 400],
    credentials: driveCred
});

// 設定 Drive 權限
addNode({
    parameters: {
        method: 'POST',
        // SKILL: Use $json.id (from Upload node output)
        url: '={{ "https://www.googleapis.com/drive/v3/files/" + $json.id + "/permissions" }}',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'googleDriveOAuth2Api',
        sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '{"role": "reader", "type": "anyone"}',
        options: {}
    },
    name: '設定 Drive 權限',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [1100, 400],
    credentials: driveCred
});

// 處理照片上傳
addNode({
    parameters: {
        jsCode: `
const d = $node["狀態分流"].json; // Meta from Switch
const uploadData = $node["上傳至 Drive"].json;

const photoUrl = uploadData.webViewLink || \`https://api.line.me/v2/bot/message/\${d.msgId}/content\`;
const tempData = d.tempData || {};
const action = tempData.action;
const t = d.t;

let sheetUpdates = [];
let successMsg = '';

if (action === 'clockin') {
  const store = tempData.store;
  const clockInType = tempData.clockInType;
  const revenueRowNumber = tempData.revenueRowNumber;

  if (clockInType === 'opener') {
    sheetUpdates.push({
      type: 'revenue_append',
      sheetId: '每日業績紀錄',
      data: {
        '日期': d.shortDate,
        '店名': store,
        '開攤時間': d.currentTime.substring(0, 5),
        '操作記錄': \`[\${d.emp['暱稱']}][開攤][\${d.fullTimestamp}]\`
      }
    });
  } else if (clockInType === 'midshift' && tempData.revenue) {
    sheetUpdates.push({
      type: 'revenue_update',
      sheetId: '每日業績紀錄',
      rowNumber: revenueRowNumber,
      data: {
        '操作記錄': \`[\${d.emp['暱稱']}][中途上班][當前業績:\${tempData.revenue}][\${d.fullTimestamp}]\`
      }
    });
  }

  const remark = clockInType === 'helper' ? '小幫手(免業績)' : '';
  sheetUpdates.push({
    type: 'attendance_append',
    sheetId: '員工工時紀錄',
    data: {
      '日期': d.workDay,
      '員工姓名': d.emp['暱稱'],
      '店名': store,
      '上班時間': d.currentTime,
      '下班時間': '',
      '工時': '',
      '打卡記錄': \`[上班][\${d.fullTimestamp}][\${photoUrl}]\`,
      '業績記錄': '',
      '備註': remark
    }
  });

  successMsg = \`\${t.clockInSuccess}\\n📍 店名: \${store}\\n⏰ 時間: \${d.currentTime}\\n📝 類型: \${clockInType === 'opener' ? '首位開攤' : clockInType === 'helper' ? '小幫手' : '中途上班'}\`;

} else {
  // Clock Out
  const store = tempData.store;
  const attendanceRowNumber = tempData.attendanceRowNumber;
  const clockInTime = tempData.clockInTime;
  const revenue = tempData.revenue || 0;

  function parseTime(timeStr) {
    if (!timeStr) return 0;
    const [hour, min, sec] = timeStr.split('').map(Number);
    return (hour||0) * 3600 + (min||0) * 60 + (sec || 0);
  }

  const inSeconds = parseTime(clockInTime);
  const outSeconds = parseTime(d.currentTime);
  let workSeconds = outSeconds - inSeconds;
  if (workSeconds < 0) workSeconds += 24 * 3600;

  const hours = Math.floor(workSeconds / 3600);
  const minutes = Math.floor((workSeconds % 3600) / 60);
  const workTimeDisplay = \`\${hours}小時\${minutes}分\`;
  const workHours = (workSeconds / 3600).toFixed(2);

  sheetUpdates.push({
    type: 'attendance_update',
    sheetId: '員工工時紀錄',
    rowNumber: attendanceRowNumber,
    data: {
      '下班時間': d.currentTime,
      '工時': workHours,
      '打卡記錄': \`[下班][\${d.fullTimestamp}][\${photoUrl}]\`,
      '業績記錄': \`\${revenue}\`
    }
  });

  successMsg = \`\${t.clockOutSuccess}\\n📍 店名: \${store}\\n⏰ 上班: \${clockInTime}\\n⏰ 下班: \${d.currentTime}\\n⏱️ 工時: \${workTimeDisplay}\\n💰 業績: \${revenue}\`;
}

return [{
  json: {
    ...d,
    replyMessages: [{ type: 'text', text: successMsg }],
    updateEmployeeData: {
      UserID: d.userId,
      current_step: 'IDLE',
      temp_data: ''
    },
    sheetUpdates
  }
}];`
    },
    name: '處理照片上傳',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1200, 100]
});

// Branch 7: 處理取消
addNode({
    parameters: {
        jsCode: `const d = $input.first().json;
const t = d.t || { cancel: '❌ Cancelled' };

return [{
  json: {
    ...d,
    replyMessages: [{ type: 'text', text: t.cancel }],
    updateEmployeeData: {
      UserID: d.userId,
      current_step: 'IDLE',
      temp_data: ''
    }
  }
}];`
    },
    name: '處理取消',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1200, 200]
});

// 匯總合併 (Merge)
addNode({
    // SKILL: Append mode is often safer for multi-input if only one is active
    parameters: { mode: 'append' },
    name: '匯總合併',
    type: 'n8n-nodes-base.merge',
    typeVersion: 3, // Use v3 of Merge
    position: [2200, 0]
});

// 更新員工狀態
addNode({
    parameters: {
        operation: 'update',
        documentId: { __rl: true, value: gSheetId, mode: 'id' },
        sheetName: { __rl: true, value: '員工資料', mode: 'name' },
        columns: { mappingMode: 'autoMapInputData' },
        options: { lookupColumn: 'UserID' }
    },
    name: '更新員工狀態',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [2400, 0],
    credentials: gSheetCred
});

// 準備試算表更新
addNode({
    parameters: {
        jsCode: `const d = $input.first().json;
const sheetUpdates = d.sheetUpdates || [];

if (sheetUpdates.length === 0) {
  // Pass through if no updates, marked to skip
  return [{ json: { ...d, skipSheetUpdates: true } }];
}

return sheetUpdates.map(update => ({
  json: {
    ...d,
    updateType: update.type,
    targetSheet: update.sheetId, // This is Name
    targetRow: update.rowNumber,
    ...update.data
  }
}));`
    },
    name: '準備試算表更新',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [2600, 0]
});

// 判斷更新類型 (Switch)
addNode({
    parameters: {
        rules: {
            values: [
                { value: 'revenue_append', outputKey: 'append' },
                { value: 'attendance_append', outputKey: 'append' }
            ]
        },
        dataProperty: 'updateType',
        fallbackOutput: 1 // Default to Update
    },
    name: '判斷更新類型',
    type: 'n8n-nodes-base.switch',
    typeVersion: 3.2,
    position: [2800, 0]
});

// 新增記錄
addNode({
    parameters: {
        operation: 'append',
        documentId: { __rl: true, value: gSheetId, mode: 'id' },
        sheetName: { __rl: true, value: '={{ $json.targetSheet }}', mode: 'name' },
        columns: { mappingMode: 'autoMapInputData' },
        options: {}
    },
    name: '新增記錄',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [3000, -100],
    credentials: gSheetCred
});

// 更新記錄
addNode({
    parameters: {
        operation: 'update',
        documentId: { __rl: true, value: gSheetId, mode: 'id' },
        sheetName: { __rl: true, value: '={{ $json.targetSheet }}', mode: 'name' },
        columns: { mappingMode: 'autoMapInputData' },
        options: { lookupColumn: 'row_number' }
    },
    name: '更新記錄',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [3000, 100],
    credentials: gSheetCred
});

// 回覆 LINE
addNode({
    parameters: {
        method: 'POST',
        url: 'https://api.line.me/v2/bot/message/reply',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'lineMessagingApi',
        sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify({ replyToken: $json.replyToken, messages: $json.replyMessages }) }}',
        options: {}
    },
    name: '回覆 LINE',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [3300, 0],
    credentials: lineCred
});

// Webhook 回應
addNode({
    parameters: { respondWith: 'json', responseBody: '={{ { "status": "ok", "timestamp": $now } }}' },
    name: 'Webhook 回應',
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1,
    position: [3500, 0]
});

// 錯誤觸發
addNode({
    parameters: {},
    name: '錯誤觸發',
    type: 'n8n-nodes-base.errorTrigger',
    typeVersion: 1,
    position: [200, 1000]
});

// 錯誤回覆
addNode({
    parameters: {
        method: 'POST',
        url: 'https://api.line.me/v2/bot/message/reply',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'lineMessagingApi',
        sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify({ replyToken: $(\'統一前置處理\').item.json.replyToken, messages: [{ type: \'text\', text: \'⚠️ 系統接獲異常，請稍後再試。/ System Error\' }] }) }}',
        options: {}
    },
    name: '錯誤回覆',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [400, 1000],
    credentials: lineCred
});

// --- Connections ---

addConnection('LINE Webhook', '統一前置處理');
addConnection('統一前置處理', '查詢員工資料');
addConnection('查詢員工資料', '超級路由');
addConnection('超級路由', '狀態分流');

// Switch Outputs
addConnection('狀態分流', '新員工歡迎', 0, 0); // new_user
addConnection('狀態分流', '設定語言', 1, 0); // set_language
addConnection('狀態分流', '查詢今日打卡', 2, 0); // start_clock
addConnection('狀態分流', '查詢今日業績', 3, 0); // store_selected
addConnection('狀態分流', '業績輸入驗證', 4, 0); // revenue_input
addConnection('狀態分流', '下載照片', 5, 0); // photo_uploaded
addConnection('狀態分流', '處理取消', 6, 0); // cancel
// Fallback (7) -> 錯誤回覆?? Or just end. Default is end.

// Flow Chains
addConnection('查詢今日打卡', '判斷上下班');
addConnection('判斷上下班', '檢查動作類型');
addConnection('檢查動作類型', '生成門市選單', 0, 0); // clockin
addConnection('檢查動作類型', '準備下班照片請求', 1, 0); // clockout (fallback)

addConnection('查詢今日業績', '準備上班照片請求');

addConnection('下載照片', '上傳至 Drive');
addConnection('上傳至 Drive', '設定 Drive 權限');
addConnection('設定 Drive 權限', '處理照片上傳');

// Merge All
const mergeSources = [
    '新員工歡迎',
    '設定語言',
    '生成門市選單',
    '準備上班照片請求',
    '業績輸入驗證',
    '準備下班照片請求',
    '處理照片上傳',
    '處理取消'
];

mergeSources.forEach(src => {
    addConnection(src, '匯總合併', 0, 0);
});

addConnection('匯總合併', '更新員工狀態');
addConnection('更新員工狀態', '準備試算表更新');
addConnection('準備試算表更新', '判斷更新類型');

addConnection('判斷更新類型', '新增記錄', 0, 0); // append
addConnection('判斷更新類型', '更新記錄', 1, 0); // default (update)

addConnection('新增記錄', '回覆 LINE');
addConnection('更新記錄', '回覆 LINE');

addConnection('回覆 LINE', 'Webhook 回應');

addConnection('錯誤觸發', '錯誤回覆');

const output = {
    nodes: nodes,
    connections: connections,
    pinData: {},
    meta: { instanceId: 'generated-v16-final-skill-compliant' }
};

fs.writeFileSync('line-clock-in-bot-v16-final.json', JSON.stringify(output, null, 2));
console.log('v16 Final (SKILL Compliant) JSON generated successfully.');
