import { RawChatMessage } from '../rag/sessionizer'
import { BookLetsExpenseRecord } from './reconciler'

export interface SyntheticDataset {
  corpus: RawChatMessage[]
  groundTruthTransactions: {
    messageId: string
    sender: string
    timestamp: string
    amount: number
    currency: string
    exactQuote: string
    category: string
  }[]
  bookletsExpenses: BookLetsExpenseRecord[]
}

/**
 * Generates calibrated synthetic WhatsApp chat corpora and matching BookLets ledgers.
 * Models realistic villa operations (petty cash floats, pool supplies, grass cutting, guest payouts)
 * with mathematically controlled edge cases for adversarial red-teaming.
 */
export class SyntheticCorpusGenerator {
  public static generateStandardVillaDataset(): SyntheticDataset {
    const corpus: RawChatMessage[] = [
      {
        id: 'syn_msg_001',
        sender: 'Indrajith Accountant Sheran Atapattu',
        timestamp: '2026-05-01T08:30:00.000Z',
        message: 'Good morning Sudath. Bank transfer sent. Transferred 50,000 LKR float for weekly kitchen and housekeeping petty cash.'
      },
      {
        id: 'syn_msg_002',
        sender: 'Sudath Manager Channa',
        timestamp: '2026-05-01T09:15:00.000Z',
        message: 'Received 50,000 LKR float. Will distribute 15k to kitchen and hold balance for fuel.'
      },
      {
        id: 'syn_msg_003',
        sender: 'Channa Lawn Chamila',
        timestamp: '2026-05-03T14:10:00.000Z',
        message: 'Lawn and garden maintenance completed. Fuel and blade replacement cost 12500 rupees.'
      },
      {
        id: 'syn_msg_004',
        sender: 'Sudath Manager Channa',
        timestamp: '2026-05-03T14:45:00.000Z',
        message: 'Paid 12500 rupees from petty cash to Channa. Slip attached.'
      },
      {
        id: 'syn_msg_005',
        sender: 'Amir Kolak Sagar-Laurie',
        timestamp: '2026-05-06T11:00:00.000Z',
        message: 'Guest requested checkout extension. Direct booking buyout rate confirmed at $250 / night.'
      },
      {
        id: 'syn_msg_006',
        sender: 'Indrajith Accountant Sheran Atapattu',
        timestamp: '2026-05-08T16:20:00.000Z',
        message: 'Generator diesel refilled. Emergency generator fuel payment was 38000 LKR.'
      },
      {
        id: 'syn_msg_007',
        sender: 'Lasith Cactus Gunathilake',
        timestamp: '2026-05-10T10:00:00.000Z',
        message: 'Pool maintenance technician checked water chemistry. Chlorination supplies cost 18000 LKR.'
      },
      {
        id: 'syn_msg_008',
        sender: 'Sudath Manager Channa',
        timestamp: '2026-05-12T13:30:00.000Z',
        message: 'AC in bedroom 3 serviced. Air conditioning repair technician invoiced 8500 LKR.'
      }
    ]

    const groundTruthTransactions = [
      {
        messageId: 'syn_msg_001',
        sender: 'Indrajith Accountant Sheran Atapattu',
        timestamp: '2026-05-01T08:30:00.000Z',
        amount: 50000,
        currency: 'LKR',
        exactQuote: 'Transferred 50,000 LKR float for weekly kitchen and housekeeping petty cash',
        category: 'float'
      },
      {
        messageId: 'syn_msg_004',
        sender: 'Sudath Manager Channa',
        timestamp: '2026-05-03T14:45:00.000Z',
        amount: 12500,
        currency: 'LKR',
        exactQuote: 'Paid 12500 rupees from petty cash to Channa',
        category: 'maintenance'
      },
      {
        messageId: 'syn_msg_006',
        sender: 'Indrajith Accountant Sheran Atapattu',
        timestamp: '2026-05-08T16:20:00.000Z',
        amount: 38000,
        currency: 'LKR',
        exactQuote: 'Emergency generator fuel payment was 38000 LKR',
        category: 'utilities'
      },
      {
        messageId: 'syn_msg_007',
        sender: 'Lasith Cactus Gunathilake',
        timestamp: '2026-05-10T10:00:00.000Z',
        amount: 18000,
        currency: 'LKR',
        exactQuote: 'Chlorination supplies cost 18000 LKR',
        category: 'supplies'
      },
      {
        messageId: 'syn_msg_008',
        sender: 'Sudath Manager Channa',
        timestamp: '2026-05-12T13:30:00.000Z',
        amount: 8500,
        currency: 'LKR',
        exactQuote: 'Air conditioning repair technician invoiced 8500 LKR',
        category: 'repairs'
      }
    ]

    // BookLets ledger: contains 2 matched entries, 1 unrecorded in chat, and leaves 3 chat events unrecorded
    const bookletsExpenses: BookLetsExpenseRecord[] = [
      {
        id: 'booklet_exp_01',
        amount: 50000,
        currency: 'LKR',
        vendorName: 'Sudath Manager',
        date: '2026-05-01T09:00:00.000Z',
        description: 'Weekly housekeeping float'
      },
      {
        id: 'booklet_exp_02',
        amount: 12500,
        currency: 'LKR',
        vendorName: 'Channa Lawn Care',
        date: '2026-05-03T15:00:00.000Z',
        description: 'Lawn mower maintenance'
      },
      {
        id: 'booklet_exp_03_orphan',
        amount: 95000,
        currency: 'LKR',
        vendorName: 'Solar Inverter Co',
        date: '2026-05-05T12:00:00.000Z',
        description: 'Battery replacement (Orphan entry - never mentioned in chat)'
      }
    ]

    return {
      corpus,
      groundTruthTransactions,
      bookletsExpenses
    }
  }
}
