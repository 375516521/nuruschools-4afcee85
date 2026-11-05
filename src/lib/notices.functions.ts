import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getSchoolNotices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ school_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: notices, error } = await context.supabase
      .from("notices")
      .select("*")
      .eq("school_id", data.school_id)
      .order("created_at", { ascending: false });

    if (error) return { notices: [] };
    return { notices: notices || [] };
  });

export const publishNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: unknown) =>
      z
        .object({
          school_id: z.string().uuid(),
          title: z.string().min(3),
          body: z.string().min(5),
          target_grade: z.string().nullable().optional(),
          send_whatsapp: z.boolean().default(false),
        })
        .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: notice, error } = await context.supabase
      .from("notices")
      .insert({
        school_id: data.school_id,
        title: data.title,
        body: data.body,
        target_grade: data.target_grade || null,
        created_by: context.userId,
      })
      .select()
      .single();

    if (error) return { error: error.message };

    if (data.send_whatsapp) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: gw } = await supabaseAdmin
        .from("school_gateway_settings")
        .select("whatsapp_api_key, whatsapp_sender_id")
        .eq("school_id", data.school_id)
        .maybeSingle();

      if (gw?.whatsapp_api_key && gw?.whatsapp_sender_id) {
        let q = supabaseAdmin
          .from("students")
          .select("guardian_phone, first_name, last_name")
          .eq("school_id", data.school_id)
          .eq("is_active", true);

        if (data.target_grade) q = q.eq("grade", data.target_grade);
        const { data: students } = await q;

        const phones = Array.from(
          new Set((students || []).map((s) => (s as any).guardian_phone).filter(Boolean)),
        );

        // Dispatches notice payload to WhatsApp gateway provider
        await Promise.allSettled(
          phones.slice(0, 100).map(async (phone) => {
            const cleanPhone = "254" + phone.replace(/\D/g, "").slice(-9);
            await fetch("https://api.whatsapp.com/v1/messages", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${gw.whatsapp_api_key}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: gw.whatsapp_sender_id,
                to: cleanPhone,
                type: "text",
                text: { body: `*${data.title}*\n\n${data.body}\n\n- School Notice` },
              }),
            }).catch(() => null);
          }),
        );
      }
    }

    return { ok: true, notice };
  });
