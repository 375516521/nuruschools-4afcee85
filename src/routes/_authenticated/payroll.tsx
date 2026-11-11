import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  getMonthlyPayroll,
  saveStaffSalary,
  togglePayrollPaid,
  getSchoolExpensesList,
  addGeneralExpense,
  PayrollItem,
} from "@/lib/payroll.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SchoolLetterhead } from "@/components/SchoolLetterhead";
import { AppShell, useSession } from "@/components/AppShell";
import { toast } from "sonner";
import {
  DollarSign,
  Printer,
  Edit2,
  CheckCircle2,
  Clock,
  Plus,
  Receipt,
  FileSpreadsheet,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/payroll")({
  component: PayrollPage,
});

export default function PayrollPage() {
  const queryClient = useQueryClient();
  const currentDate = new Date();
  const defaultMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;

  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonth);
  const [editingItem, setEditingItem] = useState<PayrollItem | null>(null);
  const [payslipItem, setPayslipItem] = useState<PayrollItem | null>(null);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);

  const [expenseForm, setExpenseForm] = useState({
    category: "Utilities & Electricity",
    amount: "",
    spent_on: new Date().toISOString().split("T")[0],
    payment_method: "bank" as const,
    description: "",
  });

  // FIX 3: Use useSession - respects Superadmin School Switcher
  const { schoolId, school, profile } = useSession() as any;

  const { data: payroll = [], isLoading: isLoadingPayroll } = useQuery({
    queryKey: ["payroll", schoolId, selectedMonth],
    queryFn: () => getMonthlyPayroll({ data: { school_id: schoolId!, month: selectedMonth } }),
    enabled: !!schoolId,
  });

  const { data: expenses = [], isLoading: isLoadingExpenses } = useQuery({
    queryKey: ["general-expenses", schoolId],
    queryFn: () => getSchoolExpensesList({ data: { school_id: schoolId! } }),
    enabled: !!schoolId,
  });

  const saveSalaryMutation = useMutation({
    mutationFn: (values: any) =>
      saveStaffSalary({
        data: {
          school_id: schoolId!,
          month: selectedMonth,
          staff_id: values.staff_id,
          basic_salary: Number(values.basic_salary),
          allowances: Number(values.allowances || 0),
          deduction_nssf: Number(values.deduction_nssf || 0),
          deduction_nhif: Number(values.deduction_nhif || 0),
          deduction_paye: Number(values.deduction_paye || 0),
          other_deductions: Number(values.other_deductions || 0),
          payment_method: values.payment_method,
        },
      }),
    onSuccess: () => {
      toast.success("Staff salary and deductions updated");
      queryClient.invalidateQueries({ queryKey: ["payroll", schoolId, selectedMonth] });
      setEditingItem(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const togglePaidMutation = useMutation({
    mutationFn: (item: PayrollItem) =>
      togglePayrollPaid({
        data: {
          school_id: schoolId!,
          staff_id: item.staff_id,
          staff_name: item.staff_name,
          month: selectedMonth,
          target_status: item.status === "paid" ? "unpaid" : "paid",
          net_pay: item.net_pay,
          payment_method: item.payment_method,
        },
      }),
    onSuccess: (res) => {
      toast.success(res.status === "paid" ? "Marked as Paid & logged to Expenses" : "Marked as Unpaid & removed from Expenses");
      queryClient.invalidateQueries({ queryKey: ["payroll", schoolId, selectedMonth] });
      queryClient.invalidateQueries({ queryKey: ["general-expenses", schoolId] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const addExpenseMutation = useMutation({
    mutationFn: () =>
      addGeneralExpense({
        data: {
          school_id: schoolId!,
          category: expenseForm.category,
          amount: Number(expenseForm.amount),
          spent_on: expenseForm.spent_on,
          payment_method: expenseForm.payment_method,
          description: expenseForm.description,
        },
      }),
    onSuccess: () => {
      toast.success("School expense recorded");
      queryClient.invalidateQueries({ queryKey: ["general-expenses", schoolId] });
      setIsAddExpenseOpen(false);
      setExpenseForm({
        category: "Utilities & Electricity",
        amount: "",
        spent_on: new Date().toISOString().split("T")[0],
        payment_method: "bank",
        description: "",
      });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const totalPayroll = payroll.reduce((acc, curr) => acc + curr.net_pay, 0);
  const totalPaid = payroll.filter((p) => p.status === "paid").reduce((acc, curr) => acc + curr.net_pay, 0);
  const totalUnpaid = totalPayroll - totalPaid;
  const totalOtherExpenses = expenses.reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0);

  function printPayrollRegister() {
    const w = window.open("", "_blank");
    if (!w) return;
    const rows = payroll.map((p) => `<tr><td>${p.staff_name}</td><td>${p.staff_title || ""}</td><td style="text-align:right">${p.basic_salary.toLocaleString()}</td><td style="text-align:right">${p.allowances.toLocaleString()}</td><td style="text-align:right">${(p.deduction_nssf + p.deduction_nhif + p.deduction_paye + p.other_deductions).toLocaleString()}</td><td style="text-align:right"><b>${p.net_pay.toLocaleString()}</b></td><td>${p.status}</td></tr>`).join("");
    w.document.write(`<html><head><title>Payroll Register ${selectedMonth}</title><style>body{font-family:Arial;padding:20px} table{width:100%;border-collapse:collapse} th,td{border:1px solid #000;padding:6px;font-size:12px} h2{text-align:center}</style></head><body><h2>${(school as any)?.name || "School"} - Monthly Payroll Register</h2><p style="text-align:center">Month: ${selectedMonth} | Total: KES ${totalPayroll.toLocaleString()}</p><table><thead><tr><th>Staff</th><th>Title</th><th>Basic</th><th>Allowances</th><th>Total Deductions</th><th>Net Pay</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
    w.document.close();
    w.print();
  }

  // FIX 2: AppShell requires title
  return (
    <AppShell title="Staff Payroll & Expenses">
    <div className="space-y-6 p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff Payroll & Expenses</h1>
          <p className="text-sm text-muted-foreground">Manage teacher and staff salaries, statutory deductions, net payouts, and operational expenses.</p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="month-select" className="text-xs font-semibold uppercase">Month:</Label>
          <Input id="month-select" type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="w-44" />
          <Button variant="outline" onClick={printPayrollRegister} className="gap-2"><FileSpreadsheet className="w-4 h-4" /> Export Payroll Register PDF</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardDescription className="text-xs font-semibold">Total Month Payroll</CardDescription><CardTitle className="text-2xl font-bold">KES {totalPayroll.toLocaleString()}</CardTitle></CardHeader></Card>
        <Card className="border-emerald-500/20 bg-emerald-500/5"><CardHeader className="pb-2"><CardDescription className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Total Disbursed (Paid)</CardDescription><CardTitle className="text-2xl font-bold text-emerald-600">KES {totalPaid.toLocaleString()}</CardTitle></CardHeader></Card>
        <Card className="border-amber-500/20 bg-amber-500/5"><CardHeader className="pb-2"><CardDescription className="text-xs font-semibold text-amber-700 dark:text-amber-300">Pending Payouts</CardDescription><CardTitle className="text-2xl font-bold text-amber-600">KES {totalUnpaid.toLocaleString()}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription className="text-xs font-semibold">Total School Expenses</CardDescription><CardTitle className="text-2xl font-bold">KES {totalOtherExpenses.toLocaleString()}</CardTitle></CardHeader></Card>
      </div>

      <Tabs defaultValue="payroll" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md mb-4">
          <TabsTrigger value="payroll"><DollarSign className="w-4 h-4 mr-2" /> Staff Payroll</TabsTrigger>
          <TabsTrigger value="expenses"><Receipt className="w-4 h-4 mr-2" /> Operational Expenses</TabsTrigger>
        </TabsList>

        <TabsContent value="payroll" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between"><div><CardTitle>Staff Salary Roll ({selectedMonth})</CardTitle><CardDescription>Basic salaries, NHIF, NSSF, PAYE, and Net Pay calculation.</CardDescription></div></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Staff Member</TableHead><TableHead className="text-right">Basic</TableHead><TableHead className="text-right">Allowances</TableHead><TableHead className="text-right">NSSF / NHIF / PAYE</TableHead><TableHead className="text-right font-bold">Net Pay</TableHead><TableHead className="text-center">Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {isLoadingPayroll ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Loading payroll records...</TableCell></TableRow>
                  ) : payroll.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No staff members found for this school.</TableCell></TableRow>
                  ) : (
                    payroll.map((item) => (
                      <TableRow key={item.staff_id}>
                        <TableCell><p className="font-semibold">{item.staff_name}</p><p className="text-xs text-muted-foreground">{item.staff_title} · {item.phone || "No phone"}</p></TableCell>
                        <TableCell className="text-right font-mono">KES {item.basic_salary.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono text-emerald-600">+KES {item.allowances.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono text-rose-600">-KES {(item.deduction_nssf + item.deduction_nhif + item.deduction_paye + item.other_deductions).toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-base">KES {item.net_pay.toLocaleString()}</TableCell>
                        <TableCell className="text-center">
                          <Button size="sm" variant={item.status === "paid" ? "default" : "outline"} className={item.status === "paid" ? "bg-emerald-600 hover:bg-emerald-700" : "border-amber-500 text-amber-600"} onClick={() => togglePaidMutation.mutate(item)} disabled={togglePaidMutation.isPending}>
                            {item.status === "paid" ? (<><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Paid</>) : (<><Clock className="w-3.5 h-3.5 mr-1" /> Unpaid</>)}
                          </Button>
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button size="icon" variant="ghost" onClick={() => setEditingItem(item)}><Edit2 className="w-4 h-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => setPayslipItem(item)}><Printer className="w-4 h-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div><CardTitle>School Expense Ledger</CardTitle><CardDescription>Tracks utilities, laboratory, meals, repairs, and auto-logged staff salaries.</CardDescription></div>
              <Button onClick={() => setIsAddExpenseOpen(true)} className="gap-2"><Plus className="w-4 h-4" /> Record New Expense</Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead>Method</TableHead><TableHead className="text-right">Amount (KES)</TableHead></TableRow></TableHeader>
                <TableBody>
                  {isLoadingExpenses ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Loading expenses...</TableCell></TableRow>
                  ) : expenses.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No school expenses recorded yet.</TableCell></TableRow>
                  ) : (
                    expenses.map((exp: any) => (
                      <TableRow key={exp.id}>
                        <TableCell className="text-xs font-mono">{exp.spent_on || exp.expense_date || exp.date || exp.created_at?.slice(0, 10)}</TableCell>
                        <TableCell><Badge variant="outline">{exp.category}</Badge></TableCell>
                        <TableCell className="text-sm">{exp.description || "—"}</TableCell>
                        <TableCell className="text-xs capitalize">{exp.payment_method}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">KES {Number(exp.amount).toLocaleString()}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {editingItem && (
        <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Edit Salary: {editingItem.staff_name}</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveSalaryMutation.mutate(editingItem); }} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Basic Salary (KES)</Label><Input type="number" value={editingItem.basic_salary} onChange={(e) => setEditingItem({ ...editingItem, basic_salary: Number(e.target.value) })} required /></div>
                <div><Label>Allowances (KES)</Label><Input type="number" value={editingItem.allowances} onChange={(e) => setEditingItem({ ...editingItem, allowances: Number(e.target.value) })} /></div>
              </div>
              <div className="border-t pt-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Kenyan Statutory Deductions</p>
                <div className="grid grid-cols-3 gap-2">
                  <div><Label className="text-xs">NSSF</Label><Input type="number" value={editingItem.deduction_nssf} onChange={(e) => setEditingItem({ ...editingItem, deduction_nssf: Number(e.target.value) })} /></div>
                  <div><Label className="text-xs">NHIF / SHIF</Label><Input type="number" value={editingItem.deduction_nhif} onChange={(e) => setEditingItem({ ...editingItem, deduction_nhif: Number(e.target.value) })} /></div>
                  <div><Label className="text-xs">PAYE</Label><Input type="number" value={editingItem.deduction_paye} onChange={(e) => setEditingItem({ ...editingItem, deduction_paye: Number(e.target.value) })} /></div>
                </div>
              </div>
              <div><Label>Other Deductions (Advance/Welfare)</Label><Input type="number" value={editingItem.other_deductions} onChange={(e) => setEditingItem({ ...editingItem, other_deductions: Number(e.target.value) })} /></div>
              <div><Label>Payment Method</Label>
                <Select value={editingItem.payment_method || "bank"} onValueChange={(v) => setEditingItem({ ...editingItem, payment_method: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="bank">Bank</SelectItem><SelectItem value="mpesa">M-Pesa</SelectItem><SelectItem value="cash">Cash</SelectItem></SelectContent>
                </Select>
              </div>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setEditingItem(null)}>Cancel</Button><Button type="submit" disabled={saveSalaryMutation.isPending}>{saveSalaryMutation.isPending ? "Saving..." : "Save Salary"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {payslipItem && (
        <Dialog open={!!payslipItem} onOpenChange={() => setPayslipItem(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Payslip - {payslipItem.staff_name}</DialogTitle></DialogHeader>
            <div className="space-y-2 text-sm">
              {/* FIX 2: SchoolLetterhead requires documentTitle */}
              <SchoolLetterhead school={school as any} documentTitle="STAFF PAYSLIP" />
              <p className="text-center font-bold">Month: {selectedMonth}</p>
              <div className="flex justify-between"><span>Basic Salary</span><span>KES {payslipItem.basic_salary.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Allowances</span><span>+ KES {payslipItem.allowances.toLocaleString()}</span></div>
              <div className="flex justify-between text-rose-600"><span>NSSF</span><span>- KES {payslipItem.deduction_nssf.toLocaleString()}</span></div>
              <div className="flex justify-between text-rose-600"><span>NHIF / SHIF</span><span>- KES {payslipItem.deduction_nhif.toLocaleString()}</span></div>
              <div className="flex justify-between text-rose-600"><span>PAYE</span><span>- KES {payslipItem.deduction_paye.toLocaleString()}</span></div>
              <div className="flex justify-between text-rose-600"><span>Other Deductions</span><span>- KES {payslipItem.other_deductions.toLocaleString()}</span></div>
              <div className="flex justify-between font-bold border-t pt-2"><span>NET PAY</span><span>KES {payslipItem.net_pay.toLocaleString()}</span></div>
              <p>Status: {payslipItem.status} | Method: {payslipItem.payment_method || "-"}</p>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setPayslipItem(null)}>Close</Button><Button onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" /> Print Payslip</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {isAddExpenseOpen && (
        <Dialog open={isAddExpenseOpen} onOpenChange={setIsAddExpenseOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Record New Expense</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Category</Label><Input value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })} /></div>
              <div><Label>Amount (KES)</Label><Input type="number" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} /></div>
              <div><Label>Date</Label><Input type="date" value={expenseForm.spent_on} onChange={(e) => setExpenseForm({ ...expenseForm, spent_on: e.target.value })} /></div>
              <div><Label>Payment Method</Label>
                <Select value={expenseForm.payment_method} onValueChange={(v) => setExpenseForm({ ...expenseForm, payment_method: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="bank">Bank</SelectItem><SelectItem value="mpesa">M-Pesa</SelectItem><SelectItem value="cash">Cash</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Description</Label><Input value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} placeholder="What was this for?" /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setIsAddExpenseOpen(false)}>Cancel</Button><Button onClick={() => addExpenseMutation.mutate()} disabled={addExpenseMutation.isPending}>{addExpenseMutation.isPending ? "Saving..." : "Save Expense"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
    </AppShell>
  );
}
