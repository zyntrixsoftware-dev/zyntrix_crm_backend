/**
 * candidateEmails.js
 *
 * All candidate lifecycle emails are now sent DIRECTLY from the backend via
 * nodemailer SMTP (utils/sendEmail.js) using the branded templates in
 * utils/emailTemplates.js. Google Apps Script is NO LONGER used for email.
 *
 * Each notify* function keeps its original signature and returns
 *   { sent: boolean, reason?: string }
 * so the existing controllers (which gate on result.sent) work unchanged.
 */

const sendEmail = require("./sendEmail");
const T         = require("./emailTemplates");

// ── internal: send a built { subject, html } email to `to` ──────────────────
async function _send(to, built, opts = {}) {
  const email = String(to || "").trim();
  if (!email) return { sent: false, reason: "no recipient email" };
  try {
    const text =
      (built.subject || "Zyntrix HR notification") +
      "\n\nThis email contains HTML content - please view it in an HTML-capable mail client.";
    await sendEmail(email, built.subject, text, { html: built.html, ...opts });
    console.log(`[candidateEmails] sent "${built.subject}" -> ${email}`);
    return { sent: true, reason: "via_smtp" };
  } catch (err) {
    console.error(`[candidateEmails] send failed -> ${email}:`, err.message);
    return { sent: false, reason: err.message };
  }
}

function _fmtDate(d) {
  if (!d) return "";
  const parsed = new Date(d);
  return isNaN(parsed)
    ? ""
    : parsed.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

// 1. APPLICATION RECEIVED
async function notifyApplicationReceived(candidate) {
  return _send(candidate.email, T.applicationReceived({
    fullName: candidate.name       || "Candidate",
    position: candidate.appliedFor || "the role",
  }));
}

// 2. RESUME SHORTLISTED
async function notifyShortlisted(interview) {
  return _send(interview.candidateEmail, T.resumeShortlisted({
    fullName: interview.candidateName  || "Candidate",
    position: interview.appliedFor     || "the role",
    phone   : interview.candidatePhone || "",
    email   : interview.candidateEmail || "",
  }));
}

// 3a. ROUND QUALIFIED
async function notifyRoundQualified(interview, roundNumber) {
  return _send(interview.candidateEmail, T.roundQualified({
    fullName: interview.candidateName || "Candidate",
    position: interview.appliedFor    || "the role",
    roundNumber,
  }));
}

// 3b. ROUND NOT QUALIFIED
async function notifyRoundNotQualified(interview, roundNumber) {
  return _send(interview.candidateEmail, T.roundNotQualified({
    fullName: interview.candidateName || "Candidate",
    position: interview.appliedFor    || "the role",
    roundNumber,
  }));
}

// 4. MARKED FOR OFFER
async function notifyMarkedForOffer(interview) {
  return _send(interview.candidateEmail, T.markedForOffer({
    fullName: interview.candidateName || "Candidate",
    position: interview.appliedFor    || "the role",
  }));
}

// 5. OFFER LETTER (PDF attached)
async function notifyOfferLetter(payload) {
  const built = T.offerLetter({
    fullName         : payload.fullName || "Candidate",
    position         : payload.position || "the role",
    hasAttachment    : !!payload.offerPdfBase64,
    onboardingFormUrl: process.env.ONBOARDING_FORM_URL || "",
  });
  const opts = {};
  if (payload.offerPdfBase64) {
    opts.attachments = [{
      filename   : payload.offerPdfName || "Zyntrix_Offer_Letter.pdf",
      content    : Buffer.from(payload.offerPdfBase64, "base64"),
      contentType: "application/pdf",
    }];
  }
  return _send(payload.email, built, opts);
}

// 6. REJECTED
async function notifyRejected(candidate) {
  return _send(candidate.email, T.rejected({
    fullName: candidate.name       || "Candidate",
    position: candidate.appliedFor || "the role",
  }));
}

// 7. ONBOARDED - documents verified, ready to join
async function notifyOnboarded(ob) {
  return _send(ob.candidateEmail, T.onboarded({
    fullName   : ob.candidateName || "Candidate",
    position   : ob.position      || "the role",
    joiningDate: _fmtDate(ob.joiningDate),
  }));
}

// 8. ORIENTATION INVITE - session schedule
async function notifyOrientationInvite(orientation, sessions) {
  const sessionList = (sessions || []).map(function (s) {
    return {
      title        : s.title         || "Orientation Session",
      scheduledDate: s.scheduledDate || "",
      startTime    : s.startTime     || "",
      endTime      : s.endTime       || "",
      mode         : s.mode          || "in_person",
      venue        : s.venue         || "",
      facilitator  : s.facilitator   || "",
      isMandatory  : s.isMandatory !== false,
    };
  });
  return _send(orientation.candidateEmail, T.orientationInvite({
    fullName   : orientation.candidateName || "Candidate",
    position   : orientation.position      || "the role",
    joiningDate: _fmtDate(orientation.joiningDate),
    mentorName : orientation.mentorName    || "",
    mentorEmail: orientation.mentorEmail   || "",
    sessions   : sessionList,
  }));
}

// 9. DEPLOYED - assigned to a team
async function notifyDeployed(dep, team) {
  return _send(dep.candidateEmail, T.deployed({
    fullName        : dep.candidateName    || "Candidate",
    position        : dep.position         || "the role",
    teamName        : dep.teamName         || (team && team.name)           || "",
    department      : dep.department       || (team && team.department)     || "",
    roleInTeam      : dep.roleInTeam       || "",
    reportingManager: dep.reportingManager || (team && team.teamLead)       || "",
    workLocation    : dep.workLocation     || "office",
    officeLocation  : dep.officeLocation   || (team && team.officeLocation) || "",
    shift           : dep.shift            || "",
    domainEmail     : dep.domainEmail      || "",
    deployedDate    : _fmtDate(dep.deployedDate),
    joiningDate     : _fmtDate(dep.joiningDate),
  }));
}

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
  notifyDeployed,
};
