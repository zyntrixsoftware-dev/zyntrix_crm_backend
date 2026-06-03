// ============================================================
//  Google Apps Script — Zyntrix Software Solution
//  All candidate lifecycle emails sent via GAS GmailApp
//
//  HOW TO DEPLOY:
//    1. Open script.google.com → paste this entire file (replace all)
//    2. Run testEmailDiagnostic() from the editor to verify email works
//    3. Deploy > Manage Deployments > Edit > New version > Deploy
//       Execute as: Me  |  Who can access: Anyone
//    4. Copy the new /exec URL → set GAS_WEBAPP_URL in your backend (Render) env
//    5. Re-add triggers: onShortlistEdit (on edit), onFormSubmit (on form submit)
// ============================================================

// ── CONFIG ──────────────────────────────────────────────────
const SHEET_ID        = "11aTN-lg6PWMGlB5OzNCoWtGIuqcjbh0Ctffg7Z0d8vs";
const SHEET_NAME      = "Sheet1";
const RESUME_FOLDER   = "Zyntrix_Resumes";
const COMPANY_NAME    = "Zyntrix Software Solution Pvt Ltd";
const HR_EMAIL        = "hr@zyntrixsoftware.com";
const WEBSITE_URL     = "https://zyntrixsoftware.com";
const LINKEDIN_URL    = "https://www.linkedin.com/company/zyntrix-software-solutions-pvt-ltd";
const YOUTUBE_URL     = "https://www.youtube.com/@zyntrixsoftware";
const INSTAGRAM_URL   = "https://www.instagram.com/zyntrixsoftware";

// ── BRAND COLORS ────────────────────────────────────────────
const C_BLACK         = "#0A0A0A";
const C_LIME          = "#AAFF00";
const C_LIME_LIGHT    = "#F2FFD6";
const C_LIME_DARK     = "#7ACC00";
const C_WHITE         = "#FFFFFF";
const C_GRAY_DARK     = "#1A1A1A";
const C_GRAY_MID      = "#444444";
const C_GRAY_LIGHT    = "#888888";
const C_GRAY_BORDER   = "#E5E7EB";

// ── LOGO ────────────────────────────────────────────────────
const LOGO_URL = "https://drive.google.com/uc?export=view&id=1UegVZ6a_6DepJSzudlO16aTn7DdYaza0";

// ── ONBOARDING DOCUMENT FORM ────────────────────────────────
const ONBOARDING_FORM_URL = PropertiesService.getScriptProperties().getProperty("ONBOARDING_FORM_URL") || "";

// ── BACKEND WEBHOOK ─────────────────────────────────────────
const BACKEND_URL               = PropertiesService.getScriptProperties().getProperty("BACKEND_URL") || "";
const ONBOARDING_WEBHOOK_SECRET = PropertiesService.getScriptProperties().getProperty("ONBOARDING_WEBHOOK_SECRET") || "";

// ── COLUMN INDICES (0-based) ─────────────────────────────────
const COL = {
  TIMESTAMP          : 0,
  POSITION           : 1,
  FULL_NAME          : 2,
  EMAIL              : 3,
  PHONE              : 4,
  QUALIFICATIONS     : 5,
  EXPERIENCE         : 6,
  STATE_ADDRESS      : 7,
  EDTECH             : 8,
  AVAILABILITY       : 9,
  CV_LINK            : 10,
  SOURCE             : 11,
  DECLARATION        : 12,
  RESUME_SHORTLISTED : 13,
  INTERVIEW_STATUS   : 14,
  OFFERED            : 15,
  HR_NAME            : 16,
  EMAIL_SENT_FLAG    : 17,
};
const TOTAL_COLS = 18;

// ════════════════════════════════════════════════════════════
//  _safeSendEmail
//  Tries alias (hr@zyntrixsoftware.com) first, falls back to
//  script-owner's Gmail if alias is not configured.
// ════════════════════════════════════════════════════════════
function _safeSendEmail(to, subject, htmlBody, senderName) {
  var baseOpts = {
    htmlBody : htmlBody,
    replyTo  : HR_EMAIL,
    name     : senderName || (COMPANY_NAME + " - HR"),
  };
  try {
    var aliasOpts = Object.assign({}, baseOpts, { from: HR_EMAIL });
    GmailApp.sendEmail(to, subject, "", aliasOpts);
    console.log("_safeSendEmail: sent via alias -> " + to);
  } catch (aliasErr) {
    var errMsg = String(aliasErr).toLowerCase();
    var isAliasError = errMsg.indexOf("permission") !== -1 ||
                       errMsg.indexOf("alias")      !== -1 ||
                       errMsg.indexOf("invalid")    !== -1 ||
                       errMsg.indexOf("you do not") !== -1 ||
                       errMsg.indexOf("cannot send")!== -1;
    if (isAliasError) {
      console.warn("_safeSendEmail: alias blocked — falling back to owner email");
      GmailApp.sendEmail(to, subject, "", baseOpts);
      console.log("_safeSendEmail: sent via owner email -> " + to);
    } else {
      throw aliasErr;
    }
  }
}

// ════════════════════════════════════════════════════════════
//  DIAGNOSTIC — run from Apps Script editor to verify email
// ════════════════════════════════════════════════════════════
function testEmailDiagnostic() {
  Logger.log("=== GAS Email Diagnostic ===");
  Logger.log("HR alias target: " + HR_EMAIL);
  try {
    _safeSendEmail(
      HR_EMAIL,
      "[Zyntrix GAS Test] Email diagnostic — " + new Date().toLocaleString("en-IN"),
      '<div style="font-family:Arial,sans-serif;padding:20px;">' +
        '<h2 style="color:#0A0A0A;">GAS Email Test — PASSED</h2>' +
        '<p>If you see this email, Google Apps Script can send emails correctly.</p>' +
        '<p><strong>Time:</strong> ' + new Date().toLocaleString("en-IN") + '</p>' +
      '</div>',
      COMPANY_NAME + " - GAS Diagnostic"
    );
    Logger.log("SUCCESS — test email sent to " + HR_EMAIL);
  } catch (err) {
    Logger.log("FAILED — " + err);
  }
}

// ════════════════════════════════════════════════════════════
//  HEALTH CHECK  (GET)
// ════════════════════════════════════════════════════════════
function doGet() {
  return _jsonOut({ ok: true, service: COMPANY_NAME + " — Application API", status: "running" });
}

// ════════════════════════════════════════════════════════════
//  MAIN ENTRY POINT  (POST)
// ════════════════════════════════════════════════════════════
function doPost(e) {
  try {
    const data = _parseBody(e);
    if (data.action === "updateCandidate")          return _handleShortlist(data);
    if (data.action === "sendRoundQualified")       return _handleRoundQualified(data);
    if (data.action === "sendRoundNotQualified")    return _handleRoundNotQualified(data);
    if (data.action === "sendOffered")              return _handleOffered(data);
    if (data.action === "sendOfferLetter")          return _handleSendOfferLetter(data);
    if (data.action === "sendApplicationReceived")  return _handleSendApplicationReceived(data);
    if (data.action === "sendRejected")             return _handleSendRejected(data);
    if (data.action === "sendOnboarded")            return _handleSendOnboarded(data);
    if (data.action === "sendOrientationInvite")    return _handleSendOrientationInvite(data);
    if (data.action === "sendDeployed")             return _handleSendDeployed(data);
    return _handleApplication(data);
  } catch (err) {
    console.error("doPost error: " + err);
    return _jsonOut({ status: "error", ok: false, error: String(err) });
  }
}

// ════════════════════════════════════════════════════════════
//  HANDLER 1 — New job application (form submit)
// ════════════════════════════════════════════════════════════
function _handleApplication(data) {
  const email    = String(data.email    || "").trim().toLowerCase();
  const fullName = String(data.fullName || "").trim();
  const position = String(data.position || "").trim();
  if (!email)    return _jsonOut({ status: "error", error: "email is required" });
  if (!fullName) return _jsonOut({ status: "error", error: "fullName is required" });
  if (!position) return _jsonOut({ status: "error", error: "position is required" });
  let cvLink = String(data.cv || "").trim();
  if (!cvLink && data.resumeBase64 && data.resumeName) {
    cvLink = _uploadResume(data.resumeBase64, data.resumeName);
  }
  const sheet = _getSheet();
  const row = new Array(TOTAL_COLS).fill("");
  row[COL.TIMESTAMP]          = data.timestamp ? new Date(data.timestamp) : new Date();
  row[COL.POSITION]           = position;
  row[COL.FULL_NAME]          = fullName;
  row[COL.EMAIL]              = email;
  row[COL.PHONE]              = String(data.phone          || "").trim();
  row[COL.QUALIFICATIONS]     = String(data.qualifications || "").trim();
  row[COL.EXPERIENCE]         = String(data.experience     || "").trim();
  row[COL.STATE_ADDRESS]      = String(data.stateAddress   || "").trim();
  row[COL.EDTECH]             = String(data.edtech         || "").trim();
  row[COL.AVAILABILITY]       = String(data.availability   || "").trim();
  row[COL.CV_LINK]            = cvLink;
  row[COL.SOURCE]             = String(data.source         || "").trim();
  row[COL.DECLARATION]        = String(data.declaration    || "").trim();
  sheet.appendRow(row);
  // Force the phone cell to TEXT so a leading "+" (e.g. +91…) is stored
  // literally instead of being mis-read by Sheets as a formula (#ERROR!).
  var newRow = sheet.getLastRow();
  sheet.getRange(newRow, COL.PHONE + 1)
       .setNumberFormat("@")
       .setValue(String(data.phone || "").trim());
  SpreadsheetApp.flush();
  try {
    _sendApplicationConfirmation({ fullName, email, position });
  } catch (mailErr) {
    console.error("Confirmation email failed: " + mailErr);
  }
  return _jsonOut({ status: "success", ok: true });
}

