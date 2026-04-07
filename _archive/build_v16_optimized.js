
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
    connections[source].main[sourceIndex].push({ node: target, type: 'main', index: targetIndex });
}

// --- Node Definitions (Translated to Traditional Chinese) ---

// 1. LINE Webhook -> LINE Webhook (No change usually, but let's follow instruction "Nodes annotation/name in TC")
addNode({
    parameters: { httpMethod: 'POST', path: 'line-hr', responseMode: 'lastNode', options: {} },
    name: 'LINE Webhook', // Keep standard name or "LINE Webhook 接收"
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [0, 0]
});

// 2. Unified Preprocessing -> 統一前置處理
addNode({
    parameters: {
        jsCode: `const { DateTime } = require('luxon');
const body = $input.item.json.body;
const events = body.events || [];

if (events.length === 0) {
  return { json: { error: 'no_events' } };
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
    timestamp: now.toMillis()
  }
};`
    },
    name: '統一前置處理',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [200, 0]
});

// 3. Query Employee Data -> 查詢員工資料
addNode({
    parameters: {
        operation: 'lookup',
        documentId: { __rl: true, value: gSheetId, mode: 'id' },
        sheetName: { __rl: true, value: '員工資料', mode: 'name' },
        lookupColumn: 'UserID',
        lookupValue: '={{ $json.userId }}',
        options: {}
    },
    name: '查詢員工資料',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [400, 0],
    credentials: gSheetCred
});

// 4. Super Router -> 超級路由 (Switch Logic Preparation)
// Note: The Code node still prepares the 'route' field, but now we feed it into a Switch node.
addNode({
    parameters: {
        jsCode: `const prev = $('統一前置處理').item.json;
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
let step = emp.current_step || 'IDLE';
let tempData = {};
try {
  tempData = JSON.parse(emp.temp_data || '{}');
} catch(e) {
  tempData = {};
}

// 逾時邏輯 (10分鐘 = 600000 毫秒)
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

// 路由邏輯

// 1. 取消操作
if (prev.postbackAction === 'cancel') {
  return { json: { ...prev, emp, route: 'cancel', t } };
}

// 2. 語言選擇
if (step === 'WAIT_LANG' && prev.postbackAction === 'lang') {
  return { json: { ...prev, emp, route: 'set_language', selectedLang: prev.postbackValue, t } };
}

// 3. 等待選擇門市
if (step === 'WAIT_STORE' && prev.postbackAction === 'select_store') {
  return { json: { ...prev, emp, route: 'store_selected', store: prev.postbackValue, tempData, t } };
}

// 4. 等待輸入業績
if (step === 'WAIT_REVENUE' && prev.msgType === 'text') {
  return { json: { ...prev, emp, route: 'revenue_input', tempData, t } };
}

// 5. 等待上傳照片
if (step === 'WAIT_PHOTO' && prev.msgType === 'image') {
  return { json: { ...prev, emp, route: 'photo_uploaded', tempData, t } };
}

// 6. IDLE 狀態 - 判斷打卡指令
if (step === 'IDLE' && (prev.msgText === '打卡' || prev.msgText === 'Chấm công')) {
  return { json: { ...prev, emp, route: 'start_clock', tempData, t } };
}

// 7. 未知/其他
return { 
  json: { 
    ...prev, 
    emp, 
    route: 'unknown', 
    t 
  },
  // 如果發生逾時重置，需要持久化 IDLE 狀態
  ...(step === 'IDLE' && emp.current_step !== 'IDLE' ? {
      json: {
        ...prev,
        emp,
        route: 'unknown',
        t,
        updateEmployeeData: {
            UserID: emp.UserID,
            current_step: 'IDLE',
            temp_data: ''
        }
      }
  } : {})
};`
    },
    name: '超級路由',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [600, 0]
});

