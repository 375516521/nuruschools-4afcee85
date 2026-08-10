import { supabase } from "@/integrations/supabase/client";

/** Fire-and-forget audit trail entry for sensitive actions. */
export function logAudit(action: string, entity?: string, entityId?: string) {
  void supabase.rpc("log_audit", {
    _action: action,
    ...(entity ? { _entity: entity } : {}),
    ...(entityId ? { _entity_id: entityId } : {}),
  });
}
