/**
 * generateOfferPDF — produce a Verzeo-style offer letter PDF for Zyntrix.
 * Returns a Promise<Buffer>. See controller for usage.
 */

const PDFDocument = require("pdfkit");

const COMPANY = {
  name:      process.env.COMPANY_NAME      || "Zyntrix Software Solutions Pvt. Ltd.",
  shortName: process.env.COMPANY_SHORTNAME || "ZYNTRIX SOFTWARE SOLUTIONS",
  address:   process.env.COMPANY_ADDRESS   || "Hyderabad, Telangana, India",
  hrEmail:   process.env.COMPANY_HR_EMAIL  || "hr@zyntrixsoftware.com",
  support:   process.env.COMPANY_SUPPORT_EMAIL || "support@zyntrixsoftware.com",
  phone:     process.env.COMPANY_PHONE     || "",
  cin:       process.env.COMPANY_CIN       || "",
  gstn:      process.env.COMPANY_GSTN      || "",
  pan:       process.env.COMPANY_PAN       || ""
};

const TEMPLATE_INTROS = {
  default:
    "We are pleased to inform you that you have been selected for the position of " +
    "{{appliedFor}} at {{companyName}}. Please find below the confirmation of your " +
    "employment offer.",
  engineer:
    "We are excited to confirm your selection for the position of {{appliedFor}} on " +
    "the {{companyName}} Engineering team. Your technical strengths and problem-solving " +
    "approach stood out across every round of our interview process. Please find below " +
    "the confirmation of your employment offer.",
  sales:
    "We are delighted to confirm your selection for the position of {{appliedFor}} in " +
    "the {{companyName}} Sales organisation. Your customer-first mindset and ownership " +
    "impressed us throughout the interview process. Please find below the confirmation " +
    "of your employment offer.",
  intern:
    "We congratulate you for being selected for an Internship with {{companyName}} on " +
    "an \"At will basis\" which can be extended based on performance. Please find " +
    "below the confirmation of your Internship.",
  manager:
    "We are pleased to extend an offer for the leadership role of {{appliedFor}} at " +
    "{{companyName}}. We are confident you will be a strong addition to our leadership " +
    "team. Please find below the confirmation of your employment offer."
};

