import {createAuthenticatedHttp,json} from "../features/auth/index.ts";
import type {Auth} from "../features/auth/index.ts";
import type {Delivery} from "../features/delivery/index.ts";
import type {ClientResult} from "../shared/client-result.ts";
export function createDeliveryHttp(config:Readonly<{auth:Auth;publicOrigin:string;delivery:Delivery}>) {
 return createAuthenticatedHttp({auth:config.auth,publicOrigin:config.publicOrigin,handle:async({account,request,response,body})=>{
  const url=new URL(request.url??"/",config.publicOrigin),actorId=account.id,d=config.delivery;
  const send=(result:ClientResult<unknown>)=>json(response,result.ok?200:result.error.code==="forbidden"?403:result.error.code==="not_found"?404:result.error.code==="conflict"?409:result.error.code==="rate_limited"?429:result.error.code==="unavailable"?503:400,result);
  if(request.method==="GET"&&url.pathname==="/api/mentor/delivery/clients"){send(await d.clients({actorId,...(url.searchParams.has("search")?{search:url.searchParams.get("search")} :{}),...(url.searchParams.has("after")?{after:url.searchParams.get("after")} :{})}));return;}
  if(request.method==="GET"&&url.pathname==="/api/mentor/delivery/client"){send(await d.client({actorId,clientId:url.searchParams.get("clientId")}));return;}
  if(request.method==="GET"&&url.pathname==="/api/mentor/delivery/messages"){send(await d.thread({actorId,clientId:url.searchParams.get("clientId"),mentor:true,...(url.searchParams.has("before")?{before:url.searchParams.get("before")} :{})}));return;}
  if(request.method==="GET"&&url.pathname==="/api/mentor/delivery/community"){send(await d.community({actorId,mentor:true,...(url.searchParams.has("before")?{before:url.searchParams.get("before")} :{})}));return;}
  if(request.method==="POST"&&url.pathname==="/api/mentor/delivery/members"){send(await d.provisionMember({actorId,email:body.email,level:body.level}));return;}
  if(request.method==="POST"&&url.pathname==="/api/mentor/delivery/messages/send"){send(await d.sendMentor({actorId,clientId:body.clientId,requestId:body.requestId,body:body.body}));return;}
  if(request.method==="POST"&&url.pathname==="/api/mentor/delivery/messages/read"){send(await d.read({actorId,clientId:body.clientId,lastMessageId:body.lastMessageId,mentor:true}));return;}
  if(request.method==="POST"&&url.pathname==="/api/mentor/delivery/community/post"){send(await d.post({actorId,mentor:true,requestId:body.requestId,body:body.body}));return;}
  if(request.method==="POST"&&url.pathname==="/api/mentor/delivery/membership"){send(await d.setMembership({actorId,clientId:body.clientId,level:body.level,active:body.active,revision:body.revision}));return;}
  if(request.method==="POST"&&url.pathname==="/api/mentor/delivery/programming"){send(await d.adjust({actorId,clientId:body.clientId,requestId:body.requestId,title:body.title,instructions:body.instructions,effectiveFrom:body.effectiveFrom,planKey:body.planKey,rules:body.rules}));return;}
  json(response,404,{ok:false,error:{code:"not_found",message:"That coaching action is unavailable."}});
 }});
}
