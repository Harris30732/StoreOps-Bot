const fs = require('fs');

const inputFile = 'C:\\Users\\R碰碰\\.gemini\\antigravity\\scratch\\StoreOps_Bot\\line-clock-in-bot-v16-final.json';
const outputFile = 'C:\\Users\\R碰碰\\.gemini\\antigravity\\scratch\\StoreOps_Bot\\line-clock-in-bot-v16-refactored.json';

const workflow = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

// nodes to remove
const nodesToRemove = [
    '準備上班照片上傳', '準備下班照片上傳',
    '下載上班照片', '下載下班照片',
    '上傳Google Drive(上班)', '上傳Google Drive(下班)',
    '設定上班照片權限', '設定下班照片權限',
    '處理上班照片', '處理下班照片'
];

workflow.nodes = workflow.nodes.filter(n => !nodesToRemove.includes(n.name));

// New Unified Nodes
const newNodes = [
    {
        "parameters": {
            "jsCode": `const d = $json;
const msgId = d.msgId;
const empName = d.emp.暱稱;
const today = d.today;
const currentTime = d.currentTime;
const fullTimestamp = d.fullTimestamp;

let store = '';
let action = '';
let clockInType = '';
let rowNumber = '';
let revenue = 0;

// Determine context based on tempData
if (d.tempData) {
    if (d.tempData.action === 'clockin') {
        action = '上班';
        store = d.tempData.store || d.store;
        clockInType = d.tempData.clockInType || d.clockInType;
    } else if (d.tempData.action === 'clockout') {
        action = '下班';
        store = d.tempData.store || d.store;
        rowNumber = d.tempData.rowNumber || d.tempData.attendanceRowNumber;
        revenue = d.revenue || d.tempData.revenue;
    }
}

// Fallback logic if tempData is missing (should not happen in normal flow)
if (!action) {
    if (d.clockInType) action = '上班';
    else action = '下班';
}

const dateStr = today.replace(/\\//g, '-');
const timeStr = currentTime.replace(/:/g, '-');
const fileName = \`[\${empName}][\${store}][\${action}][\${dateStr}_\${timeStr}].jpg\`;

const photoDownloadUrl = \`https://api-data.line.me/v2/bot/message/\${msgId}/content\`;

return {
  json: {
    ...d,
    photoDownloadUrl,
    fileName,
    empName,
    store,
    action,
    clockInType,
    rowNumber,
    revenue,
    today,
    currentTime,
    fullTimestamp
  }
};`
        },
        "id": "unified-prep-photo",
        "name": "準備照片參數",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [-400, 480]
    },
    {
        "parameters": {
            "url": "={{ $json.photoDownloadUrl }}",
            "authentication": "genericCredentialType",
            "genericAuthType": "httpHeaderAuth",
            "sendHeaders": true,
            "headerParameters": { "parameters": [{}] },
            "options": {
                "response": { "response": { "responseFormat": "file" } }
            }
        },
        "id": "unified-download-photo",
        "name": "下載照片",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [-200, 480],
        "credentials": {
            "httpHeaderAuth": {
                "id": "6lnYe4oGvAiAFiYV",
                "name": "LINE打卡機器人"
            }
        }
    },
    {
        "parameters": {
            "name": "={{ $('準備照片參數').item.json.fileName }}",
            "driveId": { "__rl": true, "mode": "list", "value": "My Drive" },
            "folderId": { "__rl": true, "mode": "list", "value": "root", "cachedResultName": "/ (Root folder)" },
            "options": {}
        },
        "id": "unified-upload-drive",
        "name": "上傳至Drive",
        "type": "n8n-nodes-base.googleDrive",
        "typeVersion": 3,
        "position": [0, 480],
        "credentials": {
            "googleDriveOAuth2Api": {
                "id": "gK1ryUmaSpVTnVaX",
                "name": "Google Drive account"
            }
        }
    },
    {
        "parameters": {
            "operation": "update",
            "fileId": { "__rl": true, "value": "={{ $json.id }}", "mode": "id" },
            "options": {}
        },
        "id": "unified-drive-permission",
        "name": "設定檔案權限",
        "type": "n8n-nodes-base.googleDrive",
        "typeVersion": 3,
        "position": [200, 480],
        "credentials": {
            "googleDriveOAuth2Api": {
                "id": "gK1ryUmaSpVTnVaX",
                "name": "Google Drive account"
            }
        }
    },
    {
        "parameters": {
            "jsCode": `const prev = $('準備照片參數').item.json;
const root = $('讀取狀態與翻譯').item.json;
const driveResp = $json;

const fileId = driveResp.id;
const photoUrl = \`https://drive.google.com/file/d/\${fileId}/view\`;
const directUrl = \`https://drive.google.com/uc?export=view&id=\${fileId}\`;

const action = prev.action; // '上班' or '下班'
const fullTimestamp = prev.fullTimestamp;
const logRecord = \`[\${action}][\${fullTimestamp}][\${photoUrl}]\`;

// Logic specific to Clock In
let revenueRecord = '';
let remark = '';
if (action === '上班') {
    if (prev.clockInType === 'midshift' && prev.revenue) {
        revenueRecord = \`[上班][\${prev.store}][\${prev.revenue}][\${fullTimestamp}]\`;
    }
    const remarkMap = {
        'opener': '首位開攤',
        'helper': '小幫手(免業績)',
        'midshift': '中途上班'
    };
    remark = remarkMap[prev.clockInType] || '';
}

// Logic specific to Clock Out (Append to existing log)
// Note: We don't have the old log here easily without querying again, 
// so we will pass the *new* log line to the update node, which should append it if needed.
// However, the original logic for "處理下班照片" tried to read '打卡記錄' from '查詢今日打卡紀錄'.
// We can access that via $('查詢今日打卡紀錄').item.json IF it exists in the flow.

let updatedClockRecord = logRecord;
if (action === '下班') {
    // try to get old record
    try {
        const queryNode = $('查詢今日打卡紀錄').item.json;
        if (queryNode) {
             const oldClockRecord = queryNode['打卡記錄'] || '';
             updatedClockRecord = oldClockRecord ? \`\${oldClockRecord}\\n\${logRecord}\` : logRecord;
        }
    } catch(e) {
        // ignore if not found
    }
}

return {
  json: {
    ...prev,
    userId: root.userId,
    replyToken: root.replyToken,
    timestamp: root.timestamp,
    photoUrl,
    directUrl,
    fileId,
    logRecord, // The single new line
    updatedClockRecord, // The full record (for update)
    revenueRecord,
    remark
  }
};`
        },
        "id": "unified-generate-data",
        "name": "產生成品資料",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [400, 480]
    },
    {
        "parameters": {
            "rules": {
                "values": [
                    {
                        "conditions": {
                            "options": { "caseSensitive": true, "typeValidation": "strict" },
                            "conditions": [
                                {
                                    "leftValue": "={{ $json.action }}",
                                    "rightValue": "上班",
                                    "operator": { "type": "string", "operation": "equals" }
                                }
                            ],
                            "combinator": "and"
                        },
                        "renameOutput": true,
                        "outputKey": "clockin"
                    },
                    {
                        "conditions": {
                            "options": { "caseSensitive": true, "typeValidation": "strict" },
                            "conditions": [
                                {
                                    "leftValue": "={{ $json.action }}",
                                    "rightValue": "下班",
                                    "operator": { "type": "string", "operation": "equals" }
                                }
                            ],
                            "combinator": "and"
                        },
                        "renameOutput": true,
                        "outputKey": "clockout"
                    }
                ]
            }
        },
        "id": "unified-data-router",
        "name": "判斷資料流向",
        "type": "n8n-nodes-base.switch",
        "typeVersion": 3.1,
        "position": [600, 480]
    }
];

