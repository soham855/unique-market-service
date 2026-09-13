import net from 'node:net'

function ipNum(ip){return ip.split('.').reduce((n,o)=>(n*256)+Number(o),0)}
function numIp(n){return [24,16,8,0].map(s=>(n>>>s)&255).join('.')}
function validIPv4(ip){return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)&&ip.split('.').every(x=>Number(x)>=0&&Number(x)<=255)}

export function planFreeIps({start,end,count,used=[]}){
 if(!validIPv4(start)||!validIPv4(end)||!Number.isInteger(count)||count<1) throw new Error('Invalid IP planner input')
 const a=ipNum(start),b=ipNum(end); if(a>b) throw new Error('IP range is invalid')
 const blocked=new Set(used.filter(validIPv4))
 const result=[]
 for(let n=a;n<=b&&result.length<count;n++){const ip=numIp(n);if(!blocked.has(ip))result.push(ip)}
 return {requested:count,found:result.length,ips:result,shortage:Math.max(0,count-result.length)}
}

export function conflictEvidence(arp=[]){
 const byIp=new Map(),conflicts=[]
 for(const row of arp){if(!row?.ip||!row?.mac)continue;const mac=String(row.mac).toUpperCase();if(!byIp.has(row.ip))byIp.set(row.ip,new Set());byIp.get(row.ip).add(mac)}
 for(const [ip,macs] of byIp)if(macs.size>1)conflicts.push({ip,macs:[...macs],confidence:'high',reason:'Same IP observed with multiple MAC addresses in ARP data'})
 return conflicts
}

export async function tcpCheck(ip,port,timeout=500){return new Promise(resolve=>{const s=new net.Socket();let done=false;const finish=v=>{if(done)return;done=true;s.destroy();resolve(v)};s.setTimeout(timeout);s.once('connect',()=>finish(true));s.once('timeout',()=>finish(false));s.once('error',()=>finish(false));s.connect(port,ip)})}
