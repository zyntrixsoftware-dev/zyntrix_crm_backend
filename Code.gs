// ============================================================
//  Google Apps Script — Job Application Form Backend
//  Company : Zyntrix Software Solution
//  Includes: Form submission, CRM update, Automated Emails
//  Fixed   : Email failures isolated — form submission always succeeds
//  Fixed   : Shortlist button now writes to Resume Shortlisted (col N)
//            and does NOT overwrite Interview Shortlisted (col O)
//  Fixed   : sendShortlistEmail wording — resume shortlisted + best of luck
// ============================================================

const SHEET_ID        = "11aTN-lg6PWMGlB5OzNCoWtGIuqcjbh0Ctffg7Z0d8vs";
const SHEET_NAME      = "Sheet1";
const DRIVE_FOLDER_ID = "1nzBrmizR4ZXKs8EliDT2SVn9eHMricOR";

const COMPANY_NAME    = "Zyntrix Software Solution";
const COMPANY_EMAIL   = "noreply@zyntrixsoftware.com";
const HR_EMAIL        = "hr@zyntrixsoftware.com";
const WEBSITE_URL     = "https://zyntrixsoftware.com";
const LINKEDIN_URL    = "https://www.linkedin.com/company/zyntrix-software-solutions-pvt-ltd";
const YOUTUBE_URL     = "https://www.youtube.com/@zyntrixsoftware";
const INSTAGRAM_URL   = "https://www.instagram.com/zyntrixsoftware";
const LOGO_BASE64     = "data:image/png;base64,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";


// Column indices (0-based)
const COL = {
  TIMESTAMP        : 0,
  POSITION         : 1,
  FULL_NAME        : 2,
  EMAIL            : 3,
  PHONE            : 4,
  QUALIFICATIONS   : 5,
  EXPERIENCE       : 6,
  LOCATION         : 7,
  EDTECH           : 8,
  AVAILABILITY     : 9,
  RESUME_LINK      : 10,
  SOURCE           : 11,
  DECLARATION      : 12,
  SHORTLISTED      : 13,  // Column N — "Resume shortlisted"
  INTERVIEW_STATUS : 14,  // Column O — "Interview Shortlisted"
  OFFERED          : 15,
};

const HEADERS = [
  "Timestamp", "Position Applying For", "Full Name", "Email Address",
  "Phone number", "Qualifications", "Experience", "State/Province|address",
  "Have you ever worked in an Edtech company ?",
  "Are you available for immediate joining and willing to do WFH do you have WIFI connection ?",
  "CV/Resume", "Where did you hear about this opportunity?", "Declaration",
  "Resume shortlisted", "Interview Shortlisted", "Offered",
];


// ════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════

function getSheet() {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
}

function ensureHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
  }
}

function cors(output) {
  return output.setMimeType(ContentService.MimeType.JSON);
}

