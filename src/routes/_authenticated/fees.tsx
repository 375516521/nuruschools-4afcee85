import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { AppShell, useSession, useActiveTerm } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ksh } from "@/lib/nuru";

export const Route = createFileRoute("/_authenticated/fees")({
  component: FeesPage,
});

const METHODS = ["mpesa", "cash", "bank", "cheque", "waiver"] as const;

function FeesPage() {
  const { data: session } = useSession();
  const schoolId = (session?.profile as { school_id?: string } | null)?.school_id ?? null;
  const { data: term } = useActiveTerm(schoolId);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [method, setMethod] = useState<string>("mpesa");

  const { data: students } = useQuery({
    queryKey: ["fee-students", schoolId],
    enabled: !!schoolId,
    queryFn: async () => (await supabase.from("students").select("id, adm_no, first_name, last_name, grade_id").eq("school_id", schoolId!).eq("status", "active").order("adm_no")).data ?? [],
  });

  const { data: structures } = useQuery({
    queryKey: ["fee-structures", schoolId, term?.id],
    enabled: !!schoolId && !!term,
    queryFn: async () => (await supabase.from("fee_structures").select("*").eq("school_id", schoolId!).eq("term_id", term!.id)).data ?? [],
  });

  const { data: payments } = useQuery({
    queryKey: ["fee-payments", schoolId, term?.id],
    enabled: !!schoolId && !!term,
    queryFn: async () => (await supabase.from("fee_payments").select("*").eq("school_id", schoolId!).eq("term_id", term!.id).order("paid_at", { ascending: false })).data ?? [],
  });

  const billedFor = (grade_id: string | null) =>
    (structures ?? []).filter((f) => f.grade_id === grade_id).reduce((a, f) => a + Number(f.amount), 0);
  const paidFor = (id: string) =>
    (payments ?? []).filter((p) => p.student_id === id).reduce((a, p) => a + Number(p.amount), 0);

  const record = useMutation({
    mutationFn: async (form: FormData) => {
      const amount = Number(form.get("amount"));
      if (!studentId) throw new Error("Select a learner.");
      if (!term) throw new Error("No active term is set.");
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount greater than zero.");
      const { error } = await supabase.from("fee_payments").insert({
        school_id: schoolId!, term_id: term.id, student_id: studentId, amount,
        method: method as "mpesa",
        reference: String(form.get("reference") ?? "").trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment recorded — balance updated.");
      setOpen(false); setStudentId("");
      void qc.invalidateQueries({ queryKey: ["fee-payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalCollected = (payments ?? []).reduce((a, p) => a + Number(p.amount), 0);

  const { data: grades } = useQuery({
    queryKey: ["grades", schoolId],
    enabled: !!schoolId,
    queryFn: async () => (await supabase.from("grades").select("id, name").eq("school_id", schoolId!).order("level_order")).data ?? [],
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
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount greater than zero.");
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
      setStructOpen(false); setStructGrade("");
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
        <Dialog open={structOpen} onOpenChange={setStructOpen}>
          <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="size-4" /> Fee structure</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a fee item</DialogTitle>
              <DialogDescription>Billed to every learner in the chosen grade for the active term.</DialogDescription>
            </DialogHeader>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); addStructure.mutate(new FormData(e.currentTarget)); }}>
              <div className="space-y-1.5">
                <Label>Grade</Label>
                <Select value={structGrade} onValueChange={setStructGrade}>
                  <SelectTrigger><SelectValue placeholder="Select grade" /></SelectTrigger>
                  <SelectContent>
                    {(grades ?? []).map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="item">Item</Label><Input id="item" name="item" placeholder="Tuition" required /></div>
                <div className="space-y-1.5"><Label htmlFor="samt">Amount (KSh)</Label><Input id="samt" name="amount" type="number" min={1} required /></div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={addStructure.isPending}>
                  {addStructure.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add item
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="size-4" /> Record payment</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record a fee payment</DialogTitle>
              <DialogDescription>Balances and the parent portal update immediately.</DialogDescription>
            </DialogHeader>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); record.mutate(new FormData(e.currentTarget)); }}>
              <div className="space-y-1.5">
                <Label>Learner</Label>
                <Select value={studentId} onValueChange={setStudentId}>
                  <SelectTrigger><SelectValue placeholder="Select learner" /></SelectTrigger>
                  <SelectContent>
                    {(students ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.adm_no} — {s.first_name} {s.last_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="amt">Amount (KSh)</Label><Input id="amt" name="amount" type="number" min={1} required /></div>
                <div className="space-y-1.5">
                  <Label>Method</Label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="ref">Reference</Label><Input id="ref" name="reference" placeholder="MPESA code or receipt no." /></div>
              <DialogFooter>
                <Button type="submit" disabled={record.isPending}>
                  {record.isPending ? <Loader2 className="size-4 animate-spin" /> : <Receipt className="size-4" />} Record payment
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {(students ?? []).map((s) => {
              const billed = billedFor(s.grade_id);
              const paid = paidFor(s.id);
              const bal = billed - paid;
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.adm_no}</TableCell>
                  <TableCell className="font-medium">{s.first_name} {s.last_name}</TableCell>
                  <TableCell className="text-right">{ksh(billed)}</TableCell>
                  <TableCell className="text-right">{ksh(paid)}</TableCell>
                  <TableCell className="text-right font-medium">{ksh(bal)}</TableCell>
                  <TableCell>
                    <Badge variant={bal <= 0 ? "default" : "destructive"}>{bal <= 0 ? "Cleared" : "Owing"}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </AppShell>
  );
}
