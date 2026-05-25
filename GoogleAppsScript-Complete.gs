// ============================================================
//  Google Apps Script — Zyntrix Software Solution
//  Handles:
//    1. Job application form submissions (stores to Sheet + Drive + email)
//    2. HRMS "Resume Shortlist" button (marks col N + emails candidate)
//    3. Interview Panel emails — Round Qualified / Not Qualified / Offered
//    4. Offer Letter send — marks col P (OFFERED) + emails the PDF offer letter
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

// ── BRAND COLORS ────────────────────────────────────────────
// Black + Lime Green — Zyntrix brand palette
const C_BLACK         = "#0A0A0A";
const C_LIME          = "#AAFF00";
const C_LIME_LIGHT    = "#F2FFD6";   // very light lime for section boxes
const C_LIME_DARK     = "#7ACC00";   // darker lime for borders
const C_WHITE         = "#FFFFFF";
const C_GRAY_DARK     = "#1A1A1A";   // near-black text
const C_GRAY_MID      = "#444444";   // body text
const C_GRAY_LIGHT    = "#888888";   // subdued text
const C_GRAY_BORDER   = "#E5E7EB";

// ── LOGO — Real Zyntrix logo (PNG, 150x150, base64 encoded) ─────
const LOGO_URL = "https://drive.google.com/uc?export=view&id=1UegVZ6a_6DepJSzudlO16aTn7DdYaza0";

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
  RESUME_SHORTLISTED : 13,  // N  <- HR marks this TRUE
  INTERVIEW_STATUS   : 14,  // O
  OFFERED            : 15,  // P  <- offer letter marks this TRUE
  HR_NAME            : 16,  // Q
  EMAIL_SENT_FLAG    : 17,  // R  <- duplicate-send guard
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

    if (data.action === "updateCandidate")       return _handleShortlist(data);
    if (data.action === "sendRoundQualified")    return _handleRoundQualified(data);
    if (data.action === "sendRoundNotQualified") return _handleRoundNotQualified(data);
    if (data.action === "sendOffered")           return _handleOffered(data);
    if (data.action === "sendOfferLetter")       return _handleSendOfferLetter(data);

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

  console.log("Application stored: " + email + " | " + position);
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
    if (rowEmail === email) {
      rowIndex = r; // keep overwriting -> lands on last (newest) match
    }
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
      console.log("Shortlist email sent: " + candidate.email + " (row " + sheetRow + ")");
    } catch (mailErr) {
      console.error("Shortlist email failed: " + mailErr);
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
  } catch (err) {
    console.error("_handleRoundQualified error: " + err);
  }
  return _jsonOut({ ok: true });
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
  } catch (err) {
    console.error("_handleRoundNotQualified error: " + err);
  }
  return _jsonOut({ ok: true });
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
  } catch (err) {
    console.error("_handleOffered error: " + err);
  }
  return _jsonOut({ ok: true });
}

// ════════════════════════════════════════════════════════════
//  HANDLER 6 — Send Offer Letter (records OFFERED in Sheet + emails PDF)
//  Expected POST payload from the CRM "Send Offer" action:
//    {
//      action        : "sendOfferLetter",
//      email         : "candidate@example.com",   // required
//      fullName      : "Asha Rao",
//      position      : "Software Engineer",
//      phone         : "9999999999",              // optional
//      hrName        : "Arjun Rao",               // optional → Column Q
//      offerPdfBase64: "<base64 of the offer PDF>",
//      offerPdfName  : "Zyntrix_Offer_Letter_Asha_Rao.pdf"  // optional
//    }
// ════════════════════════════════════════════════════════════
function _handleSendOfferLetter(data) {
  const email = String(data.email || "").trim().toLowerCase();
  if (!email) return _jsonOut({ ok: false, error: "email is required" });

  const sheet  = _getSheet();
  const values = sheet.getDataRange().getValues();

  // Locate the candidate's row by email (last / newest match)
  let rowIndex = -1;
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][COL.EMAIL] || "").trim().toLowerCase() === email) {
      rowIndex = r;
    }
  }

  // Append a fresh row if the candidate isn't in the sheet yet
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

  // ── STEP 1: record in the Sheet first — mark OFFERED (Column P) = TRUE ──
  sheet.getRange(sheetRow, COL.OFFERED + 1).setValue(true);
  if (data.hrName) {
    sheet.getRange(sheetRow, COL.HR_NAME + 1).setValue(String(data.hrName).trim());
  }
  SpreadsheetApp.flush();

  const row = sheet.getRange(sheetRow, 1, 1, TOTAL_COLS).getValues()[0];
  const candidate = {
    fullName : String(row[COL.FULL_NAME] || data.fullName || "").trim(),
    email    : email,
    position : String(row[COL.POSITION]  || data.position || "").trim(),
    phone    : String(row[COL.PHONE]     || data.phone    || "").trim(),
  };

  // ── STEP 2: email the offer letter, with the PDF attached if provided ──
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
      console.log("Offer letter email sent: " + candidate.email + " (row " + sheetRow + ")");
    } catch (mailErr) {
      console.error("Offer letter email failed: " + mailErr);
    }
  }

  return _jsonOut({ ok: true, row: sheetRow, offered: true, emailed: emailed });
}

