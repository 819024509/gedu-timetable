const ENDPOINT = "http://fzielts.gedu.net.cn/fzielts/schedule_queryByTeacherClass.action";
const TEACHER_ID = process.env.TEACHER_ID || "510";
const DAYS = parseInt(process.env.DAYS || "16", 10);
const START_OFFSET = parseInt(process.env.START_OFFSET || "-1", 10);

// 以中国时区 (UTC+8) 计算日期，避免跨时区差一天
function cnDate(offsetDays) {
  const t = Date.now() + 8 * 3600 * 1000;
  const d = new Date(t + offsetDays * 86400 * 1000);
  return d.toISOString().split("T")[0];
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
  const events = [];
  const days = [];
  for (let i = 0; i < DAYS; i++) {
    const dateStr = cnDate(START_OFFSET + i);
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
  }

  const fs = await import("node:fs");
  fs.mkdirSync("data", { recursive: true });
  const payload = {
    updatedAt: new Date().toISOString(),
    teacherId: TEACHER_ID,
    startDate: days[0],
    endDate: days[days.length - 1],
    days: DAYS,
    events,
  };
  fs.writeFileSync("data/schedule.json", JSON.stringify(payload, null, 2));
  console.log(`wrote data/schedule.json with ${events.length} events`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
