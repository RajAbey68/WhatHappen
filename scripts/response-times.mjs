#!/usr/bin/env node
/**
 * Response-time analysis per chat (upload batch), run LOCALLY.
 * Decrypts ONLY the sender field. Message bodies are never fetched.
 * Passphrase is read from the terminal and never leaves this process.
 *
 * Usage:  node scripts/response-times.mjs [--me "rajiv|raj\\b"] [--cap-hours 48]
 */
import { createClient } from '@supabase/supabase-js'
import { webcrypto as crypto } from 'crypto'
import dotenv from 'dotenv'
import readline from 'readline'

dotenv.config({ path: '.env.local' })
const PROJECT = process.env.WHATHAPPEN_PROJECT_ID || '7ba94f4c-fb4e-4ee4-bc90-19984c5a8b59'
const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const ME = new RegExp(opt('--me', 'rajiv|\\braj\\b'), 'i')
const CAP_H = Number(opt('--cap-hours', '48'))

const ask = q => new Promise(r => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.stdoutMuted = true
  rl.question(q, a => { rl.close(); process.stdout.write('\n'); r(a) })
  rl._writeToOutput = () => {}
})

const hex = h => Uint8Array.from(h.match(/../g).map(b => parseInt(b, 16)))
async function keyFor(pass, saltHex) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: hex(saltHex), iterations: 100000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
}
async function dec(key, { ciphertext, iv }) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: hex(iv) }, key, hex(ciphertext))
  return new TextDecoder().decode(pt)
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
let rows = [], from = 0
for (;;) {
  const { data, error } = await sb.from('messages').select('sender,timestamp,created_at').eq('project_id', PROJECT).range(from, from + 999)
  if (error) throw error
  rows.push(...data); if (data.length < 1000) break; from += 1000
}
console.log(`fetched ${rows.length} rows (sender+timestamp only)`)

const pass = await ask('Passphrase: ')
const keys = new Map(), cache = new Map()
const batches = new Map()
for (const r of rows) {
  const s = JSON.parse(r.sender)
  if (!keys.has(s.salt)) keys.set(s.salt, await keyFor(pass, s.salt))
  const ck = s.salt + s.iv + s.ciphertext
  let name = cache.get(ck)
  if (!name) { try { name = await dec(keys.get(s.salt), s); } catch { console.error('decrypt failed — wrong passphrase?'); process.exit(1) } cache.set(ck, name) }
  const b = s.salt.slice(0, 8)
  if (!batches.has(b)) batches.set(b, [])
  batches.get(b).push({ name, t: Date.parse(r.timestamp) })
}

const stats = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y)
  const q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))]
  return { n: s.length, median_min: +(q(.5) / 6e4).toFixed(1), mean_min: +(s.reduce((x, y) => x + y, 0) / s.length / 6e4).toFixed(1), p90_h: +(q(.9) / 36e5).toFixed(1) } }

for (const [b, msgs] of batches) {
  msgs.sort((x, y) => x.t - y.t)
  const people = [...new Set(msgs.map(m => m.name))]
  const all = [], byResponder = {}, mine = msgs.filter(m => ME.test(m.name)).length
  for (let i = 0; i < msgs.length - 1; i++) {
    if (!ME.test(msgs[i].name)) continue
    if (ME.test(msgs[i + 1].name)) continue            // end of my run only
    const d = msgs[i + 1].t - msgs[i].t
    if (d < 0 || d > CAP_H * 36e5) continue
    all.push(d); (byResponder[msgs[i + 1].name] ??= []).push(d)
  }
  console.log(`\n=== batch ${b}  (${msgs.length} msgs, ${mine} from me, ${new Date(msgs[0].t).toISOString().slice(0,10)} → ${new Date(msgs.at(-1).t).toISOString().slice(0,10)})`)
  console.log('participants:', people.join(' | '))
  console.log('reply to my outbound:', stats(all))
  for (const [who, arr] of Object.entries(byResponder).sort((a, b) => b[1].length - a[1].length).slice(0, 8))
    console.log(`  ${who.padEnd(40)}`, stats(arr))
}
