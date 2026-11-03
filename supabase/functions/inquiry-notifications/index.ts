// Staged only. Requires private DB access and an authenticated scheduler.
// Call with Authorization: Bearer <NOTIFICATION_WORKER_TOKEN> from a trusted job.
// Do not expose this function publicly without the token guard.
const env=(name:string)=>Deno.env.get(name)||"";
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
const api=(path:string,init:RequestInit={})=>fetch(env("SUPABASE_URL")+"/rest/v1/"+path,{...init,headers:{"apikey":env("SUPABASE_SERVICE_ROLE_KEY"),"authorization":"Bearer "+env("SUPABASE_SERVICE_ROLE_KEY"),"accept-profile":"bohun_private","content-profile":"bohun_private","content-type":"application/json",...(init.headers||{})}});
type Inquiry={id:string;type:string;name:string;organization:string;email:string;context_url:string|null;notification_attempts:number};
Deno.serve(async(req)=>{
  if(req.method!=="POST")return json(405,{error:"Method not allowed"});
  const token=env("NOTIFICATION_WORKER_TOKEN");
  if(!token||req.headers.get("authorization")!=="Bearer "+token)return json(401,{error:"Unauthorized"});
  if(!env("RESEND_API_KEY")||!env("RESEND_FROM_EMAIL")||!env("SUPABASE_SERVICE_ROLE_KEY")||!env("SUPABASE_URL"))return json(503,{error:"Not configured"});
  if(env("INQUIRY_NOTIFICATION_WORKER_ENABLED")!=="true") return json(503,{error:"Worker disabled until atomic queue is integrated"});
  // NOTE: This simple prototype is not concurrency-safe. Use atomic DB claiming
  // and a lease before enabling scheduled/repeated production runs.
  const r=await api("business_inquiries?select=id,type,name,organization,email,context_url,notification_attempts&notification_status=eq.pending&order=created_at.asc&limit=10");
  if(!r.ok)return json(503,{error:"Could not read queue"});
  const rows=await r.json() as Inquiry[];
  let sent=0,failed=0;
  for(const row of rows){
    const subject="BOHUN enquiry: "+row.type+" / "+row.id;
    const body=["New BOHUN business enquiry","Reference: "+row.id,"Type: "+row.type,"Name: "+row.name,"Organisation: "+row.organization,"Email: "+row.email,"Context: "+(row.context_url||"None"),"","Open private database to review the full message. Do not reply to this notification."].join("\n");
    let ok=false;
    try{
      const result=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"authorization":"Bearer "+env("RESEND_API_KEY"),"content-type":"application/json","Idempotency-Key":"bohun-enquiry/"+row.id},body:JSON.stringify({from:env("RESEND_FROM_EMAIL"),to:["nabok@bohundefence.com"],subject,text:body}),signal:AbortSignal.timeout(10000)});
      ok=result.ok;
      if(!ok)console.error("Resend error status",result.status);
    }catch{console.error("Resend request failed")}
    const status=ok?"sent":(row.notification_attempts+1>=5?"failed":"pending");
    const patch=await api("business_inquiries?id=eq."+encodeURIComponent(row.id),{method:"PATCH",headers:{"prefer":"return=minimal"},body:JSON.stringify({notification_status:status,notification_attempts:row.notification_attempts+1,...(ok?{notified_at:new Date().toISOString()}:{})})});
    if(!patch.ok){console.error("Queue status update failed",patch.status);failed++;continue}
    if(ok)sent++;else failed++;
  }
  return json(200,{processed:rows.length,sent,failed});
});
