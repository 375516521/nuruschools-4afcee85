import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Plus,
  Loader2,
  Search,
  MoreHorizontal,
  Pencil,
  Archive,
  UserX,
  UserCheck,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { onlyEnabledGrades } from "@/lib/access";
import { AppShell, useSession } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { LearnerImport } from "@/components/LearnerImport";
import { logAudit } from "@/lib/audit";
import { fileToDataUrl } from "@/lib/image-upload";

export const Route = createFileRoute("/_authenticated/students")({
  component: StudentsPage,
});

const STATUSES = [
  "all",
  "active",
  "deactivated",
  "graduated",
  "archived",
  "transferred_out",
] as const;

type LearnerStatus = "active" | "archived" | "deactivated" | "graduated" | "transferred_out";

const learnerSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(60),
  last_name: z.string().trim().min(1, "Last name is required").max(60),
  gender: z.string().nullable(),
  grade_id: z.string().uuid("Select a grade"),
  stream_id: z.string().uuid().nullable(),
  guardian_name: z.string().trim().max(80).nullable(),
  guardian_phone: z.string().trim().max(20).nullable(),
});

type Learner = {
  id: string;
  adm_no: string;
  student_id: string | null;
  first_name: string;
  last_name: string;
  gender: string | null;
  grade_id: string | null;
  stream_id: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  photo_url: string | null;
  status: LearnerStatus;
  family_id?: string | null;
  families?: { fam_no?: string } | null;
  grades?: { name?: string } | null;
  streams?: { name?: string } | null;
};

