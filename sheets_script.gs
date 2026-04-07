
// Google Apps Script — 3月份薪資表
// 貼到 Google Sheets 的「擴充功能 > Apps Script」，然後執行 main()

function main() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 預支紀錄: { 員工名稱關鍵字: { date: '3/28', amount: 5000 } }
  var advances = {
    '德勇': { date: '3/28', amount: 5000 }
  };

  var employees = [{"name":"阿豪(Hào)","hourlyRate":210,"totalHours":115.75,"totalBonus":400,"totalSalary":24707.5,"days":[{"day":1,"weekDay":"星期日","clockIn":"16:56","clockOut":"22:06","hours":5,"salary":1050,"bonus":0,"status":"ok"},{"day":2,"weekDay":"星期一","clockIn":"17:28","clockOut":"00:32","hours":7,"salary":1470,"bonus":0,"status":"ok"},{"day":3,"weekDay":"星期二","clockIn":"17:30","clockOut":"23:00","hours":5.5,"salary":1155,"bonus":0,"status":"ok"},{"day":4,"weekDay":"星期三","clockIn":"15:22","clockOut":"23:30","hours":8,"salary":1680,"bonus":0,"status":"ok"},{"day":5,"weekDay":"星期四","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":6,"weekDay":"星期五","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":7,"weekDay":"星期六","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":8,"weekDay":"星期日","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":9,"weekDay":"星期一","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":10,"weekDay":"星期二","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":11,"weekDay":"星期三","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":12,"weekDay":"星期四","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":13,"weekDay":"星期五","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":14,"weekDay":"星期六","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":15,"weekDay":"星期日","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":16,"weekDay":"星期一","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":17,"weekDay":"星期二","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":18,"weekDay":"星期三","clockIn":"17:33","clockOut":"23:39","hours":6,"salary":1260,"bonus":0,"status":"ok"},{"day":19,"weekDay":"星期四","clockIn":"17:30","clockOut":"01:02","hours":7.5,"salary":1575,"bonus":0,"status":"ok"},{"day":20,"weekDay":"星期五","clockIn":"18:23","clockOut":"22:31","hours":4,"salary":840,"bonus":0,"status":"ok"},{"day":21,"weekDay":"星期六","clockIn":"09:59","clockOut":"17:00","hours":7,"salary":1470,"bonus":100,"status":"ok"},{"day":22,"weekDay":"星期日","clockIn":"13:58","clockOut":"00:04","hours":10,"salary":2100,"bonus":100,"status":"ok"},{"day":23,"weekDay":"星期一","clockIn":"17:13","clockOut":"22:57","hours":5.5,"salary":1155,"bonus":0,"status":"ok"},{"day":24,"weekDay":"星期二","clockIn":"18:26","clockOut":"22:27","hours":4,"salary":840,"bonus":0,"status":"ok"},{"day":25,"weekDay":"星期三","clockIn":"17:28","clockOut":"00:36","hours":7,"salary":1470,"bonus":0,"status":"ok"},{"day":26,"weekDay":"星期四","clockIn":"17:30","clockOut":"20:53","hours":3.25,"salary":682.5,"bonus":0,"status":"ok"},{"day":27,"weekDay":"星期五","clockIn":"17:46","clockOut":"22:46","hours":5,"salary":1050,"bonus":0,"status":"ok"},{"day":28,"weekDay":"星期六","clockIn":"09:59","clockOut":"17:01","hours":7,"salary":1470,"bonus":100,"status":"ok"},{"day":29,"weekDay":"星期日","clockIn":"13:50","clockOut":"23:59","hours":10,"salary":2100,"bonus":100,"status":"ok"},{"day":30,"weekDay":"星期一","clockIn":"17:29","clockOut":"00:33","hours":7,"salary":1470,"bonus":0,"status":"ok"},{"day":31,"weekDay":"星期二","clockIn":"17:28","clockOut":"00:36","hours":7,"salary":1470,"bonus":0,"status":"ok"}]},{"name":"阿和(Hoà 37)","hourlyRate":200,"totalHours":115.75,"totalBonus":300,"totalSalary":23450,"days":[{"day":1,"weekDay":"星期日","clockIn":"09:55","clockOut":"16:57","hours":7,"salary":1400,"bonus":100,"status":"ok"},{"day":2,"weekDay":"星期一","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":3,"weekDay":"星期二","clockIn":"14:26","clockOut":"18:59","hours":4.5,"salary":900,"bonus":0,"status":"ok"},{"day":4,"weekDay":"星期三","clockIn":"14:28","clockOut":"18:32","hours":4,"salary":800,"bonus":0,"status":"ok"},{"day":5,"weekDay":"星期四","clockIn":"14:19","clockOut":"18:30","hours":4,"salary":800,"bonus":0,"status":"ok"},{"day":6,"weekDay":"星期五","clockIn":"14:19","clockOut":"18:30","hours":4,"salary":800,"bonus":0,"status":"ok"},{"day":7,"weekDay":"星期六","clockIn":"09:57","clockOut":"19:02","hours":9,"salary":1800,"bonus":100,"status":"ok"},{"day":8,"weekDay":"星期日","clockIn":"09:53","clockOut":"18:33","hours":8.5,"salary":1700,"bonus":100,"status":"ok"},{"day":9,"weekDay":"星期一","clockIn":"14:25","clockOut":"18:33","hours":4,"salary":800,"bonus":0,"status":"ok"},{"day":10,"weekDay":"星期二","clockIn":"14:26","clockOut":"18:29","hours":4,"salary":800,"bonus":0,"status":"ok"},{"day":11,"weekDay":"星期三","clockIn":"14:26","clockOut":"18:30","hours":4,"salary":800,"bonus":0,"status":"ok"},{"day":12,"weekDay":"星期四","clockIn":"14:27","clockOut":"18:31","hours":4,"salary":800,"bonus":0,"status":"ok"},{"day":13,"weekDay":"星期五","clockIn":"14:23","clockOut":"19:02","hours":4.5,"salary":900,"bonus":0,"status":"ok"},{"day":14,"weekDay":"星期六","clockIn":"13:55","clockOut":"18:58","hours":5,"salary":1000,"bonus":0,"status":"ok"},{"day":15,"weekDay":"星期日","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":16,"weekDay":"星期一","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":17,"weekDay":"星期二","clockIn":"14:20","clockOut":"18:30","hours":4,"salary":800,"bonus":0,"status":"ok"},{"day":18,"weekDay":"星期三","clockIn":"14:29","clockOut":"18:30","hours":4,"salary":800,"bonus":0,"status":"ok"},{"day":19,"weekDay":"星期四","clockIn":"14:26","clockOut":"18:58","hours":4.5,"salary":900,"bonus":0,"status":"ok"},{"day":20,"weekDay":"星期五","clockIn":"14:25","clockOut":"18:29","hours":4,"salary":800,"bonus":0,"status":"ok"},{"day":21,"weekDay":"星期六","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":22,"weekDay":"星期日","clockIn":"10:00","clockOut":"16:00","hours":6,"salary":1200,"bonus":0,"status":"ok"},{"day":23,"weekDay":"星期一","clockIn":"14:22","clockOut":"18:37","hours":4.25,"salary":850,"bonus":0,"status":"ok"},{"day":24,"weekDay":"星期二","clockIn":"14:25","clockOut":"18:28","hours":4,"salary":800,"bonus":0,"status":"ok"},{"day":25,"weekDay":"星期三","clockIn":"14:28","clockOut":"18:59","hours":4.5,"salary":900,"bonus":0,"status":"ok"},{"day":26,"weekDay":"星期四","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":27,"weekDay":"星期五","clockIn":"14:27","clockOut":"22:30","hours":8,"salary":1600,"bonus":0,"status":"ok"},{"day":28,"weekDay":"星期六","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":29,"weekDay":"星期日","clockIn":"09:54","clockOut":"16:01","hours":6,"salary":1200,"bonus":0,"status":"ok"},{"day":30,"weekDay":"星期一","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":31,"weekDay":"星期二","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"}]},{"name":"阿善(Minh Thiện)","hourlyRate":210,"totalHours":156.25,"totalBonus":700,"totalSalary":33512.5,"days":[{"day":1,"weekDay":"星期日","clockIn":"13:56","clockOut":"22:03","hours":8,"salary":1680,"bonus":100,"status":"ok"},{"day":2,"weekDay":"星期一","clockIn":"16:32","clockOut":"22:05","hours":5.5,"salary":1155,"bonus":0,"status":"ok"},{"day":3,"weekDay":"星期二","clockIn":"15:53","clockOut":"20:27","hours":4.5,"salary":945,"bonus":0,"status":"ok"},{"day":4,"weekDay":"星期三","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":5,"weekDay":"星期四","clockIn":"16:27","clockOut":"23:02","hours":6.5,"salary":1365,"bonus":0,"status":"ok"},{"day":6,"weekDay":"星期五","clockIn":"18:48","clockOut":"00:52","hours":6,"salary":1260,"bonus":0,"status":"ok"},{"day":7,"weekDay":"星期六","clockIn":"14:05","clockOut":"00:36","hours":10.5,"salary":2205,"bonus":100,"status":"ok"},{"day":8,"weekDay":"星期日","clockIn":"13:54","clockOut":"22:01","hours":8,"salary":1680,"bonus":100,"status":"ok"},{"day":9,"weekDay":"星期一","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":10,"weekDay":"星期二","clockIn":"16:10","clockOut":"20:46","hours":4.5,"salary":945,"bonus":0,"status":"ok"},{"day":11,"weekDay":"星期三","clockIn":"16:23","clockOut":"01:00","hours":8.5,"salary":1785,"bonus":0,"status":"ok"},{"day":12,"weekDay":"星期四","clockIn":"16:09","clockOut":"00:15","hours":8,"salary":1680,"bonus":0,"status":"ok"},{"day":13,"weekDay":"星期五","clockIn":"16:12","clockOut":"23:49","hours":7.5,"salary":1575,"bonus":0,"status":"ok"},{"day":14,"weekDay":"星期六","clockIn":"13:53","clockOut":"21:17","hours":7.25,"salary":1522.5,"bonus":100,"status":"ok"},{"day":15,"weekDay":"星期日","clockIn":"13:52","clockOut":"22:46","hours":8.75,"salary":1837.5,"bonus":100,"status":"ok"},{"day":16,"weekDay":"星期一","clockIn":"16:00","clockOut":"20:04","hours":4,"salary":840,"bonus":0,"status":"ok"},{"day":17,"weekDay":"星期二","clockIn":"16:10","clockOut":"20:18","hours":4,"salary":840,"bonus":0,"status":"ok"},{"day":18,"weekDay":"星期三","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":19,"weekDay":"星期四","clockIn":"16:09","clockOut":"20:14","hours":4,"salary":840,"bonus":0,"status":"ok"},{"day":20,"weekDay":"星期五","clockIn":"16:10","clockOut":"00:44","hours":8.5,"salary":1785,"bonus":0,"status":"ok"},{"day":21,"weekDay":"星期六","clockIn":"13:50","clockOut":"22:15","hours":8.25,"salary":1732.5,"bonus":100,"status":"ok"},{"day":22,"weekDay":"星期日","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":23,"weekDay":"星期一","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":24,"weekDay":"星期二","clockIn":"16:10","clockOut":"19:34","hours":3.25,"salary":682.5,"bonus":0,"status":"ok"},{"day":25,"weekDay":"星期三","clockIn":"16:09","clockOut":"20:16","hours":4,"salary":840,"bonus":0,"status":"ok"},{"day":26,"weekDay":"星期四","clockIn":"16:09","clockOut":"00:00","hours":7.75,"salary":1627.5,"bonus":0,"status":"ok"},{"day":27,"weekDay":"星期五","clockIn":"15:59","clockOut":"17:46","hours":1.75,"salary":367.5,"bonus":0,"status":"ok"},{"day":28,"weekDay":"星期六","clockIn":"14:07","clockOut":"02:00","hours":11.75,"salary":2467.5,"bonus":100,"status":"ok"},{"day":29,"weekDay":"星期日","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":30,"weekDay":"星期一","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":31,"weekDay":"星期二","clockIn":"16:29","clockOut":"22:04","hours":5.5,"salary":1155,"bonus":0,"status":"ok"}]},{"name":"阿海(OK)","hourlyRate":210,"totalHours":203,"totalBonus":700,"totalSalary":43330,"days":[{"day":1,"weekDay":"星期日","clockIn":"21:52","clockOut":"02:54","hours":5,"salary":1050,"bonus":0,"status":"ok"},{"day":2,"weekDay":"星期一","clockIn":"21:29","clockOut":"02:57","hours":5.25,"salary":1102.5,"bonus":0,"status":"ok"},{"day":3,"weekDay":"星期二","clockIn":"18:32","clockOut":"02:56","hours":8.25,"salary":1732.5,"bonus":0,"status":"ok"},{"day":4,"weekDay":"星期三","clockIn":"18:27","clockOut":"02:52","hours":8.25,"salary":1732.5,"bonus":0,"status":"ok"},{"day":5,"weekDay":"星期四","clockIn":"18:24","clockOut":"03:05","hours":8.5,"salary":1785,"bonus":0,"status":"ok"},{"day":6,"weekDay":"星期五","clockIn":"18:25","clockOut":"03:04","hours":8.5,"salary":1785,"bonus":0,"status":"ok"},{"day":7,"weekDay":"星期六","clockIn":"16:49","clockOut":"04:00","hours":11,"salary":2310,"bonus":100,"status":"ok"},{"day":8,"weekDay":"星期日","clockIn":"16:28","clockOut":"03:00","hours":10.5,"salary":2205,"bonus":100,"status":"ok"},{"day":9,"weekDay":"星期一","clockIn":"18:16","clockOut":"03:00","hours":8.5,"salary":1785,"bonus":0,"status":"ok"},{"day":10,"weekDay":"星期二","clockIn":"18:24","clockOut":"03:02","hours":8.5,"salary":1785,"bonus":0,"status":"ok"},{"day":11,"weekDay":"星期三","clockIn":"18:28","clockOut":"03:00","hours":8.5,"salary":1785,"bonus":0,"status":"ok"},{"day":12,"weekDay":"星期四","clockIn":"18:57","clockOut":"02:35","hours":7.5,"salary":1575,"bonus":0,"status":"ok"},{"day":13,"weekDay":"星期五","clockIn":"18:27","clockOut":"02:51","hours":8.25,"salary":1732.5,"bonus":0,"status":"ok"},{"day":14,"weekDay":"星期六","clockIn":"17:57","clockOut":"04:07","hours":10,"salary":2100,"bonus":100,"status":"ok"},{"day":15,"weekDay":"星期日","clockIn":"16:57","clockOut":"02:57","hours":10,"salary":2100,"bonus":100,"status":"ok"},{"day":16,"weekDay":"星期一","clockIn":"16:48","clockOut":"22:00","hours":5,"salary":1050,"bonus":0,"status":"ok"},{"day":17,"weekDay":"星期二","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":18,"weekDay":"星期三","clockIn":"18:26","clockOut":"02:48","hours":8.25,"salary":1732.5,"bonus":0,"status":"ok"},{"day":19,"weekDay":"星期四","clockIn":"21:50","clockOut":"03:01","hours":5,"salary":1050,"bonus":0,"status":"ok"},{"day":20,"weekDay":"星期五","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":21,"weekDay":"星期六","clockIn":"16:46","clockOut":"23:31","hours":6.75,"salary":1417.5,"bonus":100,"status":"ok"},{"day":22,"weekDay":"星期日","clockIn":"21:55","clockOut":"03:00","hours":5,"salary":1050,"bonus":0,"status":"ok"},{"day":23,"weekDay":"星期一","clockIn":"18:28","clockOut":"23:01","hours":4.5,"salary":945,"bonus":0,"status":"ok"},{"day":24,"weekDay":"星期二","clockIn":"21:58","clockOut":"03:00","hours":5,"salary":1050,"bonus":0,"status":"ok"},{"day":25,"weekDay":"星期三","clockIn":"21:55","clockOut":"03:01","hours":5,"salary":1050,"bonus":0,"status":"ok"},{"day":26,"weekDay":"星期四","clockIn":"15:58","clockOut":"22:02","hours":6,"salary":1260,"bonus":0,"status":"ok"},{"day":27,"weekDay":"星期五","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":28,"weekDay":"星期六","clockIn":"16:26","clockOut":"23:03","hours":6.5,"salary":1365,"bonus":100,"status":"ok"},{"day":29,"weekDay":"星期日","clockIn":"15:57","clockOut":"23:01","hours":7,"salary":1470,"bonus":100,"status":"ok"},{"day":30,"weekDay":"星期一","clockIn":"15:23","clockOut":"22:02","hours":6.5,"salary":1365,"bonus":0,"status":"ok"},{"day":31,"weekDay":"星期二","clockIn":"20:57","clockOut":"03:00","hours":6,"salary":1260,"bonus":0,"status":"ok"}]},{"name":"德勇(鄭德勇)","hourlyRate":200,"totalHours":200,"totalBonus":900,"totalSalary":40900,"days":[{"day":1,"weekDay":"星期日","clockIn":"13:25","clockOut":"23:01","hours":9.5,"salary":1900,"bonus":100,"status":"ok"},{"day":2,"weekDay":"星期一","clockIn":"13:55","clockOut":"19:29","hours":5.5,"salary":1100,"bonus":0,"status":"ok"},{"day":3,"weekDay":"星期二","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":4,"weekDay":"星期三","clockIn":"14:00","clockOut":"16:55","hours":2.75,"salary":550,"bonus":0,"status":"ok"},{"day":5,"weekDay":"星期四","clockIn":"13:57","clockOut":"18:59","hours":5,"salary":1000,"bonus":0,"status":"ok"},{"day":6,"weekDay":"星期五","clockIn":"13:59","clockOut":"23:37","hours":9.5,"salary":1900,"bonus":0,"status":"ok"},{"day":7,"weekDay":"星期六","clockIn":"14:00","clockOut":"21:15","hours":7.25,"salary":1450,"bonus":100,"status":"ok"},{"day":8,"weekDay":"星期日","clockIn":"13:51","clockOut":"00:01","hours":10,"salary":2000,"bonus":100,"status":"ok"},{"day":9,"weekDay":"星期一","clockIn":"15:20","clockOut":"00:13","hours":8.75,"salary":1750,"bonus":0,"status":"ok"},{"day":10,"weekDay":"星期二","clockIn":"14:19","clockOut":"00:38","hours":10.25,"salary":2050,"bonus":0,"status":"ok"},{"day":11,"weekDay":"星期三","clockIn":"13:48","clockOut":"20:01","hours":6,"salary":1200,"bonus":0,"status":"ok"},{"day":12,"weekDay":"星期四","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":13,"weekDay":"星期五","clockIn":"13:58","clockOut":"21:30","hours":7.5,"salary":1500,"bonus":0,"status":"ok"},{"day":14,"weekDay":"星期六","clockIn":"13:54","clockOut":"00:29","hours":10.5,"salary":2100,"bonus":100,"status":"ok"},{"day":15,"weekDay":"星期日","clockIn":"13:59","clockOut":"23:30","hours":9.5,"salary":1900,"bonus":100,"status":"ok"},{"day":16,"weekDay":"星期一","clockIn":"14:23","clockOut":"00:55","hours":10.5,"salary":2100,"bonus":0,"status":"ok"},{"day":17,"weekDay":"星期二","clockIn":"13:57","clockOut":"00:40","hours":10.5,"salary":2100,"bonus":0,"status":"ok"},{"day":18,"weekDay":"星期三","clockIn":"13:57","clockOut":"19:28","hours":5.5,"salary":1100,"bonus":0,"status":"ok"},{"day":19,"weekDay":"星期四","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":20,"weekDay":"星期五","clockIn":"13:58","clockOut":"21:15","hours":7.25,"salary":1450,"bonus":0,"status":"ok"},{"day":21,"weekDay":"星期六","clockIn":"13:56","clockOut":"01:28","hours":11.5,"salary":2300,"bonus":100,"status":"ok"},{"day":22,"weekDay":"星期日","clockIn":"13:49","clockOut":"21:33","hours":7.5,"salary":1500,"bonus":100,"status":"ok"},{"day":23,"weekDay":"星期一","clockIn":"13:54","clockOut":"18:58","hours":5,"salary":1000,"bonus":0,"status":"ok"},{"day":24,"weekDay":"星期二","clockIn":"14:19","clockOut":"23:31","hours":9,"salary":1800,"bonus":0,"status":"ok"},{"day":25,"weekDay":"星期三","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":26,"weekDay":"星期四","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":27,"weekDay":"星期五","clockIn":"14:14","clockOut":"19:30","hours":5.25,"salary":1050,"bonus":0,"status":"ok"},{"day":28,"weekDay":"星期六","clockIn":"13:45","clockOut":"21:48","hours":8,"salary":1600,"bonus":100,"status":"ok"},{"day":29,"weekDay":"星期日","clockIn":"13:49","clockOut":"21:01","hours":7,"salary":1400,"bonus":100,"status":"ok"},{"day":30,"weekDay":"星期一","clockIn":"13:57","clockOut":"19:00","hours":5,"salary":1000,"bonus":0,"status":"ok"},{"day":31,"weekDay":"星期二","clockIn":"13:56","clockOut":"19:59","hours":6,"salary":1200,"bonus":0,"status":"ok"}]},{"name":"阿七(阮文七)","hourlyRate":200,"totalHours":84.5,"totalBonus":200,"totalSalary":17100,"days":[{"day":1,"weekDay":"星期日","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":2,"weekDay":"星期一","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":3,"weekDay":"星期二","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":4,"weekDay":"星期三","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":5,"weekDay":"星期四","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":6,"weekDay":"星期五","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":7,"weekDay":"星期六","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":8,"weekDay":"星期日","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":9,"weekDay":"星期一","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":10,"weekDay":"星期二","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":11,"weekDay":"星期三","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":12,"weekDay":"星期四","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":13,"weekDay":"星期五","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":14,"weekDay":"星期六","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":15,"weekDay":"星期日","clockIn":"09:50","clockOut":"18:59","hours":9,"salary":1800,"bonus":100,"status":"ok"},{"day":16,"weekDay":"星期一","clockIn":"21:27","clockOut":"02:52","hours":5.25,"salary":1050,"bonus":0,"status":"ok"},{"day":17,"weekDay":"星期二","clockIn":"18:28","clockOut":"03:15","hours":8.75,"salary":1750,"bonus":0,"status":"ok"},{"day":18,"weekDay":"星期三","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":19,"weekDay":"星期四","clockIn":"18:43","clockOut":"22:30","hours":3.75,"salary":750,"bonus":0,"status":"ok"},{"day":20,"weekDay":"星期五","clockIn":"21:56","clockOut":"03:30","hours":5.5,"salary":1100,"bonus":0,"status":"ok"},{"day":21,"weekDay":"星期六","clockIn":"21:56","clockOut":"04:00","hours":6,"salary":1200,"bonus":0,"status":"ok"},{"day":22,"weekDay":"星期日","clockIn":"15:59","clockOut":"23:00","hours":7,"salary":1400,"bonus":100,"status":"ok"},{"day":23,"weekDay":"星期一","clockIn":"21:56","clockOut":"03:00","hours":5,"salary":1000,"bonus":0,"status":"ok"},{"day":24,"weekDay":"星期二","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"},{"day":25,"weekDay":"星期三","clockIn":"18:57","clockOut":"22:30","hours":3.5,"salary":700,"bonus":0,"status":"ok"},{"day":26,"weekDay":"星期四","clockIn":"21:27","clockOut":"03:01","hours":5.5,"salary":1100,"bonus":0,"status":"ok"},{"day":27,"weekDay":"星期五","clockIn":"20:28","clockOut":"04:00","hours":7.5,"salary":1500,"bonus":0,"status":"ok"},{"day":28,"weekDay":"星期六","clockIn":"21:55","clockOut":"04:00","hours":6,"salary":1200,"bonus":0,"status":"ok"},{"day":29,"weekDay":"星期日","clockIn":"21:56","clockOut":"04:00","hours":6,"salary":1200,"bonus":0,"status":"ok"},{"day":30,"weekDay":"星期一","clockIn":"21:27","clockOut":"03:15","hours":5.75,"salary":1150,"bonus":0,"status":"ok"},{"day":31,"weekDay":"星期二","clockIn":"","clockOut":"","hours":0,"salary":0,"bonus":0,"status":"none"}]}];

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