// Shared footer used in all emails
function emailFooter() {
  return (
    '<div style="background:#111827;padding:28px 32px;text-align:center;">' +

      // Logo
      '<img src="' + LOGO_BASE64 + '" alt="' + COMPANY_NAME + '" width="52" height="52" ' +
        'style="border-radius:12px;margin-bottom:14px;display:block;margin-left:auto;margin-right:auto;" />' +

      '<p style="color:#F9FAFB;font-size:14px;font-weight:bold;margin:0 0 4px;">' + COMPANY_NAME + '</p>' +
      '<a href="' + WEBSITE_URL + '" style="color:#6EE7B7;font-size:12px;text-decoration:none;">' + WEBSITE_URL + '</a>' +

      // ── Social icons — table layout for reliable mobile rendering ──
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" ' +
        'style="margin:16px auto 10px;border-collapse:collapse;">' +
        '<tr>' +

          // LinkedIn
          '<td style="padding:0 6px;">' +
            '<a href="' + LINKEDIN_URL + '" style="text-decoration:none;" title="LinkedIn">' +
              '<span style="display:inline-block;background:#0A66C2;color:#fff;border-radius:8px;' +
                'padding:7px 14px;font-size:12px;font-weight:bold;white-space:nowrap;">' +
                'in&nbsp;LinkedIn' +
              '</span>' +
            '</a>' +
          '</td>' +

          // YouTube
          '<td style="padding:0 6px;">' +
            '<a href="' + YOUTUBE_URL + '" style="text-decoration:none;" title="YouTube">' +
              '<span style="display:inline-block;background:#FF0000;color:#fff;border-radius:8px;' +
                'padding:7px 14px;font-size:12px;font-weight:bold;white-space:nowrap;">' +
                '&#9654;&nbsp;YouTube' +
              '</span>' +
            '</a>' +
          '</td>' +

          // Instagram
          '<td style="padding:0 6px;">' +
            '<a href="' + INSTAGRAM_URL + '" style="text-decoration:none;" title="Instagram">' +
              '<span style="display:inline-block;background:#C13584;color:#fff;border-radius:8px;' +
                'padding:7px 14px;font-size:12px;font-weight:bold;white-space:nowrap;">' +
                '&#10084;&nbsp;Instagram' +
              '</span>' +
            '</a>' +
          '</td>' +

        '</tr>' +
      '</table>' +
      // ── end social icons ──

      '<p style="color:#9CA3AF;font-size:11px;margin:10px 0 0;">' +
        'Questions? Contact us at ' +
        '<a href="mailto:' + HR_EMAIL + '" style="color:#6EE7B7;">' + HR_EMAIL + '</a>' +
      '</p>' +
      '<p style="color:#4B5563;font-size:11px;margin:6px 0 0;">' +
        'This is an automated message. Please do not reply directly.' +
      '</p>' +

    '</div>'
  );
}

// ════════════════════════════════════════════════════════════
//  EMAIL TEMPLATES
// ════════════════════════════════════════════════════════════