function fmtDate(s) {
  if (!s) return "-";
  const d = new Date(s + (typeof s === "string" && s.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

function fillIntro(key, data) {
  const tpl = TEMPLATE_INTROS[key] || TEMPLATE_INTROS.default;
  return tpl
    .replace(/\{\{appliedFor\}\}/g,  data.appliedFor  || "the role")
    .replace(/\{\{companyName\}\}/g, COMPANY.name);
}

function kvLine(doc, label, value, opts) {
  opts = opts || {};
  const labelWidth = opts.labelWidth || 150;
  const y = doc.y;
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#1f2937")
     .text(label, doc.page.margins.left, y, { width: labelWidth, continued: false });
  doc.font("Helvetica").fontSize(10).fillColor("#111827")
     .text(": " + (value == null ? "-" : String(value)),
           doc.page.margins.left + labelWidth, y);
  doc.moveDown(0.25);
}

function rule(doc) {
  const x1 = doc.page.margins.left;
  const x2 = doc.page.width - doc.page.margins.right;
  doc.strokeColor("#cbd5e1").lineWidth(0.5)
     .moveTo(x1, doc.y).lineTo(x2, doc.y).stroke();
  doc.moveDown(0.6);
}

function sectionHeader(doc, text) {
  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#0d1b2a").text(text);
  rule(doc);
}

function signatureLine(doc) {
  doc.moveDown(1.2);
  const left = doc.page.margins.left;
  const y    = doc.y + 16;
  doc.font("Helvetica").fontSize(10).fillColor("#111827")
     .text("SIGNATURE: ", left, y, { continued: true })
     .text("_______________________________", { continued: true })
     .text("        DATE: ", { continued: true })
     .text("_______________________________");
  doc.font("Helvetica-Oblique").fontSize(9).fillColor("#64748b")
     .text("(Candidate's Signature)", left, doc.y + 2);
  doc.fillColor("#111827");
}

function drawHeader(doc) {
  const top = 28;
  doc.save();
  doc.font("Helvetica-Bold").fontSize(15).fillColor("#3b82f6")
     .text(COMPANY.shortName, doc.page.margins.left, top, { lineBreak: false });
  doc.strokeColor("#3b82f6").lineWidth(2)
     .moveTo(doc.page.margins.left, top + 22)
     .lineTo(doc.page.width - doc.page.margins.right, top + 22)
     .stroke();
  doc.restore();
}

function drawFooter(doc, pageNum, totalPages) {
  const bottom = doc.page.height - 50;
  const left   = doc.page.margins.left;
  const right  = doc.page.width - doc.page.margins.right;
  doc.save();
  doc.strokeColor("#e5e7eb").lineWidth(0.5)
     .moveTo(left, bottom).lineTo(right, bottom).stroke();

  doc.font("Helvetica").fontSize(9).fillColor("#64748b");
  doc.text(COMPANY.name,    left, bottom + 6,  { lineBreak: false });
  doc.text(COMPANY.address, left, bottom + 19, { lineBreak: false });
  const contact = [COMPANY.hrEmail, COMPANY.phone].filter(Boolean).join("  -  ");
  if (contact) doc.text(contact, left, bottom + 32, { lineBreak: false });

  doc.text(
    "Page " + pageNum + (totalPages ? " of " + totalPages : ""),
    left, bottom + 6,
    { width: right - left, align: "right" }
  );

  const legal = [
    COMPANY.cin  ? "CIN: "  + COMPANY.cin  : "",
    COMPANY.gstn ? "GSTN: " + COMPANY.gstn : "",
    COMPANY.pan  ? "PAN: "  + COMPANY.pan  : ""
  ].filter(Boolean).join("  -  ");
  if (legal) {
    doc.fontSize(8).text(legal, left, bottom + 45,
      { width: right - left, align: "right" });
  }
  doc.restore();
}

function generateOfferPDF(data, templateKey) {
  templateKey = templateKey || "default";
  return new Promise(function (resolve, reject) {
    try {
      const isIntern = (data.employeeType || "").toLowerCase() === "intern";

      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 90, bottom: 90, left: 60, right: 60 },
        bufferPages: true,
        info: {
          Title:   (isIntern ? "Internship" : "Offer") + " Letter - " + (data.candidateName || ""),
          Author:  COMPANY.name,
          Subject: "Offer of " + (isIntern ? "Internship" : "Employment") + " - " + (data.appliedFor || ""),
          Creator: "Zyntrix HRMS"
        }
      });

      const chunks = [];
      doc.on("data",  function (c) { chunks.push(c); });
      doc.on("end",   function ()  { resolve(Buffer.concat(chunks)); });
      doc.on("error", reject);

      const today = new Date().toLocaleDateString("en-IN",
        { day: "2-digit", month: "long", year: "numeric" });

      doc.moveDown(2);
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#111827").text("Date: " + today);
      doc.moveDown(0.8);

      doc.font("Helvetica").fontSize(11).fillColor("#111827")
         .text("Dear " + (data.candidateName || "Candidate") + ",");
      doc.moveDown(0.5);

      doc.font("Helvetica-Bold").fontSize(11)
         .text("Subject: Offer of " + (isIntern ? "Internship" : "Employment") +
               " - " + (data.appliedFor || ""));
      doc.moveDown(0.8);

      doc.font("Helvetica").fontSize(10.5).fillColor("#111827")
         .text(fillIntro(templateKey, data), { align: "justify", lineGap: 2 });
      doc.moveDown(0.8);

      kvLine(doc, isIntern ? "Internship Title" : "Position Title", data.appliedFor || "-");
      if (data.department) kvLine(doc, "Department", data.department);
      if (isIntern && data.trainingStartDate) {
        kvLine(doc, "Training Date",
          fmtDate(data.trainingStartDate) + " to " + fmtDate(data.trainingEndDate));
      }
      kvLine(doc,
        isIntern ? "Internship Start Date" : "Date of Joining",
        fmtDate(data.joiningDate));
      if (isIntern && data.internshipEndDate) {
        kvLine(doc, "Internship End Date", fmtDate(data.internshipEndDate));
      }

      doc.moveDown(0.4);

      if (data.hoursPerWeek) kvLine(doc, "Number of Hours", data.hoursPerWeek + " hours a week");
      kvLine(doc, "Location", data.location || "Zyntrix Office");
      if (data.reportingTo) kvLine(doc, "Reporting To", data.reportingTo);

      const currency  = data.ctcCurrency || "INR";
      const salaryFmt = Number(data.offeredSalary || 0).toLocaleString("en-IN");
      const ctcLabel  = isIntern ? "Internship Stipend" : "CTC Offered";
      const ctcUnit   = isIntern ? "per month" : "per annum";
      kvLine(doc, ctcLabel,
        currency + " " + salaryFmt + " " + ctcUnit +
        (isIntern ? "  (Subject to statutory deductions)" : ""));

      if (data.revenueTarget) kvLine(doc, "Revenue Target", data.revenueTarget);
      if (data.offerExpiryDate) kvLine(doc, "Offer Valid Until", fmtDate(data.offerExpiryDate));

      const acceptanceDays = data.acceptanceWindowDays || 2;
      doc.moveDown(0.6);
      doc.font("Helvetica").fontSize(10.5).fillColor("#111827").text(
        "Please indicate your acceptance by signing this letter and mailing the signed, " +
        "scanned soft copy of this Offer Letter - along with the documents listed in " +
        "the Annexure below - to <" + COMPANY.hrEmail + "> within " + acceptanceDays +
        " working days of receipt. The offer shall stand automatically withdrawn without " +
        "further action on the part of " + COMPANY.shortName + " if we do not receive your " +
        "acceptance within this timeline.",
        { align: "justify", lineGap: 2 }
      );

      const reportingBy = isIntern && data.trainingStartDate
        ? fmtDate(data.trainingStartDate)
        : fmtDate(data.joiningDate);
      doc.moveDown(0.5);
      doc.text(
        "I have read and understood the above terms and conditions, and I accept this " +
        "offer as set forth above with " + COMPANY.name + ", and will report on or before " +
        reportingBy + ".",
        { align: "justify", lineGap: 2 }
      );

      signatureLine(doc);

      if (data.additionalTerms) {
        doc.moveDown(0.6);
        doc.font("Helvetica-Bold").fontSize(10).text("Additional Terms:");
        doc.font("Helvetica").fontSize(10).text(data.additionalTerms, { lineGap: 2 });
      }

      doc.addPage();
      sectionHeader(doc, isIntern ? "Internship Policy" : "Employment Policy");

      const noticeDays = data.noticePeriodDays   || (isIntern ? 15 : 30);
      const workingHrs = data.workingHoursPerDay || 9;

      const firstBullets = [
        "By accepting this " + (isIntern ? "internship" : "employment") + " offer you agree " +
        "to perform all responsibilities assigned to you with due care and diligence and in " +
        "compliance with the management norms.",
        "You are required to substantially use your time and effort to perform these tasks " +
        "during business hours and such reasonable additional time as may be necessary."
      ];

      firstBullets.forEach(function (b) {
        doc.font("Helvetica").fontSize(10).fillColor("#111827")
           .text("- " + b, { align: "justify", lineGap: 2 });
        doc.moveDown(0.3);
      });

      doc.moveDown(0.2);
      kvLine(doc, "Working Hours", workingHrs + " hours a day (inc. lunch break)");
      kvLine(doc, "Job Type",      data.employeeType || "Full-time");
      kvLine(doc, "Location",      data.location     || "Zyntrix Office");
      if (data.revenueTarget) kvLine(doc, "Revenue Target", data.revenueTarget);
      doc.moveDown(0.4);

      const moreBullets = [
        isIntern
          ? "As an intern you will not receive employee benefits that regular employees receive."
          : "You will be eligible for the standard employee benefits offered by " + COMPANY.name +
            ", as detailed separately in the Employee Handbook.",
        "During the " + (isIntern ? "internship" : "probation") + " period, the Company " +
        "reserves the right to terminate your services without offering any reason, and you " +
        "are required to give " + noticeDays + " days' notice should you wish to resign " +
        "before the end of your tenure.",
        isIntern
          ? "If you discontinue the internship for personal reasons, you will pay a compensation equal to 1 month stipend to the Company."
          : "If you leave before completing your probation, you will compensate the Company in line with the standard probation-exit policy.",
        "All information acquired during your tenure shall be strictly confidential and you shall refrain from using it for your own purpose or from disclosing it to anyone outside of the Company.",
        "Upon conclusion of your tenure, you will immediately return to the Company all of its property, equipment and documents - including electronically stored information.",
        "You will observe all policies and practices governing the conduct of our business and employees.",
        "Official communication, within or outside the Company, must be through the company email account assigned to you or via your reporting manager.",
        isIntern
          ? "Post successful completion of the internship tenure, the candidate will be considered for performance-based pre-placement offers by the Company."
          : "Continued employment is subject to satisfactory performance reviews and adherence to Company policy."
      ];

      moreBullets.forEach(function (b) {
        doc.font("Helvetica").fontSize(10).fillColor("#111827")
           .text("- " + b, { align: "justify", lineGap: 2 });
        doc.moveDown(0.3);
      });

      signatureLine(doc);

      doc.addPage();
      sectionHeader(doc, "Annexure - Documents required at the time of joining");

      const annexure = [
        {
          title: "1. Professional / Educational Certificates and Mark Sheets:",
          sub: [
            "10th standard or equivalent examination (Original MS for verification)",
            "12th standard or equivalent examination (Original MS for verification)",
            "Graduation",
            "Post-graduation / Doctorate",
            "Other relevant educational or skill certifications"
          ]
        },
        { title: "2. Colour scanned copy of your photograph", sub: [] },
        { title: "3. PAN Card, Voter ID or Driving Licence (scanned copy)", sub: [] },
        {
          title: "4. Bank Account Details - Bank Name, Name as per bank records, Account Number, IFSC Code",
          sub: []
        }
      ];

      annexure.forEach(function (item) {
        doc.font("Helvetica-Bold").fontSize(10.5).fillColor("#111827")
           .text(item.title, { lineGap: 2 });
        item.sub.forEach(function (s) {
          doc.font("Helvetica").fontSize(10).fillColor("#1f2937")
             .text("    - " + s, { lineGap: 2 });
        });
        doc.moveDown(0.4);
      });

      const range = doc.bufferedPageRange();
      const totalPages = range.count;
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        drawHeader(doc);
        drawFooter(doc, i - range.start + 1, totalPages);
      }
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = generateOfferPDF;
