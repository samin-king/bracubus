const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const {spawn,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');process.chdir(root);
if(fs.existsSync('.env'))process.loadEnvFile('.env');
const local=path.join(root,'.local');fs.mkdirSync(local,{recursive:true});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function listening(port){return new Promise(resolve=>{const socket=net.connect(port,'127.0.0.1');socket.setTimeout(1000);socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));socket.once('timeout',()=>{socket.destroy();resolve(false);});});}
function run(command,args){const result=spawnSync(command,args,{cwd:root,stdio:'inherit',windowsHide:true});if(result.error)throw result.error;if(result.status!==0)throw new Error(command+' failed with exit '+result.status);}
function npm(script){run('cmd.exe',['/d','/c','npm.cmd run '+script]);}
function background(command,name){const child=spawn('cmd.exe',['/d','/c',command],{cwd:root,env:process.env,detached:true,windowsHide:true,stdio:['ignore',fs.openSync(path.join(local,name+'.stdout.log'),'a'),fs.openSync(path.join(local,name+'.stderr.log'),'a')]});child.unref();return child.pid;}
async function ready(url,check){for(let i=0;i<50;i++){try{const response=await fetch(url,{signal:AbortSignal.timeout(1000)});if((response.ok||response.status===401)&&await check(response))return;}catch{}await delay(200);}throw new Error('Startup check failed: '+url+'; inspect .local logs');}
(async()=>{
 if(!process.env.DATABASE_URL)throw new Error('Configure DATABASE_URL in .env');
 const db=new URL(process.env.DATABASE_URL),dbPort=Number(db.port)||5432;
 if(!['localhost','127.0.0.1'].includes(db.hostname))throw new Error('This launcher is for a local development database');
 if(!await listening(dbPort)){
  const pgCtl=path.join(local,'postgresql17','pgsql','bin','pg_ctl.exe'),data=path.join(local,'postgres-data');
  if(fs.existsSync(pgCtl)&&fs.existsSync(path.join(data,'PG_VERSION')))run(pgCtl,['-D',data,'-l',path.join(local,'postgresql.log'),'-o','-h localhost -p '+dbPort,'-w','start']);
  else run('docker.exe',['compose','up','-d','--wait']);
 }
 npm('migrate');
 const apiPort=Number(process.env.PORT||process.env.API_PORT)||3000;
 if(!await listening(apiPort))background('npm.cmd run dev','backend');
 await ready('http://localhost:'+apiPort+'/api/auth/me',async r=>(await r.json()).error==='unauthenticated');
 if(!await listening(5173))background('npm.cmd run dev --workspace transport-client -- --host 127.0.0.1 --strictPort','frontend');
 await ready('http://localhost:5173',async r=>(await r.text()).includes('BRACU Transport Management'));
 console.log('Backend: http://localhost:'+apiPort+'/api');console.log('Frontend: http://localhost:5173');console.log('Processes remain running; logs are in .local/');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
