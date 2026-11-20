// node tests/check.mjs [path/to/a/copied/starter]
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import vm from 'node:vm';

const exampleDir=fileURLToPath(new URL('../assets/starter/',import.meta.url));
const directory=resolve(process.argv[2] || exampleDir);
const context=vm.createContext({});
for (const filename of ['model.js','core.js']) {
  const path=resolve(directory,filename);
  vm.runInContext(readFileSync(path,'utf8'),context,{filename:path});
}
const {ATLAS:model, AtlasCore:core}=context;
assert.ok(model && core,'The model and core must expose ATLAS and AtlasCore.');
assert.deepEqual([...core.validate(model)],[],'Model integrity');

function verifySource(requirement) {
  const source=requirement.source;
  if (/^https?:\/\//i.test(source)) {
    assert.ok(new URL(source).hostname,requirement.id+' invalid external source URL');
    return; // Run offline. A well-formed external URL is not evidence that it is accessible.
  }
  assert.ok(!/^[a-z][a-z0-9+.-]*:/i.test(source),requirement.id+' unsupported source URL');
  const url=new URL(source,pathToFileURL(resolve(directory,'index.html')));
  const file=fileURLToPath(url);
  assert.ok(statSync(file).isFile(),requirement.id+' missing local source: '+source);
  if (url.hash && /\.html?$/i.test(file)) {
    const anchor=decodeURIComponent(url.hash.slice(1));
    const ids=[...readFileSync(file,'utf8').matchAll(/\b(?:id|name)\s*=\s*["']([^"']+)["']/gi)].map(hit=>hit[1]);
    assert.ok(ids.includes(anchor),requirement.id+' missing local HTML anchor '+source);
  }
}
model.requirements.forEach(verifySource);
const actionIndex=new Map(model.actions.map(a=>[a.id,a]));
const pageIndex=new Map(model.pages.map(p=>[p.id,p]));
let walks=0,steps=0;

function replay(walk,mode) {
  const session=core.createSession(model);
  session.setMode(mode);
  const context=mode+' · '+walk.title;
  assert.ok(session.jump(walk.start), context+' has unreachable start '+walk.start);
  for (const id of walk.steps) {
    assert.ok(session.actions().some(a=>a.id===id),context+' unavailable '+id+' at '+session.current);
    assert.equal(session.perform(id),true,context+' failed '+id);steps++;
  }
  if(walk.endsAt) assert.equal(session.current,walk.endsAt,context+' final page');
  for(const [key,expected] of Object.entries(walk.expectState||{})) {
    assert.equal(session.state[key],expected,context+' final state.'+key);
  }
  walks++;
}
for(const walk of model.walks||[]) {
  const planned=pageIndex.get(walk.start).planned || walk.steps.some(id=>{
    const a=actionIndex.get(id);
    return a.planned||pageIndex.get(a.from).planned||pageIndex.get(a.to)?.planned;
  });
  replay(walk,planned?'plan':'live');
}
for(const mode of ['live','plan']) {
  const session=core.createSession(model);session.setMode(mode);
  for(const page of model.pages) {
    const ok=session.jump(page.id);
    assert.equal(ok,mode==='plan'||!page.planned,'Structural reachability: '+mode+' / '+page.id);
  }
  for(const r of model.requirements) {
    const impact=core.impact(model,r.id,mode);
    for(const id of [...impact.pages,...impact.entries]) {
      const p=pageIndex.get(id);
      assert.ok(p && (mode==='plan'||!p.planned),r.id+' unknown or hidden impact node '+id);
    }
    for(const walk of impact.cases) {
      assert.ok(walk.title && walk.expect && walk.steps.length,r.id+' incomplete suggestion');
      replay(walk,mode);
    }
  }
}

// Only the bundled sample promises these particular behaviors. Custom project IDs,
// states, source systems and labels are checked against their own declarations above.
if (directory===resolve(exampleDir)) {
  const app=core.createSession(model);
  const doActions=(...ids)=>ids.forEach(id=>assert.ok(app.perform(id),'Unavailable sample action '+id));
  assert.equal(app.perform('saved-book'),false,'Guarded actions must not perform from the wrong page');
  doActions('shelf-search','search-book','book-note','note-draft','note-cancel');
  assert.equal(app.state.note,model.initialState.note);
  doActions('book-note','note-draft','note-save','book-share','share-toggle','share-send','system-cancel');
  assert.equal(app.state.includeNote,false);
  doActions('share-close','book-share');assert.equal(app.state.includeNote,true);
  doActions('share-close','book-back');assert.equal(app.current,'search');
  app.jump('book');
  assert.equal(app.state.note,app.state.alternative);
  assert.equal(app.perform('book-excerpts'),false);
  assert.equal(core.impact(model,'R-05','live').cases.length,0);
  app.setMode('plan');doActions('book-excerpts');app.setMode('live');assert.equal(app.current,'book');
  assert.equal(app.perform('excerpt-save'),false);
  app.setMode('plan');doActions('book-excerpts','excerpt-cancel');assert.equal(app.state.excerptSaved,false);
  assert.equal(core.format('{{note}}',app.state),app.state.note);
  app.reset();assert.equal(app.current,model.start);assert.equal(app.state.note,model.initialState.note);
  assert.deepEqual([...app.stack],[model.start]);
}

console.log('Atlas checks passed: '+model.pages.length+' pages, '+model.actions.length+' actions, '+
  model.requirements.length+' requirements, '+walks+' walk replays, '+steps+' steps.');
