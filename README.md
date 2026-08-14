# Nuru School Hub

IMPORTANT: YOU ARE LOVABLE AI. 
TASK: Generate the COMPLETE "NURU TECHNOLOGIES" system in one single generation. Do NOT ask questions. Do NOT skip modules. Generate ALL code, ALL pages, ALL database tables, ALL functions NOW.

TIME TARGET: < 10 minutes
QUALITY TARGET: Production ready 

WhatsApp support : +254 745939344

Email: charleswambua.edu@gmail.com

TECH STACK: Next.js 14 App Router + TypeScript + Tailwind CSS + shadcn/ui + Framer Motion + React Query + Supabase + Vercel + OpenAI API + Zod + Africa's Talking SMS/USSD + qrcode.react + @react-pdf/renderer + Vercel Blob

### SYSTEM NAME
"NURU TECHNOLOGIES 

### CRITICAL RULES - DO NOT SKIP
1.  Generate ALL 14 sections below in one go
2.  Generate ALL Supabase SQL, RLS, and Functions
3.  Generate ALL UI pages for SuperAdmin, HOI, Teacher, Parent, Student
4.  Seed data must work immediately after deploy
5.  Mobile First + <1.5s load

### 1. SUPERADMIN SEED + AUTH + SECURITY
1. Seed SuperAdmin on first run:
    Email: charleswambua.edu@gmail.com
    Password: Charles@Shule2030
    Role: SuperAdmin, school_id: NULL, mfa_enabled: true
2. SECURITY: Auth: Supabase Auth + Email OTP + Password Reset + 2FA/MFA TOTP. Password Policy: Min 8 chars, 1 Upper, 1 Number, 1 Symbol. bcrypt. Session: JWT 2hr expiry + 30min inactivity logout. Rate limit 5 attempts. Audit Log: IP + Device + Time. RBAC + RLS. Encrypt PII. Daily encrypted backup + 1-click restore
3. SuperAdmin Panel: Create School: Name, ULI/KEMIS Code, School Code, Logo, County, Phone. Create Grade Levels: Pre-Primary PP1-PP2, Primary Grade 1-6, Junior Grade 7-9, Senior Grade 10-12. Create Streams per Grade. Toggle Modules: [Academics, Fees, Assets, Library, HR, AI, Biometrics, ParentApp, E-Learning, Procurement, Admissions, Transport, Hostel, BOM, API]. Create HOI: Name, Email, Auto Password. Force password change. Manage 2FA, Security Logs, "Login as HOI", System Health, Billing

### 2. ACADEMIC YEAR + TERM + ADM NO + STUDENT ID ENGINE - PRIORITY
1. ACTIVE YEAR + TERM: System must have 1 active Academic Year and Term at all times. Eg: "2026 Term 1". HOI can set Term Dates
2. AUTO ADMISSION NUMBER: Format {SCHOOL_CODE}-{YEAR_JOINED}-{SEQUENCE}. Example: SDA-2026-0047. Auto increment. Cannot edit
3. STUDENT ID CARD SYSTEM - HOI CONTROLLED - PRIORITY: 
   A. HOI sets per Grade in /settings/id-cards: ID_PREFIX, START_NUMBER, UPTO_NUMBER. Example: Grade 7: GR7, 001, 200
   B. AUTO ID GENERATION: On Student Create. Get grade. Get next number. Format: GR7-015. Block if > UpTo. Unique per school. Never changes on promotion
   C. QR CODE: JSON: {school_name, school_code, adm_no, student_id, first_name, last_name, grade, stream, guardian_phone, photo_url, verify_url}
   D. ID CARD PRINTING: Template with Logo, Photo, Name, Adm No, Student ID, Grade+Stream, QR, Validity Term. Bulk Print 10-per-page PDF
   E. QR VERIFICATION: Public /verify/{adm_no}
4. 1-CLICK PROMOTION ENGINE: Term Promotion and Year Promotion. Auto carry forward: Fee Balances, Subjects. Rollback 7 days
5. EXAMS + FEES PER TERM PER YEAR: All linked to academic_year_id + term_id + grade_id + stream_id

### 3. HOI WORKFLOW
Login with 2FA → Active: "2026 Term 1". Can:
1. Manage Grades & Streams
2. Teachers: CRUD + Auto Password + Assign to Grade+Stream+Subject + Appraisals
3. Subjects: CRUD per Grade Level
4. Students: Manual Add OR Excel Import OR Migration Tool. Adm No + Student ID auto-generated
5. ID CARD CENTER: Set Prefix + UpTo per Grade. View "IDs Used: 145/200". Bulk Generate + Print
6. Exams: Create per Year+Term+Grade+Stream. Fast marks grid. Import from Excel
7. Fees: Set Structure per Year+Term+Grade+Stream. Record Payment, MPESA STK, Auto Reconcile, Balance Report, Defaulters SMS
8. Reports: Report Cards PDF + Merit List + Transfer Letter + Fee Statement + Executive Dashboard
9. Operations: Approve SoW + Lesson Plans, Staff Discipline Log, Assets QR, Hostel, Transport, Document Vault
10. Settings: Grading System EE1-EE2-ME1-ME2-AE1-AE2-BE, Auto Comments, Toggle Parent Access

### 4. TEACHER WORKFLOW
Login 2FA → "My Assigned Subjects - 2026 Term 1". Enter: Marks, CBC Competencies, AI Auto Comments per student. View Class List. Offline PWA sync

