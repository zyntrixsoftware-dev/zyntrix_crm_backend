/**
 * reminderScheduler.js — sends punch-in / punch-out reminder emails based on
 * each employee's Settings → Notifications preferences. Runs in-process (pm2)
 * on a 60-second timer; no external cron dependency.
 *
 * Settings shape (user.settings.notifications):
 *   { punch: { email, app, sms }, punchBefore: "10", punchAfter: "10", ... }
 */
const sendEmail = require("./sendEmail");

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const PUNCH_IN_START  = 9 * 60 + 50;   // 09:50 IST — shift start (punch-in opens)
const PUNCH_OUT_CAP   = 17 * 60;       // 17:00 IST — shift end (punch-out)

function nowMinutesIST() {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}
function todayDateIST() {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return ist.toISOString().slice(0, 10);
}
function fmtHM(min) {
  const h = Math.floor(min / 60), m = min % 60;
  const ap = h >= 12 ? "PM" : "AM"; const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}

const _sent = new Set();   // dedup: `${userId}|${date}|${type}`
let _sentDate = "";

async function sendPunchReminder(user, type) {
  const isIn = type === "in";
  const subject = isIn ? "Reminder: punch in for your shift" : "Reminder: punch out for your shift";
  const heading = isIn ? "Time to punch in" : "Time to punch out";
  const when    = isIn ? fmtHM(PUNCH_IN_START) : fmtHM(PUNCH_OUT_CAP);
  const intro   = isIn
    ? `Hi ${esc(user.name || "")}, your shift starts at <b>${when} IST</b>. Don't forget to <b>punch in</b> on the Zyntrix employee portal.`
    : `Hi ${esc(user.name || "")}, your shift ends at <b>${when} IST</b>. Don't forget to <b>punch out</b> on the Zyntrix employee portal.`;
  const html = wrap(heading, intro);
  try { await sendEmail(user.email, subject, intro.replace(/<[^>]+>/g, ""), { html }); }
  catch (e) { console.warn("punch reminder send:", e.message); }
}

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function wrap(heading, intro) {
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Segoe UI,Arial,sans-serif">
  <div style="max-width:520px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:linear-gradient(135deg,#0ea5a0,#2563eb);padding:20px 26px;color:#fff"><div style="font-size:18px;font-weight:800">Zyntrix</div><div style="font-size:12px;opacity:.85">Attendance Reminder</div></div>
    <div style="padding:24px 26px"><h2 style="margin:0 0 10px;font-size:17px;color:#111827">${esc(heading)}</h2><p style="margin:0;color:#374151;font-size:14px;line-height:1.6">${intro}</p></div>
    <div style="padding:14px 26px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:11px">Automated reminder · manage this in Settings → Notifications</div>
  </div></body></html>`;
}

async function tick() {
  try {
    const User       = require("../models/user");
    const Attendance = require("../models/attendance");
    const min  = nowMinutesIST();
    const date = todayDateIST();
    if (date !== _sentDate) { _sent.clear(); _sentDate = date; }
    const dow = new Date(date + "T00:00:00").getDay();

    // Only fire near the relevant minutes to avoid querying every minute.
    const users = await User.find({ active: true, role: { $nin: ["student", "super_admin"] } })
      .select("name email settings weekOffDays").lean();

    for (const u of users) {
      if (!u.email) continue;
      const n = (u.settings && u.settings.notifications) || {};
      if (!(n.punch && n.punch.email)) continue;                       // email reminder off
      const weekOff = (Array.isArray(u.weekOffDays) && u.weekOffDays.length) ? u.weekOffDays : [0];
      if (weekOff.includes(dow)) continue;                             // their week-off → skip

      const before = parseInt(n.punchBefore || 0, 10);
      const after  = parseInt(n.punchAfter  || 0, 10);

      // Punch-in reminder
      if (before > 0) {
        const target = PUNCH_IN_START - before;
        const key = u._id + "|" + date + "|in";
        if (min >= target && min < target + 2 && !_sent.has(key)) {
          const rec = await Attendance.findOne({ userId: u._id, date }).select("punchIn");
          if (!rec || !rec.punchIn) { _sent.add(key); sendPunchReminder(u, "in"); }
        }
      }
      // Punch-out reminder
      if (after > 0) {
        const target = PUNCH_OUT_CAP - after;
        const key = u._id + "|" + date + "|out";
        if (min >= target && min < target + 2 && !_sent.has(key)) {
          const rec = await Attendance.findOne({ userId: u._id, date }).select("punchIn punchOut");
          if (rec && rec.punchIn && !rec.punchOut) { _sent.add(key); sendPunchReminder(u, "out"); }
        }
      }
    }
  } catch (e) { console.warn("reminderScheduler tick:", e.message); }
}

function start() {
  setInterval(tick, 60 * 1000);
  console.log("⏰ Punch-reminder scheduler started (60s tick).");
}

module.exports = { start };