// ── 1. Application Received ──────────────────────────────────
function sendApplicationConfirmationEmail(candidate) {
  const subject = "Application Received - " + candidate.position + " | " + COMPANY_NAME;

  const body =
    '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">' +

      // Header
      '<div style="background:linear-gradient(135deg,#1E1B4B 0%,#3730A3 60%,#4F46E5 100%);padding:32px 32px 24px;text-align:center;">' +
        '<img src="' + LOGO_BASE64 + '" alt="Logo" width="64" height="64" ' +
          'style="border-radius:14px;margin-bottom:16px;display:block;margin-left:auto;margin-right:auto;border:3px solid rgba(255,255,255,0.2);" />' +
        '<h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:-0.5px;">' + COMPANY_NAME + '</h1>' +
        '<p style="color:#A5B4FC;margin:6px 0 0;font-size:13px;letter-spacing:2px;text-transform:uppercase;">Careers Portal</p>' +
      '</div>' +

      // Status badge
      '<div style="background:#F0FDF4;border-bottom:1px solid #BBF7D0;padding:14px 32px;text-align:center;">' +
        '<span style="background:#16A34A;color:#fff;padding:5px 18px;border-radius:20px;font-size:13px;font-weight:bold;">' +
          '&#10003; Application Received' +
        '</span>' +
      '</div>' +

      // Body
      '<div style="padding:32px;background:#fff;">' +
        '<p style="font-size:17px;color:#111827;margin:0 0 6px;">Hi <strong>' + candidate.fullName + '</strong>,</p>' +
        '<p style="color:#374151;margin:0 0 24px;line-height:1.6;">' +
          'Thank you for applying for the <strong>' + candidate.position + '</strong> role at ' +
          '<strong>' + COMPANY_NAME + '</strong>. We have received your application and our team will review it shortly.' +
        '</p>' +

        // Summary card
        '<div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:20px;margin-bottom:24px;">' +
          '<p style="margin:0 0 14px;font-weight:bold;font-size:14px;color:#111827;">Application Summary</p>' +
          '<table style="width:100%;font-size:14px;border-collapse:collapse;">' +
            '<tr style="border-bottom:1px solid #F3F4F6;">' +
              '<td style="padding:8px 0;color:#6B7280;width:130px;">Position</td>' +
              '<td style="padding:8px 0;color:#111827;font-weight:600;">' + candidate.position + '</td>' +
            '</tr>' +
            '<tr style="border-bottom:1px solid #F3F4F6;">' +
              '<td style="padding:8px 0;color:#6B7280;">Name</td>' +
              '<td style="padding:8px 0;color:#111827;">' + candidate.fullName + '</td>' +
            '</tr>' +
            '<tr style="border-bottom:1px solid #F3F4F6;">' +
              '<td style="padding:8px 0;color:#6B7280;">Email</td>' +
              '<td style="padding:8px 0;color:#111827;">' + candidate.email + '</td>' +
            '</tr>' +
            '<tr style="border-bottom:1px solid #F3F4F6;">' +
              '<td style="padding:8px 0;color:#6B7280;">Phone</td>' +
              '<td style="padding:8px 0;color:#111827;">' + (candidate.phone || 'Not provided') + '</td>' +
            '</tr>' +
            '<tr style="border-bottom:1px solid #F3F4F6;">' +
              '<td style="padding:8px 0;color:#6B7280;">Location</td>' +
              '<td style="padding:8px 0;color:#111827;">' + (candidate.location || 'Not provided') + '</td>' +
            '</tr>' +
            '<tr>' +
              '<td style="padding:8px 0;color:#6B7280;">Applied On</td>' +
              '<td style="padding:8px 0;color:#111827;">' + new Date().toLocaleDateString("en-IN", {dateStyle:"long"}) + '</td>' +
            '</tr>' +
          '</table>' +
        '</div>' +

        // Next steps
        '<div style="margin-bottom:24px;">' +
          '<p style="font-weight:bold;font-size:15px;color:#111827;margin:0 0 14px;">&#128336; What Happens Next?</p>' +

          // Step 1
          '<div style="display:flex;margin-bottom:12px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:14px 16px;">' +
            '<div style="min-width:36px;height:36px;background:#4F46E5;color:#fff;border-radius:50%;' +
              'text-align:center;line-height:36px;font-weight:bold;font-size:14px;margin-right:14px;flex-shrink:0;">1</div>' +
            '<div>' +
              '<p style="margin:0 0 3px;font-weight:bold;font-size:13px;color:#111827;">Resume Review </p>' +
              '<p style="margin:0;font-size:13px;color:#374151;line-height:1.5;">Our HR team will carefully review your application and assess your fit for the <strong>' + candidate.position + '</strong> role.</p>' +
            '</div>' +
          '</div>' +

          // Step 2
          '<div style="display:flex;margin-bottom:12px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:14px 16px;">' +
            '<div style="min-width:36px;height:36px;background:#4F46E5;color:#fff;border-radius:50%;' +
              'text-align:center;line-height:36px;font-weight:bold;font-size:14px;margin-right:14px;flex-shrink:0;">2</div>' +
            '<div>' +
              '<p style="margin:0 0 3px;font-weight:bold;font-size:13px;color:#111827;">Screening Call &nbsp;<span style="font-weight:normal;color:#6B7280;font-size:12px;">&#183; If Shortlisted</span></p>' +
              '<p style="margin:0;font-size:13px;color:#374151;line-height:1.5;">A member of our HR team will reach out to schedule a brief introductory call to learn more about you and your experience.</p>' +
            '</div>' +
          '</div>' +

          // Step 3
          '<div style="display:flex;margin-bottom:12px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:14px 16px;">' +
            '<div style="min-width:36px;height:36px;background:#4F46E5;color:#fff;border-radius:50%;' +
              'text-align:center;line-height:36px;font-weight:bold;font-size:14px;margin-right:14px;flex-shrink:0;">3</div>' +
            '<div>' +
              '<p style="margin:0 0 3px;font-weight:bold;font-size:13px;color:#111827;">Interview Round &nbsp;<span style="font-weight:normal;color:#6B7280;font-size:12px;">&#183; Technical / Managerial</span></p>' +
              '<p style="margin:0;font-size:13px;color:#374151;line-height:1.5;">Shortlisted candidates will be invited for one or more interview rounds with our team &mdash; conducted online or in person.</p>' +
            '</div>' +
          '</div>' +

          // Step 4
          '<div style="display:flex;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:14px 16px;">' +
            '<div style="min-width:36px;height:36px;background:#4F46E5;color:#fff;border-radius:50%;' +
              'text-align:center;line-height:36px;font-weight:bold;font-size:14px;margin-right:14px;flex-shrink:0;">4</div>' +
            '<div>' +
              '<p style="margin:0 0 3px;font-weight:bold;font-size:13px;color:#111827;">Final Decision </p>' +
              '<p style="margin:0;font-size:13px;color:#374151;line-height:1.5;">We will communicate the outcome via email regardless of the result. Selected candidates will receive a formal offer letter.</p>' +
            '</div>' +
          '</div>' +

        '</div>' +

        '<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:12px 16px;margin-bottom:20px;">' +
          '<p style="margin:0;font-size:13px;color:#92400E;">&#128276; <strong>Tip:</strong> We appreciate your patience throughout the process. Feel free to reach out to us if you have any questions while you wait.</p>' +
        '</div>' +

        '<p style="font-size:13px;color:#6B7280;margin:0;">' +
          'For any queries, feel free to contact us at ' +
          '<a href="mailto:' + HR_EMAIL + '" style="color:#4F46E5;font-weight:600;">' + HR_EMAIL + '</a>' +
        '</p>' +
        '<p style="margin-top:24px;color:#374151;">Best regards,<br>' +
          '<strong>' + COMPANY_NAME + ' &mdash; HR Team</strong>' +
        '</p>' +
      '</div>' +

      emailFooter() +
    '</div>';

  GmailApp.sendEmail(candidate.email, subject, "", {
  htmlBody: body,
  replyTo: HR_EMAIL,
  name: "Talent Acquisition Team",
  from: HR_EMAIL
  });
}