// ════════════════════════════════════════════════════════════
//  HANDLER 2 — HRMS shortlist update
//  FIX: the shortlist email now ALWAYS sends when the HRMS triggers it.
//  The duplicate guard lives in the backend (shortlistEmailSentAt), so we
//  no longer skip on the EMAIL_SENT_FLAG here — that was suppressing the email.
// ════════════════════════════════════════════════════════════
function _handleShortlist(data) {
  const email = String(data.email || "").trim().toLowerCase();
  if (!email) return _jsonOut({ ok: false, error: "email is required" });
  const sheet  = _getSheet();
  const values = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let r = 1; r < values.length; r++) {
    const rowEmail = String(values[r][COL.EMAIL] || "").trim().toLowerCase();
    if (rowEmail === email) rowIndex = r;
  }
  if (rowIndex === -1) {
    const newRow = new Array(TOTAL_COLS).fill("");
    newRow[COL.TIMESTAMP]  = new Date();
    newRow[COL.POSITION]   = String(data.position || "").trim();
    newRow[COL.FULL_NAME]  = String(data.fullName || "").trim();
    newRow[COL.EMAIL]      = email;
    newRow[COL.PHONE]      = String(data.phone    || "").trim();
    sheet.appendRow(newRow);
    SpreadsheetApp.flush();
    rowIndex = sheet.getLastRow() - 1;
  }
  const sheetRow = rowIndex + 1;
  sheet.getRange(sheetRow, COL.RESUME_SHORTLISTED + 1).setValue(true);
  SpreadsheetApp.flush();
  const row = sheet.getRange(sheetRow, 1, 1, TOTAL_COLS).getValues()[0];
  const candidate = {
    fullName : String(row[COL.FULL_NAME] || data.fullName || "").trim(),
    email    : email,
    position : String(row[COL.POSITION]  || data.position || "").trim(),
    phone    : String(row[COL.PHONE]     || data.phone    || "").trim(),
  };
  let emailed = false;
  if (candidate.email) {
    try {
      _sendShortlistEmail(candidate);
      sheet.getRange(sheetRow, COL.EMAIL_SENT_FLAG + 1)
           .setValue("Sent - " + new Date().toLocaleString("en-IN"));
      SpreadsheetApp.flush();
      emailed = true;
    } catch (mailErr) {
      console.error("Shortlist email failed: " + mailErr);
      return _jsonOut({ ok: false, error: "Shortlist email failed: " + String(mailErr), row: sheetRow });
    }
  }
  return _jsonOut({ ok: true, row: sheetRow, emailed: emailed });
}

// ════════════════════════════════════════════════════════════
//  HANDLER 3 — Round Qualified
// ════════════════════════════════════════════════════════════
function _handleRoundQualified(data) {
  const email = String(data.email || "").trim().toLowerCase();
  if (!email) return _jsonOut({ ok: false, error: "email required" });
  try {
    _sendRoundQualifiedEmail({
      email,
      fullName   : String(data.fullName    || "Candidate").trim(),
      position   : String(data.position    || "the role").trim(),
      roundNumber: Number(data.roundNumber || 1)
    });
    return _jsonOut({ ok: true });
  } catch (err) {
    console.error("_handleRoundQualified error: " + err);
    return _jsonOut({ ok: false, error: String(err) });
  }
}

// ════════════════════════════════════════════════════════════
//  HANDLER 4 — Round Not Qualified
// ════════════════════════════════════════════════════════════
function _handleRoundNotQualified(data) {
  const email = String(data.email || "").trim().toLowerCase();
  if (!email) return _jsonOut({ ok: false, error: "email required" });
  try {
    _sendRoundNotQualifiedEmail({
      email,
      fullName   : String(data.fullName    || "Candidate").trim(),
      position   : String(data.position    || "the role").trim(),
      roundNumber: Number(data.roundNumber || 1)
    });
    return _jsonOut({ ok: true });
  } catch (err) {
    console.error("_handleRoundNotQualified error: " + err);
    return _jsonOut({ ok: false, error: String(err) });
  }
}

// ════════════════════════════════════════════════════════════
//  HANDLER 5 — Offered
// ════════════════════════════════════════════════════════════
function _handleOffered(data) {
  const email = String(data.email || "").trim().toLowerCase();
  if (!email) return _jsonOut({ ok: false, error: "email required" });
  try {
    _sendOfferedEmail({
      email,
      fullName : String(data.fullName || "Candidate").trim(),
      position : String(data.position || "the role").trim()
    });
    return _jsonOut({ ok: true });
  } catch (err) {
    console.error("_handleOffered error: " + err);
    return _jsonOut({ ok: false, error: String(err) });
  }
}

// ════════════════════════════════════════════════════════════
//  HANDLER 6 — Send Offer Letter (records OFFERED in Sheet + emails PDF)
// ════════════════════════════════════════════════════════════
function _handleSendOfferLetter(data) {
  const email = String(data.email || "").trim().toLowerCase();
  if (!email) return _jsonOut({ ok: false, error: "email is required" });
  const sheet  = _getSheet();
  const values = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][COL.EMAIL] || "").trim().toLowerCase() === email) rowIndex = r;
  }
  if (rowIndex === -1) {
    const newRow = new Array(TOTAL_COLS).fill("");
    newRow[COL.TIMESTAMP] = new Date();
    newRow[COL.POSITION]  = String(data.position || "").trim();
    newRow[COL.FULL_NAME] = String(data.fullName || "").trim();
    newRow[COL.EMAIL]     = email;
    newRow[COL.PHONE]     = String(data.phone    || "").trim();
    sheet.appendRow(newRow);
    SpreadsheetApp.flush();
    rowIndex = sheet.getLastRow() - 1;
  }
  const sheetRow = rowIndex + 1;
  sheet.getRange(sheetRow, COL.OFFERED + 1).setValue(true);
  if (data.hrName) sheet.getRange(sheetRow, COL.HR_NAME + 1).setValue(String(data.hrName).trim());
  SpreadsheetApp.flush();
  const row = sheet.getRange(sheetRow, 1, 1, TOTAL_COLS).getValues()[0];
  const candidate = {
    fullName : String(row[COL.FULL_NAME] || data.fullName || "").trim(),
    email    : email,
    position : String(row[COL.POSITION]  || data.position || "").trim(),
    phone    : String(row[COL.PHONE]     || data.phone    || "").trim(),
  };
  let attachment = null;
  if (data.offerPdfBase64) {
    try {
      const bytes = Utilities.base64Decode(data.offerPdfBase64);
      const name  = String(data.offerPdfName || ("Zyntrix_Offer_Letter_" + candidate.fullName + ".pdf"));
      attachment  = Utilities.newBlob(bytes, "application/pdf", name);
    } catch (decErr) {
      console.error("Offer PDF decode failed: " + decErr);
    }
  }
  let emailed = false;
  if (candidate.email) {
    try {
      _sendOfferLetterEmail(candidate, attachment);
      emailed = true;
    } catch (mailErr) {
      console.error("Offer letter email failed: " + mailErr);
      return _jsonOut({ ok: false, error: "Offer email failed: " + String(mailErr), row: sheetRow, offered: true });
    }
  }
  return _jsonOut({ ok: true, row: sheetRow, offered: true, emailed: emailed });
}

// ════════════════════════════════════════════════════════════
//  HANDLER 7 — Application Received
// ════════════════════════════════════════════════════════════
function _handleSendApplicationReceived(data) {
  const email = String(data.email || "").trim().toLowerCase();
  if (!email) return _jsonOut({ ok: false, error: "email required" });
  try {
    _sendApplicationConfirmation({
      email   : email,
      fullName: String(data.fullName || "Candidate").trim(),
      position: String(data.position || "the role").trim(),
    });
    return _jsonOut({ ok: true });
  } catch (err) {
    console.error("_handleSendApplicationReceived error: " + err);
    return _jsonOut({ ok: false, error: String(err) });
  }
}

// ════════════════════════════════════════════════════════════
//  HANDLER 8 — Rejected
// ════════════════════════════════════════════════════════════
function _handleSendRejected(data) {
  const email = String(data.email || "").trim().toLowerCase();
  if (!email) return _jsonOut({ ok: false, error: "email required" });
  try {
    _sendRejectedEmail({
      email   : email,
      fullName: String(data.fullName || "Candidate").trim(),
      position: String(data.position || "the role").trim(),
    });
    return _jsonOut({ ok: true });
  } catch (err) {
    console.error("_handleSendRejected error: " + err);
    return _jsonOut({ ok: false, error: String(err) });
  }
}

// ════════════════════════════════════════════════════════════
//  HANDLER 9 — Onboarding Complete
// ════════════════════════════════════════════════════════════
function _handleSendOnboarded(data) {
  const email = String(data.email || "").trim().toLowerCase();
  if (!email) return _jsonOut({ ok: false, error: "email required" });
  try {
    _sendOnboardedEmail({
      email      : email,
      fullName   : String(data.fullName    || "Candidate").trim(),
      position   : String(data.position    || "the role").trim(),
      joiningDate: String(data.joiningDate || "").trim(),
    });
    return _jsonOut({ ok: true });
  } catch (err) {
    console.error("_handleSendOnboarded error: " + err);
    return _jsonOut({ ok: false, error: String(err) });
  }
}

