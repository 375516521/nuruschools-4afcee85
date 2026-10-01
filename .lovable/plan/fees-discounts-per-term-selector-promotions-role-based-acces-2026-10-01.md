# Fees discounts, per-term selector, promotions, role-based access

## 1. Fees page
- **Term selector** at the top (defaults to the current term). Fee structure, payments, balances, receipts and "Remind all" all follow the chosen term.
- **Discounts**: "Give discount" button per learner (amount + reason). Balance = billed − discount − paid. Discounts show as a column in the list, as a line on receipts, and are counted in reminders and the parent portal balance/report unlock.
- Discount list per term with remove option; each add/remove is recorded in the audit log.

## 2. Promotions page (finish)
- Add "Promotions" to the menu.
- Move a class up (with stream choice), graduate finalists, open next term with optional fee-structure copy.
- Confirmation dialog before promoting/graduating/rolling over.
- Show each learner's outstanding balance in the list so carried-over arrears are visible; balances, marks and admission numbers stay with the learner.

## 3. Role-based access
| Area | Super admin | Head of Institution | Teacher |
|---|---|---|---|
| Users & Schools | yes | no | no |
| Settings (school, staff) | yes | own school | no |
| Promotions / term rollover | yes | yes | no |
| Fees: structure, discounts | yes | yes | view only (if granted fees) |
| Learners add/edit | yes | yes | view only |
| Marks, attendance | yes | granted grades | granted grades/modules |
- Menu and dashboard hide what a role cannot use; pages show a "no access" notice if opened directly.
- Database rules enforce the same: discounts, fee structures and term changes writable only by super admin or the school's Head of Institution.

## Technical details
- Use existing `fee_discounts` table; tighten RLS: SELECT `in_my_school`, write `is_school_admin(school_id)`. Same write tightening for `fee_structures` and `terms`.
- Update `parent_student_summary` to subtract discounts.
- `src/lib/access.ts`: add `useRole()` helper (superadmin/hoi/teacher) and `ROLE_ROUTES` (`/promotions`, `/settings`, `/users`); `canUseRoute` checks role + module.
- Add `/promotions` to NAV; `AccessDenied` component for guarded pages.