// ── 2. Resume Shortlisted ────────────────────────────────────
// FIX: Updated subject/badge wording — says "Resume Shortlisted, Prepare for Interview"
// FIX: Added "Best of Luck" per business requirement
function sendShortlistEmail(candidate) {
  const subject = "Your Resume Has Been Shortlisted - " + candidate.position + " | " + COMPANY_NAME;

  const body =
    '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">' +

      // Header
      '<div style="background:linear-gradient(135deg,#064E3B 0%,#065F46 60%,#059669 100%);padding:32px 32px 24px;text-align:center;">' +
        '<img src="' + LOGO_BASE64 + '" alt="Logo" width="64" height="64" ' +
          'style="border-radius:14px;margin-bottom:16px;display:block;margin-left:auto;margin-right:auto;border:3px solid rgba(255,255,255,0.2);" />' +
        '<h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:-0.5px;">' + COMPANY_NAME + '</h1>' +
        '<p style="color:#6EE7B7;margin:6px 0 0;font-size:13px;letter-spacing:2px;text-transform:uppercase;">Careers Portal</p>' +
      '</div>' +

      // Status badge
      '<div style="background:#F0FDF4;border-bottom:1px solid #BBF7D0;padding:14px 32px;text-align:center;">' +
        '<span style="background:#059669;color:#fff;padding:5px 18px;border-radius:20px;font-size:13px;font-weight:bold;">' +
          '&#9733; Resume Shortlisted &mdash; Prepare for Your Interview!' +
        '</span>' +
      '</div>' +

      '<div style="padding:32px;background:#fff;">' +
        '<p style="font-size:17px;color:#111827;margin:0 0 6px;">Hi <strong>' + candidate.fullName + '</strong>,</p>' +
        '<p style="color:#374151;margin:0 0 20px;line-height:1.6;">' +
          'Great news! Your resume for the <strong>' + candidate.position + '</strong> role has been ' +
          '<strong style="color:#059669;">shortlisted</strong> by our HR team. ' +
          'Congratulations on clearing the first stage of your selection!' +
        '</p>' +

        '<div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:10px;padding:20px;margin-bottom:20px;">' +
          '<p style="margin:0 0 8px;font-weight:bold;font-size:14px;color:#065F46;">&#128197; What Happens Next?</p>' +
          '<p style="margin:0;font-size:14px;color:#065F46;line-height:1.6;">' +
            'Our HR team will contact you within <strong>1&ndash;2 business days</strong> to schedule your interview. ' +
            'Please keep an eye on your inbox and phone.' +
          '</p>' +
        '</div>' +

        '<div style="background:#F0FDF4;border:1px solid #A7F3D0;border-radius:10px;padding:20px;margin-bottom:20px;">' +
          '<p style="margin:0 0 8px;font-weight:bold;font-size:14px;color:#065F46;">&#127919; Prepare for the Interview</p>' +
          '<p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">' +
            'Take some time to review the job requirements, research <strong>' + COMPANY_NAME + '</strong>, ' +
            'and brush up on your skills. Preparation goes a long way — <strong>Best of Luck!</strong> &#127808;' +
          '</p>' +
        '</div>' +

        '<p style="font-size:14px;color:#374151;line-height:1.6;">' +
          'We encourage you to learn more about ' +
          '<a href="' + WEBSITE_URL + '" style="color:#059669;">' + COMPANY_NAME + '</a> ' +
          'before the interview.' +
        '</p>' +

        '<p style="font-size:13px;color:#6B7280;margin-top:20px;">' +
          'Questions? Reach us at <a href="mailto:' + HR_EMAIL + '" style="color:#059669;font-weight:600;">' + HR_EMAIL + '</a>' +
        '</p>' +
        '<p style="margin-top:24px;color:#374151;">Best regards,<br>' +
          '<strong>' + COMPANY_NAME + ' &mdash; HR Team</strong>' +
        '</p>' +
      '</div>' +

      emailFooter() +
    '</div>';

  GmailApp.sendEmail(candidate.email, subject, "", {
  htmlBody: body,
  replyTo: HR_EMAIL,
  name: "Talent Acquisition Team",
  from: HR_EMAIL
  });
}