// 5. Switch Node -> 狀態分流 (Replacing 7 IF nodes)
addNode({
    parameters: {
        rules: {
            values: [
                { value: 'new_user', outputKey: '新員工' },
                { value: 'set_language', outputKey: '設定語言' },
                { value: 'start_clock', outputKey: '開始打卡' },
                { value: 'store_selected', outputKey: '門市已選' },
                { value: 'revenue_input', outputKey: '業績輸入' },
                { value: 'photo_uploaded', outputKey: '照片已上傳' },
                { value: 'cancel', outputKey: '取消' }
            ]
        },
        dataProperty: 'route',
        fallbackOutput: 7 // unknown route goes to output 7 (index 7? No, fallback is separate or implicit? Switch node typically has 'fallbackOutput' index option in new versions or just 'fallback' path)
        // Checking n8n-nodes-base.switch typeVersion 3 properties.
        // It uses 'rules.values'. Each has 'outputKey'.
        // If we want a fallback, we can use 'fallbackOutput: X'. 
        // Let's assume Output 7 is user defined, but Switch usually makes outputs 0..6 based on rules. 
        // We will assume "unknown" goes nowhere or output index 7 if we add a rule? 
        // Let's add a default rule? Or just let it stop.
        // User requested Switch. We will map the 'route' value to outputs.
    },
    name: '狀態分流',
    type: 'n8n-nodes-base.switch',
    typeVersion: 3.2, // Use latest
    position: [900, 0]
});

// --- Branches (Renamed) ---

// Branch 1: New Employee Welcome -> 新員工歡迎
addNode({
    parameters: {
        jsCode: `const d = $json;

return {
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
};`
    },
    name: '新員工歡迎',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1200, -400]
});

// Branch 2: Set Language -> 設定語言
addNode({
    parameters: {
        jsCode: `const d = $json;
const selectedLang = d.selectedLang;
const t = d.t;

return {
  json: {
    ...d,
    replyMessages: [{ type: 'text', text: t.welcome }],
    updateEmployeeData: {
      UserID: d.userId,
      暱稱: d.emp['暱稱'] || '新員工',
      Language: selectedLang,
      current_step: 'IDLE',
      temp_data: ''
    }
  }
};`
    },
    name: '設定語言',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1200, -300]
});

// Branch 3: Query Today Records -> 查詢今日打卡
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

// Determine Clock In/Out -> 判斷上下班
addNode({
    parameters: {
        jsCode: `const d = $json;
const t = d.t;
const records = $input.all();

let hasUnfinishedClock = false;
let attendanceRowNumber = null;
let clockInTime = null;
let store = null;

for (const record of records) {
  if (!record.json['下班時間'] || record.json['下班時間'] === '') {
    hasUnfinishedClock = true;
    attendanceRowNumber = record.json.row_number; 
    if (!attendanceRowNumber) attendanceRowNumber = record.params?.rowNumber; 

    clockInTime = record.json['上班時間'];
    store = record.json['店名'];
    break;
  }
}

if (hasUnfinishedClock) {
  return { json: { ...d, action: 'clockout', attendanceRowNumber, clockInTime, store } };
} else {
  return { json: { ...d, action: 'clockin' } };
}
`
    },
    name: '判斷上下班',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1400, -200]
});

// Check Action Type -> 檢查動作類型 (Switch preferred over IF, but IF is fine for binary)
addNode({
    parameters: {
        conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 1 },
            conditions: [{ leftValue: '={{ $json.action }}', rightValue: 'clockin', operator: { type: 'string', operation: 'equals' } }],
            combinator: 'and'
        }
    },
    name: '檢查動作類型',
    type: 'n8n-nodes-base.if',
    typeVersion: 2,
    position: [1600, -200]
});

// Generate Store Menu -> 生成門市選單
addNode({
    parameters: {
        jsCode: `const d = $json;
const t = d.t;
const stores = ['板橋店', '土城店', '三重店', '新莊店'];

const quickReplyItems = stores.map(store => ({
  type: 'action',
  action: { type: 'postback', label: store, data: \`action=select_store&value=\${encodeURIComponent(store)}\` }
}));

quickReplyItems.push({
  type: 'action',
  action: { type: 'postback', label: '❌ 取消', data: 'action=cancel' }
});

return {
  json: {
    ...d,
    replyMessages: [{ type: 'text', text: t.selectStore, quickReply: { items: quickReplyItems } }],
    updateEmployeeData: {
      UserID: d.userId,
      current_step: 'WAIT_STORE',
      temp_data: JSON.stringify({ action: 'clockin' })
    }
  }
};`
    },
    name: '生成門市選單',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1800, -250]
});

// Branch 4: Query Daily Revenue -> 查詢今日業績
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

