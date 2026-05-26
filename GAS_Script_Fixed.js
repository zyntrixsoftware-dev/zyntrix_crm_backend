// ============================================================
//  Google Apps Script — Zyntrix Software Solution
//  FIXED VERSION — resolves email sending failures
//
//  KEY FIXES vs previous version:
//    1. _safeSendEmail() — tries alias (hr@zyntrixsoftware.com) first,
//       falls back to script-owner's Gmail if alias not configured.
//       This fixes the #1 silent failure cause.
//    2. Handlers now return { ok: false, error: "..." } on failure
//       instead of always returning { ok: true }. Backend can now
//       detect and log real failures.
//    3. testEmailDiagnostic() — run this from the Apps Script editor
//       to verify email sending works before testing from HRMS.
//
//  HOW TO DEPLOY:
//    1. Open script.google.com → paste this entire file (replace all)
//    2. Run testEmailDiagnostic() from the editor to verify it works
//    3. Deploy > Manage Deployments > Edit > New version > Deploy
//       Execute as: Me  |  Who can access: Anyone
//    4. Copy the new /exec URL → update GAS_WEBAPP_URL in Railway
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
  TIMESTAMP          : 0,   // A
  POSITION           : 1,   // B
  FULL_NAME          : 2,   // C
  EMAIL              : 3,   // D
  PHONE              : 4,   // E
  QUALIFICATIONS     : 5,   // F
  EXPERIENCE         : 6,   // G
  STATE_ADDRESS      : 7,   // H
  EDTECH             : 8,   // I
  AVAILABILITY       : 9,   // J
  CV_LINK            : 10,  // K
  SOURCE             : 11,  // L
  DECLARATION        : 12,  // M
  RESUME_SHORTLISTED : 13,  // N
  INTERVIEW_STATUS   : 14,  // O
  OFFERED            : 15,  // P
  HR_NAME            : 16,  // Q
  EMAIL_SENT_FLAG    : 17,  // R
};
const TOTAL_COLS = 18;

// ════════════════════════════════════════════════════════════
//  _checkQuota — returns remaining daily email quota.
//  Throws a clear error if quota is 0 so callers surface it
//  to the backend instead of swallowing it silently.
// ════════════════════════════════════════════════════════════
function _checkQuota() {
  var remaining = MailApp.getRemainingDailyQuota();
  console.log("Gmail daily quota remaining: " + remaining);
  if (remaining < 1) {
    throw new Error(
      "Gmail daily quota exhausted (0 emails left). " +
      "Quota resets at midnight Pacific time. " +
      "Free accounts: 100/day. Google Workspace: 1,500/day."
    );
  }
  return remaining;
}

// ════════════════════════════════════════════════════════════
//  _safeSendEmail — THE CORE FIX
//
//  Problem: GmailApp.sendEmail with "from: HR_EMAIL" requires that
//  hr@zyntrixsoftware.com is a verified "Send mail as" alias on the
//  Google account running this script. If the alias was removed,
//  its verification lapsed, or the script runs under a different
//  account, EVERY email throws a permission error — silently.
//
//  Fix: Try with the alias first. If Google rejects it (permission /
//  alias error), fall back to sending from the script owner's address.
//  replyTo is always set to HR_EMAIL so replies still reach HR.
// ════════════════════════════════════════════════════════════
function _safeSendEmail(to, subject, htmlBody, senderName) {
  // Fail fast with a clear message if quota is gone — before attempting send
  _checkQuota();
  var baseOpts = {
    htmlBody : htmlBody,
    replyTo  : HR_EMAIL,
    name     : senderName || (COMPANY_NAME + " - HR"),
  };
  try {
    // Attempt 1: send as hr@zyntrixsoftware.com (requires alias to be configured)
    var aliasOpts = Object.assign({}, baseOpts, { from: HR_EMAIL });
    GmailApp.sendEmail(to, subject, "", aliasOpts);
    console.log("_safeSendEmail: sent via alias → " + to);
  } catch (aliasErr) {
    var errMsg = String(aliasErr).toLowerCase();
    var isAliasError = errMsg.indexOf("permission") !== -1 ||
                       errMsg.indexOf("alias")      !== -1 ||
                       errMsg.indexOf("invalid")    !== -1 ||
                       errMsg.indexOf("you do not") !== -1 ||
                       errMsg.indexOf("cannot send")!== -1;
    if (isAliasError) {
      // Alias not set up — fall back to script owner's Gmail account.
      // The email still comes from a @zyntrixsoftware.com address if the
      // script is owned by a Workspace account on that domain.
      console.warn("_safeSendEmail: alias blocked (" + aliasErr + ") — falling back to owner's email");
      GmailApp.sendEmail(to, subject, "", baseOpts);
      console.log("_safeSendEmail: sent via owner email → " + to);
    } else {
      // Quota error, invalid recipient, auth issue — re-throw so callers
      // can catch it and return { ok: false } to the backend.
      throw aliasErr;
    }
  }
}

