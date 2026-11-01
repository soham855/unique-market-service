import test from "node:test";
import assert from "node:assert/strict";
import { requestCashPaymentOtp, verifyCashPaymentOtp, CashPaymentOtpError } from "../src/cash-payment-otp.js";

const paymentId="11111111-1111-4111-8111-111111111111";
const actorId="tech-1";
const secrets={OTP_HASH_SECRET:"h".repeat(40),OTP_ENCRYPTION_KEY:btoa("e".repeat(32))};
const payment={id:paymentId,status:"pending",mode:"Cash",recorded_by:actorId,customer_id:"cust-1",complaint_id:"complaint-1",amount:500,technician_id:actorId,complaint_customer_id:"cust-1",customer_phone:"+91 9000000000"};
function dbMock({paymentRow=payment,linked={ok:1},challenge=null,changes=[1,1]}={}) {
 const calls=[];
 return {calls,prepare(sql){return{sql,bind(...values){return{sql,values,first:async()=>{calls.push({kind:"first",sql,values});if(sql.includes("cash_payment_otp_request_ledger"))return null;if(sql.includes("FROM payments p"))return paymentRow;if(sql.includes("FROM customers WHERE"))return linked;if(sql.includes("cash_payment_otp_challenges"))return challenge;return null;},run:async()=>{calls.push({kind:"run",sql,values});return{meta:{changes:1}};}};}};},async batch(stmts){calls.push({kind:"batch",statements:stmts});return stmts.map((s,i)=>({success:true,meta:{changes:changes[i]??1}}));}};
}
test("technician can queue OTP only for their own pending cash payment; OTP is encrypted and not exposed",async()=>{
 const db=dbMock();
 const result=await requestCashPaymentOtp(db,{id:actorId,role:"technician"},actorId,paymentId,"cash-otp-req-0001",secrets);
 assert.equal(result.queued,true);assert.equal(result.replayed,false);
 const batch=db.calls.find(x=>x.kind==="batch");
 assert.equal(batch.statements.length,4);
 const outbox=batch.statements[3];
 assert.match(outbox.sql,/encrypted_payload/);
 assert.equal(outbox.values[3],"919000000000");
 assert.match(outbox.values[4],/^v1\./);
 assert.equal(JSON.stringify(result).includes("otp"),false);
});
test("technician cannot request OTP for another technician's payment",async()=>{
 const db=dbMock({paymentRow:{...payment,recorded_by:"tech-2",technician_id:"tech-2"}});
 await assert.rejects(()=>requestCashPaymentOtp(db,{id:actorId,role:"technician"},actorId,paymentId,"cash-otp-req-0002",secrets),e=>e instanceof CashPaymentOtpError&&e.status===403);
 assert.equal(db.calls.some(x=>x.kind==="batch"),false);
});
test("OTP request refuses non-pending or non-cash payments",async()=>{
 const db=dbMock({paymentRow:{...payment,status:"confirmed"}});
 await assert.rejects(()=>requestCashPaymentOtp(db,{id:actorId,role:"technician"},actorId,paymentId,"cash-otp-req-0003",secrets),e=>e.code==="pending_cash_payment_required");
});
test("OTP request refuses missing encryption secret before writes",async()=>{
 const db=dbMock();
 await assert.rejects(()=>requestCashPaymentOtp(db,{id:actorId,role:"technician"},actorId,paymentId,"cash-otp-req-0004",{OTP_HASH_SECRET:"h".repeat(40)}),e=>e.status===503);
 assert.equal(db.calls.some(x=>x.kind==="batch"),false);
});
test("OTP verification cannot be initiated by technician/admin",async()=>{
 const db=dbMock();
 await assert.rejects(()=>verifyCashPaymentOtp(db,{id:actorId,role:"technician"},actorId,paymentId,{otp:"123456"},secrets),e=>e.code==="customer_verification_only");
});
test("customer can only verify a payment linked to their own profile",async()=>{
 const db=dbMock({paymentRow:{...payment,recorded_by:actorId},linked:null});
 await assert.rejects(()=>verifyCashPaymentOtp(db,{id:"customer-1",role:"customer"},"customer-1",paymentId,{otp:"123456"},secrets),e=>e.code==="payment_not_linked_to_customer");
});
test("invalid OTP format rejected before database writes",async()=>{
 const db=dbMock();
 await assert.rejects(()=>verifyCashPaymentOtp(db,{id:"customer-1",role:"customer"},"customer-1",paymentId,{otp:"123"},secrets),e=>e.code==="invalid_otp");
 assert.equal(db.calls.length,0);
});