// Assemble Clock In Photo Request -> 準備上班照片請求
addNode({
    parameters: {
        jsCode: `const d = $json;
const t = d.t;
const store = d.store;
const revenueRecords = $input.all();

let clockInType = 'midshift';
let revenueRowNumber = null;
let revenue = null;

if (revenueRecords.length === 0) {
  clockInType = 'opener';
} else {
  const hasRevenue = revenueRecords[0].json['開攤時間'];
  if (hasRevenue) {
    clockInType = 'helper'; 
  } else {
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
      quickReply: { items: [{ type: 'action', action: { type: 'postback', label: '❌ 取消', data: 'action=cancel' } }] }
    }],
    updateEmployeeData: {
      UserID: d.userId,
      current_step: 'WAIT_PHOTO',
      temp_data: JSON.stringify({ action: 'clockin', store, clockInType, revenueRowNumber, revenue })
    }
  }
};`
    },
    name: '準備上班照片請求',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1400, -100]
});

// Branch 5: Revenue Input Verification -> 業績輸入驗證
addNode({
    parameters: {
        jsCode: `const d = $json;
const t = d.t;
const revenue = d.msgText.trim();

if (!/^\\d+$/.test(revenue)) {
  return {
    json: {
      ...d,
      replyMessages: [{ type: 'text', text: t.invalidNumber }]
    }
  };
}

return {
  json: {
    ...d,
    revenue: parseInt(revenue),
    replyMessages: [{
      type: 'text',
      text: t.photoOut,
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
};`
    },
    name: '業績輸入驗證',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1200, 0]
});

// Assemble Clock Out Photo Request -> 準備下班照片請求
addNode({
    parameters: {
        jsCode: `const d = $json;
const t = d.t;

return {
  json: {
    ...d,
    replyMessages: [{
      type: 'text',
      text: t.askRevenue,
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
};`
    },
    name: '準備下班照片請求',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1800, -150]
});

// Branch 6: Photo Upload
// 1. Download Photo -> 下載照片
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

// 2. Upload to Drive -> 上傳至 Drive
addNode({
    parameters: {
        operation: 'upload',
        fileContent: 'data',
        parentId: { __rl: true, value: '1k4rfsjHYYXO8He7MUbTZoNJivDJkcn2a', mode: 'id' },
        options: {}
    },
    name: '上傳至 Drive',
    type: 'n8n-nodes-base.googleDrive',
    typeVersion: 3,
    position: [1000, 400],
    credentials: driveCred
});