// ════════════════════════════════════════════════════════════
//  HANDLER 10 — Orientation Invite
// ════════════════════════════════════════════════════════════
function _handleSendOrientationInvite(data) {
  var email = String(data.email || "").trim().toLowerCase();
  if (!email) return _jsonOut({ ok: false, error: "email required" });
  try {
    _sendOrientationInviteEmail({
      email      : email,
      fullName   : String(data.fullName    || "Candidate").trim(),
      position   : String(data.position    || "the role").trim(),
      joiningDate: String(data.joiningDate || "").trim(),
      mentorName : String(data.mentorName  || "").trim(),
      mentorEmail: String(data.mentorEmail || "").trim(),
      sessions   : Array.isArray(data.sessions) ? data.sessions : [],
    });
    return _jsonOut({ ok: true });
  } catch (err) {
    console.error("_handleSendOrientationInvite error: " + err);
    return _jsonOut({ ok: false, error: String(err) });
  }
}

// ════════════════════════════════════════════════════════════
//  HANDLER 11 — Deployed to Team
// ════════════════════════════════════════════════════════════
function _handleSendDeployed(data) {
  var email = String(data.email || "").trim().toLowerCase();
  if (!email) return _jsonOut({ ok: false, error: "email required" });
  try {
    _sendDeployedEmail({
      email           : email,
      fullName        : String(data.fullName         || "Candidate").trim(),
      position        : String(data.position         || "the role").trim(),
      teamName        : String(data.teamName         || "").trim(),
      department      : String(data.department       || "").trim(),
      roleInTeam      : String(data.roleInTeam       || "").trim(),
      reportingManager: String(data.reportingManager || "").trim(),
      workLocation    : String(data.workLocation     || "office").trim(),
      officeLocation  : String(data.officeLocation   || "").trim(),
      shift           : String(data.shift            || "").trim(),
      domainEmail     : String(data.domainEmail      || "").trim(),
      deployedDate    : String(data.deployedDate     || "").trim(),
      joiningDate     : String(data.joiningDate      || "").trim(),
      teamLeadEmail   : String(data.teamLeadEmail    || "").trim(),
    });
    return _jsonOut({ ok: true });
  } catch (err) {
    console.error("_handleSendDeployed error: " + err);
    return _jsonOut({ ok: false, error: String(err) });
  }
}

// ════════════════════════════════════════════════════════════
//  EMAIL HEADER
// ════════════════════════════════════════════════════════════
function _emailHeader(tagline) {
  return (
    '<div style="background:' + C_BLACK + ';padding:28px 32px;text-align:center;">' +
      '<img src="' + LOGO_URL + '" alt="' + COMPANY_NAME + ' Logo" width="100" height="100" ' +
           'style="display:block;margin:0 auto 14px;border-radius:6px;" />' +
      '<p style="color:' + C_LIME + ';margin:0;font-size:18px;font-weight:bold;letter-spacing:0.5px;">' + COMPANY_NAME + '</p>' +
      '<p style="color:' + C_GRAY_LIGHT + ';margin:5px 0 0;font-size:11px;letter-spacing:2px;text-transform:uppercase;">' + tagline + '</p>' +
    '</div>'
  );
}

// ════════════════════════════════════════════════════════════
//  EMAIL FOOTER
// ════════════════════════════════════════════════════════════
function _emailFooter() {
  return (
    '<div style="background:' + C_BLACK + ';padding:24px 32px;text-align:center;">' +
      '<p style="color:' + C_LIME + ';font-size:14px;font-weight:bold;margin:0 0 2px;">' + COMPANY_NAME + '</p>' +
      '<p style="color:' + C_GRAY_LIGHT + ';font-size:11px;margin:0 0 4px;">GST No: 37AACCZ9867D1ZR</p>' +
      '<a href="' + WEBSITE_URL + '" style="color:' + C_GRAY_LIGHT + ';font-size:12px;text-decoration:none;">' + WEBSITE_URL + '</a>' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px auto 10px;border-collapse:collapse;"><tr>' +
        '<td style="padding:0 5px;"><a href="' + LINKEDIN_URL + '" style="text-decoration:none;"><span style="display:inline-block;background:#0A66C2;color:#fff;border-radius:6px;padding:5px 12px;font-size:11px;font-weight:bold;">LinkedIn</span></a></td>' +
        '<td style="padding:0 5px;"><a href="' + YOUTUBE_URL + '" style="text-decoration:none;"><span style="display:inline-block;background:#FF0000;color:#fff;border-radius:6px;padding:5px 12px;font-size:11px;font-weight:bold;">YouTube</span></a></td>' +
        '<td style="padding:0 5px;"><a href="' + INSTAGRAM_URL + '" style="text-decoration:none;"><span style="display:inline-block;background:#C13584;color:#fff;border-radius:6px;padding:5px 12px;font-size:11px;font-weight:bold;">Instagram</span></a></td>' +
      '</tr></table>' +
      '<p style="color:' + C_GRAY_LIGHT + ';font-size:11px;margin:8px 0 0;">Questions? <a href="mailto:' + HR_EMAIL + '" style="color:' + C_LIME + ';">' + HR_EMAIL + '</a></p>' +
      '<p style="color:#4B5563;font-size:11px;margin:4px 0 0;">This is an automated message from the HR system.</p>' +
    '</div>'
  );
}

// ════════════════════════════════════════════════════════════
//  EMAIL 1 — Application Received
// ════════════════════════════════════════════════════════════
function _sendApplicationConfirmation(c) {
  const subject = "Application Received - " + c.position + " | " + COMPANY_NAME;
  const body =
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid ' + C_GRAY_BORDER + ';border-radius:12px;overflow:hidden;">' +
      _emailHeader("Talent Acquisition Team") +
      '<div style="background:' + C_LIME + ';padding:12px 32px;text-align:center;">' +
        '<span style="color:' + C_BLACK + ';font-size:14px;font-weight:bold;letter-spacing:0.5px;">APPLICATION RECEIVED</span>' +
      '</div>' +
      '<div style="padding:28px 32px;background:' + C_WHITE + ';">' +
        '<p style="font-size:17px;color:' + C_GRAY_DARK + ';margin:0 0 12px;">Dear <strong>' + c.fullName + '</strong>,</p>' +
        '<p style="font-size:14px;color:' + C_GRAY_MID + ';line-height:1.75;margin:0 0 20px;">Thank you for applying to <strong>' + COMPANY_NAME + '</strong> for the position of <strong>' + c.position + '</strong>. We have received your application and our Talent Acquisition team will review your profile promptly.</p>' +
        '<div style="background:' + C_LIME_LIGHT + ';border-left:4px solid ' + C_LIME + ';border-radius:6px;padding:16px 18px;margin-bottom:20px;">' +
          '<p style="margin:0;font-size:14px;color:' + C_GRAY_DARK + ';line-height:1.7;"><strong>What happens next?</strong><br>If your profile aligns with our requirements, our HR team will reach out to schedule the next steps. Please keep your phone reachable and monitor your inbox.</p>' +
        '</div>' +
        '<p style="font-size:13px;color:' + C_GRAY_LIGHT + ';">For any queries, write to us at <a href="mailto:' + HR_EMAIL + '" style="color:' + C_GRAY_DARK + ';font-weight:600;">' + HR_EMAIL + '</a></p>' +
        '<p style="margin-top:24px;font-size:14px;color:' + C_GRAY_MID + ';">Regards,<br><strong>' + COMPANY_NAME + ' — HR Team</strong></p>' +
      '</div>' +
      _emailFooter() +
    '</div>';
  _safeSendEmail(c.email, subject, body, COMPANY_NAME + " - Talent Acquisition");
}

