const nodemailer = require("nodemailer");

/**
 * sendEmail — sends via Microsoft Graph (preferred) or SMTP (fallback).
 *
 * ── Microsoft Graph (recommended, keeps MFA + Security Defaults ON) ──
 *   GRAPH_TENANT_ID      — Directory (tenant) ID from the Entra app registration
 *   GRAPH_CLIENT_ID      — Application (client) ID
 *   GRAPH_CLIENT_SECRET  — client secret VALUE (not the secret ID)
 *   GRAPH_SENDER         — mailbox to send from, e.g. hr@zyntrixsoftware.com
 *                          (falls back to EMAIL_FROM / EMAIL_USER)
 *   EMAIL_SENDER_NAME    — display name, e.g. "Zyntrix HR"
 *   EMAIL_REPLY_TO       — optional reply-to (defaults to the sender)
 *
 * If the GRAPH_* vars are absent, it falls back to classic SMTP using:
 *   EMAIL_USER, EMAIL_PASS, EMAIL_HOST, EMAIL_PORT, EMAIL_FROM, EMAIL_SENDER_NAME
 *
 * Optional everywhere:
 *   DEV_SKIP_EMAIL=true  — logs the email to console instead of sending
 *
 * opts: { attachments?: [{ filename, content(Buffer|base64 string), contentType }], html?, replyTo? }
 */

// ── helpers ────────────────────────────────────────────────────────────────
function useGraph() {
  return !!(process.env.GRAPH_TENANT_ID && process.env.GRAPH_CLIENT_ID && process.env.GRAPH_CLIENT_SECRET);
}

function toRecipientList(to) {
  const arr = Array.isArray(to)
    ? to
    : String(to || "").split(",").map(s => s.trim()).filter(Boolean);
  return arr.map(address => ({ emailAddress: { address } }));
}

function toBase64(content) {
  if (Buffer.isBuffer(content)) return content.toString("base64");
  if (typeof content === "string") {
    // assume already base64 if it looks like it, else encode raw text
    return /^[A-Za-z0-9+/=\r\n]+$/.test(content) && content.length % 4 === 0
      ? content.replace(/\s+/g, "")
      : Buffer.from(content).toString("base64");
  }
  return Buffer.from(String(content)).toString("base64");
}

// ── Graph token cache ────────────────────────────────────────────────────────
let _tokenCache = { value: null, exp: 0 };

async function getGraphToken() {
  const now = Date.now();
  if (_tokenCache.value && now < _tokenCache.exp - 60000) return _tokenCache.value;

  const tenant = process.env.GRAPH_TENANT_ID;
  const url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id:     process.env.GRAPH_CLIENT_ID,
    client_secret: process.env.GRAPH_CLIENT_SECRET,
    scope:         "https://graph.microsoft.com/.default",
    grant_type:    "client_credentials",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const msg = data.error_description || data.error || `HTTP ${res.status}`;
    const e = new Error("Graph token request failed: " + msg);
    e.code = "GRAPH_AUTH";
    throw e;
  }
  _tokenCache = { value: data.access_token, exp: now + (data.expires_in || 3600) * 1000 };
  return _tokenCache.value;
}

async function sendViaGraph(to, subject, text, opts) {
  const sender     = (process.env.GRAPH_SENDER || process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
  const senderName = process.env.EMAIL_SENDER_NAME || "Zyntrix CRM";
  const replyTo    = opts.replyTo || process.env.EMAIL_REPLY_TO || sender;

  if (!sender) throw new Error("GRAPH_SENDER (or EMAIL_FROM/EMAIL_USER) must be set");

  const message = {
    subject,
    body: { contentType: opts.html ? "HTML" : "Text", content: opts.html || text || "" },
    toRecipients: toRecipientList(to),
    from:   { emailAddress: { name: senderName, address: sender } },
    replyTo: replyTo ? [{ emailAddress: { address: replyTo } }] : undefined,
  };

  if (opts.attachments && opts.attachments.length) {
    message.attachments = opts.attachments.map(a => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name:          a.filename || "attachment",
      contentType:   a.contentType || "application/octet-stream",
      contentBytes:  toBase64(a.content),
    }));
  }

  const token = await getGraphToken();
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });

  if (res.status === 202) {
    console.log("✅ Email sent via Graph → To:", to, "| From:", sender);
    return;
  }
  const errBody = await res.text().catch(() => "");
  const e = new Error(`Graph sendMail failed (HTTP ${res.status}): ${errBody.slice(0, 500)}`);
  e.code = "GRAPH_SEND";
  e.responseCode = res.status;
  throw e;
}

// ── SMTP fallback (original behaviour) ───────────────────────────────────────
async function sendViaSmtp(to, subject, text, opts) {
  const required = ["EMAIL_USER", "EMAIL_PASS", "EMAIL_HOST", "EMAIL_PORT"];
  const missing  = required.filter(k => !process.env[k]);
  if (missing.length) throw new Error("Missing email env vars: " + missing.join(", "));

  const senderName  = process.env.EMAIL_SENDER_NAME || "Zyntrix CRM";
  const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  const isGmail     = process.env.EMAIL_USER.toLowerCase().endsWith("@gmail.com");
  const port        = Number(process.env.EMAIL_PORT);

  const transportConfig = isGmail
    ? { service: "gmail", auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } }
    : {
        host: process.env.EMAIL_HOST,
        port,
        secure: port === 465,
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        tls: { minVersion: "TLSv1.2", rejectUnauthorized: false },
      };

  const transporter = nodemailer.createTransport({
    ...transportConfig,
    connectionTimeout: 15000,
    greetingTimeout:   10000,
    socketTimeout:     20000,
  });

  try {
    await transporter.verify();
  } catch (verifyErr) {
    console.error("EMAIL CONFIG ERROR — SMTP connection failed:");
    console.error("  Host :", process.env.EMAIL_HOST, "| Port:", port, "| User:", process.env.EMAIL_USER);
    console.error("  Error:", verifyErr.message);
    throw verifyErr;
  }

  const mail = {
    from:    `"${senderName}" <${fromAddress}>`,
    to,
    subject,
    text,
    replyTo: opts.replyTo || process.env.EMAIL_REPLY_TO || fromAddress,
  };
  if (opts.html)        mail.html        = opts.html;
  if (opts.attachments) mail.attachments = opts.attachments;

  const info = await transporter.sendMail(mail);
  console.log("✅ Email sent via SMTP → To:", to, "| MessageId:", info.messageId);
}

// ── public API ───────────────────────────────────────────────────────────────
const sendEmail = async (to, subject, text, opts = {}) => {
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

  if (useGraph()) return sendViaGraph(to, subject, text, opts);
  return sendViaSmtp(to, subject, text, opts);
};

module.exports = sendEmail;
