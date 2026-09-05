#!/usr/bin/env node

/**
 * Live Remote Efficiency & Latency Benchmark Runner
 *
 * Runs a battery of tests from your local machine against Hermes (or any target URL)
 * to measure round-trip network latency, auth handshake speed, data payload streaming,
 * and end-to-end RAG inference against our <1.5s baseline.
 *
 * Usage:
 *   node scripts/benchmark-hermes.mjs
 *   WHATHAPPEN_API_URL=http://167.233.236.178:3000 npm run bench:remote
 */

import crypto from 'crypto'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

// Load environment variables
const envPath = fs.existsSync('.env.local') ? '.env.local' : '.env'
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

const TARGET_URL = process.env.WHATHAPPEN_API_URL || 'http://167.233.236.178:3000'
const PROJECT_ID = process.env.WHATHAPPEN_PROJECT_ID || '7ba94f4c-fb4e-4ee4-bc90-19984c5a8b59'
const PASSPHRASE_HASH = process.env.WHATSAPP_PASSPHRASE_HASH || '74fdebb706158a201a3dcbc3e6a2593dafa51cbbcb889c72952ec2dbc1312b14'

console.log('\n🚀 Starting Remote Efficiency Benchmark')
console.log(`🌐 Target:  ${TARGET_URL}`)
console.log(`📁 Project: ${PROJECT_ID}`)
console.log(`⏱️  Target Baseline SLA: < 1500ms End-to-End RAG\n`)

const results = []

async function measure(name, fn, targetSlaMs = 500) {
  process.stdout.write(`  ⏳ Testing: ${name.padEnd(45)} `)
  const start = performance.now()
  try {
    const data = await fn()
    const duration = Math.round(performance.now() - start)
    const passed = duration <= targetSlaMs
    const status = passed ? '✅ PASS' : '⚠️ WARN'
    console.log(`${status} [${duration}ms] (Target: <${targetSlaMs}ms)`)
    results.push({ name, duration, passed, targetSlaMs, data })
    return data
  } catch (err) {
    const duration = Math.round(performance.now() - start)
    console.log(`❌ FAIL [${duration}ms] (${err.message})`)
    results.push({ name, duration, passed: false, targetSlaMs, error: err.message })
    return null
  }
}

async function runBenchmark() {
  // 1. Health & Server TTFB Check
  await measure('1. Server Root TTFB & HTTP Ping', async () => {
    const res = await fetch(`${TARGET_URL}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.status
  }, 350)

  // 2. Auth Challenge Nonce Retrieval
  let nonce = null
  await measure('2. GET /api/auth/challenge (Nonce issuance)', async () => {
    const res = await fetch(`${TARGET_URL}/api/auth/challenge?projectId=${PROJECT_ID}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    const json = await res.json()
    nonce = json.nonce
    if (!nonce) throw new Error('No nonce returned')
    return json
  }, 250)

  // 3. Challenge-Response Token Minting (HMAC Proof)
  let projectToken = null
  if (nonce) {
    await measure('3. POST /api/project-token (HMAC Handshake)', async () => {
      const proof = crypto.createHmac('sha256', PASSPHRASE_HASH).update(nonce).digest('hex')
      const res = await fetch(`${TARGET_URL}/api/project-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: PROJECT_ID, challenge: nonce, proof })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
      const json = await res.json()
      projectToken = json.token
      if (!projectToken) throw new Error('No token returned')
      return json
    }, 250)
  }

  // 4. Project Metadata & Summary Retrieval
  if (projectToken) {
    await measure('4. GET /api/projects/:id (Gated metadata)', async () => {
      const res = await fetch(`${TARGET_URL}/api/projects/${PROJECT_ID}`, {
        headers: { 'x-project-token': projectToken }
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      return json
    }, 400)

    // 5. Pre-computed Timeline Analysis Fetch
    await measure('5. POST /api/analyze-project (Timeline groups)', async () => {
      const res = await fetch(`${TARGET_URL}/api/analyze-project`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-project-token': projectToken
        },
        body: JSON.stringify({ projectId: PROJECT_ID, analysisType: 'timeline' })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      return json
    }, 500)

    // 6. End-to-End RAG Query: Forensic Question 1
    await measure('6. POST /api/ai-chat/query (Short Fact Query)', async () => {
      const res = await fetch(`${TARGET_URL}/api/ai-chat/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-project-token': projectToken
        },
        body: JSON.stringify({
          projectId: PROJECT_ID,
          message: 'What was the cash float amount for lawn maintenance?'
        })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      return json
    }, 1500)

    // 7. End-to-End RAG Query: Multi-Turn Operational Synthesis
    await measure('7. POST /api/ai-chat/query (Synthesis & Guardrail)', async () => {
      const res = await fetch(`${TARGET_URL}/api/ai-chat/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-project-token': projectToken
        },
        body: JSON.stringify({
          projectId: PROJECT_ID,
          message: 'List transactions involving Channa in May 2026.'
        })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      return json
    }, 1500)
  }

  // Summary Scorecard
  console.log('\n============================================================')
  console.log('                 EFFICIENCY SCORECARD')
  console.log('============================================================')
  const total = results.length
  const passedCount = results.filter(r => r.passed).length
  const avgLatency = Math.round(results.reduce((a, b) => a + b.duration, 0) / total)

  console.log(`Total Benchmarks Run : ${total}`)
  console.log(`Passing SLA Targets  : ${passedCount} / ${total} (${Math.round((passedCount / total) * 100)}%)`)
  console.log(`Average Latency      : ${avgLatency}ms`)

  const ragQueries = results.filter(r => r.name.includes('/api/ai-chat/query'))
  if (ragQueries.length > 0) {
    const avgRag = Math.round(ragQueries.reduce((a, b) => a + b.duration, 0) / ragQueries.length)
    console.log(`Average RAG Latency  : ${avgRag}ms (Target: <1500ms) ${avgRag <= 1500 ? '✅ SLA MET' : '⚠️ SLA EXCEEDED'}`)
  }
  console.log('============================================================\n')
}

runBenchmark().catch(console.error)
