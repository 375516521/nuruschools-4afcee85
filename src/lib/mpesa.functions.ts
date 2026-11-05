import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const stkSchema = z.object({
  school_id: z.string().uuid(),
  student_id: z.string().uuid(),
  phone: z.string().min(9).max(15),
  amount: z.number().int().min(1).max(500000),
});

/** Sends an M-Pesa STK Push prompt to the parent's phone using the school's own Daraja keys. */
export const sendStkPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => stkSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_school_admin", { _school: data.school_id });
    if (!isAdmin) return { error: "Only the school's admin can request payments." };
    const { data: st } = await context.supabase
      .from("students")
      .select("adm_no")
      .eq("id", data.student_id)
      .eq("school_id", data.school_id)
      .maybeSingle();
    if (!st) return { error: "Account not found" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: gw } = await supabaseAdmin
      .from("school_gateway_settings")
      .select("*")
      .eq("school_id", data.school_id)
      .maybeSingle();
    if (!gw?.mpesa_consumer_key || !gw.mpesa_consumer_secret || !gw.mpesa_passkey || !gw.mpesa_shortcode)
      return { error: "Add the M-Pesa keys in Settings → Payments & WhatsApp first." };

    const base = gw.mpesa_environment === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
    const auth = btoa(`${gw.mpesa_consumer_key}:${gw.mpesa_consumer_secret}`);
    const tokRes = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!tokRes.ok) return { error: "M-Pesa rejected the keys. Check them in Settings." };
    const { access_token } = (await tokRes.json()) as { access_token: string };

    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const ts = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
    const password = btoa(`${gw.mpesa_shortcode}${gw.mpesa_passkey}${ts}`);
    const phone = "254" + data.phone.replace(/\D/g, "").slice(-9);
    const origin = new URL(process.env["SITE_URL"] ?? "https://fanistechschools.lovable.app").origin;
    const res = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: gw.mpesa_shortcode,
        Password: password,
        Timestamp: ts,
        TransactionType: gw.mpesa_till ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline",
        Amount: data.amount,
        PartyA: phone,
        PartyB: gw.mpesa_till || gw.mpesa_shortcode,
        PhoneNumber: phone,
        CallBackURL: `${origin}/api/public/mpesa/callback/${data.school_id}?token=${gw.callback_token}`,
        AccountReference: st.adm_no.slice(0, 12),
        TransactionDesc: "School fees",
      }),
    });
    const out = (await res.json()) as { CheckoutRequestID?: string; MerchantRequestID?: string; errorMessage?: string };
    if (!res.ok || !out.CheckoutRequestID) return { error: out.errorMessage ?? "M-Pesa could not send the prompt." };
    await supabaseAdmin.from("mpesa_transactions").insert({
      school_id: data.school_id,
      student_id: data.student_id,
      phone,
      amount: data.amount,
      account_reference: st.adm_no,
      checkout_request_id: out.CheckoutRequestID,
      merchant_request_id: out.MerchantRequestID ?? null,
      status: "pending",
      initiated_by: context.userId,
    });
    return { ok: true as const };
  });
