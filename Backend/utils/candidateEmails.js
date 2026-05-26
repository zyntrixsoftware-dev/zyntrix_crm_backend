/**
 * candidateEmails.js
 *
 * Lifecycle email templates the HRMS sends to candidates as they move
 * through the funnel:
 *
 *   1. Application Received  -- when imported on Candidates page
 *   2. Shortlisted           -- when shortlisted into the Interview Panel
 *   3. Round Qualified       -- after each interview round passes
 *   4. Round Not Qualified   -- if a round fails
 *   5. Marked for Offer      -- when HR ticks "Offered" on the panel
 *      (informational; the actual signed PDF offer is sent separately)
 *   6. Rejected              -- when HR clicks Reject on candidates page
 *
 * ALL emails are sent through Google Apps Script (GAS) via Gmail.
 * No SMTP / nodemailer is used anywhere in this file.
 */

// ─────────────────────────────────────────────────────────────────────────────
// GAS EMAIL ROUTER — forwards payload to GAS web app which sends a
// professional HTML email via Gmail. Returns true if GAS accepted the call.
// ─────────────────────────────────────────────────────────────────────────────
async function callGasEmail(payload) {
  const gasUrl = process.env.GAS_WEBAPP_URL;
  if (!gasUrl) {
    console.warn("[candidateEmails] GAS_WEBAPP_URL not set — email skipped:", payload.action);
    return false;
  }
  try {
    // IMPORTANT: Must use "text/plain" not "application/json".
    // GAS webapps redirect application/json POSTs (302), and Node fetch
    // follows the redirect as GET — dropping the body. text/plain is
    // processed directly by GAS without redirect.
    const res = await fetch(gasUrl, {
      method  : "POST",
      headers : { "Content-Type": "text/plain;charset=utf-8" },
      body    : JSON.stringify(payload),
      redirect: "follow",
    });
    const text = await res.text();

    if (!res.ok) {
      console.warn("[GAS email] HTTP error →", payload.action, "| HTTP", res.status, "|", text.slice(0, 200));
      return false;
    }

    // GAS always returns HTTP 200 even when email sending fails internally.
    // Parse the JSON body and check the ok flag — this is the real success signal.
    try {
      const json = JSON.parse(text);
      if (json.ok === false) {
        console.warn("[GAS email] GAS reported failure →", payload.action,
                     "| error:", json.error || "unknown", "| to:", payload.email);
        return false;
      }
    } catch (_) {
      // GAS returned non-JSON (e.g. an HTML error page from Google) — treat as failure
      if (!text.includes('"ok":true') && !text.includes('"ok": true')) {
        console.warn("[GAS email] non-JSON GAS response →", payload.action, "|", text.slice(0, 200));
        return false;
      }
    }

    console.log("[GAS email] sent ✓ →", payload.action, "→", payload.email, "| HTTP", res.status);
    return true;
  } catch (err) {
    console.warn("[GAS email] fetch failed →", payload.action, "|", err.message);
    return false;
  }
}

// 1. APPLICATION RECEIVED ----------------------------------------------------
async function notifyApplicationReceived(candidate) {
  const ok = await callGasEmail({
    action  : "sendApplicationReceived",
    email   : candidate.email,
    fullName: candidate.name       || "Candidate",
    position: candidate.appliedFor || "the role",
  });
  return { sent: ok, reason: ok ? "via_gas" : "gas_unavailable" };
}

// 2. RESUME SHORTLISTED -------------------------------------------------------
// Routes through the same GAS "updateCandidate" action that also marks col N
// in the Sheet and sends the branded shortlist email.
async function notifyShortlisted(interview) {
  const ok = await callGasEmail({
    action  : "updateCandidate",
    email   : interview.candidateEmail,
    fullName: interview.candidateName || "Candidate",
    position: interview.appliedFor    || "the role",
    phone   : interview.candidatePhone || "",
  });
  return { sent: ok, reason: ok ? "via_gas" : "gas_unavailable" };
}

// 3a. ROUND QUALIFIED --------------------------------------------------------
async function notifyRoundQualified(interview, roundNumber) {
  const ok = await callGasEmail({
    action     : "sendRoundQualified",
    email      : interview.candidateEmail,
    fullName   : interview.candidateName  || "Candidate",
    position   : interview.appliedFor     || "the role",
    roundNumber: roundNumber,
  });
  return { sent: ok, reason: ok ? "via_gas" : "gas_unavailable" };
}

// 3b. ROUND NOT QUALIFIED ----------------------------------------------------
async function notifyRoundNotQualified(interview, roundNumber) {
  const ok = await callGasEmail({
    action     : "sendRoundNotQualified",
    email      : interview.candidateEmail,
    fullName   : interview.candidateName  || "Candidate",
    position   : interview.appliedFor     || "the role",
    roundNumber: roundNumber,
  });
  return { sent: ok, reason: ok ? "via_gas" : "gas_unavailable" };
}

// 4. MARKED FOR OFFER --------------------------------------------------------
// Sent when HR ticks the "Offered" checkbox on the Interview Panel.
// The formal signed PDF offer arrives separately via the Offer Letters page.
async function notifyMarkedForOffer(interview) {
  const ok = await callGasEmail({
    action  : "sendOffered",
    email   : interview.candidateEmail,
    fullName: interview.candidateName || "Candidate",
    position: interview.appliedFor    || "the role",
  });
  return { sent: ok, reason: ok ? "via_gas" : "gas_unavailable" };
}

// 5. REJECTED ----------------------------------------------------------------
async function notifyRejected(candidate) {
  const ok = await callGasEmail({
    action  : "sendRejected",
    email   : candidate.email,
    fullName: candidate.name       || "Candidate",
    position: candidate.appliedFor || "the role",
  });
  return { sent: ok, reason: ok ? "via_gas" : "gas_unavailable" };
}

// 7. OFFER LETTER (PDF) -------------------------------------------------------
// Sends the formal offer letter via the GAS web app (Gmail), with the generated
// PDF attached. Offers go out through Apps Script ONLY — there is deliberately
// no SMTP fallback here.
//   payload: { email, fullName, position, phone?, hrName?, offerPdfBase64, offerPdfName }
async function notifyOfferLetter(payload) {
  const ok = await callGasEmail({ action: "sendOfferLetter", ...payload });
  return { sent: ok, reason: ok ? "via_gas" : "gas_unavailable" };
}


// 8. ONBOARDED — documents verified, candidate is ready to join ---------------
// Triggered when HR clicks "Mark Onboarded" on the onboarding page.
async function notifyOnboarded(ob) {
  const ok = await callGasEmail({
    action     : "sendOnboarded",
    email      : ob.candidateEmail,
    fullName   : ob.candidateName  || "Candidate",
    position   : ob.position       || "the role",
    joiningDate: ob.joiningDate
      ? new Date(ob.joiningDate).toLocaleDateString("en-IN", { day:"numeric", month:"long", year:"numeric" })
      : "",
  });
  return { sent: ok, reason: ok ? "via_gas" : "gas_unavailable" };
}

module.exports = {
  notifyApplicationReceived,
  notifyShortlisted,
  notifyRoundQualified,
  notifyRoundNotQualified,
  notifyMarkedForOffer,
  notifyOfferLetter,
  notifyRejected,
  notifyOnboarded
};
