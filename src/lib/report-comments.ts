/**
 * Automatic report-card remarks.
 * Comments are chosen from the learner's mean score so every report form carries
 * a class teacher and a head teacher remark without anyone typing one.
 */

const CLASS_TEACHER = [
  {
    min: 80,
    text: "An outstanding term. Consistently exceeds expectations across the learning areas and sets the pace for the class.",
  },
  {
    min: 65,
    text: "A very good performance. Works with focus and understanding; a little more effort in the weaker areas will secure top marks.",
  },
  {
    min: 50,
    text: "A fair term's work. The foundations are in place — more practice and completion of all assignments will lift these scores.",
  },
  {
    min: 40,
    text: "Approaching expectations. Needs steady revision, active participation in class and close follow-up at home.",
  },
  {
    min: 0,
    text: "Below expectations this term. Requires targeted remedial support and daily guided practice to catch up.",
  },
] as const;

const HEAD_TEACHER = [
  { min: 80, text: "Excellent work. Keep up this standard and continue mentoring your peers." },
  { min: 65, text: "Commendable results. With sustained discipline you will reach the top band." },
  { min: 50, text: "Satisfactory. Set clear targets for next term and follow your revision timetable." },
  { min: 40, text: "You can do better. Meet your teachers for support in the weakest learning areas." },
  { min: 0, text: "Serious improvement is needed. The school will arrange remedial support with your parents." },
] as const;

function pick(list: readonly { min: number; text: string }[], mean: number | null | undefined) {
  if (mean === null || mean === undefined || Number.isNaN(mean)) return "No marks were recorded for this term.";
  return list.find((r) => mean >= r.min)?.text ?? list[list.length - 1]!.text;
}

export function classTeacherComment(mean: number | null | undefined): string {
  return pick(CLASS_TEACHER, mean);
}

export function headTeacherComment(mean: number | null | undefined): string {
  return pick(HEAD_TEACHER, mean);
}