// ════════════════════════════════════════════════════════════
//  EMAIL HEADER BUILDER — Logo + company name on black bg
// ════════════════════════════════════════════════════════════
function _emailHeader(tagline) {
  return (
    '<div style="background:' + C_BLACK + ';padding:28px 32px;text-align:center;">' +
      '<img src="' + LOGO_URL + '" ' +
           'alt="' + COMPANY_NAME + ' Logo" ' +
           'width="100" height="100" ' +
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
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px auto 10px;border-collapse:collapse;">' +
        '<tr>' +
          '<td style="padding:0 5px;"><a href="' + LINKEDIN_URL + '" style="text-decoration:none;">' +
            '<span style="display:inline-block;background:#0A66C2;color:#fff;border-radius:6px;padding:5px 12px;font-size:11px;font-weight:bold;">LinkedIn</span>' +
          '</a></td>' +
          '<td style="padding:0 5px;"><a href="' + YOUTUBE_URL + '" style="text-decoration:none;">' +
            '<span style="display:inline-block;background:#FF0000;color:#fff;border-radius:6px;padding:5px 12px;font-size:11px;font-weight:bold;">YouTube</span>' +
          '</a></td>' +
          '<td style="padding:0 5px;"><a href="' + INSTAGRAM_URL + '" style="text-decoration:none;">' +
            '<span style="display:inline-block;background:#C13584;color:#fff;border-radius:6px;padding:5px 12px;font-size:11px;font-weight:bold;">Instagram</span>' +
          '</a></td>' +
        '</tr>' +
      '</table>' +
      '<p style="color:' + C_GRAY_LIGHT + ';font-size:11px;margin:8px 0 0;">' +
        'Questions? <a href="mailto:' + HR_EMAIL + '" style="color:' + C_LIME + ';">' + HR_EMAIL + '</a>' +
      '</p>' +
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
        '<p style="font-size:14px;color:' + C_GRAY_MID + ';line-height:1.75;margin:0 0 20px;">' +
          'Thank you for applying to <strong>' + COMPANY_NAME + '</strong> for the position of <strong>' + c.position + '</strong>. ' +
          'We have received your application and our Talent Acquisition team will review your profile promptly.' +
        '</p>' +
        '<div style="background:' + C_LIME_LIGHT + ';border-left:4px solid ' + C_LIME + ';border-radius:6px;padding:16px 18px;margin-bottom:20px;">' +
          '<p style="margin:0;font-size:14px;color:' + C_GRAY_DARK + ';line-height:1.7;">' +
            '<strong>What happens next?</strong><br>' +
            'If your profile aligns with our requirements, our HR team will reach out to schedule the next steps. ' +
            'Please keep your phone reachable and monitor your inbox.' +
          '</p>' +
        '</div>' +
        '<p style="font-size:13px;color:' + C_GRAY_LIGHT + ';">For any queries, write to us at ' +
          '<a href="mailto:' + HR_EMAIL + '" style="color:' + C_GRAY_DARK + ';font-weight:600;">' + HR_EMAIL + '</a></p>' +
        '<p style="margin-top:24px;font-size:14px;color:' + C_GRAY_MID + ';">Regards,<br>' +
          '<strong>' + COMPANY_NAME + ' — HR Team</strong></p>' +
      '</div>' +
      _emailFooter() +
    '</div>';

  GmailApp.sendEmail(c.email, subject, "", {
    htmlBody: body,
    from    : HR_EMAIL,
    replyTo : HR_EMAIL,
    name    : COMPANY_NAME + " - Talent Acquisition",
  });
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
        '<p style="font-size:14px;color:' + C_GRAY_MID + ';line-height:1.75;margin:0 0 20px;">' +
          'Congratulations! Your resume has been <strong>shortlisted</strong> for the <strong>' + c.position + '</strong> role at <strong>' + COMPANY_NAME + '</strong>. ' +
          'You have cleared the first stage of our selection process.' +
        '</p>' +

        '<div style="background:' + C_LIME_LIGHT + ';border-left:4px solid ' + C_LIME + ';border-radius:6px;padding:18px;margin-bottom:22px;">' +
          '<p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:' + C_GRAY_DARK + ';">What Happens Next</p>' +
          '<p style="margin:0;font-size:14px;color:' + C_GRAY_MID + ';line-height:1.7;">' +
            'Our HR team will contact you shortly to schedule your interview. ' +
            'Keep your phone reachable and check your inbox regularly.' +
          '</p>' +
        '</div>' +

        '<div style="background:#F9F9F9;border:1px solid ' + C_GRAY_BORDER + ';border-radius:6px;padding:16px;margin-bottom:22px;">' +
          '<p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:' + C_GRAY_DARK + ';">How to Prepare</p>' +
          '<p style="margin:0;font-size:13px;color:' + C_GRAY_MID + ';line-height:1.7;">' +
            'Review the job requirements, research ' + COMPANY_NAME + ', and sharpen your technical and domain skills. ' +
            'Approach the interview with confidence — we want to see the best of you.' +
          '</p>' +
        '</div>' +

        '<p style="font-weight:bold;font-size:14px;color:' + C_GRAY_DARK + ';margin:0 0 12px;">Your Selection Journey</p>' +

        _journeyStep(true,  "1", "Application Received",  "Your profile was submitted successfully.") +
        _journeyStepActive(  "2", "Resume Shortlisted",    "Your resume has been approved by our recruiter.") +
        _journeyStep(false, "3", "HR Screening Call",     "Our HR will reach out to schedule your interview.") +
        _journeyStep(false, "4", "Interview Rounds",      "Technical and managerial rounds — online or in person.") +
        _journeyStep(false, "5", "Offer and Onboarding",  "Selected candidates receive a formal offer letter.") +

        '<div style="background:' + C_LIME_LIGHT + ';border:1px solid ' + C_LIME_DARK + ';border-radius:6px;padding:12px 16px;margin:20px 0;">' +
          '<p style="margin:0;font-size:13px;color:' + C_GRAY_DARK + ';">' +
            '<strong>Reminder:</strong> Keep your phone reachable and check your email. Our HR team will connect with you shortly.' +
          '</p>' +
        '</div>' +

        '<div style="background:#F9F9F9;border:1px solid ' + C_GRAY_BORDER + ';border-radius:8px;padding:16px;margin-bottom:20px;">' +
          '<p style="margin:0 0 10px;font-weight:bold;font-size:13px;color:' + C_GRAY_DARK + ';">Application Summary</p>' +
          '<table style="width:100%;font-size:13px;border-collapse:collapse;">' +
            '<tr style="border-bottom:1px solid #F0F0F0;"><td style="padding:7px 0;color:' + C_GRAY_LIGHT + ';width:100px;">Name</td><td style="padding:7px 0;color:' + C_GRAY_DARK + ';font-weight:600;">' + c.fullName + '</td></tr>' +
            '<tr style="border-bottom:1px solid #F0F0F0;"><td style="padding:7px 0;color:' + C_GRAY_LIGHT + ';">Position</td><td style="padding:7px 0;color:' + C_GRAY_DARK + ';font-weight:600;">' + c.position + '</td></tr>' +
            '<tr style="border-bottom:1px solid #F0F0F0;"><td style="padding:7px 0;color:' + C_GRAY_LIGHT + ';">Email</td><td style="padding:7px 0;color:' + C_GRAY_DARK + ';">' + c.email + '</td></tr>' +
            '<tr><td style="padding:7px 0;color:' + C_GRAY_LIGHT + ';">Phone</td><td style="padding:7px 0;color:' + C_GRAY_DARK + ';">' + (c.phone || "Not provided") + '</td></tr>' +
          '</table>' +
        '</div>' +

        '<p style="font-size:13px;color:' + C_GRAY_LIGHT + ';">Queries: <a href="mailto:' + HR_EMAIL + '" style="color:' + C_GRAY_DARK + ';font-weight:600;">' + HR_EMAIL + '</a></p>' +
        '<p style="margin-top:22px;font-size:14px;color:' + C_GRAY_MID + ';">Regards,<br><strong>' + COMPANY_NAME + ' — HR and Talent Acquisition Team</strong></p>' +
      '</div>' +
      _emailFooter() +
    '</div>';

  GmailApp.sendEmail(c.email, subject, "", {
    htmlBody: body,
    from    : HR_EMAIL,
    replyTo : HR_EMAIL,
    name    : COMPANY_NAME + " - Talent Acquisition",
  });
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
    const bg   = done ? C_LIME    : next ? C_GRAY_DARK : "#E5E7EB";
    const txt  = done ? C_BLACK   : next ? C_WHITE      : C_GRAY_LIGHT;
    const icon = done ? "V"       : String(num);
    const label = "Round " + num + " Interview";
    const sub   = done ? "Cleared" : next ? "Up next — stay prepared" : "Pending";
    const subCol = done ? C_LIME_DARK : next ? C_GRAY_MID : C_GRAY_LIGHT;
    return (
      '<div style="display:flex;align-items:center;margin-bottom:12px;">' +
        '<div style="min-width:36px;height:36px;background:' + bg + ';color:' + txt + ';border-radius:50%;' +
             'text-align:center;line-height:36px;font-size:13px;font-weight:bold;margin-right:14px;flex-shrink:0;">' + icon + '</div>' +
        '<div>' +
          '<p style="margin:0;font-size:13px;font-weight:600;color:' + C_GRAY_DARK + ';">' + label + '</p>' +
          '<p style="margin:2px 0 0;font-size:12px;color:' + subCol + ';">' + sub + '</p>' +
        '</div>' +
      '</div>'
    );
  }

  const nextBlock = isFinal
    ? '<div style="background:' + C_LIME_LIGHT + ';border-left:4px solid ' + C_LIME + ';border-radius:6px;padding:16px 18px;margin:20px 0;">' +
        '<p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:' + C_GRAY_DARK + ';">What Happens Next</p>' +
        '<p style="margin:0;font-size:14px;color:' + C_GRAY_MID + ';line-height:1.7;">' +
          'You have successfully cleared <strong>all 3 rounds</strong>. Our HR team is reviewing the results and will reach out to you <strong>shortly with the final decision and offer details</strong>. Keep your phone reachable.' +
        '</p>' +
      '</div>'
    : '<div style="background:' + C_LIME_LIGHT + ';border-left:4px solid ' + C_LIME + ';border-radius:6px;padding:16px 18px;margin:20px 0;">' +
        '<p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:' + C_GRAY_DARK + ';">What Happens Next</p>' +
        '<p style="margin:0;font-size:14px;color:' + C_GRAY_MID + ';line-height:1.7;">' +
          'Our HR team will contact you shortly to schedule <strong>Round ' + nextRound + '</strong>. ' +
          'Keep your phone reachable and prepare well. Best of Luck!' +
        '</p>' +
      '</div>';

  const body =
    '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid ' + C_GRAY_BORDER + ';border-radius:12px;overflow:hidden;">' +
      _emailHeader("Interview Panel") +

      '<div style="background:' + C_LIME + ';padding:13px 32px;text-align:center;">' +
        '<span style="color:' + C_BLACK + ';font-size:13px;font-weight:bold;letter-spacing:0.5px;">' + badgeText + '</span>' +
      '</div>' +

      '<div style="padding:32px;background:' + C_WHITE + ';">' +
        '<p style="font-size:18px;color:' + C_GRAY_DARK + ';margin:0 0 10px;">Dear <strong>' + c.fullName + '</strong>,</p>' +
        '<p style="font-size:14px;color:' + C_GRAY_MID + ';line-height:1.75;margin:0 0 20px;">' +
          'Excellent work! We are pleased to inform you that you have <strong>successfully cleared Round ' + c.roundNumber + '</strong> ' +
          'of the interview process for the <strong>' + c.position + '</strong> role at <strong>' + COMPANY_NAME + '</strong>.' +
        '</p>' +

        nextBlock +

        '<p style="font-weight:bold;font-size:14px;color:' + C_GRAY_DARK + ';margin:24px 0 12px;">Your Interview Progress</p>' +
        roundStep(1) + roundStep(2) + roundStep(3) +

        '<div style="background:#F9F9F9;border:1px solid ' + C_GRAY_BORDER + ';border-radius:8px;padding:16px;margin:20px 0;">' +
          '<p style="margin:0 0 8px;font-weight:bold;font-size:13px;color:' + C_GRAY_DARK + ';">Interview Details</p>' +
          '<table style="width:100%;font-size:13px;border-collapse:collapse;">' +
            '<tr style="border-bottom:1px solid #F0F0F0;"><td style="padding:7px 0;color:' + C_GRAY_LIGHT + ';width:100px;">Name</td><td style="padding:7px 0;color:' + C_GRAY_DARK + ';font-weight:600;">' + c.fullName + '</td></tr>' +
            '<tr style="border-bottom:1px solid #F0F0F0;"><td style="padding:7px 0;color:' + C_GRAY_LIGHT + ';">Position</td><td style="padding:7px 0;color:' + C_GRAY_DARK + ';font-weight:600;">' + c.position + '</td></tr>' +
            '<tr><td style="padding:7px 0;color:' + C_GRAY_LIGHT + ';">Round</td><td style="padding:7px 0;color:' + C_GRAY_DARK + ';font-weight:600;">Round ' + c.roundNumber + ' — Cleared</td></tr>' +
          '</table>' +
        '</div>' +

        '<p style="font-size:13px;color:' + C_GRAY_LIGHT + ';">Questions? <a href="mailto:' + HR_EMAIL + '" style="color:' + C_GRAY_DARK + ';">' + HR_EMAIL + '</a></p>' +
        '<p style="margin-top:20px;font-size:14px;color:' + C_GRAY_MID + ';">Regards,<br><strong>' + COMPANY_NAME + ' — HR and Talent Acquisition Team</strong></p>' +
      '</div>' +
      _emailFooter() +
    '</div>';

  GmailApp.sendEmail(c.email, subject, "", {
    htmlBody: body,
    from    : HR_EMAIL,
    replyTo : HR_EMAIL,
    name    : COMPANY_NAME + " - Talent Acquisition",
  });
  console.log("Round qualified email sent: " + c.email + " Round " + c.roundNumber);
}