workflow.nodes.push(...newNodes);

// Update Connections

// 1. Redirect '狀態路由' outputs
// Output 4 (Index 4): "準備上班照片上傳" -> "準備照片參數"
// Output 5 (Index 5): "準備下班照片上傳" -> "準備照片參數"
const stateRouter = workflow.nodes.find(n => n.name === '狀態路由');
// connections structure: { "NodeName": { "main": [ [ { node: "Target", type: "main", index: 0 } ], ... ] } }
// We need to modify workflow.connections

const routerConn = workflow.connections['狀態路由'].main;
// Index 5 is for "準備上班照片上傳". Replace with "準備照片參數"
routerConn[5] = [{ node: '準備照片參數', type: 'main', index: 0 }];
// Index 6 is for "準備下班照片上傳". Replace with "準備照片參數"
routerConn[6] = [{ node: '準備照片參數', type: 'main', index: 0 }];


// 2. Connect unified nodes sequence
workflow.connections['準備照片參數'] = { main: [[{ node: '下載照片', type: 'main', index: 0 }]] };
workflow.connections['下載照片'] = { main: [[{ node: '上傳至Drive', type: 'main', index: 0 }]] };
workflow.connections['上傳至Drive'] = { main: [[{ node: '設定檔案權限', type: 'main', index: 0 }]] };
workflow.connections['設定檔案權限'] = { main: [[{ node: '產生成品資料', type: 'main', index: 0 }]] };
workflow.connections['產生成品資料'] = { main: [[{ node: '判斷資料流向', type: 'main', index: 0 }]] };

