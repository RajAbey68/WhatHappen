/**
 * Normalize a user-supplied destination to a WhatsApp JID.
 * Accepts E.164 digits ("+447359857860", "447359857860"), or a raw JID
 * ("447359857860@s.whatsapp.net", "...@g.us" for groups — passed through).
 * Returns null when the destination is not routable. Never throws.
 */
export function toJid(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  if (t.endsWith('@g.us') || t.endsWith('@s.whatsapp.net') || t.endsWith('@c.us')) {
    const user = t.split('@')[0].split(':')[0];
    // Group JIDs legitimately contain '-' (e.g. 12345-67890@g.us).
    if (!user || user.length < 5) return null;
    if (!t.endsWith('@g.us') && (user.includes('-') || !/^[0-9]+$/.test(user))) return null;
    return t;
  }
  const digits = t.replace(/[^0-9]/g, '');
  if (!digits || digits.length < 5 || digits.length > 16) return null;
  return `${digits}@s.whatsapp.net`;
}

export const MAX_OUTBOUND_CHARS = 2000;
