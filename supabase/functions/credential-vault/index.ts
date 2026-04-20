/**
 * credential-vault — leitura/escrita do cofre de credenciais do cliente.
 *
 * Actions (POST body { action, ... }):
 *   - list     { clientId }                                    → metadata only
 *   - create   { clientId, workspaceId, nodeId?, ...fields, secret? }
 *   - update   { id, ...fields, secret? }
 *   - delete   { id }
 *   - reveal   { id }                                          → retorna secret em texto plano + LOG
 *
 * Segurança:
 *   - Auth obrigatório
 *   - reveal exige role 'admin' (via has_role do schema)
 *   - Cifra com pgp_sym_encrypt(text, CREDENTIAL_VAULT_KEY)
 *   - Toda reveal grava em credential_audit_log
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Action = "list" | "create" | "update" | "delete" | "reveal";

interface ReqBody {
  action: Action;
  clientId?: string;
  workspaceId?: string;
  nodeId?: string | null;
  id?: string;
  category?: "platform" | "hosting_dns" | "cms" | "social_email" | "other";
  service_name?: string;
  label?: string;
  login_url?: string;
  username?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  /** Texto plano da senha — nunca persistido, sempre criptografado antes */
  secret?: string | null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const VAULT_KEY = Deno.env.get("CREDENTIAL_VAULT_KEY");

    if (!VAULT_KEY) return jsonResponse({ error: "Vault key not configured" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

    // Authed client (RLS-aware) — pra checar acesso e ler/gravar metadados
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    // Admin client (service role) — pra rodar pgp_sym_* e gravar audit_log
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = (await req.json()) as ReqBody;
    if (!body.action) return jsonResponse({ error: "Missing action" }, 400);

    // ─── LIST ─────────────────────────────────────────────────────────
    if (body.action === "list") {
      if (!body.clientId) return jsonResponse({ error: "clientId required" }, 400);
      const { data, error } = await userClient
        .from("client_credentials")
        .select(
          "id, workspace_id, client_id, node_id, category, service_name, label, login_url, username, notes, metadata, created_at, updated_at, last_revealed_at, last_revealed_by, created_by",
        )
        .eq("client_id", body.clientId)
        .order("category", { ascending: true })
        .order("service_name", { ascending: true });
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ credentials: data ?? [] });
    }

    // ─── CREATE ───────────────────────────────────────────────────────
    if (body.action === "create") {
      if (!body.clientId || !body.workspaceId || !body.service_name) {
        return jsonResponse({ error: "Missing required fields" }, 400);
      }
      // Encrypt secret server-side via SQL fn (não temos pgp em JS aqui)
      let cipher: string | null = null;
      if (body.secret && body.secret.length > 0) {
        const { data: enc, error: encErr } = await admin.rpc("vault_encrypt", {
          plain: body.secret,
          key: VAULT_KEY,
        });
        if (encErr) return jsonResponse({ error: "Encrypt failed: " + encErr.message }, 500);
        cipher = enc as string; // returned as bytea hex
      }
      const { data: row, error } = await userClient
        .from("client_credentials")
        .insert({
          workspace_id: body.workspaceId,
          client_id: body.clientId,
          node_id: body.nodeId ?? null,
          category: body.category ?? "platform",
          service_name: body.service_name,
          label: body.label ?? null,
          login_url: body.login_url ?? null,
          username: body.username ?? null,
          notes: body.notes ?? null,
          metadata: body.metadata ?? {},
          secret_cipher: cipher,
          created_by: user.id,
        })
        .select(
          "id, workspace_id, client_id, node_id, category, service_name, label, login_url, username, notes, metadata, created_at, updated_at, last_revealed_at, last_revealed_by, created_by",
        )
        .maybeSingle();
      if (error) return jsonResponse({ error: error.message }, 400);
      await admin.from("credential_audit_log").insert({
        credential_id: row!.id, workspace_id: row!.workspace_id, user_id: user.id, action: "create",
      });
      return jsonResponse({ credential: row });
    }

    // ─── UPDATE ───────────────────────────────────────────────────────
    if (body.action === "update") {
      if (!body.id) return jsonResponse({ error: "id required" }, 400);
      const patch: Record<string, unknown> = {};
      for (const k of ["category", "service_name", "label", "login_url", "username", "notes", "metadata"] as const) {
        if (body[k] !== undefined) patch[k] = body[k];
      }
      // Re-encrypt only when the user explicitly sent `secret` field
      if (body.secret !== undefined) {
        if (body.secret === null || body.secret === "") {
          patch.secret_cipher = null;
        } else {
          const { data: enc, error: encErr } = await admin.rpc("vault_encrypt", {
            plain: body.secret, key: VAULT_KEY,
          });
          if (encErr) return jsonResponse({ error: "Encrypt failed: " + encErr.message }, 500);
          patch.secret_cipher = enc;
        }
      }
      const { data: row, error } = await userClient
        .from("client_credentials").update(patch).eq("id", body.id)
        .select(
          "id, workspace_id, client_id, node_id, category, service_name, label, login_url, username, notes, metadata, created_at, updated_at, last_revealed_at, last_revealed_by, created_by",
        )
        .maybeSingle();
      if (error) return jsonResponse({ error: error.message }, 400);
      if (row) {
        await admin.from("credential_audit_log").insert({
          credential_id: row.id, workspace_id: row.workspace_id, user_id: user.id, action: "update",
        });
      }
      return jsonResponse({ credential: row });
    }

    // ─── DELETE ───────────────────────────────────────────────────────
    if (body.action === "delete") {
      if (!body.id) return jsonResponse({ error: "id required" }, 400);
      // Read first so we can audit
      const { data: existing } = await userClient
        .from("client_credentials").select("id, workspace_id").eq("id", body.id).maybeSingle();
      const { error } = await userClient.from("client_credentials").delete().eq("id", body.id);
      if (error) return jsonResponse({ error: error.message }, 400);
      if (existing) {
        await admin.from("credential_audit_log").insert({
          credential_id: existing.id, workspace_id: existing.workspace_id, user_id: user.id, action: "delete",
        });
      }
      return jsonResponse({ ok: true });
    }

    // ─── REVEAL ───────────────────────────────────────────────────────
    if (body.action === "reveal") {
      if (!body.id) return jsonResponse({ error: "id required" }, 400);

      // Admin role check — has_role(uid, 'admin')
      const { data: isAdmin, error: roleErr } = await userClient.rpc("has_role", {
        _user_id: user.id, _role: "admin",
      });
      if (roleErr || !isAdmin) {
        return jsonResponse({ error: "Apenas admins podem revelar credenciais" }, 403);
      }

      // Fetch row + decrypt with admin client
      const { data: row, error: rowErr } = await admin
        .from("client_credentials")
        .select("id, workspace_id, secret_cipher, service_name")
        .eq("id", body.id).maybeSingle();
      if (rowErr || !row) return jsonResponse({ error: "Not found" }, 404);

      if (!row.secret_cipher) return jsonResponse({ secret: null, service_name: row.service_name });

      const { data: plain, error: decErr } = await admin.rpc("vault_decrypt", {
        cipher: row.secret_cipher, key: VAULT_KEY,
      });
      if (decErr) return jsonResponse({ error: "Decrypt failed: " + decErr.message }, 500);

      // Update last_revealed_at + audit
      await admin.from("client_credentials")
        .update({ last_revealed_at: new Date().toISOString(), last_revealed_by: user.id })
        .eq("id", body.id);
      await admin.from("credential_audit_log").insert({
        credential_id: row.id, workspace_id: row.workspace_id, user_id: user.id, action: "reveal",
      });

      return jsonResponse({ secret: plain, service_name: row.service_name });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("credential-vault error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});
