/**
 * candidateEmails.js
 *
 * All candidate lifecycle emails are routed through Google Apps Script (GAS).
 * The backend POSTs to GAS_WEBAPP_URL with an `action` field; GAS handles
 * branding, templating, and delivery via GmailApp (500/day Workspace quota).
 *
 * GAS action → email type mapping
 *   sendApplicationReceived  — application confirmed
 *   updateCandidate          — resume shortlisted
 *   sendRoundQualified       — interview round cleared
 *   sendRoundNotQualified    — interview round failed
 *   sendOffered              — marked for offer (all rounds cleared)
 *   sendOfferLetter          — formal offer letter (PDF attached)
 *   sendRejected             — application rejected
 *   sendOnboarded            — documents verified, ready to join
 *   sendOrientationInvite    — orientation session schedule
 *
 * Required env var (Railway):
 *   GAS_WEBAPP_URL  — the /exec URL of the deployed GAS web app
 */

const https = require("https");
const http  = require("http");

// ── GAS HTTP caller ───────────────────────────────────────────────────────────
// GAS web apps return a 302 redirect on every POST. We must follow it while
// keeping the POST method (standard fetch changes POST→GET on 302, breaking
// doPost). We use the raw https module and recurse on redirect responses.
function _postToGAS(url, payload, redirectCount) {
  redirectCount = redirectCount || 0;
  return new Promise(function (resolve, reject) {
    if (redirectCount > 5) return reject(new Error("Too many GAS redirects"));

    const body   = JSON.stringify(payload);
    const urlObj = new URL(url);
    const lib    = urlObj.protocol === "https:" ? https : http;

    const options = {
      hostname: urlObj.hostname,
      path    : urlObj.pathname + urlObj.search,
      method  : "POST",
      headers : {
        "Content-Type"  : "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = lib.request(options, function (res) {
      // Follow redirects with POST preserved
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        return _postToGAS(res.headers.location, payload, redirectCount + 1)
          .then(resolve)
          .catch(reject);
      }
      let data = "";
      res.on("data", function (chunk) { data += chunk; });
      res.on("end", function () {
        try   { resolve(JSON.parse(data)); }
        catch { resolve({ ok: true });     } // GAS returned non-JSON — treat as ok
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function _callGAS(action, payload) {
  const GAS_URL = process.env.GAS_WEBAPP_URL;
  if (!GAS_URL) {
    console.warn(`[candidateEmails] GAS_WEBAPP_URL not set — skipping "${action}"`);
    return { sent: false, reason: "GAS_WEBAPP_URL not configured" };
  }
  try {
    const result = await _postToGAS(GAS_URL, { action, ...payload });
    if (result.ok === false) {
      console.error(`[candidateEmails] GAS "${action}" error:`, result.error);
      return { sent: false, reason: result.error || "GAS returned ok:false" };
    }
    // Some handlers (shortlist) report whether they actually emailed via `emailed`.
    // If GAS skipped the send (guard), treat it as NOT sent so we can retry later.
    if (result.emailed === false) {
      console.warn(`[candidateEmails] GAS "${action}" skipped sending (guard) → ${payload.email}`);
      return { sent: false, reason: "GAS skipped (already-sent guard)" };
    }
    console.log(`[candidateEmails] GAS "${action}" sent → ${payload.email}`);
    return { sent: true, reason: "via_gas" };
  } catch (err) {
    console.error(`[candidateEmails] GAS "${action}" failed:`, err.message);
    return { sent: false, reason: err.message };
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  1. APPLICATION RECEIVED
// ════════════════════════════════════════════════════════════════════════════
async function notifyApplicationReceived(candidate) {
  return _callGAS("sendApplicationReceived", {
    email   : candidate.email,
    fullName: candidate.name       || "Candidate",
    position: candidate.appliedFor || "the role",
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  2. RESUME SHORTLISTED
// ════════════════════════════════════════════════════════════════════════════
async function notifyShortlisted(interview) {
  return _callGAS("updateCandidate", {
    email   : interview.candidateEmail,
    fullName: interview.candidateName  || "Candidate",
    position: interview.appliedFor     || "the role",
    phone   : interview.candidatePhone || "",
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  3a. ROUND QUALIFIED
// ════════════════════════════════════════════════════════════════════════════
async function notifyRoundQualified(interview, roundNumber) {
  return _callGAS("sendRoundQualified", {
    email      : interview.candidateEmail,
    fullName   : interview.candidateName || "Candidate",
    position   : interview.appliedFor    || "the role",
    roundNumber: roundNumber,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  3b. ROUND NOT QUALIFIED
// ════════════════════════════════════════════════════════════════════════════
async function notifyRoundNotQualified(interview, roundNumber) {
  return _callGAS("sendRoundNotQualified", {
    email      : interview.candidateEmail,
    fullName   : interview.candidateName || "Candidate",
    position   : interview.appliedFor    || "the role",
    roundNumber: roundNumber,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  4. MARKED FOR OFFER
// ════════════════════════════════════════════════════════════════════════════
async function notifyMarkedForOffer(interview) {
  return _callGAS("sendOffered", {
    email   : interview.candidateEmail,
    fullName: interview.candidateName || "Candidate",
    position: interview.appliedFor    || "the role",
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  5. OFFER LETTER  (PDF attached)
// ════════════════════════════════════════════════════════════════════════════
async function notifyOfferLetter(payload) {
  return _callGAS("sendOfferLetter", {
    email          : payload.email,
    fullName       : payload.fullName       || "Candidate",
    position       : payload.position       || "the role",
    phone          : payload.phone          || "",
    hrName         : payload.hrName         || "",
    offerPdfBase64 : payload.offerPdfBase64 || "",
    offerPdfName   : payload.offerPdfName   || "",
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  6. REJECTED
// ════════════════════════════════════════════════════════════════════════════
async function notifyRejected(candidate) {
  return _callGAS("sendRejected", {
    email   : candidate.email,
    fullName: candidate.name       || "Candidate",
    position: candidate.appliedFor || "the role",
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  7. ONBOARDED — documents verified, ready to join
// ════════════════════════════════════════════════════════════════════════════
async function notifyOnboarded(ob) {
  const joiningDate = ob.joiningDate
    ? new Date(ob.joiningDate).toLocaleDateString("en-IN", {
        day: "numeric", month: "long", year: "numeric",
      })
    : "";
  return _callGAS("sendOnboarded", {
    email      : ob.candidateEmail,
    fullName   : ob.candidateName || "Candidate",
    position   : ob.position      || "the role",
    joiningDate,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  8. ORIENTATION INVITE — session schedule
//  orientation: Orientation model doc
//  sessions   : [OrientationSession docs]
// ════════════════════════════════════════════════════════════════════════════
async function notifyOrientationInvite(orientation, sessions) {
  const joiningDate = orientation.joiningDate
    ? new Date(orientation.joiningDate).toLocaleDateString("en-IN", {
        day: "numeric", month: "long", year: "numeric",
      })
    : "";

  const sessionList = (sessions || []).map(function (s) {
    return {
      title        : s.title         || "Orientation Session",
      scheduledDate: s.scheduledDate || "",
      startTime    : s.startTime     || "",
      endTime      : s.endTime       || "",
      mode         : s.mode          || "in_person",
      venue        : s.venue         || "",
      facilitator  : s.facilitator   || "",
      isMandatory  : s.isMandatory !== false,
    };
  });

  return _callGAS("sendOrientationInvite", {
    email      : orientation.candidateEmail,
    fullName   : orientation.candidateName || "Candidate",
    position   : orientation.position      || "the role",
    joiningDate,
    mentorName : orientation.mentorName  || "",
    mentorEmail: orientation.mentorEmail || "",
    sessions   : sessionList,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  9. DEPLOYED — assigned to a team
//  dep: Deployment model doc  |  team: DeploymentTeam doc (populated)
// ════════════════════════════════════════════════════════════════════════════
async function notifyDeployed(dep, team) {
  const deployedDate = dep.deployedDate
    ? new Date(dep.deployedDate).toLocaleDateString("en-IN", {
        day: "numeric", month: "long", year: "numeric",
      })
    : "";
  const joiningDate = dep.joiningDate
    ? new Date(dep.joiningDate).toLocaleDateString("en-IN", {
        day: "numeric", month: "long", year: "numeric",
      })
    : "";

  return _callGAS("sendDeployed", {
    email           : dep.candidateEmail,
    fullName        : dep.candidateName      || "Candidate",
    position        : dep.position           || "the role",
    teamName        : dep.teamName           || (team && team.name) || "",
    department      : dep.department         || (team && team.department) || "",
    roleInTeam      : dep.roleInTeam         || "",
    reportingManager: dep.reportingManager   || (team && team.teamLead) || "",
    workLocation    : dep.workLocation       || "office",
    officeLocation  : dep.officeLocation     || (team && team.officeLocation) || "",
    shift           : dep.shift              || "",
    domainEmail     : dep.domainEmail        || "",
    deployedDate,
    joiningDate,
    teamLeadEmail   : (team && team.teamLeadEmail) || "",
  });
}

// ════════════════════════════════════════════════════════════════════════════
module.exports = {
  notifyApplicationReceived,
  notifyShortlisted,
  notifyRoundQualified,
  notifyRoundNotQualified,
  notifyMarkedForOffer,
  notifyOfferLetter,
  notifyRejected,
  notifyOnboarded,
  notifyOrientationInvite,
  notifyDeployed,
};
