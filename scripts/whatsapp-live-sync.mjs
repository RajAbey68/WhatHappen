/**
 * WhatHappen Live WhatsApp Sync Worker (Option C1).
 *
 * Runs under PM2 on Hermes-Dev alongside hermes-ingest.
 * Uses @org/baileys-core (extracted from WhatToDo) for session management —
 * lockout protection (401/403/429 -> 24h cooldown) and max-3 reconnect backoff
 * are enforced by the core, never here.
 *
 * Flow: Baileys inbound message -> upsert whatsapp_live_buffer (idempotent)
 *   -> heartbeat whatsapp_sync_state -> optional immediate forward to the
 *   project webhook when WHATHAPPEN_* env maps this chat to a project.
 * The dashboard Sync button (POST /api/whatsapp-sync) flushes buffered rows
 * for one chat into messages (small volumes, <100 default).
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (required),
 *   BAILEYS_AUTH_DIR (default ./memory_data), WHATSAPP_PHONE_NUMBER,
 *   WHATHAPPEN_WEBHOOK_URL / WHATHAPPEN_WEBHOOK_SECRET / WHATHAPPEN_PROJECT_ID
 *   (optional immediate-forward triple — all three or none).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.production") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("[live-sync] Fatal: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const WEBHOOK_URL = process.env.WHATHAPPEN_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WHATHAPPEN_WEBHOOK_SECRET;
const PROJECT_ID = process.env.WHATHAPPEN_PROJECT_ID;
const FORWARD = Boolean(WEBHOOK_URL && WEBHOOK_SECRET && PROJECT_ID);

const { BaileysSessionManager, FilePersistence } = await import("../../baileys-core/dist/index.js");

const authBaseDir = process.env.BAILEYS_AUTH_DIR || path.join(process.cwd(), "memory_data");
const manager = new BaileysSessionManager({
  authBaseDir,
  persistence: new FilePersistence(authBaseDir),
  defaultPhone: (process.env.WHATSAPP_PHONE_NUMBER || "94711730345").replace(/[^0-9]/g, ""),
  onLockout: async ({ sessionId, code, lockedOutUntil }) => {
    await supabase.from("whatsapp_sync_state").upsert({
      session_id: sessionId, status: "need_manual_relink",
      locked_out_until: lockedOutUntil, updated_at: new Date().toISOString(),
    }, { onConflict: "session_id" });
    console.error(`[live-sync] LOCKOUT ${sessionId} code=${code} until=${lockedOutUntil}`);
  },
});

manager.setMessageHandler(async (m) => {
  const messageId = `wa_${m.messageId}`;
  const { error: bufErr } = await supabase.from("whatsapp_live_buffer").upsert({
    message_id: messageId, session_id: m.sessionId, remote_jid: m.remoteJid,
    sender_jid: m.senderJid, sender_name: m.senderName.slice(0, 256),
    text: m.text.slice(0, 20000), occurred_at: m.timestampIso,
    is_group: m.isGroup, group_name: m.groupName ?? null,
  }, { onConflict: "message_id", ignoreDuplicates: true });
  if (bufErr) console.error("[live-sync] buffer upsert:", bufErr.message);

  await supabase.from("whatsapp_sync_state").upsert({
    session_id: m.sessionId, status: "open",
    last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: "session_id" });

  if (FORWARD) {
    try {
      await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-webhook-secret": WEBHOOK_SECRET },
        body: JSON.stringify({
          projectId: PROJECT_ID,
          messages: [{
            message_id: messageId, sender: m.senderName, message: m.text,
            timestamp: m.timestampIso, remote_jid: m.remoteJid,
            receiving_session_id: m.sessionId, is_group: m.isGroup, group_name: m.groupName,
          }],
        }),
      });
    } catch (e) { console.error("[live-sync] forward:", e.message); }
  }
});

async function heartbeat() {
  try {
    const s = manager.getStatus();
    for (const sess of s.sessions) {
      await supabase.from("whatsapp_sync_state").upsert({
        session_id: sess.id, phone: sess.phone, status: sess.status,
        groups: manager.getGroups(sess.id).map((g) => ({ jid: g.jid, name: g.name, memberCount: g.memberCount })),
        updated_at: new Date().toISOString(),
      }, { onConflict: "session_id" });
    }
  } catch (e) { console.error("[live-sync] heartbeat:", e.message); }
}

const OUTBOX_POLL_MS = 5000;
const OUTBOX_BATCH = 10;

async function drainOutbox() {
  // Only send while we hold an open session — rows wait otherwise.
  try {
    if (manager.getStatus().status !== "open") return;
  } catch { return; }
  let rows;
  try {
    const { data, error } = await supabase.from("whatsapp_outbox")
      .select("id, to_jid, text, attempts, max_attempts")
      .eq("status", "pending").lte("next_retry_at", new Date().toISOString())
      .order("created_at", { ascending: true }).limit(OUTBOX_BATCH);
    if (error) { console.error("[live-sync] outbox read:", error.message); return; }
    rows = data ?? [];
  } catch (e) { console.error("[live-sync] outbox read:", e.message); return; }

  for (const row of rows) {
    const { error: claimErr } = await supabase.from("whatsapp_outbox")
      .update({ status: "sending" }).eq("id", row.id).eq("status", "pending");
    if (claimErr) continue; // lost the claim — single instance, still safe
    try {
      await manager.sendText(null, row.to_jid, row.text);
      await supabase.from("whatsapp_outbox")
        .update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", row.id);
      console.log(`[live-sync] sent outbox ${row.id} -> ${row.to_jid}`);
    } catch (e) {
      const attempts = (row.attempts ?? 0) + 1;
      const exhausted = attempts >= (row.max_attempts ?? 3);
      await supabase.from("whatsapp_outbox").update({
        status: exhausted ? "failed" : "pending",
        attempts,
        last_error: String(e.message ?? e).slice(0, 500),
        next_retry_at: new Date(Date.now() + 60_000 * attempts).toISOString(),
      }).eq("id", row.id);
      console.error(`[live-sync] outbox ${row.id} failed (attempt ${attempts}):`, e.message);
    }
  }
}

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

await manager.init();
setInterval(heartbeat, 30_000);
setInterval(drainOutbox, OUTBOX_POLL_MS);
console.log("[live-sync] started. Forward:", FORWARD ? "on" : "buffer-only");
