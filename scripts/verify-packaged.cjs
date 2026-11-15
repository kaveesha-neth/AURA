// Exercise the real packaged executable with a fresh, isolated Windows profile.
const fs=require('node:fs');const path=require('node:path');const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'docs',...(process.argv.includes('--refinement')?['ui-refinement','after']:['verification']));fs.mkdirSync(output,{recursive:true});
const profile=fs.mkdtempSync(path.join(root,'.cache','packaged-verification-'));
const port=9228;const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.AURA_RENDERER_URL;
const child=spawn(process.env.AURA_VERIFY_EXECUTABLE||path.join(root,'dist','releases',require('../package.json').version,'win-unpacked','AURA.exe'),[`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,...(process.argv.includes('--software-rendering')?['--disable-gpu','--in-process-gpu','--no-sandbox']:[])],{env,windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const checks=[];let socket;
function check(name,passed){checks.push({name,passed:!!passed});console.log(passed?'PASS':'FAIL',name);if(!passed)throw Error(name);}
(async()=>{
  let target;
  for(let i=0;i<100;i++){try{target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page'&&t.url.includes('index.html'));if(target)break;}catch{}await delay(200);}
  if(!target)throw Error('Packaged renderer did not start');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let id=0;const pending=new Map();const errors=[];
  socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const p=pending.get(message.id);if(p){pending.delete(message.id);message.error?p.reject(Error(JSON.stringify(message.error))):p.resolve(message.result);}}else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
  const run=async expression=>{const response=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(response.exceptionDetails)throw Error(JSON.stringify(response.exceptionDetails));return response.result.value;};
  await send('Runtime.enable');await send('Page.bringToFront');
  for(let i=0;i<100;i++){if(await run(`!!window.aura&&document.getElementById('loading-overlay')?.style.opacity==='0'`))break;await delay(200);}
  check('Packaged React renderer and Glisse initialize',await run(`!!window.aura&&!!document.getElementById('glisse-styles')`));
  check('Packaged app identifies with current version',await run(`window.electronAPI.getAppVersion().then(version=>version===${JSON.stringify(require('../package.json').version)})`));
  check('Standalone window title identifies AURA',await run(`document.title.startsWith('AURA')`));
  check('Packaged renderer has no Node access',await run(`typeof require==='undefined'&&typeof process==='undefined'`));
  for(let i=0;i<100;i++){if(await run(`window.aura.getVolume().available`))break;await delay(100);}
  check('Packaged native master volume bridge initializes',await run(`window.aura.getVolume().available&&window.aura.getVolume().master&&audio.volume===1`));
  const files=fs.readdirSync(path.join(root,'.cache','test-audio')).filter(f=>f.endsWith('.wav')).map(f=>path.join(root,'.cache','test-audio',f));
  check('Packaged IPC scans local music',await run(`window.electronAPI.addPaths(${JSON.stringify(files)}).then(payload=>{applyLibraryPayload(payload);return payload.songs.length===6;})`));
  check('Standalone data stays in the explicitly isolated profile',fs.existsSync(path.join(profile,'data','library.json')));
  await run(`audio.muted=true;window.aura.play(queue.head.id)`);
  for(let i=0;i<60;i++){if(await run(`!audio.paused&&audio.currentTime>0&&audio.duration===30`))break;await delay(200);}
  check('Packaged local media streams and plays',await run(`!audio.paused&&audio.currentTime>0&&audio.duration===30`));
  await run(`document.getElementById('btn-touch-mode').click()`);await delay(700);
  check('Packaged touch mode enters fullscreen with live queue and playback',await run(`isTouchMode&&!isFullscreenMode&&!document.getElementById('touch-player').hidden&&document.querySelectorAll('.touch-row').length===6&&!audio.paused`));
  const touchShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'touch-screen-packaged.png'),Buffer.from(touchShot.data,'base64'));
  await run(`document.getElementById('touch-exit').click()`);await delay(700);
  check('Packaged touch exit restores desktop',await run(`!isTouchMode&&document.getElementById('touch-player').hidden`));
  await run(`btnPlay.click()`);
  await run(`window.aura.touchMode(true);document.querySelectorAll('.touch-source-switch button')[1].click()`);await delay(900);
  check('Packaged Windows mode replaces queue with session and output panels',await run(`!!document.querySelector('.system-sessions')&&!!document.querySelector('.system-outputs')&&!document.querySelector('.touch-queue')`));
  check('Packaged Windows mode discovers real audio outputs',await run(`document.querySelectorAll('.system-output').length>0`));
  for(let i=0;i<80;i++){if(await run(`window.electronAPI.getWindowsMedia().then(s=>s.bridge==='dotnet8')`))break;await delay(150);}
  check('Packaged sessions use the compiled .NET 8 bridge',await run(`window.electronAPI.getWindowsMedia().then(s=>s.bridge==='dotnet8')`));
  check('Native connection failures retain diagnostic exception details',await run(`window.electronAPI.getWindowsMedia().then(s=>s.available||(!!s.error&&s.diagnostic?.includes('0x')))`));
  const windowsShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'windows-media-packaged.png'),Buffer.from(windowsShot.data,'base64'));
  await run(`document.querySelector('.touch-source-switch button').click();window.aura.touchMode(false)`);await delay(700);
  check('Packaged source switch restores native queue',await run(`!!document.querySelector('.touch-queue')&&!state.isPlaying`));
  await require('./packaged-ui-checks.cjs')({run,send,check,output,delay});
  await run(`document.getElementById('btn-settings').click()`);await delay(600);
  check('Packaged settings show correct version',await run(`document.getElementById('settings-version').textContent===${JSON.stringify('v'+require('../package.json').version)}`));
  const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'11-packaged.png'),Buffer.from(shot.data,'base64'));
  check('Packaged renderer has no uncaught exceptions',errors.length===0);
  fs.writeFileSync(path.join(output,'packaged-checks.json'),JSON.stringify({checks,errors},null,2));
  await run(`window.electronAPI.close()`);socket.close();
})().catch(error=>{console.error(error);socket?.close();child.kill();process.exitCode=1;});
