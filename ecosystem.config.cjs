// PM2 ecosystem — WhatHappen live WhatsApp sync worker (Option C1: baileys-core).
// Deploy to /root/WhatHappen on Hermes-Dev. Existing processes (whathappen,
// hermes-ingest, whathappen-upload) are untouched — this file manages only
// whatsapp-live-sync. Start with: pm2 start ecosystem.config.cjs
//
// Restart policy is deliberately conservative: a crash-looping Baileys client
// looks like ban-evasion hammering to Meta (+94711730345 has lockout history).
// The core already caps in-process reconnects at 3 with 60/120/240s backoff and
// parks lockouts (401/403/429) for 24h; these PM2 limits are the outer guard.
module.exports = {
  apps: [
    {
      name: "whatsapp-live-sync",
      script: "./scripts/whatsapp-live-sync.mjs",
      cwd: "/root/WhatHappen",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      restart_delay: 30000, // 30s between restarts — never hammer Meta
      max_restarts: 10, // then stay down for human review (see deploy checklist)
      min_uptime: 60000, // <60s uptime counts as a crash, not a healthy run
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        // Isolated auth dir — MUST NOT match WhatToDo's memory_data/baileys_auth_*.
        BAILEYS_AUTH_DIR: "/root/WhatHappen/memory_data/live",
        // UK work number. LK +94711730345 stays on WhatToDo (dual Baileys
        // sessions on one number cause login conflicts); UK trade +447733393956
        // is for partnership inquiries, not sync.
        WHATSAPP_PHONE_NUMBER: "447359857860",
        // Optional immediate-forward triple (all three or none; unset = buffer-only,
        // dashboard Sync button flushes on demand):
        // WHATHAPPEN_WEBHOOK_URL: "http://127.0.0.1:3000/api/process-whatsapp-complete",
        // WHATHAPPEN_WEBHOOK_SECRET: "<from server env — never commit>",
        // WHATHAPPEN_PROJECT_ID: "<target project uuid>",
      },
    },
  ],
};
