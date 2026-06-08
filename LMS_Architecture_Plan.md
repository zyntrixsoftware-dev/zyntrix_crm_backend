# Zyntrix LMS Portal — Architecture & Build Plan

**Prepared for:** Zyntrix Software Solutions Pvt. Ltd.
**Context:** Add a Learning Management System (LMS) panel to the existing Zyntrix CRM (EdTech). Students who pay in the Sales System are handed off to the LMS to actually take their course.

---

## 1. How the LMS fits the existing system

Your CRM already has the *commercial* half of the student journey. The LMS is the *learning* half. They share data; they don't duplicate it.

```
Lead → Demo → Enrollment (Sales System)  ──handed_off──▶  LMS (this build)
        │                                                   │
        ▼                                                   ▼
   Payments, Coupons                              Learning content, attendance,
   Courses, Batches  ◀── reused by LMS ──         assignments, grades, certificates
```

Reuse, don't rebuild:
- **Course** and **Batch** models already exist → the LMS adds *content* (modules/lessons) on top of them.
- **Enrollment** already exists with a `handed_off` status → that's the LMS's student roster.
- **User** model, JWT auth, role system, file uploads to the VM, and Microsoft Graph email are all already in place and will be reused.

So the LMS is mostly **new content + learning-activity models** layered on the existing catalogue and roster.

---

## 2. Technical architecture (matches current stack)

| Layer | Choice (consistent with current system) |
|---|---|
| Backend | Node.js + Express (new `lms*` controllers + routes under `/api/lms`) |
| Database | MongoDB Atlas (new collections, references existing Course/Batch/Enrollment/User) |
| Auth | Existing JWT + role middleware; add LMS roles |
| File storage | Existing VM disk under `uploads/` (e.g. `uploads/lms/<courseId>/...`), gitignored, included in the daily backup |
| Video | **Decision needed** — see §9. Recommended: external host (YouTube unlisted / Vimeo / Bunny) embedded, not self-hosted |
| Live classes | **Decision needed** — embed Zoom/Google Meet links, or integrate an API |
| Email/notify | Existing Microsoft Graph sender (`sendEmail`) for enrolment, reminders, grades, certificates |
| Frontend | Static HTML/JS pages in `Frontend/modules/lms_system/`, same `apiRequest` + theme conventions as the Sales System |

---

## 3. User roles

| Role | What they do in the LMS |
|---|---|
| **Student** | Watch lessons, download resources, submit assignments, take quizzes, see grades/progress, attend live classes, get certificate |
| **Instructor / Trainer** | Build course content, upload materials, create assignments/quizzes, grade submissions, mark attendance, post announcements, answer doubts |
| **LMS Admin / Coordinator** | Manage courses↔batches↔instructors mapping, monitor progress across batches, issue certificates, reports |
| **(Reused) Super Admin** | Full access |

(These extend the existing `role` enum on the User model: `lms` already exists; add `instructor` if you want a separate trainer role.)

---

## 4. New data models (MongoDB collections)

1. **CourseContent / Module** — a course's curriculum is a list of modules (sections). `{ course, title, order }`
2. **Lesson** — inside a module. `{ module, course, title, type(video|doc|text|quiz|assignment), videoUrl, content, resources[], durationMin, order, isPreview }`
3. **Resource** — downloadable files attached to a lesson. `{ lesson, fileName, fileUrl, type }`
4. **Assignment** — `{ course, batch, title, description, instructions, attachments[], maxMarks, dueDate, createdBy }`
5. **Submission** — `{ assignment, student, files[], text, submittedAt, status(submitted|graded|late), marks, feedback, gradedBy }`
6. **Quiz** — `{ course, module, title, questions[], passMark, timeLimitMin, attemptsAllowed }`
7. **QuizAttempt** — `{ quiz, student, answers[], score, passed, startedAt, submittedAt }`
8. **LessonProgress** — per student per lesson `{ student, lesson, course, status(not_started|in_progress|completed), lastPositionSec, completedAt }` (drives the % progress bar)
9. **ClassSession (Live)** — `{ course, batch, title, scheduledAt, durationMin, joinUrl, recordingUrl, instructor, status }`
10. **LMSAttendance** — per live session `{ session, student, status(present|absent|late), markedBy }` (separate from HRMS employee attendance)
11. **Certificate** — `{ student, course, batch, issuedAt, certificateNo, fileUrl }`
12. **Announcement** — `{ course?, batch?, title, body, audience, postedBy, createdAt }`
13. **Discussion / Doubt** — `{ course, lesson?, student, message, replies[], status(open|answered) }`
14. **Feedback / Rating** — `{ course, batch, student, rating, comment }`
15. **Enrollment (extend existing)** — add LMS-side fields: `progressPct`, `completionStatus(enrolled|in_progress|completed|certified)`, `assignedInstructor`, `lmsStartedAt`.

---

## 5. Portal sections (what to build)

### A. LMS Admin / Coordinator panel
1. **Dashboard** — active batches, students in progress, completion rates, pending grading, upcoming live classes, at-risk learners.
2. **Course Content Builder** — pick a Course → build modules → add lessons (video/doc/text/quiz/assignment) → attach resources.
3. **Batch & Roster Management** — map batches to instructors; view enrolled students (pulled from `handed_off` enrollments); enrol/transfer students.
4. **Instructor Management** — add instructors, assign to courses/batches.
5. **Live Class Scheduler** — schedule sessions with join links; auto-notify students by email.
6. **Assignments & Grading Overview** — all assignments, submission counts, grading status across batches.
7. **Certificates** — issue/generate certificates for completed students; certificate registry.
8. **Reports & Analytics** — progress by batch/course, attendance %, quiz performance, completion funnel, feedback scores.
9. **Announcements** — broadcast to a course/batch/all.

