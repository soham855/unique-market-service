import express from 'express'
import cors from 'cors'
import os from 'node:os'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
const exec=promisify(execFile),app=express(),PORT=17855
app.use(cors({origin:true}));app.use(express.json())
function localNetwork(){const list=[];for(const [name,items] of Object.entries(os.networkInterfaces()))for(const x of items||[])if(x.family==='IPv4'&&!x.internal)list.push({interface:name,address:x.address,netmask:x.netmask,mac:x.mac})
return list}
function prefix(mask){return mask.split('.').reduce((n,o)=>n+(Number(o).toString(2).match(/1/g)||[]).length,0)}
function ipNum(ip){return ip.split('.').reduce((n,o)=>(n<<8)+Number(o),0)>>>0}
function numIp(n){return [24,16,8,0].map(s=>(n>>>s)&255).join('.')}
async function ping(ip){try{await exec(process.platform==='win32'?'ping':'ping',process.platform==='win32'?['-n','1','-w','250',ip]:['-c','1','-W','1',ip],{windowsHide:true});return true}catch{return false}}
async function arp(){try{const{stdout}=await exec(process.platform==='win32'?'arp':'arp',process.platform==='win32'?['-a']:['-an']);return stdout}catch{return ''}}
app.get('/api/status',(req,res)=>res.json({ok:true,agent:'Unique Market Network Agent',version:'0.1.0',interfaces:localNetwork()}))
app.get('/api/scan',async(req,res)=>{const nic=localNetwork().find(x=>x.address&&x.netmask);if(!nic)return res.status(400).json({ok:false,error:'No active IPv4 LAN interface found'})
const p=prefix(nic.netmask),mask=p===32?0xffffffff:(0xffffffff<<(32-p))>>>0,base=ipNum(nic.address)&mask,broadcast=(base|(~mask>>>0))>>>0,hostCount=Math.min(254,broadcast-base-1);const start=base+1;const devices=[]
for(let i=0;i<hostCount;i++){const ip=numIp(start+i);if(await ping(ip))devices.push({ip,status:'online',source:'icmp'})}
const table=await arp();res.json({ok:true,interface:nic,subnet:`${numIp(base)}/${p}`,devices,arp:table})})
app.listen(PORT,'127.0.0.1',()=>console.log(`Unique Market Network Agent listening on http://127.0.0.1:${PORT}`))
