/**
 * Shared family-group helpers used by the Fees page, Learners page and Parent Portal.
 * A family groups learners that share a guardian; payments made to the family account
 * (FAMxxx) are split across the children, oldest debt first, with any excess credited
 * to the children's wallet.
 */

export type FamilyInfo = {
  id: string;
  fam_no: string;
  primary_phone: string | null;
  sibling_discount_type: string; // "none" | "percent" | "amount"
  sibling_discount_value: number;
};

export type FamilyMember = {
  id: string;
  adm_no: string;
  full_name: string;
  grade: string | null;
  stream: string | null;
  photo_url?: string | null;
  billed: number;
  paid: number;
  wallet: number;
};

export type FamilyPayload = {
  family: FamilyInfo;
  school: { name: string | null; logo_url: string | null };
  term: { year: number; term: number } | null;
  members: FamilyMember[];
};

/** The sibling discount applies from the second child onward and never exceeds what the child owes. */
export function siblingDiscountFor(
  index: number,
  memberBilled: number,
  fam: Pick<FamilyInfo, "sibling_discount_type" | "sibling_discount_value">,
): number {
  if (fam.sibling_discount_type === "none" || index <= 0) return 0;
  const value = Number(fam.sibling_discount_value) || 0;
  if (value <= 0) return 0;
  if (fam.sibling_discount_type === "percent")
    return Math.min(Math.round((memberBilled * value) / 100), Math.max(0, memberBilled));
  return Math.min(value, Math.max(0, memberBilled));
}

export function memberBalance(
  m: Pick<FamilyMember, "billed" | "paid">,
  fam: Pick<FamilyInfo, "sibling_discount_type" | "sibling_discount_value">,
  index: number,
): number {
  return m.billed - siblingDiscountFor(index, m.billed, fam) - m.paid;
}

export function familyTotals(payload: FamilyPayload): {
  billed: number;
  paid: number;
  discount: number;
  credit: number;
  balance: number;
} {
  let billed = 0;
  let paid = 0;
  let discount = 0;
  let credit = 0;
  payload.members.forEach((m, i) => {
    billed += m.billed;
    paid += m.paid;
    discount += siblingDiscountFor(i, m.billed, payload.family);
    credit += Number(m.wallet) || 0;
  });
  return { billed, paid, discount, credit, balance: billed - discount - paid };
}

/** Builds a WhatsApp deep link with one combined message for the whole family. */
export function familyReminderLink(
  payload: FamilyPayload,
  schoolName: string,
  termLabel: string,
): string | null {
  const phone = (payload.family.primary_phone ?? payload.members[0]?.grade ?? "")
    ? payload.family.primary_phone
    : null;
  const digits = (phone ?? "").replace(/\D/g, "").replace(/^0/, "254");
  if (!digits || digits.length < 9) return null;
  const lines = payload.members
    .map((m, i) => `• ${m.full_name} (Adm ${m.adm_no}): ${kshShillings(memberBalance(m, payload.family, i))}`)
    .join("\n");
  const totals = familyTotals(payload);
  const text = encodeURIComponent(
    `Dear Parent/Guardian, here is your family fee balance for ${termLabel} (Family ${payload.family.fam_no}):\n${lines}\nTotal balance: ${kshShillings(totals.balance)}. Kindly clear to unlock results and ID cards. — ${schoolName}`,
  );
  return `https://wa.me/${digits}?text=${text}`;
}

function kshShillings(n: number): string {
  return `KES ${Math.round(n).toLocaleString("en-KE")}`;
}
