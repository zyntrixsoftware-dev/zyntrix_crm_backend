// ============================================================
//  Google Apps Script — Resume Shortlist Email Trigger
//  Company : Zyntrix Software Solution
//  Purpose : Automatically sends a shortlist email to the
//            candidate when "Resume shortlisted" (Col N)
//            is changed to TRUE in the Sheet.
// ============================================================

// ── CONFIG ──────────────────────────────────────────────────
const SHEET_ID_SL      = "11aTN-lg6PWMGlB5OzNCoWtGIuqcjbh0Ctffg7Z0d8vs";
const SHEET_NAME_SL    = "Sheet1";

const COMPANY_NAME_SL  = "Zyntrix Software Solution";
const HR_EMAIL_SL      = "hr@zyntrixsoftware.com";
const WEBSITE_URL_SL   = "https://zyntrixsoftware.com";
const LINKEDIN_URL_SL  = "https://www.linkedin.com/company/zyntrix-software-solutions-pvt-ltd";
const YOUTUBE_URL_SL   = "https://www.youtube.com/@zyntrixsoftware";
const INSTAGRAM_URL_SL = "https://www.instagram.com/zyntrixsoftware";

// Column indices — 0-based (for reading row array)
const COL_SL = {
  POSITION           : 1,   // Column B
  FULL_NAME          : 2,   // Column C
  EMAIL              : 3,   // Column D
  PHONE              : 4,   // Column E
  // ── FIX: Was INTERVIEW_STATUS:14 (col O). Correct column is N (index 13) ──
  RESUME_SHORTLISTED : 13,  // Column N  "Resume shortlisted"  ← FIXED
  EMAIL_SENT_FLAG    : 17,  // Column R  — duplicate-send guard
};

// ════════════════════════════════════════════════════════════
//  FOOTER
// ════════════════════════════════════════════════════════════
function footerSL() {
  return (
    '<div style="background:#111827;padding:28px 32px;text-align:center;">' +
      '<p style="color:#F9FAFB;font-size:14px;font-weight:bold;margin:0 0 4px;">' + COMPANY_NAME_SL + '</p>' +
      '<a href="' + WEBSITE_URL_SL + '" style="color:#6EE7B7;font-size:12px;text-decoration:none;">' + WEBSITE_URL_SL + '</a>' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px auto 10px;border-collapse:collapse;">' +
        '<tr>' +
          '<td style="padding:0 6px;">' +
            '<a href="' + LINKEDIN_URL_SL + '" style="text-decoration:none;">' +
              '<span style="display:inline-block;background:#0A66C2;color:#fff;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:bold;">in&nbsp;LinkedIn</span>' +
            '</a>' +
          '</td>' +
          '<td style="padding:0 6px;">' +
            '<a href="' + YOUTUBE_URL_SL + '" style="text-decoration:none;">' +
              '<span style="display:inline-block;background:#FF0000;color:#fff;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:bold;">&#9654;&nbsp;YouTube</span>' +
            '</a>' +
          '</td>' +
          '<td style="padding:0 6px;">' +
            '<a href="' + INSTAGRAM_URL_SL + '" style="text-decoration:none;">' +
              '<span style="display:inline-block;background:#C13584;color:#fff;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:bold;">&#10084;&nbsp;Instagram</span>' +
            '</a>' +
          '</td>' +
        '</tr>' +
      '</table>' +
      '<p style="color:#9CA3AF;font-size:11px;margin:10px 0 0;">Questions? Contact us at <a href="mailto:' + HR_EMAIL_SL + '" style="color:#6EE7B7;">' + HR_EMAIL_SL + '</a></p>' +
      '<p style="color:#4B5563;font-size:11px;margin:6px 0 0;">This is an automated message. Please do not reply directly.</p>' +
    '</div>'
  );
}

