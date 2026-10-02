import { supabase } from "@/integrations/supabase/client";

/** Fire-and-forget audit trail entry for sensitive actions. Extra details are folded into the action label. */
export function logAudit(
  action: string,
  entity?: string,
  entityId?: string | null,
  details?: Record<string, unknown>,
) {
  const label = details ? `${action} ${JSON.stringify(details)}`.slice(0, 500) : action;
  void supabase.rpc("log_audit", {
    _action: label,
    ...(entity ? { _entity: entity } : {}),
    ...(entityId ? { _entity_id: entityId } : {}),
  });
}
