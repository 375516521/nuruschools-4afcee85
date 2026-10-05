import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, IdCard, ClipboardList, Wallet, Settings,
  LogOut, GraduationCap, Menu, FileText, ShieldCheck,
  CalendarCheck, BookOpen, Boxes, BarChart3, UserCog,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { canUseRoute, useHoiAccess, useSchoolAccess } from "@/lib/access";
import { NURU } from "@/lib/nuru";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/students", label: "Learners", icon: Users },
  { to: "/attendance", label: "Attendance", icon: CalendarCheck },
  { to: "/id-cards", label: "ID Card Centre", icon: IdCard },
  { to: "/marks", label: "Exams & Marks", icon: ClipboardList },
  { to: "/exams", label: "Exam Analytics", icon: BarChart3 },
  { to: "/reports", label: "Report Cards", icon: FileText },
  { to: "/fees", label: "Fees & Finance", icon: Wallet },
  { to: "/library", label: "Library", icon: BookOpen },
  { to: "/assets", label: "Assets", icon: Boxes },
  { to: "/promotions", label: "Promotions", icon: GraduationCap },
  { to: "/teachers", label: "Teachers", icon: UserCog },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;


const SUPER_NAV = [
  { to: "/users", label: "Users & Accounts", icon: ShieldCheck },
] as const;



export function useSession() {
  return useQuery({
    queryKey: ["session-profile"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return null;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*, schools(*)").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);
      return {
        user,
        profile,
        school: (profile as { schools?: unknown } | null)?.schools ?? null,
        roles: (roles ?? []).map((r) => r.role as string),
      };
    },
  });
}

export function useActiveTerm(schoolId?: string | null) {
  return useQuery({
    queryKey: ["active-term", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase
        .from("terms")
        .select("id, term_number, start_date, end_date, academic_years(year, id)")
        .eq("school_id", schoolId!)
        .eq("is_active", true)
        .maybeSingle();
      return data;
    },
  });
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: session } = useSession();
  const roles = session?.roles ?? [];
  const isSuper = roles.includes("superadmin");
  const { data: access } = useHoiAccess(session?.user?.id ?? null);
  const { data: schoolAccess } = useSchoolAccess(
    (session?.profile as { school_id?: string } | null)?.school_id ?? null,
  );
  const items = (isSuper ? [...NAV, ...SUPER_NAV] : NAV).filter((i) =>
    canUseRoute(i.to, isSuper, access ?? null, roles, schoolAccess ?? null),
  );
  return (
    <nav className="flex flex-col gap-1">
      {items.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            pathname.startsWith(to)
              ? "bg-sidebar-accent text-sidebar-primary"
              : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
          )}
        >
          <Icon className="size-4 shrink-0" />
          {label}
        </Link>
      ))}
    </nav>
  );
}


/** Super admin school switcher — lets the founder work inside any school they created. */
function SchoolSwitcher() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const isSuper = (session?.roles ?? []).includes("superadmin");
  const profileId = (session?.profile as { id?: string } | null)?.id ?? null;
  const current = (session?.profile as { school_id?: string } | null)?.school_id ?? "";

  const { data: schools } = useQuery({
    queryKey: ["all-schools"],
    enabled: isSuper,
    queryFn: async () =>
      (await supabase.from("schools").select("id, name, school_code").order("name")).data ?? [],
  });

  if (!isSuper || !profileId) return null;

  async function switchTo(id: string) {
    const { error } = await supabase.from("profiles").update({ school_id: id }).eq("id", profileId!);
    if (error) return;
    await queryClient.invalidateQueries();
  }

  return (
    <Select value={current} onValueChange={(v) => void switchTo(v)}>
      <SelectTrigger className="no-print h-9 w-[170px] text-xs sm:w-[220px]">
        <SelectValue placeholder="Switch school" />
      </SelectTrigger>
      <SelectContent>
        {(schools ?? []).map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name} ({s.school_code})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AppShell({ title, subtitle, actions, children }: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { data: session } = useSession();
  const { data: term } = useActiveTerm((session?.profile as { school_id?: string } | null)?.school_id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const brand = (
    <div className="flex items-center gap-2.5 px-1 py-1">
      <div className="grid size-9 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
        <GraduationCap className="size-5" />
      </div>
      <div className="leading-tight">
        <p className="font-display text-sm font-bold text-sidebar-foreground">FANISI</p>
        <p className="text-[11px] text-sidebar-foreground/60">Digital Solutions</p>
      </div>
    </div>
  );

  const termLabel = term
    ? `${(term as { academic_years?: { year?: number } }).academic_years?.year} Term ${term.term_number}`
    : "No active term";

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col gap-6 bg-nuru-deep p-4 lg:flex">
        {brand}
        <NavList />
        <div className="mt-auto space-y-3">
          <div className="rounded-lg bg-sidebar-accent/60 p-3">
            <p className="text-[11px] uppercase tracking-wide text-sidebar-foreground/60">Active</p>
            <p className="text-sm font-semibold text-sidebar-primary">{termLabel}</p>
          </div>
          <Button variant="ghost" onClick={signOut}
            className="w-full justify-start text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground">
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-card/85 px-4 py-3 backdrop-blur lg:px-8">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="lg:hidden">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-nuru-deep p-4">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <div className="mb-6">{brand}</div>
              <NavList onNavigate={() => setOpen(false)} />
              <Button variant="ghost" onClick={signOut}
                className="mt-6 w-full justify-start text-sidebar-foreground/75 hover:bg-sidebar-accent">
                <LogOut className="size-4" /> Sign out
              </Button>
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-lg font-bold text-foreground">{title}</h1>
            {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <SchoolSwitcher />
            {actions}
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8">{children}</main>

        <footer className="no-print border-t border-border px-4 py-4 text-xs text-muted-foreground lg:px-8">
          {NURU.name} · Support {NURU.whatsapp} · {NURU.email}
        </footer>
      </div>
    </div>
  );
}
