import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  try {
    return await next();
  } catch (error) {
    // 1. Always let TanStack's own errors pass through
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    console.error(error);

    // 2. CRITICAL FIX: If this is a server function call, NEVER return HTML.
    // Server functions must return JSON so the client can read error.message
    // and show a toast. Returning HTML here is what swallowed your errors.
    const url = new URL(request.url);
    const isServerFn =
      url.pathname.startsWith("/_serverFn") ||
      url.pathname.startsWith("/__serverFn") ||
      url.pathname.includes("_serverFn") ||
      request.headers.get("accept")?.includes("application/json");

    // Also: server functions are POST + x-tanstack-start header in newer versions
    const isServerFnHeader =
      request.headers.get("x-tanstack-start") !== null ||
      request.method === "POST";

    if (isServerFn || isServerFnHeader) {
      throw error; // <-- Let TanStack serialize it to JSON
    }

    // 3. Only for real page/document loads, show the pretty HTML error page
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