// ════════════════════════════════════════════════════════════
//  EMAIL 2 — Resume Shortlisted
// ════════════════════════════════════════════════════════════
function _sendShortlistEmail(c) {
  const subject = "Your Resume Has Been Shortlisted - " + c.position + " | " + COMPANY_NAME;
  const body =
    '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid ' + C_GRAY_BORDER + ';border-radius:12px;overflow:hidden;">' +
      _emailHeader("Talent Acquisition Team") +
      '<div style="background:' + C_LIME + ';padding:14px 32px;text-align:center;">' +
        '<span style="color:' + C_BLACK + ';font-size:14px;font-weight:bold;letter-spacing:0.5px;">RESUME SHORTLISTED - INTERVIEW CALL COMING SOON</span>' +
      '</div>' +
      '<div style="padding:32px;background:' + C_WHITE + ';">' +
        '<p style="font-size:18px;color:' + C_GRAY_DARK + ';margin:0 0 8px;">Dear <strong>' + c.fullName + '</strong>,</p>' +
        '<p style="font-size:14px;color:' + C_GRAY_MID + ';line-height:1.75;margin:0 0 20px;">Congratulations! Your resume has been <strong>shortlisted</strong> for the <strong>' + c.position + '</strong> role at <strong>' + COMPANY_NAME + '</strong>.</p>' +
        '<div style="background:' + C_LIME_LIGHT + ';border-left:4px solid ' + C_LIME + ';border-radius:6px;padding:18px;margin-bottom:22px;">' +
          '<p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:' + C_GRAY_DARK + ';">What Happens Next</p>' +
          '<p style="margin:0;font-size:14px;color:' + C_GRAY_MID + ';line-height:1.7;">Our HR team will contact you shortly to schedule your interview. Keep your phone reachable and check your inbox regularly.</p>' +
        '</div>' +
        _journeyStep(true,  "1", "Application Received",  "Your profile was submitted successfully.") +
        _journeyStepActive(  "2", "Resume Shortlisted",    "Your resume has been approved by our recruiter.") +
        _journeyStep(false, "3", "HR Screening Call",     "Our HR will reach out to schedule your interview.") +
        _journeyStep(false, "4", "Interview Rounds",      "Technical and managerial rounds - online or in person.") +
        _journeyStep(false, "5", "Offer and Onboarding",  "Selected candidates receive a formal offer letter.") +
        '<div style="background:#F9F9F9;border:1px solid ' + C_GRAY_BORDER + ';border-radius:8px;padding:16px;margin:20px 0;">' +
          '<p style="margin:0 0 10px;font-weight:bold;font-size:13px;color:' + C_GRAY_DARK + ';">Application Summary</p>' +
          '<table style="width:100%;font-size:13px;border-collapse:collapse;">' +
            '<tr style="border-bottom:1px solid #F0F0F0;"><td style="padding:7px 0;color:' + C_GRAY_LIGHT + ';width:100px;">Name</td><td style="padding:7px 0;color:' + C_GRAY_DARK + ';font-weight:600;">' + c.fullName + '</td></tr>' +
            '<tr style="border-bottom:1px solid #F0F0F0;"><td style="padding:7px 0;color:' + C_GRAY_LIGHT + ';">Position</td><td style="padding:7px 0;color:' + C_GRAY_DARK + ';font-weight:600;">' + c.position + '</td></tr>' +
            '<tr style="border-bottom:1px solid #F0F0F0;"><td style="padding:7px 0;color:' + C_GRAY_LIGHT + ';">Phone</td><td style="padding:7px 0;color:' + C_GRAY_DARK + ';">' + (c.phone || "Not provided") + '</td></tr>' +
            '<tr><td style="padding:7px 0;color:' + C_GRAY_LIGHT + ';">Email</td><td style="padding:7px 0;color:' + C_GRAY_DARK + ';">' + c.email + '</td></tr>' +
          '</table>' +
        '</div>' +
        '<p style="font-size:13px;color:' + C_GRAY_LIGHT + ';">Queries: <a href="mailto:' + HR_EMAIL + '" style="color:' + C_GRAY_DARK + ';font-weight:600;">' + HR_EMAIL + '</a></p>' +
        '<p style="margin-top:22px;font-size:14px;color:' + C_GRAY_MID + ';">Regards,<br><strong>' + COMPANY_NAME + ' — HR and Talent Acquisition Team</strong></p>' +
      '</div>' +
      _emailFooter() +
    '</div>';
  _safeSendEmail(c.email, subject, body, COMPANY_NAME + " - Talent Acquisition");
}

// ════════════════════════════════════════════════════════════
//  EMAIL 3 — Round Qualified
// ════════════════════════════════════════════════════════════
function _sendRoundQualifiedEmail(c) {
  const isFinal   = c.roundNumber >= 3;
  const nextRound = c.roundNumber + 1;
  const subject = isFinal
    ? "All 3 Rounds Cleared! - " + c.position + " | " + COMPANY_NAME
    : "Round " + c.roundNumber + " Cleared - " + c.position + " | " + COMPANY_NAME;
  const badgeText = isFinal
    ? "ALL 3 ROUNDS CLEARED - FINAL DECISION COMING"
    : "ROUND " + c.roundNumber + " CLEARED - WELL DONE!";
  function roundStep(num) {
    const done = num <= c.roundNumber;
    const next = !isFinal && num === nextRound;
    const bg   = done ? C_LIME : next ? C_GRAY_DARK : "#E5E7EB";
    const txt  = done ? C_BLACK : next ? C_WHITE : C_GRAY_LIGHT;
    const icon = done ? "V" : String(num);
    const sub  = done ? "Cleared" : next ? "Up next — stay prepared" : "Pending";
    const subCol = done ? C_LIME_DARK : next ? C_GRAY_MID : C_GRAY_LIGHT;
    return (
      '<div style="display:flex;align-items:center;margin-bottom:12px;">' +
        '<div style="min-width:36px;height:36px;background:' + bg + ';color:' + txt + ';border-radius:50%;text-align:center;line-height:36px;font-size:13px;font-weight:bold;margin-right:14px;flex-shrink:0;">' + icon + '</div>' +
        '<div><p style="margin:0;font-size:13px;font-weight:600;color:' + C_GRAY_DARK + ';">Round ' + num + ' Interview</p><p style="margin:2px 0 0;font-size:12px;color:' + subCol + ';">' + sub + '</p></div>' +
      '</div>'
    );
  }
  const nextBlock = isFinal
    ? '<div style="background:' + C_LIME_LIGHT + ';border-left:4px solid ' + C_LIME + ';border-radius:6px;padding:16px 18px;margin:20px 0;"><p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:' + C_GRAY_DARK + ';">What Happens Next</p><p style="margin:0;font-size:14px;color:' + C_GRAY_MID + ';line-height:1.7;">You have successfully cleared <strong>all 3 rounds</strong>. Our HR team will reach out with the final decision shortly.</p></div>'
    : '<div style="background:' + C_LIME_LIGHT + ';border-left:4px solid ' + C_LIME + ';border-radius:6px;padding:16px 18px;margin:20px 0;"><p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:' + C_GRAY_DARK + ';">What Happens Next</p><p style="margin:0;font-size:14px;color:' + C_GRAY_MID + ';line-height:1.7;">Our HR team will contact you to schedule <strong>Round ' + nextRound + '</strong>. Best of Luck!</p></div>';
  const body =
    '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid ' + C_GRAY_BORDER + ';border-radius:12px;overflow:hidden;">' +
      _emailHeader("Interview Panel") +
      '<div style="background:' + C_LIME + ';padding:13px 32px;text-align:center;"><span style="color:' + C_BLACK + ';font-size:13px;font-weight:bold;letter-spacing:0.5px;">' + badgeText + '</span></div>' +
      '<div style="padding:32px;background:' + C_WHITE + ';">' +
        '<p style="font-size:18px;color:' + C_GRAY_DARK + ';margin:0 0 10px;">Dear <strong>' + c.fullName + '</strong>,</p>' +
        '<p style="font-size:14px;color:' + C_GRAY_MID + ';line-height:1.75;margin:0 0 20px;">Excellent work! You have <strong>successfully cleared Round ' + c.roundNumber + '</strong> for the <strong>' + c.position + '</strong> role at <strong>' + COMPANY_NAME + '</strong>.</p>' +
        nextBlock +
        '<p style="font-weight:bold;font-size:14px;color:' + C_GRAY_DARK + ';margin:24px 0 12px;">Your Interview Progress</p>' +
        roundStep(1) + roundStep(2) + roundStep(3) +
        '<p style="font-size:13px;color:' + C_GRAY_LIGHT + ';">Questions? <a href="mailto:' + HR_EMAIL + '" style="color:' + C_GRAY_DARK + ';">' + HR_EMAIL + '</a></p>' +
        '<p style="margin-top:20px;font-size:14px;color:' + C_GRAY_MID + ';">Regards,<br><strong>' + COMPANY_NAME + ' — HR and Talent Acquisition Team</strong></p>' +
      '</div>' +
      _emailFooter() +
    '</div>';
  _safeSendEmail(c.email, subject, body, COMPANY_NAME + " - Talent Acquisition");
}

// ════════════════════════════════════════════════════════════
//  EMAIL 4 — Round Not Qualified
// ════════════════════════════════════════════════════════════
function _sendRoundNotQualifiedEmail(c) {
  const subject = "Update on Your Interview - " + c.position + " | " + COMPANY_NAME;
  const body =
    '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid ' + C_GRAY_BORDER + ';border-radius:12px;overflow:hidden;">' +
      _emailHeader("Interview Panel") +
      '<div style="background:' + C_GRAY_DARK + ';padding:13px 32px;text-align:center;"><span style="color:' + C_WHITE + ';font-size:13px;font-weight:bold;letter-spacing:0.5px;">INTERVIEW UPDATE - ROUND ' + c.roundNumber + '</span></div>' +
      '<div style="padding:32px;background:' + C_WHITE + ';">' +
        '<p style="font-size:18px;color:' + C_GRAY_DARK + ';margin:0 0 10px;">Dear <strong>' + c.fullName + '</strong>,</p>' +
        '<p style="font-size:14px;color:' + C_GRAY_MID + ';line-height:1.75;margin:0 0 20px;">Thank you for participating in <strong>Round ' + c.roundNumber + '</strong> for the <strong>' + c.position + '</strong> role at <strong>' + COMPANY_NAME + '</strong>.</p>' +
        '<div style="background:#F9F9F9;border-left:4px solid ' + C_GRAY_LIGHT + ';border-radius:6px;padding:18px;margin-bottom:24px;"><p style="margin:0;font-size:14px;color:' + C_GRAY_MID + ';line-height:1.8;">After thorough evaluation, we regret to inform you that we have decided to <strong>move forward with other candidates</strong> for this role.</p></div>' +
        '<div style="background:' + C_LIME_LIGHT + ';border-left:4px solid ' + C_LIME + ';border-radius:6px;padding:16px;margin-bottom:24px;"><p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:' + C_GRAY_DARK + ';">Your Profile Stays With Us</p><p style="margin:0;font-size:13px;color:' + C_GRAY_MID + ';line-height:1.7;">We will keep your profile on file for suitable opportunities in the future.</p></div>' +
        '<p style="font-size:13px;color:' + C_GRAY_LIGHT + ';">Questions? <a href="mailto:' + HR_EMAIL + '" style="color:' + C_GRAY_DARK + ';">' + HR_EMAIL + '</a></p>' +
        '<p style="margin-top:20px;font-size:14px;color:' + C_GRAY_MID + ';">We wish you the very best in your career.<br><br>Regards,<br><strong>' + COMPANY_NAME + ' — HR and Talent Acquisition Team</strong></p>' +
      '</div>' +
      _emailFooter() +
    '</div>';
  _safeSendEmail(c.email, subject, body, COMPANY_NAME + " - Talent Acquisition");
}

