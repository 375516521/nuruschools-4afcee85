import { StaffActions } from "@/components/staff-actions";

// ... inside your map / table row:
<td>
  <StaffActions
    staff={{
      user_id: teacher.user_id,
      school_id: teacher.school_id,
      full_name: teacher.full_name,
      username: teacher.username,
      phone: teacher.phone,
      tsc_number: teacher.tsc_number,
    }}
    kind="teacher" // use kind="hoi" on the HOI list
    onDone={() => refetchTeachers()} // reload list after edit/delete
  />
</td>