// ── 3. Offer Extended ────────────────────────────────────────
function sendOfferEmail(candidate) {
  const subject = "Job Offer - " + candidate.position + " | " + COMPANY_NAME;

  const body =
    '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">' +

      // Header
      '<div style="background:linear-gradient(135deg,#4C1D95 0%,#6D28D9 60%,#7C3AED 100%);padding:32px 32px 24px;text-align:center;">' +
        '<img src="' + LOGO_BASE64 + '" alt="Logo" width="64" height="64" ' +
          'style="border-radius:14px;margin-bottom:16px;display:block;margin-left:auto;margin-right:auto;border:3px solid rgba(255,255,255,0.2);" />' +
        '<h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:-0.5px;">' + COMPANY_NAME + '</h1>' +
        '<p style="color:#DDD6FE;margin:6px 0 0;font-size:13px;letter-spacing:2px;text-transform:uppercase;">Careers Portal</p>' +
      '</div>' +

      // Status badge
      '<div style="background:#FAF5FF;border-bottom:1px solid #DDD6FE;padding:14px 32px;text-align:center;">' +
        '<span style="background:#7C3AED;color:#fff;padding:5px 18px;border-radius:20px;font-size:13px;font-weight:bold;">' +
          '&#127881; Congratulations &mdash; Offer Extended!' +
        '</span>' +
      '</div>' +

      '<div style="padding:32px;background:#fff;">' +
        '<p style="font-size:17px;color:#111827;margin:0 0 6px;">Hi <strong>' + candidate.fullName + '</strong>,</p>' +
        '<p style="color:#374151;margin:0 0 20px;line-height:1.6;">' +
          'We are thrilled to inform you that <strong>' + COMPANY_NAME + '</strong> would like to extend a ' +
          '<strong style="color:#7C3AED;">job offer</strong> to you for the position of ' +
          '<strong>' + candidate.position + '</strong>!' +
        '</p>' +

        '<div style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:10px;padding:20px;margin-bottom:24px;">' +
          '<p style="margin:0 0 8px;font-weight:bold;font-size:14px;color:#4C1D95;">Offer Details</p>' +
          '<p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">' + candidate.offered + '</p>' +
        '</div>' +

        '<p style="font-size:14px;color:#374151;line-height:1.6;">' +
          'Our HR team will reach out within <strong>24 hours</strong> with the formal offer letter and onboarding details.' +
        '</p>' +
        '<p style="font-size:14px;color:#374151;margin-top:12px;">' +
          'Please confirm your acceptance by replying to ' +
          '<a href="mailto:' + HR_EMAIL + '" style="color:#7C3AED;font-weight:600;">' + HR_EMAIL + '</a>' +
        '</p>' +

        '<p style="margin-top:28px;font-size:16px;color:#374151;">' +
          'Welcome to the <strong>Zyntrix family!</strong><br><br>' +
          'Best regards,<br><strong>' + COMPANY_NAME + ' &mdash; HR Team</strong>' +
        '</p>' +
      '</div>' +

      emailFooter() +
    '</div>';

  GmailApp.sendEmail(candidate.email, subject, "", {
  htmlBody: body,
  replyTo: HR_EMAIL,
  name: "Talent Acquisition Team",
  from: HR_EMAIL
  });
}


