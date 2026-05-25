// ============================================================
//  Google Apps Script — Zyntrix Software Solution
//  Handles:
//    1. Job application form submissions (stores to Sheet + Drive + email)
//    2. HRMS "Resume Shortlist" button (marks col N + emails candidate)
// ============================================================

// ── CONFIG ──────────────────────────────────────────────────
const SHEET_ID        = "11aTN-lg6PWMGlB5OzNCoWtGIuqcjbh0Ctffg7Z0d8vs";
const SHEET_NAME      = "Sheet1";
const RESUME_FOLDER   = "Zyntrix_Resumes";   // Drive folder for uploaded PDFs

const COMPANY_NAME    = "Zyntrix Software Solution";
const HR_EMAIL        = "hr@zyntrixsoftware.com";
const WEBSITE_URL     = "https://zyntrixsoftware.com";
const LINKEDIN_URL    = "https://www.linkedin.com/company/zyntrix-software-solutions-pvt-ltd";
const YOUTUBE_URL     = "https://www.youtube.com/@zyntrixsoftware";
const INSTAGRAM_URL   = "https://www.instagram.com/zyntrixsoftware";

// Column indices — 0-based (row array positions)
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
  RESUME_SHORTLISTED : 13,  // N  ← HR marks this TRUE
  INTERVIEW_STATUS   : 14,  // O
  OFFERED            : 15,  // P
  HR_NAME            : 16,  // Q
  EMAIL_SENT_FLAG    : 17,  // R  ← duplicate-send guard
};

const TOTAL_COLS = 18;

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

    // HRMS shortlist button → update col N + email candidate
    if (data.action === "updateCandidate")       return _handleShortlist(data);

    // HRMS Interview Panel round result emails
    if (data.action === "sendRoundQualified")    return _handleRoundQualified(data);
    if (data.action === "sendRoundNotQualified") return _handleRoundNotQualified(data);
    if (data.action === "sendOffered")           return _handleOffered(data);

    // Default → new job application from the public form
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

  // Upload resume PDF to Drive if provided
  let cvLink = String(data.cv || "").trim();
  if (!cvLink && data.resumeBase64 && data.resumeName) {
    cvLink = _uploadResume(data.resumeBase64, data.resumeName);
  }

  const sheet = _getSheet();

  // Build the row — 18 columns
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
  row[COL.RESUME_SHORTLISTED] = "";   // blank — HR fills this later
  row[COL.INTERVIEW_STATUS]   = "";   // blank — set after interviews
  row[COL.OFFERED]            = "";
  row[COL.HR_NAME]            = "";
  row[COL.EMAIL_SENT_FLAG]    = "";

  sheet.appendRow(row);
  SpreadsheetApp.flush();

  // Send "Application Received" confirmation to the candidate
  try {
    _sendApplicationConfirmation({ fullName, email, position });
  } catch (mailErr) {
    console.error("Confirmation email failed: " + mailErr);
  }

  console.log("✅ Application stored → " + email + " | " + position);
  return _jsonOut({ status: "success", ok: true });
}

// ════════════════════════════════════════════════════════════
//  HANDLER 2 — HRMS shortlist update
//  Called by the Node.js backend when HR clicks "Resume Shortlist"
//  Payload: { action:"updateCandidate", email, shortlisted:true,
//             fullName, position, phone }
// ════════════════════════════════════════════════════════════
function _handleShortlist(data) {
  const email = String(data.email || "").trim().toLowerCase();
  if (!email) return _jsonOut({ ok: false, error: "email is required" });

  const sheet  = _getSheet();
  const values = sheet.getDataRange().getValues();

  // Find candidate row by email (col D = index 3).
  // We scan ALL rows and keep the LAST match so the most recent
  // application is updated, not an older duplicate row.
  let rowIndex = -1;
  for (let r = 1; r < values.length; r++) {
    const rowEmail = String(values[r][COL.EMAIL] || "").trim().toLowerCase();
    if (rowEmail === email) {
      rowIndex = r; // keep overwriting → lands on the last (newest) match
    }
  }

  // Candidate not in sheet → append a minimal row first
  if (rowIndex === -1) {
    const newRow = new Array(TOTAL_COLS).fill("");
    newRow[COL.TIMESTAMP]  = new Date();
    newRow[COL.POSITION]   = String(data.position || "").trim();
    newRow[COL.FULL_NAME]  = String(data.fullName || "").trim();
    newRow[COL.EMAIL]      = email;
    newRow[COL.PHONE]      = String(data.phone    || "").trim();
    sheet.appendRow(newRow);
    SpreadsheetApp.flush();
    rowIndex = sheet.getLastRow() - 1; // 0-based
  }

  const sheetRow = rowIndex + 1; // 1-based sheet row

  // Mark col N (Resume Shortlisted) = TRUE
  sheet.getRange(sheetRow, COL.RESUME_SHORTLISTED + 1).setValue(true);
  SpreadsheetApp.flush();

  // Read fresh row data for email
  const row = sheet.getRange(sheetRow, 1, 1, TOTAL_COLS).getValues()[0];

  const candidate = {
    fullName : String(row[COL.FULL_NAME] || data.fullName || "").trim(),
    email    : email,
    position : String(row[COL.POSITION]  || data.position || "").trim(),
    phone    : String(row[COL.PHONE]     || data.phone    || "").trim(),
  };

  // Send email only once (duplicate-send guard on col R)
  const alreadySent = String(row[COL.EMAIL_SENT_FLAG] || "").trim().toLowerCase();
  let emailed = false;

  if (candidate.email && !alreadySent.startsWith("sent")) {
    try {
      _sendShortlistEmail(candidate);
      sheet.getRange(sheetRow, COL.EMAIL_SENT_FLAG + 1)
           .setValue("Sent – " + new Date().toLocaleString("en-IN"));
      SpreadsheetApp.flush();
      emailed = true;
      console.log("✅ Shortlist email sent → " + candidate.email + " (row " + sheetRow + ")");
    } catch (mailErr) {
      console.error("Shortlist email failed: " + mailErr);
    }
  }

  return _jsonOut({ ok: true, row: sheetRow, emailed: emailed });
}

