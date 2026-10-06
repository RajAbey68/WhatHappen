import { parseWhatsAppChat as parseLibChat, generateComprehensiveAnalysis } from '../../lib/processWhatsapp'
import AdmZip from 'adm-zip'

describe('ZIP Extraction & iOS WhatsApp Parsing Resilience', () => {
  describe('iOS Unicode Control Characters, BOM & Whitespace Handling', () => {
    it('successfully parses iOS exports with \\u200e LTR marks and \\u202f narrow non-breaking spaces', () => {
      const iosTranscript = [
        '\u200e[15/04/2026, 10:23:45\u202fAM] Rajiv: Good morning team, checking KoLake numbers.',
        '\u200e[15/04/2026, 10:24:12\u202fAM] Sudath: Morning Rajiv, all 7 bedrooms are operational.',
        '\u200e[15/04/2026, 10:25:00\u202fAM] Rajiv: Perfect, let us push the buyout rate at $250 / night.',
      ].join('\n')

      const messages = parseLibChat(iosTranscript)
      expect(messages.length).toBe(3)
      expect(messages[0].sender).toBe('Rajiv')
      expect(messages[0].message).toBe('Good morning team, checking KoLake numbers.')
      expect(messages[1].sender).toBe('Sudath')
      expect(messages[2].sender).toBe('Rajiv')
    })

    it('successfully handles UTF-8 BOM (\\ufeff), zero-width spaces (\\u200b), and word joiners (\\u2060)', () => {
      const transcript = '\ufeff\u200b[15/04/2026, 10:23:45] Rajiv\u2060: Hello world\n[15/04/2026, 10:24:00] Sudath: Received'
      const messages = parseLibChat(transcript)
      expect(messages.length).toBe(2)
      expect(messages[0].sender).toBe('Rajiv')
      expect(messages[0].message).toBe('Hello world')
    })

    it('successfully parses European dot format transcripts', () => {
      const dotTranscript = [
        '15.04.2026, 14:30 - Channa: Reviewing lakeside maintenance schedule.',
        '15.04.2026, 14:35 - Rajiv: Approved.',
      ].join('\n')

      const messages = parseLibChat(dotTranscript)
      expect(messages.length).toBe(2)
      expect(messages[0].sender).toBe('Channa')
      expect(messages[1].sender).toBe('Rajiv')
    })

    it('successfully parses bracketed European dot format transcripts', () => {
      const bracketedTranscript = [
        '[15.04.2026, 14:30] Channa: Reviewing lakeside maintenance schedule.',
        '[15.04.2026, 14:35] Rajiv: Approved.',
      ].join('\n')

      const messages = parseLibChat(bracketedTranscript)
      expect(messages.length).toBe(2)
      expect(messages[0].sender).toBe('Channa')
      expect(messages[1].sender).toBe('Rajiv')
    })
  })

  describe('Multi-line & System Message Handling', () => {
    it('accurately accumulates multi-line messages', () => {
      const multiLineTranscript = [
        '[15/04/2026, 10:00:00] Rajiv: Line 1 of the message',
        'Line 2 of the message is a continuation',
        'Line 3 contains bullet points: - item 1 - item 2',
        '[15/04/2026, 10:05:00] Sudath: Understood',
      ].join('\n')

      const messages = parseLibChat(multiLineTranscript)
      expect(messages.length).toBe(2)
      expect(messages[0].sender).toBe('Rajiv')
      expect(messages[0].message).toContain('Line 1 of the message\nLine 2 of the message is a continuation\nLine 3 contains bullet points')
      expect(messages[1].sender).toBe('Sudath')
      expect(messages[1].message).toBe('Understood')
    })

    it('recognizes system notifications and excludes System from conversation participants', () => {
      const chatWithSystem = [
        '15/04/2026, 10:00 - Messages and calls are end-to-end encrypted.',
        '15/04/2026, 10:01 - Rajiv: Welcome to the KoLake channel',
        '15/04/2026, 10:02 - Rajiv changed the group description',
        '15/04/2026, 10:05 - Sudath: Thanks Rajiv',
      ].join('\n')

      const messages = parseLibChat(chatWithSystem)
      expect(messages.length).toBe(4)
      expect(messages[0].sender).toBe('System')
      expect(messages[2].sender).toBe('System')

      const analysis = generateComprehensiveAnalysis(messages)
      expect(analysis.participants).toContain('Rajiv')
      expect(analysis.participants).toContain('Sudath')
      expect(analysis.participants).not.toContain('System')
    })
  })

  describe('macOS __MACOSX & AppleDouble Resilience in ZIP archives', () => {
    it('filters out __MACOSX resource forks and extracts genuine chat transcript', () => {
      const zip = new AdmZip()

      // AppleDouble binary junk header
      const appleDoubleJunk = Buffer.from([0x00, 0x05, 0x16, 0x07, 0x00, 0x02, 0x00, 0x00])
      zip.addFile('__MACOSX/._chat.txt', appleDoubleJunk)
      zip.addFile('__MACOSX/._photo.jpg', appleDoubleJunk)
      zip.addFile('.DS_Store', Buffer.from('DS_STORE_DATA'))

      const realChat = [
        '[15/04/2026, 10:23:45] Rajiv: Checking villa operations.',
        '[15/04/2026, 10:24:12] Sudath: All systems green.',
      ].join('\n')
      zip.addFile('chat.txt', Buffer.from(realChat, 'utf-8'))

      const entries = zip.getEntries()
      const isHiddenOrSystemEntry = (entryName: string): boolean => {
        const parts = entryName.split(/[\/\\]/)
        return parts.some(p => p.startsWith('__MACOSX') || p.startsWith('._') || p === '.DS_Store' || (p.startsWith('.') && p !== '.' && p !== '..'))
      }

      const validEntries = entries.filter(e => !e.isDirectory && !isHiddenOrSystemEntry(e.entryName))
      expect(validEntries.length).toBe(1)
      expect(validEntries[0].entryName).toBe('chat.txt')

      const parsed = parseLibChat(validEntries[0].getData().toString('utf-8'))
      expect(parsed.length).toBe(2)
      expect(parsed[0].sender).toBe('Rajiv')
    })

    it('identifies and strips video files to prevent serverless memory bloat', () => {
      const zip = new AdmZip()
      zip.addFile('video1.mp4', Buffer.alloc(1024, 0))
      zip.addFile('clip.mov', Buffer.alloc(1024, 0))
      zip.addFile('_chat.txt', Buffer.from('[15/04/2026, 10:00:00] Rajiv: Test chat', 'utf-8'))
      zip.addFile('voice.opus', Buffer.alloc(512, 0))

      const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.3gp', '.m4v']
      const entries = zip.getEntries()
      const nonVideoEntries = entries.filter(e => !VIDEO_EXTENSIONS.some(ext => e.entryName.toLowerCase().endsWith(ext)))

      expect(nonVideoEntries.length).toBe(2)
      expect(nonVideoEntries.map(e => e.entryName)).toEqual(expect.arrayContaining(['_chat.txt', 'voice.opus']))
    })
  })

  describe('Decompression Limits & Bomb Guarding', () => {
    it('enforces total decompressed memory limits and safely skips excessive entries', () => {
      const MAX_TOTAL_DECOMPRESSED = 5000 // 5KB limit for testing
      let totalDecompressedBytes = 0

      const safeGetData = (entry: { size: number; data: Buffer }): Buffer | null => {
        if (totalDecompressedBytes + entry.size > MAX_TOTAL_DECOMPRESSED) {
          return null
        }
        totalDecompressedBytes += entry.data.length
        return entry.data
      }

      const entry1 = { size: 2000, data: Buffer.alloc(2000, 1) }
      const entry2 = { size: 2000, data: Buffer.alloc(2000, 2) }
      const entry3 = { size: 3000, data: Buffer.alloc(3000, 3) } // would exceed 5000 limit

      expect(safeGetData(entry1)).not.toBeNull()
      expect(safeGetData(entry2)).not.toBeNull()
      expect(safeGetData(entry3)).toBeNull() // safely rejected
      expect(totalDecompressedBytes).toBe(4000)
    })
  })

  describe('Media & Attachment Tag Extraction', () => {
    it('accurately matches attached voice notes and images from WhatsApp export patterns', () => {
      const msg1 = '15/04/2026, 10:00 - Rajiv: <attached: PTT-20260415-WA0001.opus>'
      const msg2 = '15/04/2026, 10:05 - Sudath: IMG-20260415-WA0002.jpg (file attached)'
      
      const extractAttachment = (text: string) => {
        const match = text.match(/<attached:\s*([^>]+)>/i) || text.match(/([^\s()]+\.[a-zA-Z0-9]{3,4})\s*\((?:file attached|archivo adjunto|fichier joint)\)/i)
        return match ? match[1].trim() : null
      }

      expect(extractAttachment(msg1)).toBe('PTT-20260415-WA0001.opus')
      expect(extractAttachment(msg2)).toBe('IMG-20260415-WA0002.jpg')
    })
  })
})
