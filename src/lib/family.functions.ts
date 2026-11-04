import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const payFamilySchema = z.object({
  school_id: z.string().uuid(),
  term_id: z.string().uuid(),
  student_id: z.string().uuid(), // any learner of the family anchors the payment
  amount: z.number().positive().max(10_000_000),
  method: z.enum(["mpesa", "cash", "bank", "cheque", "waiver"]),
  reference: z.string().trim().max(60).nullable(),
});

const splitManualSchema = z.object({
  school_id: z.string().uuid(),
  term_id: z.string().uuid(),
  transaction_id: z.string().uuid(),
  allocations: z
    .array(
      z.object({
        student_id: z.string().uuid(),
        amount: z.number().positive().max(10_000_000),
      }),
    )
    .min(1)
    .max(20),
});

type AuthContext = { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string };

/** Only the super admin or the school's Head of Institution may move family money. */
async function requireSchoolAdmin(context: AuthContext, schoolId: string) {
  const [{ data: isSuper, error }, { data: isHoi }, { data: profile }] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "superadmin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "hoi" }),
    context.supabase.from("profiles").select("school_id").eq("id", context.userId).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  if (!isSuper && !(isHoi && profile?.school_id === schoolId))
    throw new Error("Only the SuperAdmin or this school's Head of Institution can record family payments.");
}

type Member = { id: string; grade_id: string | null; adm_no: string; first_name: string; last_name: string };

/**
 * Pays money into a family account: the amount clears each child's debt oldest invoice
 * first across the whole family, and any excess is split equally into the children's
 * wallet credit. Each child receives their own fee payment row so receipts and the
 * portal stay per-learner.
 */
export const payFamily = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => payFamilySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireSchoolAdmin(context as AuthContext, data.school_id);

    const { data: anchor } = await context.supabase
      .from("students")
      .select("id, family_id")
      .eq("id", data.student_id)
      .eq("school_id", data.school_id)
      .maybeSingle();
    if (!anchor?.family_id) throw new Error("That learner is not in a family. Record the payment by admission number instead.");

    const { data: fam } = await context.supabase
      .from("families")
      .select("id, fam_no, primary_phone, sibling_discount_type, sibling_discount_value")
      .eq("id", anchor.family_id)
      .maybeSingle();
    if (!fam) throw new Error("The family record could not be found.");

    const { data: members } = await context.supabase
      .from("students")
      .select("id, grade_id, adm_no, first_name, last_name")
      .eq("family_id", fam.id)
      .eq("status", "active")
      .order("adm_no");
    if (!members || members.length === 0) throw new Error("The family has no active learners.");

    const { data: structures } = await context.supabase
      .from("fee_structures")
      .select("id, grade_id, amount, created_at")
      .eq("term_id", data.term_id)
      .order("created_at");
    const { data: discounts } = await context.supabase
      .from("fee_discounts")
      .select("student_id, amount")
      .eq("term_id", data.term_id);
    const { data: scholarships } = await context.supabase
      .from("scholarships")
      .select("student_id, amount")
      .eq("term_id", data.term_id);
    const { data: payments } = await context.supabase
      .from("fee_payments")
      .select("student_id, amount")
      .eq("term_id", data.term_id);

    // Build each child's invoice list oldest first, then apply their existing credits
    // (discounts, scholarships, payments and the sibling discount) to the oldest invoices.
    type Invoice = { memberId: string; balance: number; createdAt: string };
    const queue: Invoice[] = [];
    for (const m of members as Member[]) {
      const invoices = (structures ?? []).filter((f) => f.grade_id === m.grade_id);
      let credits =
        (discounts ?? []).filter((d) => d.student_id === m.id).reduce((a, d) => a + Number(d.amount), 0) +
        (scholarships ?? []).filter((d) => d.student_id === m.id).reduce((a, d) => a + Number(d.amount), 0) +
        (payments ?? []).filter((p) => p.student_id === m.id).reduce((a, p) => a + Number(p.amount), 0);
      const idx = (members as Member[]).indexOf(m);
      if (fam.sibling_discount_type !== "none" && idx > 0) {
        const billed = invoices.reduce((a, f) => a + Number(f.amount), 0);
        const value = Number(fam.sibling_discount_value) || 0;
        const sib = fam.sibling_discount_type === "percent"
          ? Math.min(Math.round((billed * value) / 100), billed)
          : Math.min(value, billed);
        credits += sib;
      }
      for (const f of invoices) {
        let bal = Number(f.amount);
        const used = Math.min(credits, bal);
        bal -= used;
        credits -= used;
        if (bal > 0) queue.push({ memberId: m.id, balance: bal, createdAt: f.created_at });
      }
    }
    queue.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));

    let remaining = data.amount;
    const alloc = new Map<string, number>();
    for (const inv of queue) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, inv.balance);
      alloc.set(inv.memberId, (alloc.get(inv.memberId) ?? 0) + take);
      remaining = Math.round((remaining - take) * 100) / 100;
    }

    // Any excess is credited to the wallet, split equally between the children.
    const excess = Math.max(0, remaining);
    const wallet: { student_id: string; full_name: string; share: number }[] = [];
    if (excess > 0) {
      const base = Math.floor((excess * 100) / members.length) / 100;
      let leftover = Math.round((excess - base * members.length) * 100) / 100;
      for (const m of members as Member[]) {
        const share = Math.round((base + (leftover > 0 ? 0.01 : 0)) * 100) / 100;
        if (leftover > 0) leftover = Math.round((leftover - 0.01) * 100) / 100;
        const { data: st } = await context.supabase
          .from("students")
          .select("wallet_balance")
          .eq("id", m.id)
          .maybeSingle();
        const { error } = await context.supabase
          .from("students")
          .update({ wallet_balance: Math.round(((Number(st?.wallet_balance) || 0) + share) * 100) / 100 })
          .eq("id", m.id);
        if (error) throw new Error(error.message);
        wallet.push({ student_id: m.id, full_name: `${m.first_name} ${m.last_name}`, share });
      }
    }

    const paidAt = new Date().toISOString();
    const allocations: { student_id: string; full_name: string; adm_no: string; amount: number }[] = [];
    for (const m of members as Member[]) {
      const amount = Math.round((alloc.get(m.id) ?? 0) * 100) / 100;
      if (amount <= 0) continue;
      const { data: p, error } = await context.supabase
        .from("fee_payments")
        .insert({
          school_id: data.school_id,
          term_id: data.term_id,
          student_id: m.id,
          amount,
          method: data.method,
          reference: data.reference,
          family_code: fam.fam_no,
          recorded_by: context.userId,
          paid_at: paidAt,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      void p;
      allocations.push({ student_id: m.id, full_name: `${m.first_name} ${m.last_name}`, adm_no: m.adm_no, amount });
    }
    if (allocations.length === 0 && excess <= 0) throw new Error("Nothing to allocate — the family has no outstanding debt and the amount must be positive.");

    await context.supabase.from("audit_logs").insert({
      school_id: data.school_id,
      user_id: context.userId,
      action: "family_payment",
      entity: "families",
      entity_id: fam.id,
    });

    return {
      fam_no: fam.fam_no,
      allocations,
      wallet,
      excess,
      unallocated: allocations.length === 0 ? data.amount : 0,
    };
  });

