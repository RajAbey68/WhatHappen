import fs from 'fs'
import path from 'path'

export interface BookLetsAccount {
  id: string
  code: string
  name: string
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
}

export interface BookLetsVendor {
  id: string
  name: string
  category?: string
  aliases?: string[]
}

export interface BookLetsBooking {
  id: string
  guestName: string
  unitName?: string
  checkIn: string
  checkOut: string
  currency: string
}

export interface BookLetsLexiconSnapshot {
  updatedAt: string
  accounts: BookLetsAccount[]
  vendors: BookLetsVendor[]
  bookings: BookLetsBooking[]
}

export class BookLetsLexiconSync {
  /**
   * Default Ko Lake Villa Chart of Accounts & Known Operational Entities
   * Seeded for Stage 1 Lexicon Grounding.
   */
  public static getDefaultKoLakeSnapshot(): BookLetsLexiconSnapshot {
    return {
      updatedAt: new Date().toISOString(),
      accounts: [
        { id: 'acc_cash_float', code: '1010', name: 'Cash Float / Petty Cash', type: 'ASSET' },
        { id: 'acc_lawn_maint', code: '5010', name: 'Lawn & Garden Maintenance', type: 'EXPENSE' },
        { id: 'acc_villa_repairs', code: '5020', name: 'Villa Repairs & Maintenance', type: 'EXPENSE' },
        { id: 'acc_staff_wages', code: '5030', name: 'Staff Wages & Casual Labour', type: 'EXPENSE' },
        { id: 'acc_utilities_diesel', code: '5040', name: 'Generator Diesel & Fuel', type: 'EXPENSE' },
        { id: 'acc_guest_provisions', code: '5050', name: 'Guest Food & Beverage Provisions', type: 'EXPENSE' },
        { id: 'acc_transport', code: '5060', name: 'Local Transport & Tuk-Tuk', type: 'EXPENSE' }
      ],
      vendors: [
        { id: 'ven_channa_lawn', name: 'Channa Lawn Chamila', category: 'Gardening', aliases: ['Channa Lawn', 'Channa', 'Chamila'] },
        { id: 'ven_sudath_mgr', name: 'Sudath Manager Channa', category: 'Management', aliases: ['Sudath', 'Manager Sudath'] },
        { id: 'ven_lasith_cactus', name: 'Lasith Cactus Gunathilake', category: 'Contractor', aliases: ['Lasith Cactus', 'Lasith'] },
        { id: 'ven_sampath_ninepeak', name: 'Sampath Nine Peak Jayasinghe', category: 'Engineering/Solar', aliases: ['Sampath', 'Nine Peak'] },
        { id: 'ven_indrajith_acct', name: 'Indrajith Accountant Sheran Atapattu', category: 'Accounting', aliases: ['Indrajith', 'Accountant'] },
        { id: 'ven_jayatha_capt', name: 'Jayatha Ko Lake Captain', category: 'Boat/Lake Operations', aliases: ['Jayatha', 'Captain'] },
        { id: 'ven_danushka_ex', name: 'Danushka Ex Ko Lake Gamage', category: 'Former Staff', aliases: ['Danushka'] }
      ],
      bookings: [
        {
          id: 'bkg_sample_1',
          guestName: 'Shannon Marie Abeysinghe',
          unitName: 'Ko Lake Villa (7-Bedroom Buyout)',
          checkIn: '2026-05-01',
          checkOut: '2026-05-08',
          currency: 'USD'
        }
      ]
    }
  }

  /**
   * Persists lexicon mapping to WhatHappen RAG data directory.
   */
  public static saveLexiconSnapshot(projectId: string, snapshot: BookLetsLexiconSnapshot, targetDir?: string): string {
    const dir = targetDir || path.join(process.cwd(), 'data', 'rag')
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    const targetFile = path.join(dir, `lexicon_${projectId}.json`)
    fs.writeFileSync(targetFile, JSON.stringify(snapshot, null, 2), 'utf-8')
    return targetFile
  }

  /**
   * Loads lexicon mapping for a given project.
   */
  public static loadLexiconSnapshot(projectId: string, targetDir?: string): BookLetsLexiconSnapshot {
    const dir = targetDir || path.join(process.cwd(), 'data', 'rag')
    const targetFile = path.join(dir, `lexicon_${projectId}.json`)
    if (fs.existsSync(targetFile)) {
      try {
        const raw = fs.readFileSync(targetFile, 'utf-8')
        return JSON.parse(raw) as BookLetsLexiconSnapshot
      } catch {
        // Fallback on error
      }
    }
    return BookLetsLexiconSync.getDefaultKoLakeSnapshot()
  }

  /**
   * Extracts search tokens / entity keywords from the lexicon for BM25 and RAG queries.
   */
  public static getEntityKeywords(snapshot: BookLetsLexiconSnapshot): string[] {
    const keywords = new Set<string>()
    for (const v of snapshot.vendors) {
      keywords.add(v.name)
      if (v.aliases) {
        for (const a of v.aliases) keywords.add(a)
      }
    }
    for (const acc of snapshot.accounts) {
      keywords.add(acc.name)
      keywords.add(acc.code)
    }
    for (const b of snapshot.bookings) {
      keywords.add(b.guestName)
    }
    return Array.from(keywords)
  }

  /**
   * Converts the BookLets snapshot into WhatHappen LexiconEntry objects.
   */
  public static toLexiconEntries(snapshot: BookLetsLexiconSnapshot): Array<{ term: string; synonyms: string[]; contextNote?: string }> {
    const entries: Array<{ term: string; synonyms: string[]; contextNote?: string }> = []

    for (const v of snapshot.vendors) {
      entries.push({
        term: v.name,
        synonyms: v.aliases || [],
        contextNote: `BookLets Vendor: ${v.category || 'General'}`
      })
    }

    for (const acc of snapshot.accounts) {
      entries.push({
        term: acc.name,
        synonyms: [acc.code],
        contextNote: `BookLets Chart of Accounts (${acc.type})`
      })
    }

    for (const b of snapshot.bookings) {
      entries.push({
        term: b.guestName,
        synonyms: [b.unitName || '', b.currency].filter(Boolean),
        contextNote: `BookLets Booking (${b.checkIn} to ${b.checkOut})`
      })
    }

    return entries
  }
}
