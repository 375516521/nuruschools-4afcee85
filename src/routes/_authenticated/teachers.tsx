import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, UserPlus, Star, ShieldCheck, Pencil } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { AppShell, useSession } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createTeacherAccount, updateTeacherAccess } from "@/lib/staff-admin.functions";
import { TEACHER_MODULES, useAllowedGrades, useHoiAccess } from "@/lib/access";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/teachers")({
  component: TeachersPage,
  head: () => ({
    meta: [
      { title: "Teachers & class teachers | Fanisi" },
      { name: "description", content: "Create teacher logins, assign classes, learning areas, modules and class teachers." },
      { property: "og:title", content: "Teachers & class teachers | Fanisi" },
      { property: "og:description", content: "Manage teacher accounts and class teachers for your school." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const NONE = "__none__";

function TeachersPage() {
  const { data: session } = useSession();
  const roles = session?.roles ?? [];
  if (session && !roles.includes("superadmin") && !roles.includes("hoi")) {
    return (
      <AppShell title="Teachers">
        <div className="card-nuru p-5 text-sm text-muted-foreground">
          Only the Head of Institution or super admin can manage teachers.
        </div>
      </AppShell>
    );
  }
  return <TeachersInner />;
}

type Teacher = { id: string; user_id: string | null; full_name: string; email: string | null; phone: string | null; is_active: boolean };

function TeachersInner() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const schoolId = (session?.profile as { school_id?: string } | null)?.school_id ?? null;
  const isSuper = (session?.roles ?? []).includes("superadmin");
  const { data: myAccess } = useHoiAccess(session?.user?.id ?? null);
  const { data: grades } = useAllowedGrades(schoolId, isSuper, myAccess ?? null);
  const callCreate = useServerFn(createTeacherAccount);
  const callUpdate = useServerFn(updateTeacherAccess);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [editGrades, setEditGrades] = useState<string[]>([]);
  const [editSubjects, setEditSubjects] = useState<string[]>([]);
  const [editModules, setEditModules] = useState<string[]>([]);
  const [editActive, setEditActive] = useState(true);
  const update = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("Choose a teacher.");
      return callUpdate({ data: { teacher_id: editing.id, grade_ids: editGrades, subject_ids: editSubjects, modules: editModules, is_active: editActive } });
    },
    onSuccess: () => { toast.success("Teacher assignments saved."); setEditing(null); void qc.invalidateQueries({ queryKey: ["t-list"] }); void qc.invalidateQueries({ queryKey: ["hoi-access"] }); void qc.invalidateQueries({ queryKey: ["signatories"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [tGrades, setTGrades] = useState<string[]>([]);
  const [tSubjects, setTSubjects] = useState<string[]>([]);
  const [tModules, setTModules] = useState<string[]>([]);
  const [ctGrade, setCtGrade] = useState(NONE);
  const [ctStream, setCtStream] = useState(NONE);

  const { data: streams } = useQuery({
    queryKey: ["t-streams", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (await supabase.from("streams").select("id, name, grade_id").eq("school_id", schoolId!).order("name")).data ?? [],
  });
  const { data: subjects } = useQuery({
    queryKey: ["t-subjects", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (await supabase.from("subjects").select("id, name, grade_id").eq("school_id", schoolId!).order("name")).data ?? [],
  });
  const { data: info, error: infoError } = useQuery({
    queryKey: ["t-list", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const [t, ts, acc, ct] = await Promise.all([
        supabase.from("teachers").select("id, user_id, full_name, email, phone, is_active").eq("school_id", schoolId!).order("full_name"),
        supabase.from("teacher_subjects").select("teacher_id, subject_id, grade_id").eq("school_id", schoolId!),
        supabase.from("hoi_access").select("user_id, grade_ids, modules").eq("school_id", schoolId!),
        supabase.from("class_teachers").select("id, grade_id, stream_id, teacher_user_id").eq("school_id", schoolId!),
      ]);
      for (const result of [t, ts, acc, ct]) if (result.error) throw new Error(result.error.message);
      return {
        teachers: (t.data ?? []) as Teacher[],
        links: ts.data ?? [],
        access: acc.data ?? [],
        classTeachers: ct.data ?? [],
      };
    },
  });

  const gName = (id: string) => grades?.find((g) => g.id === id)?.name ?? "";
  const sName = (id: string | null) => (id ? (streams?.find((s) => s.id === id)?.name ?? "") : "");
  const subName = (id: string) => subjects?.find((s) => s.id === id)?.name ?? "";
  const modLabel = (k: string) => TEACHER_MODULES.find((m) => m.key === k)?.label ?? k;
  const visibleSubjects = (subjects ?? []).filter((s) => !s.grade_id || tGrades.includes(s.grade_id));

  const create = useMutation({
    mutationFn: async (form: FormData) => {
      if (!schoolId) throw new Error("Choose a school first.");
      if (tGrades.length === 0) throw new Error("Select at least one class this teacher teaches.");
      if (tSubjects.length === 0) throw new Error("Select at least one learning area.");
      if (tModules.length === 0) throw new Error("Select at least one module this teacher may open.");
      return callCreate({
        data: {
          school_id: schoolId,
          full_name: String(form.get("name") ?? "").trim(),
          email: String(form.get("email") ?? "").trim(),
          username: String(form.get("username") ?? "").trim() || null,
          password: String(form.get("password") ?? ""),
          phone: String(form.get("phone") ?? "").trim() || null,
          tsc_number: String(form.get("tsc") ?? "").trim() || null,
          subject_ids: tSubjects,
          grade_ids: tGrades,
          modules: tModules,
          class_teacher_grade_id: ctGrade === NONE ? null : ctGrade,
          class_teacher_stream_id: ctGrade === NONE || ctStream === NONE ? null : ctStream,
        },
      });
    },
    onSuccess: (r, form) => {
      toast.success(`Login verified. ${r.email} (username ${r.username}) can sign in now.`);
      setTGrades([]);
      setTSubjects([]);
      setTModules([]);
      setCtGrade(NONE);
      setCtStream(NONE);
      void form;
      void qc.invalidateQueries({ queryKey: ["t-list"] });
      void qc.invalidateQueries({ queryKey: ["signatories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setClassTeacher = useMutation({
    mutationFn: async (v: { gradeId: string; streamId: string | null; userId: string | null }) => {
      if (!schoolId) return;
      const existing = (info?.classTeachers ?? []).find(
        (c) => c.grade_id === v.gradeId && (c.stream_id ?? null) === v.streamId,
      );
      if (existing) {
        const { error } = await supabase.from("class_teachers").delete().eq("id", existing.id);
        if (error) throw error;
      }
      if (v.userId) {
        const { error } = await supabase.from("class_teachers").insert({
          school_id: schoolId,
          grade_id: v.gradeId,
          stream_id: v.streamId,
          teacher_user_id: v.userId,
        });
        if (error) throw error;
        // Make sure the class teacher can open their own class.
        const acc = (info?.access ?? []).find((a) => a.user_id === v.userId);
        if (acc && acc.grade_ids.length && !acc.grade_ids.includes(v.gradeId)) {
          await supabase.from("hoi_access").update({ grade_ids: [...acc.grade_ids, v.gradeId] }).eq("user_id", v.userId);
        }
      }
      await logAudit("set_class_teacher", "class_teachers", v.gradeId);
    },
    onSuccess: () => {
      toast.success("Class teacher saved.");
      void qc.invalidateQueries({ queryKey: ["t-list"] });
      void qc.invalidateQueries({ queryKey: ["signatories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Every class (grade + stream, or grade alone when it has no streams).
  const classes = (grades ?? []).flatMap((g) => {
    const st = (streams ?? []).filter((s) => s.grade_id === g.id);
    return st.length
      ? st.map((s) => ({ gradeId: g.id, streamId: s.id as string | null, label: `${g.name} ${s.name}` }))
      : [{ gradeId: g.id, streamId: null as string | null, label: g.name }];
  });
  const teacherUsers = (info?.teachers ?? []).filter((t) => t.user_id && t.is_active);

  function toggle(list: string[], set: (f: (p: string[]) => string[]) => void, id: string, on: boolean) {
    void list;
    set((p) => (on ? [...p, id] : p.filter((x) => x !== id)));
  }

  return (
    <AppShell title="Teachers" subtitle="Teacher logins, classes, learning areas, modules and class teachers">
      {!schoolId ? (
        <div className="card-nuru p-5 text-sm text-muted-foreground">Choose a school first using the school switcher.</div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="card-nuru p-5">
            <h2 className="flex items-center gap-2 font-display font-semibold">
              <UserPlus className="size-4 text-primary" /> Create a teacher
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The login is tested straight away, so the teacher can sign in with their email or username and this password.
            </p>
            <form
              className="mt-3 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate(new FormData(e.currentTarget));
              }}
            >
              <Input name="name" placeholder="Full name" required />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input name="email" type="email" placeholder="Email (login)" required />
                <Input name="username" placeholder="Username (optional)" pattern="[A-Za-z0-9._\-]{3,40}" />
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <Input name="phone" placeholder="Phone" />
                <Input name="tsc" placeholder="TSC number" />
                <Input name="password" minLength={8} placeholder="Temporary password" required />
              </div>

              <Picker title="Classes taught (required)">
                {(grades ?? []).map((g) => (
                  <label key={g.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={tGrades.includes(g.id)} onCheckedChange={(v) => toggle(tGrades, setTGrades, g.id, !!v)} />
                    {g.name}
                  </label>
                ))}
              </Picker>
              <Picker title="Learning areas taught (required)">
                {visibleSubjects.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={tSubjects.includes(s.id)} onCheckedChange={(v) => toggle(tSubjects, setTSubjects, s.id, !!v)} />
                    {s.name}
                    {s.grade_id ? <span className="text-xs text-muted-foreground">({gName(s.grade_id)})</span> : null}
                  </label>
                ))}
                {visibleSubjects.length === 0 ? <p className="text-sm text-muted-foreground">Pick classes first.</p> : null}
              </Picker>
              <Picker title="Modules they may open (required)">
                {TEACHER_MODULES.map((m) => (
                  <label key={m.key} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={tModules.includes(m.key)} onCheckedChange={(v) => toggle(tModules, setTModules, m.key, !!v)} />
                    {m.label}
                  </label>
                ))}
              </Picker>
              <div className="rounded-lg border border-border p-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Class teacher of (optional)</p>
                <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                  <Select value={ctGrade} onValueChange={(v) => { setCtGrade(v); setCtStream(NONE); }}>
                    <SelectTrigger><SelectValue placeholder="Not a class teacher" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Not a class teacher</SelectItem>
                      {(grades ?? []).map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={ctStream} onValueChange={setCtStream} disabled={ctGrade === NONE}>
                    <SelectTrigger><SelectValue placeholder="Whole grade" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Whole grade</SelectItem>
                      {(streams ?? []).filter((s) => s.grade_id === ctGrade).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={create.isPending}>
                {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />} Create teacher login
              </Button>
            </form>
          </section>

          <section className="card-nuru p-5">
            <h2 className="flex items-center gap-2 font-display font-semibold">
              <Star className="size-4 text-primary" /> Class teachers
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A class teacher sees every learning area of their class, can enter marks for all of them, and their name prints on that class&apos;s report forms.
            </p>
            <div className="mt-3 max-h-[560px] space-y-2 overflow-y-auto">
              {classes.map((c) => {
                const cur = (info?.classTeachers ?? []).find(
                  (x) => x.grade_id === c.gradeId && (x.stream_id ?? null) === c.streamId,
                );
                return (
                  <div key={`${c.gradeId}-${c.streamId}`} className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{c.label}</span>
                    <Select
                      value={cur?.teacher_user_id ?? NONE}
                      onValueChange={(v) =>
                        setClassTeacher.mutate({ gradeId: c.gradeId, streamId: c.streamId, userId: v === NONE ? null : v })
                      }
                    >
                      <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>No class teacher</SelectItem>
                        {teacherUsers.map((t) => <SelectItem key={t.id} value={t.user_id ?? NONE}>{t.full_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
              {classes.length === 0 ? <p className="text-sm text-muted-foreground">No classes yet.</p> : null}
            </div>
          </section>

          <section className="card-nuru p-5 lg:col-span-2">
            <h2 className="flex items-center gap-2 font-display font-semibold">
              <ShieldCheck className="size-4 text-primary" /> Teachers in this school
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              To change an existing teacher&apos;s classes or modules, use Settings → Staff &amp; access, or create them again with the same email.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="py-2">Name</th><th>Login</th><th>Class teacher of</th><th>Classes</th><th>Learning areas</th><th>Modules</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {(info?.teachers ?? []).map((t) => {
                    const links = (info?.links ?? []).filter((l) => l.teacher_id === t.id);
                    const acc = (info?.access ?? []).find((a) => a.user_id === t.user_id);
                    const cts = (info?.classTeachers ?? []).filter((c) => c.teacher_user_id === t.user_id);
                    const gIds = Array.from(new Set([...(acc?.grade_ids ?? []), ...links.map((l) => l.grade_id)]));
                    const subIds = Array.from(new Set(links.map((l) => l.subject_id)));
                    return (
                      <tr key={t.id} className="border-t border-border align-top">
                        <td className="py-2 font-medium">{t.full_name}{!t.is_active ? <Badge variant="secondary" className="ml-2">Inactive</Badge> : null}</td>
                        <td className="py-2 text-muted-foreground">{t.email}</td>
                        <td className="py-2">
                          {cts.length ? cts.map((c) => <Badge key={c.id} className="mr-1">{gName(c.grade_id)} {sName(c.stream_id)}</Badge>) : "—"}
                        </td>
                        <td className="py-2">{gIds.map(gName).filter(Boolean).join(", ") || "—"}</td>
                        <td className="py-2">{subIds.map(subName).filter(Boolean).join(", ") || "—"}</td>
                        <td className="py-2">{(acc?.modules ?? []).map(modLabel).join(", ") || "Not assigned"}</td>
                         <td><Button variant="ghost" size="icon" aria-label={`Edit ${t.full_name}`} title="Edit teacher" onClick={() => { setEditing(t); setEditGrades(gIds); setEditSubjects(subIds); setEditModules(acc?.modules ?? []); setEditActive(t.is_active); }}><Pencil className="size-4" /></Button></td>
                      </tr>
                    );
                  })}
                  {(info?.teachers ?? []).length === 0 ? (
                    <tr><td colSpan={7} className="py-4 text-center text-muted-foreground">No teachers yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>Edit {editing?.full_name}</DialogTitle></DialogHeader>
          <Picker title="Classes">{(grades ?? []).map((g) => <label key={g.id} className="flex items-center gap-2 text-sm"><Checkbox checked={editGrades.includes(g.id)} onCheckedChange={(on) => { setEditGrades((p) => on ? [...p, g.id] : p.filter((id) => id !== g.id)); if (!on) setEditSubjects((p) => p.filter((id) => subjects?.find((s) => s.id === id)?.grade_id !== g.id)); }} />{g.name}</label>)}</Picker>
          <Picker title="Learning areas">{(subjects ?? []).filter((s) => !s.grade_id || editGrades.includes(s.grade_id)).map((s) => <label key={s.id} className="flex items-center gap-2 text-sm"><Checkbox checked={editSubjects.includes(s.id)} onCheckedChange={(on) => setEditSubjects((p) => on ? [...p, s.id] : p.filter((id) => id !== s.id))} />{s.name} {s.grade_id ? `(${gName(s.grade_id)})` : ""}</label>)}</Picker>
          <Picker title="Modules">{TEACHER_MODULES.map((m) => <label key={m.key} className="flex items-center gap-2 text-sm"><Checkbox checked={editModules.includes(m.key)} onCheckedChange={(on) => setEditModules((p) => on ? [...p, m.key] : p.filter((id) => id !== m.key))} />{m.label}</label>)}</Picker>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={editActive} onCheckedChange={(on) => setEditActive(on === true)} />Account active</label>
          <Button disabled={update.isPending} onClick={() => update.mutate()}>{update.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Save teacher</Button>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Picker({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-lg border border-border p-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="grid grid-cols-2 gap-1.5">{children}</div>
    </div>
  );
}
