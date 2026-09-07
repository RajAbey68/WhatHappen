import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMessages, searchMessages, contextMessages, timeline, responseTimes, financialAssertions, financialSummary, operationalSnapshot} from '../../scripts/mcp/analytics.mjs';
const msg=(id,message,minute=0,extra={})=>({id,projectId:'p',conversationId:'chat',sender:'Alice',timestamp:`2026-05-01T10:${String(minute).padStart(2,'0')}:00Z`,message,...extra});
test('normalization rejects ciphertext, invalid dates and duplicates without inventing chat identity',()=>{
 assert.throws(()=>normalizeMessages([msg('a','{"ciphertext":"secret","salt":"s","iv":"i"}')]),/encrypted/i);
 assert.throws(()=>normalizeMessages([msg('a','hi',0,{timestamp:'wrong'})]),/timestamp/i);
 assert.throws(()=>normalizeMessages([msg('a','a'),msg('a','b')]),/duplicate/i);
 assert.equal(normalizeMessages([msg('a','hello',0,{conversationId:null})])[0].conversationId,null);
});
test('search is literal AND or phrase, has precise UTC dates and conversation filters',()=>{
 const m=normalizeMessages([msg('1','float 100,000'),msg('2','float',0,{timestamp:'2025-05-01T10:00:00Z'}),msg('3','other',0,{conversationId:'other'})]);
 assert.deepEqual(searchMessages(m,{query:'float 100000',month:'2026-05'}).map(m=>m.id),['1']);
 assert.equal(searchMessages(m,{query:'float',month:'may'}).length,2);
 assert.equal(searchMessages(m,{query:'FLOAT',mode:'phrase',conversationId:'other'}).length,0);
 assert.equal(searchMessages(m,{query:'/float/g'}).length,0);
 assert.throws(()=>searchMessages(m,{month:'maybe'}),/month/i);
});
test('context uses exact IDs and never includes another conversation',()=>{
 const m=normalizeMessages([msg('a','one'),msg('aa','two',1,{conversationId:'other'}),msg('b','three',2)]);
 assert.deepEqual(contextMessages(m,{messageId:'a',before:0,after:5}).map(m=>m.id),['a','b']);
 assert.throws(()=>contextMessages(m,{messageId:'z'}),/not found/i);
 assert.throws(()=>contextMessages(normalizeMessages([msg('a','one',0,{conversationId:null})]),{messageId:'a'}),/provenance/i);
});
test('response times isolate chats, exclude unknown provenance, calculate true median/p90',()=>{
 const m=normalizeMessages([msg('a','hi'),msg('b','other',1,{conversationId:'other',sender:'Bob'}),msg('c','reply',2,{sender:'Bob'}),msg('d','hi',3),msg('e','reply',9,{sender:'Bob'})]);
 const r=responseTimes(m);const bob=r.records.find(x=>x.participant==='Bob');
 assert.equal(bob.responsesAnalyzed,2);assert.equal(bob.medianMinutes,4);assert.equal(bob.p90Minutes,6);
 assert.equal(responseTimes(normalizeMessages([msg('a','hi',0,{conversationId:null}),msg('b','yo',1,{conversationId:null,sender:'Bob'})])).records.length,0);
});
test('financial assertions have currencies, provenance, intent and negation; years are not money',()=>{
 const m=normalizeMessages([msg('a','Happy 2026'),msg('b','LKR 1,000 unpaid'),msg('c','Paid LKR 1,000'),msg('d','Will pay USD 50'),msg('e','Please transfer $25'),msg('f','Paid LKR 1,000')]);
 const a=financialAssertions(m);
 assert.equal(a.some(x=>x.messageId==='a'),false);
 assert.equal(a.find(x=>x.messageId==='b').intent,'unconfirmed');
 assert.equal(a.find(x=>x.messageId==='c').amount,1000);
 assert.equal(a.find(x=>x.messageId==='c').intent,'claimed_paid');
 assert.equal(a.find(x=>x.messageId==='d').intent,'promised');
 assert.equal(a.find(x=>x.messageId==='e').currency,'USD');
 assert.equal(a.filter(x=>x.amount===1000&&x.intent==='claimed_paid').length,2); // distinct messages are not invented duplicates
 assert.equal(financialSummary(m).financialMentionsIdentified,5);
});
test('operational issues need same-chat same-topic non-negated resolution and exact citations',()=>{
 const m=normalizeMessages([msg('a','Urgent roof leak'),msg('b','Airport pickup done',1,{conversationId:'other'}),msg('c','Roof leak not fixed',2),msg('d','Roof leak fixed',3)]);
 const r=operationalSnapshot(m,{days:7,asOf:'2026-05-02T00:00:00Z'});
 assert.equal(r.records.find(x=>x.issueId==='a').resolutionEvidence.messageId,'d');
 const no=operationalSnapshot(m.slice(0,3),{days:7,asOf:'2026-05-02T00:00:00Z'});
 assert.equal(no.records.find(x=>x.issueId==='a').status,'no_supported_resolution');
 assert.equal(operationalSnapshot(m,{days:7,asOf:'2026-09-01T00:00:00Z'}).records.length,0);
});
test('timeline counts UTC days consistently across boundary offsets and ignores timezone of process',()=>{
 const m=normalizeMessages([msg('1','hi',0,{timestamp:'2026-05-01T00:30:00+05:30'})]);
 const r=timeline(m,{});assert.equal(r.filteredMessagesCount,1);
 assert.ok(r.records.some(x=>x.kind==='day'&&x.bucket==='2026-04-30'&&x.count===1));
 assert.equal(timeline(m,{month:'2026-05'}).filteredMessagesCount,0);
});
test('deposited and transferred negations never become claimed payments',()=>{
 for(const text of ['I have not yet deposited USD 500','USD 500 has not been transferred',"I hadn't deposited USD 500", "I didn't get paid USD 500", "I couldn’t have transferred USD 500", 'USD 500 was never settled']){
  assert.equal(financialAssertions(normalizeMessages([msg('a',text)]))[0].intent,'unconfirmed',text);
 }
});
