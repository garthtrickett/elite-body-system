import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createAuthenticatedHttp, json } from "../features/auth/index.ts";
import type { Auth } from "../features/auth/index.ts";
import type { PublicSales, SalesManagement } from "../features/sales/index.ts";
import type { ClientResult } from "../shared/client-result.ts";
import { isRecord } from "../shared/validation.ts";

function readCookie(request:IncomingMessage, name:string): string | undefined {
  const parts=(request.headers.cookie ?? "").split(";").map(s=>s.trim()).filter(s=>s.startsWith(`${name}=`));
  return parts.length===1 ? parts[0]?.slice(name.length+1) : undefined;
}
const token = (v:unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{43}$/.test(v);
const send = (response:ServerResponse, result:ClientResult<unknown>) => json(response,result.ok ? 200 : result.error.code === "forbidden" ? 403 : result.error.code === "not_found" ? 404 : result.error.code === "conflict" ? 409 : result.error.code === "rate_limited" ? 429 : result.error.code === "unavailable" ? 503 : 400,result);

export function createSalesHttp(config:Readonly<{ auth:Auth; publicOrigin:string; publicSales:PublicSales; management:SalesManagement }>) {
  const secure=config.publicOrigin.startsWith("https:"), prefix=secure ? "__Host-ebs-sales-" : "ebs-sales-";
  const publicPaths=["/free-value","/apply","/book-call","/client-stories"];
  const counts=new Map<string,{ count:number; expires:number }>();
  let inFlight=0;
  const permit=(key:string,max:number) => {
    const now=Date.now();
    if (counts.size>=10000) for (const [k,v] of counts) if(v.expires<=now) counts.delete(k);
    const entry=counts.get(key);
    if (!entry || entry.expires<=now) { if(counts.size>=10000) return false; counts.set(key,{count:1,expires:now+900000}); return true; }
    entry.count+=1; return entry.count<=max;
  };
  const management=createAuthenticatedHttp({ auth:config.auth, publicOrigin:config.publicOrigin, handle:async ({account,request,response,body})=>{
    const url=new URL(request.url ?? "/",config.publicOrigin), actorId=account.id;
    if(request.method==="GET" && url.pathname==="/api/management/snapshot") { send(response,await config.management.snapshot({actorId,before:url.searchParams.get("before"),search:url.searchParams.get("search")})); return; }
    if(request.method==="GET" && url.pathname==="/api/management/journey") { send(response,await config.management.journey({actorId,leadId:url.searchParams.get("leadId")})); return; }
    if(request.method==="POST" && url.pathname==="/api/management/settings") { send(response,await config.management.settings({actorId,revision:body.revision,settings:body.settings})); return; }
    if(request.method==="POST" && url.pathname==="/api/management/booking/cancel") { send(response,await config.management.cancelBooking({actorId,leadId:body.leadId,revision:body.revision})); return; }
    if(request.method==="POST" && url.pathname==="/api/management/lead") { send(response,await config.management.lead({actorId,leadId:body.leadId,stage:body.stage,notes:body.notes,revision:body.revision})); return; }
    if(request.method==="POST" && url.pathname==="/api/management/slots") { send(response,await config.management.slot({actorId,startsAt:body.startsAt,endsAt:body.endsAt,meetingUrl:body.meetingUrl})); return; }
    if(request.method==="POST" && url.pathname==="/api/management/slots/remove") { send(response,await config.management.removeSlot({actorId,slotId:body.slotId})); return; }
    json(response,404,{ok:false,error:{code:"not_found",message:"Unknown management action."}});
  } });
  return async (request:IncomingMessage,response:ServerResponse):Promise<void>=>{
    const url=new URL(request.url ?? "/",config.publicOrigin), path=url.pathname;
    if(path.startsWith("/api/management/")) { await management(request,response); return; }
    const visitorName=`${prefix}visitor`, csrfName=`${prefix}csrf`;
    if(request.method==="GET" && publicPaths.includes(path)) {
      if(!permit(`page:${request.socket.remoteAddress ?? "unknown"}`,1200)) { json(response,429,{ok:false,error:{code:"rate_limited",message:"Please wait a moment before trying again."}}); return; }
      const existing=readCookie(request,visitorName), visitor=token(existing) ? existing : randomBytes(32).toString("base64url");
      const oldCsrf=readCookie(request,csrfName), csrf=token(oldCsrf) ? oldCsrf : randomBytes(32).toString("base64url");
      const identity=await config.publicSales.visitor({token:visitor,source:url.searchParams.get("utm_source")?.slice(0,300) ?? "Direct"});
      if(!identity.ok) { send(response,identity); return; }
      response.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff",
        "Set-Cookie":[`${visitorName}=${visitor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure ? "; Secure" : ""}`,`${csrfName}=${csrf}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${secure ? "; Secure" : ""}`],
        "Content-Security-Policy":"default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' https: data:; media-src https:; frame-src https://www.youtube-nocookie.com https://player.vimeo.com; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"});
      response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><title>Elite Body System</title><link rel="stylesheet" href="/assets/app.css"></head><body><main id="app" data-mode="sales" data-page="${path.slice(1)}" data-csrf="${csrf}"></main><noscript>Enable JavaScript to apply or book a call.</noscript><script type="module" src="/assets/app.js"></script></body></html>`); return;
    }
    if(!path.startsWith("/api/sales/")) { json(response,404,{ok:false,error:{code:"not_found",message:"Unknown sales page."}}); return; }
    const visitor=readCookie(request,visitorName);
    if(!token(visitor)) { json(response,403,{ok:false,error:{code:"forbidden",message:"Open the sales page again to continue."}}); return; }
    if(inFlight>=8) { json(response,503,{ok:false,error:{code:"unavailable",message:"Please try again in a moment."}}); return; }
    inFlight+=1;
    try {
      if(request.method==="GET" && path==="/api/sales/calendar") {
        const current=await config.publicSales.get({token:visitor,page:"book-call"});
        if(!current.ok) {send(response,current);return;}
        const booking=current.value.booking;
        if(!booking) {json(response,404,{ok:false,error:{code:"not_found",message:"Book your call before adding it to your calendar."}});return;}
        const stamp=(v:string)=>new Date(v).toISOString().replaceAll("-","").replaceAll(":","").replace(/\.\d{3}Z$/,"Z");
        const escape=(v:string)=>v.replaceAll("\\","\\\\").replaceAll("\r","").replaceAll("\n","\\n").replaceAll(",","\\,").replaceAll(";","\\;");
        response.writeHead(200,{"Content-Type":"text/calendar; charset=utf-8","Content-Disposition":"attachment; filename=ebs-call.ics","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
        response.end(["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Elite Body System//Call Booking//EN","CALSCALE:GREGORIAN","BEGIN:VEVENT",`UID:${booking.id}@elite-body-system`,`DTSTAMP:${stamp(new Date().toISOString())}`,`DTSTART:${stamp(booking.startsAt)}`,`DTEND:${stamp(booking.endsAt)}`,"SUMMARY:Elite Body System call",`DESCRIPTION:${escape("Bring your goals and questions. Booking details: "+config.publicOrigin+"/book-call")}`,`LOCATION:${escape(booking.meetingUrl || "Call details arranged by Elite Body System")}`,"END:VEVENT","END:VCALENDAR",""].join("\r\n"));return;
      }
      if(request.method==="GET" && path==="/api/sales/snapshot") { send(response,await config.publicSales.get({token:visitor,page:url.searchParams.get("page")})); return; }
      if(request.method!=="POST") { json(response,405,{ok:false,error:{code:"invalid_input",message:"Unsupported request."}}); return; }
      const csrf=readCookie(request,csrfName), supplied=request.headers["x-csrf-token"];
      if(request.headers.origin!==config.publicOrigin || request.headers["content-type"]?.split(";")[0]?.trim()!=="application/json" || !token(csrf) || !token(supplied) || !timingSafeEqual(Buffer.from(csrf),Buffer.from(supplied))) { json(response,403,{ok:false,error:{code:"forbidden",message:"Refresh this page before trying again."}}); return; }
      if(!permit(`write:${visitor}`,30)) { json(response,429,{ok:false,error:{code:"rate_limited",message:"Please wait before trying again."}}); return; }
      let body:Record<string,unknown>;
      try {
        body=await new Promise<Record<string,unknown>>((resolve,reject)=>{
          let data="",size=0; request.setEncoding("utf8");
          request.on("data",(chunk:string)=>{ size+=Buffer.byteLength(chunk); if(size>32768) { reject(new Error("Body too large")); return; } data+=chunk; });
          request.on("error",reject); request.on("end",()=>{ try { const parsed:unknown=JSON.parse(data); if(!isRecord(parsed)) throw new Error("Invalid body"); resolve(parsed); } catch { reject(new Error("Invalid JSON")); } });
        });
      } catch { json(response,400,{ok:false,error:{code:"invalid_input",message:"Check your answers and try again."}}); return; }
      if(path==="/api/sales/unsubscribe") { send(response,await config.publicSales.unsubscribe({token:visitor})); return; }
      if(path==="/api/sales/identify") { send(response,await config.publicSales.identify({token:visitor,name:body.name,email:body.email,subscribe:body.subscribe})); return; }
      if(path==="/api/sales/apply") { send(response,await config.publicSales.apply({token:visitor,application:body})); return; }
      if(path==="/api/sales/book") { send(response,await config.publicSales.book({token:visitor,slotId:body.slotId})); return; }
      json(response,404,{ok:false,error:{code:"not_found",message:"Unknown sales action."}});
    } finally { inFlight-=1; }
  };
}