// ════════════════════════════════════════════════════════════
//  EMAIL 1 — Application Received
// ════════════════════════════════════════════════════════════
function _sendApplicationConfirmation(c) {
  const subject = "Application Received – " + c.position + " | " + COMPANY_NAME;

  const body =
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">' +

      '<div style="background:linear-gradient(135deg,#064E3B 0%,#059669 100%);padding:28px 32px;text-align:center;">' +
        '<h2 style="color:#fff;margin:0;font-size:22px;">' + COMPANY_NAME + '</h2>' +
        '<p style="color:#6EE7B7;margin:6px 0 0;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Talent Acquisition Team</p>' +
      '</div>' +

      '<div style="background:#F0FDF4;border-bottom:1px solid #BBF7D0;padding:12px 32px;text-align:center;">' +
        '<span style="background:#059669;color:#fff;padding:5px 20px;border-radius:20px;font-size:13px;font-weight:bold;">✅ Application Received</span>' +
      '</div>' +

      '<div style="padding:28px 32px;background:#fff;">' +
        '<p style="font-size:17px;color:#111827;margin:0 0 8px;">Dear <strong>' + c.fullName + '</strong>,</p>' +
        '<p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 20px;">' +
          'Thank you for applying to <strong>' + COMPANY_NAME + '</strong> for the position of ' +
          '<strong>' + c.position + '</strong>. We have received your application and our Talent Acquisition ' +
          'team will review your profile shortly.' +
        '</p>' +
        '<div style="background:#ECFDF5;border-left:4px solid #059669;border-radius:8px;padding:16px 18px;margin-bottom:20px;">' +
          '<p style="margin:0;font-size:14px;color:#065F46;line-height:1.6;">' +
            '⏱ If your profile matches our requirements, we will reach out within <strong>5–7 working days</strong> ' +
            'to schedule the next steps. Please keep your phone reachable.' +
          '</p>' +
        '</div>' +
        '<p style="font-size:13px;color:#6B7280;">For queries, contact us at ' +
          '<a href="mailto:' + HR_EMAIL + '" style="color:#059669;">' + HR_EMAIL + '</a></p>' +
        '<p style="margin-top:20px;font-size:14px;color:#374151;">Warm regards,<br>' +
          '<strong>' + COMPANY_NAME + ' — HR Team</strong></p>' +
      '</div>' +

      _emailFooter() +
    '</div>';

  GmailApp.sendEmail(c.email, subject, "", {
    htmlBody: body,
    replyTo : HR_EMAIL,
    name    : COMPANY_NAME + " – Talent Acquisition",
  });
}