// ════════════════════════════════════════════════════════════
//  EMAIL 4 — Round Not Qualified
// ════════════════════════════════════════════════════════════
function _sendRoundNotQualifiedEmail(c) {
  const subject = "Update on Your Interview - " + c.position + " | " + COMPANY_NAME;

  const body =
    '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid ' + C_GRAY_BORDER + ';border-radius:12px;overflow:hidden;">' +
      _emailHeader("Interview Panel") +

      '<div style="background:' + C_GRAY_DARK + ';padding:13px 32px;text-align:center;">' +
        '<span style="color:' + C_WHITE + ';font-size:13px;font-weight:bold;letter-spacing:0.5px;">INTERVIEW UPDATE — ROUND ' + c.roundNumber + '</span>' +
      '</div>' +

      '<div style="padding:32px;background:' + C_WHITE + ';">' +
        '<p style="font-size:18px;color:' + C_GRAY_DARK + ';margin:0 0 10px;">Dear <strong>' + c.fullName + '</strong>,</p>' +
        '<p style="font-size:14px;color:' + C_GRAY_MID + ';line-height:1.75;margin:0 0 20px;">' +
          'Thank you for taking the time to participate in <strong>Round ' + c.roundNumber + '</strong> of the interview process for the <strong>' + c.position + '</strong> role at <strong>' + COMPANY_NAME + '</strong>.' +
        '</p>' +

        '<div style="background:#F9F9F9;border-left:4px solid ' + C_GRAY_LIGHT + ';border-radius:6px;padding:18px;margin-bottom:24px;">' +
          '<p style="margin:0;font-size:14px;color:' + C_GRAY_MID + ';line-height:1.8;">' +
            'After thorough evaluation, we regret to inform you that we have decided to <strong>move forward with other candidates</strong> for this role. ' +
            'This was a competitive process and a difficult decision to make.' +
          '</p>' +
        '</div>' +

        '<div style="background:' + C_LIME_LIGHT + ';border-left:4px solid ' + C_LIME + ';border-radius:6px;padding:16px;margin-bottom:24px;">' +
          '<p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:' + C_GRAY_DARK + ';">Your Profile Stays With Us</p>' +
          '<p style="margin:0;font-size:13px;color:' + C_GRAY_MID + ';line-height:1.7;">' +
            'We sincerely appreciate your effort and the time you invested in this process. ' +
            'We will keep your profile on file for suitable opportunities in the future. ' +
            'We encourage you to apply again for roles that match your skills and interest.' +
          '</p>' +
        '</div>' +

        '<div style="background:#F9F9F9;border:1px solid ' + C_GRAY_BORDER + ';border-radius:8px;padding:16px;margin:20px 0;">' +
          '<p style="margin:0 0 8px;font-weight:bold;font-size:13px;color:' + C_GRAY_DARK + ';">Interview Summary</p>' +
          '<table style="width:100%;font-size:13px;border-collapse:collapse;">' +
            '<tr style="border-bottom:1px solid #F0F0F0;"><td style="padding:7px 0;color:' + C_GRAY_LIGHT + ';width:100px;">Name</td><td style="padding:7px 0;color:' + C_GRAY_DARK + ';font-weight:600;">' + c.fullName + '</td></tr>' +
            '<tr style="border-bottom:1px solid #F0F0F0;"><td style="padding:7px 0;color:' + C_GRAY_LIGHT + ';">Position</td><td style="padding:7px 0;color:' + C_GRAY_DARK + ';font-weight:600;">' + c.position + '</td></tr>' +
            '<tr><td style="padding:7px 0;color:' + C_GRAY_LIGHT + ';">Round</td><td style="padding:7px 0;color:' + C_GRAY_DARK + ';">Round ' + c.roundNumber + '</td></tr>' +
          '</table>' +
        '</div>' +

        '<p style="font-size:13px;color:' + C_GRAY_LIGHT + ';">Questions? <a href="mailto:' + HR_EMAIL + '" style="color:' + C_GRAY_DARK + ';">' + HR_EMAIL + '</a></p>' +
        '<p style="margin-top:20px;font-size:14px;color:' + C_GRAY_MID + ';">We wish you the very best in your career.<br><br>' +
          'Regards,<br><strong>' + COMPANY_NAME + ' — HR and Talent Acquisition Team</strong></p>' +
      '</div>' +
      _emailFooter() +
    '</div>';

  GmailApp.sendEmail(c.email, subject, "", {
    htmlBody: body,
    from    : HR_EMAIL,
    replyTo : HR_EMAIL,
    name    : COMPANY_NAME + " - Talent Acquisition",
  });
  console.log("Round not-qualified email sent: " + c.email + " Round " + c.roundNumber);
}

