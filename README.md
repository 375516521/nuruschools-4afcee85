
Fanisi School Hub
Complete School Management System by FANISI TECHNOLOGIES

**Live App:** https://fanisitech.co.ke  
**Contact:** +254 745 939 344 | charleswambua.edu@gmail.com  
**Website:** https://fanisitech.co.ke

---

1. OVERVIEW
**Fanisi School Hub** is a production-ready, mobile-first School Management System built for Kenyan Primary, Junior & Senior schools. 
It handles Academics, Fees, ID Cards, Exams, CBC, and Parent communication in one platform.

Key Features
- **Multi-Role Access**: SuperAdmin, HOI, Teacher, Parent, Student
- **Academic Engine**: Year + Term management, Auto Admission No, 1-Click Promotion
- **Student ID Cards**: QR-based ID generation + Bulk PDF printing + Public verification
- **Fees & M-Pesa**: Fee structure, STK Push, Auto reconciliation, Defaulter SMS
- **CBC + Exams + AI**: CBC Competencies, AI-generated comments, Exam analysis
- **Parent Access**: No login required. Access via Adm No or Name + Phone. USSD + WhatsApp Bot
- **Reports**: Report Cards, Merit Lists, Transfer Letters, Fee Statements - all PDF
- **Engineer Tools**: REST API, Data Migration from Zeraki/Schoolsoft, Offline PWA

---

2. TECH STACK
| Category | Technology |
| --- | --- |
| **Framework** | Next.js 14 App Router + TypeScript |
| **UI** | Tailwind CSS, shadcn/ui, Framer Motion |
| **Backend** | Supabase: Auth, Database, Storage, RLS |
| **State** | React Query, Zod |
| **Payments/SMS** | M-Pesa STK, Africa's Talking SMS/USSD |
| **Other** | qrcode.react, @react-pdf/renderer, Vercel Blob |
| **Deploy** | Vercel + Custom Domain: fanisitech.co.ke |

---

3. GETTING STARTED

Prerequisites
- Node.js 18+ and npm or bun
- Supabase account
- Git

1. Clone & Install
```bash
git clone https://github.com/375516521/nuruschools-4afcee85.git
cd nuruschools-4afcee85
npm install
2. Setup Environment
Copy `.env.example` to `.env` and add your keys:
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
AFRICASTALKING_API_KEY=
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
NEXT_PUBLIC_APP_URL=https://fanisitech.co.ke
3. Setup Database
1. Go to your Supabase project > SQL Editor
2. Run the `supabase/schema.sql` file
3. RLS policies and functions are included

4. Run Locally
npm run dev
App runs on `http://localhost:3000`  
Production: `https://fanisitech.co.ke`

5. Default SuperAdmin Login
After first seed:
Email: charleswambua.edu@gmail.com
Password: Charles@Shule2030
_You will be forced to change password on first login_

---

4. CORE MODULES

SuperAdmin
Create Schools, Set Grades/Streams, Toggle Modules, Create HOI, View System Health, Billing

HOI - Head of Institution
1. *Manage*: Teachers, Students, Subjects, Exams, Fees
2. *ID Card Center*: Set `PREFIX + START + UPTO` per grade. Auto-generate `GR7-015` with QR
3. *Fees*: Set structure per Term, Send M-Pesa STK, SMS defaulters, Fee statements
4. *1-Click Promotion*: Promote whole class. Balances and subjects carry forward
5. *Reports*: Report Cards PDF, Merit List, Transfer Letter

Teacher
Login → "My Assigned Subjects". Enter Marks, CBC Competencies, AI Auto Comments. Offline PWA sync

Parent Portal
Access at: `https://fanisitech.co.ke/parent`  
No login required. Use `Admission Number` OR `First Name + Guardian Phone`  
Dashboard: Active Term Fees, Latest Results, Attendance %, Download Report PDF, Download ID Card PDF  
USSD: `_483_SCHOOLCODE#` | WhatsApp Bot

Student Portal
Login with `Adm No` + Password. View Results, Fees, Timetable, E-Learning, Download ID Card

---

5. SECURITY & COMPLIANCE
- Supabase Auth + Email OTP + 2FA TOTP
- Password Policy: Min 8 chars, 1 Upper, 1 Number, 1 Symbol
- JWT 2hr expiry + 30min inactivity logout. Rate limit 5 attempts
- Row Level Security: `school_id = auth.jwt.school_id`
- Audit Logs: IP, Device, Time. Encrypt PII
- Daily encrypted backups + 1-click restore

---

6. DATABASE SCHEMA
Core tables: `schools`, `academic_years`, `terms`, `grades`, `streams`, `students`, `teachers`, `subjects`, `exams`, `marks`, `fee_structures`, `fee_payments`, `audit_logs`

---

7. PRICING - FANISI TECHNOLOGIES
Plan	Price/Year	Includes
**Starter**	150,000 KES	1 School, Core Modules, Email Support
**Pro**	250,000 KES	+ API, Migration, AI, SMS Bundles
**Enterprise**	400,000 KES	+ White Label, Multi-Campus, 24/7 Support
All plans include: 2x Onsite Training, Free Data Migration, 99.9% Uptime SLA

---

8. SUPPORT
For demo, setup, or custom features for your school:  
*WhatsApp:* +254 745 939 344  
*Email:* charleswambua.edu@gmail.com  
*Web:* https://fanisitech.co.ke

---

*Built by FANISI TECHNOLOGIES*  
`© 2026 Fanisi Technologies. Empowering African Schools with Technology.`

Done.