// ════════════════════════════════════════════════════════════
//  EMAIL 2 — Resume Shortlisted
// ════════════════════════════════════════════════════════════
function _sendShortlistEmail(c) {
  const subject = "🎉 Your Resume Has Been Shortlisted! – " + c.position + " | " + COMPANY_NAME;

  const body =
    '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">' +

      '<div style="background:linear-gradient(135deg,#064E3B 0%,#065F46 60%,#059669 100%);padding:32px;text-align:center;">' +
        '<h1 style="color:#fff;margin:0;font-size:24px;">' + COMPANY_NAME + '</h1>' +
        '<p style="color:#6EE7B7;margin:6px 0 0;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Talent Acquisition Team</p>' +
      '</div>' +

      '<div style="background:#F0FDF4;border-bottom:1px solid #BBF7D0;padding:14px 32px;text-align:center;">' +
        '<span style="background:#059669;color:#fff;padding:6px 22px;border-radius:20px;font-size:14px;font-weight:bold;">' +
          '⭐ Resume Shortlisted — Interview Call Coming Soon!' +
        '</span>' +
      '</div>' +

      '<div style="padding:32px;background:#fff;">' +

        '<p style="font-size:18px;color:#111827;margin:0 0 6px;">Dear <strong>' + c.fullName + '</strong>,</p>' +
        '<p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 20px;">' +
          'We are excited to inform you that your resume has been <strong style="color:#059669;">shortlisted</strong> ' +
          'for the <strong>' + c.position + '</strong> role at <strong>' + COMPANY_NAME + '</strong>. ' +
          'Congratulations — you have cleared the first stage of our selection process!' +
        '</p>' +

        '<div style="background:#ECFDF5;border-left:4px solid #059669;border-radius:8px;padding:18px;margin-bottom:24px;">' +
          '<p style="margin:0 0 6px;font-size:15px;font-weight:bold;color:#065F46;">📞 What Happens Next?</p>' +
          '<p style="margin:0;font-size:14px;color:#065F46;line-height:1.7;">' +
            'Our HR team will reach out to you <strong>shortly</strong> to schedule your interview call. ' +
            'Please keep your phone reachable and check your inbox regularly.' +
          '</p>' +
        '</div>' +

        '<div style="background:#F0FDF4;border:1px solid #A7F3D0;border-radius:8px;padding:16px;margin-bottom:24px;">' +
          '<p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:#065F46;">🎯 How to Prepare</p>' +
          '<p style="margin:0;font-size:13px;color:#374151;line-height:1.7;">' +
            'Review the role requirements, research <strong>' + COMPANY_NAME + '</strong>, ' +
            'and brush up on your technical skills. <strong>Best of Luck! 🍀</strong>' +
          '</p>' +
        '</div>' +

        // Journey steps
        '<p style="font-weight:bold;font-size:15px;color:#111827;margin:0 0 12px;">📅 Your Selection Journey</p>' +

        _step(true,  "✓", "#059669", "#fff",    "Application Received",   "Your application was successfully submitted.") +
        _stepHighlight("✓", "🎉 Resume Shortlisted — You are here!", "Your profile has been approved by our recruiter.") +
        _step(false, "3", "#D1FAE5", "#059669", "HR Screening Call",       "Our HR will call to schedule your interview.") +
        _step(false, "4", "#F3F4F6", "#9CA3AF", "Interview Round",         "Technical / Managerial round — online or in person.") +
        _step(false, "5", "#F3F4F6", "#9CA3AF", "Final Decision & Offer",  "Selected candidates receive a formal offer letter.") +

        '<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:12px 16px;margin:20px 0;">' +
          '<p style="margin:0;font-size:13px;color:#92400E;">' +
            '🔔 <strong>Tip:</strong> Keep your phone reachable and check your email regularly.' +
          '</p>' +
        '</div>' +

        // Summary
        '<div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:18px;margin-bottom:20px;">' +
          '<p style="margin:0 0 10px;font-weight:bold;font-size:14px;color:#111827;">Application Summary</p>' +
          '<table style="width:100%;font-size:13px;border-collapse:collapse;">' +
            '<tr style="border-bottom:1px solid #F3F4F6;"><td style="padding:7px 0;color:#6B7280;width:110px;">Name</td><td style="padding:7px 0;color:#111827;font-weight:600;">' + c.fullName + '</td></tr>' +
            '<tr style="border-bottom:1px solid #F3F4F6;"><td style="padding:7px 0;color:#6B7280;">Position</td><td style="padding:7px 0;color:#111827;font-weight:600;">' + c.position + '</td></tr>' +
            '<tr style="border-bottom:1px solid #F3F4F6;"><td style="padding:7px 0;color:#6B7280;">Email</td><td style="padding:7px 0;color:#111827;">' + c.email + '</td></tr>' +
            '<tr><td style="padding:7px 0;color:#6B7280;">Phone</td><td style="padding:7px 0;color:#111827;">' + (c.phone || "Not provided") + '</td></tr>' +
          '</table>' +
        '</div>' +

        '<p style="font-size:13px;color:#6B7280;">For queries: <a href="mailto:' + HR_EMAIL + '" style="color:#059669;font-weight:600;">' + HR_EMAIL + '</a></p>' +
        '<p style="margin-top:20px;font-size:14px;color:#374151;">Warm regards,<br><strong>' + COMPANY_NAME + ' — HR &amp; Talent Acquisition Team</strong></p>' +

      '</div>' +
      _emailFooter() +
    '</div>';

  GmailApp.sendEmail(c.email, subject, "", {
    htmlBody: body,
    replyTo : HR_EMAIL,
    name    : COMPANY_NAME + " – Talent Acquisition",
  });
}

// ════════════════════════════════════════════════════════════
//  HANDLER 3 — Round Qualified
//  Payload: { action:"sendRoundQualified", email, fullName,
//              position, roundNumber }
// ════════════════════════════════════════════════════════════
function _handleRoundQualified(data) {
  const email = String(data.email || "").trim().toLowerCase();
  if (!email) return _jsonOut({ ok: false, error: "email required" });
  try {
    _sendRoundQualifiedEmail({
      email,
      fullName   : String(data.fullName    || "Candidate").trim(),
      position   : String(data.position   || "the role").trim(),
      roundNumber: Number(data.roundNumber || 1)
    });
  } catch (err) {
    console.error("_handleRoundQualified error: " + err);
  }
  return _jsonOut({ ok: true });
}

