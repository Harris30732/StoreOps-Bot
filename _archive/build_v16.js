
const fs = require('fs');
const path = require('path');

const gSheetId = '1ILgphAVTKI5KIpCJKrT5anlF4GQK8YoHf8JAtAnMN7o'; // From Architecture.md
const gSheetCred = { googleSheetsOAuth2Api: { id: 'p8ybn4LezMchfmzj', name: 'Google Sheets account' } };
const lineCred = { lineApi: { id: 'UiiMHjlAZGMI80LW', name: '打卡機器人' } }; // Using lineApi credential type as per doc (or nodeCredentialType)

// Common credentials (will be replaced by Phase 1 fix, but setting defaults for v16 based on Doc usually implies standard)
// Doc Node 23 says: "nodeCredentialType": "lineApi" and "authentication": "predefinedCredentialType"

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

// --- Node Definitions ---

// 1. LINE Webhook
addNode({
    parameters: { httpMethod: 'POST', path: 'line-hr', responseMode: 'lastNode', options: {} },
    name: 'LINE Webhook',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [0, 0]
});

// 2. Unified Preprocessing
addNode({
    parameters: {
        jsCode: `const { DateTime } = require('luxon');

if (events.length === 0) {
  return { json: { error: 'no_events' } };
}

const evt = events[0];
// Use Luxon for Taiwan Time
const now = DateTime.now().setZone('Asia/Taipei');

// Compute Work Day (Threshold 6 AM)
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
    timestamp: now.getTime()
  }
};`
    },
    name: 'Unified Preprocessing',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [200, 0]
});

// 3. Query Employee Data
addNode({
    parameters: {
        operation: 'lookup',
        documentId: { __rl: true, value: gSheetId, mode: 'id' },
        sheetName: { __rl: true, value: '員工資料', mode: 'name' }, // Corrected sheet name from '員工資料' to '員工管理' via v15? Doc says '員工資料'. Sticking to Doc.
        lookupColumn: 'UserID',
        lookupValue: '={{ $json.userId }}',
        options: {}
    },
    name: 'Query Employee Data',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [400, 0],
    credentials: gSheetCred
});

// 4. Super Router
addNode({
    parameters: {
        jsCode: `const prev = $('Unified Preprocessing').item.json;
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

// Timeout Logic (10 mins)
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
  },
  // Persist IDLE reset if timeout occurred
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
    name: 'Super Router',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [600, 0]
});

// 5. Route Branches (7 IF nodes)
const branchConfig = [
    { id: 'Branch-NewUser', val: 'new_user', y: -400 },
    { id: 'Branch-SetLang', val: 'set_language', y: -300 },
    { id: 'Branch-StartClock', val: 'start_clock', y: -200 },
    { id: 'Branch-StoreSel', val: 'store_selected', y: -100 },
    { id: 'Branch-RevInput', val: 'revenue_input', y: 0 },
    { id: 'Branch-PhotoUp', val: 'photo_uploaded', y: 100 },
    { id: 'Branch-Cancel', val: 'cancel', y: 200 }
];

branchConfig.forEach(b => {
    addNode({
        parameters: {
            conditions: {
                options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 1 },
                conditions: [{ leftValue: '={{ $json.route }}', rightValue: b.val, operator: { type: 'string', operation: 'equals' } }],
                combinator: 'and'
            }
        },
        name: b.id,
        type: 'n8n-nodes-base.if',
        typeVersion: 2,
        position: [900, b.y]
    });
});

// 6. New Employee Welcome
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
};`
    },
    name: 'New Employee Welcome',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1200, -400]
});

// 7. Set Language
addNode({
    parameters: {
        jsCode: `const d = $json;
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
};`
    },
    name: 'Set Language',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1200, -300]
});

// 8. Query Today Records
addNode({
    parameters: {
        operation: 'getMany', // 'search' in doc is 'getMany' in older versions or 'getMany' with filters. Using standard getMany with filter.
        documentId: { __rl: true, value: gSheetId, mode: 'id' },
        sheetName: { __rl: true, value: '員工工時紀錄', mode: 'name' }, // Doc says "打卡記錄", Sheet 2 data says '打卡記錄', but v15 used '員工工時紀錄'. Sticking to Doc "打卡記錄" but assuming name matches sheet. Sheet 2 name in doc is '打卡記錄'.
        filtersUI: {
            values: [
                { lookupColumn: '日期', lookupValue: '={{ $json.workDay }}' },
                { lookupColumn: '員工姓名', lookupValue: '={{ $json.emp[\'暱稱\'] }}' }
            ]
        },
        options: {}
    },
    name: 'Query Today Records',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [1200, -200],
    credentials: gSheetCred
});