// ════════════════════════════════════════════════════════════
//  EMAIL 5 — Offered (all rounds cleared, offer letter coming)
// ════════════════════════════════════════════════════════════
function _sendOfferedEmail(c) {
  const subject = "Congratulations! You Have Been Selected - " + c.position + " | " + COMPANY_NAME;

  const body =
    '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid ' + C_GRAY_BORDER + ';border-radius:12px;overflow:hidden;">' +
      _emailHeader("Talent Acquisition Team") +

      '<div style="background:' + C_LIME + ';padding:14px 32px;text-align:center;">' +
        '<span style="color:' + C_BLACK + ';font-size:14px;font-weight:bold;letter-spacing:0.5px;">CONGRATULATIONS — YOU HAVE BEEN SELECTED!</span>' +
      '</div>' +

      '<div style="padding:32px;background:' + C_WHITE + ';">' +
        '<p style="font-size:18px;color:' + C_GRAY_DARK + ';margin:0 0 10px;">Dear <strong>' + c.fullName + '</strong>,</p>' +
        '<p style="font-size:15px;color:' + C_GRAY_MID + ';line-height:1.8;margin:0 0 20px;">' +
          'We are absolutely delighted to inform you that you have been <strong>SELECTED</strong> for the position of <strong>' + c.position + '</strong> at <strong>' + COMPANY_NAME + '</strong>.' +
        '</p>' +
        '<p style="font-size:14px;color:' + C_GRAY_MID + ';line-height:1.75;margin:0 0 20px;">' +
          'You demonstrated outstanding skill and dedication throughout our interview process. We are confident you will be an exceptional addition to our team.' +
        '</p>' +

        '<div style="background:' + C_LIME_LIGHT + ';border-left:4px solid ' + C_LIME + ';border-radius:6px;padding:18px;margin-bottom:24px;">' +
          '<p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:' + C_GRAY_DARK + ';">What Happens Next</p>' +
          '<p style="margin:0;font-size:14px;color:' + C_GRAY_MID + ';line-height:1.8;">' +
            'Our HR team will send you a <strong>formal Offer Letter (PDF)</strong> shortly. ' +
            'It will contain your compensation details, joining information, and employment terms. ' +
            'Please keep your phone reachable and watch your inbox.' +
          '</p>' +
        '</div>' +

        '<p style="font-weight:bold;font-size:14px;color:' + C_GRAY_DARK + ';margin:20px 0 12px;">Your Interview Journey — Completed</p>' +

        '<div style="display:flex;align-items:center;margin-bottom:12px;">' +
          '<div style="min-width:36px;height:36px;background:' + C_LIME + ';color:' + C_BLACK + ';border-radius:50%;text-align:center;line-height:36px;font-size:13px;font-weight:bold;margin-right:14px;flex-shrink:0;">V</div>' +
          '<div><p style="margin:0;font-size:13px;font-weight:600;color:' + C_GRAY_DARK + ';">Round 1 Interview</p><p style="margin:2px 0 0;font-size:12px;color:' + C_LIME_DARK + ';">Cleared</p></div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;margin-bottom:12px;">' +
          '<div style="min-width:36px;height:36px;background:' + C_LIME + ';color:' + C_BLACK + ';border-radius:50%;text-align:center;line-height:36px;font-size:13px;font-weight:bold;margin-right:14px;flex-shrink:0;">V</div>' +
          '<div><p style="margin:0;font-size:13px;font-weight:600;color:' + C_GRAY_DARK + ';">Round 2 Interview</p><p style="margin:2px 0 0;font-size:12px;color:' + C_LIME_DARK + ';">Cleared</p></div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;margin-bottom:12px;">' +
          '<div style="min-width:36px;height:36px;background:' + C_LIME + ';color:' + C_BLACK + ';border-radius:50%;text-align:center;line-height:36px;font-size:13px;font-weight:bold;margin-right:14px;flex-shrink:0;">V</div>' +
          '<div><p style="margin:0;font-size:13px;font-weight:600;color:' + C_GRAY_DARK + ';">Round 3 Interview</p><p style="margin:2px 0 0;font-size:12px;color:' + C_LIME_DARK + ';">Cleared</p></div>' +
        '</div>' +
        '<div style="display:flex;align-items:flex-start;margin-bottom:12px;">' +
          '<div style="min-width:36px;height:36px;background:' + C_BLACK + ';color:' + C_LIME + ';border-radius:50%;text-align:center;line-height:36px;font-size:14px;font-weight:bold;margin-right:14px;flex-shrink:0;">*</div>' +
          '<div style="background:' + C_LIME_LIGHT + ';border:1px solid ' + C_LIME_DARK + ';border-radius:6px;padding:10px 14px;">' +
            '<p style="margin:0;font-size:13px;font-weight:bold;color:' + C_GRAY_DARK + ';">Selected — Offer Letter on its way!</p>' +
            '<p style="margin:4px 0 0;font-size:12px;color:' + C_GRAY_MID + ';">HR team will reach out to you shortly.</p>' +
          '</div>' +
        '</div>' +

        '<div style="background:#F9F9F9;border:1px solid ' + C_GRAY_BORDER + ';border-radius:8px;padding:16px;margin:20px 0;">' +
          '<p style="margin:0 0 8px;font-weight:bold;font-size:13px;color:' + C_GRAY_DARK + ';">Offer Summary</p>' +
          '<table style="width:100%;font-size:13px;border-collapse:collapse;">' +
            '<tr style="border-bottom:1px solid #F0F0F0;"><td style="padding:7px 0;color:' + C_GRAY_LIGHT + ';width:100px;">Name</td><td style="padding:7px 0;color:' + C_GRAY_DARK + ';font-weight:600;">' + c.fullName + '</td></tr>' +
            '<tr style="border-bottom:1px solid #F0F0F0;"><td style="padding:7px 0;color:' + C_GRAY_LIGHT + ';">Position</td><td style="padding:7px 0;color:' + C_GRAY_DARK + ';font-weight:600;">' + c.position + '</td></tr>' +
            '<tr><td style="padding:7px 0;color:' + C_GRAY_LIGHT + ';">Status</td><td style="padding:7px 0;color:' + C_GRAY_DARK + ';font-weight:600;">Selected</td></tr>' +
          '</table>' +
        '</div>' +

        '<p style="font-size:13px;color:' + C_GRAY_LIGHT + ';">Questions? <a href="mailto:' + HR_EMAIL + '" style="color:' + C_GRAY_DARK + ';font-weight:600;">' + HR_EMAIL + '</a></p>' +
        '<p style="margin-top:20px;font-size:15px;color:' + C_GRAY_DARK + ';font-weight:bold;">Welcome to the ' + COMPANY_NAME + ' family!</p>' +
        '<p style="font-size:14px;color:' + C_GRAY_MID + ';">Regards,<br><strong>' + COMPANY_NAME + ' — HR and Talent Acquisition Team</strong></p>' +
      '</div>' +
      _emailFooter() +
    '</div>';

  GmailApp.sendEmail(c.email, subject, "", {
    htmlBody: body,
    from    : HR_EMAIL,
    replyTo : HR_EMAIL,
    name    : COMPANY_NAME + " - Talent Acquisition",
  });
  console.log("Offered email sent: " + c.email);
}