// ════════════════════════════════════════════════════════════
//  HANDLER 4 — Round Not Qualified
//  Payload: { action:"sendRoundNotQualified", email, fullName,
//              position, roundNumber }
// ════════════════════════════════════════════════════════════
function _handleRoundNotQualified(data) {
  const email = String(data.email || "").trim().toLowerCase();
  if (!email) return _jsonOut({ ok: false, error: "email required" });
  try {
    _sendRoundNotQualifiedEmail({
      email,
      fullName   : String(data.fullName    || "Candidate").trim(),
      position   : String(data.position   || "the role").trim(),
      roundNumber: Number(data.roundNumber || 1)
    });
  } catch (err) {
    console.error("_handleRoundNotQualified error: " + err);
  }
  return _jsonOut({ ok: true });
}

// ════════════════════════════════════════════════════════════
//  HANDLER 5 — Offered
//  Payload: { action:"sendOffered", email, fullName, position }
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
  } catch (err) {
    console.error("_handleOffered error: " + err);
  }
  return _jsonOut({ ok: true });
}

// ════════════════════════════════════════════════════════════
//  EMAIL 3 — Round Qualified
// ════════════════════════════════════════════════════════════
function _sendRoundQualifiedEmail(c) {
  const isFinal   = c.roundNumber >= 3;
  const nextRound = c.roundNumber + 1;

  const subject = isFinal
    ? "🏆 All 3 Rounds Cleared! — " + c.position + " | " + COMPANY_NAME
    : "✅ Round " + c.roundNumber + " Cleared — " + c.position + " | " + COMPANY_NAME;

  // Journey steps: mark rounds 1..roundNumber as done, next as upcoming
  function roundStep(num) {
    const done = num <= c.roundNumber;
    const next = !isFinal && num === nextRound;
    const bg   = done ? "#059669" : next ? "#F59E0B" : "#E5E7EB";
    const txt  = done ? "#fff"    : next ? "#fff"    : "#9CA3AF";
    const icon = done ? "✓"       : next ? "→"       : String(num);
    const label = "Round " + num + " Interview";
    const sub   = done ? "Cleared ✓" : next ? "Up next — stay prepared!" : "Pending";
    const subCol = done ? "#059669"   : next ? "#D97706"                 : "#9CA3AF";
    return (
      '<div style="display:flex;align-items:center;margin-bottom:12px;">' +
        '<div style="min-width:36px;height:36px;background:' + bg + ';color:' + txt + ';border-radius:50%;' +
             'text-align:center;line-height:36px;font-size:14px;font-weight:bold;margin-right:14px;flex-shrink:0;">' + icon + '</div>' +
        '<div>' +
          '<p style="margin:0;font-size:13px;font-weight:600;color:#111827;">' + label + '</p>' +
          '<p style="margin:2px 0 0;font-size:12px;color:' + subCol + ';">' + sub + '</p>' +
        '</div>' +
      '</div>'
    );
  }

  const nextBlock = isFinal
    ? '<div style="background:#ECFDF5;border-left:4px solid #059669;border-radius:8px;padding:16px 18px;margin:20px 0;">' +
        '<p style="margin:0;font-size:15px;font-weight:bold;color:#065F46;">🎉 What Happens Next?</p>' +
        '<p style="margin:8px 0 0;font-size:14px;color:#065F46;line-height:1.7;">' +
          'You have successfully cleared <strong>ALL 3 rounds</strong>. Our HR team will review the results and ' +
          'reach out shortly with the <strong>final decision and offer details</strong>. ' +
          'Please keep your phone reachable.' +
        '</p>' +
      '</div>'
    : '<div style="background:#FFFBEB;border-left:4px solid #F59E0B;border-radius:8px;padding:16px 18px;margin:20px 0;">' +
        '<p style="margin:0;font-size:15px;font-weight:bold;color:#92400E;">📞 What Happens Next?</p>' +
        '<p style="margin:8px 0 0;font-size:14px;color:#92400E;line-height:1.7;">' +
          'Our HR team will contact you shortly to schedule <strong>Round ' + nextRound + '</strong>. ' +
          'Please keep your phone reachable and prepare well. <strong>Best of Luck! 🍀</strong>' +
        '</p>' +
      '</div>';

  const badgeBg  = isFinal ? "#065F46" : "#059669";
  const badgeTxt = isFinal ? "🏆 All 3 Rounds Cleared!" : "✅ Round " + c.roundNumber + " — Cleared!";

  const body =
    '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">' +

      '<div style="background:linear-gradient(135deg,#064E3B 0%,#065F46 60%,#059669 100%);padding:32px;text-align:center;">' +
        '<h1 style="color:#fff;margin:0;font-size:24px;">' + COMPANY_NAME + '</h1>' +
        '<p style="color:#6EE7B7;margin:6px 0 0;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Interview Panel</p>' +
      '</div>' +

      '<div style="background:#F0FDF4;border-bottom:1px solid #BBF7D0;padding:14px 32px;text-align:center;">' +
        '<span style="background:' + badgeBg + ';color:#fff;padding:7px 24px;border-radius:20px;font-size:14px;font-weight:bold;">' + badgeTxt + '</span>' +
      '</div>' +

      '<div style="padding:32px;background:#fff;">' +
        '<p style="font-size:18px;color:#111827;margin:0 0 10px;">Dear <strong>' + c.fullName + '</strong>,</p>' +
        '<p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 20px;">' +
          'Excellent work! We are pleased to inform you that you have <strong style="color:#059669;">successfully cleared Round ' + c.roundNumber + '</strong> ' +
          'of your interview process for the <strong>' + c.position + '</strong> role at <strong>' + COMPANY_NAME + '</strong>.' +
        '</p>' +

        nextBlock +

        '<p style="font-weight:bold;font-size:15px;color:#111827;margin:24px 0 12px;">📅 Your Interview Journey</p>' +
        roundStep(1) + roundStep(2) + roundStep(3) +

        '<div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:16px;margin:20px 0;">' +
          '<p style="margin:0 0 8px;font-weight:bold;font-size:13px;color:#111827;">📋 Interview Details</p>' +
          '<table style="width:100%;font-size:13px;border-collapse:collapse;">' +
            '<tr style="border-bottom:1px solid #F3F4F6;"><td style="padding:7px 0;color:#6B7280;width:110px;">Name</td><td style="padding:7px 0;color:#111827;font-weight:600;">' + c.fullName + '</td></tr>' +
            '<tr style="border-bottom:1px solid #F3F4F6;"><td style="padding:7px 0;color:#6B7280;">Position</td><td style="padding:7px 0;color:#111827;font-weight:600;">' + c.position + '</td></tr>' +
            '<tr><td style="padding:7px 0;color:#6B7280;">Round</td><td style="padding:7px 0;color:#059669;font-weight:600;">Round ' + c.roundNumber + ' — Cleared ✅</td></tr>' +
          '</table>' +
        '</div>' +

        '<p style="font-size:13px;color:#6B7280;">Questions? <a href="mailto:' + HR_EMAIL + '" style="color:#059669;">' + HR_EMAIL + '</a></p>' +
        '<p style="margin-top:20px;font-size:14px;color:#374151;">Warm regards,<br><strong>' + COMPANY_NAME + ' — HR &amp; Talent Acquisition Team</strong></p>' +
      '</div>' +
      _emailFooter() +
    '</div>';

  GmailApp.sendEmail(c.email, subject, "", {
    htmlBody: body,
    replyTo : HR_EMAIL,
    name    : COMPANY_NAME + " – Talent Acquisition",
  });
  console.log("✅ Round qualified email sent → " + c.email + " Round " + c.roundNumber);
}

