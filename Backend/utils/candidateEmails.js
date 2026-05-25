/**
 * candidateEmails.js
 *
 * Lifecycle email templates the HRMS sends to candidates as they move
 * through the funnel:
 *
 *   1. Application Received  -- when imported on Candidates page
 *   2. Shortlisted           -- when shortlisted into the Interview Panel
 *   3. Round Qualified       -- after each interview round passes
 *   4. Round Not Qualified   -- if a round fails
 *   5. Marked for Offer      -- when HR ticks "Offered" on the panel
 *      (informational; the actual signed PDF offer is sent separately)
 *   6. Rejected              -- when HR clicks Reject on candidates page
 *
 * All helpers are designed to be SAFE — they wrap sendEmail in try/catch so
 * a failed send never bubbles up and breaks the underlying HR action.
 * Use `await` when calling for single-candidate actions; fire-and-forget
 * is fine for bulk paths (controllers do this).
 */

const sendEmail = require("./sendEmail");

const COMPANY_NAME    = process.env.COMPANY_NAME    || "Zyntrix Software Solutions Pvt. Ltd.";
const COMPANY_HREMAIL = process.env.COMPANY_HR_EMAIL || "hr@zyntrixsoftware.com";

function signOff() {
  return [
    "",
    "Best regards,",
    "HR Team",
    COMPANY_NAME,
    COMPANY_HREMAIL
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// GAS EMAIL ROUTER — forwards payload to GAS web app which sends a
// professional HTML email via Gmail. Returns true if GAS accepted the call.
// Falls back to nodemailer (safeSend) if GAS is not configured or fails.
// ─────────────────────────────────────────────────────────────────────────────
async function callGasEmail(payload) {
  const gasUrl = process.env.GAS_WEBAPP_URL;
  if (!gasUrl) return false;
  try {
    const res = await fetch(gasUrl, {
      method  : "POST",
      headers : { "Content-Type": "application/json" },
      body    : JSON.stringify(payload),
      redirect: "follow",
    });
    const text = await res.text();
    console.log("[GAS email]", payload.action, "→", payload.email,
                "| HTTP", res.status, "|", text.slice(0, 100));
    return res.ok;
  } catch (err) {
    console.warn("[GAS email] failed →", payload.action, "|", err.message);
    return false;
  }
}

// Defensive send — never throws to the caller.
async function safeSend(to, subject, body, opts) {
  if (!to || typeof to !== "string" || !to.includes("@")) {
    console.warn("[candidateEmails] skipping send — invalid email:", to);
    return { sent: false, reason: "invalid_email" };
  }
  try {
    await sendEmail(to, subject, body, opts || {});
    console.log("[candidateEmails] sent ->", to, "|", subject);
    return { sent: true };
  } catch (err) {
    console.error("[candidateEmails] send FAILED ->", to, "|", subject, "|", err.message);
    return { sent: false, reason: err.message };
  }
}

// 1. APPLICATION RECEIVED ----------------------------------------------------
async function notifyApplicationReceived(candidate) {
  const role = candidate.appliedFor || "the position you applied for";
  const subject = `Application Received - ${role} | ${COMPANY_NAME}`;
  const body = [
    `Dear ${candidate.name || "Candidate"},`,
    "",
    `Thank you for applying to ${COMPANY_NAME} for the position of ${role}.`,
    "",
    "We have received your application and our Talent Acquisition team will review " +
    "your profile shortly. If your profile aligns with our requirements, we will " +
    "reach out within the next 5-7 working days to schedule the next steps.",
    "",
    `Should you have any questions in the meantime, simply reply to this email and ` +
    "our team will be glad to assist.",
    signOff()
  ].join("\n");
  return safeSend(candidate.email, subject, body);
}

// 2. RESUME SHORTLISTED -------------------------------------------------------
// Sent when HR clicks "Resume Shortlist" on the Candidates page.
// Wording: resume shortlisted → prepare for interview → best of luck.
async function notifyShortlisted(interview) {
  const role = interview.appliedFor || "your applied role";
  const subject = `Your Resume Has Been Shortlisted - ${role} | ${COMPANY_NAME}`;
  const body = [
    `Dear ${interview.candidateName || "Candidate"},`,
    "",
    `Congratulations! We are excited to inform you that your resume has been ` +
    `SHORTLISTED for the position of ${role} at ${COMPANY_NAME}.`,
    "",
    "You have successfully cleared the first stage of our selection process. " +
    "Our HR team will be in touch with you shortly to schedule your interview.",
    "",
    "In the meantime, we encourage you to:",
    "  • Review the role requirements carefully",
    `  • Research ${COMPANY_NAME} and our work`,
    "  • Brush up on your technical and domain skills",
    "",
    "Prepare well for the interview — Best of Luck! 🍀",
    "",
    "Please keep your phone reachable and check your email regularly.",
    signOff()
  ].join("\n");
  return safeSend(interview.candidateEmail, subject, body);
}

// 3a. ROUND QUALIFIED --------------------------------------------------------
async function notifyRoundQualified(interview, roundNumber) {
  // Try GAS first — sends a polished HTML email via Gmail
  const gasOk = await callGasEmail({
    action     : "sendRoundQualified",
    email      : interview.candidateEmail,
    fullName   : interview.candidateName  || "Candidate",
    position   : interview.appliedFor     || "the role",
    roundNumber: roundNumber,
  });
  if (gasOk) return { sent: true, reason: "via_gas" };

  // Fallback — plain text via nodemailer
  const role = interview.appliedFor || "your applied role";
  const isFinalRound = roundNumber >= 3;
  const subject = `Great News - You cleared Round ${roundNumber} | ${role}`;
  const nextLine = isFinalRound
    ? "You have successfully completed all 3 interview rounds. We will reach out " +
      "shortly with the final decision and next steps."
    : `Our team will reach out shortly to schedule Round ${roundNumber + 1}.`;
  const body = [
    `Dear ${interview.candidateName || "Candidate"},`,
    "",
    `Excellent work! We are pleased to inform you that you have CLEARED Round ${roundNumber} ` +
    `of your interview process for the position of ${role} at ${COMPANY_NAME}.`,
    "",
    nextLine,
    signOff()
  ].join("\n");
  return safeSend(interview.candidateEmail, subject, body);
}

// 3b. ROUND NOT QUALIFIED ----------------------------------------------------
async function notifyRoundNotQualified(interview, roundNumber) {
  // Try GAS first — sends a polished HTML email via Gmail
  const gasOk = await callGasEmail({
    action     : "sendRoundNotQualified",
    email      : interview.candidateEmail,
    fullName   : interview.candidateName  || "Candidate",
    position   : interview.appliedFor     || "the role",
    roundNumber: roundNumber,
  });
  if (gasOk) return { sent: true, reason: "via_gas" };

  // Fallback — plain text via nodemailer
  const role = interview.appliedFor || "your applied role";
  const subject = `Update on your Interview - ${role}`;
  const body = [
    `Dear ${interview.candidateName || "Candidate"},`,
    "",
    `Thank you for participating in Round ${roundNumber} of our interview process ` +
    `for the position of ${role} at ${COMPANY_NAME}.`,
    "",
    "After careful consideration, we have decided not to move forward with your " +
    "candidature at this time. We sincerely appreciate the time and effort you " +
    "invested in the interview process and wish you the very best for your career.",
    "",
    "We will keep your profile on file should suitable opportunities arise in the future.",
    signOff()
  ].join("\n");
  return safeSend(interview.candidateEmail, subject, body);
}

// 4. MARKED FOR OFFER --------------------------------------------------------
// Sent when HR ticks the "Offered" checkbox on the Interview Panel. The
// formal signed PDF offer arrives separately via the Offer Letters page.
async function notifyMarkedForOffer(interview) {
  // Try GAS first — sends a polished HTML email via Gmail
  const gasOk = await callGasEmail({
    action  : "sendOffered",
    email   : interview.candidateEmail,
    fullName: interview.candidateName || "Candidate",
    position: interview.appliedFor    || "the role",
  });
  if (gasOk) return { sent: true, reason: "via_gas" };

  // Fallback — plain text via nodemailer
  const role = interview.appliedFor || "your applied role";
  const subject = `Congratulations - Offer Coming Your Way | ${role}`;
  const body = [
    `Dear ${interview.candidateName || "Candidate"},`,
    "",
    `Congratulations! You have successfully cleared all 3 rounds of our interview ` +
    `process for the position of ${role} at ${COMPANY_NAME}.`,
    "",
    "Our HR team will share your formal offer letter (PDF) within the next 1-2 " +
    "working days. The offer will include detailed terms, compensation and joining " +
    "information.",
    "",
    "Welcome aboard — we cannot wait to have you on the team!",
    signOff()
  ].join("\n");
  return safeSend(interview.candidateEmail, subject, body);
}

// 5. REJECTED ----------------------------------------------------------------
async function notifyRejected(candidate) {
  const role = candidate.appliedFor || "the position you applied for";
  const subject = `Update on your Application - ${role}`;
  const body = [
    `Dear ${candidate.name || "Candidate"},`,
    "",
    `Thank you for your interest in joining ${COMPANY_NAME} and for taking the time ` +
    `to apply for the position of ${role}.`,
    "",
    "After careful review of your profile, we regret to inform you that we are unable " +
    "to move forward with your application at this time.",
    "",
    "We sincerely appreciate your interest in ${COMPANY_NAME} and will keep your " +
    "profile on file for future opportunities that align with your experience.",
    "",
    "We wish you all the very best for your career.",
    signOff()
  ].join("\n");
  return safeSend(candidate.email, subject, body);
}

module.exports = {
  notifyApplicationReceived,
  notifyShortlisted,
  notifyRoundQualified,
  notifyRoundNotQualified,
  notifyMarkedForOffer,
  notifyRejected
};