### 5. PARENT ACCESS - NO OTP, NO LOGIN
URL: /parent. Access 2 Ways: 1. Enter Admission Number 2. Enter Learner First Name + Guardian Phone Number. 
Logic: If 1 match → Instant Dashboard. If >1 match → "Select: John Wambua - SDA-2026-0047 - Grade 7A"  
Dashboard: Active Term Fees, Latest Results, Attendance %, Download Report PDF, Download ID Card PDF  
USSD: *483*SCHOOLCODE#. WhatsApp Bot. Rate limited 10/hr + Audit Log

### 6. STUDENT PORTAL
Login with Adm No + Password = Adm No. View Results, Fees, Timetable, E-Learning, Download ID Card

### 7. GRADING, CBC & AI
1. Grading: EE1, EE2, ME1, ME2, AE1, AE2, BE. Configurable score ranges per school
2. CBC Competencies: Communication, Collaboration, Critical Thinking, Creativity, Citizenship. Rubric: Exceeding, Meeting, Approaching
3. AI MODULE: 1-click generate unique comments for Grade+Stream. Exam Analysis. Fee Defaulter Prediction. Timetable Generation

### 8. REPORTS
1. Report Card PDF: School Logo + ULI + Student Photo + Adm No + Student ID + Year+Term+Grade+Stream + Mean Grade + Position + Teacher Comment + Principal Signature + QR. Password = Adm No
2. Student ID Card PDF: Priority. A4 10-up + Single Card. With QR + Photo
3. Merit List: Filter Year+Term+Grade+Stream. Export PDF/Excel. Sort by Mean Grade
4. Transfer Letter PDF: "TO WHOM IT MAY CONCERN". Student details, Reason, Fee Clearance, Academic Summary, HOI Signature + Stamp

### 9. FEES & FINANCE MODULE
Fee Structure per Year+Term+Grade+Stream. Record Payment: Cash, Bank, MPESA STK. Auto Reconcile. Student Statement PDF. Balances with filters. P&L, Budget vs Actual, Approval workflow. Bulk SMS/Email defaulters. KRA ETR Integration. Dashboard: "Billed 2.5M / Collected 2.1M"

### 10. STUDENT LIFECYCLE MANAGEMENT
STATUS: Active, Deactivated, Graduated, Archived. TRANSFER: Internal, External IN, External OUT with Transfer Letter PDF. DEACTIVATE: Reason. ARCHIVE: Auto on Grade 12. PROMOTE BULK. UI Filter: [All, Active, Deactivated, Graduated, Archived]

### 11. SECTION A: ENGINEER FEATURES - "IT WON'T BREAK"
1. PUBLIC REST API: API Keys. Docs at /api/docs. Endpoints: Students, Fees, Attendance, Marks, /verify-id/{student_id}
2. DATA MIGRATION TOOL: Upload Zeraki, Schoolsoft, Teno, Excel. Field mapping + error preview
3. SYSTEM HEALTH MONITOR: Uptime, DB Size, Active Users, Failed Jobs. Email alerts
4. OFFLINE PWA: Teachers work offline. Auto sync. Attendance via QR Scan
5. IMPORT VALIDATOR: Prevents corrupt data

### 12. SECTION B: ENTREPRENEUR FEATURES - "IT MAKES MONEY"
1. MULTI-CAMPUS + WHITE LABEL: School Group. 1 login for 5 schools. Remove "Powered by Nuru" for Enterprise
2. MARKETPLACE: Sell SMS Bundles, Revision Papers, ID Cards, PVC, Lanyards. Nuru 20% commission
3. PARTNER/AGENT PORTAL: Agents track referrals and 10% commission. Auto payout report
4. EXECUTIVE DASHBOARD: Fee Collection %, Top/Bottom Subjects, AI Predictions, "ID Cards Printed: 98%". Export to PPT
5. DIGITAL NOTICEBOARD + POLLS: Send announcements. Track read receipts. Create polls
6. TIERED PRICING: Starter 150K, Pro 250K, Enterprise 400K. SLA: 24/7 WhatsApp <1hr, 2x Onsite Training, Free Migration, 99.9% Uptime

### 13. DATABASE SCHEMA - SUPABASE
schools, school_groups, academic_years, terms, admission_counters, grade_id_configs, grades, streams, users, teachers, students, subjects, teacher_subjects, exams, marks, competency_scores, fee_structures, fee_payments, transfers, audit_logs, api_keys, partner_agents, marketplace_orders
RLS: school_id = auth.jwt.school_id. Encrypt PII. Index all FKs

### 14. FUNCTIONS + LOGIC
1. generate_adm_no(): Get school_code + year. Increment counter. Return {CODE}-{YEAR}-{SEQ4}
2. generate_student_id(grade_id): Get prefix + last_number from grade_id_configs. Increment. Block if > upto. Return PREFIX-SEQ3
3. QR Generation using qrcode.react. PDF using @react-pdf/renderer

### FINAL DELIVERY
Output: 1. Full Next.js 14 codebase 2. Full Supabase SQL file with RLS + 2 Functions 3. .env.example 4. README with "npm run dev" steps
DO NOT OMIT ANY MODULE. GENERATE EVERYTHING NOW.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://nuruschools.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1d520006-8cb5-40b8-b602-e1aad4d48cdc).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