// ════════════════════════════════════════════════════════════
//  EMAIL 4 — Round Not Qualified
// ════════════════════════════════════════════════════════════
function _sendRoundNotQualifiedEmail(c) {
  const subject = "Update on Your Interview — " + c.position + " | " + COMPANY_NAME;

  const body =
    '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">' +

      '<div style="background:linear-gradient(135deg,#1E293B 0%,#334155 100%);padding:32px;text-align:center;">' +
        '<h1 style="color:#fff;margin:0;font-size:24px;">' + COMPANY_NAME + '</h1>' +
        '<p style="color:#94A3B8;margin:6px 0 0;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Interview Panel</p>' +
      '</div>' +

      '<div style="background:#F8FAFC;border-bottom:1px solid #E2E8F0;padding:14px 32px;text-align:center;">' +
        '<span style="background:#475569;color:#fff;padding:7px 24px;border-radius:20px;font-size:14px;font-weight:bold;">📋 Interview Update</span>' +
      '</div>' +

      '<div style="padding:32px;background:#fff;">' +
        '<p style="font-size:18px;color:#111827;margin:0 0 10px;">Dear <strong>' + c.fullName + '</strong>,</p>' +
        '<p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 20px;">' +
          'Thank you for taking the time to participate in <strong>Round ' + c.roundNumber + '</strong> of our interview ' +
          'process for the <strong>' + c.position + '</strong> role at <strong>' + COMPANY_NAME + '</strong>.' +
        '</p>' +

        '<div style="background:#F8FAFC;border-left:4px solid #94A3B8;border-radius:8px;padding:18px;margin-bottom:24px;">' +
          '<p style="margin:0;font-size:14px;color:#374151;line-height:1.8;">' +
            'After careful evaluation, we regret to inform you that we have decided to <strong>move forward with other candidates</strong> ' +
            'for this particular role at this time. This was a difficult decision given the calibre of applicants we received.' +
          '</p>' +
        '</div>' +

        '<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:16px;margin-bottom:24px;">' +
          '<p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:#065F46;">💼 Keep Going — Your Career Journey Continues</p>' +
          '<p style="margin:0;font-size:13px;color:#374151;line-height:1.7;">' +
            'We genuinely appreciate the time and effort you invested throughout this process. ' +
            '<strong>We will keep your profile on file</strong> for future opportunities that align with your experience and skills. ' +
            'Do not hesitate to apply again for roles that interest you.' +
          '</p>' +
        '</div>' +

        '<div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:16px;margin:20px 0;">' +
          '<p style="margin:0 0 8px;font-weight:bold;font-size:13px;color:#111827;">📋 Interview Summary</p>' +
          '<table style="width:100%;font-size:13px;border-collapse:collapse;">' +
            '<tr style="border-bottom:1px solid #F3F4F6;"><td style="padding:7px 0;color:#6B7280;width:110px;">Name</td><td style="padding:7px 0;color:#111827;font-weight:600;">' + c.fullName + '</td></tr>' +
            '<tr style="border-bottom:1px solid #F3F4F6;"><td style="padding:7px 0;color:#6B7280;">Position</td><td style="padding:7px 0;color:#111827;font-weight:600;">' + c.position + '</td></tr>' +
            '<tr><td style="padding:7px 0;color:#6B7280;">Round</td><td style="padding:7px 0;color:#6B7280;">Round ' + c.roundNumber + '</td></tr>' +
          '</table>' +
        '</div>' +

        '<p style="font-size:13px;color:#6B7280;">Questions? <a href="mailto:' + HR_EMAIL + '" style="color:#059669;">' + HR_EMAIL + '</a></p>' +
        '<p style="margin-top:20px;font-size:14px;color:#374151;">We wish you the very best in your career journey.<br><br>' +
          'Warm regards,<br><strong>' + COMPANY_NAME + ' — HR &amp; Talent Acquisition Team</strong></p>' +
      '</div>' +
      _emailFooter() +
    '</div>';

  GmailApp.sendEmail(c.email, subject, "", {
    htmlBody: body,
    replyTo : HR_EMAIL,
    name    : COMPANY_NAME + " – Talent Acquisition",
  });
  console.log("✅ Round not-qualified email sent → " + c.email + " Round " + c.roundNumber);
}

