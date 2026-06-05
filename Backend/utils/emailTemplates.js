/**
 * emailTemplates.js
 *
 * Branded HTML email templates for Zyntrix Software Solution.
 * Ported from Google Apps Script (Code.gs) to Node.js so all
 * emails are sent via nodemailer SMTP (Gmail 500/day) instead
 * of GAS GmailApp (100/day quota).
 *
 * Every exported function returns { subject, html } so callers
 * can pass straight into sendEmail(to, subject, text, { html }).
 */

// ── BRAND CONFIG ─────────────────────────────────────────────────────────────
const COMPANY_NAME  = "Zyntrix Software Solution Pvt Ltd";
const HR_EMAIL      = "hr@zyntrixsoftware.com";
const WEBSITE_URL   = "https://zyntrixsoftware.com";
const LINKEDIN_URL  = "https://www.linkedin.com/company/zyntrix-software-solutions-pvt-ltd";
const YOUTUBE_URL   = "https://www.youtube.com/@zyntrixsoftware";
const INSTAGRAM_URL = "https://www.instagram.com/zyntrixsoftware";
const LOGO_URL      = "https://drive.google.com/uc?export=view&id=1UegVZ6a_6DepJSzudlO16aTn7DdYaza0";

// ── BRAND COLORS ─────────────────────────────────────────────────────────────
const C_BLACK       = "#0A0A0A";
const C_LIME        = "#AAFF00";
const C_LIME_LIGHT  = "#F2FFD6";
const C_LIME_DARK   = "#7ACC00";
const C_WHITE       = "#FFFFFF";
const C_GRAY_DARK   = "#1A1A1A";
const C_GRAY_MID    = "#444444";
const C_GRAY_LIGHT  = "#888888";
const C_GRAY_BORDER = "#E5E7EB";

// ── SHARED PARTIALS ──────────────────────────────────────────────────────────
function _header(tagline) {
  return (
    `<div style="background:${C_BLACK};padding:28px 32px;text-align:center;">` +
      `<img src="${LOGO_URL}" alt="${COMPANY_NAME} Logo" width="100" height="100" ` +
           `style="display:block;margin:0 auto 14px;border-radius:6px;" />` +
      `<p style="color:${C_LIME};margin:0;font-size:18px;font-weight:bold;letter-spacing:0.5px;">${COMPANY_NAME}</p>` +
      `<p style="color:${C_GRAY_LIGHT};margin:5px 0 0;font-size:11px;letter-spacing:2px;text-transform:uppercase;">${tagline}</p>` +
    `</div>`
  );
}

function _footer() {
  return (
    `<div style="background:${C_BLACK};padding:24px 32px;text-align:center;">` +
      `<p style="color:${C_LIME};font-size:14px;font-weight:bold;margin:0 0 4px;">${COMPANY_NAME}</p>` +
      `<p style="color:${C_GRAY_LIGHT};font-size:11px;margin:0 0 4px;">GST No: 37AACCZ9867D1ZR</p>` +
      `<a href="${WEBSITE_URL}" style="color:${C_GRAY_LIGHT};font-size:12px;text-decoration:none;">${WEBSITE_URL}</a>` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px auto 10px;border-collapse:collapse;"><tr>` +
        `<td style="padding:0 5px;"><a href="${LINKEDIN_URL}" style="text-decoration:none;"><span style="display:inline-block;background:#0A66C2;color:#fff;border-radius:6px;padding:5px 12px;font-size:11px;font-weight:bold;">LinkedIn</span></a></td>` +
        `<td style="padding:0 5px;"><a href="${YOUTUBE_URL}" style="text-decoration:none;"><span style="display:inline-block;background:#FF0000;color:#fff;border-radius:6px;padding:5px 12px;font-size:11px;font-weight:bold;">YouTube</span></a></td>` +
        `<td style="padding:0 5px;"><a href="${INSTAGRAM_URL}" style="text-decoration:none;"><span style="display:inline-block;background:#C13584;color:#fff;border-radius:6px;padding:5px 12px;font-size:11px;font-weight:bold;">Instagram</span></a></td>` +
      `</tr></table>` +
      `<p style="color:${C_GRAY_LIGHT};font-size:11px;margin:8px 0 0;">Questions? <a href="mailto:${HR_EMAIL}" style="color:${C_LIME};">${HR_EMAIL}</a></p>` +
      `<p style="color:#4B5563;font-size:11px;margin:4px 0 0;">This is an automated message from the HR system.</p>` +
    `</div>`
  );
}

function _journeyStep(done, num, title, subtitle) {
  const bg  = done ? C_LIME    : "#E5E7EB";
  const txt = done ? C_BLACK   : C_GRAY_LIGHT;
  return (
    `<div style="display:flex;align-items:flex-start;margin-bottom:10px;">` +
      `<div style="min-width:30px;height:30px;background:${bg};color:${txt};border-radius:50%;text-align:center;line-height:30px;font-size:12px;font-weight:bold;margin-right:12px;flex-shrink:0;">${done ? "✓" : num}</div>` +
      `<div style="padding-top:4px;">` +
        `<p style="margin:0;font-size:13px;font-weight:bold;color:${done ? C_GRAY_DARK : C_GRAY_MID};">${title}</p>` +
        `<p style="margin:2px 0 0;font-size:12px;color:${C_GRAY_LIGHT};">${subtitle}</p>` +
      `</div>` +
    `</div>`
  );
}

