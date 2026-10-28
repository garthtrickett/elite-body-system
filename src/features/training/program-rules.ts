import {PROGRAM,WEEK} from "./catalog.ts";
import type {Exercise} from "./catalog.ts";
import {isRecord,isText} from "../../shared/validation.ts";
export type ExerciseRule=Readonly<{sets?:number;reps?:string;rest?:number;target?:number;note?:string}>;
export type ProgramRules=Readonly<Record<string,ExerciseRule>>;
export function parseProgramRules(input:Readonly<{planKey:number;value:unknown}>):ProgramRules | undefined {
 if(!isRecord(input.value)||!WEEK[input.planKey])return;
 const result:Record<string,ExerciseRule>={};
 for(const [id,rule] of Object.entries(input.value)) {
  const exercise=(PROGRAM[input.planKey] ?? []).find(e=>e.id===id);
  if(!exercise||!isRecord(rule)||Object.keys(rule).some(k=>!["sets","reps","rest","target","note"].includes(k)))return;
  if(rule.sets!==undefined&&(!exercise.sets||typeof rule.sets!=="number"||!Number.isInteger(rule.sets)||rule.sets<1||rule.sets>10))return;
  if(rule.reps!==undefined&&(!exercise.sets||!isText(rule.reps,100)||!rule.reps.trim()))return;
  if(rule.rest!==undefined&&(typeof rule.rest!=="number"||!Number.isInteger(rule.rest)||rule.rest<0||rule.rest>600))return;
  if(rule.target!==undefined&&(!exercise.cardio||typeof rule.target!=="number"||!Number.isFinite(rule.target)||rule.target<1||rule.target>600))return;
  if(rule.note!==undefined&&!isText(rule.note,2000))return;
  result[id]={...(rule.sets!==undefined?{sets:rule.sets as number}:{}),...(rule.reps!==undefined?{reps:rule.reps as string}:{}),...(rule.rest!==undefined?{rest:rule.rest as number}:{}),...(rule.target!==undefined?{target:rule.target as number}:{}),...(rule.note!==undefined?{note:rule.note as string}:{})};
 }
 return Object.fromEntries(Object.keys(result).sort().map(id=>[id,result[id]!])) as ProgramRules;
}
export function baseExercises(input:Readonly<{planKey:number;programRules?:ProgramRules}>):readonly Exercise[] {return(PROGRAM[input.planKey] ?? []).map(e=>({...e,...input.programRules?.[e.id]}));}
export const programTemplates=Object.entries(PROGRAM).map(([key,exercises])=>({planKey:Number(key),name:WEEK[Number(key)]?.name ?? `Session ${key}`,exercises}));

export type ProgramAdjustment=Readonly<{id:string;title:string;instructions:string;effectiveFrom:string;createdAt:string;planKey:number|null;rules:ProgramRules}>;
export function parseProgramAdjustment(value:unknown):ProgramAdjustment|undefined {
 if(!isRecord(value)||!isText(value.id,80)||!isText(value.title,300)||!isText(value.instructions,12000)||!isText(value.effectiveFrom,10)||!/^\d{4}-\d{2}-\d{2}$/.test(value.effectiveFrom)||!isText(value.createdAt,80)||!Number.isFinite(Date.parse(value.createdAt))||!(value.planKey===null||typeof value.planKey==="number"))return;
 const rules=value.planKey===null?{}:parseProgramRules({planKey:value.planKey,value:value.rules});if(!rules)return;
 return{id:value.id,title:value.title,instructions:value.instructions,effectiveFrom:value.effectiveFrom,createdAt:value.createdAt,planKey:value.planKey,rules};
}