function StudentsPage() {
  const { data: session } = useSession();
  const schoolId = (session?.profile as { school_id?: string } | null)?.school_id ?? null;
  const roles = session?.roles ?? [];
  const isSuper = roles.includes("superadmin");
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("active");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [addGradeId, setAddGradeId] = useState<string>("");
  const [streamId, setStreamId] = useState<string>("");

  const [editing, setEditing] = useState<Learner | null>(null);
  const [editGrade, setEditGrade] = useState("");
  const [editPhoto, setEditPhoto] = useState("");
  const [editStream, setEditStream] = useState("");

  const [transferring, setTransferring] = useState<Learner | null>(null);
  const [deleting, setDeleting] = useState<Learner | null>(null);
  const [familyTarget, setFamilyTarget] = useState<Learner | null>(null);

  const { data: grades } = useQuery({
    queryKey: ["grades", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      onlyEnabledGrades(schoolId!, (await supabase.from("grades").select("*").eq("school_id", schoolId!).order("level_order")).data ?? []),
  });

  const { data: streams } = useQuery({
    queryKey: ["streams", addGradeId],
    enabled: !!addGradeId,
    queryFn: async () =>
      (await supabase.from("streams").select("*").eq("grade_id", addGradeId).order("name")).data ?? [],
  });

  const { data: editStreams } = useQuery({
    queryKey: ["streams", editGrade],
    enabled: !!editGrade,
    queryFn: async () =>
      (await supabase.from("streams").select("*").eq("grade_id", editGrade).order("name")).data ?? [],
  });

  const { data: allStreams } = useQuery({
    queryKey: ["streams", "all"],
    enabled: !!schoolId,
    queryFn: async () =>
      (await supabase.from("streams").select("*").order("name")).data ?? [],
  });

  const { data: students, isLoading } = useQuery({
    queryKey: ["students", schoolId, status],
    enabled: !!schoolId,
    queryFn: async () => {
      let query = supabase
        .from("students")
        .select("*, grades(name), streams(name), families(fam_no)")
        .eq("school_id", schoolId!)
        .order("adm_no");
      if (status !== "all") query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as Learner[];
    },
  });

  const create = useMutation({
    mutationFn: async (form: FormData) => {
      const parsed = learnerSchema.safeParse({
        first_name: form.get("first_name"),
        last_name: form.get("last_name"),
        gender: form.get("gender") || null,
        grade_id: addGradeId,
        stream_id: streamId || null,
        guardian_name: form.get("guardian_name") || null,
        guardian_phone: form.get("guardian_phone") || null,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]!.message);
      const { error } = await supabase
        .from("students")
        .insert({ ...parsed.data, adm_no: "", school_id: schoolId! });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Learner admitted — admission number and student ID generated.");
      setOpen(false);
      setAddGradeId("");
      setStreamId("");
      void qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (form: FormData) => {
      if (!editing) return;
      const parsed = learnerSchema.safeParse({
        first_name: form.get("first_name"),
        last_name: form.get("last_name"),
        gender: form.get("gender") || null,
        grade_id: editGrade,
        stream_id: editStream || null,
        guardian_name: form.get("guardian_name") || null,
        guardian_phone: form.get("guardian_phone") || null,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]!.message);
      const { error } = await supabase
        .from("students")
        .update({ ...parsed.data, photo_url: editPhoto || null })
        .eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Learner details updated.");
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatusFor = useMutation({
    mutationFn: async ({
      learner,
      next,
      reason,
    }: {
      learner: Learner;
      next: LearnerStatus;
      reason?: string;
    }) => {
      const { error } = await supabase.from("students").update({ status: next }).eq("id", learner.id);
      if (error) throw error;
      await logAudit(`status_${next}`, "students", learner.id, {
        previous: learner.status,
        reason: reason ?? null,
      });
    },
    onSuccess: (_, vars) => {
      toast.success(`Learner marked as ${vars.next}.`);
      void qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const transfer = useMutation({
    mutationFn: async (form: FormData) => {
      if (!transferring) return;
      const dest = String(form.get("destination") ?? "").trim();
      const reason = String(form.get("reason") ?? "").trim();
      const feeCleared = form.get("fee_cleared") === "on";
      if (!dest) throw new Error("Destination school is required.");
      const { error: insErr } = await supabase.from("transfers").insert({
        school_id: schoolId!,
        student_id: transferring.id,
        transfer_type: "outgoing",
        destination: dest,
        reason: reason || null,
        fee_cleared: feeCleared,
      });
      if (insErr) throw insErr;
      const { error: updErr } = await supabase
        .from("students")
        .update({ status: "transferred_out" })
        .eq("id", transferring.id);
      if (updErr) throw updErr;
      await logAudit("transfer_out", "students", transferring.id, { destination: dest, feeCleared });
    },
    onSuccess: () => {
      toast.success("Transfer recorded. Learner status updated.");
      setTransferring(null);
      void qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const destroy = useMutation({
    mutationFn: async (learner: Learner) => {
      const { error } = await supabase.from("students").delete().eq("id", learner.id);
      if (error) throw error;
      await logAudit("delete_student_permanent", "students", learner.id, { adm_no: learner.adm_no });
    },
    onSuccess: () => {
      toast.success("Learner permanently removed.");
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openEdit(l: Learner) {
    setEditing(l);
    setEditGrade(l.grade_id ?? "");
    setEditStream(l.stream_id ?? "");
    setEditPhoto(l.photo_url ?? "");
  }

  const filtered = (students ?? []).filter((s) => {
    const term = q.trim().toLowerCase();
    if (!term) return true;
    return (
      s.first_name.toLowerCase().includes(term) ||
      s.last_name.toLowerCase().includes(term) ||
      s.adm_no.toLowerCase().includes(term) ||
      (s.student_id ?? "").toLowerCase().includes(term)
    );
  });

  return (
    <AppShell
      title="Learners"
      subtitle={`${students?.length ?? 0} total enrolled`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {schoolId && <LearnerImport schoolId={schoolId} grades={grades ?? []} streams={allStreams ?? []} />}
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setAddGradeId(""); setStreamId(""); } }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4 mr-1" /> Add learner
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Admit new learner</DialogTitle>
                <DialogDescription>
                  Admission number and CBE student ID will be assigned automatically.
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  create.mutate(new FormData(e.currentTarget));
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="fn">First name</Label>
                    <Input id="fn" name="first_name" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ln">Last name</Label>
                    <Input id="ln" name="last_name" required />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Grade</Label>
                    <Select value={addGradeId} onValueChange={(v) => { setAddGradeId(v); setStreamId(""); }}>
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
                  <div className="space-y-1.5">
                    <Label>Stream</Label>
                    <Select value={streamId} onValueChange={setStreamId} disabled={!addGradeId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select stream" />
                      </SelectTrigger>
                      <SelectContent>
                        {(streams ?? []).map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="gender">Gender</Label>
                    <select
                      id="gender"
                      name="gender"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Not stated</option>
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                    </select>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="gn">Guardian name</Label>
                    <Input id="gn" name="guardian_name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="gp">Guardian phone</Label>
                    <Input id="gp" name="guardian_phone" placeholder="0712345678" />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={create.isPending}>
                    {create.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : null} Admit learner
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, admission no or student ID"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Admission No</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Family Group</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Guardian Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No learners match this filter.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs font-medium">{s.adm_no}</TableCell>
                  <TableCell className="font-medium">
                    {s.first_name} {s.last_name}
                  </TableCell>
                  <TableCell>
                    {s.families?.fam_no ? (
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">
                        Family: {s.families.fam_no}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {s.grades?.name ?? "—"}
                    {s.streams?.name ? ` ${s.streams.name}` : ""}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.guardian_phone ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={s.status === "active" ? "default" : "secondary"}>{s.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" aria-label={`Actions for ${s.first_name} ${s.last_name}`}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setFamilyTarget(s)}>
                          <Users className="size-4 mr-2" /> Link as Family
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => openEdit(s)}>
                          <Pencil className="size-4 mr-2" /> Edit details
                        </DropdownMenuItem>
                        {s.status === "active" ? (
                          <DropdownMenuItem
                            onClick={() =>
                              setStatusFor.mutate({
                                learner: s,
                                next: "deactivated",
                                reason: "Deactivated by school",
                              })
                            }
                          >
                            <UserX className="size-4 mr-2" /> Deactivate
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => setStatusFor.mutate({ learner: s, next: "active" })}>
                            <UserCheck className="size-4 mr-2" /> Reactivate
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() =>
                            setStatusFor.mutate({
                              learner: s,
                              next: "archived",
                              reason: "Archived by school",
                            })
                          }
                        >
                          <Archive className="size-4 mr-2" /> Archive
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setTransferring(s)}>
                          <Send className="size-4 mr-2" /> Transfer out
                        </DropdownMenuItem>
                        {isSuper ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleting(s)}
                            >
                              <Trash2 className="size-4 mr-2" /> Delete permanently
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit learner</DialogTitle>
            <DialogDescription>
              {editing
                ? `${editing.adm_no}${editing.student_id ? ` · ${editing.student_id}` : ""} — identifiers are permanent.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <form
              key={editing.id}
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                update.mutate(new FormData(e.currentTarget));
              }}
            >
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                {editPhoto ? (
                  <img src={editPhoto} alt="Learner photo" className="size-16 rounded-lg border border-border object-cover" />
                ) : (
                  <div className="grid size-16 place-items-center rounded-lg border border-border bg-secondary font-display text-base font-bold text-primary">
                    {editing.first_name[0]}
                    {editing.last_name[0]}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="ephoto">Learner photo</Label>
                  <Input
                    id="ephoto"
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        setEditPhoto(await fileToDataUrl(file, 360));
                        toast.success("Photo ready — save changes to keep it.");
                      } catch (err) {
                        toast.error((err as Error).message);
                      }
                    }}
                  />
                  {editPhoto ? (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditPhoto("")}>
                      Remove photo
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="efn">First name</Label>
                  <Input id="efn" name="first_name" defaultValue={editing.first_name} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="eln">Last name</Label>
                  <Input id="eln" name="last_name" defaultValue={editing.last_name} required />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Grade</Label>
                  <Select
                    value={editGrade}
                    onValueChange={(v) => {
                      setEditGrade(v);
                      setEditStream("");
                    }}
                  >
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
                <div className="space-y-1.5">
                  <Label>Stream</Label>
                  <Select value={editStream} onValueChange={setEditStream} disabled={!editGrade}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select stream" />
                    </SelectTrigger>
                    <SelectContent>
                      {(editStreams ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="egender">Gender</Label>
                  <select
                    id="egender"
                    name="gender"
                    defaultValue={editing.gender ?? ""}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Not stated</option>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="egn">Guardian name</Label>
                  <Input id="egn" name="guardian_name" defaultValue={editing.guardian_name ?? ""} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="egp">Guardian phone</Label>
                  <Input id="egp" name="guardian_phone" defaultValue={editing.guardian_phone ?? ""} />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={update.isPending}>
                  {update.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : <Pencil className="size-4 mr-1" />} Save changes
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!transferring} onOpenChange={(v) => !v && setTransferring(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer learner out</DialogTitle>
            <DialogDescription>
              {transferring ? `${transferring.first_name} ${transferring.last_name} · ${transferring.adm_no}` : ""}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              transfer.mutate(new FormData(e.currentTarget));
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="dest">Receiving school</Label>
              <Input id="dest" name="destination" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="treason">Reason</Label>
              <Input id="treason" name="reason" placeholder="Relocation" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="fee_cleared" className="size-4 accent-[var(--color-primary)]" /> Fees fully cleared
            </label>
            <DialogFooter>
              <Button type="submit" disabled={transfer.isPending}>
                {transfer.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : <Send className="size-4 mr-1" />} Record transfer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete learner permanently?</DialogTitle>
            <DialogDescription>
              {deleting
                ? `${deleting.first_name} ${deleting.last_name} (${deleting.adm_no}) and all linked marks, fees and transfers will be removed.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={destroy.isPending} onClick={() => deleting && destroy.mutate(deleting)}>
              {destroy.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : <Trash2 className="size-4 mr-1" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {familyTarget && schoolId && (
        <FamilyModal
          open={!!familyTarget}
          onOpenChange={(v) => !v && setFamilyTarget(null)}
          schoolId={schoolId}
          student={familyTarget}
          onSuccess={() => void qc.invalidateQueries({ queryKey: ["students"] })}
        />
      )}
    </AppShell>
  );
}

function FamilyModal({
  open,
  onOpenChange,
  schoolId,
  student,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  student: Learner;
  onSuccess: () => void;
}) {
  const [search, setSearch] = useState(student.guardian_phone || "");
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const q = search.trim();
      let query = supabase
        .from("students")
        .select("id, adm_no, first_name, last_name, guardian_phone, family_id, families(fam_no)")
        .eq("school_id", schoolId)
        .neq("id", student.id)
        .eq("status", "active")
        .limit(20);
      if (q) {
        query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,adm_no.ilike.%${q}%,guardian_phone.ilike.%${q}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      setCandidates(data || []);
      if (student.guardian_phone) {
        const matches = (data || [])
          .filter((s: any) => s.guardian_phone && s.guardian_phone === student.guardian_phone)
          .map((s: any) => s.id);
        setSelectedIds(matches);
      }
    } catch {
      toast.error("Error searching learners");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (selectedIds.length === 0) {
      toast.error("Select at least one sibling to link.");
      return;
    }
    setSaving(true);
    try {
      let targetFamilyId = student.family_id;
      if (!targetFamilyId) {
        const siblingWithFamily = candidates.find((c) => selectedIds.includes(c.id) && c.family_id);
        if (siblingWithFamily) {
          targetFamilyId = siblingWithFamily.family_id;
        }
      }
      if (!targetFamilyId) {
        const { data: newFam, error: famErr } = await supabase
          .from("families")
          .insert({
            school_id: schoolId,
            primary_phone: student.guardian_phone || null,
            fam_no: "",
          })
          .select("id, fam_no")
          .single();
        if (famErr) throw famErr;
        targetFamilyId = newFam.id;
      }
      const allStudentIds = [student.id, ...selectedIds];
      const { error: updErr } = await supabase
        .from("students")
        .update({ family_id: targetFamilyId })
        .in("id", allStudentIds);
      if (updErr) throw updErr;
      toast.success("Family linked successfully!");
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to link family");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Link Family for {student.first_name} {student.last_name}
          </DialogTitle>
          <DialogDescription>
            Search siblings by admission number, name, or guardian phone to group them under one family account.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex gap-2">
            <Input
              placeholder="Search phone, name, or ADM..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button variant="outline" onClick={handleSearch} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>
          <div className="space-y-1.5 max-h-56 overflow-y-auto border rounded-md p-2">
            {candidates.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                Click the search icon above to find potential siblings.
              </p>
            ) : (
              candidates.map((c) => (
                <label key={c.id} className="flex items-center justify-between p-2 rounded hover:bg-muted cursor-pointer text-sm">
                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      checked={selectedIds.includes(c.id)}
                      onCheckedChange={(checked) => {
                        setSelectedIds((prev) =>
                          checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)
                        );
                      }}
                    />
                    <div>
                      <p className="font-medium text-xs">
                        {c.first_name} {c.last_name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Adm: {c.adm_no} · Phone: {c.guardian_phone || "N/A"}
                      </p>
                    </div>
                  </div>
                  {c.families?.fam_no && (
                    <Badge variant="outline" className="text-[10px]">
                      {c.families.fam_no}
                    </Badge>
                  )}
                </label>
              ))
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || selectedIds.length === 0}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Link Siblings ({selectedIds.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