### B. Instructor panel
1. **My Courses / Batches** — content they own.
2. **Content authoring** — create/edit modules, lessons, upload materials.
3. **Assignments & Quizzes** — create, view submissions, **grade with feedback**.
4. **Attendance** — mark per live session.
5. **Live classes** — schedule/start, add recording link.
6. **Doubts / Q&A** — answer student questions.
7. **Class roster & progress** — see each student's completion.

### C. Student panel (the learner experience)
1. **My Dashboard** — enrolled courses, % progress, next class, pending assignments, deadlines.
2. **Course Player** — module/lesson sidebar, video/content viewer, "mark complete", resources to download, progress bar.
3. **Assignments** — view, submit (file/text), see grades + feedback.
4. **Quizzes / Tests** — take quizzes, see scores.
5. **Live Classes** — schedule + join links + recordings.
6. **Attendance** — own attendance record.
7. **Grades / Progress** — gradebook, quiz history, overall standing.
8. **Certificates** — view/download once completed.
9. **Announcements & Doubts** — read announcements, ask questions.
10. **Profile** — reuse existing profile/settings.

---

## 6. Backend API surface (new, under `/api/lms`)

- `…/courses/:id/content` — modules + lessons (GET/POST/PATCH/DELETE)
- `…/lessons/:id`, `…/lessons/:id/complete` — content + progress
- `…/assignments`, `…/submissions`, `…/submissions/:id/grade`
- `…/quizzes`, `…/quizzes/:id/attempt`
- `…/sessions` (live classes), `…/attendance`
- `…/progress/me`, `…/progress/batch/:id`
- `…/certificates`, `…/certificates/issue`
- `…/announcements`, `…/discussions`
- `…/roster/batch/:id` (reads handed-off enrollments)

All protected by JWT + role checks (student sees only own data; instructor sees own batches; admin sees all).

---

## 7. Frontend pages (`Frontend/modules/lms_system/`)

Admin/Instructor: `dashboard.html`, `content-builder.html`, `batches.html`, `instructors.html`, `live-classes.html`, `assignments.html`, `grading.html`, `certificates.html`, `reports.html`, `announcements.html`
Student: `student-dashboard.html`, `course-player.html`, `my-assignments.html`, `quizzes.html`, `my-grades.html`, `my-certificates.html`, `live.html`

Same sidebar/theme pattern as the Sales System, with a role-aware menu.

---

## 8. Integration points

- **Sales → LMS handoff:** when an enrollment is `handed_off`, it appears in the LMS roster automatically (shared `Enrollment` collection).
- **Login:** students already get a CRM login at deployment-style enrolment; the LMS reuses the same accounts/JWT.
- **Email:** enrolment welcome, class reminders, assignment-due, grade-released, certificate-issued — all via the existing Graph `sendEmail`.
- **Attendance:** LMS class attendance is **separate** from HRMS employee attendance (different collection) to avoid mixing students and staff.
- **Payments:** stays in Sales; LMS can show "fee cleared" status but doesn't handle money.

---

## 9. Key decisions to confirm before build

1. **Video hosting:** self-host on the VM (heavy storage/bandwidth — not recommended on a free-tier VM) vs **embed external** (YouTube unlisted / Vimeo / Bunny.net) — recommended.
2. **Course style:** instructor-led **cohorts/batches** (live + scheduled) vs **self-paced** on-demand vs **both** (hybrid). This shapes progress/attendance logic.
3. **Live classes:** just store/share Zoom/Meet links (simplest) vs deeper API integration.
4. **Quizzes/certificates:** needed in MVP, or phase 2?
5. **Separate `instructor` role**, or treat instructors as `lms` users?

---

## 10. Phased execution roadmap

**Phase 1 — Foundation (MVP)**
- Data models: Module, Lesson, LessonProgress, Enrollment extension.
- Admin **Content Builder** + student **Course Player** with progress tracking.
- LMS roster from handed-off enrollments; role-aware sidebar; LMS dashboard.

**Phase 2 — Activities**
- Assignments + submissions + grading; Quizzes + attempts; Announcements; Doubts/Q&A.

**Phase 3 — Live & attendance**
- Live class scheduler + join links + email reminders; LMS attendance.

**Phase 4 — Outcomes**
- Gradebook, certificates (auto-generate PDF), reports & analytics, feedback/ratings.

Each phase ships independently and is deployed the same way as the rest of the CRM (git push → VM pull → pm2 restart; frontend → Hostinger).

---

## 11. Security & storage notes

- Role-scoped APIs (students can only read their own progress/grades/submissions).
- LMS file uploads under `uploads/lms/…`, gitignored, covered by the existing daily backup.
- Signed/token-gated download links for paid content (same pattern as the resume/offer-letter downloads already built).
- Certificates get a unique `certificateNo` for verification.

---

*Plan prepared for the Zyntrix CRM — LMS module. Confirm the §9 decisions and I'll start with Phase 1.*