// ════════════════════════════════════════════════════════════
//  doGet — READ all candidates
// ════════════════════════════════════════════════════════════

function doGet(e) {
  try {
    const sheet = getSheet();
    if (sheet.getLastRow() <= 1) {
      return cors(ContentService.createTextOutput(JSON.stringify({ success: true, candidates: [] })));
    }
    const lastRow = sheet.getLastRow();
    const lastCol = Math.max(sheet.getLastColumn(), HEADERS.length);
    const values  = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    const candidates = values
      .filter(row => row[COL.EMAIL] || row[COL.FULL_NAME])
      .map(row => ({
        timestamp       : row[COL.TIMESTAMP]        ? String(row[COL.TIMESTAMP]) : "",
        position        : row[COL.POSITION]         || "",
        fullName        : row[COL.FULL_NAME]        || "",
        email           : row[COL.EMAIL]            || "",
        phone           : row[COL.PHONE]            || "",
        qualifications  : row[COL.QUALIFICATIONS]   || "",
        experience      : row[COL.EXPERIENCE]       || "",
        location        : row[COL.LOCATION]         || "",
        edtech          : row[COL.EDTECH]           || "",
        availability    : row[COL.AVAILABILITY]     || "",
        resumeLink      : row[COL.RESUME_LINK]      || "",
        source          : row[COL.SOURCE]           || "",
        declaration     : row[COL.DECLARATION]      || "",
        shortlisted     : row[COL.SHORTLISTED] === true
                          || String(row[COL.SHORTLISTED]).toLowerCase() === "true"
                          || String(row[COL.SHORTLISTED]).toLowerCase() === "yes",
        stage           : row[COL.INTERVIEW_STATUS] || "Applied",
        offered         : row[COL.OFFERED]          || "",
      }));
    return cors(ContentService.createTextOutput(JSON.stringify({ success: true, candidates })));
  } catch (err) {
    return cors(ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() })));
  }
}


