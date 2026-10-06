import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Loader2,
  Search,
  ShieldCheck,
  KeyRound,
  Ban,
  RotateCcw,
  Trash2,
  School,
  BellRing,
  CheckCheck,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { AppShell, useSession } from "@/components/AppShell";
import { SchoolAccessDialog } from "@/components/SchoolAccessDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  listAllUsers,
  adminSetPassword,
  setUserDisabled,
  updateUserAccount,
  deleteUserAccount,
  setSchoolActive,
  type ManagedUser,
} from "@/lib/user-admin.functions";

export const Route = createFileRoute("/_authenticated/users")({
  component: UsersPage,
});

function UsersPage() {
  const { data: session } = useSession();
  const isSuper = (session?.roles ?? []).includes("superadmin");
  const qc = useQueryClient();

  const callList = useServerFn(listAllUsers);
  const callPassword = useServerFn(adminSetPassword);
  const callDisable = useServerFn(setUserDisabled);
  const callUpdate = useServerFn(updateUserAccount);
  const callDelete = useServerFn(deleteUserAccount);
  const callSchoolActive = useServerFn(setSchoolActive);
  const [accessSchool, setAccessSchool] = useState<{ id: string; name: string } | null>(null);

  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [pwUser, setPwUser] = useState<ManagedUser | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const { data: users, isLoading, error: listError, refetch } = useQuery({
    queryKey: ["all-users"],
    enabled: isSuper,
    queryFn: () => callList({ data: undefined }),
  });

  const { data: schools } = useQuery({
    queryKey: ["schools-admin"],
    enabled: isSuper,
    queryFn: async () =>
      (await supabase.from("schools").select("id, name, school_code, is_active").order("name"))
        .data ?? [],
  });

  const { data: resets } = useQuery({
    queryKey: ["reset-events"],
    enabled: isSuper,
    refetchInterval: 60_000,
    queryFn: async () =>
      (
        await supabase
          .from("password_reset_events")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(40)
      ).data ?? [],
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["all-users"] });
    void qc.invalidateQueries({ queryKey: ["schools-admin"] });
  };

  const setPassword = useMutation({
    mutationFn: async () => {
      if (newPassword.length < 8) throw new Error("Use at least 8 characters.");
      return callPassword({ data: { user_id: pwUser!.id, password: newPassword } });
    },
    onSuccess: () => {
      toast.success(`New password set for ${pwUser?.full_name}.`);
      setPwUser(null);
      setNewPassword("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disable = useMutation({
    mutationFn: (v: { user_id: string; disabled: boolean }) => callDisable({ data: v }),
    onSuccess: () => {
      toast.success("Account updated.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async (form: FormData) =>
      callUpdate({
        data: {
          user_id: editing!.id,
          full_name: String(form.get("full_name") ?? "").trim(),
          username: String(form.get("username") ?? "").trim(),
          phone: String(form.get("phone") ?? "").trim() || null,
          school_id: String(form.get("school_id") ?? "") || null,
          role: String(form.get("role") ?? "") as "hoi" | "teacher" | "student",
        },
      }),
    onSuccess: () => {
      toast.success("Account saved.");
      setEditing(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (user_id: string) => callDelete({ data: { user_id } }),
    onSuccess: () => {
      toast.success("Account deleted.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleSchool = useMutation({
    mutationFn: (v: { school_id: string; is_active: boolean }) => callSchoolActive({ data: v }),
    onSuccess: () => {
      toast.success("School status updated.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const acknowledge = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("password_reset_events")
        .update({ acknowledged: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["reset-events"] }),
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (users ?? []).filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!needle) return true;
      return [u.full_name, u.email, u.username, u.school_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [users, q, roleFilter]);

  const pendingResets = (resets ?? []).filter((r) => !r.acknowledged);

  if (!isSuper) {
    return (
      <AppShell title="Users & Schools">
        <div className="card-nuru p-6">
          <p className="text-sm text-muted-foreground">
            Only the super admin can manage user accounts and schools.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Users & Accounts"
      subtitle="Every account across every connected school"
      actions={
        pendingResets.length ? (
          <Badge className="gap-1 bg-destructive text-destructive-foreground">
            <BellRing className="size-3" /> {pendingResets.length} reset
            {pendingResets.length === 1 ? "" : "s"}
          </Badge>
        ) : null
      }
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card-nuru p-5 lg:col-span-3">
          <h2 className="flex items-center gap-2 font-display font-semibold">
            <ShieldCheck className="size-4 text-primary" /> User directory
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search name, username, email or school"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="superadmin">Super admin</SelectItem>
                <SelectItem value="hoi">Head of Institution</SelectItem>
                <SelectItem value="teacher">Teacher</SelectItem>
                <SelectItem value="student">Student</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Username</th>
                  <th className="py-2 pr-3">School</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">
                      <Loader2 className="mx-auto size-4 animate-spin" />
                    </td>
                  </tr>
                ) : listError ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-destructive">
                      Could not load accounts: {(listError as Error).message}{" "}
                      <Button size="sm" variant="outline" onClick={() => void refetch()}>
                        Try again
                      </Button>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">
                      No accounts match that search.
                    </td>
                  </tr>
                ) : (
                  filtered.map((u) => (
                    <tr key={u.id} className="border-b border-border/60">
                      <td className="py-2 pr-3">
                        <p className="font-medium">{u.full_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{u.username ?? "—"}</td>
                      <td className="py-2 pr-3 text-xs">{u.school_name ?? "—"}</td>
                      <td className="py-2 pr-3">
                        <Badge variant="secondary" className="capitalize">
                          {u.role}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">
                        {u.disabled ? (
                          <Badge variant="destructive">Suspended</Badge>
                        ) : (
                          <Badge className="bg-success text-success-foreground">Active</Badge>
                        )}
                      </td>
                      <td className="py-2">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Set a new password"
                            onClick={() => setPwUser(u)}
                          >
                            <KeyRound className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Edit account"
                            onClick={() => setEditing(u)}
                          >
                            <ShieldCheck className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title={u.disabled ? "Restore" : "Suspend"}
                            disabled={u.role === "superadmin"}
                            onClick={() =>
                              disable.mutate({ user_id: u.id, disabled: !u.disabled })
                            }
                          >
                            {u.disabled ? (
                              <RotateCcw className="size-4" />
                            ) : (
                              <Ban className="size-4" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Delete account"
                            disabled={u.role === "superadmin"}
                            onClick={() => {
                              if (confirm(`Permanently delete ${u.full_name}?`))
                                remove.mutate(u.id);
                            }}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid gap-5 lg:col-span-3 lg:grid-cols-2">
          <section className="card-nuru p-5">
            <h2 className="flex items-center gap-2 font-display font-semibold">
              <School className="size-4 text-primary" /> Schools
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Switch a school off to freeze it without losing any records.
            </p>
            <div className="mt-3 space-y-2">
              {(schools ?? []).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{s.school_code}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setAccessSchool(s)}>
                      Manage HOI Access
                    </Button>
                    <Button
                      size="sm"
                      variant={s.is_active ? "outline" : "default"}
                      disabled={toggleSchool.isPending}
                      onClick={() =>
                        toggleSchool.mutate({ school_id: s.id, is_active: !s.is_active })
                      }
                    >
                      {s.is_active ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </div>
              ))}
              {(schools ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No schools yet.</p>
              ) : null}
            </div>
          </section>

          <section className="card-nuru p-5">
            <h2 className="flex items-center gap-2 font-display font-semibold">
              <BellRing className="size-4 text-primary" /> Password reset alerts
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Every reset requested or completed by any user in any school.
            </p>
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {(resets ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No reset activity yet.</p>
              ) : (
                (resets ?? []).map((r) => (
                  <div
                    key={r.id}
                    className={`rounded-lg border p-2.5 text-sm ${r.acknowledged ? "border-border opacity-60" : "border-primary/40 bg-secondary/40"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.full_name || r.email}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {r.email} · {r.role ?? "unknown role"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {r.stage === "completed" ? "Changed password" : "Requested a reset"} ·{" "}
                          {new Date(r.created_at).toLocaleString("en-KE")}
                        </p>
                      </div>
                      {!r.acknowledged ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Mark as seen"
                          onClick={() => acknowledge.mutate(r.id)}
                        >
                          <CheckCheck className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      <Dialog open={!!pwUser} onOpenChange={(o) => !o && setPwUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New password for {pwUser?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="pw">Password</Label>
            <Input
              id="pw"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
            <p className="text-xs text-muted-foreground">
              The user is asked to change it the next time they sign in.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setPassword.mutate()} disabled={setPassword.isPending}>
              {setPassword.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Set
              password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit account</DialogTitle>
          </DialogHeader>
          {editing ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(new FormData(e.currentTarget));
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="fn">Full name</Label>
                <Input id="fn" name="full_name" defaultValue={editing.full_name} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="un">Username (unique across all schools)</Label>
                <Input id="un" name="username" defaultValue={editing.username ?? ""} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ph">Phone</Label>
                <Input id="ph" name="phone" defaultValue={editing.phone ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sc">School</Label>
                <select
                  id="sc"
                  name="school_id"
                  defaultValue={editing.school_id ?? ""}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">No school</option>
                  {(schools ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              {editing.role !== "superadmin" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="rl">Role</Label>
                  <select
                    id="rl"
                    name="role"
                    defaultValue={editing.role}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="hoi">Head of Institution</option>
                    <option value="teacher">Teacher</option>
                    <option value="student">Student</option>
                  </select>
                </div>
              ) : null}
              <DialogFooter>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Save changes
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
      <SchoolAccessDialog school={accessSchool} onClose={() => setAccessSchool(null)} />
    </AppShell>
  );
}
