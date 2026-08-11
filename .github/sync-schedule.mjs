const ENDPOINT = "http://fzielts.gedu.net.cn/fzielts/schedule_queryByTeacherClass.action";
const TEACHER_ID = process.env.TEACHER_ID || "510";
const EXTRA_DAYS = parseInt(process.env.EXTRA_DAYS || "15", 10);

// 以中国时区 (UTC+8) 计算日期，避免跨时区差一天
function cnDate(offsetDays) {
  const t = Date.now() + 8 * 3600 * 1000;
  const d = new Date(t + offsetDays * 86400 * 1000);
  return d.toISOString().split("T")[0];
}

// 当前所在日历月的第一天和最后一天
function cnMonthBounds() {
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0 起
  const mm = String(month + 1).padStart(2, "0");
  const first = `${year}-${mm}-01`;
  const lastDayNum = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lastOfMonth = `${year}-${mm}-${String(lastDayNum).padStart(2, "0")}`;
  return { first, lastOfMonth };
}

function parseEvent(raw) {
  if (!raw.classTime) return null;
  const [start, end] = raw.classTime.split("-");
  const content = (raw.content || "").replace(/<br>/g, "").split(/&nbsp;| /);
  const title = content.length > 1 ? content[1] : raw.content;
  if (title.includes("不排")) return null;
  return { date: raw.classDate, start, end, title, teacher: content[0] || "未知" };
}

async function main() {
  const { first, lastOfMonth } = cnMonthBounds();
  const endOfWindow = cnDate(EXTRA_DAYS);
  const last = lastOfMonth >= endOfWindow ? lastOfMonth : endOfWindow;
  console.log(`window: ${first} -> ${last}`);

  const events = [];
  const days = [];
  let cur = new Date(first + "T00:00:00Z");
  const endDate = new Date(last + "T00:00:00Z");
  while (cur <= endDate) {
    const dateStr = cur.toISOString().split("T")[0];
    days.push(dateStr);
    const params = new URLSearchParams();
    params.append("teacherScheduleQTO.beginDate", dateStr);
    params.append("teacherScheduleQTO.endDate", dateStr);
    params.append("teacherScheduleQTO.teacherId", TEACHER_ID);

    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
          body: params.toString(),
        });
        if (!res.ok) {
          console.error(`day ${dateStr}: HTTP ${res.status}`);
          break;
        }
        const data = await res.json();
        for (const raw of data) {
          const ev = parseEvent(raw);
          if (ev) events.push(ev);
        }
        ok = true;
        console.log(`day ${dateStr}: OK (${data.length} rows)`);
      } catch (err) {
        console.error(`day ${dateStr}: attempt ${attempt + 1} failed: ${err.message}`);
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    await new Promise((r) => setTimeout(r, 250));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  const fs = await import("node:fs");
  fs.mkdirSync("data", { recursive: true });
  const payload = {
    updatedAt: new Date().toISOString(),
    teacherId: TEACHER_ID,
    startDate: days[0],
    endDate: days[days.length - 1],
    days: days.length,
    events,
  };
  fs.writeFileSync("data/schedule.json", JSON.stringify(payload, null, 2));
  console.log(`wrote data/schedule.json with ${events.length} events`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