// ════════════════════════════════════════════════════════════
//  EMAIL 5 — Offered (all rounds cleared)
// ════════════════════════════════════════════════════════════
function _sendOfferedEmail(c) {
  const subject = "Congratulations! You Have Been Selected - " + c.position + " | " + COMPANY_NAME;
  const body =
    '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid ' + C_GRAY_BORDER + ';border-radius:12px;overflow:hidden;">' +
      _emailHeader("Talent Acquisition Team") +
      '<div style="background:' + C_LIME + ';padding:14px 32px;text-align:center;"><span style="color:' + C_BLACK + ';font-size:14px;font-weight:bold;letter-spacing:0.5px;">CONGRATULATIONS - YOU HAVE BEEN SELECTED!</span></div>' +
      '<div style="padding:32px;background:' + C_WHITE + ';">' +
        '<p style="font-size:18px;color:' + C_GRAY_DARK + ';margin:0 0 10px;">Dear <strong>' + c.fullName + '</strong>,</p>' +
        '<p style="font-size:15px;color:' + C_GRAY_MID + ';line-height:1.8;margin:0 0 20px;">We are delighted to inform you that you have been <strong>SELECTED</strong> for the position of <strong>' + c.position + '</strong> at <strong>' + COMPANY_NAME + '</strong>.</p>' +
        '<div style="background:' + C_LIME_LIGHT + ';border-left:4px solid ' + C_LIME + ';border-radius:6px;padding:18px;margin-bottom:24px;"><p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:' + C_GRAY_DARK + ';">What Happens Next</p><p style="margin:0;font-size:14px;color:' + C_GRAY_MID + ';line-height:1.8;">Our HR team will send you a <strong>formal Offer Letter (PDF)</strong> shortly with your compensation details and joining information.</p></div>' +
        '<p style="margin-top:20px;font-size:15px;color:' + C_GRAY_DARK + ';font-weight:bold;">Welcome to the ' + COMPANY_NAME + ' family!</p>' +
        '<p style="font-size:14px;color:' + C_GRAY_MID + ';">Regards,<br><strong>' + COMPANY_NAME + ' — HR and Talent Acquisition Team</strong></p>' +
      '</div>' +
      _emailFooter() +
    '</div>';
  _safeSendEmail(c.email, subject, body, COMPANY_NAME + " - Talent Acquisition");
}

// ════════════════════════════════════════════════════════════
//  EMAIL 6 — Offer Letter (PDF attached)
// ════════════════════════════════════════════════════════════
function _sendOfferLetterEmail(c, attachment) {
  const subject = "Your Offer Letter - " + c.position + " | " + COMPANY_NAME;
  const body =
    '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid ' + C_GRAY_BORDER + ';border-radius:12px;overflow:hidden;">' +
      _emailHeader("Talent Acquisition Team") +
      '<div style="background:' + C_LIME + ';padding:14px 32px;text-align:center;"><span style="color:' + C_BLACK + ';font-size:14px;font-weight:bold;letter-spacing:0.5px;">YOUR OFFER LETTER IS HERE!</span></div>' +
      '<div style="padding:32px;background:' + C_WHITE + ';">' +
        '<p style="font-size:18px;color:' + C_GRAY_DARK + ';margin:0 0 10px;">Dear <strong>' + c.fullName + '</strong>,</p>' +
        '<p style="font-size:15px;color:' + C_GRAY_MID + ';line-height:1.8;margin:0 0 20px;">Congratulations! Your official <strong>Offer Letter</strong> is ' + (attachment ? "attached to this email as a PDF." : "being prepared and will be shared shortly.") + '</p>' +
        '<div style="background:' + C_LIME_LIGHT + ';border-left:4px solid ' + C_LIME + ';border-radius:6px;padding:18px;margin-bottom:24px;">' +
          '<p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:' + C_GRAY_DARK + ';">Next Steps</p>' +
          '<p style="margin:0 0 14px;font-size:14px;color:' + C_GRAY_MID + ';line-height:1.8;">Please review the offer letter carefully. To accept, reply to this email with your signed confirmation.</p>' +
          (ONBOARDING_FORM_URL
            ? '<p style="margin:0 0 10px;font-size:14px;font-weight:bold;color:' + C_GRAY_DARK + ';">Submit Your Onboarding Documents</p>' +
              '<p style="margin:0 0 14px;font-size:13px;color:' + C_GRAY_MID + ';line-height:1.7;">Please upload all required documents using the secure link below. Your onboarding can only proceed after all mandatory documents are verified.</p>' +
              '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0;"><tr><td style="border-radius:8px;background:#0A0A0A;">' +
                '<a href="' + ONBOARDING_FORM_URL + '" target="_blank" style="display:inline-block;padding:13px 28px;color:#AAFF00;font-size:14px;font-weight:bold;text-decoration:none;letter-spacing:0.3px;">Upload Documents</a>' +
              '</td></tr></table>'
            : '') +
        '</div>' +
        '<p style="margin-top:20px;font-size:15px;color:' + C_GRAY_DARK + ';font-weight:bold;">Welcome to the ' + COMPANY_NAME + ' family!</p>' +
        '<p style="font-size:14px;color:' + C_GRAY_MID + ';">Regards,<br><strong>' + COMPANY_NAME + ' — HR and Talent Acquisition Team</strong></p>' +
      '</div>' +
      _emailFooter() +
    '</div>';
  const options = { htmlBody: body, replyTo: HR_EMAIL, name: COMPANY_NAME + " - Talent Acquisition" };
  if (attachment) options.attachments = [attachment];
  try {
    GmailApp.sendEmail(c.email, subject, "", Object.assign({}, options, { from: HR_EMAIL }));
    console.log("_sendOfferLetterEmail: sent via alias -> " + c.email);
  } catch (aliasErr) {
    var errMsg = String(aliasErr).toLowerCase();
    var isAliasError = errMsg.indexOf("permission") !== -1 || errMsg.indexOf("alias") !== -1 ||
                       errMsg.indexOf("invalid") !== -1    || errMsg.indexOf("you do not") !== -1 ||
                       errMsg.indexOf("cannot send") !== -1;
    if (isAliasError) {
      console.warn("_sendOfferLetterEmail: alias blocked — falling back to owner email");
      GmailApp.sendEmail(c.email, subject, "", options);
      console.log("_sendOfferLetterEmail: sent via owner email -> " + c.email);
    } else {
      throw aliasErr;
    }
  }
}

// ════════════════════════════════════════════════════════════
//  EMAIL 7 — Rejected
// ════════════════════════════════════════════════════════════
function _sendRejectedEmail(c) {
  const subject = "Update on your Application - " + c.position + " | " + COMPANY_NAME;
  const body =
    '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid ' + C_GRAY_BORDER + ';border-radius:12px;overflow:hidden;">' +
      _emailHeader("Talent Acquisition Team") +
      '<div style="background:' + C_GRAY_DARK + ';padding:12px 32px;text-align:center;"><span style="color:' + C_WHITE + ';font-size:14px;font-weight:bold;letter-spacing:0.5px;">UPDATE ON YOUR APPLICATION</span></div>' +
      '<div style="padding:32px;background:' + C_WHITE + ';">' +
        '<p style="font-size:17px;color:' + C_GRAY_DARK + ';margin:0 0 12px;">Dear <strong>' + c.fullName + '</strong>,</p>' +
        '<p style="font-size:14px;color:' + C_GRAY_MID + ';line-height:1.75;margin:0 0 18px;">Thank you for your interest in joining <strong>' + COMPANY_NAME + '</strong> for the position of <strong>' + c.position + '</strong>.</p>' +
        '<div style="background:#FFF8F8;border-left:4px solid #E5534B;border-radius:6px;padding:16px 18px;margin-bottom:20px;"><p style="margin:0;font-size:14px;color:' + C_GRAY_DARK + ';line-height:1.75;">After careful review, we regret to inform you that we are <strong>unable to move forward</strong> with your application at this time.</p></div>' +
        '<p style="font-size:14px;color:' + C_GRAY_MID + ';line-height:1.75;margin:0 0 20px;">We will keep your profile on file and reach out if a suitable opportunity arises. We wish you all the best in your career journey.</p>' +
        '<p style="font-size:13px;color:' + C_GRAY_LIGHT + ';">For any queries, write to us at <a href="mailto:' + HR_EMAIL + '" style="color:' + C_GRAY_DARK + ';font-weight:600;">' + HR_EMAIL + '</a></p>' +
        '<p style="margin-top:24px;font-size:14px;color:' + C_GRAY_MID + ';">Regards,<br><strong>' + COMPANY_NAME + ' — HR and Talent Acquisition Team</strong></p>' +
      '</div>' +
      _emailFooter() +
    '</div>';
  _safeSendEmail(c.email, subject, body, COMPANY_NAME + " - Talent Acquisition");
}

