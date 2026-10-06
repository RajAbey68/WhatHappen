import WebSocket from 'ws'
import fs from 'fs'
import path from 'path'

const TARGET_HOST = 'http://167.233.236.178:3000'
const CHROME_DEBUG_URL = 'http://localhost:9222'
const SCREENSHOT_DIR = path.resolve('outputs/test_screenshots')

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
}

async function run() {
  console.log('🚀 Starting WhatHappen Comprehensive End-to-End UI Automation Test...')
  console.log(`Target: ${TARGET_HOST}`)

  // 1. Get or create Chrome tab
  const listRes = await fetch(`${CHROME_DEBUG_URL}/json/list`)
  const tabs = await listRes.json()
  let tab = tabs.find((t) => t.type === 'page' && t.url.includes('167.233.236.178'))

  if (!tab) {
    const newTabRes = await fetch(`${CHROME_DEBUG_URL}/json/new?${encodeURIComponent(TARGET_HOST)}`, { method: 'PUT' })
    tab = await newTabRes.json()
  }

  const ws = new WebSocket(tab.webSocketDebuggerUrl)
  let nextId = 1

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = nextId++
      const timer = setTimeout(() => reject(new Error(`Timeout on ${method}`)), 15000)
      const handler = (data) => {
        const msg = JSON.parse(data.toString())
        if (msg.id === id) {
          clearTimeout(timer)
          ws.off('message', handler)
          if (msg.error) reject(new Error(msg.error.message))
          else resolve(msg.result)
        }
      }
      ws.on('message', handler)
      ws.send(JSON.stringify({ id, method, params }))
    })
  }

  await new Promise((resolve) => {
    ws.onopen = resolve
  })

  await send('Page.enable')
  await send('Runtime.enable')
  await send('DOM.enable')

  // Set large viewport to show full layout
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1200,
    deviceScaleFactor: 1,
    mobile: false
  })

  async function evalJs(expr) {
    const res = await send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    })
    if (res.exceptionDetails) {
      console.warn('JS Exception:', res.exceptionDetails)
    }
    return res.result?.value
  }

  async function captureScreenshot(name) {
    const res = await send('Page.captureScreenshot', { format: 'png' })
    const filePath = path.join(SCREENSHOT_DIR, `${name}.png`)
    fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'))
    console.log(`📸 Screenshot saved: ${filePath}`)
    return filePath
  }

  async function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms))
  }

  async function clickTab(tabId) {
    await evalJs(`(() => {
      const btn = document.getElementById('${tabId}');
      if (btn) {
        btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
    })()`)
  }

  async function closeAllModals() {
    await evalJs(`(() => {
      // Find any close buttons in dialogs
      const closeButtons = Array.from(document.querySelectorAll('[role="dialog"] button'));
      const close = closeButtons.find(b => b.innerText.trim() === 'Close' || b.innerText.trim() === 'Cancel' || b.getAttribute('aria-label') === 'Close' || b.querySelector('svg.lucide-x'));
      if (close) {
        close.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
    })()`)
    await sleep(500)
  }

  console.log('⏳ Waiting for page initial load...')
  await sleep(2000)
  await closeAllModals()

  // Step 1: Check initial page state & Unlock if prompted
  console.log('\n--- Step 1: Checking Initial State & Passphrase Unlock ---')
  let pageState = await evalJs(`(() => {
    const title = document.title;
    const bodyText = document.body.innerText;
    const hasPrompt = !!document.querySelector('#passphrase');
    const isUnlocked = bodyText.includes('Zero-Knowledge Key Loaded');
    const projectName = document.querySelector('h1, h2, h3')?.innerText || '';
    return { title, hasPrompt, isUnlocked, projectName };
  })()`)
  console.log('Page State:', pageState)
  await captureScreenshot('01_initial_load')

  if (!pageState.isUnlocked) {
    if (!pageState.hasPrompt) {
      console.log('Selecting "Ko Lake Analysis" project card to open unlock dialog...')
      await evalJs(`(() => {
        const h3 = Array.from(document.querySelectorAll('h3')).find(el => el.textContent.includes('Ko Lake Analysis'));
        if (h3) h3.click();
      })()`)
      await sleep(1500)
    }

    console.log('🔑 Passphrase prompt detected. Submitting passphrase "SHANNON"...')
    await evalJs(`(() => {
      const input = document.querySelector('#passphrase');
      if (input) {
        const proto = Object.getPrototypeOf(input);
        const setVal = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setVal.call(input, 'SHANNON');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const buttons = Array.from(document.querySelectorAll('button'));
      const unlockBtn = buttons.find(b => b.innerText.includes('Unlock Project') || b.innerText.includes('Configure Key'));
      if (unlockBtn) unlockBtn.click();
    })()`)

    // Wait for unlock and decryption
    console.log('⏳ Waiting 6s for decryption and project unlock...')
    await sleep(6000)
    await captureScreenshot('02_after_unlock')
  }

  // Step 2: Verify Project Title, Badge, and Message Counts
  console.log('\n--- Step 2: Verifying Project Header and Badges ---')
  const headerInfo = await evalJs(`(() => {
    const text = document.body.innerText;
    const keyLoaded = text.includes('Zero-Knowledge Key Loaded');
    const messageCount = text.match(/(\\d[\\d,]*)\\s*Total Messages/)?.[1] || text.match(/(\\d[\\d,]*)\\s*messages/)?.[1] || '0';
    const participants = text.match(/(\\d+)\\s*Participants/)?.[1] || '0';
    const activeTab = document.querySelector('[role="tab"][data-state="active"]')?.innerText || '';
    return { keyLoaded, messageCount, participants, activeTab };
  })()`)
  console.log('Header Info:', headerInfo)

  // Step 3: Test Chat Reader (Chats) Tab
  console.log('\n--- Step 3: Testing Chat Reader (Chats) Tab ---')
  await closeAllModals()
  await clickTab('radix-:r3:-trigger-chat-reader')
  await sleep(1500)

  // Ensure Messages subtab is active
  await evalJs(`(() => {
    const sub = Array.from(document.querySelectorAll('[role="tab"]')).find(t => t.innerText === 'Messages');
    if (sub) {
      sub.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      sub.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      sub.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  })()`)
  await sleep(1000)
  await captureScreenshot('03_chat_reader_tab')

  const chatReaderState = await evalJs(`(() => {
    const rows = Array.from(document.querySelectorAll('table tbody tr'));
    const rowCount = rows.length;
    let firstRow = null;
    if (rows.length > 0) {
      const cells = Array.from(rows[0].querySelectorAll('td')).map(c => c.innerText.trim());
      firstRow = { timestamp: cells[0], sender: cells[1], message: cells[2]?.slice(0, 80) };
    }
    const description = document.querySelector('[role="status"]')?.innerText || '';
    const hasSearch = !!document.querySelector('input[placeholder*="Search"]');
    const hasExportJson = Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Export JSON'));
    const hasExportCsv = Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Export CSV'));
    return { rowCount, firstRow, description, hasSearch, hasExportJson, hasExportCsv };
  })()`)
  console.log('Chat Reader State:', chatReaderState)

  // Test Search Box in Chat Reader
  console.log('\n--- Testing Search Filter in Chat Reader ---')
  await evalJs(`(() => {
    const input = document.querySelector('input[placeholder*="Search"]');
    if (input) {
      const proto = Object.getPrototypeOf(input);
      const setVal = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setVal.call(input, 'Sudath');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  })()`)
  await sleep(1000)
  const searchResult = await evalJs(`(() => {
    const rows = document.querySelectorAll('table tbody tr').length;
    const status = document.querySelector('[role="status"]')?.innerText || '';
    return { rows, status };
  })()`)
  console.log('Search Filter for "Sudath":', searchResult)
  await captureScreenshot('04_chat_reader_search')

  // Clear Search
  await evalJs(`(() => {
    const input = document.querySelector('input[placeholder*="Search"]');
    if (input) {
      const proto = Object.getPrototypeOf(input);
      const setVal = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setVal.call(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  })()`)
  await sleep(1000)

  // Test Sort Toggle
  console.log('\n--- Testing Sort Order Toggle ---')
  await evalJs(`(() => {
    const sortHeader = Array.from(document.querySelectorAll('table th')).find(th => th.innerText.includes('Timestamp'));
    if (sortHeader) sortHeader.click();
  })()`)
  await sleep(1000)
  const sortState = await evalJs(`(() => {
    const cells = Array.from(document.querySelectorAll('table tbody tr:first-child td')).map(c => c.innerText.trim());
    return { firstRowTimestamp: cells[0], firstRowSender: cells[1] };
  })()`)
  console.log('Sorted First Row:', sortState)

  // Test Sub-tabs in DatabaseViewer: Analysis Data & File Metadata
  console.log('\n--- Testing DatabaseViewer Sub-tabs ---')
  await evalJs(`(() => {
    const subtabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const analysisSubtab = subtabs.find(t => t.innerText === 'Analysis Data');
    if (analysisSubtab) {
      analysisSubtab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      analysisSubtab.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      analysisSubtab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  })()`)
  await sleep(1000)
  const analysisSubtabContent = await evalJs(`document.body.innerText.includes('Analysis Results') || document.body.innerText.includes('Total Messages')`)
  console.log('Analysis Data Sub-tab Loaded:', analysisSubtabContent)

  await evalJs(`(() => {
    const subtabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const metaSubtab = subtabs.find(t => t.innerText === 'File Metadata');
    if (metaSubtab) {
      metaSubtab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      metaSubtab.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      metaSubtab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  })()`)
  await sleep(1000)
  const metaSubtabContent = await evalJs(`document.body.innerText.includes('File Information') || document.body.innerText.includes('File Name')`)
  console.log('File Metadata Sub-tab Loaded:', metaSubtabContent)

  // Switch back to Messages sub-tab
  await evalJs(`(() => {
    const subtabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const msgSubtab = subtabs.find(t => t.innerText === 'Messages');
    if (msgSubtab) {
      msgSubtab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      msgSubtab.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      msgSubtab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  })()`)
  await sleep(1000)

  // Step 4: Test Upload & Process Tab
  console.log('\n--- Step 4: Testing Upload & Process Tab ---')
  await clickTab('radix-:r3:-trigger-upload')
  await sleep(2000)
  await captureScreenshot('05_upload_tab')
  const uploadState = await evalJs(`(() => {
    const hasDropzone = document.body.innerText.includes('Drag & Drop') || document.body.innerText.includes('Drop your files') || document.body.innerText.includes('Upload WhatsApp');
    return { hasDropzone };
  })()`)
  console.log('Upload Tab State:', uploadState)

  // Step 5: Test AI Chat Tab
  console.log('\n--- Step 5: Testing AI Chat Tab ---')
  await clickTab('radix-:r3:-trigger-ai-chat')
  await sleep(2000)
  await captureScreenshot('06_ai_chat_tab')

  const aiChatState = await evalJs(`(() => {
    const hasTextarea = !!document.querySelector('textarea');
    const hasSendBtn = !!document.querySelector('button[aria-label="Send"]');
    const headerTitle = document.querySelector('h3, [class*="title"]')?.innerText || '';
    return { hasTextarea, hasSendBtn, headerTitle };
  })()`)
  console.log('AI Chat State:', aiChatState)

  // Step 6: Test Analysis Tab
  console.log('\n--- Step 6: Testing Analysis Tab ---')
  await clickTab('radix-:r3:-trigger-analysis')
  await sleep(2000)
  await captureScreenshot('07_analysis_tab')

  const analysisState = await evalJs(`(() => {
    const text = document.body.innerText;
    const hasSentiment = text.includes('Sentiment Analysis');
    const hasActivity = text.includes('Activity Patterns');
    const hasResponseTimes = text.includes('Response Time Analysis');
    const hasKeywords = text.includes('Top Keywords');
    const hasRefreshBtn = Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('AI Analysis'));
    
    // Check decrypted participant response time rows
    const participantRows = Array.from(document.querySelectorAll('.border-b')).map(r => r.innerText.trim()).filter(Boolean);
    return { hasSentiment, hasActivity, hasResponseTimes, hasKeywords, hasRefreshBtn, participantCount: participantRows.length };
  })()`)
  console.log('Analysis Tab State:', analysisState)

  // Step 7: Test Documents Tab
  console.log('\n--- Step 7: Testing Documents Tab ---')
  await clickTab('radix-:r3:-trigger-documents')
  await sleep(2000)
  await captureScreenshot('08_documents_tab')

  // Test "View Report on Screen" modal
  console.log('👁️ Testing "View Report on Screen" modal...')
  await evalJs(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('View Report on Screen'));
    if (btn) btn.click();
  })()`)
  await sleep(2000)
  await captureScreenshot('09_legal_report_modal')

  const modalOpenState = await evalJs(`(() => {
    const modal = document.querySelector('[role="dialog"]');
    const modalTitle = modal?.querySelector('h2, [class*="title"]')?.innerText || '';
    return { isOpen: !!modal, modalTitle };
  })()`)
  console.log('Modal Opened:', modalOpenState)

  // Close modal
  await closeAllModals()
  await sleep(1000)

  // Step 8: Test "+ New Project" button
  console.log('\n--- Step 8: Testing "+ New Project" Dialog ---')
  await evalJs(`(() => {
    const newProjBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('New Project'));
    if (newProjBtn) newProjBtn.click();
  })()`)
  await sleep(1500)
  await captureScreenshot('10_new_project_dialog')

  const newProjState = await evalJs(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const hasNameInput = !!dialog?.querySelector('input');
    return { isOpen: !!dialog, hasNameInput };
  })()`)
  console.log('New Project Dialog:', newProjState)

  // Close New Project dialog
  await closeAllModals()
  await sleep(1000)

  console.log('\n========================================')
  console.log('🎉 COMPREHENSIVE UI AUTOMATION COMPLETE!')
  console.log('========================================\n')

  ws.close()
}

run().catch((err) => {
  console.error('❌ Test failed:', err)
  process.exit(1)
})
