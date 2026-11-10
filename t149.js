/* Nine checks against the real functions lifted out of the door, not a copy. */
const fs = require('fs');
const src = fs.readFileSync('chk.js', 'utf8');
const start = src.indexOf('const THREAD_KEY');
const end = src.indexOf('function sayGreeting() {');
if (start < 0 || end < 0) { console.error('could not lift'); process.exit(1); }
let lifted = src.slice(start, end);

// --- stubs the door provides at runtime ---
const store = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
global.isNoise = (t) => /^(uh|um|hmm|eu|it|the)$/i.test(String(t).trim());
global.songDraft = { at: 0, askBeat: '' };
global.openJourneyBeat = () => (songDraft.at ? 'What kind of music should it be?' : '');
global.madeLoad = () => null;
global.logEl = { appendChild(){}, scrollTop:0, scrollHeight:0 };
global.addTurn = (who, text) => ({ querySelector: () => ({ style: {} }), who, text });
global.resetTurns = () => {};
global.document = { createElement: () => ({ className:'', style:{}, textContent:'', appendChild(){} }) };
global.logLine = (fac, text) => { global.__logs = global.__logs || []; global.__logs.push([fac, text]); };
global.micBtn = { classList: { remove(){}, add(){} } };
global.setState = (t) => { global.__state = t; };
global.warn = (t) => { global.__warn = t; };
global.stopClock = () => {};
global.closeMic = () => {};
global.foldForDoor = () => {};
global.greetWatch = null;
global.greeting = false;
global.ws = null;
global.sessionUp = false; global.listening = false; global.busy = false; global.connecting = false;
global.WS = class { close(){} };

const sandbox = { THREAD_KEY:'ei.door.thread' };
const fn = new Function('localStorage','isNoise','songDraft','openJourneyBeat','madeLoad','logEl','addTurn',
  'resetTurns','document','logLine','micBtn','setState','warn','stopClock','closeMic','foldForDoor','ws',
  'sessionUp','listening','busy','connecting','greeting','greetWatch','setWs',
  lifted + `
  return { threadLoad, threadRemember, threadClear, threadAgo, threadRecap, threadRestoreOnScreen,
           refusalOf, doorRefused, REFUSALS, save: () => localStorage.setItem('x','1') };`);
// ws is a live binding in the door; the stub passes a getter-free value, so doorRefused's ws=null is local.
const api = fn(global.localStorage, global.isNoise, global.songDraft, global.openJourneyBeat, global.madeLoad,
  global.logEl, global.addTurn, global.resetTurns, global.document, global.logLine, global.micBtn,
  global.setState, global.warn, global.stopClock, global.closeMic, global.foldForDoor, global.ws,
  false, false, false, false, false, null, null);

let pass = 0, fail = 0;
function check(name, cond, extra) { if (cond) { console.log('  PASS', name); pass++; }
  else { console.log('  FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); fail++; } }

console.log('--- 1. the thread keeps the last turns and drops the oldest');
api.threadClear();
api.threadRemember('you', 'make a song about the rooftop');
api.threadRemember('engine', 'What kind of music should it be?');
for (let i = 0; i < 12; i++) api.threadRemember('you', 'line ' + i);
let th = api.threadLoad();
check('kept at most ten turns', th.turns.length === 10, th.turns.length);
check('newest kept', th.turns[9].text === 'line 11', th.turns[9].text);
check('oldest gone', !th.turns.some(t => /rooftop/.test(t.text)));

console.log('--- 2. noise is not context');
api.threadClear();
api.threadRemember('you', 'uh');
check('a thinking noise is not stored', api.threadLoad() === null);

console.log('--- 3. a stale thread is not loaded');
api.threadClear();
api.threadRemember('you', 'are you there');
th = api.threadLoad();
th.at = Date.now() - (13 * 3600e3);
store.set('ei.door.thread', JSON.stringify(th));
check('older than twelve hours is dropped', api.threadLoad() === null);

console.log('--- 4. the recap reads as a conversation');
api.threadClear();
api.threadRemember('you', 'make it country');
api.threadRemember('engine', 'Done, it is on your shelf.');
const recap = api.threadRecap(api.threadLoad());
check('his words attributed', /he said: "make it country"/.test(recap), recap);
check('the door\'s words attributed', /you answered: "Done, it is on your shelf\."/.test(recap), recap);

console.log('--- 5. the cap refusal is named, not quoted');
const cap = 'Your project has exceeded its monthly spending cap. Please go to AI Studio at https://ai.studio/spend to manage your projec';
const r = api.refusalOf(cap);
check('cap recognised', r && r.kind === 'cap', r && r.kind);
check('plain words, no Google sentence', r && !/AI Studio/.test(r.line), r && r.line);
check('the fix is named', r && /ai\.studio\/spend/.test(r.line));
check('the reset is named', r && /1 December/.test(r.line));
check('it says the door is fine', r && /^the door is fine/.test(r.line));

console.log('--- 6. the other refusals map to their own truth');
check('quota', api.refusalOf('RESOURCE_EXHAUSTED: quota exceeded') .kind === 'quota');
check('key', api.refusalOf('API key not valid. Please pass a valid API key.').kind === 'key');
check('model', api.refusalOf('models/gemini-3.1-flash-live-preview is not found for API version').kind === 'model');

console.log('--- 7. an ordinary error is not dressed as a refusal');
check('a plain fault is not a refusal', api.refusalOf('the stream reported a problem') === null);
check('empty is not a refusal', api.refusalOf('') === null);

console.log('--- 8. a refusal puts plain words on screen and never the wire text');
global.__warn = ''; global.__state = ''; global.__logs = [];
api.doorRefused(cap);
check('state says refused', /refused/.test(global.__state), global.__state);
check('screen got the plain line', /the door is fine/.test(global.__warn), global.__warn);
check('screen did NOT get the Google sentence', !/AI Studio/.test(global.__warn), global.__warn);
check('the raw sentence is kept once in the log',
  global.__logs.filter(l => l[0] === 'door.refused').length === 1, global.__logs);
check('the log names the kind', /^cap/.test(global.__logs[0][1]), global.__logs[0][1]);
api.doorRefused(cap);
check('a repeat within a minute is not logged twice',
  global.__logs.filter(l => l[0] === 'door.refused').length === 1, global.__logs.length);

console.log('--- 9. an unnamed refusal still says whose it is, without quoting the wire');
global.__warn = '';
api.doorRefused('something nobody has classified');
check('says the door is fine', /^the door is fine/.test(global.__warn), global.__warn);
check('does not leak an unclassified sentence onto the screen', !/nobody has classified/.test(global.__warn), global.__warn);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