// ════════════════════════════════════════════════════════════
//  EMAIL 6 — Offer Letter (formal offer, PDF attached)
// ════════════════════════════════════════════════════════════
function _sendOfferLetterEmail(c, attachment) {
  const subject = "Your Offer Letter - " + c.position + " | " + COMPANY_NAME;

  const body =
    '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid ' + C_GRAY_BORDER + ';border-radius:12px;overflow:hidden;">' +
      _emailHeader("Talent Acquisition Team") +

      '<div style="background:' + C_LIME + ';padding:14px 32px;text-align:center;">' +
        '<span style="color:' + C_BLACK + ';font-size:14px;font-weight:bold;letter-spacing:0.5px;">YOUR OFFER LETTER IS HERE!</span>' +
      '</div>' +

      '<div style="padding:32px;background:' + C_WHITE + ';">' +
        '<p style="font-size:18px;color:' + C_GRAY_DARK + ';margin:0 0 10px;">Dear <strong>' + c.fullName + '</strong>,</p>' +
        '<p style="font-size:15px;color:' + C_GRAY_MID + ';line-height:1.8;margin:0 0 20px;">' +
          'Congratulations once again! We are delighted to extend our formal offer for the position of ' +
          '<strong>' + c.position + '</strong> at <strong>' + COMPANY_NAME + '</strong>. ' +
          'Your official <strong>Offer Letter</strong> is ' + (attachment ? 'attached to this email as a PDF.' : 'being prepared and will be shared by our HR team shortly.') +
        '</p>' +

        '<div style="background:' + C_LIME_LIGHT + ';border-left:4px solid ' + C_LIME + ';border-radius:6px;padding:18px;margin-bottom:24px;">' +
          '<p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:' + C_GRAY_DARK + ';">Next Steps</p>' +
          '<p style="margin:0;font-size:14px;color:' + C_GRAY_MID + ';line-height:1.8;">' +
            'Please review the offer letter carefully. To accept, reply to this email with your signed ' +
            'confirmation. If you have any questions about the terms, compensation, or joining date, our HR ' +
            'team will be glad to assist.' +
          '</p>' +
        '</div>' +

        '<div style="background:#F9F9F9;border:1px solid ' + C_GRAY_BORDER + ';border-radius:8px;padding:16px;margin:20px 0;">' +
          '<p style="margin:0 0 8px;font-weight:bold;font-size:13px;color:' + C_GRAY_DARK + ';">Offer Summary</p>' +
          '<table style="width:100%;font-size:13px;border-collapse:collapse;">' +
            '<tr style="border-bottom:1px solid #F0F0F0;"><td style="padding:7px 0;color:' + C_GRAY_LIGHT + ';width:100px;">Name</td><td style="padding:7px 0;color:' + C_GRAY_DARK + ';font-weight:600;">' + c.fullName + '</td></tr>' +
            '<tr style="border-bottom:1px solid #F0F0F0;"><td style="padding:7px 0;color:' + C_GRAY_LIGHT + ';">Position</td><td style="padding:7px 0;color:' + C_GRAY_DARK + ';font-weight:600;">' + c.position + '</td></tr>' +
            '<tr><td style="padding:7px 0;color:' + C_GRAY_LIGHT + ';">Status</td><td style="padding:7px 0;color:' + C_GRAY_DARK + ';font-weight:600;">Offer Extended</td></tr>' +
          '</table>' +
        '</div>' +

        '<p style="font-size:13px;color:' + C_GRAY_LIGHT + ';">Questions? <a href="mailto:' + HR_EMAIL + '" style="color:' + C_GRAY_DARK + ';font-weight:600;">' + HR_EMAIL + '</a></p>' +
        '<p style="margin-top:20px;font-size:15px;color:' + C_GRAY_DARK + ';font-weight:bold;">Welcome to the ' + COMPANY_NAME + ' family!</p>' +
        '<p style="font-size:14px;color:' + C_GRAY_MID + ';">Regards,<br><strong>' + COMPANY_NAME + ' — HR and Talent Acquisition Team</strong></p>' +
      '</div>' +
      _emailFooter() +
    '</div>';

  const options = {
    htmlBody: body,
    from    : HR_EMAIL,
    replyTo : HR_EMAIL,
    name    : COMPANY_NAME + " - Talent Acquisition",
  };
  if (attachment) options.attachments = [attachment];

  GmailApp.sendEmail(c.email, subject, "", options);
  console.log("Offer letter email sent: " + c.email);
}