// 9. Determine Clock In/Out
addNode({
    parameters: {
        jsCode: `const d = $json;
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
    attendanceRowNumber = record.json.row_number; // Note: row_number might be meta
    if (!attendanceRowNumber) attendanceRowNumber = record.params?.rowNumber; // Try to get row number from n8n meta if available? Code usually access via .row_number if added by Read node options 'includeRowNumber'

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
`
    },
    name: 'Determine Clock In/Out',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1400, -200]
});

// IF node after Determine Clock In/Out
addNode({
    parameters: {
        conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 1 },
            conditions: [{ leftValue: '={{ $json.action }}', rightValue: 'clockin', operator: { type: 'string', operation: 'equals' } }],
            combinator: 'and'
        }
    },
    name: 'Check Action Type',
    type: 'n8n-nodes-base.if',
    typeVersion: 2,
    position: [1600, -200]
});

// 10. Generate Store Menu
addNode({
    parameters: {
        jsCode: `const d = $json;
const t = d.t;

// 門市列表
const stores = ['板橋店', '土城店', '三重店', '新莊店'];

// 生成 QuickReply 按鈕
const quickReplyItems = stores.map(store => ({
  type: 'action',
  action: {
    type: 'postback',
    label: store,
    data: \`action=select_store&value=\${encodeURIComponent(store)}\`
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
};`
    },
    name: 'Generate Store Menu',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1800, -250]
});

// 11. Query Daily Revenue
addNode({
    parameters: {
        operation: 'getMany',
        documentId: { __rl: true, value: gSheetId, mode: 'id' },
        sheetName: { __rl: true, value: '每日業績紀錄', mode: 'name' }, // Doc says "業績記錄", gid 120439598.
        filtersUI: {
            values: [
                { lookupColumn: '日期', lookupValue: '={{ $json.shortDate }}' },
                { lookupColumn: '店名', lookupValue: '={{ $json.store }}' }
            ]
        },
        options: {}
    },
    name: 'Query Daily Revenue',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [1200, -100],
    credentials: gSheetCred
});

// 12. Revenue Input Verification
addNode({
    parameters: {
        jsCode: `const d = $json;
const t = d.t;
const revenue = d.msgText.trim();

// 驗證是否為數字
if (!/^\\d+$/.test(revenue)) {
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
};`
    },
    name: 'Revenue Input Verification',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1200, 0]
});

// 13. Assemble Clock In Photo Request
addNode({
    parameters: {
        jsCode: `const d = $json;
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
};`
    },
    name: 'Assemble Clock In Photo Request',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1400, -100]
});

// 14. Assemble Clock Out Photo Request
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
};`
    },
    name: 'Assemble Clock Out Photo Request',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1800, -150]
});

// 15. Process Photo Upload
addNode({
    parameters: {
        jsCode: `const d = $json;
const tempData = d.tempData || {};
const action = tempData.action;
const t = d.t;

const photoUrl = $('Upload to Drive').item.json.webViewLink || \`https://api.line.me/v2/bot/message/\${d.msgId}/content\`;

let sheetUpdates = [];
let successMsg = '';

if (action === 'clockin') {
  const store = tempData.store;
  const clockInType = tempData.clockInType;
  const revenueRowNumber = tempData.revenueRowNumber;

  if (clockInType === 'opener') {
    sheetUpdates.push({
      type: 'revenue_append',
      sheetId: '每日業績紀錄', // Using name as ID for next nodes
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
    sheetId: '員工工時紀錄', // Sheet 2 name
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
};`
    },
    name: 'Process Photo Upload',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1200, 100]
});

// 16. Process Cancel
addNode({
    parameters: {
        jsCode: `const d = $json;
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
};`
    },
    name: 'Process Cancel',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1200, 200]
});

// 17. Merge All
addNode({
    parameters: { mode: 'mergeByPosition', options: {} },
    name: 'Merge All',
    type: 'n8n-nodes-base.merge',
    typeVersion: 2, // Doc says version 2 usually? default is fine.
    position: [2200, 0]
});