// ════════════════════════════════════════════════════════════
//  EMAIL 8 — Onboarding Complete
// ════════════════════════════════════════════════════════════
function _sendOnboardedEmail(c) {
  const subject = "Your Documents Are Verified - Welcome Aboard! | " + COMPANY_NAME;
  const joiningLine = c.joiningDate
    ? '<p style="margin:0;font-size:14px;color:' + C_GRAY_MID + ';line-height:1.8;">Your joining date is <strong>' + c.joiningDate + '</strong>. Our HR team will share further joining instructions closer to the date.</p>'
    : '<p style="margin:0;font-size:14px;color:' + C_GRAY_MID + ';line-height:1.8;">Our HR team will reach out shortly with your joining instructions and schedule.</p>';
  const body =
    '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid ' + C_GRAY_BORDER + ';border-radius:12px;overflow:hidden;">' +
      _emailHeader("Onboarding Team") +
      '<div style="background:' + C_LIME + ';padding:14px 32px;text-align:center;">' +
        '<span style="color:' + C_BLACK + ';font-size:14px;font-weight:bold;letter-spacing:0.5px;">DOCUMENTS VERIFIED - YOU ARE READY TO JOIN!</span>' +
      '</div>' +
      '<div style="padding:32px;background:' + C_WHITE + ';">' +
        '<p style="font-size:18px;color:' + C_GRAY_DARK + ';margin:0 0 10px;">Dear <strong>' + c.fullName + '</strong>,</p>' +
        '<p style="font-size:15px;color:' + C_GRAY_MID + ';line-height:1.8;margin:0 0 20px;">Great news! We have <strong>successfully verified all your submitted documents</strong> for the position of <strong>' + c.position + '</strong> at <strong>' + COMPANY_NAME + '</strong>. Your onboarding process is now complete.</p>' +
        '<div style="background:' + C_LIME_LIGHT + ';border-left:4px solid ' + C_LIME + ';border-radius:6px;padding:18px;margin-bottom:24px;">' +
          '<p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:' + C_GRAY_DARK + ';">What Happens Next</p>' +
          joiningLine +
        '</div>' +
        '<p style="margin-top:20px;font-size:15px;color:' + C_GRAY_DARK + ';font-weight:bold;">We look forward to welcoming you to the ' + COMPANY_NAME + ' family!</p>' +
        '<p style="font-size:14px;color:' + C_GRAY_MID + ';">Regards,<br><strong>' + COMPANY_NAME + ' — HR and Onboarding Team</strong></p>' +
      '</div>' +
      _emailFooter() +
    '</div>';
  _safeSendEmail(c.email, subject, body, COMPANY_NAME + " - Onboarding Team");
  console.log("Onboarded email sent: " + c.email);
}

// ════════════════════════════════════════════════════════════
//  EMAIL 9 — Orientation Invite
// ════════════════════════════════════════════════════════════
function _sendOrientationInviteEmail(c) {
  var sessionRows = "";
  if (c.sessions && c.sessions.length > 0) {
    c.sessions.forEach(function(s) {
      var dateStr = s.scheduledDate
        ? new Date(s.scheduledDate).toLocaleDateString("en-IN", { weekday:"long", day:"numeric", month:"long", year:"numeric" })
        : "TBD";
      var timeStr = (s.startTime && s.endTime) ? (s.startTime + " - " + s.endTime) : (s.startTime || "TBD");
      var modeStr = s.mode === "online" ? "Online / Virtual" : "In-Person";
      var badge   = (s.isMandatory !== false)
        ? '<span style="background:' + C_LIME + ';color:' + C_BLACK + ';font-size:10px;font-weight:bold;padding:2px 8px;border-radius:10px;margin-left:8px;">MANDATORY</span>'
        : "";
      sessionRows +=
        '<div style="border:1px solid ' + C_GRAY_BORDER + ';border-radius:8px;padding:16px;margin-bottom:12px;">' +
          '<p style="margin:0 0 10px;font-size:14px;font-weight:bold;color:' + C_GRAY_DARK + ';">' + (s.title || "Orientation Session") + badge + '</p>' +
          '<table style="width:100%;font-size:13px;border-collapse:collapse;">' +
            '<tr><td style="color:' + C_GRAY_LIGHT + ';padding:3px 0;width:90px;">Date</td><td style="color:' + C_GRAY_DARK + ';">' + dateStr + '</td></tr>' +
            '<tr><td style="color:' + C_GRAY_LIGHT + ';padding:3px 0;">Time</td><td style="color:' + C_GRAY_DARK + ';">' + timeStr + '</td></tr>' +
            '<tr><td style="color:' + C_GRAY_LIGHT + ';padding:3px 0;">Mode</td><td style="color:' + C_GRAY_DARK + ';">' + modeStr + '</td></tr>' +
            (s.venue       ? '<tr><td style="color:' + C_GRAY_LIGHT + ';padding:3px 0;">Venue</td><td style="color:' + C_GRAY_DARK + ';">' + s.venue + '</td></tr>' : '') +
            (s.facilitator ? '<tr><td style="color:' + C_GRAY_LIGHT + ';padding:3px 0;">Facilitator</td><td style="color:' + C_GRAY_DARK + ';">' + s.facilitator + '</td></tr>' : '') +
          '</table>' +
        '</div>';
    });
  } else {
    sessionRows = '<p style="color:' + C_GRAY_LIGHT + ';font-size:13px;margin:0 0 16px;">Session details will be shared shortly by HR.</p>';
  }

  var mentorBlock = "";
  if (c.mentorName) {
    mentorBlock =
      '<div style="background:' + C_LIME_LIGHT + ';border-left:4px solid ' + C_LIME + ';border-radius:6px;padding:16px 18px;margin:20px 0;">' +
        '<p style="margin:0 0 4px;font-size:14px;font-weight:bold;color:' + C_GRAY_DARK + ';">Your Mentor</p>' +
        '<p style="margin:0;font-size:14px;color:' + C_GRAY_MID + ';">' + c.mentorName +
        (c.mentorEmail ? ' - <a href="mailto:' + c.mentorEmail + '" style="color:' + C_GRAY_DARK + ';">' + c.mentorEmail + '</a>' : '') +
        '</p>' +
      '</div>';
  }

  var joiningLine = c.joiningDate
    ? 'Your joining date is <strong>' + c.joiningDate + '</strong>. Please attend all mandatory sessions before your first day.'
    : 'Please attend all mandatory orientation sessions to complete your onboarding.';

  var subject = "Your Orientation Schedule - " + COMPANY_NAME;
  var body =
    '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid ' + C_GRAY_BORDER + ';border-radius:12px;overflow:hidden;">' +
      _emailHeader("Onboarding & Orientation Team") +
      '<div style="background:' + C_LIME + ';padding:14px 32px;text-align:center;">' +
        '<span style="color:' + C_BLACK + ';font-size:14px;font-weight:bold;letter-spacing:0.5px;">YOUR ORIENTATION IS SCHEDULED!</span>' +
      '</div>' +
      '<div style="padding:32px;background:' + C_WHITE + ';">' +
        '<p style="font-size:18px;color:' + C_GRAY_DARK + ';margin:0 0 10px;">Dear <strong>' + c.fullName + '</strong>,</p>' +
        '<p style="font-size:15px;color:' + C_GRAY_MID + ';line-height:1.8;margin:0 0 20px;">Welcome to <strong>' + COMPANY_NAME + '</strong>! You have been enrolled in the orientation programme for the role of <strong>' + c.position + '</strong>. Please find your session schedule below.</p>' +
        '<div style="background:' + C_LIME_LIGHT + ';border-left:4px solid ' + C_LIME + ';border-radius:6px;padding:16px 18px;margin-bottom:24px;">' +
          '<p style="margin:0;font-size:14px;color:' + C_GRAY_MID + ';">' + joiningLine + '</p>' +
        '</div>' +
        '<p style="font-size:14px;font-weight:bold;color:' + C_GRAY_DARK + ';margin:0 0 14px;">Orientation Sessions</p>' +
        sessionRows +
        mentorBlock +
        '<p style="font-size:13px;color:' + C_GRAY_LIGHT + ';margin-top:20px;">Questions? <a href="mailto:' + HR_EMAIL + '" style="color:' + C_GRAY_DARK + ';">' + HR_EMAIL + '</a></p>' +
        '<p style="margin-top:20px;font-size:14px;color:' + C_GRAY_MID + ';">Regards,<br><strong>' + COMPANY_NAME + ' — HR & Onboarding Team</strong></p>' +
      '</div>' +
      _emailFooter() +
    '</div>';

  _safeSendEmail(c.email, subject, body, COMPANY_NAME + " - Onboarding Team");
  console.log("Orientation invite sent: " + c.email);
}

