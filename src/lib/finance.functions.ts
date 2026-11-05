import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface CashBookEntry {
  date: string;
  type: "in" | "out";
  source: string;
  reference: string;
  amount: number;
  balance: number;
}

export interface TrialBalanceItem {
  account: string;
  debit: number;
  credit: number;
}

export const getCashBook = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ school_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: payments } = await context.supabase
      .from("fee_payments")
      .select("amount, paid_at, reference, payment_method, students(first_name, last_name, adm_no)")
      .eq("school_id", data.school_id)
      .order("paid_at", { ascending: true });

    const { data: expenses } = await context.supabase
      .from("finance_expenses")
      .select("amount, expense_date, category, description, voucher_no")
      .eq("school_id", data.school_id)
      .order("expense_date", { ascending: true });

    const rows: Array<{ date: string; type: "in" | "out"; source: string; reference: string; amount: number }> = [];

    (payments || []).forEach((p) => {
      const s = p.students as any;
      const studentName = s ? `${s.first_name || ""} ${s.last_name || ""}`.trim() || "Learner" : "Learner";
      rows.push({
        date: p.paid_at,
        type: "in",
        source: `Fee: ${studentName} (${s?.adm_no || "N/A"})`,
        reference: p.reference || p.payment_method,
        amount: Number(p.amount),
      });
    });

    (expenses || []).forEach((e) => {
      rows.push({
        date: e.expense_date,
        type: "out",
        source: `${e.category}: ${e.description || ""}`,
        reference: e.voucher_no || "Expense",
        amount: Number(e.amount),
      });
    });

    rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let running = 0;
    const ledger: CashBookEntry[] = rows.map((r) => {
      running += r.type === "in" ? r.amount : -r.amount;
      return { ...r, balance: running };
    });

    return { ledger: ledger.reverse(), closing_balance: running };
  });

export const getTrialBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ school_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: feeStructures } = await context.supabase
      .from("fee_structures")
      .select("amount")
      .eq("school_id", data.school_id);
    const { count: studentCount } = await context.supabase
      .from("students")
      .select("*", { count: "exact", head: true })
      .eq("school_id", data.school_id)
      .eq("is_active", true);

    const basePerStudent = (feeStructures || []).reduce((sum, s) => sum + Number(s.amount), 0);
    const totalBilled = basePerStudent * (studentCount || 0);

    const { data: payments } = await context.supabase
      .from("fee_payments")
      .select("amount")
      .eq("school_id", data.school_id);
    const totalCash = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);

    const { data: expenses } = await context.supabase
      .from("finance_expenses")
      .select("amount")
      .eq("school_id", data.school_id);
    const totalExpenses = (expenses || []).reduce((sum, e) => sum + Number(e.amount), 0);

    const cashOnHand = totalCash - totalExpenses;
    const debtors = Math.max(0, totalBilled - totalCash);

    const accounts: TrialBalanceItem[] = [
      { account: "Cash & Bank Balances", debit: Math.max(0, cashOnHand), credit: cashOnHand < 0 ? Math.abs(cashOnHand) : 0 },
      { account: "Accounts Receivable (Debtors)", debit: debtors, credit: 0 },
      { account: "Operating Expenses", debit: totalExpenses, credit: 0 },
      { account: "Fee Revenue Billed", debit: 0, credit: totalBilled },
    ];

    const totalDebit = accounts.reduce((s, a) => s + a.debit, 0);
    const totalCredit = accounts.reduce((s, a) => s + a.credit, 0);

    return { accounts, totalDebit, totalCredit, inBalance: Math.abs(totalDebit - totalCredit) < 1 };
  });

export const assignUnmatchedTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: unknown) =>
      z
        .object({
          transaction_id: z.string().uuid(),
          student_id: z.string().uuid(),
          term_id: z.string().uuid(),
          school_id: z.string().uuid(),
        })
        .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: tx, error: txErr } = await context.supabase
      .from("mpesa_transactions")
      .select("*")
      .eq("id", data.transaction_id)
      .eq("school_id", data.school_id)
      .maybeSingle();

    if (txErr || !tx) return { error: "Transaction not found." };
    if (tx.status === "completed" && tx.student_id) return { error: "Already assigned." };

    const { error: payErr } = await context.supabase.from("fee_payments").insert({
      school_id: data.school_id,
      student_id: data.student_id,
      term_id: data.term_id,
      amount: tx.amount,
      payment_method: "mpesa",
      reference: tx.mpesa_receipt_number || tx.checkout_request_id || "MPESA-AUTO",
      notes: `Matched from unmatched transaction (Phone: ${tx.phone})`,
      recorded_by: context.userId,
    });

    if (payErr) return { error: payErr.message };

    await context.supabase
      .from("mpesa_transactions")
      .update({ student_id: data.student_id, status: "completed" })
      .eq("id", data.transaction_id);

    return { ok: true };
  });
