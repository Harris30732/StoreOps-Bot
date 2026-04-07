const fs = require('fs');
const path = require('path');

const DIR = String.raw`C:\Users\R碰碰\OneDrive\桌面\工時計算`;

// Employee config: matched by file name keyword → { nickname, hourlyRate }
// We'll auto-detect actual sender name from file content
const EMPLOYEE_CONFIG_BY_FILE_KEYWORD = {
  'OK':       { nickname: '阿海(OK)', hourlyRate: 210 },
  'Minh':     { nickname: '阿善(Minh Thiện)', hourlyRate: 210 },
  'Hào':      { nickname: '阿豪(Hào)', hourlyRate: 210 },
  'Hoà':      { nickname: '阿和(Hoà 37)', hourlyRate: 200 },
  '鄭德勇':   { nickname: '德勇(鄭德勇)', hourlyRate: 200 },
  '阮文七':   { nickname: '阿七(阮文七)', hourlyRate: 200 },
};

const WEEKDAY_NAMES = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

// Map a timestamp to a "work day" (8AM-7:59AM next day)
// If time < 08:00, it belongs to the previous calendar day's work shift
function getWorkDay(dateStr, timeStr) {
  const [year, month, day] = dateStr.split('/').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);

  const dt = new Date(year, month - 1, day, hour, minute);

  if (hour < 8) {
    // belongs to previous day's shift
    const prev = new Date(dt);
    prev.setDate(prev.getDate() - 1);
    return {
      workDay: `${prev.getFullYear()}/${String(prev.getMonth() + 1).padStart(2, '0')}/${String(prev.getDate()).padStart(2, '0')}`,
      totalMinutes: hour * 60 + minute + 24 * 60, // offset for sorting (next day early AM)
      actualTime: timeStr,
      dt
    };
  }

  return {
    workDay: dateStr,
    totalMinutes: hour * 60 + minute,
    actualTime: timeStr,
    dt
  };
}

function parseFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);

  const fileBaseName = path.basename(filePath, '.txt').normalize('NFC');

  // Match config by checking if file name contains the keyword (NFC normalized)
  let config = null;
  for (const [keyword, cfg] of Object.entries(EMPLOYEE_CONFIG_BY_FILE_KEYWORD)) {
    if (fileBaseName.normalize('NFC').includes(keyword.normalize('NFC'))) {
      config = cfg;
      break;
    }
  }
  if (!config) {
    console.warn(`Unknown employee file: ${fileBaseName}`);
    return null;
  }

  // Auto-detect actual sender name from file content (first non-R碰碰 sender)
  let employeeName = null;
  for (const line of lines) {
    const m = line.match(/^\d{2}:\d{2}\t(.+?)\t/);
    if (m && m[1].trim() !== 'R碰碰') {
      employeeName = m[1].trim();
      break;
    }
  }
  if (!employeeName) return null;

  let currentDate = null;
  const photoRecords = []; // { workDay, totalMinutes, actualTime, calendarDate }

  for (const line of lines) {
    // Date line: 2026/03/01（日）
    const dateMatch = line.match(/^(\d{4}\/\d{2}\/\d{2})（.）$/);
    if (dateMatch) {
      currentDate = dateMatch[1];
      continue;
    }

    if (!currentDate) continue;

    // Message line: HH:MM\tSender\tContent
    const msgMatch = line.match(/^(\d{2}:\d{2})\t(.+?)\t(.+)$/);
    if (!msgMatch) continue;

    const [, timeStr, sender, content] = msgMatch;

    // Only count photos from the employee (not R碰碰/boss)
    if (sender.trim() !== employeeName) continue;
    if (content.trim() !== '[照片]') continue;

    const info = getWorkDay(currentDate, timeStr);

    // Only include work days in March 2026
    const [wy, wm] = info.workDay.split('/').map(Number);
    if (wy !== 2026 || wm !== 3) continue;

    photoRecords.push({
      ...info,
      calendarDate: currentDate
    });
  }

  // Group by work day
  const byWorkDay = {};
  for (const rec of photoRecords) {
    if (!byWorkDay[rec.workDay]) {
      byWorkDay[rec.workDay] = [];
    }
    byWorkDay[rec.workDay].push(rec);
  }

  // For each work day, find first and last photo
  const dailyData = {};
  for (const [workDay, records] of Object.entries(byWorkDay)) {
    records.sort((a, b) => a.totalMinutes - b.totalMinutes);

    const first = records[0];
    const last = records[records.length - 1];

    let clockIn = first.actualTime;
    let clockOut = last.actualTime;
    let workMinutes = 0;

    if (records.length > 1) {
      workMinutes = last.totalMinutes - first.totalMinutes;
    }

    // Floor to 15-minute increments
    const quarters = Math.floor(workMinutes / 15);
    const roundedHours = quarters * 0.25;

    // Check if weekend (Sat/Sun)
    const [y, m, d] = workDay.split('/').map(Number);
    const dayOfWeek = new Date(y, m - 1, d).getDay(); // 0=Sun, 6=Sat
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    const bonus = (isWeekend && roundedHours > 6) ? 100 : 0;

    // status: 'ok' = has both in/out, 'missing' = only 1 photo (缺資料)
    dailyData[workDay] = {
      clockIn,
      clockOut: records.length > 1 ? clockOut : '',
      hours: roundedHours,
      bonus,
      dayOfWeek,
      weekDayName: WEEKDAY_NAMES[dayOfWeek],
      status: records.length > 1 ? 'ok' : 'missing',
      photoCount: records.length
    };
  }

  return {
    employeeName,
    config,
    dailyData
  };
}

