/**
 * studentEmails.js
 * Calls the GAS Web App to send transactional emails to students.
 * Mirrors the pattern in candidateEmails.js.
 */

const GAS_URL = process.env.GAS_STUDENT_EMAIL_URL || process.env.GAS_URL || "";

async function callGasEmail(action, payload) {
  if (!GAS_URL) {
    console.warn("[studentEmails] GAS_STUDENT_EMAIL_URL not set — skipping email:", action);
    return { ok: false, error: "GAS URL not configured" };
  }
  try {
    const res  = await fetch(GAS_URL, {
      method:  "POST",
      headers: { "Content-Type": "text/plain" },   // avoid GAS 302 redirect
      body:    JSON.stringify({ action, ...payload })
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { ok: false, raw: text }; }
    if (json.ok === false) {
      console.warn("[studentEmails] GAS error:", action, json.error || json.raw);
    }
    return json;
  } catch (err) {
    console.error("[studentEmails] fetch failed:", action, err.message);
    return { ok: false, error: err.message };
  }
}

// ── Welcome (lead created) ─────────────────────────────────────────────────
async function notifyWelcome(lead) {
  if (!lead.email) return;
  return callGasEmail("sendStudentWelcome", {
    name:  lead.fullName,
    email: lead.email,
    phone: lead.phone || ""
  });
}

// ── Demo confirmation ─────────────────────────────────────────────────────
async function notifyDemoConfirmation(demo, lead) {
  if (!lead?.email) return;
  const scheduledAt = demo.scheduledAt ? new Date(demo.scheduledAt) : null;
  return callGasEmail("sendStudentDemoConfirmation", {
    name:        lead.fullName,
    email:       lead.email,
    courseTitle: demo.course?.title || "",
    demoDate:    scheduledAt ? scheduledAt.toDateString()           : "",
    demoTime:    scheduledAt ? scheduledAt.toTimeString().slice(0,5): "",
    meetingLink: demo.meetingLink || "",
    venue:       demo.venue       || "",
    conductedBy: demo.conductedBy || ""
  });
}

// ── Demo reminder (sent manually or by scheduler) ─────────────────────────
async function notifyDemoReminder(demo, lead) {
  if (!lead?.email) return;
  const scheduledAt = demo.scheduledAt ? new Date(demo.scheduledAt) : null;
  return callGasEmail("sendStudentDemoReminder", {
    name:        lead.fullName,
    email:       lead.email,
    courseTitle: demo.course?.title || "",
    demoDate:    scheduledAt ? scheduledAt.toDateString()            : "",
    demoTime:    scheduledAt ? scheduledAt.toTimeString().slice(0,5) : "",
    meetingLink: demo.meetingLink || "",
    venue:       demo.venue       || ""
  });
}

// ── Enrollment confirmation ───────────────────────────────────────────────
async function notifyEnrollmentConfirmation(enrollment, lead, course, batch) {
  if (!lead?.email) return;
  return callGasEmail("sendStudentEnrollmentConfirmation", {
    name:        lead.fullName,
    email:       lead.email,
    courseTitle: course?.title      || "",
    batchCode:   batch?.batchCode   || "",
    startDate:   batch?.startDate   ? new Date(batch.startDate).toDateString() : "",
    schedule:    batch?.schedule    || "",
    meetingLink: batch?.meetingLink || "",
    totalFee:    enrollment.totalFee   || 0,
    paymentPlan: enrollment.paymentPlan || "full",
    emiMonths:   enrollment.emiMonths  || 0
  });
}

// ── Certificate / course completion ─────────────────────────────────────
async function notifyCertificate(enrollment, lead) {
  if (!lead?.email) return;
  return callGasEmail("sendStudentCertificate", {
    name:           lead.fullName || lead.name || "",
    email:          lead.email,
    courseTitle:    enrollment.course?.title || "",
    completionDate: enrollment.completedAt
      ? new Date(enrollment.completedAt).toDateString() : new Date().toDateString(),
    certificateUrl: enrollment.certificateUrl || ""
  });
}

module.exports = {
  notifyWelcome,
  notifyDemoConfirmation,
  notifyDemoReminder,
  notifyEnrollmentConfirmation,
  notifyCertificate
};
