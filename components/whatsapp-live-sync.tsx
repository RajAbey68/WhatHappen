'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RefreshCw, Radio, Download, AlertTriangle, Send } from 'lucide-react'
import { Project } from '@/lib/supabase'
import { projectAuthHeaders } from '@/lib/session-store'

interface ChatRow {
  remoteJid: string
  groupName: string | null
  isGroup: boolean
  buffered: number
  latest: string | null
}

interface WorkerRow {
  session_id: string
  phone: string | null
  status: string
  last_seen_at: string | null
  locked_out_until: string | null
}

export function WhatsAppLiveSync({ selectedProject }: { selectedProject: Project }) {
  const [chats, setChats] = useState<ChatRow[]>([])
  const [workers, setWorkers] = useState<WorkerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [selected, setSelected] = useState('')
  const [holder, setHolder] = useState<'free' | 'whattodo' | 'unknown'>('unknown')
  const [handoffBusy, setHandoffBusy] = useState(false)
  const [sendTo, setSendTo] = useState('')
  const [sendText, setSendText] = useState('')
  const [sending, setSending] = useState(false)
  const [queued, setQueued] = useState(0)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/whatsapp-sync?projectId=${selectedProject.id}`, {
        headers: { ...(await projectAuthHeaders(selectedProject.id)) },
      })
      if (res.ok) {
        const data = await res.json()
        setChats(data.chats ?? [])
        setWorkers(data.workers ?? [])
      }
      try {
        const h = await fetch(`/api/whatsapp-handoff?projectId=${selectedProject.id}&sessionId=session_94711730345`, {
          headers: { ...(await projectAuthHeaders(selectedProject.id)) },
        })
        if (h.ok) {
          const hd = await h.json()
          setHolder(hd.holder === 'whattodo' ? 'whattodo' : 'free')
        }
      } catch {
        setHolder('unknown')
      }
      try {
        const o = await fetch(`/api/whatsapp-send?projectId=${selectedProject.id}`, {
          headers: { ...(await projectAuthHeaders(selectedProject.id)) },
        })
        if (o.ok) {
          const od = await o.json()
          setQueued((od.rows ?? []).filter((r: { status: string }) => r.status === 'pending' || r.status === 'sending').length)
        }
      } catch {
        /* outbox unreachable — send box still works */
      }
    } finally {
      setLoading(false)
    }
  }, [selectedProject.id])

  useEffect(() => { refresh() }, [refresh])

  const syncChat = async (remoteJid: string) => {
    setSyncing(remoteJid)
    try {
      const res = await fetch('/api/whatsapp-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await projectAuthHeaders(selectedProject.id)) },
        body: JSON.stringify({ projectId: selectedProject.id, remoteJid, limit: 100 }),
      })
      if (res.ok) {
        const data = await res.json()
        alert(`Synced ${data.synced} messages from ${remoteJid}`)
        window.location.reload()
      } else {
        alert('Sync failed. The live worker may be offline — use zip upload instead.')
      }
    } finally {
      setSyncing(null)
    }
  }

  const handoff = async (action: 'takeover' | 'release') => {
    setHandoffBusy(true)
    try {
      const res = await fetch('/api/whatsapp-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await projectAuthHeaders(selectedProject.id)) },
        body: JSON.stringify({ projectId: selectedProject.id, action, sessionId: 'session_94711730345' }),
      })
      if (res.ok) {
        const data = await res.json()
        setHolder(data.holder === 'whattodo' ? 'whattodo' : 'free')
      } else {
        alert('Handoff failed — is WhatToDo running (default :4000)?')
      }
    } finally {
      setHandoffBusy(false)
    }
  }

  const queueSend = async () => {
    if (!sendTo.trim() || !sendText.trim()) return
    setSending(true)
    try {
      const res = await fetch('/api/whatsapp-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await projectAuthHeaders(selectedProject.id)) },
        body: JSON.stringify({ projectId: selectedProject.id, to: sendTo, text: sendText }),
      })
      if (res.ok) {
        setSendTo('')
        setSendText('')
        refresh()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error ?? 'Send queue failed.')
      }
    } finally {
      setSending(false)
    }
  }

  const exportZip = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/whatsapp-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await projectAuthHeaders(selectedProject.id)) },
        body: JSON.stringify({ projectId: selectedProject.id, format: 'zip' }),
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `whathappen-${selectedProject.name}.zip`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        alert('Export failed.')
      }
    } finally {
      setExporting(false)
    }
  }

  const locked = workers.find((w) => w.status === 'need_manual_relink')
  const online = workers.some((w) => w.status === 'open')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radio className="h-5 w-5" />
          Live WhatsApp Sync
        </CardTitle>
        <CardDescription>
          Pull recent messages from a group or DM into this project (small volumes, up to 100 per tap).
          Large volumes: export a zip below and re-upload, or use WhatsApp export directly.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <span className={`inline-block h-2 w-2 rounded-full ${online ? 'bg-green-500' : 'bg-slate-400'}`} />
          {online ? 'Live worker connected' : 'Live worker offline — zip upload still works'}
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {locked && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 mt-0.5" />
            <span>
              WhatsApp sync paused (cooldown{locked.locked_out_until ? ` until ${new Date(locked.locked_out_until).toLocaleString()}` : ''}).
              Re-link from the worker host, then retry. Zip upload is unaffected.
            </span>
          </div>
        )}

        {chats.length === 0 ? (
          <p className="text-sm text-slate-500">No buffered chats yet. The worker buffers messages as they arrive.</p>
        ) : (
          <div className="space-y-2">
            <select
              className="w-full rounded-md border p-2 text-sm"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Select a group or DM…</option>
              {chats.map((c) => (
                <option key={c.remoteJid} value={c.remoteJid}>
                  {c.groupName || c.remoteJid} ({c.buffered} buffered{c.isGroup ? ', group' : ''})
                </option>
              ))}
            </select>
            <Button onClick={() => selected && syncChat(selected)} disabled={!selected || !!syncing}>
              {syncing ? 'Syncing…' : 'Sync this chat (≤100)'}
            </Button>
          </div>
        )}

        <div className="border-t pt-4 space-y-2">
          <p className="text-sm font-medium">Send a task message{queued > 0 ? ` (${queued} queued)` : ''}</p>
          <p className="text-xs text-slate-500">Queued on the sync number and sent by the live worker. Waits safely when offline.</p>
          <input
            className="w-full rounded-md border p-2 text-sm"
            placeholder="To: +447359857860 or group JID…"
            value={sendTo}
            onChange={(e) => setSendTo(e.target.value)}
          />
          <textarea
            className="w-full rounded-md border p-2 text-sm"
            rows={2}
            maxLength={2000}
            placeholder="Task message…"
            value={sendText}
            onChange={(e) => setSendText(e.target.value)}
          />
          <Button onClick={queueSend} disabled={!sendTo.trim() || !sendText.trim() || sending}>
            <Send className="h-4 w-4 mr-2" />
            {sending ? 'Queueing…' : 'Queue send'}
          </Button>
        </div>

        <div className="border-t pt-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className={`inline-block h-2 w-2 rounded-full ${holder === 'whattodo' ? 'bg-blue-500' : holder === 'free' ? 'bg-green-500' : 'bg-slate-400'}`} />
            {holder === 'whattodo'
              ? 'LK number held by WhatToDo'
              : holder === 'free'
                ? 'LK number free for sync'
                : 'Number holder unknown'}
            {holder === 'whattodo' ? (
              <Button variant="outline" size="sm" onClick={() => handoff('takeover')} disabled={handoffBusy}>
                {handoffBusy ? 'Taking over…' : 'Take over for sync'}
              </Button>
            ) : holder === 'free' ? (
              <Button variant="outline" size="sm" onClick={() => handoff('release')} disabled={handoffBusy}>
                {handoffBusy ? 'Releasing…' : 'Hand back to WhatToDo'}
              </Button>
            ) : null}
          </div>
          <Button variant="outline" onClick={exportZip} disabled={exporting}>
            <Download className="h-4 w-4 mr-2" />
            {exporting ? 'Exporting…' : 'Export project as zip (large volumes)'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
