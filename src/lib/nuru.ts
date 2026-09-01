export const NURU = {
  name: "Fanisi Digital Solutions",
  tagline: "The complete CBC school management system for Kenyan schools",
  whatsapp: "+254745939344",
  whatsappLink: "https://wa.me/254745939344",
  email: "charleswambua.edu@gmail.com",
} as const;

export const GRADING_SCALE = [
  { code: "EE1", label: "Exceeding Expectation 1", min: 90, max: 100 },
  { code: "EE2", label: "Exceeding Expectation 2", min: 75, max: 89 },
  { code: "ME1", label: "Meeting Expectation 1", min: 65, max: 74 },
  { code: "ME2", label: "Meeting Expectation 2", min: 50, max: 64 },
  { code: "AE1", label: "Approaching Expectation 1", min: 40, max: 49 },
  { code: "AE2", label: "Approaching Expectation 2", min: 30, max: 39 },
  { code: "BE", label: "Below Expectation", min: 0, max: 29 },
] as const;

export function scoreToLevel(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score)) return "-";
  const band = GRADING_SCALE.find((g) => score >= g.min && score <= g.max);
  return band?.code ?? "-";
}

export const CBC_COMPETENCIES = [
  "Communication & Collaboration",
  "Critical Thinking & Problem Solving",
  "Creativity & Imagination",
  "Citizenship",
  "Digital Literacy",
  "Self-Efficacy",
] as const;

export const MODULES = [
  "academics", "fees", "assets", "library", "hr", "ai", "biometrics",
  "parentapp", "elearning", "procurement", "admissions", "transport",
  "hostel", "bom", "api",
] as const;

export const PLANS = [
  { name: "Starter", price: 150_000, blurb: "Single campus, core academics & fees" },
  { name: "Pro", price: 250_000, blurb: "Adds AI, ID cards, parent app & analytics" },
  { name: "Enterprise", price: 400_000, blurb: "Multi-campus, white label, API & SLA" },
] as const;

export function ksh(n: number | null | undefined): string {
  return `KSh ${Number(n ?? 0).toLocaleString("en-KE")}`;
}

export function verifyUrl(admNo: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/verify/${encodeURIComponent(admNo)}`;
}

export type QrPayload = {
  school_name: string;
  school_code: string;
  adm_no: string;
  student_id: string | null;
  first_name: string;
  last_name: string;
  grade: string | null;
  stream: string | null;
  guardian_phone: string | null;
  photo_url: string | null;
  verify_url: string;
};
