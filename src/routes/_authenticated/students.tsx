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
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { AppShell, useSession } from "@/components/AppShell";
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
  status: string;
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
  const [gradeId, setGradeId] = useState<string>("");
  const [streamId, setStreamId] = useState<string>("");

  const [editing, setEditing] = useState<Learner | null>(null);
  const [editGrade, setEditGrade] = useState("");
  const [editPhoto, setEditPhoto] = useState("");
  const [editStream, setEditStream] = useState("");

  const [transferring, setTransferring] = useState<Learner | null>(null);
  const [deleting, setDeleting] = useState<Learner | null>(null);

  const { data: grades } = useQuery({
    queryKey: ["grades", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (await supabase.from("grades").select("*").eq("school_id", schoolId!).order("level_order"))
        .data ?? [],
  });

  const { data: streams } = useQuery({
    queryKey: ["streams", gradeId],
    enabled: !!gradeId,
    queryFn: async () =>
      (await supabase.from("streams").select("*").eq("grade_id", gradeId).order("name")).data ?? [],
  });

  const { data: editStreams } = useQuery({
    queryKey: ["streams", editGrade],
    enabled: !!editGrade,
    queryFn: async () =>
      (await supabase.from("streams").select("*").eq("grade_id", editGrade).order("name")).data ??
      [],
  });

  const { data: allStreams } = useQuery({
    queryKey: ["all-streams", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (await supabase.from("streams").select("id, name, grade_id").eq("school_id", schoolId!)).data ??
      [],
  });

  const { data: students, isLoading } = useQuery({
    queryKey: ["students", schoolId, status],
    enabled: !!schoolId,
    queryFn: async () => {
      let query = supabase
        .from("students")
        .select("*, grades(name), streams(name)")
        .eq("school_id", schoolId!)
        .order("adm_no");
      if (status !== "all") query = query.eq("status", status as "active");
      return ((await query).data ?? []) as unknown as Learner[];
    },
  });

  const create = useMutation({
    mutationFn: async (form: FormData) => {
      const parsed = learnerSchema.safeParse({
        first_name: form.get("first_name"),
        last_name: form.get("last_name"),
        gender: form.get("gender") || null,
        grade_id: gradeId,
        stream_id: streamId || null,
        guardian_name: form.get("guardian_name") || null,
        guardian_phone: form.get("guardian_phone") || null,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]!.message);
      // adm_no and student_id are generated by the database trigger when left empty.
      const { error } = await supabase
        .from("students")
        .insert({ ...parsed.data, adm_no: "", school_id: schoolId! });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Learner admitted — admission number and student ID generated.");
      setOpen(false);
      setGradeId("");
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
      next: string;
      reason?: string;
    }) => {
      const { error } = await supabase
        .from("students")
        .update({ status: next as "active", status_reason: reason ?? null })
        .eq("id", learner.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      logAudit(`learner_status_${v.next}`, "students", v.learner.id);
      toast.success("Learner status updated.");
      void qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const transfer = useMutation({
    mutationFn: async (form: FormData) => {
      if (!transferring) return;
      const destination = String(form.get("destination") ?? "").trim();
      const reason = String(form.get("reason") ?? "").trim() || null;
      if (!destination) throw new Error("Enter the receiving school.");
      const { error } = await supabase.from("transfers").insert({
        school_id: schoolId!,
        student_id: transferring.id,
        transfer_type: "out",
        destination,
        reason,
        fee_cleared: form.get("fee_cleared") === "on",
      });
      if (error) throw error;
      const { error: sErr } = await supabase
        .from("students")
        .update({ status: "transferred_out", status_reason: `Transferred to ${destination}` })
        .eq("id", transferring.id);
      if (sErr) throw sErr;
    },
    onSuccess: () => {
      logAudit("learner_transferred_out", "students", transferring?.id);
      toast.success("Transfer recorded — learner marked transferred out.");
      setTransferring(null);
      void qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const destroy = useMutation({
    mutationFn: async (learner: Learner) => {
      const { error } = await supabase.from("students").delete().eq("id", learner.id);
      if (error) throw error;
    },
    onSuccess: () => {
      logAudit("learner_deleted", "students", deleting?.id);
      toast.success("Learner permanently deleted.");
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = (students ?? []).filter((s) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return `${s.first_name} ${s.last_name} ${s.adm_no} ${s.student_id ?? ""}`
      .toLowerCase()
      .includes(t);
  });

  function openEdit(s: Learner) {
    setEditing(s);
    setEditGrade(s.grade_id ?? "");
    setEditStream(s.stream_id ?? "");
    setEditPhoto(s.photo_url ?? "");
  }


  return (
    <AppShell
      title="Learners"
      subtitle={`${filtered.length} shown`}
      actions={
        <>
        <LearnerImport schoolId={schoolId} grades={grades ?? []} streams={allStreams ?? []} />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="size-4" /> Admit learner
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Admit a new learner</DialogTitle>
              <DialogDescription>
                The admission number and student ID are generated automatically and cannot be
                edited.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate(new FormData(e.currentTarget));
              }}
              className="space-y-3"
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
                  <Select
                    value={gradeId}
                    onValueChange={(v) => {
                      setGradeId(v);
                      setStreamId("");
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
                  <Select value={streamId} onValueChange={setStreamId} disabled={!gradeId}>
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
                    defaultValue=""
                  >
                    <option value="">Not stated</option>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
                </div>
                <div />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="gn">Guardian name</Label>
                  <Input id="gn" name="guardian_name" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gp">Guardian phone</Label>
                  <Input id="gp" name="guardian_phone" placeholder="0722000111" />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Admit
                  learner
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, admission no or student ID"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
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

      <div className="card-nuru overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Admission No</TableHead>
              <TableHead>Student ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Guardian</TableHead>
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
                  <TableCell className="font-mono text-xs">{s.student_id ?? "—"}</TableCell>
                  <TableCell className="font-medium">
                    {s.first_name} {s.last_name}
                  </TableCell>
                  <TableCell>
                    {s.grades?.name ?? "—"}
                    {s.streams?.name ? ` ${s.streams.name}` : ""}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {s.guardian_phone ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.status === "active" ? "default" : "secondary"}>
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Actions for ${s.first_name} ${s.last_name}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(s)}>
                          <Pencil className="size-4" /> Edit details
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
                            <UserX className="size-4" /> Deactivate
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => setStatusFor.mutate({ learner: s, next: "active" })}
                          >
                            <UserCheck className="size-4" /> Reactivate
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
                          <Archive className="size-4" /> Archive
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setTransferring(s)}>
                          <Send className="size-4" /> Transfer out
                        </DropdownMenuItem>
                        {isSuper ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleting(s)}
                            >
                              <Trash2 className="size-4" /> Delete permanently
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

      {/* Edit learner */}
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
                  <img
                    src={editPhoto}
                    alt="Learner photo"
                    className="size-16 rounded-lg border border-border object-cover"
                  />
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
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditPhoto("")}
                    >
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
                <div />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="egn">Guardian name</Label>
                  <Input id="egn" name="guardian_name" defaultValue={editing.guardian_name ?? ""} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="egp">Guardian phone</Label>
                  <Input
                    id="egp"
                    name="guardian_phone"
                    defaultValue={editing.guardian_phone ?? ""}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={update.isPending}>
                  {update.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Pencil className="size-4" />
                  )}{" "}
                  Save changes
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Transfer out */}
      <Dialog open={!!transferring} onOpenChange={(v) => !v && setTransferring(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer learner out</DialogTitle>
            <DialogDescription>
              {transferring
                ? `${transferring.first_name} ${transferring.last_name} · ${transferring.adm_no}`
                : ""}
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
              <input
                type="checkbox"
                name="fee_cleared"
                className="size-4 accent-[var(--color-primary)]"
              />{" "}
              Fees fully cleared
            </label>
            <DialogFooter>
              <Button type="submit" disabled={transfer.isPending}>
                {transfer.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}{" "}
                Record transfer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete (super admin only) */}
      <Dialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete learner permanently?</DialogTitle>
            <DialogDescription>
              {deleting
                ? `${deleting.first_name} ${deleting.last_name} (${deleting.adm_no}) and all linked marks, fees and transfers will be removed. This cannot be undone.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={destroy.isPending}
              onClick={() => deleting && destroy.mutate(deleting)}
            >
              {destroy.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}{" "}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
