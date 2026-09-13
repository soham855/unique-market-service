import express from 'express'
import cors from 'cors'
import os from 'node:os'
import dgram from 'node:dgram'
import crypto from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'

const exec=promisify(execFile),app=express(),PORT=17855
app.use(cors({origin:true}));app.use(express.json())

function localNetwork(){const list=[];for(const [name,items] of Object.entries(os.networkInterfaces()))for(const x of items||[])if(x.family==='IPv4'&&!x.internal)list.push({interface:name,address:x.address,netmask:x.netmask,mac:x.mac});return list}
function prefix(mask){return mask.split('.').reduce((n,o)=>n+(Number(o).toString(2).match(/1/g)||[]).length,0)}
function ipNum(ip){return ip.split('.').reduce((n,o)=>(n<<8)+Number(o),0)>>>0}
function numIp(n){return [24,16,8,0].map(s=>(n>>>s)&255).join('.')}
async function ping(ip){try{await exec(process.platform==='win32'?'ping':'ping',process.platform==='win32'?['-n','1','-w','180',ip]:['-c','1','-W','1',ip],{windowsHide:true});return true}catch{return false}}
async function arp(){try{const{stdout}=await exec(process.platform==='win32'?'arp':'arp',process.platform==='win32'?['-a']:['-an']);return stdout}catch{return ''}}

function parseArp(text){const out=[];for(const line of text.split(/\r?\n/)){const m=line.match(/(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-f]{2}(?:[-:][0-9a-f]{2}){5})/i);if(m)out.push({ip:m[1],mac:m[2].replace(/-/g,':').toUpperCase()})}return out}

function wsDiscovery(){return new Promise(resolve=>{
 const socket=dgram.createSocket('udp4'),found=new Map(),action=`urn:uuid:${crypto.randomUUID()}`
 const body=`<?xml version="1.0" encoding="UTF-8"?><e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope" xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:dn="http://www.onvif.org/ver10/network/wsdl"><e:Header><w:MessageID>${action}</w:MessageID><w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To><w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action></e:Header><e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body></e:Envelope>`
 const timer=setTimeout(()=>{socket.close();resolve([...found.values()])},3500)
 socket.on('message',(msg,rinfo)=>{const xml=msg.toString();const xaddrs=[...xml.matchAll(/<[^>]*XAddrs[^>]*>([^<]+)</gi)].map(m=>m[1].trim()).flatMap(v=>v.split(/\s+/));const types=[...xml.matchAll(/<[^>]*Types[^>]*>([^<]+)</gi)].map(m=>m[1].trim()).join(' ');const scopes=[...xml.matchAll(/<[^>]*Scopes[^>]*>([^<]+)</gi)].map(m=>m[1].trim()).join(' ');const ip=rinfo.address;if(ip&&!found.has(ip))found.set(ip,{ip,type:'IP Camera',protocol:'ONVIF',xaddrs,types,scopes})})
 socket.on('error',()=>{clearTimeout(timer);try{socket.close()}catch{};resolve([...found.values()])})
 socket.bind(()=>{socket.setBroadcast(true);socket.addMembership('239.255.255.250');const packet=Buffer.from(body);socket.send(packet,3702,'239.255.255.250')})
})}

async function portOpen(ip,port){try{await exec(process.platform==='win32'?'powershell':'sh',process.platform==='win32'?['-NoProfile','-Command',`$c=New-Object Net.Sockets.TcpClient;try{$c.Connect('${ip}',${port});'open'}catch{'closed'}finally{$c.Close()}`]:['-c',`(echo >/dev/tcp/${ip}/${port}) 2>/dev/null && echo open || echo closed`],{windowsHide:true,timeout:900});return true}catch{return false}}

app.get('/api/status',(req,res)=>res.json({ok:true,agent:'Unique Market Network Agent',version:'0.2.0',interfaces:localNetwork()}))

app.get('/api/scan',async(req,res)=>{try{
 const nic=localNetwork().find(x=>x.address&&x.netmask);if(!nic)return res.status(400).json({ok:false,error:'No active IPv4 LAN interface found'})
 const p=prefix(nic.netmask),mask=p===32?0xffffffff:(0xffffffff<<(32-p))>>>0,base=ipNum(nic.address)&mask,broadcast=(base|(~mask>>>0))>>>0,hostCount=Math.min(254,Math.max(0,broadcast-base-1)),start=base+1
 const devices=[]
 for(let i=0;i<hostCount;i+=32){const batch=[];for(let j=i;j<Math.min(i+32,hostCount);j++)batch.push(start+j);const results=await Promise.all(batch.map(n=>{const ip=numIp(n);return ping(ip).then(ok=>ok?{ip,status:'online',source:'icmp'}:null)}));devices.push(...results.filter(Boolean))}
 const table=await arp(),arpRows=parseArp(table),onvif=await wsDiscovery(),onvifByIp=new Map(onvif.map(x=>[x.ip,x]))
 const merged=devices.map(d=>{const a=arpRows.find(x=>x.ip===d.ip),c=onvifByIp.get(d.ip);return {...d,...(a?{mac:a.mac}:{}),...(c?{type:'IP Camera',protocol:'ONVIF',xaddrs:c.xaddrs,scopes:c.scopes}:{}),ports:{}}})
 for(const d of merged){for(const port of [80,443,554,8000,8080,37777]){if(await portOpen(d.ip,port))d.ports[port]=true}}
 res.json({ok:true,interface:nic,subnet:`${numIp(base)}/${p}`,devices:merged,onvif,onvifCount:onvif.length,arp:table,scannedAt:new Date().toISOString()})
}catch(e){res.status(500).json({ok:false,error:e.message||'Network scan failed'})}})

app.get('/api/onvif-discovery',async(req,res)=>res.json({ok:true,devices:await wsDiscovery()}))

app.listen(PORT,'127.0.0.1',()=>console.log(`Unique Market Network Agent listening on http://127.0.0.1:${PORT}`))
