import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface PayrollItem {
  id?: string;
  staff_id: string;
  staff_name: string;
  staff_title: string | null;
  phone: string | null;
  basic_salary: number;
  allowances: number;
  deduction_nssf: number;
  deduction_nhif: number;
  deduction_paye: number;
  other_deductions: number;
  net_pay: number;
  status: "paid" | "unpaid";
  payment_method: "cash" | "bank" | "mpesa" | "cheque" | "waiver";
  paid_at?: string | null;
  expense_id?: string | null;
}

// 1. Fetch all staff and their payroll for a specific month
export const getMonthlyPayroll = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ school_id: z.string().uuid(), month: z.string() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    // Get all school staff profiles
    const { data: staffList, error: staffError } = await context.supabase
      .from("profiles")
      .select("id, full_name, title, phone")
      .eq("school_id", data.school_id)
      .order("full_name", { ascending: true });

    if (staffError) throw new Error(staffError.message);

    // Get existing payroll records for this month
    const { data: records, error: recordsError } = await context.supabase
      .from("payroll_records" as any)
      .select("*")
      .eq("school_id", data.school_id)
      .eq("month", data.month);

    if (recordsError) throw new Error(recordsError.message);

    const recordMap = new Map((records || []).map((r: any) => [r.staff_id, r]));

    const combined: PayrollItem[] = (staffList || []).map((staff) => {
      const rec: any = recordMap.get(staff.id);
      return {
        id: rec?.id,
        staff_id: staff.id,
        staff_name: staff.full_name,
        staff_title: staff.title || "Staff",
        phone: staff.phone,
        basic_salary: Number(rec?.basic_salary || 0),
        allowances: Number(rec?.allowances || 0),
        deduction_nssf: Number(rec?.deduction_nssf || 0),
        deduction_nhif: Number(rec?.deduction_nhif || 0),
        deduction_paye: Number(rec?.deduction_paye || 0),
        other_deductions: Number(rec?.other_deductions || 0),
        net_pay: Number(rec?.net_pay || 0),
        status: rec?.status || "unpaid",
        payment_method: rec?.payment_method || "bank",
        paid_at: rec?.paid_at,
        expense_id: rec?.expense_id,
      };
    });

    return combined;
  });

// 2. Save or update staff salary details and auto-calculate Net Pay
export const saveStaffSalary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      school_id: z.string().uuid(),
      staff_id: z.string().uuid(),
      month: z.string(),
      basic_salary: z.number().min(0),
      allowances: z.number().min(0).default(0),
      deduction_nssf: z.number().min(0).default(0),
      deduction_nhif: z.number().min(0).default(0),
      deduction_paye: z.number().min(0).default(0),
      other_deductions: z.number().min(0).default(0),
      payment_method: z.enum(["cash", "bank", "mpesa", "cheque", "waiver"]).default("bank"),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const net_pay =
      data.basic_salary +
      data.allowances -
      (data.deduction_nssf + data.deduction_nhif + data.deduction_paye + data.other_deductions);

    const { error } = await context.supabase.from("payroll_records" as any).upsert(
      {
        school_id: data.school_id,
        staff_id: data.staff_id,
        month: data.month,
        basic_salary: data.basic_salary,
        allowances: data.allowances,
        deduction_nssf: data.deduction_nssf,
        deduction_nhif: data.deduction_nhif,
        deduction_paye: data.deduction_paye,
        other_deductions: data.other_deductions,
        net_pay: Math.max(0, net_pay),
        payment_method: data.payment_method,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "school_id,staff_id,month" }
    );

    if (error) throw new Error(error.message);
    return { success: true, net_pay: Math.max(0, net_pay) };
  });

// 3. Toggle Paid/Unpaid & automatically log to finance_expenses
export const togglePayrollPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      school_id: z.string().uuid(),
      staff_id: z.string().uuid(),
      staff_name: z.string(),
      month: z.string(),
      target_status: z.enum(["paid", "unpaid"]),
      net_pay: z.number(),
      payment_method: z.enum(["cash", "bank", "mpesa", "cheque", "waiver"]),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    // 1. Fetch current record
    const { data: current } = await context.supabase
      .from("payroll_records" as any)
      .select("id, expense_id")
      .eq("school_id", data.school_id)
      .eq("staff_id", data.staff_id)
      .eq("month", data.month)
      .single();

    let newExpenseId = (current as any)?.expense_id || null;

    if (data.target_status === "paid") {
      // Auto-insert into finance_expenses if not already created
      if (!newExpenseId) {
        const { data: exp, error: expErr } = await context.supabase
          .from("finance_expenses")
          .insert({
            school_id: data.school_id,
            category: "Salaries & Wages",
            amount: data.net_pay,
            payment_method: data.payment_method,
            spent_on: new Date().toISOString().split("T")[0],
            description: `Salary: ${data.staff_name} (${data.month})`,
            created_by: context.userId,
          })
          .select("id")
          .single();

        if (expErr) throw new Error("Failed to log expense: " + expErr.message);
        newExpenseId = exp.id;
      }
    } else {
      // If toggled back to unpaid, delete the linked expense
      if (newExpenseId) {
        await context.supabase.from("finance_expenses").delete().eq("id", newExpenseId);
        newExpenseId = null;
      }
    }

    // 2. Update payroll_records
    const { error: updateErr } = await context.supabase
      .from("payroll_records" as any)
      .update({
        status: data.target_status,
        paid_at: data.target_status === "paid" ? new Date().toISOString() : null,
        expense_id: newExpenseId,
        updated_at: new Date().toISOString(),
      })
      .eq("school_id", data.school_id)
      .eq("staff_id", data.staff_id)
      .eq("month", data.month);

    if (updateErr) throw new Error(updateErr.message);
    return { success: true, status: data.target_status };
  });

// 4. General School Expenses: list & add
export const getSchoolExpensesList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ school_id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { data: list, error } = await context.supabase
      .from("finance_expenses")
      .select("*")
      .eq("school_id", data.school_id)
      .order("spent_on", { ascending: false });

    if (error) throw new Error(error.message);
    return list || [];
  });

export const addGeneralExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      school_id: z.string().uuid(),
      category: z.string().min(1),
      amount: z.number().positive(),
      spent_on: z.string(),
      payment_method: z.enum(["cash", "bank", "mpesa", "cheque", "waiver"]),
      description: z.string().optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { data: created, error } = await context.supabase
      .from("finance_expenses")
      .insert({
        school_id: data.school_id,
        category: data.category,
        amount: data.amount,
        spent_on: data.spent_on,
        payment_method: data.payment_method,
        description: data.description || null,
        created_by: context.userId,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return created;
  });