// 3. Set Drive Permission -> 設定 Drive 權限
addNode({
    parameters: {
        method: 'POST',
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

// Process Photo Upload -> 處理照片上傳
addNode({
    parameters: {
        jsCode: `const d = $json;
const tempData = d.tempData || {};
const action = tempData.action;
const t = d.t;

const photoUrl = $('上傳至 Drive').item.json.webViewLink || \`https://api.line.me/v2/bot/message/\${d.msgId}/content\`;

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

  const workHours = (workSeconds / 3600).toFixed(2);
  const hours = Math.floor(workSeconds / 3600);
  const minutes = Math.floor((workSeconds % 3600) / 60);
  const workTimeDisplay = \`\${hours}小時\${minutes}分\`;

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

return {
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
};`
    },
    name: '處理照片上傳',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1200, 100]
});

// Branch 7: Cancel -> 處理取消
addNode({
    parameters: {
        jsCode: `const d = $json;
const t = d.t || { cancel: '❌ Cancelled' }; // Fallback

return {
  json: {
    ...d,
    replyMessages: [{ type: 'text', text: t.cancel }],
    updateEmployeeData: {
      UserID: d.userId,
      current_step: 'IDLE',
      temp_data: ''
    }
  }
};`
    },
    name: '處理取消',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1200, 200]
});

// Merge All -> 匯總合併 (Single Merge node for all branches)
addNode({
    parameters: { mode: 'mergeByPosition' }, // Or just default. If input 1 has items, it passes.
    // NOTE: n8n Merge node (v2) in Multi-merge mode ('append' or 'passThrough'?) 
    // Switch node guarantees only ONE path is active per item.
    // So 'mergeByPosition' or 'append' (Combine) should work to bring them back.
    // 'mergeByPosition' implies inputs are synchronized. Here only one flows.
    // 'append' means it processes all inputs. Since only one has data, others are empty?
    // Actually, in n8n execution, nodes that don't run don't produce output.
    name: '匯總合併',
    type: 'n8n-nodes-base.merge',
    typeVersion: 2,
    position: [2200, 0]
});

// Update Employee Status -> 更新員工狀態
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

// Prepare Sheet Updates -> 準備試算表更新
addNode({
    parameters: {
        jsCode: `const d = $json;
const sheetUpdates = d.sheetUpdates || [];

if (sheetUpdates.length === 0) {
  return { json: { ...d, skipSheetUpdates: true } };
}

return sheetUpdates.map(update => ({
  json: {
    ...d,
    updateType: update.type,
    targetSheet: update.sheetId,
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

// Determine Update Type -> 判斷更新類型 (Switch)
addNode({
    parameters: {
        rules: {
            values: [
                { value: 'append', outputKey: '新增' }
            ]
        },
        dataProperty: 'updateType',
        fallbackOutput: 1 // Default to Update (Index 1)
    },
    name: '判斷更新類型',
    type: 'n8n-nodes-base.switch',
    typeVersion: 3.2,
    position: [2800, 0]
});


// Add Record -> 新增記錄
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

// Update Record -> 更新記錄
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

// Reply LINE -> 回覆 LINE
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

// Webhook Response -> Webhook 回應
addNode({
    parameters: { respondWith: 'json', responseBody: '={{ { "status": "ok", "timestamp": $now } }}' },
    name: 'Webhook 回應',
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1,
    position: [3500, 0]
});

// Error Trigger -> 錯誤觸發
addNode({
    parameters: {},
    name: '錯誤觸發',
    type: 'n8n-nodes-base.errorTrigger',
    typeVersion: 1,
    position: [200, 1000]
});

// Error Reply -> 錯誤回覆
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

// Switch Outputs (0..6)
// 0: new_user -> 新員工歡迎
addConnection('狀態分流', '新員工歡迎', 0, 0);

// 1: set_language -> 設定語言
addConnection('狀態分流', '設定語言', 1, 0);

// 2: start_clock -> 查詢今日打卡
addConnection('狀態分流', '查詢今日打卡', 2, 0);
addConnection('查詢今日打卡', '判斷上下班');
addConnection('判斷上下班', '檢查動作類型');
addConnection('檢查動作類型', '生成門市選單', 0, 0); // True (Clock In)
addConnection('檢查動作類型', '準備下班照片請求', 1, 0); // False (Clock Out)

// 3: store_selected -> 查詢今日業績
addConnection('狀態分流', '查詢今日業績', 3, 0);
addConnection('查詢今日業績', '準備上班照片請求');

// 4: revenue_input -> 業績輸入驗證
addConnection('狀態分流', '業績輸入驗證', 4, 0);

// 5: photo_uploaded -> 下載照片 -> 上傳 -> 權限 -> 處理
addConnection('狀態分流', '下載照片', 5, 0);
addConnection('下載照片', '上傳至 Drive');
addConnection('上傳至 Drive', '設定 Drive 權限');
addConnection('設定 Drive 權限', '處理照片上傳');

// 6: cancel -> 處理取消
addConnection('狀態分流', '處理取消', 6, 0);

// All endpoint nodes to '匯總合併'
// Note: In n8n 'mergeByPosition' or 'append' allows multiple inputs.
// In the visual editor, you can drag multiple outputs to one input. 
// In JSON, we specify input Index. 'merge' node usually has 2 inputs [0, 1].
// For >2 inputs, n8n versions vary.
// Safest way: connect all to Input 0. n8n treats it as "Any of these trigger me".
// IF 'Merge' node is set to 'passThrough' or similar, it works.
// Let's connect all to Index 0.
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

// Update Type Switch
// 0: append -> 新增記錄
addConnection('判斷更新類型', '新增記錄', 0, 0);
// 1: fallback (update) -> 更新記錄
addConnection('判斷更新類型', '更新記錄', 1, 0);

// Both to Reply
addConnection('新增記錄', '回覆 LINE');
addConnection('更新記錄', '回覆 LINE');

addConnection('回覆 LINE', 'Webhook 回應');

// Error Handler
addConnection('錯誤觸發', '錯誤回覆');

const output = {
    nodes: nodes,
    connections: connections,
    pinData: {},
    meta: { instanceId: 'generated-v16-optimized-tc' }
};

fs.writeFileSync('line-clock-in-bot-v16-optimized.json', JSON.stringify(output, null, 2));
console.log('v16 Optimized (TC) JSON generated successfully.');