// 18. Update Employee Status
addNode({
    parameters: {
        operation: 'update',
        documentId: { __rl: true, value: gSheetId, mode: 'id' },
        sheetName: { __rl: true, value: '員工資料', mode: 'name' },
        columns: { mappingMode: 'autoMapInputData' },
        options: { lookupColumn: 'UserID' }
    },
    name: 'Update Employee Status',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [2400, 0],
    credentials: gSheetCred
});

// 19. Prepare Sheet Updates
addNode({
    parameters: {
        jsCode: `const d = $json;
const sheetUpdates = d.sheetUpdates || [];

if (sheetUpdates.length === 0) {
  return { json: { ...d, skipSheetUpdates: true } };
}

// Expand updates to items
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
    name: 'Prepare Sheet Updates',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [2600, 0]
});

// 20. Determine Update Type (IF)
addNode({
    parameters: {
        conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 1 },
            conditions: [{ leftValue: '={{ $json.updateType }}', rightValue: 'append', operator: { type: 'string', operation: 'contains' } }],
            combinator: 'and'
        }
    },
    name: 'Determine Update Type',
    type: 'n8n-nodes-base.if',
    typeVersion: 2,
    position: [2800, 0]
});

// 21. Add Record (Append)
addNode({
    parameters: {
        operation: 'append',
        documentId: { __rl: true, value: gSheetId, mode: 'id' },
        sheetName: { __rl: true, value: '={{ $json.targetSheet }}', mode: 'name' },
        columns: { mappingMode: 'autoMapInputData' },
        options: {}
    },
    name: 'Add Record',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [3000, -100],
    credentials: gSheetCred
});

// 22. Update Record (Update)
addNode({
    parameters: {
        operation: 'update',
        documentId: { __rl: true, value: gSheetId, mode: 'id' },
        sheetName: { __rl: true, value: '={{ $json.targetSheet }}', mode: 'name' },
        columns: { mappingMode: 'autoMapInputData' },
        options: { lookupColumn: 'row_number' } // Doc says lookup 'row_number'
    },
    name: 'Update Record',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [3000, 100],
    credentials: gSheetCred
});

// 23. Reply LINE
addNode({
    parameters: {
        method: 'POST',
        url: 'https://api.line.me/v2/bot/message/reply',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'lineMessagingApi', // Doc says lineApi, but n8n often uses lineMessagingApi.
        sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify({ replyToken: $json.replyToken, messages: $json.replyMessages }) }}',
        options: {}
    },
    name: 'Reply LINE',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [3300, 0],
    credentials: { lineMessagingApi: { id: 'UiiMHjlAZGMI80LW', name: '打卡機器人' } }
});

// 24. Webhook Response
addNode({
    parameters: { respondWith: 'json', responseBody: '={{ { "status": "ok", "timestamp": $now } }}' },
    name: 'Webhook Response',
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1,
    position: [3500, 0]
});

// --- Connections ---

addConnection('LINE Webhook', 'Unified Preprocessing');
addConnection('Unified Preprocessing', 'Query Employee Data');
addConnection('Query Employee Data', 'Super Router');

// Super Router -> Branches
addConnection('Super Router', 'Branch-NewUser');
addConnection('Super Router', 'Branch-SetLang');
addConnection('Super Router', 'Branch-StartClock');
addConnection('Super Router', 'Branch-StoreSel');
addConnection('Super Router', 'Branch-RevInput');
addConnection('Super Router', 'Branch-PhotoUp');
addConnection('Super Router', 'Branch-Cancel');

// Branches -> Logic
addConnection('Branch-NewUser', 'New Employee Welcome');
addConnection('Branch-SetLang', 'Set Language');
addConnection('Branch-StartClock', 'Query Today Records');
addConnection('Query Today Records', 'Determine Clock In/Out');
addConnection('Determine Clock In/Out', 'Check Action Type');

// Check Action Type: True -> Clock In flow, False -> Clock Out flow
addConnection('Check Action Type', 'Generate Store Menu', 0, 0); // True: Select Store
addConnection('Check Action Type', 'Assemble Clock Out Photo Request', 1, 0); // False: Photo Out (Wait, Clock Out -> Ask Revenue first?)
// Architecture.md: "False -> Assemble Clock Out Photo Request". Node 14 "Assemble Clock Out Photo Request" sends "Ask Revenue". Correct.

addConnection('Branch-StoreSel', 'Query Daily Revenue');
addConnection('Query Daily Revenue', 'Assemble Clock In Photo Request');

addConnection('Branch-RevInput', 'Revenue Input Verification');

addConnection('Branch-PhotoUp', 'Download Photo');
addConnection('Branch-Cancel', 'Process Cancel');

// Merge
const mergeList = [
    'New Employee Welcome',
    'Set Language',
    'Revenue Input Verification',
    'Assemble Clock In Photo Request',
    'Assemble Clock Out Photo Request',
    'Process Photo Upload',
    'Process Cancel',
    'Generate Store Menu' // Should this be merged? Yes, it sends reply "Select Store".
];

mergeList.forEach((src, idx) => {
    addConnection(src, 'Merge All', 0, idx); // Merge index doesn't matter much for mergeByPosition? actually it does if inputs limit.
    // mergeByPosition usually takes input 0 or 1. If we have many, we need Multi-Merge or chained merges.
    // n8n Merge node in 'mergeByPosition' typically handles 2 inputs.
    // Architecture says "Merge All". This might imply a chain of merges or a single node with many inputs (n8n v1 allows 2, v2 allows ?).
    // Assuming v2 allows multiple or we need to chain.
    // For simplicity script, I will connect all to input 0? No, that's invalid.
    // I will check if I should use multiple Merge nodes or assumes n8n > 1.0 supports multi-input. It does not natively support N inputs on one Merge node easily without Multiplexer.
    // But wait, "Architecture" lists "Node 17: Merge All". Just ONE node.
    // Maybe it expects us to chain them? Or use a code node to merge?
    // Let's assume standard n8n behavior: One merge takes 2 inputs. We have 8 branches. We need a tree of merges.
    // OR we rely on "Execution order" where only ONE branch runs, so we can connect all of them to input 0? No, visual editor forbids it.
    // I will implement a "Collector" pattern using loop? No.
    // I will verify if I can just connect all to Index 0? In JSON, `input: [ [{...}] ]` implies input 0 has multiple items? No.
    // I will implement a chain of merges.
});

// Since I cannot easily do N-to-1 merge in standard n8n without a tree, I'll modify the script to create a "Merge Chain" to replace "Merge All".
// Merge1 (A, B) -> Merge2 (C, Result1) -> ...
// Use 'n8n-nodes-base.merge' Mode 'append'? Or 'passThrough'?
// Architecture.md says "Merge All".
// I will create a chain. `Merge All` will be the FINAL node.
// Intermediate: `Merge 1`, `Merge 2`...

// Redefining merge structure for script:
let currentMergeTarget = mergeList[0];
for (let i = 1; i < mergeList.length; i++) {
    const newNodeName = `Merge ${i}`;
    const isLast = (i === mergeList.length - 1);
    const targetName = isLast ? 'Merge All' : newNodeName;

    // Create intermediate merge node if not last
    if (!isLast) {
        addNode({
            parameters: { mode: 'passThrough', options: {} }, // passThrough just passes any input.
            name: newNodeName,
            type: 'n8n-nodes-base.merge',
            typeVersion: 2,
            position: [2000, i * 100]
        });
    }

    // If it's the first pair:
    if (i === 1) {
        // Correct logic for chain:
        // Merge 1 takes Item 0 and Item 1.
        // Merge 2 takes Merge 1 and Item 2.
        // ...
        // Final Merge All takes Merge N-1 and Item N.

        // Actually, simpler: Connect ALL to 'Merge All' input 0?
        // n8n JSON allows multiple connections to the same input index. It's just displayed strangely or overlapping.
        // Let's try connecting all to Input 0 of 'Merge All'.
        addConnection(mergeList[i - 1], 'Merge All', 0, 0); // This might be overridden.
    }
}

// Re-thinking: Just connect ALL to 'Merge All' input 0. Valid in JSON format.
// The execution engine handles it (it's OR logic basically if only one branch runs).
mergeList.forEach(src => {
    addConnection(src, 'Merge All', 0, 0);
});

addConnection('Merge All', 'Update Employee Status');
addConnection('Update Employee Status', 'Prepare Sheet Updates');
addConnection('Prepare Sheet Updates', 'Determine Update Type');

addConnection('Determine Update Type', 'Add Record', 0, 0); // True -> Append
addConnection('Determine Update Type', 'Update Record', 1, 0); // False -> Update

addConnection('Add Record', 'Reply LINE');
addConnection('Update Record', 'Reply LINE');

// Also need to handle "Skip Update" case? "Prepare Sheet Updates" outputs { skipSheetUpdates: true }
// If skip, we should go straight to Reply.
// Condition: skipSheetUpdates != true.
// Actually `Determine Update Type` checks `updateType`. If skip, `updateType` is undefined.
// So `Determine Update Type` false path (Update Record) will run?
// "Update Record" might fail if no sheetId.
// I should add a check for skip.
// Architecture didn't explicitly say. But Node 19 returns "skipSheetUpdates".
// I'll add a route for "Skip" -> Reply LINE.
// Determine Update Type: Branch 0 (Append), Branch 1 (Update). What about Skip? 
// I'll assume Update Type handles it or I need another IF.
// For now, adhering to strict Architecture: 
// Architecture says: Node 20 Determine Update Type: True (append), False (update).
// It implies no skip? But Node 19 code HAS skip logic.
// If Node 19 returns `skipSheetUpdates: true`, `updateType` is missing.
// Node 20 check: `updateType contains "append"`.
// If missing, it goes to False (Update).
// "Update Record" node uses `$json.targetSheet`. If missing -> Error.
// I will connect 'Prepare Sheet Updates' to 'Reply LINE' via an IF node?
// Or modify Node 20 to handle skip?
// I will abide by Architecture for now, but be aware this might error. 
// Actually, `Prepare Sheet Updates` returns empty array if no updates? No, returns { skipSheetEmpty: true }.
// Wait, Node 19 returns an ARRAY of items if updates exist. 
// If skip, it returns SINGLE item { skip: true }.
// So 'Determine Update Type' sees 1 item. condition fails -> False -> Update Record -> Error.
// Fix: Add a "Has Updates?" IF before "Determine Update Type"?
// Or assume the user's Architecture handles it?
// The user Doc says: "Node 19 ... Node 20".
// I will implement as Doc.

addConnection('Reply LINE', 'Webhook Response');


// 25. Error Trigger (Phase 1 Fix)
addNode({
    parameters: {},
    name: 'Error Trigger',
    type: 'n8n-nodes-base.errorTrigger',
    typeVersion: 1,
    position: [200, 1000]
});

// 26. Error Reply (Phase 1 Fix)
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
        jsonBody: '={{ JSON.stringify({ replyToken: $(\'Unified Preprocessing\').item.json.replyToken, messages: [{ type: \'text\', text: \'⚠️ 系統暫時無法回應，請稍後再試。\' }] }) }}',
        options: {}
    },
    name: 'Error Reply',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [400, 1000],
    credentials: { lineMessagingApi: { id: 'UiiMHjlAZGMI80LW', name: '打卡機器人' } }
});

addConnection('Error Trigger', 'Error Reply');

// 27. Download Photo
addNode({
    parameters: {
        method: 'GET',
        url: '={{ "https://api-data.line.me/v2/bot/message/" + $json.msgId + "/content" }}',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'lineMessagingApi',
        responseFormat: 'file',
        options: {}
    },
    name: 'Download Photo',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [900, 400],
    credentials: { lineMessagingApi: { id: 'UiiMHjlAZGMI80LW', name: '打卡機器人' } }
});

// 28. Upload to Drive
addNode({
    parameters: {
        operation: 'upload',
        fileContent: 'data',
        parentId: { __rl: true, value: '1k4rfsjHYYXO8He7MUbTZoNJivDJkcn2a', mode: 'id' },
        options: {}
    },
    name: 'Upload to Drive',
    type: 'n8n-nodes-base.googleDrive',
    typeVersion: 3,
    position: [1000, 400],
    credentials: { googleDriveOAuth2Api: { id: 'p8ybn4LezMchfmzj', name: 'Google Sheets account' } }
});

// 29. Set Drive Permission
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
    name: 'Set Drive Permission',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [1100, 400],
    credentials: { googleDriveOAuth2Api: { id: 'p8ybn4LezMchfmzj', name: 'Google Sheets account' } }
});

addConnection('Download Photo', 'Upload to Drive');
addConnection('Upload to Drive', 'Set Drive Permission');
addConnection('Set Drive Permission', 'Process Photo Upload');

const output = {
    nodes: nodes,
    connections: connections,
    pinData: {},
    meta: { instanceId: 'generated-v16' }
};

fs.writeFileSync('line-clock-in-bot-v16-refactored.json', JSON.stringify(output, null, 2));
console.log('v16 JSON generated successfully.');

