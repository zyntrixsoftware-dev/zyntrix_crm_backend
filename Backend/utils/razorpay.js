/**
 * razorpay.js — Razorpay Payment Links integration.
 * Env: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
 * Uses the native fetch + REST API (no SDK).
 */
const crypto = require("crypto");

function keyId()        { return process.env.RAZORPAY_KEY_ID     || ""; }
function keySecret()    { return process.env.RAZORPAY_KEY_SECRET || ""; }
function webhookSecret(){ return process.env.RAZORPAY_WEBHOOK_SECRET || ""; }
function configured()   { return !!(keyId() && keySecret()); }

// Create a Razorpay Payment Link. amount in rupees.
async function createPaymentLink(opts) {
  if (!configured()) {
    const e = new Error("Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
    e.code = "RZP_CONFIG"; throw e;
  }
  const auth = Buffer.from(keyId() + ":" + keySecret()).toString("base64");
  const body = {
    amount:        Math.round(Number(opts.amount) * 100), // paise
    currency:      "INR",
    accept_partial:false,
    description:   (opts.description || "Course fee payment").slice(0, 255),
    reference_id:  opts.referenceId || undefined,
    customer:      { name: opts.name || "", email: opts.email || undefined, contact: opts.contact || undefined },
    notify:        { email: !!opts.notifyEmail, sms: !!opts.notifySms },
    reminder_enable: true,
    notes:         opts.notes || {},
    callback_url:  opts.callbackUrl || undefined,
    callback_method: opts.callbackUrl ? "get" : undefined
  };
  const res = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: { Authorization: "Basic " + auth, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && data.error && data.error.description) || ("Razorpay error HTTP " + res.status);
    const e = new Error(msg); e.code = "RZP_API"; throw e;
  }
  return data; // { id, short_url, ... }
}

function verifyWebhook(rawBody, signature) {
  const secret = webhookSecret();
  if (!secret) return false;
  const buf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ""));
  const expected = crypto.createHmac("sha256", secret).update(buf).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature || ""))); }
  catch (e) { return false; }
}

module.exports = { configured, createPaymentLink, verifyWebhook, keyId };