// ════════════════════════════════════════════════════════════
//  DIAGNOSTIC — run this from the Apps Script editor (▶ Run)
//  BEFORE deploying, to verify email sending works end-to-end.
//  Check the Execution Log for SUCCESS or FAILED details.
// ════════════════════════════════════════════════════════════
function testEmailDiagnostic() {
  // Send the test to HR_EMAIL so no extra OAuth scope is needed.
  // Check that inbox after running this function.
  var testTo = HR_EMAIL;
  Logger.log("=== GAS Email Diagnostic ===");
  Logger.log("HR alias target: " + HR_EMAIL);
  Logger.log("Gmail quota remaining today: " + MailApp.getRemainingDailyQuota());
  Logger.log("Sending test email to: " + testTo);

  try {
    _safeSendEmail(
      testTo,
      "[Zyntrix GAS Test] Email diagnostic — " + new Date().toLocaleString("en-IN"),
      '<div style="font-family:Arial,sans-serif;padding:20px;">' +
        '<h2 style="color:#0A0A0A;">GAS Email Test — PASSED</h2>' +
        '<p>If you see this email, Google Apps Script can send emails correctly.</p>' +
        '<p><strong>Reply-to:</strong> ' + HR_EMAIL + '</p>' +
        '<p><strong>Time:</strong> ' + new Date().toLocaleString("en-IN") + '</p>' +
      '</div>',
      COMPANY_NAME + " - GAS Diagnostic"
    );
    Logger.log("SUCCESS — test email sent to " + testTo + ". Check that inbox now.");
  } catch (err) {
    Logger.log("FAILED — " + err);
    Logger.log("Common fixes:");
    Logger.log("  1. Re-authorize the script: Run > Review Permissions");
    Logger.log("  2. Check Gmail daily quota (100/day free, 1500/day Workspace)");
    Logger.log("  3. Verify the Google account running this script has Gmail enabled");
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
    return _handleApplication(data);
  } catch (err) {
    console.error("doPost error: " + err);
    return _jsonOut({ status: "error", ok: false, error: String(err) });
  }
}

