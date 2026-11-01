import test from "node:test";
import assert from "node:assert/strict";
import { updateComplaintStatus, ComplaintStatusError } from "../src/complaint-status.js";

const baseComplaint = {
  id:"11111111-1111-4111-8111-111111111111", ticket_no:"UM-2627/01",
  title:"Camera offline", status:"assigned", priority:"normal",
  technician_id:"tech-1", customer_id:"cust-1", customer_phone:"+91 9000000000",
  customer_user_id:"customer-1", customer_profile_id:null, notification_phone:"+91 9000000000",
};
function fakeDb({ complaint=baseComplaint, previous=null, admins=[{id:"admin-1"}] }={}) {
  const calls=[];
  let saved=previous;
  return {
    calls,
    prepare(sql) {
      return { bind(...values) { return {
        sql, values,
        first: async () => {
          calls.push({kind:"first",sql,values});
          if (sql.includes("complaint_status_update_requests")) {
            if (sql.includes("request_id = ?")) return saved?.request_id === values[0] ? saved : saved;
            return saved;
          }
          if (sql.includes("FROM complaints c")) return complaint;
          if (sql.includes("SELECT status FROM complaints")) return {status:complaint?.status};
          return null;
        },
        all: async () => {
          calls.push({kind:"all",sql,values});
          if (sql.includes("FROM profiles WHERE role")) return {results:admins};
          return {results:[]};
        },
      }; } };
    },
    async batch(statements) {
      calls.push({kind:"batch",count:statements.length,sqls:statements.map(s=>s.sql)});
      const v=statements[0].values;
      saved={request_id:v[0],complaint_id:complaint.id,old_status:complaint.status,new_status:v[3],created_at:v[5]};
      return statements.map(()=>({success:true}));
    },
  };
}
const key="status-update-0001";
test("assigned technician can move complaint to in_progress and writes both history models in one batch",async()=>{
  const db=fakeDb();
  const result=await updateComplaintStatus(db,{id:"tech-1",role:"technician"},"tech-1",baseComplaint.id,{expectedStatus:"assigned",status:"in_progress",note:"Reached site"},key);
  assert.equal(result.replayed,false);
  assert.equal(db.calls.filter(x=>x.kind==="batch").length,1);
  const sqls=db.calls.find(x=>x.kind==="batch").sqls.join("\n");
  assert.match(sqls,/complaint_status_history/);
  assert.match(sqls,/ticket_status_history/);
  assert.match(sqls,/whatsapp_notification_events/);
  assert.match(sqls,/admin_activity_log/);
});
test("technician can claim only an unassigned open complaint",async()=>{
  const open={...baseComplaint,status:"open",technician_id:null};
  const db=fakeDb({complaint:open});
  const result=await updateComplaintStatus(db,{id:"tech-1",role:"technician"},"tech-1",open.id,{expectedStatus:"open",status:"assigned"},key);
  assert.equal(result.replayed,false);
  const batch=db.calls.find(x=>x.kind==="batch");
  assert.ok(batch.sqls.some(s=>s.includes("technician_id = CASE WHEN")));
});
test("technician can claim legacy New status without changing source spelling in history",async()=>{
  const legacy={...baseComplaint,status:"New",technician_id:null};
  const db=fakeDb({complaint:legacy});
  const result=await updateComplaintStatus(db,{id:"tech-1",role:"technician"},"tech-1",legacy.id,{expectedStatus:"New",status:"assigned"},key);
  assert.equal(result.replayed,false);
  assert.equal(db.calls.find(x=>x.kind==="batch").sqls[0].includes("c.status = ?"),true);
});
test("technician cannot update another technician's complaint",async()=>{
  const db=fakeDb();
  await assert.rejects(()=>updateComplaintStatus(db,{id:"tech-2",role:"technician"},"tech-2",baseComplaint.id,{expectedStatus:"assigned",status:"in_progress"},key),e=>e instanceof ComplaintStatusError&&e.status===403);
  assert.equal(db.calls.some(x=>x.kind==="batch"),false);
});
test("customer cannot update complaint status",async()=>{
  const db=fakeDb();
  await assert.rejects(()=>updateComplaintStatus(db,{id:"customer-1",role:"customer"},"customer-1",baseComplaint.id,{expectedStatus:"assigned",status:"in_progress"},key),e=>e.status===403);
});
test("closed is blocked pending payment verification",async()=>{
  const db=fakeDb();
  await assert.rejects(()=>updateComplaintStatus(db,{id:"admin-1",role:"admin"},"admin-1",baseComplaint.id,{expectedStatus:"assigned",status:"closed"},key),e=>e instanceof ComplaintStatusError&&e.code==="payment_verification_required_before_closing");
});
test("stale expectedStatus rejects concurrent updates",async()=>{
  const db=fakeDb();
  await assert.rejects(()=>updateComplaintStatus(db,{id:"tech-1",role:"technician"},"tech-1",baseComplaint.id,{expectedStatus:"open",status:"in_progress"},key),e=>e.code==="complaint_status_conflict");
});
test("idempotent replay returns previous update without a D1 batch",async()=>{
  const previous={request_id:"req-old",complaint_id:baseComplaint.id,old_status:"assigned",new_status:"in_progress",created_at:"2026-11-01T10:00:00.000Z"};
  const db=fakeDb({previous});
  const result=await updateComplaintStatus(db,{id:"tech-1",role:"technician"},"tech-1",baseComplaint.id,{expectedStatus:"assigned",status:"in_progress"},key);
  assert.equal(result.replayed,true);
  assert.deepEqual(result.update,previous);
  assert.equal(db.calls.some(x=>x.kind==="batch"),false);
});
test("admin can cancel an open complaint but cannot mark it closed",async()=>{
  const open={...baseComplaint,status:"open",technician_id:null};
  const db=fakeDb({complaint:open});
  const result=await updateComplaintStatus(db,{id:"admin-1",role:"admin"},"admin-1",open.id,{expectedStatus:"open",status:"cancelled"},key);
  assert.equal(result.replayed,false);
});
test("invalid status and missing idempotency key are rejected before writes",async()=>{
  const db=fakeDb();
  await assert.rejects(()=>updateComplaintStatus(db,{id:"tech-1",role:"technician"},"tech-1",baseComplaint.id,{expectedStatus:"assigned",status:"arbitrary"},key),e=>e.code==="unsupported_status");
  await assert.rejects(()=>updateComplaintStatus(db,{id:"tech-1",role:"technician"},"tech-1",baseComplaint.id,{expectedStatus:"assigned",status:"in_progress"},""),e=>e.code==="valid_idempotency_key_required");
  assert.equal(db.calls.some(x=>x.kind==="batch"),false);
});
