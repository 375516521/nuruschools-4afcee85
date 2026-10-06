import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, ShieldAlert, GraduationCap } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NURU } from "@/lib/nuru";

export const Route = createFileRoute("/verify/$adm")({
  head: ({ params }) => ({
    meta: [
      { title: `Verify learner ${params.adm} — Fanisi Digital Solutions` },
      { name: "description", content: `Public verification of student ID card and admission number ${params.adm} issued through the Fanisi Digital Solutions school management system.` },
      { property: "og:title", content: `Verify learner ${params.adm}` },
      { property: "og:description", content: "Scan-to-verify student identity card issued by a Fanisi Digital Solutions school." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const { adm } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["verify", adm],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("verify_student_id", { _adm_no: adm });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  return (
    <div className="grid min-h-screen place-items-center bg-nuru-hero px-4 py-10">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <GraduationCap className="size-5" />
          </div>
          <span className="font-display font-bold">FANISI DIGITAL SOLUTIONS</span>
        </Link>

        <div className="card-nuru overflow-hidden">
          {isLoading ? (
            <div className="space-y-3 p-6"><Skeleton className="h-24 w-24 rounded-full" /><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-28" /></div>
          ) : !data ? (
            <div className="p-8 text-center">
              <ShieldAlert className="mx-auto size-10 text-destructive" />
              <h1 className="mt-3 font-display text-lg font-bold">Not verified</h1>
              <p className="mt-1 text-sm text-muted-foreground">No learner found with admission number <strong>{adm}</strong>.</p>
            </div>
          ) : (
            <>
              <div className="bg-nuru-deep p-5 text-center">
                <p className="text-xs uppercase tracking-widest text-sidebar-foreground/60">{data.school_name}</p>
                <p className="font-display text-sm font-semibold text-sidebar-primary">{data.school_code}</p>
              </div>
              <div className="p-6 text-center">
                {data.photo_url ? (
                  <img src={data.photo_url} alt={`${data.full_name} portrait`} className="mx-auto size-24 rounded-full border-4 border-secondary object-cover" />
                ) : (
                  <div className="mx-auto grid size-24 place-items-center rounded-full bg-secondary font-display text-2xl font-bold text-primary">
                    {data.full_name?.split(" ").map((n: string) => n[0]).slice(0, 2).join("")}
                  </div>
                )}
                <h1 className="mt-4 font-display text-xl font-bold">{data.full_name}</h1>
                <p className="text-sm text-muted-foreground">{data.grade}{data.stream ? ` ${data.stream}` : ""}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 text-left text-sm">
                  <div className="rounded-lg bg-secondary/60 p-3">
                    <p className="text-[11px] uppercase text-muted-foreground">Admission No</p>
                    <p className="font-mono font-semibold">{data.adm_no}</p>
                  </div>
                  <div className="rounded-lg bg-secondary/60 p-3">
                    <p className="text-[11px] uppercase text-muted-foreground">Student ID</p>
                    <p className="font-mono font-semibold">{data.student_id ?? "—"}</p>
                  </div>
                </div>
                <Badge className="mt-5 gap-1.5" variant={data.status === "active" ? "default" : "secondary"}>
                  <BadgeCheck className="size-3.5" />
                  {data.status === "active" ? "Verified · Active learner" : `Status: ${data.status}`}
                </Badge>
              </div>
            </>
          )}
        </div>

        <div className="mt-5 text-center">
          <Button asChild variant="outline" size="sm"><Link to="/parent">Parent portal</Link></Button>
          <p className="mt-3 text-xs text-muted-foreground">Report a suspicious card: {NURU.email}</p>
        </div>
      </div>
    </div>
  );
}