/**
 * Splits one unmatched M-Pesa transaction manually: the entered amounts per child must
 * add up to the transaction total, and each child gets their own payment row carrying
 * the same M-Pesa code.
 */
export const splitManualPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => splitManualSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireSchoolAdmin(context as AuthContext, data.school_id);

    const { data: tx } = await context.supabase
      .from("mpesa_transactions")
      .select("id, school_id, amount, status, mpesa_receipt, phone")
      .eq("id", data.transaction_id)
      .maybeSingle();
    if (!tx || tx.school_id !== data.school_id) throw new Error("Transaction not found.");
    if (tx.status === "matched") throw new Error("That transaction has already been matched.");

    const total = data.allocations.reduce((a, r) => a + r.amount, 0);
    if (Math.abs(total - Number(tx.amount)) > 0.01)
      throw new Error(`The child amounts add up to ${total.toFixed(2)} but the transaction is ${Number(tx.amount).toFixed(2)}. They must match.`);

    const ids = data.allocations.map((r) => r.student_id);
    const { data: kids } = await context.supabase
      .from("students")
      .select("id, first_name, last_name, family_id, families(fam_no)")
      .in("id", ids)
      .eq("school_id", data.school_id);
    if (!kids || kids.length !== new Set(ids).size)
      throw new Error("Every child must belong to this school.");
    const famCodes = new Set(
      kids.map((k) => (k as { families?: { fam_no?: string } | null }).families?.fam_no ?? ""),
    );
    const familyCode = famCodes.size === 1 && !famCodes.has("") ? [...famCodes][0]! : null;

    const reference = tx.mpesa_receipt ?? tx.phone ?? null;
    let firstPaymentId: string | null = null;
    for (const r of data.allocations) {
      const kid = kids.find((k) => k.id === r.student_id)!;
      const { data: p, error } = await context.supabase
        .from("fee_payments")
        .insert({
          school_id: data.school_id,
          term_id: data.term_id,
          student_id: r.student_id,
          amount: r.amount,
          method: "mpesa",
          reference,
          family_code: familyCode,
          recorded_by: context.userId,
          paid_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      if (!firstPaymentId) firstPaymentId = p.id;
      void kid;
    }

    const { error: txErr } = await context.supabase
      .from("mpesa_transactions")
      .update({ status: "matched", payment_id: firstPaymentId, updated_at: new Date().toISOString() })
      .eq("id", tx.id);
    if (txErr) throw new Error(txErr.message);

    await context.supabase.from("audit_logs").insert({
      school_id: data.school_id,
      user_id: context.userId,
      action: "mpesa_manual_split",
      entity: "mpesa_transactions",
      entity_id: tx.id,
    });

    return { matched: data.allocations.length, family_code: familyCode };
  });
