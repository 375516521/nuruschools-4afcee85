import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  Plus,
  School,
  CalendarRange,
  CheckCircle2,
  UserPlus,
  BookOpen,
  Trash2,
  PenLine,
  Users,
  Layers,
  ShieldCheck,
  Smartphone,
  MessageCircle,
  Copy,
  Check,
  Bell,
  Key,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { onlyEnabledGrades } from "@/lib/access";
import { AppShell, useSession, useActiveTerm } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KARLI } from "@/lib/karli";
import { createHoiAccount } from "@/lib/school-admin.functions";
import { updateStaffAccess } from "@/lib/staff-admin.functions";
import { TEACHER_MODULES } from "@/lib/access";
import { fileToDataUrl } from "@/lib/image-upload";
import { Checkbox } from "@/components/ui/checkbox";

/** Module keys must match ROUTE_MODULE in src/lib/access.ts. */
const MODULES = TEACHER_MODULES.map((m) => m.key);
const moduleLabel = (k: string) => TEACHER_MODULES.find((m) => m.key === k)?.label ?? k;

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

const GRADE_PLAN: { name: string; band: "pre_primary" | "primary" | "junior" | "senior" }[] = [
  { name: "PP1", band: "pre_primary" },
  { name: "PP2", band: "pre_primary" },
  { name: "Grade 1", band: "primary" },
  { name: "Grade 2", band: "primary" },
  { name: "Grade 3", band: "primary" },
  { name: "Grade 4", band: "primary" },
  { name: "Grade 5", band: "primary" },
  { name: "Grade 6", band: "primary" },
  { name: "Grade 7", band: "junior" },
  { name: "Grade 8", band: "junior" },
  { name: "Grade 9", band: "junior" },
  { name: "Grade 10", band: "senior" },
  { name: "Grade 11", band: "senior" },
  { name: "Grade 12", band: "senior" },
];

function SettingsPage() {
  const { data: s0 } = useSession();
  const r0 = s0?.roles ?? [];
  if (s0 && !r0.includes("superadmin") && !r0.includes("hoi")) {
    return (
      <AppShell title="Settings">
        <div className="card-karli p-5 text-sm text-muted-foreground">
          Only the Head of Institution or super admin can open Settings.
        </div>
      </AppShell>
    );
  }
  return <SettingsInner />;
}