// ════════════════════════════════════════════════════════════
//  EMAIL 10 — Deployed to Team
// ════════════════════════════════════════════════════════════
function _sendDeployedEmail(c) {
  var subject = "Welcome to the Team - Your Deployment Details | " + COMPANY_NAME;

  function row(label, value) {
    if (!value) return "";
    return (
      '<tr style="border-bottom:1px solid #F0F0F0;">' +
        '<td style="padding:8px 0;color:' + C_GRAY_LIGHT + ';font-size:13px;width:140px;vertical-align:top;">' + label + '</td>' +
        '<td style="padding:8px 0;color:' + C_GRAY_DARK + ';font-size:13px;font-weight:600;">' + value + '</td>' +
      '</tr>'
    );
  }

  var locationStr = c.workLocation === "remote" ? "Remote" :
                    c.workLocation === "hybrid"  ? "Hybrid" : "Office";
  if (c.officeLocation) locationStr += " - " + c.officeLocation;

  var shiftStr = c.shift === "morning"   ? "Morning Shift" :
                 c.shift === "afternoon" ? "Afternoon Shift" :
                 c.shift === "night"     ? "Night Shift" :
                 c.shift === "flexible"  ? "Flexible Hours" : c.shift;

  var domainBlock = c.domainEmail
    ? '<div style="background:' + C_LIME_LIGHT + ';border-left:4px solid ' + C_LIME + ';border-radius:6px;padding:14px 18px;margin-bottom:24px;">' +
        '<p style="margin:0 0 4px;font-size:13px;font-weight:bold;color:' + C_GRAY_DARK + ';">Your Company Email</p>' +
        '<p style="margin:0;font-size:15px;color:' + C_GRAY_DARK + ';font-weight:bold;">' + c.domainEmail + '</p>' +
        '<p style="margin:4px 0 0;font-size:12px;color:' + C_GRAY_LIGHT + ';">Use this email for all official communication.</p>' +
      '</div>'
    : "";

  var joiningBlock = c.joiningDate
    ? '<div style="background:' + C_LIME_LIGHT + ';border-left:4px solid ' + C_LIME + ';border-radius:6px;padding:14px 18px;margin-bottom:24px;">' +
        '<p style="margin:0 0 2px;font-size:13px;font-weight:bold;color:' + C_GRAY_DARK + ';">Your Joining Date</p>' +
        '<p style="margin:0;font-size:15px;color:' + C_GRAY_DARK + ';font-weight:bold;">' + c.joiningDate + '</p>' +
      '</div>'
    : "";

  var body =
    '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid ' + C_GRAY_BORDER + ';border-radius:12px;overflow:hidden;">' +
      _emailHeader("HR - Team Deployment") +
      '<div style="background:' + C_LIME + ';padding:14px 32px;text-align:center;">' +
        '<span style="color:' + C_BLACK + ';font-size:14px;font-weight:bold;letter-spacing:0.5px;">CONGRATULATIONS - YOU HAVE BEEN DEPLOYED!</span>' +
      '</div>' +
      '<div style="padding:32px;background:' + C_WHITE + ';">' +
        '<p style="font-size:18px;color:' + C_GRAY_DARK + ';margin:0 0 10px;">Dear <strong>' + c.fullName + '</strong>,</p>' +
        '<p style="font-size:15px;color:' + C_GRAY_MID + ';line-height:1.8;margin:0 0 20px;">' +
          'Congratulations! You have been officially deployed to <strong>' + (c.teamName || "your team") + '</strong> at <strong>' + COMPANY_NAME + '</strong>. ' +
          'Please find your deployment details below.' +
        '</p>' +
        joiningBlock +
        '<div style="background:#F9F9F9;border:1px solid ' + C_GRAY_BORDER + ';border-radius:8px;padding:20px;margin-bottom:24px;">' +
          '<p style="margin:0 0 14px;font-weight:bold;font-size:14px;color:' + C_GRAY_DARK + ';">Deployment Details</p>' +
          '<table style="width:100%;border-collapse:collapse;">' +
            row("Team",              c.teamName) +
            row("Department",        c.department) +
            row("Role",              c.roleInTeam) +
            row("Position",          c.position) +
            row("Reporting Manager", c.reportingManager) +
            row("Work Location",     locationStr) +
            row("Shift",             shiftStr) +
            row("Deployed On",       c.deployedDate) +
          '</table>' +
        '</div>' +
        domainBlock +
        '<div style="background:' + C_LIME_LIGHT + ';border-left:4px solid ' + C_LIME + ';border-radius:6px;padding:16px 18px;margin-bottom:24px;">' +
          '<p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:' + C_GRAY_DARK + ';">What Happens Next</p>' +
          '<p style="margin:0;font-size:14px;color:' + C_GRAY_MID + ';line-height:1.8;">Your reporting manager will get in touch with you shortly to brief you on your responsibilities, tools, and the team. Please be prepared with all necessary equipment on your first day.</p>' +
        '</div>' +
        '<p style="font-size:13px;color:' + C_GRAY_LIGHT + ';">Questions? Contact us at <a href="mailto:' + HR_EMAIL + '" style="color:' + C_GRAY_DARK + ';">' + HR_EMAIL + '</a></p>' +
        '<p style="margin-top:20px;font-size:15px;color:' + C_GRAY_DARK + ';font-weight:bold;">Welcome to the ' + (c.teamName || COMPANY_NAME) + ' team!</p>' +
        '<p style="font-size:14px;color:' + C_GRAY_MID + ';">Regards,<br><strong>' + COMPANY_NAME + ' - HR Team</strong></p>' +
      '</div>' +
      _emailFooter() +
    '</div>';

  _safeSendEmail(c.email, subject, body, COMPANY_NAME + " - HR Team");
  console.log("Deployment email sent: " + c.email);
}

// ════════════════════════════════════════════════════════════
//  JOURNEY STEP HELPERS
// ════════════════════════════════════════════════════════════
function _journeyStep(done, num, title, subtitle) {
  const bg  = done ? C_LIME  : "#E5E7EB";
  const txt = done ? C_BLACK : C_GRAY_LIGHT;
  return (
    '<div style="display:flex;align-items:flex-start;margin-bottom:10px;">' +
      '<div style="min-width:30px;height:30px;background:' + bg + ';color:' + txt + ';border-radius:50%;text-align:center;line-height:30px;font-size:12px;font-weight:bold;margin-right:12px;flex-shrink:0;">' + (done ? "V" : num) + '</div>' +
      '<div style="padding-top:4px;">' +
        '<p style="margin:0;font-size:13px;font-weight:bold;color:' + (done ? C_GRAY_DARK : C_GRAY_MID) + ';">' + title + '</p>' +
        '<p style="margin:2px 0 0;font-size:12px;color:' + C_GRAY_LIGHT + ';">' + subtitle + '</p>' +
      '</div>' +
    '</div>'
  );
}
function _journeyStepActive(num, title, subtitle) {
  return (
    '<div style="display:flex;align-items:flex-start;margin-bottom:10px;">' +
      '<div style="min-width:30px;height:30px;background:' + C_LIME + ';color:' + C_BLACK + ';border-radius:50%;text-align:center;line-height:30px;font-size:12px;font-weight:bold;margin-right:12px;flex-shrink:0;">V</div>' +
      '<div style="background:' + C_LIME_LIGHT + ';border:1px solid ' + C_LIME_DARK + ';border-radius:6px;padding:8px 14px;">' +
        '<p style="margin:0;font-size:13px;font-weight:bold;color:' + C_GRAY_DARK + ';">' + title + ' - You are here</p>' +
        '<p style="margin:3px 0 0;font-size:12px;color:' + C_GRAY_MID + ';">' + subtitle + '</p>' +
      '</div>' +
    '</div>'
  );
}