// ════════════════════════════════════════════════════════════
//  EMAIL 5 — Offered (all rounds cleared, offer coming)
// ════════════════════════════════════════════════════════════
function _sendOfferedEmail(c) {
  const subject = "🎊 Congratulations! You've Been Selected — " + c.position + " | " + COMPANY_NAME;

  const body =
    '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">' +

      '<div style="background:linear-gradient(135deg,#064E3B 0%,#065F46 50%,#047857 100%);padding:36px 32px;text-align:center;">' +
        '<div style="font-size:40px;margin-bottom:10px;">🎊</div>' +
        '<h1 style="color:#fff;margin:0;font-size:26px;">' + COMPANY_NAME + '</h1>' +
        '<p style="color:#6EE7B7;margin:6px 0 0;font-size:12px;letter-spacing:2px;text-transform:uppercase;">You&rsquo;re Selected!</p>' +
      '</div>' +

      '<div style="background:#F0FDF4;border-bottom:1px solid #BBF7D0;padding:14px 32px;text-align:center;">' +
        '<span style="background:#059669;color:#fff;padding:8px 28px;border-radius:20px;font-size:15px;font-weight:bold;">' +
          '🎉 Congratulations — Offer Letter Coming Soon!' +
        '</span>' +
      '</div>' +

      '<div style="padding:32px;background:#fff;">' +
        '<p style="font-size:18px;color:#111827;margin:0 0 10px;">Dear <strong>' + c.fullName + '</strong>,</p>' +
        '<p style="font-size:15px;color:#374151;line-height:1.8;margin:0 0 20px;">' +
          'We are absolutely <strong style="color:#059669;">thrilled</strong> to inform you that you have been <strong>SELECTED</strong> ' +
          'for the position of <strong>' + c.position + '</strong> at <strong>' + COMPANY_NAME + '</strong>! 🎉' +
        '</p>' +
        '<p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 20px;">' +
          'You have demonstrated exceptional skill and commitment throughout our rigorous interview process, ' +
          'and we are confident you will be a tremendous addition to our team.' +
        '</p>' +

        '<div style="background:#ECFDF5;border-left:4px solid #059669;border-radius:8px;padding:18px;margin-bottom:24px;">' +
          '<p style="margin:0 0 6px;font-size:15px;font-weight:bold;color:#065F46;">📄 What Happens Next?</p>' +
          '<p style="margin:0;font-size:14px;color:#065F46;line-height:1.8;">' +
            'Our HR team will send you a <strong>formal Offer Letter (PDF)</strong> within the next <strong>1–2 working days</strong>. ' +
            'It will contain all the details regarding your compensation, joining date, and employment terms.' +
          '</p>' +
        '</div>' +

        '<p style="font-weight:bold;font-size:15px;color:#111827;margin:24px 0 12px;">🏆 Your Interview Journey — Completed!</p>' +

        '<div style="display:flex;align-items:center;margin-bottom:12px;">' +
          '<div style="min-width:36px;height:36px;background:#059669;color:#fff;border-radius:50%;text-align:center;line-height:36px;font-size:14px;font-weight:bold;margin-right:14px;">✓</div>' +
          '<div><p style="margin:0;font-size:13px;font-weight:600;color:#111827;">Round 1 Interview</p><p style="margin:2px 0 0;font-size:12px;color:#059669;">Cleared ✓</p></div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;margin-bottom:12px;">' +
          '<div style="min-width:36px;height:36px;background:#059669;color:#fff;border-radius:50%;text-align:center;line-height:36px;font-size:14px;font-weight:bold;margin-right:14px;">✓</div>' +
          '<div><p style="margin:0;font-size:13px;font-weight:600;color:#111827;">Round 2 Interview</p><p style="margin:2px 0 0;font-size:12px;color:#059669;">Cleared ✓</p></div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;margin-bottom:12px;">' +
          '<div style="min-width:36px;height:36px;background:#059669;color:#fff;border-radius:50%;text-align:center;line-height:36px;font-size:14px;font-weight:bold;margin-right:14px;">✓</div>' +
          '<div><p style="margin:0;font-size:13px;font-weight:600;color:#111827;">Round 3 Interview</p><p style="margin:2px 0 0;font-size:12px;color:#059669;">Cleared ✓</p></div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;margin-bottom:12px;">' +
          '<div style="min-width:36px;height:36px;background:#F59E0B;color:#fff;border-radius:50%;text-align:center;line-height:36px;font-size:14px;font-weight:bold;margin-right:14px;">★</div>' +
          '<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:10px 14px;">' +
            '<p style="margin:0;font-size:13px;font-weight:bold;color:#92400E;">🎉 Selected — Offer Letter on its way!</p>' +
            '<p style="margin:4px 0 0;font-size:12px;color:#374151;">HR team will reach out within 1–2 working days.</p>' +
          '</div>' +
        '</div>' +

        '<div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:16px;margin:20px 0;">' +
          '<p style="margin:0 0 8px;font-weight:bold;font-size:13px;color:#111827;">📋 Offer Summary</p>' +
          '<table style="width:100%;font-size:13px;border-collapse:collapse;">' +
            '<tr style="border-bottom:1px solid #F3F4F6;"><td style="padding:7px 0;color:#6B7280;width:110px;">Name</td><td style="padding:7px 0;color:#111827;font-weight:600;">' + c.fullName + '</td></tr>' +
            '<tr style="border-bottom:1px solid #F3F4F6;"><td style="padding:7px 0;color:#6B7280;">Position</td><td style="padding:7px 0;color:#111827;font-weight:600;">' + c.position + '</td></tr>' +
            '<tr><td style="padding:7px 0;color:#6B7280;">Status</td><td style="padding:7px 0;color:#059669;font-weight:600;">Selected 🎉</td></tr>' +
          '</table>' +
        '</div>' +

        '<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:12px 16px;margin:20px 0;">' +
          '<p style="margin:0;font-size:13px;color:#92400E;">' +
            '📞 <strong>Keep your phone reachable</strong> and watch your inbox — your formal offer letter is coming very soon!' +
          '</p>' +
        '</div>' +

        '<p style="font-size:13px;color:#6B7280;">Questions? <a href="mailto:' + HR_EMAIL + '" style="color:#059669;font-weight:600;">' + HR_EMAIL + '</a></p>' +
        '<p style="margin-top:20px;font-size:15px;color:#374151;font-weight:bold;">Welcome to the ' + COMPANY_NAME + ' family! 🚀</p>' +
        '<p style="font-size:14px;color:#374151;">Warm regards,<br><strong>' + COMPANY_NAME + ' — HR &amp; Talent Acquisition Team</strong></p>' +
      '</div>' +
      _emailFooter() +
    '</div>';

  GmailApp.sendEmail(c.email, subject, "", {
    htmlBody: body,
    replyTo : HR_EMAIL,
    name    : COMPANY_NAME + " – Talent Acquisition",
  });
  console.log("✅ Offered email sent → " + c.email);
}

