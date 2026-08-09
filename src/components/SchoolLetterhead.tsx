import { GraduationCap } from "lucide-react";
import { NURU } from "@/lib/nuru";

export type SchoolInfo = {
  name?: string | null;
  school_code?: string | null;
  county?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
  uli_code?: string | null;
} | null;

export function SchoolLogo({
  school,
  className = "size-14",
}: {
  school: SchoolInfo;
  className?: string;
}) {
  if (school?.logo_url) {
    return (
      <img
        src={school.logo_url}
        alt={`${school?.name ?? "School"} logo`}
        className={`${className} rounded-lg object-contain`}
      />
    );
  }
  return (
    <div
      className={`${className} grid shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground`}
    >
      {school?.school_code ? (
        <span className="font-display text-sm font-bold">{school.school_code}</span>
      ) : (
        <GraduationCap className="size-6" />
      )}
    </div>
  );
}

/** Shared professional document letterhead for report cards, receipts and merit lists. */
export function SchoolLetterhead({
  school,
  documentTitle,
  meta,
}: {
  school: SchoolInfo;
  documentTitle: string;
  meta?: string;
}) {
  const contact = [
    school?.county ? `${school.county} County` : null,
    school?.phone,
    school?.email,
    school?.uli_code ? `ULI ${school.uli_code}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <header className="flex items-start gap-4 border-b-2 border-primary pb-3">
      <SchoolLogo school={school} />
      <div className="min-w-0 flex-1">
        <p className="font-display text-xl leading-tight font-bold tracking-tight uppercase">
          {school?.name ?? NURU.name}
        </p>
        {contact ? <p className="text-[11px] text-muted-foreground">{contact}</p> : null}
        <p className="mt-1 inline-block rounded bg-secondary px-2 py-0.5 text-[11px] font-semibold tracking-widest uppercase text-primary">
          {documentTitle}
        </p>
        {meta ? <p className="mt-1 text-xs text-muted-foreground">{meta}</p> : null}
      </div>
      {school?.school_code ? (
        <div className="text-right text-[11px] text-muted-foreground">
          <p className="font-mono font-semibold">{school.school_code}</p>
          <p>{new Date().toLocaleDateString("en-KE")}</p>
        </div>
      ) : null}
    </header>
  );
}

export function DocFooter({ note }: { note?: string }) {
  return (
    <p className="mt-4 border-t border-dashed border-border pt-2 text-[10px] text-muted-foreground">
      {note ? `${note} · ` : ""}Powered by {NURU.name} · {NURU.whatsapp} · {NURU.email}
    </p>
  );
}
