import {html,render} from "lit-html";
import {createSamRuntime} from "../../shared/sam-runtime.ts";
import {createClientTransport} from "../../shared/browser-http.ts";
import {isRecord} from "../../shared/validation.ts";
import type {ClientResult} from "../../shared/client-result.ts";
type Receipt=Readonly<{signedIn:boolean;message:string}>;
type Effect=Readonly<{id:number;kind:"signIn";username:string}> | Readonly<{id:number;kind:"navigate"}>;
type Model=Readonly<{username:string;serial:number;pending:Effect | undefined;message:string;error:string}>;
type Proposal=Readonly<{kind:"username";value:string}> | Readonly<{kind:"submit"}> | Readonly<{kind:"completed";id:number;result:ClientResult<Receipt>}> | Readonly<{kind:"navigated";id:number}>;
export function acceptMaster(m:Model,p:Proposal):Model {
 if(p.kind==="username")return m.pending?m:{...m,username:p.value,message:"",error:""};
 if(p.kind==="submit")return m.pending?m:{...m,serial:m.serial+1,pending:{id:m.serial+1,kind:"signIn",username:m.username.trim()},error:"",message:""};
 if(m.pending?.id!==p.id || (m.pending.kind==="navigate")!==(p.kind==="navigated"))return m;
 if(p.kind==="navigated")return{...m,pending:undefined};
 return !p.result.ok?{...m,pending:undefined,error:p.result.error.message}:p.result.value.signedIn?{...m,serial:m.serial+1,pending:{id:m.serial+1,kind:"navigate"}}:{...m,pending:undefined,message:p.result.value.message};
}
export function mountMasterSignIn(root:HTMLElement) {
 const scope=new AbortController(),call=createClientTransport({csrf:root.dataset.csrf ?? "",send:fetch,signal:scope.signal}),preview=root.dataset.masterPreview==="true";
 const runtime=createSamRuntime<Model,Proposal,Model,Effect>({initial:{username:"harrybaldwin",serial:0,pending:undefined,message:"",error:""},accept:acceptMaster,represent:m=>m,next:m=>m.pending,
  present:m=>render(html`<div class="sc-app"><div class="sc-auth"><aside class="sc-auth-aside"><a href="/apply" class="sc-brand">Elite Body System</a><div><p class="sc-eyebrow mb-6">Marketing · Sales · Delivery</p><p class="sc-display sc-auth-statement">Your system.<br>Your standard.</p></div><p class="sc-copy mt-16 text-xs">Harry Baldwin</p></aside><section class="sc-auth-content"><div class="sc-auth-form"><p class="sc-eyebrow mb-3">EBS Master</p><h1 class="sc-display text-[44px]">Your whole business.<br>One portal.</h1><p class="sc-copy mt-4">${preview?"Open your isolated master preview.":"Enter your username. We’ll send a secure link to your registered email."}</p><form class="mt-8 space-y-5" @submit=${(e:Event)=>{e.preventDefault();runtime.propose({kind:"submit"});}}><label class="sc-label block" for="master-username">Username<input id="master-username" name="username" class="sc-textarea mt-2" autocomplete="username" autocapitalize="none" required maxlength="100" .value=${m.username} ?disabled=${!!m.pending} @input=${(e:Event)=>runtime.propose({kind:"username",value:(e.target as HTMLInputElement).value})}></label><button class="sc-primary w-full" ?disabled=${!!m.pending}>${m.pending?"Opening…":preview?"Open EBS Master":"Send secure sign-in link"}</button></form>${m.message?html`<p class="sc-auth-message" role="status">${m.message}</p>`:""}${m.error?html`<p class="sc-error mt-6" role="alert">${m.error}</p>`:""}<a class="mt-6 inline-flex min-h-11 items-center text-sm underline underline-offset-4" href="/sign-in">Member sign-in</a></div><p class="sc-copy text-center text-xs">${preview?"Isolated preview · Synthetic data":"Secure access · Verified email"}</p></section></div></div>`,root),
  perform:async e=>{if(e.kind==="navigate"){location.assign("/manage");return{kind:"navigated",id:e.id};}return{kind:"completed",id:e.id,result:await call({path:"/api/auth/master-request",body:{username:e.username},parse:v=>isRecord(v)&&typeof v.signedIn==="boolean"&&typeof v.message==="string"?{signedIn:v.signedIn,message:v.message}:undefined})};},
  failed:e=>e.kind==="navigate"?{kind:"navigated",id:e.id}:{kind:"completed",id:e.id,result:{ok:false,error:{code:"unavailable",message:"Master sign-in could not finish. Try again."}}},
 });
 return()=>{scope.abort();runtime.dispose();};
}