// ════════════════════════════════════════════════════════════
//  EMAIL HELPERS
// ════════════════════════════════════════════════════════════
function _step(done, num, bgColor, textColor, title, subtitle) {
  return (
    '<div style="display:flex;align-items:flex-start;margin-bottom:10px;">' +
      '<div style="min-width:32px;height:32px;background:' + bgColor + ';color:' + textColor + ';border-radius:50%;' +
           'text-align:center;line-height:32px;font-size:13px;font-weight:bold;margin-right:14px;flex-shrink:0;' +
           (done ? '' : 'border:2px solid #059669;') + '">' + num + '</div>' +
      '<div style="padding-top:6px;">' +
        '<p style="margin:0;font-size:13px;font-weight:bold;color:' + (done ? '#059669' : '#374151') + ';">' + title + '</p>' +
        '<p style="margin:2px 0 0;font-size:12px;color:#6B7280;">' + subtitle + '</p>' +
      '</div>' +
    '</div>'
  );
}

function _stepHighlight(num, title, subtitle) {
  return (
    '<div style="display:flex;align-items:flex-start;margin-bottom:10px;">' +
      '<div style="min-width:32px;height:32px;background:#059669;color:#fff;border-radius:50%;' +
           'text-align:center;line-height:32px;font-size:13px;font-weight:bold;margin-right:14px;flex-shrink:0;">' + num + '</div>' +
      '<div style="background:#F0FDF4;border:1px solid #A7F3D0;border-radius:8px;padding:10px 14px;">' +
        '<p style="margin:0;font-size:13px;font-weight:bold;color:#065F46;">' + title + '</p>' +
        '<p style="margin:4px 0 0;font-size:12px;color:#374151;">' + subtitle + '</p>' +
      '</div>' +
    '</div>'
  );
}

