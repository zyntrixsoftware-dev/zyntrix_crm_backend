// ============================================================
//  ADD-ON  ▸  Web App endpoint for the Zyntrix CRM "Shortlist" button
// ============================================================
//  Paste these functions INTO your existing shortlist Apps Script
//  (the one that already has CONFIG, COL_SL, footerSL,
//   sendShortlistNotification, and onShortlistEdit).
//
//  WHY a Web App (and not just the onEdit trigger):
//    An onEdit trigger only fires when a *person* edits a cell in the
//    UI — it does NOT fire when a value is set via the API or another
//    script. So when the CRM marks a candidate shortlisted, we expose a
//    doPost endpoint that BOTH sets Column O = TRUE AND sends the email
//    using your existing sendShortlistNotification().
//
//  DEPLOY:
//    1. Deploy ▸ New deployment ▸ Web app
//    2. Execute as:  Me
//    3. Who has access:  Anyone   (required so the CRM server can call it)
//    4. Copy the /exec URL.
//    5. In the backend (Railway / .env) set:
//          GAS_WEBAPP_URL = <the /exec URL>
//       (optional) GAS_WEBAPP_SECRET = <same value as GAS_SHARED_SECRET below>
//    6. Re-deploy the backend.
// ============================================================

// Optional shared secret. Set the SAME value in the backend env var
// GAS_WEBAPP_SECRET to reject unauthorized POSTs. Leave "" to disable.
const GAS_SHARED_SECRET = "";

function doPost(e) {
  try {
    const data = (e && e.postData && e.postData.contents)
      ? JSON.parse(e.postData.contents)
      : {};

    if (GAS_SHARED_SECRET && String(data.secret || "") !== GAS_SHARED_SECRET) {
      return _jsonOut({ ok: false, error: "unauthorized" });
    }

    // CRM "Shortlist" button → mark Column O = TRUE + email the candidate
    if (data.action === "updateCandidate") {
      return _handleShortlistUpdate(data);
    }

    // CRM job-application flow → append a new row
    return _handleNewApplication(data);

  } catch (err) {
    return _jsonOut({ ok: false, error: String(err) });
  }
}

// ── Shortlist: find the candidate's row by email, set Column O = TRUE,
//    and send the shortlist email (with a duplicate-send guard on Column R) ──
function _handleShortlistUpdate(data) {
  const email = String(data.email || "").trim().toLowerCase();
  if (!email) return _jsonOut({ ok: false, error: "email required" });

  const sheet  = SpreadsheetApp.openById(SHEET_ID_SL).getSheetByName(SHEET_NAME_SL);
  const values = sheet.getDataRange().getValues();

  // Locate the row by email (Column D = COL_SL.EMAIL)
  let rowIndex = -1;
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][COL_SL.EMAIL] || "").trim().toLowerCase() === email) {
      rowIndex = r;
      break;
    }
  }

  // If the candidate isn't in the sheet yet, append a fresh row from the payload
  if (rowIndex === -1) {
    const newRow = new Array(18).fill("");
    newRow[0]                = new Date();          // Column A — timestamp
    newRow[COL_SL.POSITION]  = data.position || ""; // Column B
    newRow[COL_SL.FULL_NAME] = data.fullName || ""; // Column C
    newRow[COL_SL.EMAIL]     = email;               // Column D
    newRow[COL_SL.PHONE]     = data.phone || "";    // Column E
    sheet.appendRow(newRow);
    rowIndex = sheet.getLastRow() - 1;
  }

  const sheetRow = rowIndex + 1; // convert 0-based index → 1-based row

  // Flip "Interview Shortlisted" (Column O) to TRUE
  sheet.getRange(sheetRow, COL_SL.INTERVIEW_STATUS + 1).setValue(true);

  // Read the current row for the email content
  const row = sheet.getRange(sheetRow, 1, 1, 18).getValues()[0];
  const candidate = {
    fullName : String(row[COL_SL.FULL_NAME] || data.fullName || "").trim(),
    email    : String(row[COL_SL.EMAIL]     || email).trim(),
    position : String(row[COL_SL.POSITION]  || data.position || "").trim(),
    phone    : String(row[COL_SL.PHONE]     || data.phone || "").trim()
  };

  // Send the email here (onEdit does NOT fire on programmatic setValue).
  // Dedupe using the sent-flag in Column R (COL_SL.EMAIL_SENT_FLAG).
  const sentFlag = String(row[COL_SL.EMAIL_SENT_FLAG] || "").trim().toLowerCase();
  let emailed = false;
  if (data.shortlisted !== false && candidate.email && sentFlag.indexOf("sent") !== 0) {
    sendShortlistNotification(candidate);
    sheet.getRange(sheetRow, COL_SL.EMAIL_SENT_FLAG + 1)
         .setValue("Sent – " + new Date().toLocaleString("en-IN"));
    emailed = true;
  }

  return _jsonOut({ ok: true, row: sheetRow, emailed: emailed });
}

// ── New job application → append a row ──
// NOTE: columns F onward are a best-effort mapping — adjust the indices
//       below to match the actual column order in your sheet if needed.
function _handleNewApplication(data) {
  const email = String(data.email || "").trim().toLowerCase();
  if (!email) return _jsonOut({ ok: false, error: "email required" });

  const sheet = SpreadsheetApp.openById(SHEET_ID_SL).getSheetByName(SHEET_NAME_SL);
  const row = new Array(18).fill("");
  row[0]                = data.timestamp || new Date(); // A — timestamp
  row[COL_SL.POSITION]  = data.position || "";          // B
  row[COL_SL.FULL_NAME] = data.fullName || "";          // C
  row[COL_SL.EMAIL]     = email;                        // D
  row[COL_SL.PHONE]     = data.phone || "";             // E
  row[5]                = data.qualifications || "";     // F
  row[6]                = data.experience    || "";      // G
  row[7]                = data.stateAddress  || "";      // H
  row[8]                = data.edtech        || "";      // I
  row[9]                = data.availability  || "";      // J
  row[10]               = data.source        || "";      // K
  row[11]               = data.declaration   || "";      // L
  sheet.appendRow(row);

  return _jsonOut({ ok: true, appended: true });
}

function _jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
