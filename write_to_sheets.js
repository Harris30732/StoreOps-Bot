// This script generates a Google Apps Script code file
// that the user can paste into their spreadsheet's Script Editor and run.

const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'work_hours_output.json'), 'utf-8'));

// Build the Apps Script code
let script = `
// Google Apps Script — 3月份薪資表
// 貼到 Google Sheets 的「擴充功能 > Apps Script」，然後執行 main()

function main() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 預支紀錄: { 員工名稱關鍵字: { date: '3/28', amount: 5000 } }
  var advances = {
    '德勇': { date: '3/28', amount: 5000 }
  };

  var employees = ${JSON.stringify(data)};

  employees.forEach(function(emp) {
    // 建立或取得分頁
    var sheet = ss.getSheetByName(emp.name);
    if (sheet) {
      sheet.clear();
    } else {
      sheet = ss.insertSheet(emp.name);
    }

    // 確保有足夠的欄數 (需要 34 欄，預設只有 26)
    if (sheet.getMaxColumns() < 34) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), 34 - sheet.getMaxColumns());
    }

    // 設定欄寬
    sheet.setColumnWidth(1, 100); // A
    sheet.setColumnWidth(2, 60);  // B
    sheet.setColumnWidth(3, 70);  // C
    for (var c = 4; c <= 34; c++) {
      sheet.setColumnWidth(c, 55); // D~AH
    }

    // 計算此員工的預支金額
    var advanceAmount = 0;
    var advanceDay = '';
    for (var key in advances) {
      if (emp.name.includes(key)) {
        advanceAmount = advances[key].amount;
        advanceDay = advances[key].date;
        break;
      }
    }
    var netSalary = emp.totalSalary - advanceAmount;

    // 建立 10 行 x 34 欄的資料陣列
    var rows = [];
    for (var r = 0; r < 10; r++) {
      rows.push(new Array(34).fill(''));
    }

    // Row 1: 標題 + Date + 日期
    rows[0][0] = '3月份薪資表';
    rows[0][2] = 'Date';

    // Row 2: 時薪 + Week + 星期
    rows[1][0] = '時薪';
    rows[1][1] = emp.hourlyRate;
    rows[1][2] = 'Week';

    // Row 3: 上班
    rows[2][2] = '上班';

    // Row 4: 下班
    rows[3][2] = '下班';

    // Row 5: 獎金
    rows[4][2] = '獎金';

    // Row 6: 總時數 + 上班時數
    rows[5][0] = '總時數';
    rows[5][1] = emp.totalHours;
    rows[5][2] = '上班時數';

    // Row 7: 薪資
    rows[6][2] = '薪資';

    // Row 8: 總薪資 + 備註
    rows[7][0] = '總薪資';
    rows[7][1] = emp.totalSalary;
    rows[7][2] = '備註';

    // Row 9: 預支
    rows[8][0] = '預支';
    rows[8][1] = advanceAmount > 0 ? advanceAmount : '';
    rows[8][2] = advanceAmount > 0 ? advanceDay : '';

    // Row 10: 實領
    rows[9][0] = '實領';
    rows[9][1] = netSalary;

    // 填入每天的資料 (D~AH, index 3~33)
    emp.days.forEach(function(day, i) {
      var col = 3 + i; // D=3, E=4, ...
      rows[0][col] = '3/' + day.day;
      rows[1][col] = day.weekDay;

      if (day.status === 'none') {
        // 完全沒紀錄
        rows[2][col] = '';
        rows[3][col] = '';
        rows[5][col] = 0;
        rows[6][col] = 0;
        rows[7][col] = '沒有紀錄';
      } else if (day.status === 'missing') {
        // 只有一張照片 — 缺資料
        rows[2][col] = day.clockIn;
        rows[3][col] = '';
        rows[5][col] = 0;
        rows[6][col] = 0;
        rows[7][col] = '缺資料';
      } else {
        // 正常
        rows[2][col] = day.clockIn;
        rows[3][col] = day.clockOut;
        rows[5][col] = day.hours > 0 ? day.hours : 0;
        rows[6][col] = day.salary > 0 ? day.salary : 0;
      }
      rows[4][col] = day.bonus > 0 ? day.bonus : '';
    });

    // 寫入資料
    sheet.getRange(1, 1, 10, 34).setValues(rows);

    // 格式化
    // 標題列 (Row 1) 粗體
    sheet.getRange(1, 1, 1, 34).setFontWeight('bold');

    // A 欄標籤粗體
    sheet.getRange(1, 1, 10, 1).setFontWeight('bold');

    // C 欄標籤粗體
    sheet.getRange(1, 3, 10, 1).setFontWeight('bold');

    // 時薪、總時數、總薪資 底色
    sheet.getRange(2, 1, 1, 2).setBackground('#FFFF00'); // 黃色
    sheet.getRange(6, 1, 1, 2).setBackground('#FFFF00');
    sheet.getRange(8, 1, 1, 2).setBackground('#FFFF00');

    // 上班時數列底色 (淺藍)
    sheet.getRange(6, 3, 1, 32).setBackground('#E8F0FE');

    // 週六日欄位底色 (淺灰)
    emp.days.forEach(function(day, i) {
      var col = 4 + i; // D=4
      if (day.weekDay === '星期六' || day.weekDay === '星期日') {
        sheet.getRange(1, col, 10, 1).setBackground('#F0F0F0');
      }
    });

    // 預支、實領列底色
    if (advanceAmount > 0) {
      sheet.getRange(9, 1, 1, 2).setBackground('#FFCDD2').setFontColor('#C62828'); // 紅色調 — 預支
    }
    sheet.getRange(10, 1, 1, 2).setBackground('#C8E6C9').setFontWeight('bold'); // 綠色調 — 實領

    // 備註列(Row 8)：標記缺資料(橘色)和沒有紀錄(灰色)
    emp.days.forEach(function(day, i) {
      var col = 4 + i; // D=4
      if (day.status === 'missing') {
        sheet.getRange(8, col).setBackground('#FFCC80').setFontColor('#D84315');
        sheet.getRange(3, col).setBackground('#FFCC80');
      } else if (day.status === 'none') {
        sheet.getRange(8, col).setFontColor('#9E9E9E');
      }
    });

    // 數字格式
    sheet.getRange(6, 4, 1, 31).setNumberFormat('0.##');
    sheet.getRange(7, 4, 1, 31).setNumberFormat('#,##0');

    // 凍結前3欄
    sheet.setFrozenColumns(3);
  });

  // 刪除預設的 Sheet1 (如果存在且不是唯一分頁)
  var defaultSheet = ss.getSheetByName('工作表1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  SpreadsheetApp.flush();
  Logger.log('完成！已建立 ' + employees.length + ' 個員工分頁');
}
`;

fs.writeFileSync(path.join(__dirname, 'sheets_script.gs'), script, 'utf-8');
console.log('Google Apps Script saved to sheets_script.gs');
console.log('Script length:', script.length, 'chars');