// ════════════════════════════════════════════════════════════
//  doPost — NEW submission  OR  updateCandidate
// ════════════════════════════════════════════════════════════

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // ── Branch 1: CRM is updating shortlist / stage / offered ──
    if (data.action === "updateCandidate") {
      const sheet    = getSheet();
      const lastRow  = sheet.getLastRow();
      if (lastRow < 2) throw new Error("Sheet has no candidate rows");

      const emailCol = COL.EMAIL + 1;
      const emails   = sheet.getRange(2, emailCol, lastRow - 1, 1).getValues();
      let   targetRow = -1;
      for (let i = 0; i < emails.length; i++) {
        if (String(emails[i][0]).trim().toLowerCase() === String(data.email).trim().toLowerCase()) {
          targetRow = i + 2;
          break;
        }
      }
      if (targetRow === -1) throw new Error("Candidate not found: " + data.email);

      const existingRow    = sheet.getRange(targetRow, 1, 1, HEADERS.length).getValues()[0];
      const wasShortlisted = existingRow[COL.SHORTLISTED] === true
                             || String(existingRow[COL.SHORTLISTED]).toLowerCase() === "true";
      const wasOffered     = existingRow[COL.OFFERED] && String(existingRow[COL.OFFERED]).trim() !== "";

      // ── FIX: Write Resume Shortlisted (col N) correctly ──────────────────
      sheet.getRange(targetRow, COL.SHORTLISTED + 1).setValue(!!data.shortlisted);

      // ── FIX: Resume Shortlist must ONLY touch col N — never col O ──────────
      // Col O (Interview Shortlisted) is only updated when HR explicitly sets
      // an interview stage AFTER the resume shortlist has already been done.
      // On a fresh resume-shortlist, leave col O exactly as it is (empty).
      const isNewShortlist = (!!data.shortlisted && !wasShortlisted);
      if (!isNewShortlist) {
        // HR is updating an already-shortlisted candidate's interview stage
        const stageToWrite = data.stage || existingRow[COL.INTERVIEW_STATUS] || "";
        sheet.getRange(targetRow, COL.INTERVIEW_STATUS + 1).setValue(stageToWrite);
      }
      // If isNewShortlist === true, we do NOT write to col O at all.

      sheet.getRange(targetRow, COL.OFFERED + 1).setValue(data.offered || data.hrNotes || "");

      const candidate = {
        fullName : existingRow[COL.FULL_NAME],
        email    : existingRow[COL.EMAIL],
        position : existingRow[COL.POSITION],
        offered  : data.offered || data.hrNotes || "",
      };

      try {
        if (data.shortlisted === true && !wasShortlisted) sendShortlistEmail(candidate);
        if (candidate.offered.trim() !== "" && !wasOffered) sendOfferEmail(candidate);
      } catch (mailErr) {
        console.error("Status email failed: " + mailErr.toString());
      }

      return cors(ContentService.createTextOutput(JSON.stringify({ success: true })));
    }

    // ── Branch 2: New job application ──────────────────────
    let resumeLink = "";
    if (data.resumeBase64 && data.resumeName) {
      const folder  = DriveApp.getFolderById(DRIVE_FOLDER_ID);
      const decoded = Utilities.base64Decode(data.resumeBase64);
      const blob    = Utilities.newBlob(decoded, "application/pdf", data.resumeName);
      const file    = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      resumeLink = file.getUrl();
    }

    const sheet = getSheet();
    ensureHeaders(sheet);

    const row = [
      data.timestamp      || new Date().toISOString(),
      data.position       || "",
      data.fullName       || "",
      data.email          || "",
      data.phone          || "",
      data.qualifications || "",
      data.experience     || "",
      data.stateAddress   || "",
      data.edtech         || "",
      data.availability   || "",
      resumeLink,
      data.source         || "",
      data.declaration    || "",
      "",       // Col N: Resume shortlisted — starts empty
      "",       // Col O: Interview Shortlisted — starts empty (HR sets this later)
      "",       // Col P: Offered
    ];

    sheet.appendRow(row);
    sheet.autoResizeColumns(1, HEADERS.length);

    try {
      sendApplicationConfirmationEmail({
        fullName : data.fullName     || "",
        email    : data.email        || "",
        position : data.position     || "",
        phone    : data.phone        || "",
        location : data.stateAddress || "",
      });
    } catch (mailErr) {
      console.error("Confirmation email failed: " + mailErr.toString());
    }

    return cors(ContentService.createTextOutput(JSON.stringify({ status: "success", success: true })));

  } catch (err) {
    return cors(ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() })));
  }
}
