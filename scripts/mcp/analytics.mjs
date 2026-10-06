/** Deterministic archive analysis. Message text is evidence, never instructions. */
const MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december'];
export function normalizeMessages(messages) {
 const ids=new Set();
 return messages.map(m=>{
  if(!m || typeof m.id!=='string'||!m.id||ids.has(m.id)) throw new Error('Missing or duplicate message ID');
  ids.add(m.id);
  if(typeof m.message!=='string'||typeof m.sender!=='string') throw new Error('Invalid message text or sender');
  for(const v of [m.message,m.sender]) {try {const j=JSON.parse(v);if(j?.ciphertext&&j?.salt&&j?.iv) throw new Error('Encrypted record cannot be analyzed');}catch(e){if(!(e instanceof SyntaxError))throw e;}}
  const date=new Date(m.timestamp);if(!m.timestamp||!Number.isFinite(date.getTime()))throw new Error('Invalid message timestamp');
  return {id:m.id,projectId:m.projectId,conversationId:m.conversationId||null,replyToId:m.replyToId||null,sourceId:m.sourceId||null,sender:m.sender,message:m.message,timestamp:date.toISOString()};
 }).sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.id.localeCompare(b.id));
}
export function filterMessages(messages,args={}) {
 let monthNumber=null;
 if(args.month&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(args.month)) {
  const i=MONTHS.indexOf(args.month.toLowerCase());if(i<0)throw new Error('Invalid month: use full English name or YYYY-MM');monthNumber=String(i+1).padStart(2,'0');
 }
 return messages.filter(m=>(!args.conversationId||m.conversationId===args.conversationId)&&(!args.sender||m.sender.toLowerCase().includes(args.sender.toLowerCase()))&&(!args.startDate||m.timestamp>=new Date(args.startDate).toISOString())&&(!args.endDate||m.timestamp<new Date(args.endDate).toISOString())&&(!args.month||(monthNumber?m.timestamp.slice(5,7)===monthNumber:m.timestamp.startsWith(args.month))));
}
export function searchMessages(messages,args={}) {
 const query=(args.query||'').toLowerCase();const terms=args.mode==='phrase'?[query]:query.split(/\s+/).filter(Boolean);
 return filterMessages(messages,args).filter(m=>terms.every(t=>`${m.sender} ${m.message}`.toLowerCase().includes(t)||(/\d/.test(t)&&`${m.sender} ${m.message}`.toLowerCase().replace(/,/g,'').includes(t.replace(/,/g,'')))));
}
export function contextMessages(messages,{messageId,before=5,after=5}) {
 const target=messages.find(m=>m.id===messageId);if(!target)throw new Error('Message not found');
 if(!target.conversationId)throw new Error('Conversation provenance unavailable: cannot infer context across chats');
 const chat=messages.filter(m=>m.conversationId===target.conversationId);const i=chat.indexOf(target);
 return chat.slice(Math.max(0,i-before),i+after+1);
}
const countRows=(map,kind)=>[...map].sort(([a],[b])=>a.localeCompare(b)).map(([bucket,count])=>({kind,bucket,count}));
const increment=(map,key)=>map.set(key,(map.get(key)||0)+1);
export function timeline(messages,args={}) {
 const selected=filterMessages(messages,args),hour=new Map(),day=new Map(),month=new Map(),sender=new Map();
 for(const m of selected){increment(hour,m.timestamp.slice(11,13)+':00');increment(day,m.timestamp.slice(0,10));increment(month,m.timestamp.slice(0,7));increment(sender,m.sender);}
 const top=(map)=>[...map].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]||null;
 return {filteredMessagesCount:selected.length,timezone:'UTC',totalActiveDays:day.size,averageMessagesPerActiveDay:day.size?selected.length/day.size:0,mostActiveHour:top(hour),mostActiveDay:top(day),records:[...countRows(hour,'hour'),...countRows(day,'day'),...countRows(month,'month'),...countRows(sender,'participant')]};
}
export function responseTimes(messages) {
 const chats=new Map(),samples=new Map();let excluded=0;
 for(const m of messages){if(!m.conversationId){excluded++;continue;}if(!chats.has(m.conversationId))chats.set(m.conversationId,[]);chats.get(m.conversationId).push(m);}
 for(const chat of chats.values()){
  const byId=new Map(chat.map(m=>[m.id,m]));let last=null;
  for(const m of chat){const prior=m.replyToId?byId.get(m.replyToId):last;const delta=prior?(Date.parse(m.timestamp)-Date.parse(prior.timestamp))/60000:0;
   if(prior&&prior.sender!==m.sender&&delta>0&&delta<=45){if(!samples.has(m.sender))samples.set(m.sender,[]);samples.get(m.sender).push(delta);}last=m;
  }
 }
 return {methodology:'Within known conversations only; explicit replies where available, otherwise adjacent-sender estimates; gaps >45 minutes excluded. Not an SLA measurement.',excludedUnknownConversation:excluded,records:[...samples].sort(([a],[b])=>a.localeCompare(b)).map(([participant,t])=>{t.sort((a,b)=>a-b);const n=t.length;return {participant,responsesAnalyzed:n,averageMinutes:t.reduce((a,b)=>a+b,0)/n,medianMinutes:n%2?t[Math.floor(n/2)]:(t[n/2-1]+t[n/2])/2,p90Minutes:t[Math.ceil(.9*n)-1],fastestMinutes:t[0],slowestMinutes:t[n-1]};})};
}
const MONEY=/(\b(?:LKR|USD|GBP|EUR|RS\.?)\s*|[$£€]\s*)(\d+(?:,\d{3})*(?:\.\d{1,2})?)(?![\d.])|\b(\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*(LKR|USD|GBP|EUR|RS\.?)\b/gi;
function currency(token){const t=token.trim().toUpperCase();return t.startsWith('RS')?'LKR':({'$':'USD','£':'GBP','€':'EUR'}[t]||t);}
function intent(text){
 if(/\b(unpaid|not|never|pending|cancelled|canceled|refund|reversed|\w+n['’]t)\b/i.test(text))return 'unconfirmed';
 if(/\b(will\s+(?:pay|send|transfer)|promise|tomorrow)\b/i.test(text))return 'promised';
 if(/\b(please|request|quote|estimate|budget|can you|how much|need)\b/i.test(text))return 'requested';
 if(/\b(paid|transferred|deposited|settled|payment sent)\b/i.test(text))return 'claimed_paid';
 if(/\b(invoice|bill|receipt)\b/i.test(text))return 'invoiced';
 return 'mentioned';
}
export function financialAssertions(messages) {
 const records=[];
 for(const m of messages){const matches=[...m.message.matchAll(MONEY)];for(const [i,a] of matches.entries()){
  const amount=Number((a[2]||a[3]).replace(/,/g,''));if(!Number.isFinite(amount))continue;
  records.push({assertionId:`${m.id}:${a.index}`,messageId:m.id,conversationId:m.conversationId,sourceId:m.sourceId,timestamp:m.timestamp,sender:m.sender,amount,currency:currency(a[1]||a[4]),intent:matches.length>1?'ambiguous_multiple_amounts':intent(m.message),amountText:a[0],sourceQuote:m.message,duplicateStatus:'Distinct source assertion; may repeat a real-world transaction. Not summed as ledger truth.'});
 }}return records;
}
export function financialSummary(messages) {
 const assertions=financialAssertions(messages),byIntent=new Map(),byMonth=new Map(),bySender=new Map();
 const seen=new Set();for(const a of assertions){increment(byIntent,a.intent);if(!seen.has(a.messageId)){seen.add(a.messageId);increment(byMonth,a.timestamp.slice(0,7));increment(bySender,a.sender);}}
 return {totalMessagesScanned:messages.length,financialMentionsIdentified:seen.size,assertionsIdentified:assertions.length,methodology:'Currency-anchored assertions; claimed payments are not independently verified transactions. No mixed-currency or duplicate transaction totals.',records:[...countRows(byIntent,'intent'),...countRows(byMonth,'month'),...countRows(bySender,'participant')]};
}
const ISSUE=/\b(problem|issue|broken|repair|leak|not working|damage|complaint|urgent)\b/i;
const RESOLVED=/\b(fixed|done|sorted|repaired|replaced|solved)\b/i;
const NEGATED=/\b(not|never|unresolved|pending|isn['’]?t|hasn['’]?t|wasn['’]?t)\b/i;
const STOP=new Set('the a an is was are be to of and it this that problem issue broken repair leak not working damage complaint urgent fixed done sorted repaired replaced solved please now has been have'.split(' '));
const topic=text=>new Set((text.toLowerCase().match(/[a-z]{3,}/g)||[]).filter(w=>!STOP.has(w)));
export function operationalSnapshot(messages,{days=7,asOf=new Date().toISOString()}={}) {
 const end=Date.parse(asOf),start=end-days*86400000;const selected=messages.filter(m=>Date.parse(m.timestamp)>=start&&Date.parse(m.timestamp)<=end);
 const resolutions=new Map();
 for(const r of selected){
  if(!r.conversationId||!RESOLVED.test(r.message)||NEGATED.test(r.message))continue;
  if(!resolutions.has(r.conversationId))resolutions.set(r.conversationId,new Map());
  const index=resolutions.get(r.conversationId);
  const keys=[...topic(r.message)].map(t=>'topic:'+t);if(r.replyToId)keys.push('reply:'+r.replyToId);
  for(const key of keys){if(!index.has(key))index.set(key,[]);index.get(key).push(r);}
 }
 const firstAfter=(list,time)=>{let low=0,high=list.length;while(low<high){const mid=(low+high)>>>1;if(Date.parse(list[mid].timestamp)<=time)low=mid+1;else high=mid;}const r=list[low];return r&&Date.parse(r.timestamp)-time<=7200000?r:null;};
 const records=[];
 for(const m of selected){if(!ISSUE.test(m.message)||RESOLVED.test(m.message)&&!NEGATED.test(m.message))continue;
  let resolved=null;const index=resolutions.get(m.conversationId);
  if(index){const keys=['reply:'+m.id,...[...topic(m.message)].map(t=>'topic:'+t)];for(const key of keys){const r=firstAfter(index.get(key)||[],Date.parse(m.timestamp));if(r&&(!resolved||r.timestamp<resolved.timestamp))resolved=r;}}
  records.push({issueId:m.id,conversationId:m.conversationId,timestamp:m.timestamp,sender:m.sender,excerpt:m.message,status:!m.conversationId?'unknown_conversation':resolved?'possible_resolution_with_evidence':'no_supported_resolution',resolutionEvidence:resolved?{messageId:resolved.id,timestamp:resolved.timestamp,sender:resolved.sender,quote:resolved.message}:null});
 }
 return {period:{days,start:new Date(start).toISOString(),end:new Date(end).toISOString(),timezone:'UTC'},totalMessagesInPeriod:selected.length,methodology:'Lexical candidate issues and possible resolutions, not verified closure. Same known conversation plus reply or topic evidence; absent evidence does not prove unresolved.',records};
}
