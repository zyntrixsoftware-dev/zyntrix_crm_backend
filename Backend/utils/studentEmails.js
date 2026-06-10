/**
 * studentEmails.js
 * Transactional emails to students (welcome, demo confirmation/reminder,
 * enrollment, certificate). Sends through the shared Microsoft Graph mailer
 * (utils/sendEmail.js) — the same path HR/admin email already uses — so these
 * no longer depend on the legacy Google Apps Script web app.
 */

const sendEmail = require("./sendEmail");

const BRAND  = process.env.COMPANY_NAME  || "Zyntrix Software Solutions";
const GSTIN  = process.env.COMPANY_GSTIN || "";
const TZ     = "Asia/Kolkata";

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function fmtDate(d) {
  return d ? d.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: TZ }) : "—";
}
function fmtTime(d) {
  return d ? d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: TZ }) : "—";
}

// Shared branded HTML wrapper.
function wrap(heading, intro, rows, cta) {
  const detail = (rows && rows.length)
    ? '<table style="width:100%;border-collapse:collapse;margin:18px 0">' +
        rows.map(r => `<tr><td style="padding:7px 0;color:#6b7280;font-size:13px;width:40%">${esc(r[0])}</td><td style="padding:7px 0;color:#111827;font-size:13px;font-weight:600">${esc(r[1])}</td></tr>`).join("") +
      '</table>'
    : "";
  const button = (cta && cta.url)
    ? `<a href="${esc(cta.url)}" style="display:inline-block;background:#00b894;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:8px;margin-top:6px">${esc(cta.text || "Open")}</a>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Segoe UI,Arial,sans-serif">
  <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:linear-gradient(135deg,#0ea5a0,#2563eb);padding:22px 28px;color:#fff">
      <div style="font-size:19px;font-weight:800;letter-spacing:.3px">Zyntrix</div>
      <div style="font-size:12px;opacity:.85">EdTech CRM</div>
    </div>
    <div style="padding:26px 28px">
      <h2 style="margin:0 0 10px;font-size:18px;color:#111827">${esc(heading)}</h2>
      <p style="margin:0;color:#374151;font-size:14px;line-height:1.6">${intro}</p>
      ${detail}
      ${button}
    </div>
    <div style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:11px;line-height:1.6">
      ${esc(BRAND)}${GSTIN ? ` &middot; GSTIN: ${esc(GSTIN)}` : ""}<br>
      This is an automated message from the Zyntrix CRM.
    </div>
  </div></body></html>`;
}

// ── Welcome (lead created) ─────────────────────────────────────────────────
async function notifyWelcome(lead) {
  if (!lead || !lead.email) return;
  const html = wrap(
    "Welcome to Zyntrix",
    `Hi ${esc(lead.fullName || "there")}, thanks for your interest in our programs. Our team will reach out to you shortly to help you get started.`,
    [["Name", lead.fullName || "—"], ["Phone", lead.phone || "—"]],
    null
  );
  return sendEmail(lead.email, "Welcome to Zyntrix", `Hi ${lead.fullName || ""}, thanks for your interest in Zyntrix. Our team will reach out shortly.`, { html });
}

// ── Demo confirmation ──────────────────────────────────────────────────────
async function notifyDemoConfirmation(demo, lead) {
  if (!lead || !lead.email) return;
  const at = demo.scheduledAt ? new Date(demo.scheduledAt) : null;
  const rows = [
    ["Course", (demo.course && demo.course.title) || "—"],
    ["Date", fmtDate(at)],
    ["Time", fmtTime(at)],
  ];
  if (demo.conductedBy) rows.push(["Conducted by", demo.conductedBy]);
  if (demo.venue)       rows.push(["Venue", demo.venue]);
  const cta = demo.meetingLink ? { text: "Join the demo", url: demo.meetingLink } : null;
  const html = wrap(
    "Your demo session is confirmed",
    `Hi ${esc(lead.fullName || "there")}, your demo session has been scheduled. Here are the details:`,
    rows, cta
  );
  return sendEmail(lead.email, "Your Zyntrix demo is confirmed", `Hi ${lead.fullName || ""}, your demo is confirmed for ${fmtDate(at)} ${fmtTime(at)}. ${demo.meetingLink || demo.venue || ""}`, { html });
}

