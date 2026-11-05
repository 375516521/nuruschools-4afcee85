import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * M-Pesa callback for one school. Accepts both STK Push results and C2B (Till/Paybill)
 * confirmations. The caller must pass the school's secret `?token=` (shown in Settings),
 * because Safaricom does not sign callbacks.
 * Matching: account number = admission number, else payer phone = guardian phone,
 * else the payment goes to the Unmatched Queue for the bursar to assign.
 */
const c2bSchema = z.object({
  TransID: z.string().max(40),
  TransAmount: z.union([z.string(), z.number()]),
  BillRefNumber: z.string().max(60).optional().default(""),
  MSISDN: z.union([z.string(), z.number()]).optional(),
  FirstName: z.string().max(60).optional(),
});

function ok() {
  return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
}

export const Route = createFileRoute("/api/public/mpesa/callback/$schoolId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const schoolId = params.schoolId;
        if (!/^[0-9a-f-]{36}$/i.test(schoolId)) return new Response("Bad school", { status: 400 });
        const token = new URL(request.url).searchParams.get("token") ?? "";
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: gw } = await supabaseAdmin
          .from("school_gateway_settings")
          .select("callback_token")
          .eq("school_id", schoolId)
          .maybeSingle();
        if (!gw || !token || gw.callback_token !== token) return new Response("Unauthorized", { status: 401 });

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        // Normalise STK and C2B payloads.
        let receipt = "", amount = 0, account = "", phone = "", payer = "", checkoutId: string | null = null;
        const stk = (body as { Body?: { stkCallback?: Record<string, unknown> } })?.Body?.stkCallback;
        if (stk) {
          checkoutId = String(stk["CheckoutRequestID"] ?? "");
          if (Number(stk["ResultCode"]) !== 0) {
            await supabaseAdmin
              .from("mpesa_transactions")
              .update({ status: "failed", result_code: String(stk["ResultCode"]), result_desc: String(stk["ResultDesc"] ?? "") })
              .eq("checkout_request_id", checkoutId);
            return ok();
          }
          const items = ((stk["CallbackMetadata"] as { Item?: { Name: string; Value?: unknown }[] })?.Item ?? []);
          const get = (n: string) => items.find((i) => i.Name === n)?.Value;
          receipt = String(get("MpesaReceiptNumber") ?? "");
          amount = Number(get("Amount") ?? 0);
          phone = String(get("PhoneNumber") ?? "");
          const { data: pending } = await supabaseAdmin
            .from("mpesa_transactions")
            .select("account_reference")
            .eq("checkout_request_id", checkoutId)
            .maybeSingle();
          account = pending?.account_reference ?? "";
        } else {
          const parsed = c2bSchema.safeParse(body);
          if (!parsed.success) return new Response("Invalid payload", { status: 400 });
          receipt = parsed.data.TransID;
          amount = Number(parsed.data.TransAmount);
          account = parsed.data.BillRefNumber.trim();
          phone = String(parsed.data.MSISDN ?? "");
          payer = parsed.data.FirstName ?? "";
        }
        if (!receipt || !(amount > 0)) return new Response("Invalid amount", { status: 400 });

        // Idempotency: ignore a receipt already recorded.
        const { data: dup } = await supabaseAdmin
          .from("mpesa_transactions")
          .select("id")
          .eq("school_id", schoolId)
          .eq("mpesa_receipt", receipt)
          .maybeSingle();
        if (dup) return ok();

        const { data: student } = account
          ? await supabaseAdmin
              .from("students")
              .select("id")
              .eq("school_id", schoolId)
              .ilike("adm_no", account)
              .maybeSingle()
          : { data: null };
        let studentId = student?.id ?? null;
        if (!studentId && phone) {
          const last9 = phone.replace(/\D/g, "").slice(-9);
          const { data: byPhone } = await supabaseAdmin
            .from("students")
            .select("id")
            .eq("school_id", schoolId)
            .eq("status", "active")
            .ilike("guardian_phone", `%${last9}`);
          if (byPhone && byPhone.length === 1) studentId = byPhone[0]!.id;
        }

        const { data: term } = await supabaseAdmin
          .from("terms")
          .select("id")
          .eq("school_id", schoolId)
          .eq("is_active", true)
          .maybeSingle();

        let paymentId: string | null = null;
        if (studentId && term) {
          const { data: pay } = await supabaseAdmin
            .from("fee_payments")
            .insert({ school_id: schoolId, student_id: studentId, term_id: term.id, amount, method: "mpesa", reference: receipt })
            .select("id")
            .single();
          paymentId = pay?.id ?? null;
        }

        const row = {
          school_id: schoolId,
          student_id: studentId,
          term_id: term?.id ?? null,
          phone: phone || "unknown",
          amount,
          account_reference: account || null,
          mpesa_receipt: receipt,
          payer_name: payer || null,
          payment_id: paymentId,
          status: paymentId ? "matched" : "unmatched",
        };
        if (checkoutId) {
          await supabaseAdmin.from("mpesa_transactions").update(row).eq("checkout_request_id", checkoutId);
        } else {
          await supabaseAdmin.from("mpesa_transactions").insert(row);
        }
        return ok();
      },
    },
  },
});
