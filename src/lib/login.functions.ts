import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Turns a username into the account's email on the server, so staff can sign in with
 * either. The email is never returned to the browser.
 */
export const signInWithUsername = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ username: z.string().trim().min(2).max(80), password: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .ilike("username", data.username)
      .maybeSingle();
    if (!row?.email) return { error: "Wrong username or password." } as const;
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const client = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: res, error } = await client.auth.signInWithPassword({
      email: row.email,
      password: data.password,
    });
    if (error || !res.session) return { error: "Wrong username or password." } as const;
    return {
      access_token: res.session.access_token,
      refresh_token: res.session.refresh_token,
    } as const;
  });
