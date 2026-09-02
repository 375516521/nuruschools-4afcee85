import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Boxes, Loader2, Plus, Printer, Trash2, Upload } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { AppShell, useSession } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SchoolLetterhead, DocFooter, type SchoolInfo } from "@/components/SchoolLetterhead";
import { fileToDataUrl } from "@/lib/image-upload";
import { logAudit } from "@/lib/audit";
import { ksh } from "@/lib/nuru";

export const Route = createFileRoute("/_authenticated/assets")({
  component: AssetsPage,
});

const CONDITIONS = ["new", "good", "fair", "poor", "damaged"] as const;

type AssetRow = {
  id: string;
  name: string;
  category: string | null;
  serial_number: string | null;
  asset_tag: string | null;
  quantity: number;
  value: number;
  location: string | null;
  condition: string;
  purchased_on: string | null;
  photo_url: string | null;
  grade_id: string | null;
  stream_id: string | null;
  grades?: { name: string } | null;
  streams?: { name: string } | null;
};

const EMPTY = {
  name: "",
  category: "",
  serial_number: "",
  asset_tag: "",
  quantity: "1",
  value: "0",
  location: "",
  condition: "good",
  purchased_on: "",
  grade_id: "",
  stream_id: "",
  photo_url: "",
};

function AssetsPage() {
  const { data: session } = useSession();
  const schoolId = (session?.profile as { school_id?: string } | null)?.school_id ?? null;
  const school = session?.school as SchoolInfo;
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [q, setQ] = useState("");
  const [filterGrade, setFilterGrade] = useState("all");

  const { data: grades } = useQuery({
    queryKey: ["grades", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (await supabase.from("grades").select("id, name").eq("school_id", schoolId!).order("level_order"))
        .data ?? [],
  });

  const { data: streams } = useQuery({
    queryKey: ["streams", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (await supabase.from("streams").select("id, name, grade_id").eq("school_id", schoolId!).order("name"))
        .data ?? [],
  });

  const { data: assets, isLoading } = useQuery({
    queryKey: ["assets", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      ((
        await supabase
          .from("assets")
          .select("*, grades(name), streams(name)")
          .eq("school_id", schoolId!)
          .order("name")
      ).data ?? []) as AssetRow[],
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Give the item a name.");
      const payload = {
        school_id: schoolId!,
        name: form.name.trim().toUpperCase(),
        category: form.category.trim() || null,
        serial_number: form.serial_number.trim() || null,
        asset_tag: form.asset_tag.trim().toUpperCase() || null,
        quantity: Number(form.quantity) || 1,
        value: Number(form.value) || 0,
        location: form.location.trim() || null,
        condition: form.condition,
        purchased_on: form.purchased_on || null,
        grade_id: form.grade_id || null,
        stream_id: form.stream_id || null,
        photo_url: form.photo_url || null,
      };
      const { error } = editId
        ? await supabase.from("assets").update(payload).eq("id", editId)
        : await supabase.from("assets").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      logAudit(editId ? "asset_updated" : "asset_registered", "assets", editId ?? form.asset_tag);
      toast.success(editId ? "Asset updated." : "Asset registered.");
      setOpen(false);
      setEditId(null);
      setForm({ ...EMPTY });
      void qc.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("assets").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      logAudit("asset_deleted", "assets", id);
      toast.success("Asset removed from the register.");
      void qc.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    try {
      const url = await fileToDataUrl(file, 320);
      setForm((p) => ({ ...p, photo_url: url }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function openEdit(a: AssetRow) {
    setEditId(a.id);
    setForm({
      name: a.name,
      category: a.category ?? "",
      serial_number: a.serial_number ?? "",
      asset_tag: a.asset_tag ?? "",
      quantity: String(a.quantity),
      value: String(a.value),
      location: a.location ?? "",
      condition: a.condition,
      purchased_on: a.purchased_on ?? "",
      grade_id: a.grade_id ?? "",
      stream_id: a.stream_id ?? "",
      photo_url: a.photo_url ?? "",
    });
    setOpen(true);
  }

  const rows = (assets ?? []).filter((a) => {
    const matchQ =
      !q.trim() ||
      [a.name, a.category, a.serial_number, a.asset_tag, a.location]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q.trim().toLowerCase()));
    const matchG = filterGrade === "all" || a.grade_id === filterGrade;
    return matchQ && matchG;
  });

  const totalValue = rows.reduce((sum, a) => sum + Number(a.value) * Number(a.quantity), 0);
  const gradeStreams = (streams ?? []).filter((s) => !form.grade_id || s.grade_id === form.grade_id);

  return (
    <AppShell
      title="Assets register"
      subtitle="Register school property, assign it to a class and print QR-tagged inventory"
      actions={
        <>
          <Button size="sm" variant="outline" className="no-print" onClick={() => window.print()}>
            <Printer className="size-4" /> Print register
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditId(null);
              setForm({ ...EMPTY });
              setOpen(true);
            }}
          >
            <Plus className="size-4" /> Register asset
          </Button>
        </>
      }
    >
      <div className="card-nuru mb-5 grid gap-3 p-4 no-print sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Search</Label>
          <Input placeholder="Name, tag, serial, location" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Assigned grade</Label>
          <Select value={filterGrade} onValueChange={setFilterGrade}>
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
        </div>
        <div className="space-y-1.5">
          <Label>Total value</Label>
          <p className="pt-2 text-sm font-semibold">{ksh(totalValue)} · {rows.length} items</p>
        </div>
      </div>

      <div className="card-nuru print-sheet p-6">
        <SchoolLetterhead
          school={school}
          documentTitle="School assets register"
          meta={`${rows.length} items · total value ${ksh(totalValue)}`}
        />
        <table className="doc-table mt-4 w-full text-sm">
          <thead>
            <tr>
              <th className="w-10">#</th>
              <th>Photo</th>
              <th>Item</th>
              <th>Tag</th>
              <th>Category</th>
              <th>Assigned to</th>
              <th>Location</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Value</th>
              <th>Condition</th>
              <th>QR</th>
              <th className="no-print text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a, i) => (
              <tr key={a.id}>
                <td>{i + 1}</td>
                <td>
                  {a.photo_url ? (
                    <img src={a.photo_url} alt={a.name} className="size-10 rounded object-cover" />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="font-medium uppercase">{a.name}</td>
                <td className="font-mono text-xs">{a.asset_tag ?? "—"}</td>
                <td>{a.category ?? "—"}</td>
                <td>
                  {a.grades?.name ?? "General"}
                  {a.streams?.name ? ` · ${a.streams.name}` : ""}
                </td>
                <td>{a.location ?? "—"}</td>
                <td className="text-right">{a.quantity}</td>
                <td className="text-right">{ksh(Number(a.value) * Number(a.quantity))}</td>
                <td className="capitalize">{a.condition}</td>
                <td>
                  <QRCodeSVG
                    value={`ASSET:${a.asset_tag ?? a.id}|${a.name}|${school?.school_code ?? ""}`}
                    size={38}
                  />
                </td>
                <td className="no-print text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => openEdit(a)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove.mutate(a.id)}
                      aria-label={`Delete ${a.name}`}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="py-10 text-center text-muted-foreground">
                  <Boxes className="mx-auto mb-2 size-6" /> No assets registered yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <DocFooter note="Assets register" />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit asset" : "Register asset"}</DialogTitle>
            <DialogDescription>
              Record the item, assign it to a grade or stream and attach a photo for the printed register.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Item name</Label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Asset tag</Label>
              <Input
                placeholder="e.g. LAB-001"
                value={form.asset_tag}
                onChange={(e) => setForm((p) => ({ ...p, asset_tag: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Input value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Serial number</Label>
              <Input
                value={form.serial_number}
                onChange={(e) => setForm((p) => ({ ...p, serial_number: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Unit value (KSh)</Label>
              <Input
                type="number"
                min={0}
                value={form.value}
                onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Assigned grade</Label>
              <Select
                value={form.grade_id || "none"}
                onValueChange={(v) =>
                  setForm((p) => ({ ...p, grade_id: v === "none" ? "" : v, stream_id: "" }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="General" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">General (whole school)</SelectItem>
                  {(grades ?? []).map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Stream</Label>
              <Select
                value={form.stream_id || "none"}
                onValueChange={(v) => setForm((p) => ({ ...p, stream_id: v === "none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any stream" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any stream</SelectItem>
                  {gradeStreams.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Condition</Label>
              <Select value={form.condition} onValueChange={(v) => setForm((p) => ({ ...p, condition: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Purchased on</Label>
              <Input
                type="date"
                value={form.purchased_on}
                onChange={(e) => setForm((p) => ({ ...p, purchased_on: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Photo</Label>
              <div className="flex items-center gap-3">
                {form.photo_url ? (
                  <img src={form.photo_url} alt="Asset" className="size-14 rounded-lg object-cover" />
                ) : (
                  <div className="grid size-14 place-items-center rounded-lg bg-muted">
                    <Upload className="size-4 text-muted-foreground" />
                  </div>
                )}
                <Input type="file" accept="image/*" onChange={(e) => void onPhoto(e.target.files?.[0])} />
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>QR tag preview</Label>
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-3">
                <QRCodeSVG
                  value={`ASSET:${form.asset_tag || "UNTAGGED"}|${form.name || "ITEM"}|${school?.school_code ?? ""}`}
                  size={64}
                />
                <Textarea
                  readOnly
                  rows={2}
                  className="text-xs"
                  value={`ASSET:${form.asset_tag || "UNTAGGED"} · ${form.name || "ITEM"}`}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Save asset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
