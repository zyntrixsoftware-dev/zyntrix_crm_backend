/**
 * hrNotify.js — live email notifications for the Employee/HRMS system.
 * Sends via the shared Microsoft Graph mailer (utils/sendEmail.js).
 *   notifyHr   → emails every active HR / super_admin user
 *   notifyUser → emails a specific person (e.g. the employee)
 * All sends are best-effort and never throw into the request flow.
 */
const sendEmail = require("./sendEmail");
const User      = require("./../models/user");

const BRAND = process.env.COMPANY_NAME || "Zyntrix Software Solutions";

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function getHrEmails() {
  try {
    const hrs = await User.find({ role: { $in: ["hr", "super_admin"] }, active: true }).select("email").lean();
    return [...new Set(hrs.map(u => String(u.email || "").trim().toLowerCase()).filter(Boolean))];
  } catch (e) { console.warn("getHrEmails:", e.message); return []; }
}

// Resolve {name,email} for a user id (used when the caller only has an id).
async function userInfo(id) {
  try {
    const u = await User.findById(id).select("name email").lean();
    return u ? { name: u.name || "", email: u.email || "" } : { name: "", email: "" };
  } catch (e) { return { name: "", email: "" }; }
}

function wrap(heading, intro, rows) {
  const detail = (rows && rows.length)
    ? '<table style="width:100%;border-collapse:collapse;margin:16px 0">' +
        rows.map(r => `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:38%">${esc(r[0])}</td><td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600">${esc(r[1])}</td></tr>`).join("") +
      '</table>'
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Segoe UI,Arial,sans-serif">
  <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:linear-gradient(135deg,#0ea5a0,#2563eb);padding:20px 26px;color:#fff">
      <div style="font-size:18px;font-weight:800">Zyntrix</div>
      <div style="font-size:12px;opacity:.85">HR &amp; Employee System</div>
    </div>
    <div style="padding:24px 26px">
      <h2 style="margin:0 0 10px;font-size:17px;color:#111827">${esc(heading)}</h2>
      <p style="margin:0;color:#374151;font-size:14px;line-height:1.6">${intro}</p>
      ${detail}
    </div>
    <div style="padding:14px 26px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:11px">
      ${esc(BRAND)} · Automated HRMS notification
    </div>
  </div></body></html>`;
}

async function _send(to, subject, heading, intro, rows) {
  const list = (Array.isArray(to) ? to : [to]).map(e => String(e || "").trim()).filter(Boolean);
  const clean = [...new Set(list)];
  if (!clean.length) return;
  try { await sendEmail(clean.join(","), subject, String(intro).replace(/<[^>]+>/g, ""), { html: wrap(heading, intro, rows) }); }
  catch (e) { console.warn("hrNotify send:", e.message); }
}

async function notifyHr(subject, heading, intro, rows) {
  const to = await getHrEmails();
  return _send(to, subject, heading, intro, rows);
}
async function notifyUser(email, subject, heading, intro, rows) {
  return _send(email, subject, heading, intro, rows);
}

module.exports = { getHrEmails, userInfo, notifyHr, notifyUser };