function SettingsInner() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const profile = session?.profile as {
    id?: string;
    school_id?: string;
    full_name?: string;
  } | null;
  const schoolId = profile?.school_id ?? null;
  const school = session?.school as {
    id?: string;
    name?: string;
    school_code?: string;
    county?: string | null;
    phone?: string | null;
    email?: string | null;
    logo_url?: string | null;
    uli_code?: string | null;
  } | null;
  const roles = session?.roles ?? [];
  const isSuper = roles.includes("superadmin");
  const isAdmin = isSuper || roles.includes("hoi");
  const { data: term } = useActiveTerm(schoolId);
  const [pick, setPick] = useState("");
  const [examGrade, setExamGrade] = useState("");
  const [hoiSchool, setHoiSchool] = useState("");
  const [subjectGrade, setSubjectGrade] = useState("all");
  const callCreateHoi = useServerFn(createHoiAccount);
  const [logoData, setLogoData] = useState<string | null>(null);
  const [sigData, setSigData] = useState<string | null>(null);
  const [streamGrade, setStreamGrade] = useState("");
  const [accessUser, setAccessUser] = useState("");
  const [accessGrades, setAccessGrades] = useState<string[]>([]);
  const [accessModules, setAccessModules] = useState<string[]>([]);
  const [copiedCallback, setCopiedCallback] = useState(false);

  const { data: schools } = useQuery({
    queryKey: ["all-schools"],
    enabled: isSuper,
    queryFn: async () =>
      (await supabase.from("schools").select("id, name, school_code").order("name")).data ?? [],
  });

  const attach = useMutation({
    mutationFn: async (id?: string) => {
      const target = id ?? pick;
      if (!target) throw new Error("Choose a school first.");
      const { error } = await supabase
        .from("profiles")
        .update({ school_id: target })
        .eq("id", profile!.id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("School linked to your account.");
      void qc.invalidateQueries({ queryKey: ["session-profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createSchool = useMutation({
    mutationFn: async (form: FormData) => {
      const name = String(form.get("name") ?? "").trim();
      const code = String(form.get("code") ?? "")
        .trim()
        .toUpperCase();
      const county = String(form.get("county") ?? "").trim() || null;
      const year = Number(form.get("year") ?? new Date().getFullYear());
      if (!name || !code) throw new Error("Enter the school name and code.");
      if (!Number.isFinite(year)) throw new Error("Enter a valid year.");

      const { data: created, error } = await supabase
        .from("schools")
        .insert({ name, school_code: code, county })
        .select("id")
        .single();
      if (error) throw error;
      const sid = created.id;

      const { data: gradeRows, error: gErr } = await supabase
        .from("grades")
        .insert(
          GRADE_PLAN.map((g, i) => ({
            school_id: sid,
            name: g.name,
            band: g.band,
            level_order: i + 1,
          })),
        )
        .select("id, name");
      if (gErr) throw gErr;

      const { error: sErr } = await supabase
        .from("streams")
        .insert((gradeRows ?? []).map((g) => ({ school_id: sid, grade_id: g.id, name: "A" })));
      if (sErr) throw sErr;

      const { data: ay, error: ayErr } = await supabase
        .from("academic_years")
        .insert({ school_id: sid, year, is_active: true })
        .select("id")
        .single();
      if (ayErr) throw ayErr;

      const { error: tErr } = await supabase.from("terms").insert(
        [1, 2, 3].map((n) => ({
          school_id: sid,
          academic_year_id: ay.id,
          term_number: n,
          is_active: n === 1,
        })),
      );
      if (tErr) throw tErr;

      return sid;
    },
    onSuccess: async (sid) => {
      toast.success("School created with grades, streams and an academic year.");
      await attach.mutateAsync(sid);
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: years } = useQuery({
    queryKey: ["academic-years", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (
        await supabase
          .from("academic_years")
          .select("id, year, is_active")
          .eq("school_id", schoolId!)
          .order("year", { ascending: false })
      ).data ?? [],
  });

  const { data: terms } = useQuery({
    queryKey: ["all-terms", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (
        await supabase
          .from("terms")
          .select("id, term_number, is_active, academic_year_id")
          .eq("school_id", schoolId!)
          .order("term_number")
      ).data ?? [],
  });

  const addYear = useMutation({
    mutationFn: async (form: FormData) => {
      const year = Number(form.get("year"));
      if (!Number.isFinite(year) || year < 2000) throw new Error("Enter a valid year.");
      const { data: ay, error } = await supabase
        .from("academic_years")
        .insert({ school_id: schoolId!, year, is_active: false })
        .select("id")
        .single();
      if (error) throw error;
      const { error: tErr } = await supabase.from("terms").insert(
        [1, 2, 3].map((n) => ({
          school_id: schoolId!,
          academic_year_id: ay.id,
          term_number: n,
          is_active: false,
        })),
      );
      if (tErr) throw tErr;
    },
    onSuccess: () => {
      toast.success("Academic year added with three terms.");
      void qc.invalidateQueries({ queryKey: ["academic-years"] });
      void qc.invalidateQueries({ queryKey: ["all-terms"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activate = useMutation({
    mutationFn: async (t: { id: string; academic_year_id: string }) => {
      await supabase
        .from("terms")
        .update({ is_active: false })
        .eq("school_id", schoolId!)
        .neq("id", t.id);
      await supabase
        .from("academic_years")
        .update({ is_active: false })
        .eq("school_id", schoolId!)
        .neq("id", t.academic_year_id);
      const { error } = await supabase.from("terms").update({ is_active: true }).eq("id", t.id);
      if (error) throw error;
      await supabase
        .from("academic_years")
        .update({ is_active: true })
        .eq("id", t.academic_year_id);
    },
    onSuccess: () => {
      toast.success("Active term updated.");
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: grades } = useQuery({
    queryKey: ["grades", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      onlyEnabledGrades(
        schoolId!,
        (
          await supabase
            .from("grades")
            .select("id, name")
            .eq("school_id", schoolId!)
            .order("level_order")
        ).data ?? [],
      ),
  });

  const createExam = useMutation({
    mutationFn: async (form: FormData) => {
      const name = String(form.get("name") ?? "").trim();
      if (!name) throw new Error("Enter an exam name.");
      if (!term) throw new Error("No active term is set.");
      if (!examGrade) throw new Error("Choose the grade this exam is for.");
      const { error } = await supabase.from("exams").insert({
        school_id: schoolId!,
        term_id: term.id,
        academic_year_id: term.academic_years.id,
        grade_id: examGrade,
        name,
        max_score: Math.max(1, Number(form.get("max_score") ?? 100) || 100),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Exam created.");
      void qc.invalidateQueries({ queryKey: ["exams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- HOI accounts -------------------------------------------------------
  const createHoi = useMutation({
    mutationFn: async (form: FormData) => {
      if (!hoiSchool) throw new Error("Choose the school this HOI will run.");
      const res = await callCreateHoi({
        data: {
          school_id: hoiSchool,
          full_name: String(form.get("hoi_name") ?? "").trim(),
          email: String(form.get("hoi_email") ?? "").trim(),
          password: String(form.get("hoi_password") ?? ""),
          phone: String(form.get("hoi_phone") ?? "").trim() || null,
        },
      });
      return res;
    },
    onSuccess: (r) => {
      toast.success(`HOI login ready for ${r.email}. Share the credentials with them.`);
      void qc.invalidateQueries({ queryKey: ["school-staff"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: staff } = useQuery({
    queryKey: ["school-staff", hoiSchool || schoolId],
    enabled: !!(hoiSchool || schoolId),
    queryFn: async () =>
      (
        await supabase
          .from("profiles")
          .select("id, full_name, email, phone")
          .eq("school_id", (hoiSchool || schoolId)!)
          .order("full_name")
      ).data ?? [],
  });

  // ---- School profile -----------------------------------------------------
  const saveSchool = useMutation({
    mutationFn: async (form: FormData) => {
      if (!schoolId) throw new Error("No school linked to your account.");
      const { error } = await supabase
        .from("schools")
        .update({
          name: String(form.get("s_name") ?? "").trim(),
          county: String(form.get("s_county") ?? "").trim() || null,
          phone: String(form.get("s_phone") ?? "").trim() || null,
          email: String(form.get("s_email") ?? "").trim() || null,
          logo_url: logoData ?? school?.logo_url ?? null,
          uli_code: String(form.get("s_uli") ?? "").trim() || null,
        })
        .eq("id", schoolId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("School profile updated — documents now use it.");
      void qc.invalidateQueries({ queryKey: ["session-profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- Subjects -----------------------------------------------------------
  const { data: subjects } = useQuery({
    queryKey: ["subjects", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (
        await supabase
          .from("subjects")
          .select("id, name, code, grade_id, grades(name)")
          .eq("school_id", schoolId!)
          .order("name")
      ).data ?? [],
  });

  const addSubject = useMutation({
    mutationFn: async (form: FormData) => {
      const name = String(form.get("sub_name") ?? "").trim();
      const code =
        String(form.get("sub_code") ?? "")
          .trim()
          .toUpperCase() || null;
      if (!name) throw new Error("Enter the learning area name.");
      const { error } = await supabase.from("subjects").insert({
        school_id: schoolId!,
        name,
        code,
        grade_id: subjectGrade === "all" ? null : subjectGrade,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Learning area added.");
      void qc.invalidateQueries({ queryKey: ["subjects"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeSubject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subjects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Learning area removed.");
      void qc.invalidateQueries({ queryKey: ["subjects"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- My signature -------------------------------------------------------
  const { data: myProfile } = useQuery({
    queryKey: ["my-signature", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () =>
      (await supabase.from("profiles").select("signature_url").eq("id", profile!.id!).maybeSingle())
        .data,
  });

  // Keep preview in sync with saved signature. Without this sigData stays null on reload.
  useEffect(() => {
    if (myProfile?.signature_url) setSigData(myProfile.signature_url);
  }, [myProfile?.signature_url]);

  const saveSignature = useMutation({
    mutationFn: async () => {
      if (!sigData) throw new Error("Choose a signature image first.");
      const { error } = await supabase
        .from("profiles")
        .update({ signature_url: sigData })
        .eq("id", profile!.id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Signature saved — it now prints on report cards and merit lists.");
      void qc.invalidateQueries({ queryKey: ["my-signature"] });
      void qc.invalidateQueries({ queryKey: ["signatories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- Streams ------------------------------------------------------------
  const { data: streams } = useQuery({
    queryKey: ["settings-streams", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (
        await supabase
          .from("streams")
          .select("id, name, grade_id, grades(name)")
          .eq("school_id", schoolId!)
          .order("name")
      ).data ?? [],
  });

  const addStream = useMutation({
    mutationFn: async (form: FormData) => {
      const name = String(form.get("stream_name") ?? "").trim();
      if (!streamGrade) throw new Error("Choose the grade this stream belongs to.");
      if (!name) throw new Error("Enter the stream name, e.g. North or Blue.");
      const { error } = await supabase
        .from("streams")
        .insert({ school_id: schoolId!, grade_id: streamGrade, name });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stream added.");
      void qc.invalidateQueries({ queryKey: ["settings-streams"] });
      void qc.invalidateQueries({ queryKey: ["all-streams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeStream = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("streams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stream removed.");
      void qc.invalidateQueries({ queryKey: ["settings-streams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- HOI access (super admin) -------------------------------------------
  const { data: hoiPeople } = useQuery({
    queryKey: ["access-people", hoiSchool || schoolId, isSuper],
    enabled: isAdmin && !!(hoiSchool || schoolId),
    queryFn: async () => {
      const target = (hoiSchool || schoolId)!;
      const wanted = (isSuper ? ["hoi", "teacher"] : ["teacher"]) as ("hoi" | "teacher")[];
      const roleRows = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", wanted)
        .eq("school_id", target);
      const rows = roleRows.data ?? [];
      if (rows.length === 0) return [];
      const people =
        (
          await supabase
            .from("profiles")
            .select("id, full_name, email")
            .in(
              "id",
              rows.map((r) => r.user_id),
            )
        ).data ?? [];
      return people.map((p) => ({
        ...p,
        role: rows.find((r) => r.user_id === p.id)?.role ?? "",
      }));
    },
  });

  /** Load whatever access is already saved for the person being edited. */
  useQuery({
    queryKey: ["access-existing", accessUser],
    enabled: !!accessUser,
    queryFn: async () => {
      const { data } = await supabase
        .from("hoi_access")
        .select("grade_ids, modules")
        .eq("user_id", accessUser)
        .maybeSingle();
      setAccessGrades((data?.grade_ids as string[] | null) ?? []);
      setAccessModules((data?.modules as string[] | null) ?? []);
      return data ?? null;
    },
  });

  const callStaffAccess = useServerFn(updateStaffAccess);
  const saveAccess = useMutation({
    mutationFn: async () => {
      const target = (hoiSchool || schoolId)!;
      if (!accessUser) throw new Error("Choose the staff member first.");
      if (accessGrades.length === 0) throw new Error("Select at least one grade for this member of staff.");
      if (accessModules.length === 0) throw new Error("Select at least one module for this member of staff.");
      return callStaffAccess({
        data: { user_id: accessUser, school_id: target, grade_ids: accessGrades, modules: accessModules },
      });
    },
    onSuccess: () => {
      toast.success("Access rules saved.");
      void qc.invalidateQueries({ queryKey: ["hoi-access"] });
      void qc.invalidateQueries({ queryKey: ["access-people"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- M-Pesa & WhatsApp Gateways (Karlisoft Phase 1) ----------------------
  const { data: gatewaySettings, isLoading: loadingGateway } = useQuery({
    queryKey: ["school-gateway-settings", schoolId],
    enabled: !!schoolId && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_gateway_settings")
        .select("*")
        .eq("school_id", schoolId!)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
  });

  const saveGateways = useMutation({
    mutationFn: async (form: FormData) => {
      if (!schoolId) throw new Error("No school selected.");
      const payload = {
        school_id: schoolId,
        mpesa_environment: String(form.get("mpesa_environment") ?? "sandbox"),
        store_name: String(form.get("store_name") ?? "").trim() || null,
        mpesa_shortcode: String(form.get("mpesa_shortcode") ?? "").trim() || null,
        mpesa_till: String(form.get("mpesa_till") ?? "").trim() || null,
        mpesa_consumer_key: String(form.get("mpesa_consumer_key") ?? "").trim() || null,
        mpesa_consumer_secret: String(form.get("mpesa_consumer_secret") ?? "").trim() || null,
        mpesa_passkey: String(form.get("mpesa_passkey") ?? "").trim() || null,
        whatsapp_api_key: String(form.get("whatsapp_api_key") ?? "").trim() || null,
        whatsapp_sender: String(form.get("whatsapp_sender") ?? "").trim() || null,
      };
      const { error } = await supabase
        .from("school_gateway_settings")
        .upsert(payload, { onConflict: "school_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("M-Pesa & WhatsApp gateway settings saved.");
      void qc.invalidateQueries({ queryKey: ["school-gateway-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- Notice Board (HOI / School Broadcasts) ------------------------------
  const { data: noticesList, isLoading: loadingNotices } = useQuery({
    queryKey: ["school-notices", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notices")
        .select("*")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const createNotice = useMutation({
    mutationFn: async (form: FormData) => {
      if (!schoolId) throw new Error("No school selected.");
      const title = String(form.get("notice_title") ?? "").trim();
      const body = String(form.get("notice_body") ?? "").trim();
      const notifyWhatsApp = Boolean(form.get("notify_whatsapp"));
      if (!title || !body) throw new Error("Please enter both a title and notice announcement body.");

      const { error } = await supabase.from("notices").insert({
        school_id: schoolId,
        title,
        body,
        notify_whatsapp: notifyWhatsApp,
        created_by: profile?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notice published to parent & student notice boards.");
      void qc.invalidateQueries({ queryKey: ["school-notices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteNotice = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notice removed.");
      void qc.invalidateQueries({ queryKey: ["school-notices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const callbackUrl =
    typeof window !== "undefined" && schoolId
      ? `${window.location.origin}/api/public/mpesa/callback/${schoolId}`
      : `/api/public/mpesa/callback/${schoolId ?? ":schoolId"}`;

  return (
    <AppShell title="Settings" subtitle="School, term, payment gateways and account configuration">
      <Tabs defaultValue="school">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="school">School</TabsTrigger>
          <TabsTrigger value="academic">Terms &amp; exams</TabsTrigger>
          <TabsTrigger value="staff">Staff &amp; access</TabsTrigger>
          <TabsTrigger value="gateways">M-Pesa &amp; WhatsApp</TabsTrigger>
          <TabsTrigger value="notices">Notice Board</TabsTrigger>
          <TabsTrigger value="account">My account</TabsTrigger>
        </TabsList>

        {/* TAB 1: SCHOOL */}
        <TabsContent value="school" className="mt-4">
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="card-karli p-5">
              <h2 className="flex items-center gap-2 font-display font-semibold">
                <School className="size-4 text-primary" /> Your school
              </h2>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="School" value={school?.name ?? "Not linked"} />
                <Row label="Code" value={school?.school_code ?? "—"} />
                <Row label="Active term" value={term ? `Term ${term.term_number}` : "None"} />
                <Row label="Signed in as" value={profile?.full_name ?? "—"} />
              </dl>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {roles.length ? (
                  roles.map((r) => (
                    <Badge key={r} variant="secondary">
                      {r}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="outline">no role</Badge>
                )}
              </div>

              {isSuper ? (
                <div className="mt-5 space-y-2 border-t border-border pt-4">
                  <Label>Link my account to a school</Label>
                  <div className="flex gap-2">
                    <Select value={pick} onValueChange={setPick}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select school" />
                      </SelectTrigger>
                      <SelectContent>
                        {(schools ?? []).map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} ({s.school_code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" onClick={() => attach.mutate(undefined)} disabled={attach.isPending}>
                      {attach.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Link
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>

            {schoolId && isAdmin ? (
              <section className="card-karli p-5">
                <h2 className="flex items-center gap-2 font-display font-semibold">
                  <School className="size-4 text-primary" /> School profile &amp; branding
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Used on report cards, merit lists, ID cards and fee receipts.
                </p>
                <form
                  key={schoolId}
                  className="mt-3 space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveSchool.mutate(new FormData(e.currentTarget));
                  }}
                >
                  <Input
                    name="s_name"
                    defaultValue={school?.name ?? ""}
                    placeholder="School name"
                    required
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input name="s_county" defaultValue={school?.county ?? ""} placeholder="County" />
                    <Input
                      name="s_uli"
                      defaultValue={school?.uli_code ?? ""}
                      placeholder="ULI / KNEC code"
                    />
                    <Input
                      name="s_phone"
                      defaultValue={school?.phone ?? ""}
                      placeholder="School phone"
                    />
                    <Input
                      name="s_email"
                      defaultValue={school?.email ?? ""}
                      placeholder="School email"
                    />
                  </div>
                  <div className="space-y-1.5 rounded-lg border border-dashed border-border p-3">
                    <Label htmlFor="logo_file">School logo (upload an image)</Label>
                    <div className="flex items-center gap-3">
                      {logoData ?? school?.logo_url ? (
                        <img
                          src={(logoData ?? school?.logo_url)!}
                          alt="School logo preview"
                          className="size-14 rounded-lg object-contain"
                        />
                      ) : null}
                      <input
                        id="logo_file"
                        type="file"
                        accept="image/*"
                        className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          try {
                            setLogoData(await fileToDataUrl(f, 320));
                          } catch (err) {
                            toast.error((err as Error).message);
                          } finally {
                            e.target.value = "";
                          }
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      The logo prints on report cards, merit lists, ID cards and receipts.
                    </p>
                  </div>
                  <Button type="submit" className="w-full" disabled={saveSchool.isPending}>
                    {saveSchool.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <School className="size-4" />
                    )}{" "}
                    Save school profile
                  </Button>
                </form>
              </section>
            ) : null}

            {schoolId && isAdmin ? (
              <section className="card-karli p-5">
                <h2 className="flex items-center gap-2 font-display font-semibold">
                  <Layers className="size-4 text-primary" /> Streams per class
                </h2>
                <form
                  className="mt-3 space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addStream.mutate(new FormData(e.currentTarget));
                    e.currentTarget.reset();
                  }}
                >
                  <Select value={streamGrade} onValueChange={setStreamGrade}>
                    <SelectTrigger>
                      <SelectValue placeholder="Grade" />
                    </SelectTrigger>
                    <SelectContent>
                      {(grades ?? []).map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Input name="stream_name" placeholder="Stream name e.g. North, Blue, East" />
                    <Button type="submit" disabled={addStream.isPending}>
                      {addStream.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Plus className="size-4" />
                      )}{" "}
                      Add
                    </Button>
                  </div>
                </form>
                <div className="mt-4 max-h-56 space-y-1.5 overflow-y-auto border-t border-border pt-3 text-sm">
                  {(streams ?? []).length === 0 ? (
                    <p className="text-muted-foreground">No streams yet.</p>
                  ) : (
                    (streams ?? []).map((st) => (
                      <div key={st.id} className="flex items-center justify-between gap-3">
                        <span className="font-medium">
                          {(st.grades as { name?: string } | null)?.name} · {st.name}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => removeStream.mutate(st.id)}
                          aria-label={`Remove ${st.name}`}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </section>
            ) : null}

            {schoolId && isAdmin ? (
              <section className="card-karli p-5">
                <h2 className="flex items-center gap-2 font-display font-semibold">
                  <BookOpen className="size-4 text-primary" /> Learning areas (subjects)
                </h2>
                <form
                  className="mt-3 space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addSubject.mutate(new FormData(e.currentTarget));
                    (e.currentTarget as HTMLFormElement).reset();
                  }}
                >
                  <Select value={subjectGrade} onValueChange={setSubjectGrade}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All grades</SelectItem>
                      {(grades ?? []).map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="grid gap-2 sm:grid-cols-[1fr_120px_auto]">
                    <Input name="sub_name" placeholder="e.g. Mathematics" required />
                    <Input name="sub_code" placeholder="Code" />
                    <Button type="submit" disabled={addSubject.isPending}>
                      {addSubject.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Plus className="size-4" />
                      )}{" "}
                      Add
                    </Button>
                  </div>
                </form>
                <div className="mt-4 max-h-64 space-y-1.5 overflow-y-auto border-t border-border pt-3 text-sm">
                  {(subjects ?? []).length === 0 ? (
                    <p className="text-muted-foreground">No learning areas yet.</p>
                  ) : (
                    (subjects ?? []).map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between gap-3 border-b border-dashed border-border pb-1.5"
                      >
                        <span className="font-medium">
                          {s.name}{" "}
                          {s.code ? (
                            <span className="font-mono text-xs text-muted-foreground">({s.code})</span>
                          ) : null}
                        </span>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          {(s.grades as { name?: string } | null)?.name ?? "All grades"}
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => removeSubject.mutate(s.id)}
                            aria-label={`Remove ${s.name}`}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </section>
            ) : null}
          </div>
        </TabsContent>

        {/* TAB 2: ACADEMIC TERMS & EXAMS */}
        <TabsContent value="academic" className="mt-4">
          <div className="grid gap-5 lg:grid-cols-2">
            {schoolId && isAdmin ? (
              <section className="card-karli p-5">
                <h2 className="flex items-center gap-2 font-display font-semibold">
                  <CalendarRange className="size-4 text-primary" /> Academic years &amp; terms
                </h2>
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addYear.mutate(new FormData(e.currentTarget));
                    e.currentTarget.reset();
                  }}
                >
                  <Input name="year" type="number" placeholder={`${new Date().getFullYear() + 1}`} />
                  <Button type="submit" disabled={addYear.isPending}>
                    {addYear.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}{" "}
                    Add year
                  </Button>
                </form>
                <div className="mt-4 space-y-3">
                  {(years ?? []).map((y) => (
                    <div key={y.id} className="rounded-lg border border-border p-3">
                      <p className="font-display text-sm font-semibold">{y.year}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(terms ?? [])
                          .filter((t) => t.academic_year_id === y.id)
                          .map((t) => (
                            <Button
                              key={t.id}
                              type="button"
                              size="sm"
                              variant={t.is_active ? "default" : "outline"}
                              disabled={activate.isPending || t.is_active}
                              onClick={() => activate.mutate({ id: t.id, academic_year_id: y.id })}
                            >
                              {t.is_active ? <CheckCircle2 className="size-3.5" /> : null} Term{" "}
                              {t.term_number}
                            </Button>
                          ))}
                      </div>
                    </div>
                  ))}
                  {(years ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No academic years yet.</p>
                  ) : null}
                </div>
              </section>
            ) : null}

            <section className="card-karli p-5">
              <h2 className="font-display font-semibold">Exams for the active term</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Create the assessments teachers will enter marks against.
              </p>
              <form
                className="mt-3 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  createExam.mutate(new FormData(e.currentTarget));
                  e.currentTarget.reset();
                }}
              >
                <Select value={examGrade} onValueChange={setExamGrade}>
                  <SelectTrigger>
                    <SelectValue placeholder="Grade this exam is for" />
                  </SelectTrigger>
                  <SelectContent>
                    {(grades ?? []).map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Input name="name" placeholder="e.g. Opener Exam" />
                  <Input
                    name="max_score"
                    type="number"
                    min={1}
                    defaultValue={100}
                    className="w-28"
                    aria-label="Score out of"
                  />
                  <Button type="submit" disabled={createExam.isPending || !term}>
                    {createExam.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}{" "}
                    Add
                  </Button>
                </div>
              </form>
            </section>
          </div>
        </TabsContent>

        {/* TAB 3: STAFF & ACCESS */}
        <TabsContent value="staff" className="mt-4">
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="card-karli p-5 lg:col-span-2">
              <h2 className="font-display font-semibold">Who can do what</h2>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-lg border border-border p-3">
                  <p className="font-semibold">Super admin</p>
                  <p className="mt-1 text-muted-foreground">
                    Creates schools and Heads of Institution, and switches modules and classes on or off per school (Users &amp; Schools → Manage HOI Access).
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="font-semibold">Head of Institution</p>
                  <p className="mt-1 text-muted-foreground">
                    Runs one school: profile, terms, exams, streams and fees. Creates teacher logins and picks each teacher&apos;s classes and modules.
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="font-semibold">Teacher</p>
                  <p className="mt-1 text-muted-foreground">
                    Signs in with the email or username and password given by the Head of Institution, and sees only the classes and modules assigned.
                  </p>
                </div>
              </div>
            </section>

            {isSuper ? (
              <section className="card-karli p-5">
                <h2 className="flex items-center gap-2 font-display font-semibold">
                  <Plus className="size-4 text-primary" /> Create a school
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Sets up PP1–Grade 12, one stream per grade, an academic year and three terms, then
                  links it to you.
                </p>
                <form
                  className="mt-3 space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createSchool.mutate(new FormData(e.currentTarget));
                  }}
                >
                  <Input name="name" placeholder="School name e.g. Malawa Primary School" required />
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Input name="code" placeholder="Code e.g. MPS" required />
                    <Input name="county" placeholder="County" />
                    <Input name="year" type="number" defaultValue={new Date().getFullYear()} required />
                  </div>
                  <Button type="submit" className="w-full" disabled={createSchool.isPending}>
                    {createSchool.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <School className="size-4" />
                    )}{" "}
                    Create school
                  </Button>
                </form>
              </section>
            ) : null}

            {isSuper ? (
              <section className="card-karli p-5">
                <h2 className="flex items-center gap-2 font-display font-semibold">
                  <UserPlus className="size-4 text-primary" /> Assign a Head of Institution
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Creates a private login for one school. The HOI only ever sees that school&apos;s
                  learners, fees and results.
                </p>
                <form
                  className="mt-3 space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createHoi.mutate(new FormData(e.currentTarget));
                  }}
                >
                  <Select value={hoiSchool} onValueChange={setHoiSchool}>
                    <SelectTrigger>
                      <SelectValue placeholder="School to assign" />
                    </SelectTrigger>
                    <SelectContent>
                      {(schools ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} ({s.school_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input name="hoi_name" placeholder="HOI full name" required />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input name="hoi_email" type="email" placeholder="HOI email (login)" required />
                    <Input name="hoi_phone" placeholder="Phone" />
                  </div>
                  <Input
                    name="hoi_password"
                    type="text"
                    minLength={8}
                    placeholder="Temporary password (min 8 characters)"
                    required
                  />
                  <Button type="submit" className="w-full" disabled={createHoi.isPending}>
                    {createHoi.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <UserPlus className="size-4" />
                    )}{" "}
                    Create HOI login
                  </Button>
                </form>
                {(staff ?? []).length ? (
                  <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Accounts on this school
                    </p>
                    {(staff ?? []).map((p) => (
                      <div key={p.id} className="flex justify-between gap-3">
                        <span className="font-medium">{p.full_name || "—"}</span>
                        <span className="truncate text-muted-foreground">{p.email}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            {schoolId && isAdmin ? (
              <section className="card-karli p-5">
                <h2 className="flex items-center gap-2 font-display font-semibold">
                  <Users className="size-4 text-primary" /> Teacher accounts
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create teachers, choose their classes, learning areas and modules, and pick class
                  teachers on the Teachers page.
                </p>
                <Button asChild className="mt-3 w-full">
                  <Link to="/teachers">Open Teachers</Link>
                </Button>
              </section>
            ) : null}

            {isAdmin ? (
              <section className="card-karli p-5">
                <h2 className="flex items-center gap-2 font-display font-semibold">
                  <ShieldCheck className="size-4 text-primary" /> Change a staff member's classes &amp; modules
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isSuper
                    ? "Choose which grades and modules each Head of Institution or teacher may work with."
                    : "Choose which grades and modules each of your teachers may work with."}
                </p>
                <div className="mt-3 space-y-2">
                  <Select value={accessUser} onValueChange={setAccessUser}>
                    <SelectTrigger>
                      <SelectValue placeholder={isSuper ? "Head of Institution or teacher" : "Teacher"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(hoiPeople ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {(p.full_name || p.email) as string}
                          {p.role ? ` — ${p.role === "hoi" ? "Head of Institution" : "teacher"}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Grades</p>
                      {(grades ?? []).map((g) => (
                        <label key={g.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={accessGrades.includes(g.id)}
                            onCheckedChange={(v) =>
                              setAccessGrades((prev) =>
                                v ? [...prev, g.id] : prev.filter((x) => x !== g.id),
                              )
                            }
                          />
                          {g.name}
                        </label>
                      ))}
                    </div>
                    <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Modules</p>
                      {MODULES.map((m) => (
                        <label key={m} className="flex items-center gap-2 text-sm capitalize">
                          <Checkbox
                            checked={accessModules.includes(m)}
                            onCheckedChange={(v) =>
                              setAccessModules((prev) =>
                                v ? [...prev, m] : prev.filter((x) => x !== m),
                              )
                            }
                          />
                          {moduleLabel(m)}
                        </label>
                      ))}
                    </div>
                  </div>
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => saveAccess.mutate()}
                    disabled={saveAccess.isPending || !accessUser}
                  >
                    {saveAccess.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Save
                    access rules
                  </Button>
                </div>
              </section>
            ) : null}
          </div>
        </TabsContent>

        {/* TAB 4: M-PESA & WHATSAPP GATEWAYS (HOI SETTINGS) */}
        <TabsContent value="gateways" className="mt-4">
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="card-karli p-5">
              <h2 className="flex items-center gap-2 font-display font-semibold">
                <Smartphone className="size-4 text-primary" /> M-Pesa Daraja Configuration
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Set up automated fee collections via Paybill, Till number, or STK Push prompts directly to parent phones.
              </p>

              {loadingGateway ? (
                <div className="flex h-32 items-center justify-center text-muted-foreground text-sm">
                  <Loader2 className="size-4 animate-spin mr-2" /> Loading gateway settings...
                </div>
              ) : (
                <form
                  key={gatewaySettings?.id ?? "new-gw"}
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveGateways.mutate(new FormData(e.currentTarget));
                  }}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="mpesa_environment">Environment</Label>
                      <select
                        id="mpesa_environment"
                        name="mpesa_environment"
                        defaultValue={gatewaySettings?.mpesa_environment ?? "sandbox"}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="sandbox">Sandbox (Testing)</option>
                        <option value="production">Production (Live)</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="store_name">Store / School Display Name</Label>
                      <Input
                        id="store_name"
                        name="store_name"
                        defaultValue={gatewaySettings?.store_name ?? school?.name ?? ""}
                        placeholder="e.g. Karlisoft Academy"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="mpesa_shortcode">Business Shortcode / Paybill</Label>
                      <Input
                        id="mpesa_shortcode"
                        name="mpesa_shortcode"
                        defaultValue={gatewaySettings?.mpesa_shortcode ?? ""}
                        placeholder="e.g. 174379 or 400222"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="mpesa_till">Till Number (if Buy Goods)</Label>
                      <Input
                        id="mpesa_till"
                        name="mpesa_till"
                        defaultValue={gatewaySettings?.mpesa_till ?? ""}
                        placeholder="e.g. 5234567"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="mpesa_consumer_key">Consumer Key</Label>
                    <Input
                      id="mpesa_consumer_key"
                      name="mpesa_consumer_key"
                      type="password"
                      defaultValue={gatewaySettings?.mpesa_consumer_key ?? ""}
                      placeholder="Enter Daraja Consumer Key"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="mpesa_consumer_secret">Consumer Secret</Label>
                    <Input
                      id="mpesa_consumer_secret"
                      name="mpesa_consumer_secret"
                      type="password"
                      defaultValue={gatewaySettings?.mpesa_consumer_secret ?? ""}
                      placeholder="Enter Daraja Consumer Secret"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="mpesa_passkey">Online Passkey (STK Push)</Label>
                    <Input
                      id="mpesa_passkey"
                      name="mpesa_passkey"
                      type="password"
                      defaultValue={gatewaySettings?.mpesa_passkey ?? ""}
                      placeholder="bfb279f9aa9bdbcf158e97dd71a467cd..."
                    />
                  </div>

                  <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                        <Key className="size-3" /> Daraja Instant Callback URL
                      </Label>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => {
                          if (typeof navigator !== "undefined") {
                            navigator.clipboard.writeText(callbackUrl);
                            setCopiedCallback(true);
                            setTimeout(() => setCopiedCallback(false), 2000);
                            toast.success("Callback URL copied to clipboard");
                          }
                        }}
                      >
                        {copiedCallback ? (
                          <>
                            <Check className="size-3 text-emerald-600 mr-1" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="size-3 mr-1" /> Copy URL
                          </>
                        )}
                      </Button>
                    </div>
                    <code className="block rounded bg-background p-2 font-mono text-xs break-all text-muted-foreground">
                      {callbackUrl}
                    </code>
                    <p className="text-[11px] text-muted-foreground">
                      Paste this URL into your Safaricom Daraja portal under Instant Payment Notification (C2B / STK).
                    </p>
                  </div>

                  <div className="pt-2 border-t border-border">
                    <h3 className="flex items-center gap-2 font-display text-sm font-semibold mb-2">
                      <MessageCircle className="size-4 text-emerald-600" /> WhatsApp Sender Configuration
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="whatsapp_sender">Sender ID / Phone Number</Label>
                        <Input
                          id="whatsapp_sender"
                          name="whatsapp_sender"
                          defaultValue={gatewaySettings?.whatsapp_sender ?? ""}
                          placeholder="e.g. 254712345678 or Karlisoft"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="whatsapp_api_key">WhatsApp API Key / Token</Label>
                        <Input
                          id="whatsapp_api_key"
                          name="whatsapp_api_key"
                          type="password"
                          defaultValue={gatewaySettings?.whatsapp_api_key ?? ""}
                          placeholder="Cloud API Bearer Token"
                        />
                      </div>
                    </div>
                  </div>

                  <Button type="submit" className="w-full mt-3" disabled={saveGateways.isPending}>
                    {saveGateways.isPending ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                    Save Gateway Credentials
                  </Button>
                </form>
              )}
            </section>

            <section className="card-karli p-5">
              <h2 className="flex items-center gap-2 font-display font-semibold">
                <ShieldCheck className="size-4 text-primary" /> Gateway Integration Status
              </h2>
              <div className="mt-3 space-y-3 text-sm">
                <div className="rounded-lg border border-border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">M-Pesa STK Push &amp; C2B</span>
                    {gatewaySettings?.mpesa_shortcode ? (
                      <Badge variant="default" className="bg-emerald-600">Active</Badge>
                    ) : (
                      <Badge variant="outline">Not configured</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Matches Admission No in BillRefNumber, fallback to parent mobile number, or routes to the Unmatched Queue in Fees.
                  </p>
                </div>

                <div className="rounded-lg border border-border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">WhatsApp Reminders &amp; Receipts</span>
                    {gatewaySettings?.whatsapp_api_key ? (
                      <Badge variant="default" className="bg-emerald-600">Active</Badge>
                    ) : (
                      <Badge variant="outline">Not configured</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sends single or family balance reminders and receipt confirmations directly to registered parent WhatsApp numbers.
                  </p>
                </div>

                <div className="rounded-lg border border-border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Isolated School ID</span>
                    <Badge variant="secondary" className="font-mono text-xs truncate max-w-[180px]">
                      {schoolId ?? "None"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    All incoming payments and notifications are strictly verified and isolated by this unique ID.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </TabsContent>

        {/* TAB 5: NOTICE BOARD PUBLISHER */}
        <TabsContent value="notices" className="mt-4">
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="card-karli p-5">
              <h2 className="flex items-center gap-2 font-display font-semibold">
                <Bell className="size-4 text-primary" /> Post School Notice / Announcement
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Notices appear on parent portals and the student notice board even if a fee balance exists.
              </p>

              <form
                className="mt-4 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  createNotice.mutate(new FormData(e.currentTarget));
                  (e.currentTarget as HTMLFormElement).reset();
                }}
              >
                <div className="space-y-1">
                  <Label htmlFor="notice_title">Notice Title</Label>
                  <Input
                    id="notice_title"
                    name="notice_title"
                    placeholder="e.g. Mid-Term Break & School Re-opening Dates"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="notice_body">Announcement Body</Label>
                  <Textarea
                    id="notice_body"
                    name="notice_body"
                    rows={4}
                    placeholder="Provide details about the event, exam schedule, fees or important school updates..."
                    required
                  />
                </div>

                <div className="flex items-center space-x-2 rounded-lg border border-border p-3 bg-muted/20">
                  <input
                    type="checkbox"
                    id="notify_whatsapp"
                    name="notify_whatsapp"
                    value="true"
                    className="size-4 rounded border-gray-300"
                  />
                  <label htmlFor="notify_whatsapp" className="text-sm cursor-pointer select-none">
                    <span className="font-medium">Broadcast to all parents via WhatsApp</span>
                    <p className="text-xs text-muted-foreground">
                      Uses the school's configured WhatsApp Sender ID to notify primary guardian contacts.
                    </p>
                  </label>
                </div>

                <Button type="submit" className="w-full" disabled={createNotice.isPending || !schoolId}>
                  {createNotice.isPending ? <Loader2 className="size-4 animate-spin mr-2" /> : <Plus className="size-4 mr-2" />}
                  Publish Notice
                </Button>
              </form>
            </section>

            <section className="card-karli p-5">
              <h2 className="flex items-center gap-2 font-display font-semibold">
                <CalendarRange className="size-4 text-primary" /> Active Announcements
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Current school notices displayed on the parent notice board.
              </p>

              {loadingNotices ? (
                <div className="flex h-32 items-center justify-center text-muted-foreground text-sm">
                  <Loader2 className="size-4 animate-spin mr-2" /> Loading notices...
                </div>
              ) : (noticesList ?? []).length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No active notices published yet.
                </div>
              ) : (
                <div className="mt-4 space-y-3 max-h-[520px] overflow-y-auto">
                  {(noticesList ?? []).map((n) => (
                    <div key={n.id} className="rounded-lg border border-border p-3.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-sm">{n.title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(n.created_at).toLocaleDateString(undefined, {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteNotice.mutate(n.id)}
                          disabled={deleteNotice.isPending}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>

                      <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
                        {n.body}
                      </p>

                      {n.notify_whatsapp ? (
                        <div className="flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                          <MessageCircle className="size-3" /> WhatsApp broadcast enabled
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </TabsContent>

        {/* TAB 6: MY ACCOUNT */}
        <TabsContent value="account" className="mt-4">
          <div className="grid gap-5 lg:grid-cols-2">
            {profile?.id ? (
              <section className="card-karli p-5">
                <h2 className="flex items-center gap-2 font-display font-semibold">
                  <PenLine className="size-4 text-primary" /> My digital signature
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Upload a clear photo or scan of your signature. It prints on report cards and merit
                  lists next to your name.
                </p>
                <div className="mt-3 flex items-center gap-4">
                  {sigData ? (
                    <img
                      src={sigData}
                      alt="Signature preview"
                      className="h-12 object-contain"
                    />
                  ) : null}
                  <input
                    type="file"
                    accept="image/*"
                    className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      try {
                        setSigData(await fileToDataUrl(f, 420));
                      } catch (err) {
                        toast.error((err as Error).message);
                      } finally {
                        e.target.value = "";
                      }
                    }}
                  />
                </div>
                <Button
                  type="button"
                  className="mt-3 w-full"
                  onClick={() => saveSignature.mutate()}
                  disabled={saveSignature.isPending || !sigData}
                >
                  {saveSignature.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Save
                  signature
                </Button>
              </section>
            ) : null}

            <section className="card-karli p-5">
              <h2 className="font-display font-semibold">Support</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Email {KARLI.email}
              </p>
            </section>
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border pb-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
