// DOM component acceptance for the paragraph editor and its binding adapter.
// Native insertText/Undo exercise browser editing; Enter/paste and Ctrl+Z/Y after
// chip/style changes exercise the editor's explicit handlers. The record adapter
// is isolated here; canvas-text-test.js covers real workbook authoring through the GUI.
const results=wordsErrors,wait=ms=>new Promise(r=>setTimeout(r,ms)),check=(name,ok)=>{results.push({name,ok:!!ok});if(!ok)throw Error(name);};
const state=preactSignals.signal({text:'Contact  about the project.\n\nPlease reply by Friday.',runs:[]});let writes=0,look=null,field='Name';
let denySource=false;const put=(text,runs)=>{if(denySource)return{error:'Resolve the pending edit first.'};writes++;state.value={text,runs};};
const formatting={base:{Size:12,Bold:false,Italic:false,Underline:false},apply:(runs,a,b,label,value)=>Scene.runsWith(runs,a,b,label,value,{Size:12,Bold:false,Italic:false,Underline:false}),style:r=>({...('Bold'in r&&{fontWeight:r.Bold?700:400}),...('Italic'in r&&{fontStyle:r.Italic?'italic':'normal'}),...(r.Underline&&{textDecoration:'underline'})}),changed:v=>{look=v;}};
function Words(props){const d=state.value;return preact.h(WordsEditor,{...props,...d,put,offered:['Name','Project','Due']});}
function open(){return CanvasWords.open({id:'layer',host:document.querySelector('#over'),style:{left:'0px',top:'0px',width:'650px','--check-var':'yes'},formatting,render:props=>preact.h(Words,props)});}
const editor=()=>document.querySelector('.dc-text-editor .words-in');
function range(node,a,b=a){const r=document.createRange();r.setStart(node,a);r.setEnd(node,b);const s=getSelection();s.removeAllRanges();s.addRange(r);editor().focus();editor().dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));}
function textNode(needle){const w=document.createTreeWalker(editor(),NodeFilter.SHOW_TEXT);for(let n;n=w.nextNode();)if(!n.parentElement.closest('.word-chip')&&n.data.includes(needle))return n;throw Error('Missing text '+needle);}
const key=(key,options={})=>editor().dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...options}));
function selectWord(needle){const n=textNode(needle),at=n.data.indexOf(needle);range(n,at,at+needle.length);}
document.querySelector('#field').onclick=()=>CanvasWords.insert(field);document.querySelector('#bold').onclick=()=>CanvasWords.set('Bold');
async function run(){
 open();await wait(50);check('Custom CSS properties reach overlay',CanvasWords.active.peek().element.style.getPropertyValue('--check-var')==='yes');
 let n=textNode('Contact  about');range(n,8);document.querySelector('#field').click();await wait(30);
 check('A field inserts inside constant prose and keeps both paragraphs',state.value.text==='Contact {Name} about the project.\n\nPlease reply by Friday.');
 selectWord('project');field='Project';document.querySelector('#field').click();await wait(30);
 check('A field replaces only the selected word',state.value.text==='Contact {Name} about the {Project}.\n\nPlease reply by Friday.');
 selectWord('Contact');document.querySelector('#bold').click();await wait(30);
 check('Toolbar styling records only selected literal characters',state.value.runs.some(r=>r.from===0&&r.to===7&&r.Bold));
 check('The selected literal displays its formatting',getComputedStyle(textNode('Contact').parentElement).fontWeight==='700');
 let chip=editor().querySelector('[data-token="Name"]'),r=document.createRange();r.selectNode(chip);getSelection().removeAllRanges();getSelection().addRange(r);editor().dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));key('i',{ctrlKey:true});await wait(30);
 check('Keyboard styling covers the complete atomic field',state.value.runs.some(r=>r.from===8&&r.to===14&&r.Italic));
 const rendered=TextTemplate.renderRuns(state.value.text,k=>k==='Name'?'Alexandra Wilson':'Atlas',state.value.runs);
 check('Atomic formatting follows a longer substituted value',rendered.runs.some(r=>r.from===8&&r.to===24&&r.Italic));
 key('z',{ctrlKey:true});await wait(30);check('Undo removes just the latest field style',!state.value.runs.some(r=>r.Italic)&&state.value.runs.some(r=>r.Bold));
 key('z',{ctrlKey:true,shiftKey:true});await wait(30);check('Redo restores field formatting',state.value.runs.some(r=>r.Italic));
 selectWord('Friday');field='Due';document.querySelector('#field').click();await wait(30);check('A second inline field preserves punctuation',state.value.text.endsWith('by {Due}.'));
 key('z',{ctrlKey:true});await wait(30);check('Undo after inserting a field restores the replaced word',state.value.text.endsWith('by Friday.'));
 key('y',{ctrlKey:true});await wait(30);check('Redo restores the inserted field',state.value.text.endsWith('by {Due}.'));
 n=textNode('Please reply');range(n,n.data.indexOf('Please'));document.execCommand('insertText',false,'Keep {literal}. ');CanvasWords.flush();await wait(30);
 check('Literal braces typed inside a template stay literal',state.value.text.includes('Keep \\{literal\\}. Please'));
 key('z',{ctrlKey:true});await wait(30);check('Text Undo shares the inline chip/style sequence',!state.value.text.includes('literal')&&state.value.text.includes('{Due}'));
 key('y',{ctrlKey:true});await wait(30);check('Text Redo preserves literal escaping and fields',state.value.text.includes('Keep \\{literal\\}. Please')&&state.value.text.includes('{Due}'));
 chip=editor().querySelector('[data-token="Name"]');const b=chip.getBoundingClientRect();CanvasWords.insert('Project',{x:b.left+b.width*.2,y:b.top+b.height/2});await wait(30);
 check('Dropping onto a chip inserts before it without nesting tokens',state.value.text.includes('{Project}{Name}')&&editor().querySelectorAll('.word-chip .word-chip').length===0);
 const count=writes;CanvasWords.close();await wait(30);check('Closing after a committed edit does not write it again',writes===count&&CanvasWords.active.peek()===null&&look===null);
 state.value={text:'Alpha',runs:[]};open();await wait(30);n=textNode('Alpha');range(n,5);document.execCommand('insertText',false,'!');document.execCommand('undo');CanvasWords.flush();await wait(30);
 check('Native Undo still handles text before the first programmatic action',state.value.text==='Alpha');CanvasWords.close();
 state.value={text:'Panel ',runs:[]};function Panel(){return CanvasWords.active.value?preact.h('p',null,'Editing on canvas'):preact.h(Words,{label:'Panel text'});}preact.render(preact.h(Panel),document.querySelector('#panel'));await wait(30);
 let panel=document.querySelector('.inspector .words-in');panel.focus();r=document.createRange();r.selectNodeContents(panel);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);document.execCommand('insertText',false,'draft');
 const before=writes;open();await wait(30);check('Opening on canvas commits an unblurred panel draft exactly once',state.value.text==='Panel draft'&&writes===before+1&&editor().textContent==='Panel draft'&&!document.querySelector('.inspector .words-in'));
 CanvasWords.close();await wait(30);check('The returned panel sees the committed canvas source',document.querySelector('.inspector .words-in')?.textContent==='Panel draft');
 panel=document.querySelector('.inspector .words-in');panel.focus();r=document.createRange();r.selectNodeContents(panel);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);denySource=true;document.execCommand('insertText',false,' blocked');
 const beforeRejected=writes,rejected=open();await wait(30);
 check('A rejected sidebar draft blocks canvas handoff and keeps its original editor',rejected===null&&!CanvasWords.active.peek()&&document.querySelector('.inspector .words-in')===panel&&panel.textContent==='Panel draft blocked'&&state.value.text==='Panel draft'&&document.querySelector('[role="alert"]')?.textContent==='Resolve the pending edit first.');
 denySource=false;open();await wait(30);check('Retrying sidebar handoff saves its retained draft exactly once',writes===beforeRejected+1&&state.value.text==='Panel draft blocked'&&editor().textContent==='Panel draft blocked'&&!document.querySelector('.inspector .words-in'));CanvasWords.close();await wait(30);
}
const recordValues=preactSignals.signal({Name:'Alice',Role:'Engineer',Count:'2',Multi:'First\nSecond',ManagerName:'Morgan'});let recordWrites=0,focused=null,mirrored=null,dragged=null;
const bindingAdapter={read:token=>{const name=token.split('|')[0],bare=name==='My name'?'Name':name==="Manager's name"?'ManagerName':name,readonly=token.includes('|'),at=bare==='ManagerName'?'b':'a',edge=bare==='ManagerName'?'Name':bare;return{text:readonly?'A':recordValues.value[bare]??'',label:name,editable:!readonly,target:{id:recordValues.value[bare]?at+'_'+edge:null,slot:{at,edge},recordId:at,path:[edge],datatype:'text'},...(readonly&&{error:'Initials cannot be edited directly.'})};},putValue:(token,text,target)=>{if(token==='Count'&&!/^\d+$/.test(text))return{error:'Enter a whole number.'};const field=target.slot.at==='b'?'ManagerName':target.slot.edge;recordValues.value={...recordValues.peek(),[field]:text};recordWrites++;return{text};},focus:token=>{focused=token;},draft:(token,value)=>{mirrored=value&&{token,...value};}};
function BoundEditor(props){recordValues.value;const d=state.value;return preact.h(WordsEditor,{...props,...d,put,offered:['Name','Role','Count']});}
function openBound(source){if(source!==undefined)state.value={text:source,runs:[]};return CanvasWords.open({id:'layer',host:document.querySelector('#over'),style:{left:'0px',top:'0px',width:'650px'},formatting,bindings:bindingAdapter,dragSelection:(e,s)=>{dragged=s;},render:props=>preact.h(BoundEditor,props)});}
const fieldNode=token=>editor().querySelector(`[data-token="${token}"]`);
function inField(token,from=0,to=from){const node=BoundWords.valueElement(fieldNode(token)),r=document.createRange();node.focus();r.selectNodeContents(node);if(node.firstChild?.nodeType===3){r.setStart(node.firstChild,from);r.setEnd(node.firstChild,to);}const s=getSelection();s.removeAllRanges();s.addRange(r);node.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));}
async function valueEdit(token,text){const node=BoundWords.valueElement(fieldNode(token)),r=document.createRange();node.focus();r.selectNodeContents(node);getSelection().removeAllRanges();getSelection().addRange(r);node.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));const lines=text.split('\n');document.execCommand('insertText',false,lines[0]);for(const line of lines.slice(1)){key('Enter');document.execCommand('insertText',false,line);}await wait(30);}
async function boundRun(){
 preact.render(null,document.querySelector('#panel'));
 const source="Contact {Name} — {Role}.\n{Name} has {Count} seats.\n{Multi} ({Name|initials})\n{My name} / {Manager's name}";openBound(source);await wait(40);
 check('Bound mode shows resolved editable values and keeps readonly reasons',fieldNode('Name').textContent==='Alice'&&BoundWords.valueElement(fieldNode('Name')).contentEditable==='plaintext-only'&&fieldNode('Name|initials').textContent==='A'&&fieldNode('Name|initials').contentEditable==='false'&&fieldNode('Name|initials').title.includes('cannot'));
 inField('Name',1,3);await wait(30);check('Cursor entry publishes the field identity and nonliteral selection',focused==='Name'&&CanvasWords.selection.peek()?.literal===false&&CanvasWords.selection.peek().from===8&&CanvasWords.selection.peek().to===14);
 await valueEdit('Name','Alexandra');check('Typing a field changes its draft and repeated occurrences without rewriting template text',state.value.text===source&&recordValues.peek().Name==='Alice'&&mirrored.text==='Alexandra'&&[...editor().querySelectorAll('[data-token="Name"]')].every(n=>n.textContent==='Alexandra'));
 let before=recordWrites;selectWord('Contact');await wait(30);check('Leaving a field saves one record value and clears its highlight',recordValues.peek().Name==='Alexandra'&&recordWrites===before+1&&focused===null&&state.value.text===source);
 check('Literal selection publishes source coordinates for drag extraction',CanvasWords.selection.peek()?.literal&&CanvasWords.selection.peek().text==='Contact'&&CanvasWords.selection.peek().source===source);
 editor().dispatchEvent(new DragEvent('dragstart',{bubbles:true}));check('Dragging a literal exposes its selection without choosing a destination',dragged?.text==='Contact'&&dragged.literal&&dragged.source===source);
 document.querySelector('#bold').click();await wait(30);await valueEdit('Name','Beatrice');CanvasWords.flush();await wait(30);check('Data writes after source formatting still leave the template intact',recordValues.peek().Name==='Beatrice'&&state.value.text===source);
 inField('Name',2);key('z',{ctrlKey:true});await wait(30);check('Inline Undo can restore a value after its record write',recordValues.peek().Name==='Alexandra'&&fieldNode('Name').textContent==='Alexandra'&&state.value.runs.some(r=>r.Bold));
 key('y',{ctrlKey:true});await wait(30);check('Inline Redo restores the edited value without changing the binding',recordValues.peek().Name==='Beatrice'&&state.value.text===source);
 await valueEdit('Count','bad');const failedClose=CanvasWords.close();await wait(30);check('An invalid typed value blocks finish and retains the editable draft',failedClose===false&&!!CanvasWords.active.peek()&&recordValues.peek().Count==='2'&&fieldNode('Count').textContent==='bad'&&document.querySelector('[role="alert"]')?.textContent==='Enter a whole number.');
 key('Escape');await wait(30);check('Escape cancels the invalid value without deleting its field',fieldNode('Count').textContent==='2'&&!document.querySelector('[role="alert"]')&&state.value.text===source);
 await valueEdit('Name','');CanvasWords.flush();await wait(30);check('Deleting a complete value preserves its field identity and an empty placeholder',recordValues.peek().Name===''&&fieldNode('Name').classList.contains('empty')&&state.value.text===source);
 await valueEdit('Multi','Line one\nLine two');CanvasWords.flush();await wait(30);check('Multiline values write through the field while source paragraphs stay unchanged',recordValues.peek().Multi==='Line one\nLine two'&&state.value.text===source);
 CanvasWords.close();recordValues.value={...recordValues.peek(),Name:'Alice'};openBound('Hello {Name}!');await wait(30);
 await valueEdit('Name','Bob');CanvasWords.flush();await wait(30);inField('Name',3);document.execCommand('undo');CanvasWords.flush();await wait(30);check('Native Undo across a committed value writes the restored value back',recordValues.peek().Name==='Alice'&&state.value.text==='Hello {Name}!');
 inField('Name',5);key('ArrowRight');document.execCommand('insertText',false,' works');CanvasWords.flush();await wait(30);check('Arrowing out of a value lets typing add literal text instead of extending the field',state.value.text==='Hello {Name} works!'&&recordValues.peek().Name==='Alice');
 CanvasWords.close();
}
async function extraRun(){
 recordValues.value={...recordValues.peek(),Name:'Alice',ManagerName:'Morgan'};openBound("{Name} / {My name} / {Manager's name}");await wait(30);await valueEdit('Name','Alexandra');CanvasWords.flush();await wait(30);
 check('Aliases share a draft while equal field paths on different owners stay separate',fieldNode('My name').textContent==='Alexandra'&&fieldNode("Manager's name").textContent==='Morgan'&&recordValues.peek().ManagerName==='Morgan');CanvasWords.close();
 openBound('Value: {Multi}.');await wait(30);let value=BoundWords.valueElement(fieldNode('Multi')),r=document.createRange();value.focus();r.selectNodeContents(value);getSelection().removeAllRanges();getSelection().addRange(r);value.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));const transfer=new DataTransfer();transfer.setData('text/plain','First\nSecond\nThird');value.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:transfer}));CanvasWords.flush();await wait(30);
 check('Plain-text paste preserves multiline values and the containing template',recordValues.peek().Multi==='First\nSecond\nThird'&&state.value.text==='Value: {Multi}.');key('z',{ctrlKey:true});await wait(30);check('Undo restores the value before a multiline paste',recordValues.peek().Multi==='Line one\nLine two'&&state.value.text==='Value: {Multi}.');CanvasWords.close();
 openBound('Count: {Count}.');await wait(30);await valueEdit('Count','bad');let outsideClicks=0;const button=document.createElement('button');button.textContent='Outside';button.onclick=()=>outsideClicks++;document.body.append(button);button.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,button:0}));button.click();await wait(30);
 check('Invalid-field pointer and click cannot trigger an outside action',outsideClicks===0&&CanvasWords.active.peek()&&fieldNode('Count').textContent==='bad');key('Escape');button.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,button:0}));button.click();await wait(30);check('After cancellation the same outside action works normally',outsideClicks===1&&!CanvasWords.active.peek());button.remove();
 openBound('Original {Name}.');await wait(30);selectWord('Original');document.execCommand('insertText',false,'Changed');denySource=true;const before=writes,closed=CanvasWords.close();await wait(30);
 check('Rejected literal writes retain the draft and block closing',closed===false&&state.value.text==='Original {Name}.'&&editor().textContent.startsWith('Changed')&&document.querySelector('[role="alert"]')?.textContent==='Resolve the pending edit first.');denySource=false;CanvasWords.close();await wait(30);check('A retained literal draft can be saved exactly once after the rejection clears',state.value.text==='Changed {Name}.'&&writes===before+1&&!CanvasWords.active.peek());
}
run().then(boundRun).then(extraRun).catch(e=>results.push({name:e.stack,ok:false})).finally(()=>{const failed=results.filter(x=>!x.ok).length;document.querySelector('#out').textContent=`${results.length-failed} passed, ${failed} failed\n`+results.map(x=>(x.ok?'pass ':'FAIL ')+x.name).join('\n');});