// Main
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.txt'));
const results = [];

for (const f of files) {
  const result = parseFile(path.join(DIR, f));
  if (result) results.push(result);
}

// Output summary
for (const r of results) {
  const { employeeName, config, dailyData } = r;
  console.log(`\n=== ${config.nickname} (時薪 ${config.hourlyRate}) ===`);

  let totalHours = 0;
  let totalBonus = 0;

  for (let day = 1; day <= 31; day++) {
    const dateKey = `2026/03/${String(day).padStart(2, '0')}`;
    const data = dailyData[dateKey];
    if (data) {
      totalHours += data.hours;
      totalBonus += data.bonus;
      const bonusStr = data.bonus > 0 ? ` 獎金${data.bonus}` : '';
      console.log(`  3/${day} ${data.weekDayName}: ${data.clockIn} ~ ${data.clockOut || data.clockIn} = ${data.hours}h${bonusStr}`);
    }
  }

  const totalSalary = totalHours * config.hourlyRate + totalBonus;
  console.log(`  總時數: ${totalHours}h | 總獎金: ${totalBonus} | 總薪資: ${totalSalary}`);
}

// Export JSON for Google Sheets writing
const output = results.map(r => {
  const { employeeName, config, dailyData } = r;
  const days = [];
  let totalHours = 0;
  let totalBonus = 0;

  for (let day = 1; day <= 31; day++) {
    const dateKey = `2026/03/${String(day).padStart(2, '0')}`;
    const data = dailyData[dateKey];
    const dayOfWeek = new Date(2026, 2, day).getDay();

    if (data) {
      totalHours += data.hours;
      totalBonus += data.bonus;
      days.push({
        day,
        weekDay: WEEKDAY_NAMES[dayOfWeek],
        clockIn: data.clockIn,
        clockOut: data.clockOut || '',
        hours: data.hours,
        salary: data.hours * config.hourlyRate,
        bonus: data.bonus,
        status: data.status // 'ok' or 'missing' (only 1 photo)
      });
    } else {
      days.push({
        day,
        weekDay: WEEKDAY_NAMES[dayOfWeek],
        clockIn: '',
        clockOut: '',
        hours: 0,
        salary: 0,
        bonus: 0,
        status: 'none' // no record at all
      });
    }
  }

  return {
    name: config.nickname,
    hourlyRate: config.hourlyRate,
    totalHours,
    totalBonus,
    totalSalary: totalHours * config.hourlyRate + totalBonus,
    days
  };
});

fs.writeFileSync(
  path.join(__dirname, 'work_hours_output.json'),
  JSON.stringify(output, null, 2),
  'utf-8'
);

console.log('\n\nJSON output saved to work_hours_output.json');
