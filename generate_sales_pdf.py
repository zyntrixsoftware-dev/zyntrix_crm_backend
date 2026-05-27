# -*- coding: utf-8 -*-
"""
ZyntrixCRM — Student Course Sales System Design Document
Generates: Student_Course_Sales_System_Design.pdf
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether
)
from reportlab.platypus.flowables import HRFlowable
from reportlab.lib.colors import HexColor
import os

# ── Colour Palette ────────────────────────────────────────────────────────────
NAVY       = HexColor("#0F172A")
NAVY2      = HexColor("#1E293B")
NAVY3      = HexColor("#334155")
ACCENT     = HexColor("#6366F1")   # indigo
ACCENT2    = HexColor("#818CF8")
GREEN      = HexColor("#22C55E")
ORANGE     = HexColor("#F97316")
RED        = HexColor("#EF4444")
TEAL       = HexColor("#14B8A6")
WHITE      = HexColor("#FFFFFF")
LIGHT_GREY = HexColor("#F1F5F9")
MID_GREY   = HexColor("#CBD5E1")
TEXT_DARK  = HexColor("#1E293B")
TEXT_MED   = HexColor("#475569")

PAGE_W, PAGE_H = A4
MARGIN = 1.8 * cm

# ── Document ──────────────────────────────────────────────────────────────────
OUTPUT = os.path.join(os.path.dirname(__file__), "Student_Course_Sales_System_Design.pdf")

doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    leftMargin=MARGIN, rightMargin=MARGIN,
    topMargin=2 * cm, bottomMargin=2 * cm,
    title="Student Course Sales System — Design Document",
    author="ZyntrixCRM"
)

# ── Styles ────────────────────────────────────────────────────────────────────
base_styles = getSampleStyleSheet()

def S(name, **kw):
    return ParagraphStyle(name, **kw)

styles = {
    "cover_title": S("cover_title",
        fontName="Helvetica-Bold", fontSize=28, textColor=WHITE,
        leading=36, alignment=TA_CENTER, spaceAfter=8),

    "cover_sub": S("cover_sub",
        fontName="Helvetica", fontSize=13, textColor=ACCENT2,
        leading=18, alignment=TA_CENTER, spaceAfter=4),

    "cover_meta": S("cover_meta",
        fontName="Helvetica", fontSize=10, textColor=MID_GREY,
        alignment=TA_CENTER, spaceAfter=2),

    "h1": S("h1",
        fontName="Helvetica-Bold", fontSize=17, textColor=WHITE,
        leading=22, spaceBefore=14, spaceAfter=6),

    "h2": S("h2",
        fontName="Helvetica-Bold", fontSize=13, textColor=ACCENT2,
        leading=17, spaceBefore=10, spaceAfter=4),

    "h3": S("h3",
        fontName="Helvetica-Bold", fontSize=11, textColor=HexColor("#94A3B8"),
        leading=15, spaceBefore=8, spaceAfter=3),

    "body": S("body",
        fontName="Helvetica", fontSize=9.5, textColor=HexColor("#CBD5E1"),
        leading=14, spaceBefore=2, spaceAfter=2),

    "bullet": S("bullet",
        fontName="Helvetica", fontSize=9, textColor=HexColor("#94A3B8"),
        leading=13, leftIndent=12, spaceBefore=1, spaceAfter=1),

    "tag": S("tag",
        fontName="Helvetica-Bold", fontSize=8, textColor=WHITE,
        alignment=TA_CENTER),

    "th": S("th",
        fontName="Helvetica-Bold", fontSize=8.5, textColor=WHITE,
        alignment=TA_CENTER),

    "td": S("td",
        fontName="Helvetica", fontSize=8.5, textColor=HexColor("#CBD5E1"),
        alignment=TA_LEFT, leading=12),

    "td_center": S("td_center",
        fontName="Helvetica", fontSize=8.5, textColor=HexColor("#CBD5E1"),
        alignment=TA_CENTER, leading=12),

    "footer": S("footer",
        fontName="Helvetica", fontSize=7.5, textColor=HexColor("#475569"),
        alignment=TA_CENTER),
}

# ── Page template with header/footer ─────────────────────────────────────────
def on_page(canvas, doc):
    canvas.saveState()
    w, h = A4

    # Dark background
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, w, h, fill=1, stroke=0)

    # Top bar
    canvas.setFillColor(NAVY2)
    canvas.rect(0, h - 1.2*cm, w, 1.2*cm, fill=1, stroke=0)
    canvas.setFillColor(ACCENT)
    canvas.rect(0, h - 1.22*cm, w, 0.12*cm, fill=1, stroke=0)

    if doc.page > 1:
        canvas.setFont("Helvetica-Bold", 8)
        canvas.setFillColor(ACCENT2)
        canvas.drawString(MARGIN, h - 0.85*cm, "ZyntrixCRM")
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(HexColor("#64748B"))
        canvas.drawRightString(w - MARGIN, h - 0.85*cm,
                               "Student Course Sales System — Design Document")

    # Bottom bar
    canvas.setFillColor(NAVY2)
    canvas.rect(0, 0, w, 1.0*cm, fill=1, stroke=0)
    canvas.setFillColor(ACCENT)
    canvas.rect(0, 0.98*cm, w, 0.06*cm, fill=1, stroke=0)

    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(HexColor("#475569"))
    canvas.drawCentredString(w / 2, 0.35*cm,
        f"ZyntrixCRM  ·  Confidential  ·  Page {doc.page}")

    canvas.restoreState()

# ── Helper builders ───────────────────────────────────────────────────────────
def section_header(text, icon=""):
    return [
        Spacer(1, 0.4*cm),
        HRFlowable(width="100%", thickness=1, color=NAVY3, spaceAfter=6),
        Paragraph(f"{icon}  {text}" if icon else text, styles["h1"]),
        HRFlowable(width="100%", thickness=2, color=ACCENT, spaceBefore=2, spaceAfter=8),
    ]

def sub_header(text):
    return Paragraph(text, styles["h2"])

def body(text):
    return Paragraph(text, styles["body"])

def bullet(text):
    return Paragraph(f"• &nbsp; {text}", styles["bullet"])

def spacer(h=0.25):
    return Spacer(1, h * cm)

def make_table(headers, rows, col_widths):
    cell_w = PAGE_W - 2 * MARGIN
    if col_widths:
        cw = [cell_w * f for f in col_widths]
    else:
        cw = None

    header_row = [Paragraph(h, styles["th"]) for h in headers]
    data = [header_row]
    for r in rows:
        data.append([Paragraph(str(c), styles["td"]) for c in r])

    t = Table(data, colWidths=cw, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND",  (0, 0), (-1, 0),  ACCENT),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [NAVY2, NAVY3]),
        ("TEXTCOLOR",   (0, 0), (-1, 0),  WHITE),
        ("FONTNAME",    (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",    (0, 0), (-1, -1), 8.5),
        ("TOPPADDING",  (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING",(0,0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",(0, 0), (-1, -1), 6),
        ("GRID",        (0, 0), (-1, -1), 0.4, NAVY),
        ("VALIGN",      (0, 0), (-1, -1), "TOP"),
    ]))
    return t

def color_hex(c):
    """Return '#RRGGBB' string from a ReportLab HexColor."""
    return "#{:02X}{:02X}{:02X}".format(
        int(c.red * 255), int(c.green * 255), int(c.blue * 255))

def badge(text, bg):
    t = Table([[Paragraph(text, styles["tag"])]], colWidths=[1.8*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), bg),
        ("TOPPADDING",    (0,0),(-1,-1),2),
        ("BOTTOMPADDING", (0,0),(-1,-1),2),
        ("LEFTPADDING",   (0,0),(-1,-1),4),
        ("RIGHTPADDING",  (0,0),(-1,-1),4),
        ("ROUNDEDCORNERS",[3]),
    ]))
    return t

# ══════════════════════════════════════════════════════════════════════════════
# BUILD CONTENT
# ══════════════════════════════════════════════════════════════════════════════
story = []

# ── COVER PAGE ────────────────────────────────────────────────────────────────
story.append(Spacer(1, 3.5*cm))
story.append(Paragraph("ZyntrixCRM", styles["cover_sub"]))
story.append(Spacer(1, 0.3*cm))
story.append(Paragraph("Student Course Sales System", styles["cover_title"]))
story.append(Spacer(1, 0.15*cm))
story.append(Paragraph("Full Design &amp; Architecture Document", styles["cover_sub"]))
story.append(Spacer(1, 1.2*cm))

# Cover stats strip
cov_data = [
    [Paragraph("8", ParagraphStyle("cv", fontName="Helvetica-Bold", fontSize=22, textColor=ACCENT2, alignment=TA_CENTER)),
     Paragraph("10", ParagraphStyle("cv2", fontName="Helvetica-Bold", fontSize=22, textColor=GREEN, alignment=TA_CENTER)),
     Paragraph("11", ParagraphStyle("cv3", fontName="Helvetica-Bold", fontSize=22, textColor=ORANGE, alignment=TA_CENTER)),
     Paragraph("7", ParagraphStyle("cv4", fontName="Helvetica-Bold", fontSize=22, textColor=TEAL, alignment=TA_CENTER)),
     Paragraph("5", ParagraphStyle("cv5", fontName="Helvetica-Bold", fontSize=22, textColor=RED, alignment=TA_CENTER))],
    [Paragraph("DB Models", styles["cover_meta"]),
     Paragraph("API Groups", styles["cover_meta"]),
     Paragraph("Pages", styles["cover_meta"]),
     Paragraph("Pipeline Stages", styles["cover_meta"]),
     Paragraph("Build Phases", styles["cover_meta"])],
]
cov_table = Table(cov_data, colWidths=[(PAGE_W-2*MARGIN)/5]*5)
cov_table.setStyle(TableStyle([
    ("BACKGROUND", (0,0),(-1,-1), NAVY2),
    ("TOPPADDING",    (0,0),(-1,-1), 10),
    ("BOTTOMPADDING", (0,0),(-1,-1), 10),
    ("GRID", (0,0),(-1,-1), 0.5, NAVY3),
]))
story.append(cov_table)
story.append(Spacer(1, 1.5*cm))

meta = [
    ["Version", "1.0"],
    ["Date", "May 2026"],
    ["Status", "Draft — Internal Use Only"],
    ["System", "ZyntrixCRM / HRMS Backend (Node.js + MongoDB)"],
    ["Author", "ZyntrixCRM Dev Team"],
]
mt = Table(meta, colWidths=[3.5*cm, PAGE_W-2*MARGIN-3.5*cm])
mt.setStyle(TableStyle([
    ("BACKGROUND",    (0,0),(-1,-1), NAVY2),
    ("TEXTCOLOR",     (0,0),(0,-1),  ACCENT2),
    ("TEXTCOLOR",     (1,0),(1,-1),  HexColor("#CBD5E1")),
    ("FONTNAME",      (0,0),(0,-1),  "Helvetica-Bold"),
    ("FONTNAME",      (1,0),(1,-1),  "Helvetica"),
    ("FONTSIZE",      (0,0),(-1,-1), 9),
    ("TOPPADDING",    (0,0),(-1,-1), 5),
    ("BOTTOMPADDING", (0,0),(-1,-1), 5),
    ("LEFTPADDING",   (0,0),(-1,-1), 8),
    ("GRID",          (0,0),(-1,-1), 0.5, NAVY3),
]))
story.append(mt)
story.append(PageBreak())

# ── SECTION 1: SYSTEM OVERVIEW ────────────────────────────────────────────────
story += section_header("1.  System Overview")
story.append(body(
    "The Student Course Sales System is a purpose-built CRM module inside ZyntrixCRM designed "
    "for EdTech companies that sell online/offline courses directly to students. The existing "
    "generic B2B sales module has been completely replaced with a student-focused pipeline that "
    "tracks every student from first contact to course completion."
))
story.append(spacer(0.3))
story.append(sub_header("1.1  What Changed vs. Old System"))

change_rows = [
    ["Generic leads", "Student leads with course interest, budget, education level"],
    ["B2B deal stages", "7-stage student enrollment pipeline"],
    ["No demo tracking", "Demo sessions booked, attended, and followed up"],
    ["No batch/course model", "Courses, batches, seats, schedule fully modelled"],
    ["Manual follow-ups", "Automated GAS email triggers at each pipeline stage"],
    ["No payment tracking", "EMI, full-pay, scholarship payment plans with instalment tracking"],
    ["Fake static data", "100% real backend — MongoDB + Express REST APIs"],
]
story.append(make_table(
    ["Old System", "New Student System"],
    change_rows,
    [0.42, 0.58]
))
story.append(spacer(0.4))

story.append(sub_header("1.2  Technology Stack"))
stack_rows = [
    ["Backend Runtime", "Node.js 18+  /  Express 4"],
    ["Database", "MongoDB  (Mongoose ODM)"],
    ["Authentication", "JWT (Bearer token)  —  existing auth middleware"],
    ["Email Automation", "Google Apps Script (GAS) Web App  →  Gmail API"],
    ["Frontend", "Vanilla HTML + CSS + JS  (api.js helper)"],
    ["Deployment", "Render.com  (backend)  /  Static hosting (frontend)"],
    ["File Uploads", "Multer  (profile photos, documents)"],
    ["PDF Generation", "ReportLab  (Python — reports/exports)"],
]
story.append(make_table(["Layer", "Technology"], stack_rows, [0.28, 0.72]))
story.append(PageBreak())

# ── SECTION 2: 7-STAGE PIPELINE ───────────────────────────────────────────────
story += section_header("2.  7-Stage Student Pipeline")
story.append(body(
    "Every StudentLead moves through exactly 7 stages. Each stage transition can trigger "
    "an automated email via GAS and updates the lead's pipelineStage field."
))
story.append(spacer(0.3))

pipeline_rows = [
    ["1", "New Lead", "TEAL", "Lead captured from form / import / manual entry", "Welcome + course info email"],
    ["2", "Contacted", "ACCENT", "First call / WhatsApp contact made", "Follow-up reminder scheduled"],
    ["3", "Demo Scheduled", "ORANGE", "Demo session booked in system", "Demo confirmation email to student"],
    ["4", "Demo Attended", "ACCENT", "Student attended demo, interest confirmed", "Post-demo nurture email + offer"],
    ["5", "Enrolled", "GREEN", "Payment collected, enrollment confirmed", "Enrollment confirmation + welcome kit"],
    ["6", "Dropped", "RED", "Student withdrew / not interested", "Win-back email after 14 days"],
    ["7", "Completed", "GREEN", "Course completed successfully", "Certificate + upsell email"],
]

# Build custom coloured table
stage_header = [Paragraph(h, styles["th"]) for h in
    ["#", "Stage", "Lead Status", "Description", "Auto Action"]]
stage_data = [stage_header]

stage_colors = {
    "TEAL": TEAL, "ACCENT": ACCENT, "ORANGE": ORANGE,
    "GREEN": GREEN, "RED": RED
}

for row in pipeline_rows:
    num, stage, color_key, desc, action = row
    col = stage_colors[color_key]
    stage_data.append([
        Paragraph(num, styles["td_center"]),
        Paragraph(f'<font color="{color_hex(col)}">{stage}</font>',
                  ParagraphStyle("sc", fontName="Helvetica-Bold", fontSize=8.5,
                                 textColor=col, alignment=TA_CENTER)),
        Paragraph(stage, styles["td_center"]),
        Paragraph(desc, styles["td"]),
        Paragraph(action, styles["td"]),
    ])

pt = Table(stage_data, colWidths=[
    (PAGE_W-2*MARGIN)*f for f in [0.05, 0.13, 0.13, 0.38, 0.31]
], repeatRows=1)
pt.setStyle(TableStyle([
    ("BACKGROUND",   (0,0),(-1,0),  ACCENT),
    ("ROWBACKGROUNDS",(0,1),(-1,-1),[NAVY2, NAVY3]),
    ("FONTSIZE",     (0,0),(-1,-1), 8.5),
    ("TOPPADDING",   (0,0),(-1,-1), 5),
    ("BOTTOMPADDING",(0,0),(-1,-1), 5),
    ("LEFTPADDING",  (0,0),(-1,-1), 5),
    ("RIGHTPADDING", (0,0),(-1,-1), 5),
    ("GRID",         (0,0),(-1,-1), 0.4, NAVY),
    ("VALIGN",       (0,0),(-1,-1), "TOP"),
]))
story.append(pt)
story.append(PageBreak())

# ── SECTION 3: DATABASE MODELS ────────────────────────────────────────────────
story += section_header("3.  Database Models (MongoDB / Mongoose)")
story.append(body(
    "All models live under Backend/models/. Each model is registered on the Express server "
    "and accessed through authenticated REST APIs."
))

models = [
    (
        "3.1  StudentLead",
        "Core entity representing one prospective student.",
        [
            ("_id", "ObjectId", "Auto-generated primary key"),
            ("fullName", "String  req", "Student's full name"),
            ("email", "String  unique", "Primary contact email"),
            ("phone", "String", "Mobile number (WhatsApp preferred)"),
            ("city", "String", "City / location"),
            ("educationLevel", "String  enum", "high_school | undergraduate | graduate | working_professional"),
            ("courseInterest", "ObjectId  ref:Course", "Which course they're enquiring about"),
            ("budget", "Number", "Stated monthly/total budget in INR"),
            ("pipelineStage", "String  enum", "new_lead | contacted | demo_scheduled | demo_attended | enrolled | dropped | completed"),
            ("source", "String  enum", "website | social_media | referral | cold_call | walk_in | other"),
            ("assignedTo", "ObjectId  ref:User", "Sales rep assigned to this lead"),
            ("lastContactedAt", "Date", "Timestamp of most recent contact"),
            ("followUpDate", "Date", "Next scheduled follow-up date"),
            ("notes", "String", "Free-text internal notes"),
            ("tags", "[String]", "Custom labels e.g. ['hot', 'scholarship']"),
            ("createdBy", "ObjectId  ref:User", "Who created the record"),
        ]
    ),
    (
        "3.2  Course",
        "Master catalogue of courses offered by the company.",
        [
            ("_id", "ObjectId", "Primary key"),
            ("title", "String  req", "Course name"),
            ("slug", "String  unique", "URL-friendly identifier"),
            ("description", "String", "Full course description"),
            ("category", "String  enum", "tech | design | business | marketing | other"),
            ("durationWeeks", "Number", "Total course length in weeks"),
            ("price", "Number", "Standard selling price (INR)"),
            ("discountPrice", "Number", "Current discount / offer price"),
            ("mode", "String  enum", "online | offline | hybrid"),
            ("curriculum", "[{title, duration}]", "Module / topic list"),
            ("isActive", "Boolean  default:true", "Whether accepting new enrolments"),
            ("createdBy", "ObjectId  ref:User", "Admin who created course"),
        ]
    ),
    (
        "3.3  Batch",
        "A scheduled run of a course with limited seats.",
        [
            ("_id", "ObjectId", "Primary key"),
            ("course", "ObjectId  ref:Course  req", "Which course this batch belongs to"),
            ("batchCode", "String  unique", "e.g. 'WD-JUN-2026'"),
            ("startDate", "Date", "Batch start date"),
            ("endDate", "Date", "Batch end date"),
            ("schedule", "String", "e.g. 'Mon/Wed/Fri  7–9 PM'"),
            ("mode", "String  enum", "online | offline | hybrid"),
            ("totalSeats", "Number", "Maximum enrolments allowed"),
            ("seatsBooked", "Number  default:0", "Auto-incremented on enrolment"),
            ("instructor", "String", "Instructor name(s)"),
            ("meetingLink", "String", "Zoom / Meet link for online batches"),
            ("status", "String  enum", "upcoming | ongoing | completed | cancelled"),
        ]
    ),
    (
        "3.4  DemoSession",
        "Tracks each demo / trial class booked for a lead.",
        [
            ("_id", "ObjectId", "Primary key"),
            ("lead", "ObjectId  ref:StudentLead  req", "The student who booked"),
            ("course", "ObjectId  ref:Course", "Course being demoed"),
            ("scheduledAt", "Date  req", "Demo date & time"),
            ("mode", "String  enum", "online | offline"),
            ("meetingLink", "String", "Link if online"),
            ("venue", "String", "Venue if offline"),
            ("conductedBy", "String", "Instructor / sales rep"),
            ("attended", "Boolean  default:false", "Did student show up?"),
            ("feedback", "String", "Post-demo student feedback"),
            ("followUpDone", "Boolean  default:false", "Has post-demo follow-up been sent?"),
            ("createdBy", "ObjectId  ref:User", "Who scheduled the demo"),
        ]
    ),
    (
        "3.5  Enrollment",
        "Confirmed enrolment of a student into a specific batch.",
        [
            ("_id", "ObjectId", "Primary key"),
            ("lead", "ObjectId  ref:StudentLead  req", "Enrolled student"),
            ("batch", "ObjectId  ref:Batch  req", "Batch enrolled into"),
            ("course", "ObjectId  ref:Course  req", "Course (denormalized for queries)"),
            ("enrolledAt", "Date  default:now", "Enrolment timestamp"),
            ("paymentPlan", "String  enum", "full | emi | scholarship"),
            ("totalFee", "Number", "Agreed total fee"),
            ("feePaid", "Number  default:0", "Amount paid so far"),
            ("completionStatus", "String  enum", "active | completed | dropped"),
            ("certificateIssued", "Boolean  default:false", "Has certificate been sent?"),
            ("createdBy", "ObjectId  ref:User", "Sales rep who closed the deal"),
        ]
    ),
    (
        "3.6  Payment",
        "Individual payment transactions (one Enrollment can have many Payments).",
        [
            ("_id", "ObjectId", "Primary key"),
            ("enrollment", "ObjectId  ref:Enrollment  req", "Parent enrollment"),
            ("amount", "Number  req", "Amount paid (INR)"),
            ("paidAt", "Date  default:now", "Payment timestamp"),
            ("method", "String  enum", "upi | card | bank_transfer | cash | other"),
            ("transactionId", "String", "Payment gateway / bank ref"),
            ("instalmentNumber", "Number", "1, 2, 3 ... for EMI plans"),
            ("remarks", "String", "Internal notes"),
            ("createdBy", "ObjectId  ref:User", "Who recorded the payment"),
        ]
    ),
    (
        "3.7  FollowUp",
        "Scheduled and completed follow-up log for a lead.",
        [
            ("_id", "ObjectId", "Primary key"),
            ("lead", "ObjectId  ref:StudentLead  req", "Lead being followed up"),
            ("scheduledAt", "Date  req", "When follow-up is due"),
            ("completedAt", "Date", "When it was actually done"),
            ("type", "String  enum", "call | whatsapp | email | meeting"),
            ("outcome", "String  enum", "no_answer | interested | not_interested | callback | enrolled"),
            ("notes", "String", "What was discussed"),
            ("nextFollowUp", "Date", "Date of next follow-up if needed"),
            ("createdBy", "ObjectId  ref:User", "Sales rep who created the follow-up"),
        ]
    ),
    (
        "3.8  SalesTarget",
        "Monthly targets per sales rep — used for performance dashboard.",
        [
            ("_id", "ObjectId", "Primary key"),
            ("user", "ObjectId  ref:User  req", "Sales rep"),
            ("month", "Number", "1–12"),
            ("year", "Number", "e.g. 2026"),
            ("targetLeads", "Number", "Lead generation target"),
            ("targetEnrollments", "Number", "Enrollment closure target"),
            ("targetRevenue", "Number", "Revenue target (INR)"),
            ("achievedLeads", "Number  default:0", "Actual leads so far"),
            ("achievedEnrollments", "Number  default:0", "Actual enrollments so far"),
            ("achievedRevenue", "Number  default:0", "Actual revenue so far"),
        ]
    ),
]

for model_title, model_desc, fields in models:
    story.append(KeepTogether([
        sub_header(model_title),
        body(model_desc),
        spacer(0.15),
        make_table(
            ["Field", "Type / Constraint", "Description"],
            fields,
            [0.22, 0.24, 0.54]
        ),
        spacer(0.3),
    ]))

story.append(PageBreak())

# ── SECTION 4: API ROUTES ─────────────────────────────────────────────────────
story += section_header("4.  REST API Route Groups")
story.append(body(
    "All routes are protected by JWT auth middleware. Base URL: /api/sales/... "
    "The Express router file is Backend/routes/salesRoutes.js."
))
story.append(spacer(0.3))

api_groups = [
    ("4.1  Student Leads", [
        ("GET",    "/leads",                   "List all leads (filter by stage, assignedTo, source, date range)"),
        ("POST",   "/leads",                   "Create a new student lead"),
        ("GET",    "/leads/:id",               "Get single lead with populated fields"),
        ("PATCH",  "/leads/:id",               "Update lead fields (incl. pipelineStage)"),
        ("DELETE", "/leads/:id",               "Soft-delete / archive lead"),
        ("PATCH",  "/leads/:id/stage",         "Move lead to new pipeline stage (triggers email)"),
        ("GET",    "/leads/stats",             "Aggregate counts by stage, source, rep"),
    ]),
    ("4.2  Courses", [
        ("GET",    "/courses",                 "List all active courses"),
        ("POST",   "/courses",                 "Create new course (admin only)"),
        ("GET",    "/courses/:id",             "Get course with curriculum"),
        ("PATCH",  "/courses/:id",             "Update course details"),
        ("DELETE", "/courses/:id",             "Deactivate course (soft delete)"),
    ]),
    ("4.3  Batches", [
        ("GET",    "/batches",                 "List batches (filter by course, status, date)"),
        ("POST",   "/batches",                 "Create new batch"),
        ("GET",    "/batches/:id",             "Get batch with enrolled count"),
        ("PATCH",  "/batches/:id",             "Update batch details"),
        ("DELETE", "/batches/:id",             "Cancel batch"),
        ("GET",    "/batches/:id/enrollments", "List all enrollments for a batch"),
    ]),
    ("4.4  Demo Sessions", [
        ("GET",    "/demos",                   "List all demos (filter by date, attended, lead)"),
        ("POST",   "/demos",                   "Schedule a new demo session"),
        ("GET",    "/demos/:id",               "Get demo details"),
        ("PATCH",  "/demos/:id",               "Update demo (mark attended, add feedback)"),
        ("DELETE", "/demos/:id",               "Cancel/delete demo"),
        ("POST",   "/demos/:id/send-reminder", "Trigger GAS reminder email to student"),
    ]),
    ("4.5  Enrollments", [
        ("GET",    "/enrollments",             "List all enrollments (filter by batch, status)"),
        ("POST",   "/enrollments",             "Create enrollment (auto-increments batch seats)"),
        ("GET",    "/enrollments/:id",         "Get enrollment with payments"),
        ("PATCH",  "/enrollments/:id",         "Update enrollment status / completion"),
        ("DELETE", "/enrollments/:id",         "Cancel enrollment (decrements seats)"),
    ]),
    ("4.6  Payments", [
        ("GET",    "/payments",                "List all payments (filter by enrollment, date)"),
        ("POST",   "/payments",                "Record a new payment transaction"),
        ("GET",    "/payments/:id",            "Get payment details"),
        ("PATCH",  "/payments/:id",            "Correct payment record"),
        ("DELETE", "/payments/:id",            "Void/delete payment"),
        ("GET",    "/payments/summary",        "Total collected, pending, overdue by enrollment"),
    ]),
    ("4.7  Follow-Ups", [
        ("GET",    "/followups",               "List follow-ups (filter by due today, overdue, lead)"),
        ("POST",   "/followups",               "Schedule a new follow-up"),
        ("GET",    "/followups/:id",           "Get follow-up details"),
        ("PATCH",  "/followups/:id",           "Mark completed, add outcome & next follow-up"),
        ("DELETE", "/followups/:id",           "Delete follow-up"),
        ("GET",    "/followups/today",         "All follow-ups due today for current user"),
    ]),
    ("4.8  Sales Targets", [
        ("GET",    "/targets",                 "List all targets (current user or all — admin)"),
        ("POST",   "/targets",                 "Set target for a rep for a month"),
        ("PATCH",  "/targets/:id",             "Update target values"),
        ("GET",    "/targets/dashboard",       "Current month target vs achieved for all reps"),
    ]),
    ("4.9  Reports & Analytics", [
        ("GET",    "/reports/pipeline",        "Lead count by stage (funnel chart data)"),
        ("GET",    "/reports/revenue",         "Revenue collected by month / course / rep"),
        ("GET",    "/reports/conversion",      "Lead-to-enrollment conversion rates"),
        ("GET",    "/reports/demos",           "Demo scheduled vs attended rates"),
        ("GET",    "/reports/rep-performance", "Per-rep stats: leads, demos, enrollments, revenue"),
    ]),
    ("4.10  Bulk / Import", [
        ("POST",   "/leads/import",            "Bulk import student leads from Excel (.xlsx)"),
        ("GET",    "/leads/export",            "Export all leads to Excel"),
        ("POST",   "/courses/import",          "Bulk import course catalogue"),
    ]),
]

for group_title, routes in api_groups:
    story.append(KeepTogether([
        sub_header(group_title),
        make_table(
            ["Method", "Endpoint", "Description"],
            routes,
            [0.1, 0.32, 0.58]
        ),
        spacer(0.3),
    ]))

story.append(PageBreak())

# ── SECTION 5: FRONTEND PAGES ─────────────────────────────────────────────────
story += section_header("5.  Frontend Pages")
story.append(body(
    "All pages live under Frontend/modules/Sales/. Each page uses the shared api.js helper "
    "and follows the existing ZyntrixCRM design system (dark navy + indigo)."
))
story.append(spacer(0.3))

pages = [
    ("5.1", "leads.html", "NEW", "Student Leads Pipeline",
     ["Kanban view — 7 columns, one per pipeline stage",
      "Drag-and-drop card to move lead between stages",
      "Quick-add lead form in slide-over panel",
      "Filter bar: stage, source, assigned rep, date range",
      "Click card → opens detail drawer"]),

    ("5.2", "lead_detail.html", "NEW", "Lead Detail & Timeline",
     ["Full lead profile: personal info, course interest, budget",
      "Activity timeline: calls, demos, payments, stage changes",
      "Inline follow-up scheduler with outcome tracker",
      "One-click 'Book Demo' button → creates DemoSession",
      "One-click 'Enroll' button → opens enrollment modal"]),

    ("5.3", "courses.html", "NEW", "Course Catalogue",
     ["Card grid of all active courses with price, duration, mode badges",
      "Create/edit course slide-over form with curriculum builder",
      "Batch count and available seats shown per course card",
      "Search and category filter"]),

    ("5.4", "batches.html", "NEW", "Batch Manager",
     ["Table view: batch code, dates, seats filled/total, status chip",
      "Create batch form linked to course dropdown",
      "View batch → shows enrolled students list",
      "Bulk-mark batch status (ongoing → completed)"]),

    ("5.5", "demos.html", "NEW", "Demo Sessions Calendar",
     ["Month/week calendar view of scheduled demos",
      "List view with attended / not-attended toggle",
      "Send reminder email button per demo",
      "Quick 'Mark Attended' + feedback notes popup",
      "KPI bar: total scheduled, attended rate, post-demo conversion"]),

    ("5.6", "enrollments.html", "NEW", "Enrollments",
     ["Table: student name, course, batch, plan, fee paid/total",
      "Color-coded payment status: Paid / Partial / Overdue",
      "Open enrollment → view payment history + record new payment",
      "Issue certificate button (updates flag, triggers email)",
      "Export to Excel button"]),

    ("5.7", "payments.html", "NEW", "Payment Register",
     ["Full transaction log with method, amount, date, instalment number",
      "Search by enrollment, date range, method",
      "Running total cards: collected today / this month / overdue",
      "Void payment button (admin only)"]),

    ("5.8", "followups.html", "NEW", "Follow-Up Tracker",
     ["'Due Today' list at top — highlighted in orange if overdue",
      "Mark complete with outcome dropdown and next follow-up picker",
      "Auto-advance pipeline stage on 'enrolled' outcome selection",
      "Per-rep filter for team lead view"]),

    ("5.9", "targets.html", "REWORK", "Sales Targets Dashboard",
     ["Admin sets monthly targets per rep",
      "Progress bars: leads / demos / enrollments / revenue vs target",
      "Team leaderboard sorted by revenue achievement %",
      "Month picker to view historical target performance"]),

    ("5.10", "reports.html", "NEW", "Reports & Analytics",
     ["Pipeline funnel chart (lead counts by stage)",
      "Revenue bar chart by month with course breakdown",
      "Conversion rate table: source → lead → demo → enrollment",
      "Rep performance comparison table",
      "Date range picker + export to PDF button"]),

    ("5.11", "import.html", "REWORK", "Import / Export",
     ["Drag-and-drop Excel upload for bulk lead import",
      "Column mapping UI (existing import framework re-used)",
      "Download sample template button",
      "Export leads / enrollments to Excel"]),
]

page_header = [Paragraph(h, styles["th"]) for h in
    ["#", "File", "Status", "Page Name", "Key Features"]]
page_data = [page_header]

for num, file, status, name, features in pages:
    feat_text = "<br/>".join(f"• {f}" for f in features)
    status_color = GREEN if status == "NEW" else ORANGE
    page_data.append([
        Paragraph(num, styles["td_center"]),
        Paragraph(file, ParagraphStyle("mono", fontName="Courier", fontSize=7.5,
                                       textColor=HexColor("#7DD3FC"), leading=11)),
        Paragraph(f'<font color="{color_hex(status_color)}">{status}</font>',
                  ParagraphStyle("sb", fontName="Helvetica-Bold", fontSize=8,
                                 textColor=status_color, alignment=TA_CENTER)),
        Paragraph(name, styles["td"]),
        Paragraph(feat_text, ParagraphStyle("feats", fontName="Helvetica", fontSize=8,
                                             textColor=HexColor("#94A3B8"), leading=12)),
    ])

pt2 = Table(page_data, colWidths=[
    (PAGE_W-2*MARGIN)*f for f in [0.05, 0.15, 0.08, 0.2, 0.52]
], repeatRows=1)
pt2.setStyle(TableStyle([
    ("BACKGROUND",    (0,0),(-1,0), ACCENT),
    ("ROWBACKGROUNDS",(0,1),(-1,-1),[NAVY2, NAVY3]),
    ("FONTSIZE",      (0,0),(-1,-1), 8.5),
    ("TOPPADDING",    (0,0),(-1,-1), 5),
    ("BOTTOMPADDING", (0,0),(-1,-1), 5),
    ("LEFTPADDING",   (0,0),(-1,-1), 5),
    ("RIGHTPADDING",  (0,0),(-1,-1), 5),
    ("GRID",          (0,0),(-1,-1), 0.4, NAVY),
    ("VALIGN",        (0,0),(-1,-1), "TOP"),
]))
story.append(pt2)
story.append(PageBreak())

# ── SECTION 6: GAS EMAIL TRIGGERS ────────────────────────────────────────────
story += section_header("6.  GAS Email Automation Triggers")
story.append(body(
    "Google Apps Script (GAS) handles all outbound emails to students. "
    "The Node.js backend calls the GAS Web App with a JSON payload via HTTP POST. "
    "GAS uses MailApp.sendEmail() (100 emails/day limit on free Gmail accounts)."
))
story.append(spacer(0.3))

gas_rows = [
    ["sendWelcome", "Lead created (pipelineStage: new_lead)",
     "{ name, email, courseTitle, contactRep, contactPhone }",
     "Welcome email with course brochure link and next steps"],
    ["sendDemoConfirmation", "Demo session scheduled",
     "{ name, email, courseTitle, demoDate, demoTime, meetingLink, venue }",
     "Demo booking confirmation with join/location details"],
    ["sendDemoReminder", "24 hours before demo (or manual trigger)",
     "{ name, email, courseTitle, demoDate, demoTime, meetingLink }",
     "Day-before reminder with a countdown and link"],
    ["sendEnrollmentConfirmation", "Enrollment record created",
     "{ name, email, courseTitle, batchCode, startDate, totalFee, paymentPlan }",
     "Enrollment welcome + batch schedule + payment plan details"],
    ["sendCertificate", "Enrollment marked completed + certificateIssued=true",
     "{ name, email, courseTitle, completionDate, certificateUrl }",
     "Congratulations email with certificate download link and upsell offer"],
]

story.append(make_table(
    ["Trigger Name", "When Fired", "Payload Fields", "Email Content"],
    gas_rows,
    [0.2, 0.22, 0.28, 0.30]
))

story.append(spacer(0.4))
story.append(sub_header("6.1  GAS Handler Structure (Node.js side)"))
story.append(body(
    "In Backend/utils/studentEmails.js — each trigger function calls callGasEmail() "
    "with the action name and payload. The GAS script dispatches based on action field."
))
story.append(spacer(0.2))

code_lines = [
    "// candidateEmails pattern re-used for student leads",
    "async function notifyDemoConfirmation(demo, lead, course) {",
    "  return callGasEmail('sendDemoConfirmation', {",
    "    name:        lead.fullName,",
    "    email:       lead.email,",
    "    courseTitle: course.title,",
    "    demoDate:    demo.scheduledAt.toDateString(),",
    "    demoTime:    demo.scheduledAt.toTimeString().slice(0,5),",
    "    meetingLink: demo.meetingLink || '',",
    "    venue:       demo.venue || ''",
    "  });",
    "}",
]
code_style = ParagraphStyle("code",
    fontName="Courier", fontSize=8, textColor=HexColor("#7DD3FC"),
    backColor=NAVY2, leading=13, leftIndent=10, rightIndent=10,
    spaceBefore=2, spaceAfter=1)

code_data = [[Paragraph(line, code_style)] for line in code_lines]
code_table = Table(code_data, colWidths=[PAGE_W - 2*MARGIN])
code_table.setStyle(TableStyle([
    ("BACKGROUND", (0,0),(-1,-1), NAVY2),
    ("TOPPADDING",    (0,0),(-1,-1), 2),
    ("BOTTOMPADDING", (0,0),(-1,-1), 2),
    ("LEFTPADDING",   (0,0),(-1,-1), 10),
    ("RIGHTPADDING",  (0,0),(-1,-1), 10),
    ("GRID",          (0,0),(-1,-1), 0.3, NAVY3),
]))
story.append(code_table)
story.append(PageBreak())

# ── SECTION 7: BUILD PHASES ───────────────────────────────────────────────────
story += section_header("7.  Build Phases")
story.append(body(
    "The system is built in 5 sequential phases. Each phase has a specific deliverable "
    "that can be tested independently before moving to the next phase."
))
story.append(spacer(0.3))

phases = [
    ("Phase 1", "Backend Foundation", "1–2 days", TEAL, [
        "Create all 8 Mongoose models with validation",
        "Set up salesRoutes.js with all route groups",
        "Wire routes in server.js under /api/sales",
        "Write salesController.js — CRUD for all models",
        "Test all endpoints with Postman / Thunder Client",
    ]),
    ("Phase 2", "Pipeline & Lead Management", "1–2 days", ACCENT, [
        "Build leads.html — Kanban pipeline board",
        "Build lead_detail.html — timeline + actions",
        "Implement pipelineStage change logic with history log",
        "Add bulk import from Excel (re-use existing import framework)",
        "Add lead export to Excel",
    ]),
    ("Phase 3", "Courses, Batches & Demos", "1–2 days", ORANGE, [
        "Build courses.html — catalogue with CRUD",
        "Build batches.html — batch manager with seat tracking",
        "Build demos.html — calendar view + mark-attended flow",
        "Auto-update lead pipelineStage when demo is booked / attended",
        "Seat count auto-increment/decrement on enrollment create/cancel",
    ]),
    ("Phase 4", "Enrollments, Payments & GAS Emails", "2 days", GREEN, [
        "Build enrollments.html — enrollment table + payment history",
        "Build payments.html — transaction register",
        "Implement EMI instalment tracking and overdue flags",
        "Create Backend/utils/studentEmails.js with all 5 GAS triggers",
        "Update GAS script with new handlers (sendWelcome, sendDemoConfirmation, etc.)",
        "Issue certificate flow — flag + certificate email",
    ]),
    ("Phase 5", "Follow-Ups, Targets & Reports", "2 days", RED, [
        "Build followups.html — due-today list + outcome tracker",
        "Build targets.html — rep target vs achieved dashboard",
        "Build reports.html — funnel, revenue, conversion charts",
        "Implement /api/sales/reports/* aggregation endpoints",
        "Performance optimisation: add indexes to frequently queried fields",
        "End-to-end QA pass across all pages and API routes",
    ]),
]

for phase_id, phase_name, duration, color, tasks in phases:
    header_data = [[
        Paragraph(phase_id, ParagraphStyle("ph", fontName="Helvetica-Bold",
                  fontSize=11, textColor=WHITE, alignment=TA_CENTER)),
        Paragraph(phase_name, ParagraphStyle("phn", fontName="Helvetica-Bold",
                  fontSize=11, textColor=color)),
        Paragraph(f"Est. {duration}", ParagraphStyle("phd", fontName="Helvetica",
                  fontSize=9, textColor=MID_GREY, alignment=TA_RIGHT)),
    ]]
    ht = Table(header_data, colWidths=[
        (PAGE_W-2*MARGIN)*f for f in [0.12, 0.65, 0.23]
    ])
    ht.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), NAVY2),
        ("TOPPADDING",    (0,0),(-1,-1), 8),
        ("BOTTOMPADDING", (0,0),(-1,-1), 8),
        ("LEFTPADDING",   (0,0),(-1,-1), 10),
        ("RIGHTPADDING",  (0,0),(-1,-1), 10),
        ("LINEBELOW",     (0,0),(-1,0),  2, color),
    ]))

    task_data = [[Paragraph(f"  ✓  {t}", ParagraphStyle("pt",
        fontName="Helvetica", fontSize=9, textColor=HexColor("#CBD5E1"),
        leading=13, leftIndent=8))] for t in tasks]
    tt = Table(task_data, colWidths=[PAGE_W-2*MARGIN])
    tt.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), NAVY3),
        ("TOPPADDING",    (0,0),(-1,-1), 4),
        ("BOTTOMPADDING", (0,0),(-1,-1), 4),
        ("LEFTPADDING",   (0,0),(-1,-1), 8),
        ("RIGHTPADDING",  (0,0),(-1,-1), 8),
        ("LINEAFTER",     (0,0),(0,-1),  3, color),
    ]))
    story.append(KeepTogether([ht, tt, spacer(0.35)]))

story.append(PageBreak())

# ── SECTION 8: SUMMARY ───────────────────────────────────────────────────────
story += section_header("8.  Summary Statistics")
story.append(spacer(0.2))

summary_data = [
    [Paragraph("Component", styles["th"]),
     Paragraph("Count", styles["th"]),
     Paragraph("Detail", styles["th"])],
    [Paragraph("MongoDB Models", styles["td"]),
     Paragraph("8", ParagraphStyle("sum_n", fontName="Helvetica-Bold", fontSize=14,
               textColor=ACCENT2, alignment=TA_CENTER)),
     Paragraph("StudentLead, Course, Batch, DemoSession, Enrollment, Payment, FollowUp, SalesTarget", styles["td"])],
    [Paragraph("API Route Groups", styles["td"]),
     Paragraph("10", ParagraphStyle("sum_n2", fontName="Helvetica-Bold", fontSize=14,
               textColor=GREEN, alignment=TA_CENTER)),
     Paragraph("Leads, Courses, Batches, Demos, Enrollments, Payments, Follow-Ups, Targets, Reports, Import/Export", styles["td"])],
    [Paragraph("Total API Endpoints", styles["td"]),
     Paragraph("38+", ParagraphStyle("sum_n3", fontName="Helvetica-Bold", fontSize=14,
               textColor=ORANGE, alignment=TA_CENTER)),
     Paragraph("Full CRUD + stats + export endpoints across all groups", styles["td"])],
    [Paragraph("Frontend Pages", styles["td"]),
     Paragraph("11", ParagraphStyle("sum_n4", fontName="Helvetica-Bold", fontSize=14,
               textColor=TEAL, alignment=TA_CENTER)),
     Paragraph("9 new pages + 2 reworked pages (targets, import)", styles["td"])],
    [Paragraph("GAS Email Triggers", styles["td"]),
     Paragraph("5", ParagraphStyle("sum_n5", fontName="Helvetica-Bold", fontSize=14,
               textColor=RED, alignment=TA_CENTER)),
     Paragraph("Welcome, Demo Confirmation, Demo Reminder, Enrollment Confirmation, Certificate", styles["td"])],
    [Paragraph("Pipeline Stages", styles["td"]),
     Paragraph("7", ParagraphStyle("sum_n6", fontName="Helvetica-Bold", fontSize=14,
               textColor=ACCENT2, alignment=TA_CENTER)),
     Paragraph("New Lead → Contacted → Demo Scheduled → Demo Attended → Enrolled → Dropped → Completed", styles["td"])],
    [Paragraph("Build Phases", styles["td"]),
     Paragraph("5", ParagraphStyle("sum_n7", fontName="Helvetica-Bold", fontSize=14,
               textColor=GREEN, alignment=TA_CENTER)),
     Paragraph("Foundation → Lead Management → Courses & Demos → Payments → Reports (est. 8–10 days total)", styles["td"])],
]

st = Table(summary_data, colWidths=[
    (PAGE_W-2*MARGIN)*f for f in [0.28, 0.12, 0.60]
], repeatRows=1)
st.setStyle(TableStyle([
    ("BACKGROUND",    (0,0),(-1,0),  ACCENT),
    ("ROWBACKGROUNDS",(0,1),(-1,-1), [NAVY2, NAVY3]),
    ("FONTSIZE",      (0,0),(-1,-1), 9),
    ("TOPPADDING",    (0,0),(-1,-1), 8),
    ("BOTTOMPADDING", (0,0),(-1,-1), 8),
    ("LEFTPADDING",   (0,0),(-1,-1), 8),
    ("RIGHTPADDING",  (0,0),(-1,-1), 8),
    ("GRID",          (0,0),(-1,-1), 0.4, NAVY),
    ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
]))
story.append(st)

story.append(spacer(0.8))
story.append(HRFlowable(width="100%", thickness=1, color=NAVY3))
story.append(spacer(0.3))
story.append(Paragraph(
    "This document is the authoritative design reference for the ZyntrixCRM Student Course Sales System. "
    "All development should follow the models, API contracts, and page specifications defined here. "
    "Update this document when the design changes.",
    ParagraphStyle("closing", fontName="Helvetica", fontSize=9,
                   textColor=HexColor("#64748B"), alignment=TA_CENTER, leading=14)
))
story.append(spacer(0.2))
story.append(Paragraph(
    "ZyntrixCRM  ·  Student Course Sales System  ·  v1.0  ·  May 2026",
    ParagraphStyle("closing2", fontName="Helvetica-Bold", fontSize=8.5,
                   textColor=HexColor("#475569"), alignment=TA_CENTER)
))

# ── BUILD 
# BUILD
doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
print("PDF generated:", OUTPUT)