// ── Demo reminder (sent manually or by scheduler) ──────────────────────────
async function notifyDemoReminder(demo, lead) {
  if (!lead || !lead.email) return;
  const at = demo.scheduledAt ? new Date(demo.scheduledAt) : null;
  const rows = [
    ["Course", (demo.course && demo.course.title) || "—"],
    ["Date", fmtDate(at)],
    ["Time", fmtTime(at)],
  ];
  if (demo.venue) rows.push(["Venue", demo.venue]);
  const cta = demo.meetingLink ? { text: "Join the demo", url: demo.meetingLink } : null;
  const html = wrap(
    "Reminder: your demo session is coming up",
    `Hi ${esc(lead.fullName || "there")}, this is a friendly reminder about your upcoming demo session with Zyntrix.`,
    rows, cta
  );
  return sendEmail(lead.email, "Reminder — Your Zyntrix demo session", `Hi ${lead.fullName || ""}, reminder for your demo on ${fmtDate(at)} at ${fmtTime(at)}. ${demo.meetingLink || demo.venue || ""}`, { html });
}

// ── Enrollment confirmation ────────────────────────────────────────────────
async function notifyEnrollmentConfirmation(enrollment, lead, course, batch) {
  if (!lead || !lead.email) return;
  const rows = [
    ["Course", (course && course.title) || "—"],
    ["Batch", (batch && batch.batchCode) || "—"],
    ["Starts", batch && batch.startDate ? fmtDate(new Date(batch.startDate)) : "—"],
    ["Total fee", "₹" + Number(enrollment.totalFee || 0).toLocaleString("en-IN")],
    ["Payment plan", enrollment.paymentPlan || "full"],
  ];
  if (batch && batch.schedule) rows.push(["Schedule", batch.schedule]);
  const cta = batch && batch.meetingLink ? { text: "Class link", url: batch.meetingLink } : null;
  const html = wrap(
    "You're enrolled — welcome aboard!",
    `Hi ${esc(lead.fullName || "there")}, your enrollment is confirmed. We're excited to have you. Here are your course details:`,
    rows, cta
  );
  return sendEmail(lead.email, "Your Zyntrix enrollment is confirmed", `Hi ${lead.fullName || ""}, your enrollment for ${(course && course.title) || ""} is confirmed.`, { html });
}

// ── Certificate / course completion ────────────────────────────────────────
async function notifyCertificate(enrollment, lead) {
  if (!lead || !lead.email) return;
  const completed = enrollment.completedAt ? new Date(enrollment.completedAt) : new Date();
  const cta = enrollment.certificateUrl ? { text: "Download certificate", url: enrollment.certificateUrl } : null;
  const html = wrap(
    "Congratulations on completing your course!",
    `Hi ${esc(lead.fullName || lead.name || "there")}, congratulations on completing ${esc((enrollment.course && enrollment.course.title) || "your course")} with Zyntrix.`,
    [["Course", (enrollment.course && enrollment.course.title) || "—"], ["Completed", fmtDate(completed)]],
    cta
  );
  return sendEmail(lead.email, "Your Zyntrix certificate", `Hi ${lead.fullName || lead.name || ""}, congratulations on completing your course. ${enrollment.certificateUrl || ""}`, { html });
}

// ── Payment link ───────────────────────────────────────────────────────────
async function notifyPaymentLink(lead, info) {
  if (!lead || !lead.email) return;
  const amt = "\u20b9" + Number(info.amount || 0).toLocaleString("en-IN");
  const html = wrap(
    "Complete your fee payment",
    `Hi ${esc(lead.fullName || lead.name || "there")}, please complete your course fee payment of <b>${amt}</b> using the secure link below.`,
    [["Course", info.courseTitle || "\u2014"], ["Amount due", amt]],
    { text: "Pay " + amt + " now", url: info.url }
  );
  return sendEmail(lead.email, "Pay your course fee \u2014 Zyntrix", `Hi ${lead.fullName || ""}, pay your course fee of ${amt} here: ${info.url}`, { html });
}

module.exports = {
  notifyPaymentLink,
  notifyWelcome,
  notifyDemoConfirmation,
  notifyDemoReminder,
  notifyEnrollmentConfirmation,
  notifyCertificate,
};