// ════════════════════════════════════════════════════════════
//  EMAIL — Resume Shortlisted
// ════════════════════════════════════════════════════════════
function sendShortlistNotification(candidate) {
  const subject = "🎉 Your Resume Has Been Shortlisted! – " + candidate.position + " | " + COMPANY_NAME_SL;

  const body =
    '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">' +

      // Header
      '<div style="background:linear-gradient(135deg,#064E3B 0%,#065F46 60%,#059669 100%);padding:32px 32px 24px;text-align:center;">' +
        '<h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:-0.5px;">' + COMPANY_NAME_SL + '</h1>' +
        '<p style="color:#6EE7B7;margin:6px 0 0;font-size:13px;letter-spacing:2px;text-transform:uppercase;">Talent Acquisition Team</p>' +
      '</div>' +

      // Badge
      '<div style="background:#F0FDF4;border-bottom:1px solid #BBF7D0;padding:14px 32px;text-align:center;">' +
        '<span style="background:#059669;color:#fff;padding:6px 22px;border-radius:20px;font-size:14px;font-weight:bold;">' +
          '&#9733;&nbsp; Resume Shortlisted — Prepare for Your Interview!' +
        '</span>' +
      '</div>' +

      // Body
      '<div style="padding:32px;background:#fff;">' +

        '<p style="font-size:18px;color:#111827;margin:0 0 6px;">Dear <strong>' + candidate.fullName + '</strong>,</p>' +
        '<p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 24px;">' +
          'We are excited to inform you that after a careful review of your application for the ' +
          '<strong>' + candidate.position + '</strong> role at <strong>' + COMPANY_NAME_SL + '</strong>, ' +
          'your <strong style="color:#059669;">resume has been shortlisted</strong> by our recruiter. ' +
          'Congratulations — you have cleared the first stage of our selection process!' +
        '</p>' +

        // Call-out card
        '<div style="background:#ECFDF5;border-left:4px solid #059669;border-radius:8px;padding:18px 20px;margin-bottom:24px;">' +
          '<p style="margin:0 0 6px;font-size:15px;font-weight:bold;color:#065F46;">📞 What Happens Next?</p>' +
          '<p style="margin:0;font-size:14px;color:#065F46;line-height:1.7;">' +
            'A member of our HR team will be reaching out to you <strong>shortly</strong> to schedule your ' +
            '<strong>interview</strong>. Please ensure your phone is reachable and keep an eye on your inbox.' +
          '</p>' +
        '</div>' +

        // Preparation tip
        '<div style="background:#F0FDF4;border:1px solid #A7F3D0;border-radius:8px;padding:16px 20px;margin-bottom:24px;">' +
          '<p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:#065F46;">🎯 Prepare for the Interview</p>' +
          '<p style="margin:0;font-size:13px;color:#374151;line-height:1.7;">' +
            'Take some time to review the role requirements, research <strong>' + COMPANY_NAME_SL + '</strong>, ' +
            'and brush up on your technical skills. Preparation goes a long way — <strong>Best of Luck!</strong> 🍀' +
          '</p>' +
        '</div>' +

        // Journey timeline
        '<p style="font-weight:bold;font-size:15px;color:#111827;margin:0 0 14px;">&#128197;&nbsp;Your Selection Journey</p>' +

        // Step 1 — done
        '<div style="display:flex;align-items:flex-start;margin-bottom:10px;">' +
          '<div style="min-width:32px;height:32px;background:#059669;color:#fff;border-radius:50%;text-align:center;line-height:32px;font-size:13px;font-weight:bold;margin-right:14px;flex-shrink:0;">✓</div>' +
          '<div style="padding-top:6px;">' +
            '<p style="margin:0;font-size:13px;font-weight:bold;color:#059669;">Application Received</p>' +
            '<p style="margin:2px 0 0;font-size:12px;color:#6B7280;">Your application was successfully submitted.</p>' +
          '</div>' +
        '</div>' +

        // Step 2 — current
        '<div style="display:flex;align-items:flex-start;margin-bottom:10px;">' +
          '<div style="min-width:32px;height:32px;background:#059669;color:#fff;border-radius:50%;text-align:center;line-height:32px;font-size:13px;font-weight:bold;margin-right:14px;flex-shrink:0;">✓</div>' +
          '<div style="background:#F0FDF4;border:1px solid #A7F3D0;border-radius:8px;padding:10px 14px;">' +
            '<p style="margin:0;font-size:13px;font-weight:bold;color:#065F46;">🎉 Resume Shortlisted — <em>You are here!</em></p>' +
            '<p style="margin:4px 0 0;font-size:12px;color:#374151;">Your profile has been approved by our recruiter.</p>' +
          '</div>' +
        '</div>' +

        // Step 3 — upcoming
        '<div style="display:flex;align-items:flex-start;margin-bottom:10px;">' +
          '<div style="min-width:32px;height:32px;background:#D1FAE5;color:#059669;border-radius:50%;text-align:center;line-height:32px;font-size:13px;font-weight:bold;margin-right:14px;flex-shrink:0;border:2px solid #059669;">3</div>' +
          '<div style="padding-top:6px;">' +
            '<p style="margin:0;font-size:13px;font-weight:bold;color:#374151;">HR Screening Call</p>' +
            '<p style="margin:2px 0 0;font-size:12px;color:#6B7280;">Our HR will call you to schedule the interview.</p>' +
          '</div>' +
        '</div>' +

        // Step 4 — upcoming
        '<div style="display:flex;align-items:flex-start;margin-bottom:10px;">' +
          '<div style="min-width:32px;height:32px;background:#F3F4F6;color:#9CA3AF;border-radius:50%;text-align:center;line-height:32px;font-size:13px;font-weight:bold;margin-right:14px;flex-shrink:0;">4</div>' +
          '<div style="padding-top:6px;">' +
            '<p style="margin:0;font-size:13px;font-weight:bold;color:#9CA3AF;">Interview Round</p>' +
            '<p style="margin:2px 0 0;font-size:12px;color:#9CA3AF;">Technical / Managerial round — online or in person.</p>' +
          '</div>' +
        '</div>' +

        // Step 5 — upcoming
        '<div style="display:flex;align-items:flex-start;margin-bottom:24px;">' +
          '<div style="min-width:32px;height:32px;background:#F3F4F6;color:#9CA3AF;border-radius:50%;text-align:center;line-height:32px;font-size:13px;font-weight:bold;margin-right:14px;flex-shrink:0;">5</div>' +
          '<div style="padding-top:6px;">' +
            '<p style="margin:0;font-size:13px;font-weight:bold;color:#9CA3AF;">Final Decision &amp; Offer</p>' +
            '<p style="margin:2px 0 0;font-size:12px;color:#9CA3AF;">Selected candidates receive a formal offer letter.</p>' +
          '</div>' +
        '</div>' +

        // Tip box
        '<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:12px 16px;margin-bottom:24px;">' +
          '<p style="margin:0;font-size:13px;color:#92400E;">' +
            '&#128276; <strong>Tip:</strong> Please keep your phone reachable and check your email regularly. ' +
            'Our HR team will contact you <strong>as soon as possible</strong> to confirm your interview slot.' +
          '</p>' +
        '</div>' +

        // Summary card
        '<div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:18px 20px;margin-bottom:24px;">' +
          '<p style="margin:0 0 12px;font-weight:bold;font-size:14px;color:#111827;">Application Summary</p>' +
          '<table style="width:100%;font-size:13px;border-collapse:collapse;">' +
            '<tr style="border-bottom:1px solid #F3F4F6;">' +
              '<td style="padding:7px 0;color:#6B7280;width:120px;">Name</td>' +
              '<td style="padding:7px 0;color:#111827;font-weight:600;">' + candidate.fullName + '</td>' +
            '</tr>' +
            '<tr style="border-bottom:1px solid #F3F4F6;">' +
              '<td style="padding:7px 0;color:#6B7280;">Position</td>' +
              '<td style="padding:7px 0;color:#111827;font-weight:600;">' + candidate.position + '</td>' +
            '</tr>' +
            '<tr style="border-bottom:1px solid #F3F4F6;">' +
              '<td style="padding:7px 0;color:#6B7280;">Email</td>' +
              '<td style="padding:7px 0;color:#111827;">' + candidate.email + '</td>' +
            '</tr>' +
            '<tr>' +
              '<td style="padding:7px 0;color:#6B7280;">Phone</td>' +
              '<td style="padding:7px 0;color:#111827;">' + (candidate.phone || "Not provided") + '</td>' +
            '</tr>' +
          '</table>' +
        '</div>' +

        '<p style="font-size:13px;color:#6B7280;">' +
          'For any queries, contact us at ' +
          '<a href="mailto:' + HR_EMAIL_SL + '" style="color:#059669;font-weight:600;">' + HR_EMAIL_SL + '</a>' +
        '</p>' +
        '<p style="margin-top:24px;color:#374151;font-size:14px;">' +
          'Warm regards,<br>' +
          '<strong>' + COMPANY_NAME_SL + ' &mdash; HR &amp; Talent Acquisition Team</strong>' +
        '</p>' +

      '</div>' +
      footerSL() +
    '</div>';

  GmailApp.sendEmail(candidate.email, subject, "", {
    htmlBody : body,
    replyTo  : HR_EMAIL_SL,
    name     : "Talent Acquisition Team",
    from     : HR_EMAIL_SL,
  });
}

