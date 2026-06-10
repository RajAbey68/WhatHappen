/**
 * PST file parser — extracts metadata only, never stores message body content.
 * Requires: npm install pst-extractor
 */

export interface ParsedEmail {
  timestamp: Date | null
  sender: string
  recipient: string
  wordCount: number
  sentimentScore: number  // NUMERIC(4,3) compatible: range -9.999 to 9.999
  hasAttachment: boolean
  // NOTE: no body/content field — raw text is never returned
}

export async function parsePSTFile(buffer: Buffer): Promise<ParsedEmail[]> {
  const { PSTFile, PSTFolder, PSTMessage } = await import('pst-extractor')
  const Sentiment = (await import('sentiment')).default
  const sentiment = new Sentiment()

  const pstFile = new PSTFile(buffer)
  const emails: ParsedEmail[] = []

  function processFolder(folder: any) {
    if (folder.contentCount > 0) {
      let item = folder.getNextChild()
      while (item != null) {
        if (item instanceof PSTMessage) {
          const body = item.body || item.bodyHTML || ''
          const wordCount = body.split(/\s+/).filter(Boolean).length
          const rawScore = sentiment.analyze(body.slice(0, 500)).comparative
          const sentimentScore = Math.round(Math.max(-9.999, Math.min(9.999, rawScore)) * 1000) / 1000

          emails.push({
            timestamp: item.messageDeliveryTime ?? null,
            sender: item.senderEmailAddress || item.senderName || 'Unknown',
            recipient: item.displayTo || '',
            wordCount,
            sentimentScore,
            hasAttachment: item.numberOfAttachments > 0,
          })
        }
        item = folder.getNextChild()
      }
    }

    if (folder.hasSubfolders) {
      let sub = folder.getNextChild()
      while (sub instanceof PSTFolder) {
        processFolder(sub)
        sub = folder.getNextChild()
      }
    }
  }

  processFolder(pstFile.getRootFolder())
  return emails
}