// ════════════════════════════════════════════════════════════
//  HANDLER 1 — New job application
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
  row[COL.RESUME_SHORTLISTED] = "";
  row[COL.INTERVIEW_STATUS]   = "";
  row[COL.OFFERED]            = "";
  row[COL.HR_NAME]            = "";
  row[COL.EMAIL_SENT_FLAG]    = "";
  sheet.appendRow(row);
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
  const alreadySent = String(row[COL.EMAIL_SENT_FLAG] || "").trim().toLowerCase();
  let emailed = false;
  if (candidate.email && !alreadySent.startsWith("sent")) {
    try {
      _sendShortlistEmail(candidate);
      sheet.getRange(sheetRow, COL.EMAIL_SENT_FLAG + 1)
           .setValue("Sent - " + new Date().toLocaleString("en-IN"));
      SpreadsheetApp.flush();
      emailed = true;
    } catch (mailErr) {
      console.error("Shortlist email failed: " + mailErr);
      // Return failure so backend knows email didn't go out
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
//  HANDLER 10 — Orientation Invite (with full session schedule)
// ════════════════════════════════════════════════════════════
function _handleSendOrientationInvite(data) {
  const email = String(data.email || "").trim().toLowerCase();
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
//  EMAIL 10 — Orientation Invite
//  Includes a full session-by-session schedule table.
// ════════════════════════════════════════════════════════════
function _sendOrientationInviteEmail(c) {
  const subject = "Your Orientation Schedule — Welcome to " + COMPANY_NAME + "!";

  // ── Build session schedule table ────────────────────────────────
  function modeLabel(mode) {
    if (!mode) return "In-Person";
    if (mode === "online_zoom")  return "Online (Zoom)";
    if (mode === "online_meet")  return "Online (Google Meet)";
    if (mode === "hybrid")       return "Hybrid";
    return "In-Person";
  }
  function fmtDate(d) {
    if (!d) return "TBD";
    try {
      var dt = new Date(d + "T00:00:00");
      return dt.toLocaleDateString("en-IN", { weekday:"long", day:"numeric", month:"long", year:"numeric" });
    } catch(e) { return d; }
  }

  var sessionsHtml = "";
  if (c.sessions && c.sessions.length > 0) {
    // Group sessions by date
    var byDate = {};
    c.sessions.forEach(function(s) {
      var key = s.date || "TBD";
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(s);
    });
    Object.keys(byDate).sort().forEach(function(dateKey) {
      sessionsHtml +=
        '<tr style="background:' + C_GRAY_DARK + ';">' +
          '<td colspan="5" style="padding:10px 14px;font-size:12px;font-weight:700;color:' + C_LIME + ';letter-spacing:0.5px;text-transform:uppercase;">' +
            fmtDate(dateKey) +
          '</td>' +
        '</tr>';
      byDate[dateKey].forEach(function(s) {
        var timeStr = (s.startTime && s.endTime) ? (s.startTime + " – " + s.endTime) : (s.startTime || "TBD");
        sessionsHtml +=
          '<tr>' +
            '<td style="padding:11px 14px;font-size:13px;font-weight:600;color:' + C_GRAY_DARK + ';border-top:1px solid ' + C_GRAY_BORDER + ';">' +
              s.title + (s.isMandatory ? ' <span style="font-size:10px;background:#FEF3C7;color:#92400E;padding:2px 6px;border-radius:4px;font-weight:500;margin-left:4px;">Mandatory</span>' : '') +
            '</td>' +
            '<td style="padding:11px 14px;font-size:12px;color:#6B7280;border-top:1px solid ' + C_GRAY_BORDER + ';">' + timeStr + '</td>' +
            '<td style="padding:11px 14px;font-size:12px;color:#6B7280;border-top:1px solid ' + C_GRAY_BORDER + ';">' + modeLabel(s.mode) + '</td>' +
            '<td style="padding:11px 14px;font-size:12px;color:#6B7280;border-top:1px solid ' + C_GRAY_BORDER + ';">' + (s.venue || "—") + '</td>' +
            '<td style="padding:11px 14px;font-size:12px;color:#6B7280;border-top:1px solid ' + C_GRAY_BORDER + ';">' + (s.facilitator || "—") + '</td>' +
          '</tr>' +
          (s.description ? '<tr><td colspan="5" style="padding:0 14px 10px;font-size:12px;color:#9CA3AF;border-top:none;">' + s.description + '</td></tr>' : '');
      });
    });
  } else {
    sessionsHtml =
      '<tr><td colspan="5" style="padding:16px 14px;font-size:13px;color:#9CA3AF;text-align:center;">Our HR team will share the detailed schedule closer to your joining date.</td></tr>';
  }

  var mentorBlock = c.mentorName
    ? '<div style="background:' + C_LIME_LIGHT + ';border:1px solid ' + C_LIME_DARK + ';border-radius:8px;padding:16px 18px;margin-bottom:24px;">' +
        '<p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:' + C_GRAY_DARK + ';">Your Mentor / Buddy</p>' +
        '<p style="margin:0;font-size:14px;color:' + C_GRAY_MID + ';">' + c.mentorName +
          (c.mentorEmail ? ' — <a href="mailto:' + c.mentorEmail + '" style="color:' + C_GRAY_DARK + ';">' + c.mentorEmail + '</a>' : '') +
        '</p>' +
        '<p style="margin:6px 0 0;font-size:12px;color:#6B7280;">Feel free to reach out to your mentor with any questions before your first day.</p>' +
      '</div>'
    : '';

  var joiningBlock = c.joiningDate
    ? '<p style="font-size:14px;color:' + C_GRAY_MID + ';line-height:1.8;margin:0 0 20px;">Your joining date is <strong>' + c.joiningDate + '</strong>. Please report to the HR team on arrival.</p>'
    : '<p style="font-size:14px;color:' + C_GRAY_MID + ';line-height:1.8;margin:0 0 20px;">Our HR team will confirm your joining date and reporting instructions shortly.</p>';

  const body =
    '<div style="font-family:Arial,sans-serif;max-width:700px;margin:auto;border:1px solid ' + C_GRAY_BORDER + ';border-radius:12px;overflow:hidden;">' +
      _emailHeader("Onboarding & Orientation Team") +
      '<div style="background:' + C_LIME + ';padding:14px 32px;text-align:center;">' +
        '<span style="color:' + C_BLACK + ';font-size:14px;font-weight:bold;letter-spacing:0.5px;">YOUR ORIENTATION SCHEDULE IS READY!</span>' +
      '</div>' +
      '<div style="padding:32px;background:' + C_WHITE + ';">' +
        '<p style="font-size:18px;color:' + C_GRAY_DARK + ';margin:0 0 10px;">Dear <strong>' + c.fullName + '</strong>,</p>' +
        '<p style="font-size:15px;color:' + C_GRAY_MID + ';line-height:1.8;margin:0 0 16px;">' +
          'Welcome to <strong>' + COMPANY_NAME + '</strong>! We are excited to have you join us as <strong>' + c.position + '</strong>. ' +
          'Your orientation programme is designed to help you settle in, understand our culture, and connect with your team.' +
        '</p>' +
        joiningBlock +
        mentorBlock +

        '<p style="font-weight:bold;font-size:15px;color:' + C_GRAY_DARK + ';margin:0 0 14px;">Your Orientation Schedule</p>' +
        '<div style="border:1px solid ' + C_GRAY_BORDER + ';border-radius:8px;overflow:hidden;margin-bottom:24px;">' +
          '<table style="width:100%;border-collapse:collapse;background:#fff;">' +
            '<thead>' +
              '<tr style="background:#F9FAFB;">' +
                '<th style="padding:10px 14px;font-size:11px;font-weight:600;color:#6B7280;text-align:left;text-transform:uppercase;letter-spacing:0.5px;">Session</th>' +
                '<th style="padding:10px 14px;font-size:11px;font-weight:600;color:#6B7280;text-align:left;text-transform:uppercase;letter-spacing:0.5px;">Time</th>' +
                '<th style="padding:10px 14px;font-size:11px;font-weight:600;color:#6B7280;text-align:left;text-transform:uppercase;letter-spacing:0.5px;">Mode</th>' +
                '<th style="padding:10px 14px;font-size:11px;font-weight:600;color:#6B7280;text-align:left;text-transform:uppercase;letter-spacing:0.5px;">Venue / Link</th>' +
                '<th style="padding:10px 14px;font-size:11px;font-weight:600;color:#6B7280;text-align:left;text-transform:uppercase;letter-spacing:0.5px;">Facilitator</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>' + sessionsHtml + '</tbody>' +
          '</table>' +
        '</div>' +

        '<div style="background:' + C_LIME_LIGHT + ';border-left:4px solid ' + C_LIME + ';border-radius:6px;padding:16px 18px;margin-bottom:24px;">' +
          '<p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:' + C_GRAY_DARK + ';">Before Your First Day — Checklist</p>' +
          '<ul style="margin:0;padding-left:18px;font-size:13px;color:' + C_GRAY_MID + ';line-height:2;">' +
            '<li>Read the welcome email and note your joining details</li>' +
            '<li>Keep your original documents ready for verification</li>' +
            '<li>Bring 2 passport-size photographs on Day 1</li>' +
            '<li>Reach out to your mentor if you have any questions</li>' +
          '</ul>' +
        '</div>' +

        '<p style="font-size:13px;color:' + C_GRAY_LIGHT + ';">Questions? Write to us at <a href="mailto:' + HR_EMAIL + '" style="color:' + C_GRAY_DARK + ';font-weight:600;">' + HR_EMAIL + '</a></p>' +
        '<p style="margin-top:24px;font-size:15px;color:' + C_GRAY_DARK + ';font-weight:bold;">We look forward to welcoming you on Day 1!</p>' +
        '<p style="font-size:14px;color:' + C_GRAY_MID + ';">Regards,<br><strong>' + COMPANY_NAME + ' — HR & Onboarding Team</strong></p>' +
      '</div>' +
      _emailFooter() +
    '</div>';

  _safeSendEmail(c.email, subject, body, COMPANY_NAME + " - Onboarding Team");
  console.log("Orientation invite sent: " + c.email);
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
      '<p style="color:' + C_LIME + ';font-size:14px;font-weight:bold;margin:0 0 4px;">' + COMPANY_NAME + '</p>' +
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
        '<span style="color:' + C_BLACK + ';font-size:14px;font-weight:bold;letter-spacing:0.5px;">RESUME SHORTLISTED — INTERVIEW CALL COMING SOON</span>' +
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
        _journeyStep(false, "4", "Interview Rounds",      "Technical and managerial rounds — online or in person.") +
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
    ? "ALL 3 ROUNDS CLEARED — FINAL DECISION COMING"
    : "ROUND " + c.roundNumber + " CLEARED — WELL DONE!";
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
      '<div style="background:' + C_GRAY_DARK + ';padding:13px 32px;text-align:center;"><span style="color:' + C_WHITE + ';font-size:13px;font-weight:bold;letter-spacing:0.5px;">INTERVIEW UPDATE — ROUND ' + c.roundNumber + '</span></div>' +
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
      '<div style="background:' + C_LIME + ';padding:14px 32px;text-align:center;"><span style="color:' + C_BLACK + ';font-size:14px;font-weight:bold;letter-spacing:0.5px;">CONGRATULATIONS — YOU HAVE BEEN SELECTED!</span></div>' +
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
  // Use _safeSendEmail base logic but need attachments support, so handle manually
  try {
    GmailApp.sendEmail(c.email, subject, "", Object.assign({}, options, { from: HR_EMAIL }));
    console.log("_sendOfferLetterEmail: sent via alias → " + c.email);
  } catch (aliasErr) {
    var errMsg = String(aliasErr).toLowerCase();
    var isAliasError = errMsg.indexOf("permission") !== -1 || errMsg.indexOf("alias") !== -1 ||
                       errMsg.indexOf("invalid") !== -1    || errMsg.indexOf("you do not") !== -1 ||
                       errMsg.indexOf("cannot send") !== -1;
    if (isAliasError) {
      console.warn("_sendOfferLetterEmail: alias blocked — falling back to owner email");
      GmailApp.sendEmail(c.email, subject, "", options);
      console.log("_sendOfferLetterEmail: sent via owner email → " + c.email);
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
  const subject = "Your Documents Are Verified — Welcome Aboard! | " + COMPANY_NAME;
  const joiningLine = c.joiningDate
    ? '<p style="margin:0;font-size:14px;color:' + C_GRAY_MID + ';line-height:1.8;">Your joining date is <strong>' + c.joiningDate + '</strong>. Our HR team will share further joining instructions closer to the date.</p>'
    : '<p style="margin:0;font-size:14px;color:' + C_GRAY_MID + ';line-height:1.8;">Our HR team will reach out shortly with your joining instructions and schedule.</p>';
  const body =
    '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid ' + C_GRAY_BORDER + ';border-radius:12px;overflow:hidden;">' +
      _emailHeader("Onboarding Team") +
      '<div style="background:' + C_LIME + ';padding:14px 32px;text-align:center;">' +
        '<span style="color:' + C_BLACK + ';font-size:14px;font-weight:bold;letter-spacing:0.5px;">DOCUMENTS VERIFIED — YOU ARE READY TO JOIN!</span>' +
      '</div>' +
      '<div style="padding:32px;background:' + C_WHITE + ';">' +
        '<p style="font-size:18px;color:' + C_GRAY_DARK + ';margin:0 0 10px;">Dear <strong>' + c.fullName + '</strong>,</p>' +
        '<p style="font-size:15px;color:' + C_GRAY_MID + ';line-height:1.8;margin:0 0 20px;">' +
          'Great news! We have <strong>successfully verified all your submitted documents</strong> for the position of ' +
          '<strong>' + c.position + '</strong> at <strong>' + COMPANY_NAME + '</strong>. ' +
          'Your onboarding process is now complete.' +
        '</p>' +
        '<div style="background:' + C_LIME_LIGHT + ';border-left:4px solid ' + C_LIME + ';border-radius:6px;padding:18px;margin-bottom:24px;">' +
          '<p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:' + C_GRAY_DARK + ';">What Happens Next</p>' +
          joiningLine +
        '</div>' +
        '<div style="background:#F9F9F9;border:1px solid ' + C_GRAY_BORDER + ';border-radius:8px;padding:20px;margin-bottom:24px;">' +
          '<p style="margin:0 0 14px;font-weight:bold;font-size:13px;color:' + C_GRAY_DARK + ';">Onboarding Checklist — Completed</p>' +
          '<div style="display:flex;align-items:center;margin-bottom:10px;"><div style="min-width:24px;height:24px;background:' + C_LIME + ';color:' + C_BLACK + ';border-radius:50%;text-align:center;line-height:24px;font-size:11px;font-weight:bold;margin-right:12px;flex-shrink:0;">V</div><span style="font-size:13px;color:' + C_GRAY_DARK + ';">Offer Letter Accepted</span></div>' +
          '<div style="display:flex;align-items:center;margin-bottom:10px;"><div style="min-width:24px;height:24px;background:' + C_LIME + ';color:' + C_BLACK + ';border-radius:50%;text-align:center;line-height:24px;font-size:11px;font-weight:bold;margin-right:12px;flex-shrink:0;">V</div><span style="font-size:13px;color:' + C_GRAY_DARK + ';">Documents Submitted</span></div>' +
          '<div style="display:flex;align-items:center;margin-bottom:10px;"><div style="min-width:24px;height:24px;background:' + C_LIME + ';color:' + C_BLACK + ';border-radius:50%;text-align:center;line-height:24px;font-size:11px;font-weight:bold;margin-right:12px;flex-shrink:0;">V</div><span style="font-size:13px;color:' + C_GRAY_DARK + ';">Documents Verified by HR</span></div>' +
          '<div style="display:flex;align-items:center;"><div style="min-width:24px;height:24px;background:' + C_BLACK + ';color:' + C_LIME + ';border-radius:50%;text-align:center;line-height:24px;font-size:13px;font-weight:bold;margin-right:12px;flex-shrink:0;">*</div><span style="font-size:13px;font-weight:bold;color:' + C_GRAY_DARK + ';">Ready to Join ' + COMPANY_NAME + '!</span></div>' +
        '</div>' +
        '<div style="background:' + C_LIME_LIGHT + ';border:1px solid ' + C_LIME_DARK + ';border-radius:6px;padding:14px 16px;margin-bottom:24px;">' +
          '<p style="margin:0;font-size:13px;color:' + C_GRAY_DARK + ';"><strong>Pre-joining queries?</strong> Reach out to us at <a href="mailto:' + HR_EMAIL + '" style="color:' + C_GRAY_DARK + ';font-weight:600;">' + HR_EMAIL + '</a></p>' +
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
        '<p style="margin:0;font-size:13px;font-weight:bold;color:' + C_GRAY_DARK + ';">' + title + ' — You are here</p>' +
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

function onFormSubmit(e) {
  try {
    if (!BACKEND_URL) {
      console.warn("onFormSubmit: BACKEND_URL not set — skipping webhook");
      return;
    }
    var itemResponses = e.response.getItemResponses();
    var payload = { secret: ONBOARDING_WEBHOOK_SECRET, documents: {}, submittedAt: new Date().toISOString() };
    itemResponses.forEach(function(ir) {
      var title = ir.getItem().getTitle();
      var value = ir.getResponse();
      if (Array.isArray(value)) {
        value = value.map(function(id) {
          return "https://drive.google.com/file/d/" + id + "/view?usp=sharing";
        }).join(", ");
      }
      var key = FORM_FIELD_MAP[title];
      if (!key) return;
      if (key === "candidateEmail" || key === "candidateName" || key === "position") {
        payload[key] = String(value || "").trim();
      } else {
        payload.documents[key] = String(value || "").trim();
      }
    });
    if (!payload.candidateEmail) {
      console.error("onFormSubmit: no candidateEmail — aborting");
      return;
    }
    var webhookUrl = BACKEND_URL.replace(/\/$/, "") + "/api/hr/onboarding/webhook";
    var response = UrlFetchApp.fetch(webhookUrl, {
      method: "post", contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true, followRedirects: true
    });
    console.log("onFormSubmit webhook →", payload.candidateEmail, "| HTTP", response.getResponseCode());
  } catch (err) {
    console.error("onFormSubmit error: " + err);
  }
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
//  2. Run testEmailDiagnostic() — verify email works before deploying
//  3. Deploy > Manage Deployments > Edit > New version > Deploy
//     Execute as: Me  |  Who can access: Anyone
//  4. Copy the /exec URL → update GAS_WEBAPP_URL env var in Railway
//  5. Add triggers:
//     - onShortlistEdit → From spreadsheet → On edit
//     - onFormSubmit    → From form        → On form submit
// ════════════════════════════════════════════════════════════
