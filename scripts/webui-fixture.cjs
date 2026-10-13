// Synthetic local service for UI regression tests.
function mockHost(options){
  window.fixture={mode:'balance',effective:'balance',pkg:'com.omarea.vtools',linked:!!options.linked,external:!!options.external,
    installed:options.presence==='available',presence:options.presence||'available',automatic:!!options.automatic,
    rules:[{package:'com.example.chat',mode:'balance'}],sockets:[],messages:[],commands:[]};
  const f=window.fixture;
  const labels={'com.omarea.vtools':'Scene','com.example.chat':'聊天'};
  const modes=()=>`mode:${f.mode},effective:${f.external?'':f.effective},package:${f.pkg},controller:${f.external?'Scene（其它调度器）':f.linked?'Scene（NovaSched Zen Edition）':'WebUI'},sceneActive:${f.external},sceneLinked:${f.linked},phase:${f.external?'suspended':'ready'},heartbeatMs:20,port:31415,socName:Snapdragon 8 Gen 3,socId:SM8650,configProfile:SM8650.json,automaticEnabled:${f.automatic},automaticActive:${f.automatic&&!f.linked&&!f.external},appKind:daily,classificationSource:fixture,fasAvailable:true,sceneInstalled:${f.installed},scenePresence:${f.presence}`;
  const apps=()=>JSON.stringify({type:'app-modes',rules:f.rules,defaultMode:f.mode,version:'2.2.8',classificationOverrides:{}});
  const logs='2026-10-13 03:00:00 INFO -> Scene 回调已注册\n2026-10-13 03:00:01 WARN -> 等待节点读回\n';
  function update(message){
    f.messages.push(message);
    if(['powersave','balance','performance','fast'].includes(message)){f.mode=f.effective=message;f.automatic=false;}
    else if(message==='auto\ton'){f.automatic=true;f.effective='powersave';}
    else if(message==='auto\toff'){f.automatic=false;f.effective=f.mode;}
    else if(message.startsWith('set\t')){const[,pkg,mode]=message.split('\t');f.rules=f.rules.filter(r=>r.package!==pkg);f.rules.push({package:pkg,mode});}
    else if(message.startsWith('delete\t'))f.rules=f.rules.filter(r=>r.package!==message.split('\t')[1]);
    for(const socket of f.sockets)socket.push();
  }
  window.ksu={exec(command,settings,callback){
    f.commands.push(command);
    let stdout;
    if(command.includes('webui-session'))stdout=JSON.stringify({port:31415,token:'a'.repeat(64),origin:location.origin,moduleDir:'/data/adb/modules/NovaSched_Zen_Edition'});
    else if(command.includes('webui-rpc')){
      const raw=command.match(/--request '([^']+)'/)[1],request=JSON.parse(raw);
      if(request.message)update(request.message);
      stdout=JSON.stringify({modes:modes(),apps:apps(),logs:request.logs&&!request.cursor?logs:'',cursor:'test',logsReset:false});
    }else stdout='scene_presence=available\nscene_detection=fixture PackageManager\nscene_linked=true\n';
    setTimeout(()=>window[callback]?.(0,stdout,''),0);
  }};
  if(options.labels!==false)window.ksu.getPackagesInfo=packages=>JSON.stringify(JSON.parse(packages).map(packageName=>({packageName,appLabel:labels[packageName]||packageName})));
  class MockSocket{
    static OPEN=1;static CONNECTING=0;
    constructor(url,protocols){
      if(options.root)throw new Error('WebSocket unavailable');
      this.url=url;this.protocols=protocols;this.readyState=0;f.sockets.push(this);
      setTimeout(()=>{if(this.readyState===3)return;this.readyState=1;this.onopen?.({});this.push();},15);
    }
    push(){if(this.readyState!==1)return;const data=this.url.endsWith('/modes')?modes():this.url.endsWith('/app-modes')?apps():logs;setTimeout(()=>this.onmessage?.({data}),5);}
    send(message){update(message);}
    close(){this.readyState=3;this.onclose?.({});}
  }
  window.WebSocket=MockSocket;
  window.fixturePush=()=>{for(const socket of f.sockets)socket.push();};
}
module.exports = mockHost;
