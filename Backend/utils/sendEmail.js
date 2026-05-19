const nodemailer = require("nodemailer");

/**
 * sendEmail — Office365 / Outlook SMTP
 *
 * Required env vars (set in Railway Variables tab):
 *   EMAIL_USER        — SMTP login   e.g. dinesh.kolasani@zyntrixsoftware.com
 *   EMAIL_PASS        — SMTP password
 *   EMAIL_FROM        — Sender addr  e.g. noreply@zyntrixsoftware.com
 *   EMAIL_HOST        — smtp.office365.com
 *   EMAIL_PORT        — 587
 *   EMAIL_SENDER_NAME — Zyntrix CRM
 *
 * Optional:
 *   DEV_SKIP_EMAIL=true  — logs email to console instead of sending (local dev only)
 *                          ⚠️  Must be false or absent in Railway for real emails
 */
const sendEmail = async (to, subject, text, opts = {}) => {
  // opts: { attachments?: [{ filename, content, contentType }], html? }

  // ── DEV / CONSOLE MODE ───────────────────────────────────────────────────
  if (process.env.DEV_SKIP_EMAIL === "true") {
    console.warn("⚠️  DEV_SKIP_EMAIL=true — email NOT sent, printing to console instead.");
    console.log("\n────────────── [DEV EMAIL] ──────────────");
    console.log("To      :", to);
    console.log("Subject :", subject);
    if (opts.attachments && opts.attachments.length) {
      console.log("Attachments :",
        opts.attachments.map(a => `${a.filename} (${a.content?.length || 0} bytes)`).join(", "));
    }
    console.log("Body    :\n", text);
    console.log("─────────────────────────────────────────\n");
    return;
  }

  // ── VALIDATE REQUIRED CONFIG ──────────────────────────────────────────────
  const required = ["EMAIL_USER", "EMAIL_PASS", "EMAIL_HOST", "EMAIL_PORT"];
  const missing  = required.filter(k => !process.env[k]);
  if (missing.length) {
    throw new Error("Missing email env vars: " + missing.join(", "));
  }

  const senderName  = process.env.EMAIL_SENDER_NAME || "Zyntrix CRM";
  const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  const isGmail     = process.env.EMAIL_USER.toLowerCase().endsWith("@gmail.com");
  const port        = Number(process.env.EMAIL_PORT);

  // ── BUILD TRANSPORTER ─────────────────────────────────────────────────────
  let transportConfig;

  if (isGmail) {
    transportConfig = {
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    };
  } else {
    // Office365 / Outlook — STARTTLS on port 587
    // ⚠️  DO NOT add ciphers:"SSLv3" — SSLv3 is disabled in modern Node.js
    //     and breaks the connection to smtp.office365.com
    transportConfig = {
      host:   process.env.EMAIL_HOST,   // smtp.office365.com
      port,                              // 587
      secure: port === 465,             // false for 587 (uses STARTTLS)
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: {
        minVersion:         "TLSv1.2",  // Office365 requires TLS 1.2+
        rejectUnauthorized: false       // allow self-signed certs in cloud envs
      }
    };
  }

  const transporter = nodemailer.createTransport({
    ...transportConfig,
    connectionTimeout: 15000,
    greetingTimeout:   10000,
    socketTimeout:     20000
  });

  // ── VERIFY CONNECTION (helps catch config errors early) ───────────────────
  try {
    await transporter.verify();
  } catch (verifyErr) {
    // Log full error to Railway logs for diagnosis
    console.error("EMAIL CONFIG ERROR — SMTP connection failed:");
    console.error("  Host    :", process.env.EMAIL_HOST);
    console.error("  Port    :", port);
    console.error("  User    :", process.env.EMAIL_USER);
    console.error("  Error   :", verifyErr.message);
    console.error("\nCommon fixes:");
    console.error("  1. Make sure DEV_SKIP_EMAIL is not set to 'true' in Railway");
    console.error("  2. In Microsoft 365 Admin → Users → select user → Mail → Manage email apps");
    console.error("     → enable 'Authenticated SMTP'");
    console.error("  3. Confirm EMAIL_PASS is the correct mailbox password (not an app password)");
    throw verifyErr;
  }

  // ── SEND ──────────────────────────────────────────────────────────────────
  const mail = {
    from:    `"${senderName}" <${fromAddress}>`,
    to,
    subject,
    text
  };
  if (opts.html)        mail.html        = opts.html;
  if (opts.attachments) mail.attachments = opts.attachments;

  const info = await transporter.sendMail(mail);

  console.log("✅ Email sent → To:", to, "| MessageId:", info.messageId);
};

module.exports = sendEmail;
