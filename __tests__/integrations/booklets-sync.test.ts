import { BookLetsLexiconSync } from '@/lib/integrations/booklets/lexicon-sync'
import fs from 'fs'
import path from 'path'

describe('BookLetsLexiconSync', () => {
  const testDir = path.join(process.cwd(), 'data', 'rag', '__test_lexicon__')
  const testProjectId = '7ba94f4c-fb4e-4ee4-bc90-19984c5a8b59'

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('generates standard Ko Lake Villa default snapshot', () => {
    const snapshot = BookLetsLexiconSync.getDefaultKoLakeSnapshot()
    expect(snapshot.accounts.length).toBeGreaterThanOrEqual(5)
    expect(snapshot.vendors.some(v => v.name.includes('Channa Lawn'))).toBe(true)
    expect(snapshot.vendors.some(v => v.name.includes('Indrajith Accountant'))).toBe(true)
  })

  it('saves and loads lexicon snapshots from disk', () => {
    const defaultSnapshot = BookLetsLexiconSync.getDefaultKoLakeSnapshot()
    const filePath = BookLetsLexiconSync.saveLexiconSnapshot(testProjectId, defaultSnapshot, testDir)
    expect(fs.existsSync(filePath)).toBe(true)

    const loaded = BookLetsLexiconSync.loadLexiconSnapshot(testProjectId, testDir)
    expect(loaded.accounts.length).toBe(defaultSnapshot.accounts.length)
    expect(loaded.vendors.length).toBe(defaultSnapshot.vendors.length)
  })

  it('extracts unique entity keywords for BM25 and RAG retrieval', () => {
    const snapshot = BookLetsLexiconSync.getDefaultKoLakeSnapshot()
    const keywords = BookLetsLexiconSync.getEntityKeywords(snapshot)

    expect(keywords).toContain('Channa Lawn Chamila')
    expect(keywords).toContain('Channa')
    expect(keywords).toContain('Cash Float / Petty Cash')
    expect(keywords).toContain('1010')
    expect(keywords).toContain('Shannon Marie Abeysinghe')
  })
})
