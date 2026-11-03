import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, Loader2, FileSpreadsheet, Download } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { logAudit } from "@/lib/audit";

type Grade = { id: string; name: string };
type Stream = { id: string; name: string; grade_id: string };

type SheetRow = Record<string, unknown>;

const HEADERS = [
  "first_name",
  "last_name",
  "gender",
  "grade",
  "stream",
  "guardian_name",
  "guardian_phone",
];

function pickField(row: SheetRow, ...keys: string[]) {
  for (const key of Object.keys(row)) {
    const norm = key.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (keys.includes(norm)) {
      const v = row[key];
      return v === undefined || v === null ? "" : String(v).trim();
    }
  }
  return "";
}

/** Bulk learner import from an Excel or CSV file. */
export function LearnerImport({
  schoolId,
  grades,
  streams,
}: {
  schoolId: string | null;
  grades: Grade[];
  streams: Stream[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [fallbackGrade, setFallbackGrade] = useState("");
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [fileName, setFileName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      HEADERS,
      ["Amina", "Hassan", "F", grades[0]?.name ?? "Grade 1", "A", "Fatuma Hassan", "0722000111"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Learners");
    XLSX.writeFile(wb, "karli-learner-import-template.xlsx");
  }

  async function readFile(file: File) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const first = wb.SheetNames[0];
    if (!first) {
      toast.error("That workbook has no sheets.");
      return;
    }
    const parsed = XLSX.utils.sheet_to_json<SheetRow>(wb.Sheets[first]!, { defval: "" });
    setRows(parsed);
    setFileName(file.name);
    if (parsed.length === 0) toast.error("No rows found in that file.");
  }

  const importRows = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error("No school is linked to your account.");
      if (rows.length === 0) throw new Error("Choose a file with learner rows first.");

      const gradeByName = new Map(grades.map((g) => [g.name.trim().toLowerCase(), g.id]));
      const payload: Record<string, unknown>[] = [];
      const problems: string[] = [];

      rows.forEach((row, i) => {
        const first_name = pickField(row, "first_name", "firstname", "first", "name");
        const last_name = pickField(row, "last_name", "lastname", "surname", "other_names");
        const genderRaw = pickField(row, "gender", "sex").toUpperCase();
        const gradeName = pickField(row, "grade", "class", "grade_name");
        const streamName = pickField(row, "stream", "stream_name");
        const guardian_name = pickField(row, "guardian_name", "parent", "parent_name", "guardian");
        const guardian_phone = pickField(row, "guardian_phone", "phone", "parent_phone", "contact");

        if (!first_name || !last_name) {
          problems.push(`Row ${i + 2}: missing a name`);
          return;
        }
        const grade_id = gradeByName.get(gradeName.toLowerCase()) ?? fallbackGrade;
        if (!grade_id) {
          problems.push(`Row ${i + 2}: grade "${gradeName || "blank"}" not found`);
          return;
        }
        const stream = streams.find(
          (s) => s.grade_id === grade_id && s.name.trim().toLowerCase() === streamName.toLowerCase(),
        );

        payload.push({
          school_id: schoolId,
          adm_no: "",
          first_name,
          last_name,
          gender: genderRaw.startsWith("M") ? "M" : genderRaw.startsWith("F") ? "F" : null,
          grade_id,
          stream_id: stream?.id ?? null,
          guardian_name: guardian_name || null,
          guardian_phone: guardian_phone || null,
        });
      });

      if (payload.length === 0)
        throw new Error(problems[0] ?? "Nothing to import — check the column headings.");

      let inserted = 0;
      for (const record of payload) {
        const { error } = await supabase.from("students").insert(record as never);
        if (error) problems.push(`${record["first_name"]} ${record["last_name"]}: ${error.message}`);
        else inserted += 1;
      }
      logAudit("learners_imported", "students", `${inserted} rows`);
      return { inserted, problems };
    },
    onSuccess: ({ inserted, problems }) => {
      toast.success(`${inserted} learners imported with generated admission numbers.`);
      if (problems.length) toast.warning(`${problems.length} rows skipped. ${problems[0]}`);
      setRows([]);
      setFileName("");
      setOpen(false);
      if (inputRef.current) inputRef.current.value = "";
      void qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Upload className="size-4" /> Import Excel
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import learners from Excel</DialogTitle>
          <DialogDescription>
            Columns: first_name, last_name, gender, grade, stream, guardian_name, guardian_phone.
            Admission numbers and student IDs are generated for you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Button variant="secondary" className="w-full" onClick={downloadTemplate}>
            <Download className="size-4" /> Download the template
          </Button>

          <div className="space-y-1.5">
            <Label htmlFor="xls">Excel or CSV file</Label>
            <input
              id="xls"
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void readFile(f);
              }}
              className="block w-full cursor-pointer rounded-lg border border-border bg-background p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Fallback grade (used when a row&apos;s grade is blank or unknown)</Label>
            <Select value={fallbackGrade} onValueChange={setFallbackGrade}>
              <SelectTrigger>
                <SelectValue placeholder="Optional" />
              </SelectTrigger>
              <SelectContent>
                {grades.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {rows.length ? (
            <p className="flex items-center gap-2 rounded-lg bg-secondary/60 p-3 text-sm">
              <FileSpreadsheet className="size-4 text-primary" />
              {rows.length} rows read from {fileName}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            onClick={() => importRows.mutate()}
            disabled={importRows.isPending || rows.length === 0}
          >
            {importRows.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}{" "}
            Import {rows.length || ""} learners
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
