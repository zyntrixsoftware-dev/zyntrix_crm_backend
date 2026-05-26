/**
 * candidateEmails.js
 *
 * Lifecycle emails sent to candidates as they progress through the HRMS:
 *
 *   1.  Application Received
 *   2.  Resume Shortlisted
 *   3a. Round Qualified
 *   3b. Round Not Qualified
 *   4.  Marked for Offer
 *   5.  Offer Letter (PDF attached)
 *   6.  Rejected
 *   7.  Onboarded (documents verified, ready to join)
 *   8.  Orientation Invite (session schedule)
 *
 * All emails are sent via nodemailer SMTP (Gmail: 500/day).
 * GAS / GmailApp is no longer used — it had a 100/day quota
 * that was routinely exhausted.
 *
 * Required env vars:
 *   EMAIL_USER        e.g. kolasanidinesh875@gmail.com
 *   EMAIL_PASS        Gmail App Password (16-char)
 *   EMAIL_FROM        (optional) defaults to EMAIL_USER
 *   EMAIL_SENDER_NAME (optional) defaults to company name
 *   EMAIL_HOST        smtp.gmail.com
 *   EMAIL_PORT        587
 */

const sendEmail = require("./sendEmail");
const T         = require("./emailTemplates");

const HR_EMAIL    = "hr@zyntrixsoftware.com";
const SENDER_NAME = process.env.EMAIL_SENDER_NAME || "Zyntrix Software Solution — HR";

// ── Wrapper: sends an HTML email and normalises the return value ─────────────
async function _send(to, subject, html, opts = {}) {
  try {
    await sendEmail(to, subject, "", { html, ...opts });
    return { sent: true, reason: "via_smtp" };
  } catch (err) {
    console.error(`[candidateEmails] send failed → ${to} | ${subject} | ${err.message}`);
    return { sent: false, reason: err.message };
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  1. APPLICATION RECEIVED
// ════════════════════════════════════════════════════════════════════════════
async function notifyApplicationReceived(candidate) {
  const { subject, html } = T.applicationReceived({
    fullName: candidate.name       || "Candidate",
    position: candidate.appliedFor || "the role",
  });
  return _send(candidate.email, subject, html);
}

// ════════════════════════════════════════════════════════════════════════════
//  2. RESUME SHORTLISTED
// ════════════════════════════════════════════════════════════════════════════
async function notifyShortlisted(interview) {
  const { subject, html } = T.resumeShortlisted({
    fullName: interview.candidateName  || "Candidate",
    position: interview.appliedFor     || "the role",
    phone   : interview.candidatePhone || "",
    email   : interview.candidateEmail,
  });
  return _send(interview.candidateEmail, subject, html);
}

// ════════════════════════════════════════════════════════════════════════════
//  3a. ROUND QUALIFIED
// ════════════════════════════════════════════════════════════════════════════
async function notifyRoundQualified(interview, roundNumber) {
  const { subject, html } = T.roundQualified({
    fullName   : interview.candidateName || "Candidate",
    position   : interview.appliedFor    || "the role",
    roundNumber: roundNumber,
  });
  return _send(interview.candidateEmail, subject, html);
}

// ════════════════════════════════════════════════════════════════════════════
//  3b. ROUND NOT QUALIFIED
// ════════════════════════════════════════════════════════════════════════════
async function notifyRoundNotQualified(interview, roundNumber) {
  const { subject, html } = T.roundNotQualified({
    fullName   : interview.candidateName || "Candidate",
    position   : interview.appliedFor    || "the role",
    roundNumber: roundNumber,
  });
  return _send(interview.candidateEmail, subject, html);
}

// ════════════════════════════════════════════════════════════════════════════
//  4. MARKED FOR OFFER
// ════════════════════════════════════════════════════════════════════════════
async function notifyMarkedForOffer(interview) {
  const { subject, html } = T.markedForOffer({
    fullName: interview.candidateName || "Candidate",
    position: interview.appliedFor    || "the role",
  });
  return _send(interview.candidateEmail, subject, html);
}

// ════════════════════════════════════════════════════════════════════════════
//  5. OFFER LETTER (PDF attached)
//  payload: { email, fullName, position, phone?, hrName?, offerPdfBase64, offerPdfName }
// ════════════════════════════════════════════════════════════════════════════
async function notifyOfferLetter(payload) {
  const { subject, html } = T.offerLetter({
    fullName        : payload.fullName || "Candidate",
    position        : payload.position || "the role",
    hasAttachment   : !!payload.offerPdfBase64,
    onboardingFormUrl: process.env.ONBOARDING_FORM_URL || "",
  });

  const opts = {};
  if (payload.offerPdfBase64 && payload.offerPdfName) {
    opts.attachments = [{
      filename   : payload.offerPdfName,
      content    : Buffer.from(payload.offerPdfBase64, "base64"),
      contentType: "application/pdf",
    }];
  }

  return _send(payload.email, subject, html, opts);
}

// ════════════════════════════════════════════════════════════════════════════
//  6. REJECTED
// ════════════════════════════════════════════════════════════════════════════
async function notifyRejected(candidate) {
  const { subject, html } = T.rejected({
    fullName: candidate.name       || "Candidate",
    position: candidate.appliedFor || "the role",
  });
  return _send(candidate.email, subject, html);
}

// ════════════════════════════════════════════════════════════════════════════
//  7. ONBOARDED — documents verified, ready to join
// ════════════════════════════════════════════════════════════════════════════
async function notifyOnboarded(ob) {
  const joiningDate = ob.joiningDate
    ? new Date(ob.joiningDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "";
  const { subject, html } = T.onboarded({
    fullName   : ob.candidateName || "Candidate",
    position   : ob.position      || "the role",
    joiningDate,
  });
  return _send(ob.candidateEmail, subject, html);
}

// ════════════════════════════════════════════════════════════════════════════
//  8. ORIENTATION INVITE — full session schedule
//  orientation: Orientation model doc
//  sessions: [OrientationSession docs]
// ════════════════════════════════════════════════════════════════════════════
async function notifyOrientationInvite(orientation, sessions) {
  const joiningDate = orientation.joiningDate
    ? new Date(orientation.joiningDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "";

  // Normalise session objects for the template
  const sessionList = (sessions || []).map(s => ({
    title        : s.title         || "Orientation Session",
    scheduledDate: s.scheduledDate || "",
    startTime    : s.startTime     || "",
    endTime      : s.endTime       || "",
    mode         : s.mode          || "in_person",
    venue        : s.venue         || "",
    facilitator  : s.facilitator   || "",
    isMandatory  : s.isMandatory !== false,
  }));

  const { subject, html } = T.orientationInvite({
    fullName    : orientation.candidateName  || "Candidate",
    position    : orientation.position       || "the role",
    joiningDate,
    mentorName  : orientation.mentorName     || "",
    mentorEmail : orientation.mentorEmail    || "",
    sessions    : sessionList,
  });

  return _send(orientation.candidateEmail, subject, html);
}

// ════════════════════════════════════════════════════════════════════════════
module.exports = {
  notifyApplicationReceived,
  notifyShortlisted,
  notifyRoundQualified,
  notifyRoundNotQualified,
  notifyMarkedForOffer,
  notifyOfferLetter,
  notifyRejected,
  notifyOnboarded,
  notifyOrientationInvite,
};