// ════════════════════════════════════════════════════════════
//  TRIGGER FUNCTION — fires on every spreadsheet edit
// ════════════════════════════════════════════════════════════
function onShortlistEdit(e) {
  try {
    const sheet = e.source.getActiveSheet();
    if (sheet.getName() !== SHEET_NAME_SL) return;

    const editedCol = e.range.getColumn(); // 1-based
    const editedRow = e.range.getRow();

    // ── FIX: React to Column N (1-based = 14) "Resume shortlisted" ──
    // Previously was checking column 15 (O = Interview Shortlisted) — WRONG
    if (editedCol !== 14) return;
    if (editedRow < 2)    return; // skip header row

    // ── FIX: Check for "true" not "Applied" (old code was completely backwards) ──
    const newValue = String(e.value || "").trim().toLowerCase();
    const isShortlisted = (newValue === "true");
    if (!isShortlisted) return;

    // Read the candidate's row data (columns A–R = 18 columns)
    const rowData = sheet.getRange(editedRow, 1, 1, 18).getValues()[0];

    // Duplicate-send guard — Column R (index 17)
    const alreadySent = String(rowData[COL_SL.EMAIL_SENT_FLAG] || "").trim().toLowerCase();
    if (alreadySent.startsWith("sent")) return;

    const candidate = {
      fullName : String(rowData[COL_SL.FULL_NAME] || "").trim(),
      email    : String(rowData[COL_SL.EMAIL]     || "").trim(),
      position : String(rowData[COL_SL.POSITION]  || "").trim(),
      phone    : String(rowData[COL_SL.PHONE]     || "").trim(),
    };

    if (!candidate.email) {
      console.error("Row " + editedRow + ": No email found — skipping.");
      return;
    }

    // Send the email
    sendShortlistNotification(candidate);

    // Write the sent-flag to Column R so we never double-send
    sheet.getRange(editedRow, COL_SL.EMAIL_SENT_FLAG + 1)
         .setValue("Sent – " + new Date().toLocaleString("en-IN"));

    console.log("✅ Resume shortlist email sent → " + candidate.email);

  } catch (err) {
    console.error("onShortlistEdit error: " + err.toString());
    // Never rethrow — sheet edit must always succeed
  }
}

// ════════════════════════════════════════════════════════════
//  TRIGGER SETUP REMINDER
// ════════════════════════════════════════════════════════════
//  1. Triggers (clock icon) → + Add Trigger
//  2. Function  : onShortlistEdit
//  3. Event src : From spreadsheet
//  4. Event type: On edit
//  5. Save & Authorise
// ════════════════════════════════════════════════════════════
