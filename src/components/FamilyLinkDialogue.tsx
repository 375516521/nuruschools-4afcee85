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
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Users, Link2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: {
    id: string;
    adm_no: string;
    full_name: string;
    grade: string;
    parent_phone: string;
    family_id?: string | null;
    school_id: string;
  };
  onLinked: () => void;
}

export function FamilyLinkDialog({ open, onOpenChange, student, onLinked }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([student.id]);
  const [existingFamilyCode, setExistingFamilyCode] = useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setSelectedIds([student.id]);
    autoSuggestSiblings();
  }, [open, student.id]);

  async function autoSuggestSiblings() {
    setLoading(true);
    try {
      if (student.family_id) {
        const { data: fam } = await supabase
          .from("families")
          .select("family_code")
          .eq("id", student.family_id)
          .maybeSingle();
        if (fam) setExistingFamilyCode(fam.family_code);
      } else {
        setExistingFamilyCode(null);
      }

      if (student.parent_phone) {
        const clean = student.parent_phone.replace(/\D/g, "").slice(-9);
        const { data: siblings } = await supabase
          .from("students")
          .select("id, adm_no, full_name, grade, parent_phone, family_id")
          .eq("school_id", student.school_id)
          .ilike("parent_phone", `%${clean}%`)
          .neq("id", student.id);

        if (siblings && siblings.length > 0) {
          setSearchResults(siblings);
          setSelectedIds((prev) => [...prev, ...siblings.map((s) => s.id)]);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch() {
    if (!searchTerm.trim()) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from("students")
        .select("id, adm_no, full_name, grade, parent_phone, family_id")
        .eq("school_id", student.school_id)
        .or(`adm_no.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%,parent_phone.ilike.%${searchTerm}%`)
        .neq("id", student.id)
        .limit(10);

      setSearchResults(data || []);
    } finally {
      setLoading(false);
    }
  }

  async function saveFamilyLink() {
    setLoading(true);
    try {
      let familyId = student.family_id;

      if (!familyId) {
        const { data: countData } = await supabase
          .from("families")
          .select("id", { count: "exact" })
          .eq("school_id", student.school_id);

        const nextNum = (countData?.length || 0) + 1;
        const code = `FAM${String(nextNum).padStart(3, "0")}`;

        const { data: newFam, error: famErr } = await supabase
          .from("families")
          .insert({
            school_id: student.school_id,
            family_code: code,
            primary_parent_name: student.full_name + " Parent",
            primary_parent_phone: student.parent_phone,
          })
          .select()
          .single();

        if (famErr || !newFam) throw new Error(famErr?.message || "Failed to create family group");
        familyId = newFam.id;
      }

      const { error: updateErr } = await supabase
        .from("students")
        .update({ family_id: familyId })
        .in("id", selectedIds);

      if (updateErr) throw new Error(updateErr.message);

      toast.success("Family group linked successfully!");
      onLinked();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to link family");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Link Family Group
          </DialogTitle>
          <DialogDescription>
            Group siblings under one account for unified fee statements, family WhatsApp reminders, and auto-debt settlement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="p-3 bg-muted/60 rounded-lg text-sm border">
            <p className="font-semibold text-foreground">{student.full_name}</p>
            <p className="text-xs text-muted-foreground">ADM: {student.adm_no} • Grade: {student.grade} • Phone: {student.parent_phone || "No phone"}</p>
            {existingFamilyCode && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 mt-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Assigned Code: {existingFamilyCode}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Search sibling by ADM, Name, or Phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button size="icon" variant="outline" onClick={handleSearch} disabled={loading}>
              <Search className="w-4 h-4" />
            </Button>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-2 border rounded-lg p-2">
            {searchResults.length === 0 ? (
              <p className="text-xs text-center text-muted-foreground py-4">
                No sibling matches found yet. Try searching above.
              </p>
            ) : (
              searchResults.map((s) => {
                const isSelected = selectedIds.includes(s.id);
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-2 rounded hover:bg-muted/50 text-sm cursor-pointer border"
                    onClick={() => {
                      setSelectedIds((prev) =>
                        isSelected ? prev.filter((id) => id !== s.id) : [...prev, s.id],
                      );
                    }}
                  >
                    <div>
                      <p className="font-medium">{s.full_name}</p>
                      <p className="text-xs text-muted-foreground">ADM: {s.adm_no} • {s.grade}</p>
                    </div>
                    <Checkbox checked={isSelected} />
                  </div>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={saveFamilyLink} disabled={loading || selectedIds.length === 0}>
            <Link2 className="w-4 h-4 mr-2" />
            Save Family Group ({selectedIds.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
