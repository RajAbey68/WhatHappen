import { toJid } from '@/lib/whatsapp-live/jid';

describe('toJid', () => {
  it('normalizes E.164 with plus and spaces', () => {
    expect(toJid('+44 7359 857860')).toBe('447359857860@s.whatsapp.net');
  });
  it('passes digit-only strings through', () => {
    expect(toJid('94711730345')).toBe('94711730345@s.whatsapp.net');
  });
  it('passes full JIDs through', () => {
    expect(toJid('447359857860@s.whatsapp.net')).toBe('447359857860@s.whatsapp.net');
  });
  it('passes group JIDs through', () => {
    expect(toJid('12345-67890@g.us')).toBe('12345-67890@g.us');
  });
  it('rejects short numbers', () => {
    expect(toJid('1234')).toBeNull();
  });
  it('rejects empty and non-string input', () => {
    expect(toJid('')).toBeNull();
    expect(toJid(null)).toBeNull();
    expect(toJid(123)).toBeNull();
  });
});