function _journeyStepActive(num, title, subtitle) {
  return (
    `<div style="display:flex;align-items:flex-start;margin-bottom:10px;">` +
      `<div style="min-width:30px;height:30px;background:${C_LIME};color:${C_BLACK};border-radius:50%;text-align:center;line-height:30px;font-size:12px;font-weight:bold;margin-right:12px;flex-shrink:0;">✓</div>` +
      `<div style="background:${C_LIME_LIGHT};border:1px solid ${C_LIME_DARK};border-radius:6px;padding:8px 14px;">` +
        `<p style="margin:0;font-size:13px;font-weight:bold;color:${C_GRAY_DARK};">${title} — You are here</p>` +
        `<p style="margin:3px 0 0;font-size:12px;color:${C_GRAY_MID};">${subtitle}</p>` +
      `</div>` +
    `</div>`
  );
}

function _wrap(innerHtml) {
  return (
    `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid ${C_GRAY_BORDER};border-radius:12px;overflow:hidden;">` +
      innerHtml +
    `</div>`
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  1. APPLICATION RECEIVED
// ════════════════════════════════════════════════════════════════════════════
function applicationReceived({ fullName, position }) {
  const subject = `Application Received - ${position} | ${COMPANY_NAME}`;
  const html = _wrap(
    _header("Talent Acquisition Team") +
    `<div style="background:${C_LIME};padding:12px 32px;text-align:center;">` +
      `<span style="color:${C_BLACK};font-size:14px;font-weight:bold;letter-spacing:0.5px;">APPLICATION RECEIVED</span>` +
    `</div>` +
    `<div style="padding:28px 32px;background:${C_WHITE};">` +
      `<p style="font-size:17px;color:${C_GRAY_DARK};margin:0 0 12px;">Dear <strong>${fullName}</strong>,</p>` +
      `<p style="font-size:14px;color:${C_GRAY_MID};line-height:1.75;margin:0 0 20px;">Thank you for applying to <strong>${COMPANY_NAME}</strong> for the position of <strong>${position}</strong>. We have received your application and our Talent Acquisition team will review your profile promptly.</p>` +
      `<div style="background:${C_LIME_LIGHT};border-left:4px solid ${C_LIME};border-radius:6px;padding:16px 18px;margin-bottom:20px;">` +
        `<p style="margin:0;font-size:14px;color:${C_GRAY_DARK};line-height:1.7;"><strong>What happens next?</strong><br>If your profile aligns with our requirements, our HR team will reach out to schedule the next steps. Please keep your phone reachable and monitor your inbox.</p>` +
      `</div>` +
      `<p style="font-size:13px;color:${C_GRAY_LIGHT};">For any queries, write to us at <a href="mailto:${HR_EMAIL}" style="color:${C_GRAY_DARK};font-weight:600;">${HR_EMAIL}</a></p>` +
      `<p style="margin-top:24px;font-size:14px;color:${C_GRAY_MID};">Regards,<br><strong>${COMPANY_NAME} — HR Team</strong></p>` +
    `</div>` +
    _footer()
  );
  return { subject, html };
}

// ════════════════════════════════════════════════════════════════════════════
//  2. RESUME SHORTLISTED
// ════════════════════════════════════════════════════════════════════════════
function resumeShortlisted({ fullName, position, phone, email }) {
  const subject = `Your Resume Has Been Shortlisted - ${position} | ${COMPANY_NAME}`;
  const html = _wrap(
    _header("Talent Acquisition Team") +
    `<div style="background:${C_LIME};padding:14px 32px;text-align:center;">` +
      `<span style="color:${C_BLACK};font-size:14px;font-weight:bold;letter-spacing:0.5px;">RESUME SHORTLISTED — INTERVIEW CALL COMING SOON</span>` +
    `</div>` +
    `<div style="padding:32px;background:${C_WHITE};">` +
      `<p style="font-size:18px;color:${C_GRAY_DARK};margin:0 0 8px;">Dear <strong>${fullName}</strong>,</p>` +
      `<p style="font-size:14px;color:${C_GRAY_MID};line-height:1.75;margin:0 0 20px;">Congratulations! Your resume has been <strong>shortlisted</strong> for the <strong>${position}</strong> role at <strong>${COMPANY_NAME}</strong>.</p>` +
      `<div style="background:${C_LIME_LIGHT};border-left:4px solid ${C_LIME};border-radius:6px;padding:18px;margin-bottom:22px;">` +
        `<p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:${C_GRAY_DARK};">What Happens Next</p>` +
        `<p style="margin:0;font-size:14px;color:${C_GRAY_MID};line-height:1.7;">Our HR team will contact you shortly to schedule your interview. Keep your phone reachable and check your inbox regularly.</p>` +
      `</div>` +
      _journeyStep(true,  "1", "Application Received",  "Your profile was submitted successfully.") +
      _journeyStepActive(      "2", "Resume Shortlisted",    "Your resume has been approved by our recruiter.") +
      _journeyStep(false, "3", "HR Screening Call",     "Our HR will reach out to schedule your interview.") +
      _journeyStep(false, "4", "Interview Rounds",      "Technical and managerial rounds — online or in person.") +
      _journeyStep(false, "5", "Offer and Onboarding",  "Selected candidates receive a formal offer letter.") +
      `<div style="background:#F9F9F9;border:1px solid ${C_GRAY_BORDER};border-radius:8px;padding:16px;margin:20px 0;">` +
        `<p style="margin:0 0 10px;font-weight:bold;font-size:13px;color:${C_GRAY_DARK};">Application Summary</p>` +
        `<table style="width:100%;font-size:13px;border-collapse:collapse;">` +
          `<tr style="border-bottom:1px solid #F0F0F0;"><td style="padding:7px 0;color:${C_GRAY_LIGHT};width:100px;">Name</td><td style="padding:7px 0;color:${C_GRAY_DARK};font-weight:600;">${fullName}</td></tr>` +
          `<tr style="border-bottom:1px solid #F0F0F0;"><td style="padding:7px 0;color:${C_GRAY_LIGHT};">Position</td><td style="padding:7px 0;color:${C_GRAY_DARK};font-weight:600;">${position}</td></tr>` +
          `<tr style="border-bottom:1px solid #F0F0F0;"><td style="padding:7px 0;color:${C_GRAY_LIGHT};">Phone</td><td style="padding:7px 0;color:${C_GRAY_DARK};">${phone || "Not provided"}</td></tr>` +
          `<tr><td style="padding:7px 0;color:${C_GRAY_LIGHT};">Email</td><td style="padding:7px 0;color:${C_GRAY_DARK};">${email}</td></tr>` +
        `</table>` +
      `</div>` +
      `<p style="font-size:13px;color:${C_GRAY_LIGHT};">Queries: <a href="mailto:${HR_EMAIL}" style="color:${C_GRAY_DARK};font-weight:600;">${HR_EMAIL}</a></p>` +
      `<p style="margin-top:22px;font-size:14px;color:${C_GRAY_MID};">Regards,<br><strong>${COMPANY_NAME} — HR and Talent Acquisition Team</strong></p>` +
    `</div>` +
    _footer()
  );
  return { subject, html };
}

// ════════════════════════════════════════════════════════════════════════════
//  3a. ROUND QUALIFIED
// ════════════════════════════════════════════════════════════════════════════
function roundQualified({ fullName, position, roundNumber }) {
  const isFinal   = roundNumber >= 3;
  const nextRound = roundNumber + 1;
  const subject   = isFinal
    ? `All 3 Rounds Cleared! - ${position} | ${COMPANY_NAME}`
    : `Round ${roundNumber} Cleared - ${position} | ${COMPANY_NAME}`;
  const badgeText = isFinal
    ? "ALL 3 ROUNDS CLEARED — FINAL DECISION COMING"
    : `ROUND ${roundNumber} CLEARED — WELL DONE!`;

  function roundStep(num) {
    const done = num <= roundNumber;
    const next = !isFinal && num === nextRound;
    const bg   = done ? C_LIME : next ? C_GRAY_DARK : "#E5E7EB";
    const txt  = done ? C_BLACK : next ? C_WHITE : C_GRAY_LIGHT;
    const icon = done ? "✓" : String(num);
    const sub  = done ? "Cleared" : next ? "Up next — stay prepared" : "Pending";
    const subCol = done ? C_LIME_DARK : next ? C_GRAY_MID : C_GRAY_LIGHT;
    return (
      `<div style="display:flex;align-items:center;margin-bottom:12px;">` +
        `<div style="min-width:36px;height:36px;background:${bg};color:${txt};border-radius:50%;text-align:center;line-height:36px;font-size:13px;font-weight:bold;margin-right:14px;flex-shrink:0;">${icon}</div>` +
        `<div><p style="margin:0;font-size:13px;font-weight:600;color:${C_GRAY_DARK};">Round ${num} Interview</p><p style="margin:2px 0 0;font-size:12px;color:${subCol};">${sub}</p></div>` +
      `</div>`
    );
  }

  const nextBlock = isFinal
    ? `<div style="background:${C_LIME_LIGHT};border-left:4px solid ${C_LIME};border-radius:6px;padding:16px 18px;margin:20px 0;"><p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:${C_GRAY_DARK};">What Happens Next</p><p style="margin:0;font-size:14px;color:${C_GRAY_MID};line-height:1.7;">You have successfully cleared <strong>all 3 rounds</strong>. Our HR team will reach out with the final decision shortly.</p></div>`
    : `<div style="background:${C_LIME_LIGHT};border-left:4px solid ${C_LIME};border-radius:6px;padding:16px 18px;margin:20px 0;"><p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:${C_GRAY_DARK};">What Happens Next</p><p style="margin:0;font-size:14px;color:${C_GRAY_MID};line-height:1.7;">Our HR team will contact you to schedule <strong>Round ${nextRound}</strong>. Best of Luck!</p></div>`;

  const html = _wrap(
    _header("Interview Panel") +
    `<div style="background:${C_LIME};padding:13px 32px;text-align:center;"><span style="color:${C_BLACK};font-size:13px;font-weight:bold;letter-spacing:0.5px;">${badgeText}</span></div>` +
    `<div style="padding:32px;background:${C_WHITE};">` +
      `<p style="font-size:18px;color:${C_GRAY_DARK};margin:0 0 10px;">Dear <strong>${fullName}</strong>,</p>` +
      `<p style="font-size:14px;color:${C_GRAY_MID};line-height:1.75;margin:0 0 20px;">Excellent work! You have <strong>successfully cleared Round ${roundNumber}</strong> for the <strong>${position}</strong> role at <strong>${COMPANY_NAME}</strong>.</p>` +
      nextBlock +
      `<p style="font-weight:bold;font-size:14px;color:${C_GRAY_DARK};margin:24px 0 12px;">Your Interview Progress</p>` +
      roundStep(1) + roundStep(2) + roundStep(3) +
      `<p style="font-size:13px;color:${C_GRAY_LIGHT};">Questions? <a href="mailto:${HR_EMAIL}" style="color:${C_GRAY_DARK};">${HR_EMAIL}</a></p>` +
      `<p style="margin-top:20px;font-size:14px;color:${C_GRAY_MID};">Regards,<br><strong>${COMPANY_NAME} — HR and Talent Acquisition Team</strong></p>` +
    `</div>` +
    _footer()
  );
  return { subject, html };
}

// ════════════════════════════════════════════════════════════════════════════
//  3b. ROUND NOT QUALIFIED
// ════════════════════════════════════════════════════════════════════════════
function roundNotQualified({ fullName, position, roundNumber }) {
  const subject = `Update on Your Interview - ${position} | ${COMPANY_NAME}`;
  const html = _wrap(
    _header("Interview Panel") +
    `<div style="background:${C_GRAY_DARK};padding:13px 32px;text-align:center;"><span style="color:${C_WHITE};font-size:13px;font-weight:bold;letter-spacing:0.5px;">INTERVIEW UPDATE — ROUND ${roundNumber}</span></div>` +
    `<div style="padding:32px;background:${C_WHITE};">` +
      `<p style="font-size:18px;color:${C_GRAY_DARK};margin:0 0 10px;">Dear <strong>${fullName}</strong>,</p>` +
      `<p style="font-size:14px;color:${C_GRAY_MID};line-height:1.75;margin:0 0 20px;">Thank you for participating in <strong>Round ${roundNumber}</strong> for the <strong>${position}</strong> role at <strong>${COMPANY_NAME}</strong>.</p>` +
      `<div style="background:#F9F9F9;border-left:4px solid ${C_GRAY_LIGHT};border-radius:6px;padding:18px;margin-bottom:24px;"><p style="margin:0;font-size:14px;color:${C_GRAY_MID};line-height:1.8;">After thorough evaluation, we regret to inform you that we have decided to <strong>move forward with other candidates</strong> for this role.</p></div>` +
      `<div style="background:${C_LIME_LIGHT};border-left:4px solid ${C_LIME};border-radius:6px;padding:16px;margin-bottom:24px;"><p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:${C_GRAY_DARK};">Your Profile Stays With Us</p><p style="margin:0;font-size:13px;color:${C_GRAY_MID};line-height:1.7;">We will keep your profile on file for suitable opportunities in the future.</p></div>` +
      `<p style="font-size:13px;color:${C_GRAY_LIGHT};">Questions? <a href="mailto:${HR_EMAIL}" style="color:${C_GRAY_DARK};">${HR_EMAIL}</a></p>` +
      `<p style="margin-top:20px;font-size:14px;color:${C_GRAY_MID};">We wish you the very best in your career.<br><br>Regards,<br><strong>${COMPANY_NAME} — HR and Talent Acquisition Team</strong></p>` +
    `</div>` +
    _footer()
  );
  return { subject, html };
}

// ════════════════════════════════════════════════════════════════════════════
//  4. MARKED FOR OFFER (all rounds cleared)
// ════════════════════════════════════════════════════════════════════════════
function markedForOffer({ fullName, position }) {
  const subject = `Congratulations! You Have Been Selected - ${position} | ${COMPANY_NAME}`;
  const html = _wrap(
    _header("Talent Acquisition Team") +
    `<div style="background:${C_LIME};padding:14px 32px;text-align:center;"><span style="color:${C_BLACK};font-size:14px;font-weight:bold;letter-spacing:0.5px;">CONGRATULATIONS — YOU HAVE BEEN SELECTED!</span></div>` +
    `<div style="padding:32px;background:${C_WHITE};">` +
      `<p style="font-size:18px;color:${C_GRAY_DARK};margin:0 0 10px;">Dear <strong>${fullName}</strong>,</p>` +
      `<p style="font-size:15px;color:${C_GRAY_MID};line-height:1.8;margin:0 0 20px;">We are delighted to inform you that you have been <strong>SELECTED</strong> for the position of <strong>${position}</strong> at <strong>${COMPANY_NAME}</strong>.</p>` +
      `<div style="background:${C_LIME_LIGHT};border-left:4px solid ${C_LIME};border-radius:6px;padding:18px;margin-bottom:24px;"><p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:${C_GRAY_DARK};">What Happens Next</p><p style="margin:0;font-size:14px;color:${C_GRAY_MID};line-height:1.8;">Our HR team will send you a <strong>formal Offer Letter (PDF)</strong> shortly with your compensation details and joining information.</p></div>` +
      `<p style="margin-top:20px;font-size:15px;color:${C_GRAY_DARK};font-weight:bold;">Welcome to the ${COMPANY_NAME} family!</p>` +
      `<p style="font-size:14px;color:${C_GRAY_MID};">Regards,<br><strong>${COMPANY_NAME} — HR and Talent Acquisition Team</strong></p>` +
    `</div>` +
    _footer()
  );
  return { subject, html };
}

// ════════════════════════════════════════════════════════════════════════════
//  5. OFFER LETTER (PDF attached)
// ════════════════════════════════════════════════════════════════════════════
function offerLetter({ fullName, position, hasAttachment, onboardingFormUrl }) {
  const subject = `Your Offer Letter - ${position} | ${COMPANY_NAME}`;
  const attachLine = hasAttachment
    ? "attached to this email as a PDF."
    : "being prepared and will be shared shortly.";
  const formBlock = onboardingFormUrl
    ? `<p style="margin:0 0 10px;font-size:14px;font-weight:bold;color:${C_GRAY_DARK};">📋 Submit Your Onboarding Documents</p>` +
      `<p style="margin:0 0 14px;font-size:13px;color:${C_GRAY_MID};line-height:1.7;">Please upload all required documents using the secure link below. Your onboarding can only proceed after all mandatory documents are verified.</p>` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0;"><tr><td style="border-radius:8px;background:#0A0A0A;">` +
        `<a href="${onboardingFormUrl}" target="_blank" style="display:inline-block;padding:13px 28px;color:#AAFF00;font-size:14px;font-weight:bold;text-decoration:none;letter-spacing:0.3px;">Upload Documents →</a>` +
      `</td></tr></table>`
    : "";
  const html = _wrap(
    _header("Talent Acquisition Team") +
    `<div style="background:${C_LIME};padding:14px 32px;text-align:center;"><span style="color:${C_BLACK};font-size:14px;font-weight:bold;letter-spacing:0.5px;">YOUR OFFER LETTER IS HERE!</span></div>` +
    `<div style="padding:32px;background:${C_WHITE};">` +
      `<p style="font-size:18px;color:${C_GRAY_DARK};margin:0 0 10px;">Dear <strong>${fullName}</strong>,</p>` +
      `<p style="font-size:15px;color:${C_GRAY_MID};line-height:1.8;margin:0 0 20px;">Congratulations! Your official <strong>Offer Letter</strong> is ${attachLine}</p>` +
      `<div style="background:${C_LIME_LIGHT};border-left:4px solid ${C_LIME};border-radius:6px;padding:18px;margin-bottom:24px;">` +
        `<p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:${C_GRAY_DARK};">Next Steps</p>` +
        `<p style="margin:0 0 14px;font-size:14px;color:${C_GRAY_MID};line-height:1.8;">Please review the offer letter carefully. To accept, reply to this email with your signed confirmation.</p>` +
        formBlock +
      `</div>` +
      `<p style="margin-top:20px;font-size:15px;color:${C_GRAY_DARK};font-weight:bold;">Welcome to the ${COMPANY_NAME} family!</p>` +
      `<p style="font-size:14px;color:${C_GRAY_MID};">Regards,<br><strong>${COMPANY_NAME} — HR and Talent Acquisition Team</strong></p>` +
    `</div>` +
    _footer()
  );
  return { subject, html };
}

// ════════════════════════════════════════════════════════════════════════════
//  6. REJECTED
// ════════════════════════════════════════════════════════════════════════════
function rejected({ fullName, position }) {
  const subject = `Update on your Application - ${position} | ${COMPANY_NAME}`;
  const html = _wrap(
    _header("Talent Acquisition Team") +
    `<div style="background:${C_GRAY_DARK};padding:12px 32px;text-align:center;"><span style="color:${C_WHITE};font-size:14px;font-weight:bold;letter-spacing:0.5px;">UPDATE ON YOUR APPLICATION</span></div>` +
    `<div style="padding:32px;background:${C_WHITE};">` +
      `<p style="font-size:17px;color:${C_GRAY_DARK};margin:0 0 12px;">Dear <strong>${fullName}</strong>,</p>` +
      `<p style="font-size:14px;color:${C_GRAY_MID};line-height:1.75;margin:0 0 18px;">Thank you for your interest in joining <strong>${COMPANY_NAME}</strong> for the position of <strong>${position}</strong>.</p>` +
      `<div style="background:#FFF8F8;border-left:4px solid #E5534B;border-radius:6px;padding:16px 18px;margin-bottom:20px;"><p style="margin:0;font-size:14px;color:${C_GRAY_DARK};line-height:1.75;">After careful review, we regret to inform you that we are <strong>unable to move forward</strong> with your application at this time.</p></div>` +
      `<p style="font-size:14px;color:${C_GRAY_MID};line-height:1.75;margin:0 0 20px;">We will keep your profile on file and reach out if a suitable opportunity arises. We wish you all the best in your career journey.</p>` +
      `<p style="font-size:13px;color:${C_GRAY_LIGHT};">For any queries, write to us at <a href="mailto:${HR_EMAIL}" style="color:${C_GRAY_DARK};font-weight:600;">${HR_EMAIL}</a></p>` +
      `<p style="margin-top:24px;font-size:14px;color:${C_GRAY_MID};">Regards,<br><strong>${COMPANY_NAME} — HR and Talent Acquisition Team</strong></p>` +
    `</div>` +
    _footer()
  );
  return { subject, html };
}

// ════════════════════════════════════════════════════════════════════════════
//  7. ONBOARDED — documents verified, ready to join
// ════════════════════════════════════════════════════════════════════════════
function onboarded({ fullName, position, joiningDate }) {
  const subject = `Your Documents Are Verified — Welcome Aboard! | ${COMPANY_NAME}`;
  const joiningLine = joiningDate
    ? `<p style="margin:0;font-size:14px;color:${C_GRAY_MID};line-height:1.8;">Your joining date is <strong>${joiningDate}</strong>. Our HR team will share further joining instructions closer to the date.</p>`
    : `<p style="margin:0;font-size:14px;color:${C_GRAY_MID};line-height:1.8;">Our HR team will reach out shortly with your joining instructions and schedule.</p>`;

  const html = _wrap(
    _header("Onboarding Team") +
    `<div style="background:${C_LIME};padding:14px 32px;text-align:center;">` +
      `<span style="color:${C_BLACK};font-size:14px;font-weight:bold;letter-spacing:0.5px;">DOCUMENTS VERIFIED — YOU ARE READY TO JOIN!</span>` +
    `</div>` +
    `<div style="padding:32px;background:${C_WHITE};">` +
      `<p style="font-size:18px;color:${C_GRAY_DARK};margin:0 0 10px;">Dear <strong>${fullName}</strong>,</p>` +
      `<p style="font-size:15px;color:${C_GRAY_MID};line-height:1.8;margin:0 0 20px;">` +
        `Great news! We have <strong>successfully verified all your submitted documents</strong> for the position of ` +
        `<strong>${position}</strong> at <strong>${COMPANY_NAME}</strong>. ` +
        `Your onboarding process is now complete.` +
      `</p>` +
      `<div style="background:${C_LIME_LIGHT};border-left:4px solid ${C_LIME};border-radius:6px;padding:18px;margin-bottom:24px;">` +
        `<p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:${C_GRAY_DARK};">What Happens Next</p>` +
        joiningLine +
      `</div>` +
      `<div style="background:#F9F9F9;border:1px solid ${C_GRAY_BORDER};border-radius:8px;padding:20px;margin-bottom:24px;">` +
        `<p style="margin:0 0 14px;font-weight:bold;font-size:13px;color:${C_GRAY_DARK};">Onboarding Checklist — Completed ✓</p>` +
        `<div style="display:flex;align-items:center;margin-bottom:10px;"><div style="min-width:24px;height:24px;background:${C_LIME};color:${C_BLACK};border-radius:50%;text-align:center;line-height:24px;font-size:11px;font-weight:bold;margin-right:12px;flex-shrink:0;">✓</div><span style="font-size:13px;color:${C_GRAY_DARK};">Offer Letter Accepted</span></div>` +
        `<div style="display:flex;align-items:center;margin-bottom:10px;"><div style="min-width:24px;height:24px;background:${C_LIME};color:${C_BLACK};border-radius:50%;text-align:center;line-height:24px;font-size:11px;font-weight:bold;margin-right:12px;flex-shrink:0;">✓</div><span style="font-size:13px;color:${C_GRAY_DARK};">Documents Submitted</span></div>` +
        `<div style="display:flex;align-items:center;margin-bottom:10px;"><div style="min-width:24px;height:24px;background:${C_LIME};color:${C_BLACK};border-radius:50%;text-align:center;line-height:24px;font-size:11px;font-weight:bold;margin-right:12px;flex-shrink:0;">✓</div><span style="font-size:13px;color:${C_GRAY_DARK};">Documents Verified by HR</span></div>` +
        `<div style="display:flex;align-items:center;"><div style="min-width:24px;height:24px;background:${C_BLACK};color:${C_LIME};border-radius:50%;text-align:center;line-height:24px;font-size:13px;font-weight:bold;margin-right:12px;flex-shrink:0;">★</div><span style="font-size:13px;font-weight:bold;color:${C_GRAY_DARK};">Ready to Join ${COMPANY_NAME}!</span></div>` +
      `</div>` +
      `<div style="background:${C_LIME_LIGHT};border:1px solid ${C_LIME_DARK};border-radius:6px;padding:14px 16px;margin-bottom:24px;">` +
        `<p style="margin:0;font-size:13px;color:${C_GRAY_DARK};"><strong>Pre-joining queries?</strong> Reach out to us at <a href="mailto:${HR_EMAIL}" style="color:${C_GRAY_DARK};font-weight:600;">${HR_EMAIL}</a></p>` +
      `</div>` +
      `<p style="margin-top:20px;font-size:15px;color:${C_GRAY_DARK};font-weight:bold;">We look forward to welcoming you to the ${COMPANY_NAME} family! 🎉</p>` +
      `<p style="font-size:14px;color:${C_GRAY_MID};">Regards,<br><strong>${COMPANY_NAME} — HR and Onboarding Team</strong></p>` +
    `</div>` +
    _footer()
  );
  return { subject, html };
}

// ════════════════════════════════════════════════════════════════════════════
//  8. ORIENTATION INVITE — full session schedule
//
//  sessions: [{ title, sessionType, scheduledDate, startTime, endTime,
//               mode, venue, facilitator, isMandatory }]
// ════════════════════════════════════════════════════════════════════════════
function orientationInvite({ fullName, position, joiningDate, mentorName, mentorEmail, sessions }) {
  const subject = `Welcome! Your Orientation Schedule is Here — ${COMPANY_NAME}`;

  const modeLabel = (mode) => {
    const map = { in_person: "In-Person", online_zoom: "Zoom (Online)", online_meet: "Google Meet", hybrid: "Hybrid" };
    return map[mode] || mode;
  };

  const sessionRows = (sessions || []).map((s, i) => {
    const dateStr = s.scheduledDate
      ? new Date(s.scheduledDate).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : "To be announced";
    const timeStr = s.startTime && s.endTime ? `${s.startTime} – ${s.endTime}` : s.startTime || "TBD";
    const mandatory = s.isMandatory ? `<span style="background:${C_LIME};color:${C_BLACK};font-size:10px;font-weight:bold;padding:2px 8px;border-radius:10px;margin-left:6px;">MANDATORY</span>` : "";
    const bg = i % 2 === 0 ? "#FAFAFA" : C_WHITE;
    return (
      `<tr style="background:${bg};">` +
        `<td style="padding:14px 16px;border-bottom:1px solid ${C_GRAY_BORDER};vertical-align:top;">` +
          `<p style="margin:0 0 4px;font-size:13px;font-weight:bold;color:${C_GRAY_DARK};">${s.title}${mandatory}</p>` +
          `<p style="margin:0;font-size:12px;color:${C_GRAY_MID};">📅 ${dateStr}</p>` +
          `<p style="margin:2px 0 0;font-size:12px;color:${C_GRAY_MID};">⏰ ${timeStr}</p>` +
        `</td>` +
        `<td style="padding:14px 16px;border-bottom:1px solid ${C_GRAY_BORDER};vertical-align:top;font-size:12px;color:${C_GRAY_MID};">` +
          `<p style="margin:0 0 3px;">${modeLabel(s.mode)}</p>` +
          `<p style="margin:0 0 3px;word-break:break-all;">${s.venue || "—"}</p>` +
          `<p style="margin:0;">👤 ${s.facilitator || "HR Team"}</p>` +
        `</td>` +
      `</tr>`
    );
  }).join("");

  const mentorBlock = mentorName
    ? `<div style="background:${C_LIME_LIGHT};border-left:4px solid ${C_LIME};border-radius:6px;padding:16px 18px;margin-bottom:20px;">` +
        `<p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:${C_GRAY_DARK};">Your Assigned Mentor / Buddy</p>` +
        `<p style="margin:0;font-size:13px;color:${C_GRAY_MID};">👤 <strong>${mentorName}</strong>${mentorEmail ? ` — <a href="mailto:${mentorEmail}" style="color:${C_GRAY_DARK};">${mentorEmail}</a>` : ""}</p>` +
      `</div>`
    : "";

  const joiningLine = joiningDate
    ? `Your joining date is <strong>${joiningDate}</strong>.`
    : "Your joining details will be shared shortly.";

  const html = _wrap(
    _header("Onboarding & Orientation Team") +
    `<div style="background:${C_LIME};padding:14px 32px;text-align:center;">` +
      `<span style="color:${C_BLACK};font-size:14px;font-weight:bold;letter-spacing:0.5px;">ORIENTATION SCHEDULE — WELCOME TO THE TEAM!</span>` +
    `</div>` +
    `<div style="padding:32px;background:${C_WHITE};">` +
      `<p style="font-size:18px;color:${C_GRAY_DARK};margin:0 0 10px;">Dear <strong>${fullName}</strong>,</p>` +
      `<p style="font-size:14px;color:${C_GRAY_MID};line-height:1.8;margin:0 0 20px;">` +
        `Welcome to <strong>${COMPANY_NAME}</strong>! We are thrilled to have you on board as our new <strong>${position}</strong>. ` +
        `${joiningLine} Below is your orientation schedule for the first week.` +
      `</p>` +
      mentorBlock +
      `<p style="font-weight:bold;font-size:14px;color:${C_GRAY_DARK};margin:0 0 12px;">Your Orientation Sessions</p>` +
      (sessionRows
        ? `<table style="width:100%;border-collapse:collapse;border:1px solid ${C_GRAY_BORDER};border-radius:8px;overflow:hidden;">` +
            `<thead><tr style="background:${C_BLACK};">` +
              `<th style="padding:12px 16px;text-align:left;font-size:12px;color:${C_LIME};font-weight:bold;letter-spacing:0.5px;">SESSION</th>` +
              `<th style="padding:12px 16px;text-align:left;font-size:12px;color:${C_LIME};font-weight:bold;letter-spacing:0.5px;">MODE / VENUE</th>` +
            `</tr></thead>` +
            `<tbody>${sessionRows}</tbody>` +
          `</table>`
        : `<p style="font-size:14px;color:${C_GRAY_MID};">Your session schedule will be shared shortly by the HR team.</p>`
      ) +
      `<div style="background:#F9F9F9;border:1px solid ${C_GRAY_BORDER};border-radius:8px;padding:16px;margin:20px 0;">` +
        `<p style="margin:0 0 8px;font-weight:bold;font-size:13px;color:${C_GRAY_DARK};">First-Week Checklist</p>` +
        `<p style="margin:0;font-size:13px;color:${C_GRAY_MID};line-height:2;">` +
          `✅ Read the Company Handbook<br>` +
          `✅ Sign NDA &amp; Employment Agreement<br>` +
          `✅ Set up company email &amp; signature<br>` +
          `✅ Join Slack &amp; communication channels<br>` +
          `✅ Attend all mandatory orientation sessions<br>` +
          `✅ Complete first-week HR check-in` +
        `</p>` +
      `</div>` +
      `<p style="font-size:13px;color:${C_GRAY_LIGHT};">Questions? <a href="mailto:${HR_EMAIL}" style="color:${C_GRAY_DARK};font-weight:600;">${HR_EMAIL}</a></p>` +
      `<p style="margin-top:22px;font-size:14px;color:${C_GRAY_MID};">Regards,<br><strong>${COMPANY_NAME} — HR and Onboarding Team</strong></p>` +
    `</div>` +
    _footer()
  );
  return { subject, html };
}

// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
//  10. DEPLOYED — assigned to a team
// ════════════════════════════════════════════════════════════════════════════
function deployed({ fullName, position, teamName, department, roleInTeam, reportingManager, workLocation, officeLocation, shift, domainEmail, deployedDate, joiningDate, employeeId }) {
  const subject = `Welcome to the Team - Your Deployment Details | ${COMPANY_NAME}`;
  function row(label, value) {
    if (!value) return "";
    return `<tr style="border-bottom:1px solid #F0F0F0;"><td style="padding:8px 0;color:${C_GRAY_LIGHT};font-size:13px;width:150px;vertical-align:top;">${label}</td><td style="padding:8px 0;color:${C_GRAY_DARK};font-size:13px;font-weight:600;">${value}</td></tr>`;
  }
  const locLabel    = workLocation === "remote" ? "Remote" : workLocation === "hybrid" ? "Hybrid" : "Office";
  const locationStr = officeLocation ? `${locLabel} - ${officeLocation}` : locLabel;
  const domainBlock = domainEmail
    ? `<div style="background:${C_LIME_LIGHT};border-left:4px solid ${C_LIME};border-radius:6px;padding:14px 18px;margin-bottom:24px;"><p style="margin:0 0 4px;font-size:13px;font-weight:bold;color:${C_GRAY_DARK};">Your Company Email</p><p style="margin:0;font-size:15px;color:${C_GRAY_DARK};font-weight:bold;">${domainEmail}</p></div>`
    : "";
  const joiningBlock = joiningDate
    ? `<div style="background:${C_LIME_LIGHT};border-left:4px solid ${C_LIME};border-radius:6px;padding:14px 18px;margin-bottom:24px;"><p style="margin:0 0 2px;font-size:13px;font-weight:bold;color:${C_GRAY_DARK};">Your Joining Date</p><p style="margin:0;font-size:15px;color:${C_GRAY_DARK};font-weight:bold;">${joiningDate}</p></div>`
    : "";
  const html = _wrap(
    _header("HR - Team Deployment") +
    `<div style="background:${C_LIME};padding:14px 32px;text-align:center;"><span style="color:${C_BLACK};font-size:14px;font-weight:bold;letter-spacing:0.5px;">CONGRATULATIONS - YOU HAVE BEEN DEPLOYED!</span></div>` +
    `<div style="padding:32px;background:${C_WHITE};">` +
      `<p style="font-size:18px;color:${C_GRAY_DARK};margin:0 0 10px;">Dear <strong>${fullName}</strong>,</p>` +
      `<p style="font-size:15px;color:${C_GRAY_MID};line-height:1.8;margin:0 0 20px;">Congratulations! You have been officially deployed to <strong>${teamName || "your team"}</strong> at <strong>${COMPANY_NAME}</strong>. Please find your deployment details below.</p>` +
      joiningBlock +
      `<div style="background:#F9F9F9;border:1px solid ${C_GRAY_BORDER};border-radius:8px;padding:20px;margin-bottom:24px;">` +
        `<p style="margin:0 0 14px;font-weight:bold;font-size:14px;color:${C_GRAY_DARK};">Deployment Details</p>` +
        `<table style="width:100%;border-collapse:collapse;">` +
          row("Employee ID", employeeId) + row("Team", teamName) + row("Department", department) + row("Role", roleInTeam) +
          row("Position", position) + row("Reporting Manager", reportingManager) +
          row("Work Location", locationStr) + row("Shift", shift) + row("Deployed On", deployedDate) +
        `</table>` +
      `</div>` +
      domainBlock +
      `<div style="background:${C_LIME_LIGHT};border-left:4px solid ${C_LIME};border-radius:6px;padding:16px 18px;margin-bottom:24px;"><p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:${C_GRAY_DARK};">What Happens Next</p><p style="margin:0;font-size:14px;color:${C_GRAY_MID};line-height:1.8;">Your reporting manager will get in touch with you shortly to brief you on your responsibilities, tools, and the team.</p></div>` +
      `<p style="margin-top:20px;font-size:15px;color:${C_GRAY_DARK};font-weight:bold;">Welcome to the ${teamName || COMPANY_NAME} team!</p>` +
      `<p style="font-size:14px;color:${C_GRAY_MID};">Regards,<br><strong>${COMPANY_NAME} - HR Team</strong></p>` +
    `</div>` +
    _footer()
  );
  return { subject, html };
}

function orientationCompleted({ fullName, position }) {
  const subject = `Orientation Complete - Team Deployment Coming Soon | ${COMPANY_NAME}`;
  const html = _wrap(
    _header("Onboarding & Orientation Team") +
    `<div style="background:${C_LIME};padding:14px 32px;text-align:center;"><span style="color:${C_BLACK};font-size:14px;font-weight:bold;letter-spacing:0.5px;">ORIENTATION COMPLETE!</span></div>` +
    `<div style="padding:32px;background:${C_WHITE};">` +
      `<p style="font-size:18px;color:${C_GRAY_DARK};margin:0 0 10px;">Dear <strong>${fullName}</strong>,</p>` +
      `<p style="font-size:15px;color:${C_GRAY_MID};line-height:1.8;margin:0 0 20px;">Congratulations on successfully completing your orientation for the <strong>${position}</strong> role at <strong>${COMPANY_NAME}</strong>. You have finished all the required sessions and onboarding steps.</p>` +
      `<div style="background:${C_LIME_LIGHT};border-left:4px solid ${C_LIME};border-radius:6px;padding:18px;margin-bottom:24px;"><p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:${C_GRAY_DARK};">What Happens Next</p><p style="margin:0;font-size:14px;color:${C_GRAY_MID};line-height:1.8;">Our HR team will <strong>assign you to a team shortly</strong> and share your deployment details - including your reporting manager, employee ID and work setup. Please keep an eye on your inbox.</p></div>` +
      `<p style="margin-top:20px;font-size:15px;color:${C_GRAY_DARK};font-weight:bold;">Welcome aboard - we are excited to have you on the team!</p>` +
      `<p style="font-size:14px;color:${C_GRAY_MID};">Regards,<br><strong>${COMPANY_NAME} - HR and Onboarding Team</strong></p>` +
    `</div>` +
    _footer()
  );
  return { subject, html };
}

module.exports = {
  applicationReceived,
  resumeShortlisted,
  roundQualified,
  roundNotQualified,
  markedForOffer,
  offerLetter,
  rejected,
  onboarded,
  orientationInvite,
  orientationCompleted,
  deployed,
};
