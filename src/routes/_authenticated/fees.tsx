import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Plus,
  Loader2,
  Receipt,
  Printer,
  MessageCircle,
  Send,
  Smartphone,
  AlertCircle,
  BookOpen,
  PieChart,
  DollarSign,
  Wallet,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { AppShell, useSession, useActiveTerm } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ksh, KARLI } from "@/lib/karli";
import { SchoolLetterhead, DocFooter, type SchoolInfo } from "@/components/SchoolLetterhead";
import { logAudit } from "@/lib/audit";
import { sendStkPush } from "@/lib/mpesa.functions";
import { recordManualSplitPayment } from "@/lib/family.functions";

export const Route = createFileRoute("/_authenticated/fees")({
  component: FeesPage,
});

const METHODS = ["mpesa", "cash", "bank", "cheque", "waiver"] as const;

type ReceiptData = {
  learner: string;
  admNo: string;
  grade: string;
  amount: number;
  method: string;
  reference: string | null;
  paidAt: string;
  balance: number;
  receiptNo: string;
};

function FeesPage() {
  const { data: session } = useSession();
  const schoolId = (session?.profile as { school_id?: string } | null)?.school_id ?? null;
  const school = session?.school as SchoolInfo;
  const { data: activeTerm } = useActiveTerm(schoolId);
  const roles = session?.roles ?? [];
  const isAdmin = roles.includes("superadmin") || roles.includes("hoi");
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState("fees");
  const [termId, setTermId] = useState("");

  const { data: allTerms } = useQuery({
    queryKey: ["all-terms-full", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (
        await supabase
          .from("terms")
          .select("id, term_number, is_active, start_date, end_date, academic_years(year, id)")
          .eq("school_id", schoolId!)
          .order("term_number")
      ).data ?? [],
  });
  const term = (allTerms ?? []).find((t) => t.id === termId) ?? activeTerm ?? null;

  // Discounts
  const [discOpen, setDiscOpen] = useState<string | null>(null);
  const { data: discounts } = useQuery({
    queryKey: ["fee-discounts", schoolId, term?.id],
    enabled: !!schoolId && !!term,
    queryFn: async () =>
      (
        await supabase
          .from("fee_discounts")
          .select("*")
          .eq("school_id", schoolId!)
          .eq("term_id", term!.id)
      ).data ?? [],
  });

  const discountFor = (id: string) =>
    (discounts ?? []).filter((d) => d.student_id === id).reduce((a, d) => a + Number(d.amount), 0);

  const addDiscount = useMutation({
    mutationFn: async (form: FormData) => {
      const amount = Number(form.get("amount"));
      if (!term || !discOpen) throw new Error("No term selected.");
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount greater than zero.");
      const { error } = await supabase.from("fee_discounts").insert({
        school_id: schoolId!,
        term_id: term.id,
        student_id: discOpen,
        amount,
        reason: String(form.get("reason") ?? "").trim() || null,
        created_by: session?.user?.id ?? null,
      });
      if (error) throw error;
      await logAudit("add_fee_discount", "students", discOpen, { amount, term: term.id });
    },
    onSuccess: () => {
      toast.success("Discount applied.");
      setDiscOpen(null);
      void qc.invalidateQueries({ queryKey: ["fee-discounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Students & Structures
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [learnerQuery, setLearnerQuery] = useState("");
  const [method, setMethod] = useState<string>("mpesa");
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const { data: students } = useQuery({
    queryKey: ["fee-students", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (
        await supabase
          .from("students")
          .select("id, adm_no, first_name, last_name, grade_id, guardian_name, guardian_phone, wallet_balance, family_id, grades(name), streams(name)")
          .eq("school_id", schoolId!)
          .eq("is_active", true)
          .order("adm_no")
      ).data ?? [],
  });

  const learnerOptions = (students ?? []).filter((s) => {
    const t = learnerQuery.trim().toLowerCase();
    if (!t) return true;
    return `${s.first_name} ${s.last_name} ${s.adm_no}`.toLowerCase().includes(t);
  });

  const gradeLabel = (s: { grades?: unknown; streams?: unknown } | undefined) =>
    [(s?.grades as { name?: string } | null)?.name, (s?.streams as { name?: string } | null)?.name]
      .filter(Boolean)
      .join(" ") || "—";

  const { data: structures } = useQuery({
    queryKey: ["fee-structures", schoolId, term?.id],
    enabled: !!schoolId && !!term,
    queryFn: async () =>
      (
        await supabase
          .from("fee_structures")
          .select("*")
          .eq("school_id", schoolId!)
          .eq("term_id", term!.id)
      ).data ?? [],
  });

  const { data: payments } = useQuery({
    queryKey: ["fee-payments", schoolId, term?.id],
    enabled: !!schoolId && !!term,
    queryFn: async () =>
      (
        await supabase
          .from("fee_payments")
          .select("*")
          .eq("school_id", schoolId!)
          .eq("term_id", term!.id)
          .order("paid_at", { ascending: false })
      ).data ?? [],
  });

  const grossFor = (grade_id: string | null) =>
    (structures ?? []).filter((f) => f.grade_id === grade_id).reduce((a, f) => a + Number(f.amount), 0);
  const billedFor = (grade_id: string | null, studentId?: string) =>
    grossFor(grade_id) - (studentId ? discountFor(studentId) : 0);
  const paidFor = (id: string) =>
    (payments ?? []).filter((p) => p.student_id === id).reduce((a, p) => a + Number(p.amount), 0);

  const termLabel = term
    ? `${(term as { academic_years?: { year?: number } }).academic_years?.year} Term ${term.term_number}`
    : "";

  // WhatsApp bulk & reminders
  function reminderLink(
    s: {
      first_name: string;
      last_name: string;
      adm_no: string;
      guardian_phone: string | null;
      grades?: unknown;
      streams?: unknown;
    },
    balance: number,
  ) {
    const phone = (s.guardian_phone ?? "").replace(/\D/g, "").replace(/^0/, "254");
    const text = encodeURIComponent(
      `Dear Parent/Guardian, ${s.first_name} ${s.last_name} (Adm ${s.adm_no}, ${gradeLabel(s)}) has an outstanding fee balance of ${ksh(balance)} for ${termLabel}. Kindly clear to unlock results. — ${school?.name ?? KARLI.name}`,
    );
    return phone ? `https://wa.me/${phone}?text=${text}` : null;
  }

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkIndex, setBulkIndex] = useState(0);
  const [bulkGrade, setBulkGrade] = useState("all");

  const owing = (students ?? [])
    .map((s) => ({ s, balance: billedFor(s.grade_id, s.id) - paidFor(s.id) }))
    .filter((r) => r.balance > 0);
  const owingInScope = owing.filter((r) => bulkGrade === "all" || r.s.grade_id === bulkGrade);
  const owingWithPhone = owingInScope.filter((r) => (r.s.guardian_phone ?? "").replace(/\D/g, "").length >= 9);

  function sendAllReminders() {
    let blocked = 0;
    const rest = owingWithPhone.slice(bulkIndex);
    rest.forEach((r) => {
      const link = reminderLink(r.s, r.balance);
      if (link && !window.open(link, "_blank")) blocked++;
    });
    setBulkIndex(owingWithPhone.length);
    if (blocked)
      toast.error(`Your browser blocked ${blocked} message window(s). Allow pop-ups and try again.`);
    else toast.success(`Opened WhatsApp messages for ${rest.length} parent(s).`);
  }

  // Record Manual Payment
  const record = useMutation({
    mutationFn: async (form: FormData) => {
      const amount = Number(form.get("amount"));
      if (!studentId) throw new Error("Select a learner.");
      if (!term) throw new Error("No active term is set.");
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount greater than zero.");
      const { data, error } = await supabase
        .from("fee_payments")
        .insert({
          school_id: schoolId!,
          term_id: term.id,
          student_id: studentId,
          amount,
          payment_method: method as "mpesa",
          reference: String(form.get("reference") ?? "").trim() || null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (p) => {
      toast.success("Payment recorded — receipt ready.");
      const s = (students ?? []).find((x) => x.id === p.student_id);
      if (s) {
        const balance = billedFor(s.grade_id, s.id) - (paidFor(s.id) + Number(p.amount));
        setReceipt({
          learner: `${s.first_name} ${s.last_name}`,
          admNo: s.adm_no,
          grade: gradeLabel(s),
          amount: Number(p.amount),
          method: p.payment_method,
          reference: p.reference,
          paidAt: p.paid_at,
          balance,
          receiptNo: p.id.slice(0, 8).toUpperCase(),
        });
      }
      setOpen(false);
      setStudentId("");
      void qc.invalidateQueries({ queryKey: ["fee-payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // STK Push State
  const [stkStudent, setStkStudent] = useState<any>(null);
  const [stkAmount, setStkAmount] = useState("");
  const [stkPhone, setStkPhone] = useState("");
  const [stkLoading, setStkLoading] = useState(false);

  const handleSendStk = async () => {
    if (!stkStudent || !stkAmount || !stkPhone) {
      toast.error("Enter student, amount, and phone number.");
      return;
    }
    setStkLoading(true);
    try {
      const res = await sendStkPush({
        data: {
          school_id: schoolId!,
          student_id: stkStudent.id,
          phone: stkPhone,
          amount: Number(stkAmount),
        },
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success(res.message || "STK Push prompt sent to parent's phone!");
        setStkStudent(null);
      }
    } catch {
      toast.error("Failed to initiate STK push");
    } finally {
      setStkLoading(false);
    }
  };

  // Unmatched Queue
  const { data: unmatchedList } = useQuery({
    queryKey: ["unmatched-mpesa", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (
        await supabase
          .from("fee_payments")
          .select("*")
          .eq("school_id", schoolId!)
          .is("student_id", null)
          .order("paid_at", { ascending: false })
      ).data ?? [],
  });

  const [assignTx, setAssignTx] = useState<any>(null);
  const [assignStudentId, setAssignStudentId] = useState("");
  const [assigning, setAssigning] = useState(false);

  const handleAssignSingle = async () => {
    if (!assignTx || !assignStudentId) return;
    setAssigning(true);
    try {
      const { error } = await supabase
        .from("fee_payments")
        .update({ student_id: assignStudentId })
        .eq("id", assignTx.id);
      if (error) throw error;
      toast.success("Payment assigned to learner!");
      setAssignTx(null);
      void qc.invalidateQueries({ queryKey: ["unmatched-mpesa"] });
      void qc.invalidateQueries({ queryKey: ["fee-payments"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAssigning(false);
    }
  };

  // Expenses & Petty Cash
  const { data: expenses } = useQuery({
    queryKey: ["finance-expenses", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (
        await supabase
          .from("finance_expenses")
          .select("*")
          .eq("school_id", schoolId!)
          .order("expense_date", { ascending: false })
      ).data ?? [],
  });

  const { data: pettyCash } = useQuery({
    queryKey: ["finance-petty-cash", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (
        await supabase
          .from("petty_cash")
          .select("*")
          .eq("school_id", schoolId!)
          .order("entry_date", { ascending: false })
      ).data ?? [],
  });

  const totalCollected = (payments ?? []).reduce((a, p) => a + Number(p.amount), 0);
  const totalExpenses = (expenses ?? []).reduce((a, e) => a + Number(e.amount), 0);
  const pettyIn = (pettyCash ?? []).reduce((a, p) => a + Number(p.amount_in || 0), 0);
  const pettyOut = (pettyCash ?? []).reduce((a, p) => a + Number(p.amount_out || 0), 0);
  const cashBalance = totalCollected + pettyIn - (totalExpenses + pettyOut);

  return (
    <AppShell
      title="Fees & Finance"
      subtitle={term ? `${ksh(totalCollected)} collected · ${termLabel}` : "No active term"}
      actions={
        <div className="flex items-center gap-2">
          <Select value={term?.id ?? ""} onValueChange={setTermId}>
            <SelectTrigger className="h-9 w-[170px]">
              <SelectValue placeholder="Choose term" />
            </SelectTrigger>
            <SelectContent>
              {(allTerms ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {(t.academic_years as { year?: number } | null)?.year} Term {t.term_number}
                  {t.is_active ? " (current)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setBulkIndex(0);
              setBulkGrade("all");
              setBulkOpen(true);
            }}
            disabled={owing.length === 0}
          >
            <Send className="size-4 mr-1" /> Remind ({owing.length})
          </Button>
        </div>
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="fees">Fees & Balances</TabsTrigger>
          <TabsTrigger value="unmatched">
            Unmatched Queue
            {unmatchedList && unmatchedList.length > 0 && (
              <Badge variant="destructive" className="ml-1.5 px-1 py-0 text-[10px]">
                {unmatchedList.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="cashbook">Cash Book</TabsTrigger>
          <TabsTrigger value="expenses">Budget & Expenses</TabsTrigger>
          <TabsTrigger value="trialbalance">Trial Balance</TabsTrigger>
        </TabsList>

        <TabsContent value="fees" className="space-y-4">
          <div className="flex justify-between items-center">
            <Input
              placeholder="Search learner by name or admission..."
              value={learnerQuery}
              onChange={(e) => setLearnerQuery(e.target.value)}
              className="max-w-sm"
            />
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="size-4 mr-1" /> Record Fee Payment
            </Button>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Adm</TableHead>
                  <TableHead>Learner</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Billed</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {learnerOptions.map((s) => {
                  const gross = billedFor(s.grade_id, s.id);
                  const paid = paidFor(s.id);
                  const bal = gross - paid;
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.adm_no}</TableCell>
                      <TableCell className="font-medium">
                        {s.first_name} {s.last_name}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{gradeLabel(s)}</TableCell>
                      <TableCell>{ksh(gross)}</TableCell>
                      <TableCell className="text-emerald-600 font-medium">{ksh(paid)}</TableCell>
                      <TableCell className={bal > 0 ? "text-destructive font-medium" : "text-emerald-600"}>
                        {bal > 0 ? ksh(bal) : "Cleared"}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs text-primary"
                          onClick={() => {
                            setStkStudent(s);
                            setStkAmount(String(Math.max(10, bal > 0 ? bal : 100)));
                            setStkPhone(s.guardian_phone || "");
                          }}
                        >
                          <Smartphone className="w-3.5 h-3.5 mr-1" /> STK
                        </Button>
                        {bal > 0 && s.guardian_phone && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs text-emerald-600"
                            asChild
                          >
                            <a href={reminderLink(s, bal) || "#"} target="_blank" rel="noopener">
                              <MessageCircle className="w-3.5 h-3.5 mr-1" /> Remind
                            </a>
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs"
                          onClick={() => setDiscOpen(s.id)}
                        >
                          Discount
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="unmatched" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                Unmatched M-Pesa Callbacks Queue
              </CardTitle>
              <CardDescription>
                Payments received via Paybill/Till where the admission number was not recognized. Assign to a student or split among siblings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {unmatchedList && unmatchedList.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>M-Pesa Code</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Account / Phone</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unmatchedList.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-xs">{new Date(tx.paid_at).toLocaleString()}</TableCell>
                        <TableCell className="font-mono font-medium">{tx.reference}</TableCell>
                        <TableCell className="font-semibold text-emerald-600">{ksh(Number(tx.amount))}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{tx.reference || "—"}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => setAssignTx(tx)}>
                            Assign to Student
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No unmatched transactions! All M-Pesa payments have been assigned.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cashbook" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Cash In</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-600">{ksh(totalCollected + pettyIn)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Cash Out</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">{ksh(totalExpenses + pettyOut)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Net Cash Position</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">{ksh(cashBalance)}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent Receipts & Vouchers</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description / Ref</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(payments ?? []).slice(0, 15).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs">{new Date(p.paid_at).toLocaleDateString()}</TableCell>
                      <TableCell className="font-medium text-xs">Fee Collection ({p.reference || "Direct"})</TableCell>
                      <TableCell className="text-xs uppercase">{p.payment_method}</TableCell>
                      <TableCell className="text-right text-emerald-600 font-semibold">+{ksh(Number(p.amount))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>School Operating Expenses</CardTitle>
              <CardDescription>Track utilities, stationery, salaries, and repairs.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(expenses ?? []).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs">{e.expense_date}</TableCell>
                      <TableCell className="font-medium text-xs">{e.category}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.description || "—"}</TableCell>
                      <TableCell className="text-right font-semibold text-destructive">-{ksh(Number(e.amount))}</TableCell>
                    </TableRow>
                  ))}
                  {(expenses ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">
                        No expenses logged for this school term.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trialbalance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Trial Balance Summary</CardTitle>
              <CardDescription>Double-entry balancing ledger for fee revenue and operational overhead.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account Name</TableHead>
                    <TableHead className="text-right">Debit (KES)</TableHead>
                    <TableHead className="text-right">Credit (KES)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Operating Expenses</TableCell>
                    <TableCell className="text-right font-mono">{ksh(totalExpenses)}</TableCell>
                    <TableCell className="text-right font-mono">—</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Cash & Bank Accounts</TableCell>
                    <TableCell className="text-right font-mono">{ksh(Math.max(0, cashBalance))}</TableCell>
                    <TableCell className="text-right font-mono">—</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Fee Revenue Account</TableCell>
                    <TableCell className="text-right font-mono">—</TableCell>
                    <TableCell className="text-right font-mono">{ksh(totalCollected)}</TableCell>
                  </TableRow>
                  <TableRow className="border-t-2 font-bold bg-muted/50">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right font-mono">{ksh(totalExpenses + Math.max(0, cashBalance))}</TableCell>
                    <TableCell className="text-right font-mono">{ksh(totalCollected)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* MODAL: Record Fee Payment */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Fee Payment</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              record.mutate(new FormData(e.currentTarget));
            }}
            className="space-y-4"
          >
            <div>
              <Label>Learner</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose learner" />
                </SelectTrigger>
                <SelectContent>
                  {(students ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.first_name} {s.last_name} ({s.adm_no})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m} value={m} className="capitalize">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount (KES)</Label>
              <Input name="amount" type="number" min="1" step="any" required />
            </div>
            <div>
              <Label>Reference / Transaction Code</Label>
              <Input name="reference" placeholder="e.g. QJK912389" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={record.isPending}>
                {record.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Record Payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: Discount */}
      <Dialog open={!!discOpen} onOpenChange={(o) => !o && setDiscOpen(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Apply Discount</DialogTitle>
            <DialogDescription>Reduce the billed amount for this learner for this term.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addDiscount.mutate(new FormData(e.currentTarget));
            }}
            className="space-y-4"
          >
            <div>
              <Label>Amount (KES)</Label>
              <Input name="amount" type="number" min="1" step="any" required />
            </div>
            <div>
              <Label>Reason</Label>
              <Input name="reason" placeholder="e.g. Bursary" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDiscOpen(null)}>Cancel</Button>
              <Button type="submit" disabled={addDiscount.isPending}>Apply Discount</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: Bulk Reminders */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Fee Reminders</DialogTitle>
            <DialogDescription>{owingWithPhone.length} parents with phone numbers owe fees.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Grade Filter</Label>
              <Select value={bulkGrade} onValueChange={setBulkGrade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Grades</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">This will open WhatsApp for each parent. Allow pop-ups.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button onClick={() => { sendAllReminders(); setBulkOpen(false); }}>
              <Send className="w-4 h-4 mr-1" /> Send All Reminders
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: STK Push Prompt */}
      <Dialog open={!!stkStudent} onOpenChange={(o) => !o && setStkStudent(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-primary" />
              M-Pesa STK Push
            </DialogTitle>
            <DialogDescription>
              Prompt parent phone directly with prompt to enter PIN.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Learner</Label>
              <p className="text-sm font-semibold">{stkStudent?.first_name} {stkStudent?.last_name}</p>
            </div>
            <div>
              <Label className="text-xs">Parent Phone</Label>
              <Input value={stkPhone} onChange={(e) => setStkPhone(e.target.value)} placeholder="07xxxxxxxx" />
            </div>
            <div>
              <Label className="text-xs">Amount (KES)</Label>
              <Input type="number" value={stkAmount} onChange={(e) => setStkAmount(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStkStudent(null)}>Cancel</Button>
            <Button onClick={handleSendStk} disabled={stkLoading}>
              {stkLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Send Prompt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Assign Unmatched Payment */}
      <Dialog open={!!assignTx} onOpenChange={(o) => !o && setAssignTx(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Unmatched M-Pesa Payment</DialogTitle>
            <DialogDescription>
              Transaction {assignTx?.reference} for {ksh(Number(assignTx?.amount || 0))}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Label>Select Student to Credit</Label>
            <Select value={assignStudentId} onValueChange={setAssignStudentId}>
              <SelectTrigger>
                <SelectValue placeholder="Search student..." />
              </SelectTrigger>
              <SelectContent>
                {(students ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.first_name} {s.last_name} ({s.adm_no})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTx(null)}>Cancel</Button>
            <Button onClick={handleAssignSingle} disabled={assigning || !assignStudentId}>
              {assigning ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Confirm Assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Receipt Preview & Print */}
      {receipt && (
        <Dialog open={!!receipt} onOpenChange={() => setReceipt(null)}>
          <DialogContent className="max-w-md print:p-0">
            <div className="p-4 space-y-4">
              <SchoolLetterhead school={school} docType="OFFICIAL FEE RECEIPT" />
              <div className="border-y py-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Receipt No:</span>
                  <span className="font-mono font-bold">{receipt.receiptNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Learner:</span>
                  <span className="font-medium">{receipt.learner} ({receipt.admNo})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Class:</span>
                  <span>{receipt.grade}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount Paid:</span>
                  <span className="font-bold text-emerald-600">{ksh(receipt.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Method / Ref:</span>
                  <span className="uppercase text-xs">{receipt.method} {receipt.reference ? `(${receipt.reference})` : ""}</span>
                </div>
                <div className="flex justify-between font-bold pt-2 border-t">
                  <span>Balance Due:</span>
                  <span className={receipt.balance > 0 ? "text-destructive" : "text-emerald-600"}>
                    {receipt.balance > 0 ? ksh(receipt.balance) : "CLEARED"}
                  </span>
                </div>
              </div>
              <DocFooter school={school} />
            </div>
            <DialogFooter className="print:hidden">
              <Button variant="outline" onClick={() => setReceipt(null)}>Close</Button>
              <Button onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-1" /> Print Receipt
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AppShell>
  );
}
