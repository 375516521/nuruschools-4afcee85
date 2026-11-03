import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Loader2, BookOpen, Undo2, Search } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { AppShell, useSession } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/library")({
  component: LibraryPage,
});

function LibraryPage() {
  const { data: session } = useSession();
  const schoolId = (session?.profile as { school_id?: string } | null)?.school_id ?? null;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [issueFor, setIssueFor] = useState<{ id: string; title: string } | null>(null);
  const [studentId, setStudentId] = useState("");
  const [q, setQ] = useState("");

  const { data: books } = useQuery({
    queryKey: ["library-books", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (await supabase.from("library_books").select("*").eq("school_id", schoolId!).order("title"))
        .data ?? [],
  });

  const { data: loans } = useQuery({
    queryKey: ["library-loans", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (
        await supabase
          .from("library_loans")
          .select("*, library_books(title), students(adm_no, first_name, last_name)")
          .eq("school_id", schoolId!)
          .is("returned_on", null)
          .order("borrowed_on", { ascending: false })
      ).data ?? [],
  });

  const { data: students } = useQuery({
    queryKey: ["lib-students", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (
        await supabase
          .from("students")
          .select("id, adm_no, first_name, last_name")
          .eq("school_id", schoolId!)
          .eq("status", "active")
          .order("adm_no")
          .limit(2000)
      ).data ?? [],
  });

  const addBook = useMutation({
    mutationFn: async (form: FormData) => {
      const title = String(form.get("title") ?? "").trim().toUpperCase();
      if (!title) throw new Error("Enter the book title.");
      const copies = Math.max(1, Number(form.get("total_copies") ?? 1));
      const { error } = await supabase.from("library_books").insert({
        school_id: schoolId!,
        title,
        author: String(form.get("author") ?? "").trim().toUpperCase() || null,
        isbn: String(form.get("isbn") ?? "").trim() || null,
        category: String(form.get("category") ?? "").trim() || null,
        shelf: String(form.get("shelf") ?? "").trim() || null,
        total_copies: copies,
        available_copies: copies,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Book added to the catalogue.");
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["library-books"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const issue = useMutation({
    mutationFn: async () => {
      if (!issueFor || !studentId) throw new Error("Choose a learner.");
      const book = (books ?? []).find((b) => b.id === issueFor.id);
      if (!book || book.available_copies < 1) throw new Error("No copies available.");
      const due = new Date();
      due.setDate(due.getDate() + 14);
      const { error } = await supabase.from("library_loans").insert({
        school_id: schoolId!,
        book_id: issueFor.id,
        student_id: studentId,
        due_on: due.toISOString().slice(0, 10),
      });
      if (error) throw error;
      const { error: uErr } = await supabase
        .from("library_books")
        .update({ available_copies: book.available_copies - 1 })
        .eq("id", book.id);
      if (uErr) throw uErr;
    },
    onSuccess: () => {
      toast.success("Book issued — due in 14 days.");
      setIssueFor(null);
      setStudentId("");
      void qc.invalidateQueries({ queryKey: ["library-books"] });
      void qc.invalidateQueries({ queryKey: ["library-loans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const giveBack = useMutation({
    mutationFn: async (loan: { id: string; book_id: string }) => {
      const { error } = await supabase
        .from("library_loans")
        .update({ returned_on: new Date().toISOString().slice(0, 10) })
        .eq("id", loan.id);
      if (error) throw error;
      const book = (books ?? []).find((b) => b.id === loan.book_id);
      if (book) {
        await supabase
          .from("library_books")
          .update({ available_copies: Math.min(book.total_copies, book.available_copies + 1) })
          .eq("id", book.id);
      }
    },
    onSuccess: () => {
      toast.success("Return recorded.");
      void qc.invalidateQueries({ queryKey: ["library-books"] });
      void qc.invalidateQueries({ queryKey: ["library-loans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = (books ?? []).filter((b) =>
    `${b.title} ${b.author ?? ""} ${b.isbn ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <AppShell
      title="Library"
      subtitle={`${books?.length ?? 0} titles · ${loans?.length ?? 0} books out`}
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="size-4" /> Add book
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a book to the catalogue</DialogTitle>
              <DialogDescription>Copies available update automatically as books are issued.</DialogDescription>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                addBook.mutate(new FormData(e.currentTarget));
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" required />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="author">Author</Label>
                  <Input id="author" name="author" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="isbn">ISBN</Label>
                  <Input id="isbn" name="isbn" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="category">Category</Label>
                  <Input id="category" name="category" placeholder="Course book / Fiction" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="shelf">Shelf</Label>
                  <Input id="shelf" name="shelf" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="copies">Copies</Label>
                  <Input id="copies" name="total_copies" type="number" min={1} defaultValue={1} />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={addBook.isPending}>
                  {addBook.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Add book
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="relative mb-4 max-w-md">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, author or ISBN" className="pl-9" />
      </div>

      <div className="card-karli mb-6 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Author</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Shelf</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead className="text-right">Issue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  <BookOpen className="mx-auto mb-2 size-6" /> No books catalogued yet.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium uppercase">{b.title}</TableCell>
                  <TableCell className="uppercase">{b.author ?? "—"}</TableCell>
                  <TableCell>{b.category ?? "—"}</TableCell>
                  <TableCell>{b.shelf ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={b.available_copies > 0 ? "default" : "secondary"}>
                      {b.available_copies}/{b.total_copies}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={b.available_copies < 1}
                      onClick={() => setIssueFor({ id: b.id, title: b.title })}
                    >
                      Issue
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <h2 className="mb-2 font-display font-semibold">Books currently out</h2>
      <div className="card-karli overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Book</TableHead>
              <TableHead>Learner</TableHead>
              <TableHead>Borrowed</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(loans ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Nothing is on loan.
                </TableCell>
              </TableRow>
            ) : (
              (loans ?? []).map((l) => {
                const st = (l as { students?: { adm_no?: string; first_name?: string; last_name?: string } }).students;
                const overdue = l.due_on ? new Date(l.due_on) < new Date() : false;
                return (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium uppercase">
                      {(l as { library_books?: { title?: string } }).library_books?.title ?? "—"}
                    </TableCell>
                    <TableCell className="uppercase">
                      {st ? `${st.first_name} ${st.last_name} (${st.adm_no})` : "—"}
                    </TableCell>
                    <TableCell>{l.borrowed_on}</TableCell>
                    <TableCell className={overdue ? "font-semibold text-destructive" : ""}>
                      {l.due_on ?? "—"}
                      {overdue ? " · overdue" : ""}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => giveBack.mutate({ id: l.id, book_id: l.book_id })}>
                        <Undo2 className="size-4" /> Return
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!issueFor} onOpenChange={(v) => !v && setIssueFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue “{issueFor?.title}”</DialogTitle>
            <DialogDescription>The book is due back in 14 days.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Learner</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger>
                <SelectValue placeholder="Select learner" />
              </SelectTrigger>
              <SelectContent>
                {(students ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.adm_no} — {s.first_name} {s.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button onClick={() => issue.mutate()} disabled={issue.isPending || !studentId}>
              {issue.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Issue book
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