function _emailFooter() {
  return (
    '<div style="background:#111827;padding:24px 32px;text-align:center;">' +
      '<p style="color:#F9FAFB;font-size:14px;font-weight:bold;margin:0 0 4px;">' + COMPANY_NAME + '</p>' +
      '<a href="' + WEBSITE_URL + '" style="color:#6EE7B7;font-size:12px;text-decoration:none;">' + WEBSITE_URL + '</a>' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px auto 10px;border-collapse:collapse;">' +
        '<tr>' +
          '<td style="padding:0 6px;"><a href="' + LINKEDIN_URL + '" style="text-decoration:none;"><span style="display:inline-block;background:#0A66C2;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:bold;">in LinkedIn</span></a></td>' +
          '<td style="padding:0 6px;"><a href="' + YOUTUBE_URL + '" style="text-decoration:none;"><span style="display:inline-block;background:#FF0000;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:bold;">▶ YouTube</span></a></td>' +
          '<td style="padding:0 6px;"><a href="' + INSTAGRAM_URL + '" style="text-decoration:none;"><span style="display:inline-block;background:#C13584;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:bold;">❤ Instagram</span></a></td>' +
        '</tr>' +
      '</table>' +
      '<p style="color:#9CA3AF;font-size:11px;margin:8px 0 0;">Questions? <a href="mailto:' + HR_EMAIL + '" style="color:#6EE7B7;">' + HR_EMAIL + '</a></p>' +
      '<p style="color:#4B5563;font-size:11px;margin:4px 0 0;">This is an automated message. Please do not reply directly.</p>' +
    '</div>'
  );
}

// ════════════════════════════════════════════════════════════
//  DRIVE — Upload resume PDF, return shareable link
// ════════════════════════════════════════════════════════════
function _uploadResume(base64Data, fileName) {
  try {
    const bytes  = Utilities.base64Decode(base64Data);
    const blob   = Utilities.newBlob(bytes, "application/pdf", fileName);
    const folders = DriveApp.getFoldersByName(RESUME_FOLDER);
    const folder  = folders.hasNext() ? folders.next() : DriveApp.createFolder(RESUME_FOLDER);
    const file    = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    console.log("📎 Resume uploaded → " + file.getUrl());
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
    // URL-encoded fallback
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
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ════════════════════════════════════════════════════════════
//  SPREADSHEET onEdit TRIGGER
//  Fires when HR manually types TRUE in col N of the Sheet.
//  Set up: Extensions → Apps Script → Triggers → onShortlistEdit
//          → From spreadsheet → On edit
// ════════════════════════════════════════════════════════════
function onShortlistEdit(e) {
  try {
    const sheet = e.source.getActiveSheet();
    if (sheet.getName() !== SHEET_NAME) return;

    const editedCol = e.range.getColumn(); // 1-based
    const editedRow = e.range.getRow();

    // Only react to col N (1-based = 14) "Resume Shortlisted"
    if (editedCol !== 14) return;
    if (editedRow < 2)    return;

    const val = String(e.value || "").trim().toLowerCase();
    if (val !== "true") return;

    const row = sheet.getRange(editedRow, 1, 1, TOTAL_COLS).getValues()[0];

    // Duplicate-send guard
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

    sheet.getRange(editedRow, COL.EMAIL_SENT_FLAG + 1)
         .setValue("Sent – " + new Date().toLocaleString("en-IN"));
    SpreadsheetApp.flush();

    console.log("✅ onShortlistEdit email sent → " + candidate.email);
  } catch (err) {
    console.error("onShortlistEdit error: " + err);
  }
}

// ════════════════════════════════════════════════════════════
//  DEPLOYMENT CHECKLIST
//  1. Paste this file into script.google.com (replace everything)
//  2. Save (Ctrl+S)
//  3. Deploy → Manage Deployments → Edit → New version → Deploy
//     Execute as: Me  |  Who can access: Anyone
//  4. Triggers → onShortlistEdit → From spreadsheet → On edit
//  5. Set GAS_WEBAPP_URL in Render env vars to the /exec URL
// ════════════════════════════════════════════════════════════