// ════════════════════════════════════════════════════════════
//  JOURNEY STEP HELPERS
// ════════════════════════════════════════════════════════════
function _journeyStep(done, num, title, subtitle) {
  const bg  = done ? C_LIME     : "#E5E7EB";
  const txt = done ? C_BLACK    : C_GRAY_LIGHT;
  return (
    '<div style="display:flex;align-items:flex-start;margin-bottom:10px;">' +
      '<div style="min-width:30px;height:30px;background:' + bg + ';color:' + txt + ';border-radius:50%;' +
           'text-align:center;line-height:30px;font-size:12px;font-weight:bold;margin-right:12px;flex-shrink:0;">' + (done ? "V" : num) + '</div>' +
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
      '<div style="min-width:30px;height:30px;background:' + C_LIME + ';color:' + C_BLACK + ';border-radius:50%;' +
           'text-align:center;line-height:30px;font-size:12px;font-weight:bold;margin-right:12px;flex-shrink:0;">V</div>' +
      '<div style="background:' + C_LIME_LIGHT + ';border:1px solid ' + C_LIME_DARK + ';border-radius:6px;padding:8px 14px;">' +
        '<p style="margin:0;font-size:13px;font-weight:bold;color:' + C_GRAY_DARK + ';">' + title + ' — You are here</p>' +
        '<p style="margin:3px 0 0;font-size:12px;color:' + C_GRAY_MID + ';">' + subtitle + '</p>' +
      '</div>' +
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
    console.log("Resume uploaded: " + file.getUrl());
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
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ════════════════════════════════════════════════════════════
//  SPREADSHEET onEdit TRIGGER
//  Fires when HR manually types TRUE in col N of the Sheet.
//  Setup: Extensions > Apps Script > Triggers > onShortlistEdit
//         > From spreadsheet > On edit
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
         .setValue("Sent - " + new Date().toLocaleString("en-IN"));
    SpreadsheetApp.flush();

    console.log("onShortlistEdit email sent: " + candidate.email);
  } catch (err) {
    console.error("onShortlistEdit error: " + err);
  }
}

// ════════════════════════════════════════════════════════════
//  DEPLOYMENT CHECKLIST
//  1. Paste this file into script.google.com (replace everything)
//  2. Save (Ctrl+S)
//  3. Deploy > Manage Deployments > Edit > New version > Deploy
//     Execute as: Me  |  Who can access: Anyone
//  4. IMPORTANT: hr@zyntrixsoftware.com must be added as a
//     "Send mail as" alias in the Gmail settings of the account
//     running this script, otherwise the from: field is ignored.
//  5. Triggers > onShortlistEdit > From spreadsheet > On edit
//  6. Set GAS_WEBAPP_URL in Render env vars to the /exec URL
//
//  OFFER LETTER (new): the CRM "Send Offer" action should POST
//    { action:"sendOfferLetter", email, fullName, position,
//      phone?, hrName?, offerPdfBase64, offerPdfName }
//  → this marks Column P (OFFERED)=TRUE and emails the PDF offer.
// ════════════════════════════════════════════════════════════