// 3. Connect Switch outputs to downstream
workflow.connections['判斷資料流向'] = {
    main: [
        // Clock In path -> "新增工時記錄"
        [{ node: '新增工時記錄', type: 'main', index: 0 }],
        // Clock Out path -> "更新下班記錄"
        [{ node: '更新下班記錄', type: 'main', index: 0 }]
    ]
};

// 4. Clean up old connections
// remove connections starting from removed nodes
nodesToRemove.forEach(name => {
    delete workflow.connections[name];
});

// 5. Update downstream node parameters to use new node references
// Node "新增工時記錄"
const addRecordNode = workflow.nodes.find(n => n.name === '新增工時記錄');
if (addRecordNode) {
    const map = addRecordNode.parameters.columns.value;
    map['日期'] = '={{ $json.today }}';
    map['員工姓名'] = '={{ $json.empName }}';
    map['店名'] = '={{ $json.store }}';
    map['上班時間'] = '={{ $json.currentTime }}';
    map['打卡記錄'] = '={{ $json.logRecord }}';
    map['業績記錄'] = '={{ $json.revenueRecord }}';
    map['備註'] = '={{ $json.remark }}';
}

// Node "更新下班記錄"
const updateOutNode = workflow.nodes.find(n => n.name === '更新下班記錄');
if (updateOutNode) {
    const map = updateOutNode.parameters.columns.value;
    map['下班時間'] = '={{ $json.currentTime }}';
    map['打卡記錄'] = '={{ $json.updatedClockRecord }}';
}

// Node "重置為IDLE(上班完成)" - uses `$('讀取狀態與翻譯').item.json.userId` which is fine.
// Node "回覆上班成功" - uses `$('處理上班照片').item.json` -> Change to `$('產生成品資料')`
const replyInOkNode = workflow.nodes.find(n => n.name === '回覆上班成功');
if (replyInOkNode) {
    replyInOkNode.parameters.jsCode = replyInOkNode.parameters.jsCode.replace('處理上班照片', '產生成品資料');
}

// Node "回覆下班成功" - uses `$('處理下班照片').item.json` -> Change to `$('產生成品資料')`
const replyOutOkNode = workflow.nodes.find(n => n.name === '回覆下班成功');
if (replyOutOkNode) {
    replyOutOkNode.parameters.jsCode = replyOutOkNode.parameters.jsCode.replace('處理下班照片', '產生成品資料');
}


fs.writeFileSync(outputFile, JSON.stringify(workflow, null, 2));
console.log('Refactoring complete.');