// ════════════════════════════════════════════════════════════
//  DRIVE — Upload resume PDF
// ════════════════════════════════════════════════════════════
function _uploadResume(base64Data, fileName) {
  try {
    const bytes  = Utilities.base64Decode(base64Data);
    const blob   = Utilities.newBlob(bytes, "application/pdf", fileName);
    const folders = DriveApp.getFoldersByName(RESUME_FOLDER);
    const folder  = folders.hasNext() ? folders.next() : DriveApp.createFolder(RESUME_FOLDER);
    const file    = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (err) {
    console.error("_uploadResume error: " + err);
    return "";
  }
}

// ════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════
function _getSheet() {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
}
function _parseBody(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (_) {
    const obj = {};
    e.postData.contents.split("&").forEach(function(pair) {
      const p = pair.split("=");
      const k = decodeURIComponent((p[0] || "").replace(/\+/g, " "));
      const v = decodeURIComponent((p[1] || "").replace(/\+/g, " "));
      if (k) obj[k] = v;
    });
    return obj;
  }
}
function _jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ════════════════════════════════════════════════════════════
//  ONBOARDING FORM SUBMIT TRIGGER
// ════════════════════════════════════════════════════════════
var FORM_FIELD_MAP = {
  "Email Address"                                  : "candidateEmail",
  "Full Name"                                      : "candidateName",
  "Position Applied For"                           : "position",
  "10th / SSC Marksheet"                           : "tenthMarksheet",
  "12th / HSC Marksheet"                           : "twelfthMarksheet",
  "Graduation Certificate & Marksheet"             : "graduationCert",
  "Post Graduation Certificate (if applicable)"    : "postGraduationCert",
  "Other Certifications (if any)"                  : "otherCertifications",
  "Passport Size Photograph (colour)"              : "passportPhoto",
  "Government ID — PAN Card / Voter ID / DL"       : "governmentId",
  "Bank Account Details (passbook / statement)"    : "bankDetails"
};

// Builds a { questionTitle: "answer text" } map from whatever event shape we get.
// Works for BOTH trigger types:
//   • Trigger on the FORM   → e.response (FormResponse, getItemResponses)
//   • Trigger on the SHEET  → e.namedValues ({ "Question": ["answer"] })
// For file-upload questions the value is already the Drive URL(s) in both cases.
function _collectFormAnswers(e) {
  var answers = {};
  // Case 1: Form-submit trigger
  if (e && e.response && typeof e.response.getItemResponses === "function") {
    e.response.getItemResponses().forEach(function(ir) {
      var v = ir.getResponse();
      if (Array.isArray(v)) {
        v = v.map(function(id) {
          // file-upload answers come back as file IDs on the Form trigger
          return /^https?:\/\//.test(id) ? id
               : "https://drive.google.com/file/d/" + id + "/view?usp=sharing";
        }).join(", ");
      }
      answers[ir.getItem().getTitle()] = String(v == null ? "" : v).trim();
    });
    return answers;
  }
  // Case 2: Sheet-submit trigger (namedValues = { title: [value] })
  if (e && e.namedValues) {
    Object.keys(e.namedValues).forEach(function(title) {
      var arr = e.namedValues[title];
      answers[title.trim()] = String((Array.isArray(arr) ? arr.join(", ") : arr) || "").trim();
    });
    return answers;
  }
  return null; // no usable event (e.g. run manually from the editor)
}

function onFormSubmit(e) {
  try {
    if (!BACKEND_URL) {
      console.warn("onFormSubmit: BACKEND_URL script property not set — skipping webhook");
      return;
    }
    var answers = _collectFormAnswers(e);
    if (!answers) {
      console.warn("onFormSubmit: no form event detected. This happens when you press ▶ Run manually. " +
                   "It runs for real only when the installable trigger fires on an actual form submission. " +
                   "Use testOnboardingWebhook() to test the backend call by hand.");
      return;
    }

    var payload = { secret: ONBOARDING_WEBHOOK_SECRET, documents: {}, submittedAt: new Date().toISOString() };
    Object.keys(answers).forEach(function(title) {
      var key = FORM_FIELD_MAP[title];
      if (!key) return;
      if (key === "candidateEmail" || key === "candidateName" || key === "position") {
        payload[key] = answers[title];
      } else {
        payload.documents[key] = answers[title];
      }
    });

    if (!payload.candidateEmail) {
      console.error("onFormSubmit: could not find a 'candidateEmail' answer. " +
                    "Check that a form question is titled exactly \"Email Address\" (see FORM_FIELD_MAP). " +
                    "Question titles seen: " + Object.keys(answers).join(" | "));
      return;
    }

    var webhookUrl = BACKEND_URL.replace(/\/$/, "") + "/api/hr/onboarding/webhook";
    var response = UrlFetchApp.fetch(webhookUrl, {
      method: "post", contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true, followRedirects: true
    });
    var code = response.getResponseCode();
    console.log("onFormSubmit webhook ->", payload.candidateEmail,
                "| docs:", Object.keys(payload.documents).length,
                "| HTTP", code, "|", response.getContentText());
    if (code === 401 || code === 403) {
      console.error("Webhook rejected (HTTP " + code + "). ONBOARDING_WEBHOOK_SECRET in GAS does not match the backend env var.");
    }
  } catch (err) {
    console.error("onFormSubmit error: " + (err && err.stack ? err.stack : err));
  }
}

// Run this manually from the editor to test the backend webhook end-to-end.
// Edit the email/docs to match a real onboarding candidate, then press ▶ Run.
function testOnboardingWebhook() {
  onFormSubmit({
    namedValues: {
      "Email Address": ["ravi@example.com"],
      "Full Name": ["Ravi"],
      "Position Applied For": ["Business Development Executive"],
      "10th / SSC Marksheet": ["https://drive.google.com/file/d/TEST10/view"],
      "12th / HSC Marksheet": ["https://drive.google.com/file/d/TEST12/view"],
      "Graduation Certificate & Marksheet": ["https://drive.google.com/file/d/TESTGRAD/view"],
      "Passport Size Photograph (colour)": ["https://drive.google.com/file/d/TESTPHOTO/view"],
      "Government ID — PAN Card / Voter ID / DL": ["https://drive.google.com/file/d/TESTID/view"],
      "Bank Account Details (passbook / statement)": ["https://drive.google.com/file/d/TESTBANK/view"]
    }
  });
}

// ════════════════════════════════════════════════════════════
//  SPREADSHEET onEdit TRIGGER
// ════════════════════════════════════════════════════════════
function onShortlistEdit(e) {
  try {
    const sheet = e.source.getActiveSheet();
    if (sheet.getName() !== SHEET_NAME) return;
    const editedCol = e.range.getColumn();
    const editedRow = e.range.getRow();
    if (editedCol !== 14) return;
    if (editedRow < 2)    return;
    const val = String(e.value || "").trim().toLowerCase();
    if (val !== "true") return;
    const row = sheet.getRange(editedRow, 1, 1, TOTAL_COLS).getValues()[0];
    const alreadySent = String(row[COL.EMAIL_SENT_FLAG] || "").trim().toLowerCase();
    if (alreadySent.startsWith("sent")) return;
    const candidate = {
      fullName : String(row[COL.FULL_NAME] || "").trim(),
      email    : String(row[COL.EMAIL]     || "").trim(),
      position : String(row[COL.POSITION]  || "").trim(),
      phone    : String(row[COL.PHONE]     || "").trim(),
    };
    if (!candidate.email) return;
    _sendShortlistEmail(candidate);
    sheet.getRange(editedRow, COL.EMAIL_SENT_FLAG + 1).setValue("Sent - " + new Date().toLocaleString("en-IN"));
    SpreadsheetApp.flush();
  } catch (err) {
    console.error("onShortlistEdit error: " + err);
  }
}

// ════════════════════════════════════════════════════════════
//  DEPLOYMENT CHECKLIST
//  1. Paste this file into script.google.com (replace everything)
//  2. Run testEmailDiagnostic() — verify email works
//  3. Deploy > Manage Deployments > Edit > New version > Deploy
//     Execute as: Me  |  Who can access: Anyone
//  4. Copy the /exec URL → set GAS_WEBAPP_URL in your backend (Render) env
//  5. Add triggers:
//     - onShortlistEdit → From spreadsheet → On edit
//     - onFormSubmit    → From form        → On form submit
// ════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
//  TEST CLEANUP — delete all rows for the given emails
//  Run this from the editor (select cleanupTestRows → ▶ Run).
//  Cleans the applications sheet AND the onboarding form's
//  response sheet. Finds the email column by header automatically.
// ════════════════════════════════════════════════════════════
function cleanupTestRows() {
  var emails = [
    "kolasanidinesh875@gmail.com",
    "kolasanidinesh25@gmail.com",
    "dinesh.kolasani@zyntrixsoftware.com"
  ].map(function (e) { return e.trim().toLowerCase(); });

  // Spreadsheets to clean: the applications sheet + the form's response sheet.
  var ssIds = [SHEET_ID];
  try {
    if (ONBOARDING_FORM_URL) {
      var form   = FormApp.openByUrl(ONBOARDING_FORM_URL);
      var destId = form.getDestinationId();
      if (destId && ssIds.indexOf(destId) === -1) ssIds.push(destId);
    }
  } catch (err) {
    Logger.log("Note: couldn't open the onboarding form to locate its response sheet (" + err +
               "). If needed, add its spreadsheet ID to ssIds manually.");
  }

  var totalDeleted = 0;
  ssIds.forEach(function (id) {
    var ss;
    try { ss = SpreadsheetApp.openById(id); }
    catch (e) { Logger.log("Could not open spreadsheet " + id + ": " + e); return; }

    ss.getSheets().forEach(function (sheet) {
      var data = sheet.getDataRange().getValues();
      if (data.length < 2) return;

      // Locate the email column from the header row.
      var header = data[0].map(function (h) { return String(h || "").toLowerCase(); });
      var emailCol = -1;
      for (var i = 0; i < header.length; i++) {
        if (header[i].indexOf("email") !== -1) { emailCol = i; break; }
      }
      if (emailCol === -1) return;

      // Delete matching rows bottom-up so indices stay valid.
      var deleted = 0;
      for (var r = data.length - 1; r >= 1; r--) {
        var cell = String(data[r][emailCol] || "").trim().toLowerCase();
        if (emails.indexOf(cell) !== -1) { sheet.deleteRow(r + 1); deleted++; }
      }
      if (deleted > 0) Logger.log(ss.getName() + " / " + sheet.getName() + ": deleted " + deleted + " row(s)");
      totalDeleted += deleted;
    });
  });

  Logger.log("DONE — deleted " + totalDeleted + " row(s) across " + ssIds.length + " spreadsheet(s).");
}

// ════════════════════════════════════════════════════════════
//  ONE-TIME: format the Phone column as TEXT
//  Run once (select formatPhoneColumnAsText → ▶ Run) so phone
//  numbers with a leading "+" are never treated as formulas.
//  Note: cells ALREADY showing #ERROR! lost their value in the
//  sheet — but the phone is still safe in the backend database.
// ════════════════════════════════════════════════════════════
function formatPhoneColumnAsText() {
  var sheet = _getSheet();
  var lastRow = Math.max(sheet.getMaxRows(), 1000);
  sheet.getRange(2, COL.PHONE + 1, lastRow - 1, 1).setNumberFormat("@");
  Logger.log("Phone column set to plain text.");
}
