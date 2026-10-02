import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SCHOOL_MODULES, fetchSchoolAccess } from "@/lib/access";
import { logAudit } from "@/lib/audit";

/** Super admin dialog: switch modules and classes on/off for one school. */
export function SchoolAccessDialog({
  school,
  onClose,
}: {
  school: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [mods, setMods] = useState<Record<string, boolean>>({});
  const [grades, setGrades] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const { data: gradeRows } = useQuery({
    queryKey: ["access-grades", school?.id],
    enabled: !!school,
    queryFn: async () =>
      (
        await supabase
          .from("grades")
          .select("id, name")
          .eq("school_id", school!.id)
          .order("level_order")
      ).data ?? [],
  });

  useEffect(() => {
    if (!school) return;
    void fetchSchoolAccess(school.id).then((a) => {
      setMods(Object.fromEntries(SCHOOL_MODULES.map((m) => [m.key, !a.disabledModules.includes(m.key)])));
      setGrades(Object.fromEntries(a.disabledGrades.map((g) => [g, false])));
    });
  }, [school]);

  async function save() {
    if (!school) return;
    setSaving(true);
    try {
      const m = await supabase.from("school_module_access").upsert(
        SCHOOL_MODULES.map((x) => ({
          school_id: school.id,
          module_key: x.key,
          is_enabled: mods[x.key] !== false,
        })),
        { onConflict: "school_id,module_key" },
      );
      if (m.error) throw m.error;
      const g = await supabase.from("school_grade_access").upsert(
        (gradeRows ?? []).map((x) => ({
          school_id: school.id,
          grade_id: x.id,
          is_enabled: grades[x.id] !== false,
        })),
        { onConflict: "school_id,grade_id" },
      );
      if (g.error) throw g.error;
      logAudit("update_school_access", "schools", school.id);
      toast.success("Access saved.");
      void qc.invalidateQueries({ queryKey: ["school-access"] });
      void qc.invalidateQueries({ queryKey: ["grades"] });
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!school} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>HOI access — {school?.name}</DialogTitle>
          <DialogDescription>
            Ticked modules and classes are available to this school's Head of Institution and teachers.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="modules">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="modules">Modules</TabsTrigger>
            <TabsTrigger value="grades">Classes</TabsTrigger>
          </TabsList>
          <TabsContent value="modules" className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
            {SCHOOL_MODULES.map((m) => (
              <label key={m.key} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                <Checkbox
                  checked={mods[m.key] !== false}
                  onCheckedChange={(v) => setMods((p) => ({ ...p, [m.key]: v === true }))}
                />
                {m.label}
              </label>
            ))}
          </TabsContent>
          <TabsContent value="grades" className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
            {(gradeRows ?? []).map((g) => (
              <label key={g.id} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                <Checkbox
                  checked={grades[g.id] !== false}
                  onCheckedChange={(v) => setGrades((p) => ({ ...p, [g.id]: v === true }))}
                />
                {g.name}
              </label>
            ))}
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null} Save access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
