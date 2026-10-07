/** Browser-safe canonical module catalogue shared with server validation. */
export const SCHOOL_MODULES: { key: string; route: string; label: string }[] = [
  { key: "dashboard", route: "/dashboard", label: "Dashboard" },
  { key: "learners", route: "/students", label: "Learners" },
  { key: "attendance", route: "/attendance", label: "Attendance" },
  { key: "id_cards", route: "/id-cards", label: "ID Card Centre" },
  { key: "exams_marks", route: "/marks", label: "Exams & Marks" },
  { key: "exam_analytics", route: "/exams", label: "Exam Analytics" },
  { key: "report_cards", route: "/reports", label: "Report Cards" },
  { key: "promotions", route: "/promotions", label: "Promotions" },
  { key: "fees_finance", route: "/fees", label: "Fees & Finance" },
  { key: "library", route: "/library", label: "Library" },
  { key: "assets", route: "/assets", label: "Assets" },
  { key: "settings", route: "/settings", label: "Settings" },
  { key: "users_schools", route: "/users", label: "Users & Accounts" },
];
export const TEACHER_MODULES = SCHOOL_MODULES.filter((m) => !["dashboard", "settings", "users_schools", "promotions"].includes(m.key));