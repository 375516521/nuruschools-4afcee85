import { GRADING_SCALE } from "@/lib/karli";

export type GradeBand = { code: string; label: string; min: number; max: number; remark?: string };

export const DEFAULT_SCALE: GradeBand[] = GRADING_SCALE.map((g) => ({ ...g }));

/** Read a school's custom scale, falling back to the national CBE bands. */
export function parseScale(raw: unknown): GradeBand[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_SCALE;
  const bands = raw
    .map((b) => b as Partial<GradeBand>)
    .filter((b) => typeof b?.code === "string" && typeof b?.min === "number")
    .map((b) => ({
      code: String(b.code),
      label: String(b.label ?? b.code),
      min: Number(b.min),
      max: Number(b.max ?? 100),
      remark: typeof b.remark === "string" ? b.remark : "",
    }))
    .sort((a, b) => b.min - a.min);
  return bands.length ? bands : DEFAULT_SCALE;
}

/** Convert a raw score out of `outOf` into a band of the given scale. */
export function bandFor(
  score: number | null | undefined,
  outOf: number,
  scale: GradeBand[] = DEFAULT_SCALE,
): GradeBand | null {
  if (score === null || score === undefined || Number.isNaN(score)) return null;
  const pct = outOf > 0 ? (Number(score) / outOf) * 100 : Number(score);
  return scale.find((b) => pct >= b.min && pct <= b.max) ?? scale[scale.length - 1] ?? null;
}

export function levelCode(
  score: number | null | undefined,
  outOf: number,
  scale?: GradeBand[],
): string {
  return bandFor(score, outOf, scale)?.code ?? "—";
}
