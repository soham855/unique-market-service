const uuid=()=>crypto.randomUUID();
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
export class CashPaymentOtpError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
const validKey=k=>typeof k==="string"&&k.length>=8&&k.length<=128&&/^[A-Za-z0-9._:-]+$/.test(k);
function secret(v,n){if(typeof v!=="string"||v.length<32)throw new CashPaymentOtpError(503,n+"_not_configured");return v;}
async function hashOtp(otp,salt,secretValue){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secretValue),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:150000,hash:"SHA-256"},key,256);return hex(bits);}
async function makeHash(otp,s){const salt=crypto.getRandomValues(new Uint8Array(16));return "pbkdf2-sha256$150000$"+b64(salt)+"$"+await hashOtp(otp,salt,s);}
async function checkHash(otp,encoded,s){const p=String(encoded||"").split("$");if(p.length!==4||p[0]!=="pbkdf2-sha256"||p[1]!=="150000")return false;const salt=Uint8Array.from(atob(p[2]),c=>c.charCodeAt(0));return hashOtp(otp,salt,s)===p[3];}
async function encrypt(value,encoded){let raw;try{raw=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));}catch{throw new CashPaymentOtpError(503,"otp_encryption_key_invalid");}if(![16,24,32].includes(raw.length))throw new CashPaymentOtpError(503,"otp_encryption_key_invalid");const key=await crypto.subtle.importKey("raw",raw,"AES-GCM",false,["encrypt"]);const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(JSON.stringify(value)));return "v1."+b64(iv)+"."+b64(data);}
const phoneDigits=v=>String(v||"").replace(/[^0-9]/g,"");
async function getPayment(db,id){return db.prepare(`SELECT p.id,p.status,p.mode,p.payment_status,p.challan_id,p.recorded_by,p.customer_id,p.complaint_id,p.amount,c.technician_id,c.customer_id AS complaint_customer_id,cu.mobile AS customer_phone FROM payments p LEFT JOIN complaints c ON c.id=p.complaint_id LEFT JOIN customers cu ON cu.id=COALESCE(p.customer_id,c.customer_id) WHERE p.id=? LIMIT 1`).bind(id).first();}
export async function requestCashPaymentOtp(db,profile,actorId,paymentId,idempotencyKey,env){
 if(!profile?.id||!["admin","technician"].includes(profile.role))throw new CashPaymentOtpError(403,"role_not_allowed");
 if(!/^[0-9a-f-]{36}$/i.test(paymentId||""))throw new CashPaymentOtpError(400,"invalid_payment_id");
 if(!validKey(idempotencyKey))throw new CashPaymentOtpError(400,"valid_idempotency_key_required");
 const hsecret=secret(env.OTP_HASH_SECRET,"otp_hash_secret"),ekey=secret(env.OTP_ENCRYPTION_KEY,"otp_encryption_key");
 const prior=await db.prepare("SELECT payment_id FROM cash_payment_otp_request_ledger WHERE actor_id=? AND idempotency_key=? LIMIT 1").bind(actorId,idempotencyKey).first();
 if(prior)return{payment_id:prior.payment_id,queued:true,replayed:true};
 const rate=await db.prepare("SELECT COUNT(*) AS request_count FROM cash_payment_otp_request_ledger WHERE payment_id=? AND actor_id=? AND created_at >= datetime('now','-1 hour')").bind(paymentId,actorId).first();
 if(Number(rate?.request_count||0)>=3)throw new CashPaymentOtpError(429,"otp_request_rate_limit_reached");
 const p=await getPayment(db,paymentId);if(!p)throw new CashPaymentOtpError(404,"payment_not_found");
 if(p.status!=="pending"||p.mode!=="Cash")throw new CashPaymentOtpError(409,"pending_cash_payment_required");
 if(!(Number(p.amount)>0))throw new CashPaymentOtpError(409,"positive_payment_amount_required");
 if(profile.role==="technician"&&(p.recorded_by!==actorId||p.technician_id!==actorId))throw new CashPaymentOtpError(403,"payment_not_owned_by_technician");
 if(!p.complaint_id||!p.customer_id||p.customer_id!==p.complaint_customer_id)throw new CashPaymentOtpError(409,"payment_customer_mapping_invalid");
 const phone=phoneDigits(p.customer_phone);if(phone.length<10||phone.length>15)throw new CashPaymentOtpError(409,"customer_whatsapp_phone_unavailable");
 const otp=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,"0");
 const otpHash=await makeHash(otp,hsecret);
 const encrypted=await encrypt({to:phone,message:"Unique Market: Your cash payment verification OTP is "+otp+". It expires in 5 minutes. Do not share this OTP."},ekey);
 const now=new Date(),created=now.toISOString(),expires=new Date(now.getTime()+300000).toISOString(),requestId=uuid();
 const result=await db.batch([
  db.prepare("UPDATE cash_payment_otp_outbox SET status='failed',last_error='superseded_by_new_otp' WHERE payment_id=? AND status='pending'").bind(paymentId),
  db.prepare("INSERT INTO cash_payment_otp_request_ledger(id,payment_id,actor_id,idempotency_key,created_at) VALUES(?,?,?,?,?)").bind(requestId,paymentId,actorId,idempotencyKey,created),
  db.prepare("INSERT INTO cash_payment_otp_challenges(payment_id,otp_hash,expires_at,attempts,used_at,requested_by,created_at) VALUES(?,?,?,0,NULL,?,?) ON CONFLICT(payment_id) DO UPDATE SET otp_hash=excluded.otp_hash,expires_at=excluded.expires_at,attempts=0,used_at=NULL,requested_by=excluded.requested_by,created_at=excluded.created_at").bind(paymentId,otpHash,expires,actorId,created),
  db.prepare("INSERT INTO cash_payment_otp_outbox(id,payment_id,event_key,recipient_phone,encrypted_payload,status,attempts,created_at) VALUES(?,?,?,?,?,'pending',0,?)").bind(uuid(),paymentId,"cash-payment-otp:"+paymentId+":"+requestId,phone,encrypted,created)
 ]);
 if(!result||result.length!==4||result.some(x=>x?.success===false))throw new CashPaymentOtpError(503,"otp_request_not_saved");
 return{payment_id:paymentId,queued:true,expires_at:expires,replayed:false};
}
export async function verifyCashPaymentOtp(db,profile,actorId,paymentId,input,env){
 if(!profile?.id||profile.role!=="customer"||actorId!==profile.id)throw new CashPaymentOtpError(403,"customer_verification_only");
 if(!/^[0-9a-f-]{36}$/i.test(paymentId||""))throw new CashPaymentOtpError(400,"invalid_payment_id");
 if(!input||typeof input.otp!=="string"||!/^\d{6}$/.test(input.otp))throw new CashPaymentOtpError(400,"invalid_otp");
 const hsecret=secret(env.OTP_HASH_SECRET,"otp_hash_secret");
 const p=await getPayment(db,paymentId);if(!p)throw new CashPaymentOtpError(404,"payment_not_found");
 const linked=await db.prepare("SELECT 1 AS ok FROM customers WHERE id=? AND (user_id=? OR profile_id=?) LIMIT 1").bind(p.customer_id,actorId,actorId).first();
 if(!linked)throw new CashPaymentOtpError(403,"payment_not_linked_to_customer");
 const c=await db.prepare("SELECT otp_hash,expires_at,attempts,used_at FROM cash_payment_otp_challenges WHERE payment_id=? LIMIT 1").bind(paymentId).first();
 if(p.status==="confirmed"&&p.payment_status==="Confirmed"&&c?.used_at)return{payment_id:paymentId,status:"confirmed",verified_at:c.used_at,replayed:true};
 if(p.status!=="pending"||p.mode!=="Cash")throw new CashPaymentOtpError(409,"pending_cash_payment_required");
 if(p.challan_id)throw new CashPaymentOtpError(409,"challan_payment_flow_not_ported_yet");
 if(!c||c.used_at)throw new CashPaymentOtpError(409,"otp_not_active");
 const now=new Date().toISOString();if(new Date(c.expires_at).getTime()<=Date.now())throw new CashPaymentOtpError(410,"otp_expired");
 if(c.attempts>=5)throw new CashPaymentOtpError(429,"otp_attempt_limit_reached");
 if(!(await checkHash(input.otp,c.otp_hash,hsecret))){await db.prepare("UPDATE cash_payment_otp_challenges SET attempts=attempts+1 WHERE payment_id=? AND used_at IS NULL AND expires_at>? AND attempts<5").bind(paymentId,now).run();throw new CashPaymentOtpError(400,"invalid_otp");}
 const verifiedAt=new Date().toISOString();
 const result=await db.batch([
  db.prepare("UPDATE cash_payment_otp_challenges SET attempts=attempts+1,used_at=? WHERE payment_id=? AND otp_hash=? AND used_at IS NULL AND expires_at>? AND attempts<5").bind(verifiedAt,paymentId,c.otp_hash,verifiedAt),
  db.prepare("UPDATE payments SET status='confirmed',payment_status='Confirmed',ledger_applied_at=? WHERE id=? AND status='pending' AND mode='Cash' AND EXISTS(SELECT 1 FROM cash_payment_otp_challenges WHERE payment_id=? AND used_at=?)").bind(verifiedAt,paymentId,paymentId,verifiedAt)
 ]);
 if(result?.[0]?.meta?.changes!==1||result?.[1]?.meta?.changes!==1)throw new CashPaymentOtpError(409,"otp_verification_race_or_payment_conflict");
 return{payment_id:paymentId,status:"confirmed",verified_at:verifiedAt};
}
