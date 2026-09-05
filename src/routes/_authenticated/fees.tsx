import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Loader2, Receipt, Printer, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { AppShell, useSession, useActiveTerm } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { ksh, NURU } from "@/lib/nuru";
import { SchoolLetterhead, DocFooter, type SchoolInfo } from "@/components/SchoolLetterhead";

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
  const { data: term } = useActiveTerm(schoolId);
  const qc = useQueryClient();
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
          .select(
            "id, adm_no, first_name, last_name, grade_id, guardian_name, guardian_phone, grades(name), streams(name)",
          )
          .eq("school_id", schoolId!)
          .eq("status", "active")
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

  const billedFor = (grade_id: string | null) =>
    (structures ?? [])
      .filter((f) => f.grade_id === grade_id)
      .reduce((a, f) => a + Number(f.amount), 0);
  const paidFor = (id: string) =>
    (payments ?? []).filter((p) => p.student_id === id).reduce((a, p) => a + Number(p.amount), 0);

  const termLabel = term
    ? `${(term as { academic_years?: { year?: number } }).academic_years?.year} Term ${term.term_number}`
    : "";

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
      `Dear Parent/Guardian, ${s.first_name} ${s.last_name} (Adm ${s.adm_no}, ${gradeLabel(s)}) has an outstanding fee balance of ${ksh(balance)} for ${termLabel}. Kindly clear to unlock results and the ID card. — ${school?.name ?? NURU.name}`,
    );
    return phone ? `https://wa.me/${phone}?text=${text}` : null;
  }

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkIndex, setBulkIndex] = useState(0);
  const [bulkGrade, setBulkGrade] = useState("all");

  const record = useMutation({
    mutationFn: async (form: FormData) => {
      const amount = Number(form.get("amount"));
      if (!studentId) throw new Error("Select a learner.");
      if (!term) throw new Error("No active term is set.");
      if (!Number.isFinite(amount) || amount <= 0)
        throw new Error("Enter an amount greater than zero.");
      const { data, error } = await supabase
        .from("fee_payments")
        .insert({
          school_id: schoolId!,
          term_id: term.id,
          student_id: studentId,
          amount,
          method: method as "mpesa",
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
        const balance = billedFor(s.grade_id) - (paidFor(s.id) + Number(p.amount));
        setReceipt({
          learner: `${s.first_name} ${s.last_name}`,
          admNo: s.adm_no,
          grade: gradeLabel(s),
          amount: Number(p.amount),
          method: p.method,
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

  const totalCollected = (payments ?? []).reduce((a, p) => a + Number(p.amount), 0);

  const owing = (students ?? [])
    .map((s) => ({ s, balance: billedFor(s.grade_id) - paidFor(s.id) }))
    .filter((r) => r.balance > 0);
  const owingInScope = owing.filter((r) => bulkGrade === "all" || r.s.grade_id === bulkGrade);
  const owingWithPhone = owingInScope.filter(
    (r) => (r.s.guardian_phone ?? "").replace(/\D/g, "").length >= 9,
  );

  function sendNextReminder() {
    const target = owingWithPhone[bulkIndex];
    if (!target) return;
    const link = reminderLink(target.s, target.balance);
    if (link) window.open(link, "_blank", "noopener");
    setBulkIndex((i) => i + 1);
  }

  const { data: grades } = useQuery({
    queryKey: ["grades", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (
        await supabase
          .from("grades")
          .select("id, name")
          .eq("school_id", schoolId!)
          .order("level_order")
      ).data ?? [],
  });

  const [structOpen, setStructOpen] = useState(false);
  const [structGrade, setStructGrade] = useState("");

  const addStructure = useMutation({
    mutationFn: async (form: FormData) => {
      const item = String(form.get("item") ?? "").trim();
      const amount = Number(form.get("amount"));
      if (!term) throw new Error("No active term is set.");
      if (!structGrade) throw new Error("Choose a grade.");
      if (!item) throw new Error("Name the fee item.");
      if (!Number.isFinite(amount) || amount <= 0)
        throw new Error("Enter an amount greater than zero.");
      const { error } = await supabase.from("fee_structures").insert({
        school_id: schoolId!,
        term_id: term.id,
        academic_year_id: (term as { academic_years: { id: string } }).academic_years.id,
        grade_id: structGrade,
        item,
        amount,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fee item added to the structure.");
      setStructOpen(false);
      setStructGrade("");
      void qc.invalidateQueries({ queryKey: ["fee-structures"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell
      title="Fees"
      subtitle={term ? `${ksh(totalCollected)} collected this term` : "No active term"}
      actions={
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setBulkIndex(0);
              setBulkOpen(true);
            }}
            disabled={owing.length === 0}
          >
            <Send className="size-4" /> Remind all ({owing.length})
          </Button>
          <Dialog open={structOpen} onOpenChange={setStructOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="size-4" /> Fee structure
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a fee item</DialogTitle>
                <DialogDescription>
                  Billed to every learner in the chosen grade for the active term.
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  addStructure.mutate(new FormData(e.currentTarget));
                }}
              >
                <div className="space-y-1.5">
                  <Label>Grade</Label>
                  <Select value={structGrade} onValueChange={setStructGrade}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select grade" />
                    </SelectTrigger>
                    <SelectContent>
                      {(grades ?? []).map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="item">Item</Label>
                    <Input id="item" name="item" placeholder="Tuition" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="samt">Amount (KSh)</Label>
                    <Input id="samt" name="amount" type="number" min={1} required />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={addStructure.isPending}>
                    {addStructure.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}{" "}
                    Add item
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" /> Record payment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record a fee payment</DialogTitle>
                <DialogDescription>
                  Balances and the parent portal update immediately.
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  record.mutate(new FormData(e.currentTarget));
                }}
              >
                <div className="space-y-1.5">
                  <Label>Learner</Label>
                  <Select value={studentId} onValueChange={setStudentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select learner" />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="p-1">
                        <Input
                          autoFocus
                          value={learnerQuery}
                          onChange={(e) => setLearnerQuery(e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                          placeholder="Search by name or admission no."
                          className="h-8"
                        />
                      </div>
                      {learnerOptions.length === 0 ? (
                        <p className="px-3 py-4 text-sm text-muted-foreground">
                          No learner matches “{learnerQuery}”.
                        </p>
                      ) : (
                        learnerOptions.slice(0, 60).map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.adm_no} — {s.first_name} {s.last_name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="amt">Amount (KSh)</Label>
                    <Input id="amt" name="amount" type="number" min={1} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Method</Label>
                    <Select value={method} onValueChange={setMethod}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ref">Reference</Label>
                  <Input id="ref" name="reference" placeholder="MPESA code or receipt no." />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={record.isPending}>
                    {record.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Receipt className="size-4" />
                    )}{" "}
                    Record payment
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </>
      }
    >
      <div className="card-nuru overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Admission No</TableHead>
              <TableHead>Learner</TableHead>
              <TableHead className="text-right">Billed</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Parent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(students ?? []).map((s) => {
              const billed = billedFor(s.grade_id);
              const paid = paidFor(s.id);
              const bal = billed - paid;
              const link = bal > 0 ? reminderLink(s, bal) : null;
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.adm_no}</TableCell>
                  <TableCell className="font-medium">
                    {s.first_name} {s.last_name}
                  </TableCell>
                  <TableCell className="text-right">{ksh(billed)}</TableCell>
                  <TableCell className="text-right">{ksh(paid)}</TableCell>
                  <TableCell className="text-right font-medium">{ksh(bal)}</TableCell>
                  <TableCell>
                    <Badge variant={bal <= 0 ? "default" : "destructive"}>
                      {bal <= 0 ? "Cleared" : "Owing"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {link ? (
                      <Button asChild size="sm" variant="outline">
                        <a href={link} target="_blank" rel="noreferrer">
                          <MessageCircle className="size-4" /> Remind
                        </a>
                      </Button>
                    ) : bal > 0 ? (
                      <span className="text-xs text-muted-foreground">No phone</span>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="card-nuru mt-5 overflow-x-auto">
        <div className="border-b border-border p-4">
          <p className="font-display text-sm font-semibold">Payments this term</p>
          <p className="text-xs text-muted-foreground">Reprint any receipt at any time.</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Learner</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Receipt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(payments ?? []).map((p) => {
              const s = (students ?? []).find((x) => x.id === p.student_id);
              return (
                <TableRow key={p.id}>
                  <TableCell className="text-xs">
                    {new Date(p.paid_at).toLocaleDateString("en-KE")}
                  </TableCell>
                  <TableCell className="font-medium">
                    {s ? `${s.first_name} ${s.last_name}` : "—"}
                  </TableCell>
                  <TableCell className="uppercase text-xs">{p.method}</TableCell>
                  <TableCell className="font-mono text-xs">{p.reference ?? "—"}</TableCell>
                  <TableCell className="text-right">{ksh(Number(p.amount))}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setReceipt({
                          learner: s ? `${s.first_name} ${s.last_name}` : "—",
                          admNo: s?.adm_no ?? "—",
                          grade: gradeLabel(s),
                          amount: Number(p.amount),
                          method: p.method,
                          reference: p.reference,
                          paidAt: p.paid_at,
                          balance: s ? billedFor(s.grade_id) - paidFor(s.id) : 0,
                          receiptNo: p.id.slice(0, 8).toUpperCase(),
                        })
                      }
                    >
                      <Receipt className="size-4" /> Receipt
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remind parents with a balance</DialogTitle>
            <DialogDescription>
              {owingWithPhone.length} of {owingInScope.length} owing learners have a guardian phone
              number. Each tap opens a ready-written WhatsApp message naming the learner and their
              grade — keep tapping to work through the list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Who to remind</Label>
            <Select
              value={bulkGrade}
              onValueChange={(v) => {
                setBulkGrade(v);
                setBulkIndex(0);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Whole school ({owing.length} owing)</SelectItem>
                {(grades ?? []).map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name} ({owing.filter((r) => r.s.grade_id === g.id).length} owing)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="max-h-64 space-y-1.5 overflow-y-auto text-sm">
            {owingWithPhone.map((r, i) => (
              <div
                key={r.s.id}
                className={`flex justify-between gap-3 rounded-md px-2 py-1.5 ${i < bulkIndex ? "bg-secondary/60 text-muted-foreground line-through" : i === bulkIndex ? "bg-secondary" : ""}`}
              >
                <span className="font-medium">
                  {r.s.first_name} {r.s.last_name}
                </span>
                <span>{ksh(r.balance)}</span>
              </div>
            ))}
            {owingWithPhone.length === 0 ? (
              <p className="text-muted-foreground">No owing learner has a guardian phone saved.</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button onClick={sendNextReminder} disabled={bulkIndex >= owingWithPhone.length}>
              <MessageCircle className="size-4" />{" "}
              {bulkIndex >= owingWithPhone.length
                ? "All reminders sent"
                : `Send reminder ${bulkIndex + 1} of ${owingWithPhone.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!receipt} onOpenChange={(v) => !v && setReceipt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fee receipt</DialogTitle>
            <DialogDescription>Print or save as PDF for the parent.</DialogDescription>
          </DialogHeader>
          {receipt ? (
            <div className="print-sheet rounded-lg border border-border p-5 text-sm">
              <SchoolLetterhead
                school={school}
                documentTitle="Official fee receipt"
                meta={termLabel}
              />
              <div className="mt-4 grid gap-1.5">
                <Row k="Receipt No" v={receipt.receiptNo} />
                <Row k="Date" v={new Date(receipt.paidAt).toLocaleString("en-KE")} />
                <Row k="Learner" v={receipt.learner} />
                <Row k="Admission No" v={receipt.admNo} />
                <Row k="Grade" v={receipt.grade} />
                <Row k="Method" v={receipt.method.toUpperCase()} />
                <Row k="Reference" v={receipt.reference ?? "—"} />
                <Row k="Amount paid" v={ksh(receipt.amount)} />
                <Row k="Balance" v={ksh(receipt.balance)} />
              </div>
              <div className="mt-6 flex items-end justify-between text-[11px] text-muted-foreground">
                <span>
                  Served by: {(session?.profile as { full_name?: string } | null)?.full_name ?? "—"}
                </span>
                <span className="border-t border-border pt-1">Bursar / Authorised signature</span>
              </div>
              <DocFooter note="Computer generated receipt" />
            </div>
          ) : null}
          <DialogFooter className="no-print">
            <Button onClick={() => window.print()}>
              <Printer className="size-4" /> Print / Save as PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-dashed border-border py-1">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
