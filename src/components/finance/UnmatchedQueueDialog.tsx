import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { assignUnmatchedTransaction } from "@/lib/finance.functions";
import { splitManualPayment } from "@/lib/family.functions";
import { toast } from "sonner";
import { Split, Check } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: {
    id: string;
    phone: string;
    amount: number;
    account_reference: string;
    mpesa_receipt_number?: string;
  } | null;
  schoolId: string;
  termId: string;
  students: Array<{ id: string; adm_no: string; first_name: string; last_name: string; grade: string }>;
  onResolved: () => void;
}

export function UnmatchedQueueDialog({ open, onOpenChange, transaction, schoolId, termId, students, onResolved }: Props) {
  const [mode, setMode] = useState<"assign" | "split">("assign");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [splits, setSplits] = useState<Array<{ student_id: string; amount: number }>>([]);
  const [loading, setLoading] = useState(false);

  if (!transaction) return null;

  function addSplitChild(studentId: string) {
    if (!studentId || splits.some((s) => s.student_id === studentId)) return;
    setSplits([...splits, { student_id: studentId, amount: 0 }]);
  }

  function updateSplitAmount(index: number, val: number) {
    const updated = [...splits];
    updated[index].amount = val;
    setSplits(updated);
  }

  const totalAllocated = splits.reduce((sum, s) => sum + (s.amount || 0), 0);
  const remaining = (transaction?.amount ?? 0) - totalAllocated;

  async function handleAssign() {
    if (!selectedStudentId) {
      toast.error("Please pick a student to assign this payment.");
      return;
    }
    setLoading(true);
    try {
      const res = await assignUnmatchedTransaction({
        data: {
          transaction_id: transaction.id,
          student_id: selectedStudentId,
          school_id: schoolId,
          term_id: termId,
        },
      });
      if ("error" in res && res.error) throw new Error(res.error);
      toast.success("Payment matched and credited successfully!");
      onResolved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Could not match payment");
    } finally {
      setLoading(false);
    }
  }

  async function handleSplit() {
    if (splits.length === 0) {
      toast.error("Add at least one student to split between.");
      return;
    }
    if (remaining !== 0) {
      toast.error(`The split sum must equal KES ${(transaction?.amount ?? 0).toLocaleString()}. Current difference: KES ${remaining.toLocaleString()}`);
      return;
    }

    setLoading(true);
    try {
      const res = await splitManualPayment({
        data: {
          school_id: schoolId,
          term_id: termId,
          transaction_id: transaction.id,
          allocations: splits,
        },
      });
      if ("error" in res && res.error) throw new Error(res.error);
      toast.success("Payment split and ledger entries recorded!");
      onResolved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Could not split payment");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Resolve Unmatched M-Pesa Payment</DialogTitle>
          <DialogDescription>
            Reference: <span className="font-semibold text-foreground">{transaction?.mpesa_receipt_number || transaction?.account_reference}</span> • Phone: {transaction?.phone} • Amount: <span className="font-bold text-emerald-600">KES {(transaction?.amount ?? 0).toLocaleString()}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex border rounded-lg p-1 my-2 bg-muted/40">
          <button
            type="button"
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md ${mode === "assign" ? "bg-background shadow-xs text-foreground" : "text-muted-foreground"}`}
            onClick={() => setMode("assign")}
          >
            Assign to One Student
          </button>
          <button
            type="button"
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md ${mode === "split" ? "bg-background shadow-xs text-foreground" : "text-muted-foreground"}`}
            onClick={() => setMode("split")}
          >
            Split Across Siblings
          </button>
        </div>

        {mode === "assign" ? (
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">Select Student</Label>
              <select
                className="w-full mt-1.5 p-2 rounded-md border text-sm bg-background"
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
              >
                <option value="">-- Choose Learner --</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.first_name} {s.last_name} ({s.adm_no}) - {s.grade}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">Add Sibling to Allocation</Label>
              <select
                className="w-full mt-1.5 p-2 rounded-md border text-sm bg-background"
                onChange={(e) => {
                  addSplitChild(e.target.value);
                  e.target.value = "";
                }}
              >
                <option value="">-- Pick Sibling --</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.first_name} {s.last_name} ({s.adm_no})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 border rounded-lg p-2 max-h-48 overflow-y-auto">
              {splits.map((item, idx) => {
                const child = students.find((s) => s.id === item.student_id);
                return (
                  <div key={item.student_id} className="flex items-center gap-2 p-2 border rounded-md">
                    <div className="flex-1 text-xs">
                      <p className="font-semibold">{child?.first_name} {child?.last_name}</p>
                      <p className="text-muted-foreground">ADM: {child?.adm_no}</p>
                    </div>
                    <div className="w-32">
                      <Input
                        type="number"
                        placeholder="Amount"
                        value={item.amount || ""}
                        onChange={(e) => updateSplitAmount(idx, Number(e.target.value))}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between items-center text-xs p-2 bg-muted/50 rounded-md">
              <span>Total: <strong>KES {(transaction?.amount ?? 0).toLocaleString()}</strong></span>
              <span className={remaining === 0 ? "text-emerald-600 font-bold" : "text-amber-600 font-bold"}>
                {remaining === 0 ? "Fully Allocated" : `Remaining: KES ${remaining.toLocaleString()}`}
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          {mode === "assign" ? (
            <Button onClick={handleAssign} disabled={loading || !selectedStudentId}>
              <Check className="w-4 h-4 mr-1.5" /> Confirm Match
            </Button>
          ) : (
            <Button onClick={handleSplit} disabled={loading || remaining !== 0 || splits.length === 0}>
              <Split className="w-4 h-4 mr-1.5" /> Apply Split
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
