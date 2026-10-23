import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { AppError, assessmentSchema, type Assessment, type Brief } from "./contracts";
import { loadSkill, hashBytes, type SkillBundle } from "./skills";
import { credentialForInference } from "./auth";

type StreamResponse={id?:string;status?:string;output?:Array<Record<string,unknown>>;error?:{code?:string;message?:string};usage?:unknown};
type StreamEvent={type?:string;response?:StreamResponse;error?:{code?:string};output_index?:number;item?:Record<string,unknown>};
type InferenceResult={assessment:Assessment;responseId:string|null;usage:unknown;skillReadVerified:boolean};
const skillToolContext={type:"additional_tools",role:"developer",tools:[{type:"function",name:"read_topic_assessment_skill",
  description:"Read the local topic-assessment skill and its rubric before evaluating. Call this exactly once before providing the assessment.",
  parameters:{type:"object",properties:{},required:[],additionalProperties:false},strict:true}]};
export function readLocalSkill(bundle:SkillBundle){
  const script=join(process.cwd(),"skills","topic-assessment","scripts","read_context.py");
  const result=spawnSync("python",[script],{encoding:"utf8",env:{...process.env,PYTHONIOENCODING:"utf-8"},timeout:5000,maxBuffer:1000000,windowsHide:true});
  if(result.error||result.status!==0){
    console.error(JSON.stringify({event:"skill_read_failed",exitCode:result.status,errorCode:(result.error as NodeJS.ErrnoException|undefined)?.code??null}));
    throw new AppError(503,"本机 topic-assessment Skill 读取脚本执行失败，尚未调用 GPT");
  }
  let value:{proof:{skill:string;version:string;manifest_sha256:string;rubric_sha256:string};manifest:string;rubric:string};
  try{value=JSON.parse(result.stdout);}catch{
    console.error(JSON.stringify({event:"skill_read_invalid_json",skill:bundle.name}));
    throw new AppError(503,"本机 Skill 读取脚本输出格式无效，尚未调用 GPT");
  }
  if(value?.proof?.skill!==bundle.name||value.proof.version!==bundle.version||
    value.proof.manifest_sha256!==bundle.manifestHash||value.proof.rubric_sha256!==bundle.rubricHash||
    typeof value.manifest!=="string"||typeof value.rubric!=="string"||
    hashBytes(value.manifest)!==bundle.manifestHash||hashBytes(value.rubric)!==bundle.rubricHash){
    console.error(JSON.stringify({event:"skill_read_mismatch",skill:bundle.name}));
    throw new AppError(503,"本机 Skill 内容或读取回执与文件版本不一致，尚未调用 GPT");
  }
  console.info(JSON.stringify({event:"skill_read_preflight_passed",skill:bundle.name,skillHash:bundle.hash}));
  return value;
}
export async function streamResponse(token:string,model:string,input:unknown[],signal:AbortSignal,phase:"read_skill"|"assessment",onResponseId?:(id:string)=>void|Promise<void>){
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify({model,input:[skillToolContext,...input],store:false,stream:true,parallel_tool_calls:false,
      tool_choice:phase==="read_skill"?{type:"function",name:"read_topic_assessment_skill"}:"none"}),signal});
  if(!response.ok){
    const body=await response.json().catch(()=>({})) as {error?:{code?:string}};
    throw new AppError(response.status===401?401:response.status>=500?502:400,
      "ChatGPT 订阅用量请求失败（HTTP "+response.status+(body.error?.code?(" · "+body.error.code):"")+"）");
  }
  if(!response.body)throw new Error("Responses API 未返回流式内容");
  const reader=response.body.getReader(),decoder=new TextDecoder();
  const completedItems=new Map<number,Record<string,unknown>>();
  let buffer="";const state:{completed:StreamResponse|null;createdId:string|null;failed:string|null}={completed:null,createdId:null,failed:null};
  async function consumeLine(line:string){
    if(!line.startsWith("data:"))return;
    const data=line.slice(5).trim();if(!data||data==="[DONE]")return;
    let event:StreamEvent;
    try{event=JSON.parse(data);}catch{throw new Error("Responses API 流式事件格式无效，结果未接受");}
    if(event.type==="response.created"&&event.response?.id){state.createdId=event.response.id;await onResponseId?.(event.response.id);}
    if(event.type==="response.output_item.done"){
      const index=event.output_index;
      if(typeof index!=="number"||!Number.isSafeInteger(index)||index<0||!event.item||typeof event.item.type!=="string")
        throw new Error("Responses API 完成输出项格式无效，结果未接受");
      completedItems.set(index,event.item);
    }
    if(event.type==="response.completed")state.completed=event.response??null;
    if(event.type==="response.failed")state.failed=event.response?.error?.code??"Responses API 返回失败事件";
    if(event.type==="error")state.failed=event.error?.code??"Responses API 流发生错误";
    if(event.type==="response.incomplete")state.failed="Responses API 输出不完整，未接受为评测结果";
  }
  try{
    while(true){
      const {value,done}=await reader.read();buffer+=decoder.decode(value??new Uint8Array(),{stream:!done});
      let index:number;while((index=buffer.indexOf("\n"))>=0){const line=buffer.slice(0,index).replace(/\r$/,"");buffer=buffer.slice(index+1);await consumeLine(line);}
      if(done)break;
    }
    if(buffer.trim())await consumeLine(buffer.replace(/\r$/, ""));
  }finally{reader.releaseLock();}
  if(state.failed)throw new Error("GPT 评测未完成："+state.failed);
  if(!state.completed)throw new Error("Responses API 流在 response.completed 之前结束");
  if(!state.completed.output?.length&&completedItems.size){
    state.completed={...state.completed,output:[...completedItems].sort(([a],[b])=>a-b).map(([,item])=>item)};
    console.info(JSON.stringify({event:"response_output_collected_from_items",phase,responseId:state.completed.id??state.createdId,outputCount:completedItems.size}));
  }
  console.info(JSON.stringify({event:"assessment_response_completed",phase,responseId:state.completed.id??state.createdId,outputTypes:(state.completed.output??[]).map(item=>item.type)}));
  return {response:state.completed,responseId:state.completed.id??state.createdId};
}
function extractText(response:StreamResponse){
  const parts:string[]=[];
  for(const item of response.output??[]){
    if(item.type!=="message"||!Array.isArray(item.content))continue;
    for(const content of item.content as Array<{type?:string;text?:string}>){if(content.type==="output_text"&&content.text)parts.push(content.text);}
  }
  return parts.join("\n").trim();
}
export async function assessWithSubscription(brief:Brief,signal:AbortSignal,onResponseId?:(id:string)=>void|Promise<void>):Promise<InferenceResult>{
  const [credential,bundle]=await Promise.all([credentialForInference(),loadSkill()]);
  const localSkill=readLocalSkill(bundle);
  const developer="你是内容工坊的选题评审。严格执行本机 topic-assessment skill 中的步骤、量表和边界。你必须先调用 read_topic_assessment_skill，读取其中的完整规则与文件读取证明。仅基于输入材料，不预测流量、不声称核验外部事实。最终只输出一个符合 skill 输出约定的 JSON 对象。";
  const user=JSON.stringify({task:"topic_score",brief});
  let input:unknown[]=[{role:"developer",content:[{type:"input_text",text:developer}]},{role:"user",content:[{type:"input_text",text:user}]}];
  let proof:{proof:{skill:string;version:string;manifest_sha256:string;rubric_sha256:string};manifest:string;rubric:string}|null=null;
  let latestId:string|null=null,usage:unknown=null;
  for(let step=0;step<2;step++){
    const result=await streamResponse(credential.accessToken,credential.model!,input,signal,proof?"assessment":"read_skill",onResponseId);
    latestId=result.responseId??latestId;usage=result.response.usage??usage;
    const calls=(result.response.output??[]).filter(item=>item.type==="function_call"&&item.name==="read_topic_assessment_skill");
    if(calls.length===0){
      if(!proof){
        console.error(JSON.stringify({event:"skill_tool_call_missing",responseId:latestId}));
        throw new AppError(502,"GPT 首轮未调用 Skill 读取工具，本次结果未接受，可能已计入订阅用量");
      }
      const rawText=extractText(result.response);
      const fence=String.fromCharCode(96).repeat(3);
      const text=rawText.replace(new RegExp("^"+fence+"(?:json)?\\s*","i"),"").replace(new RegExp("\\s*"+fence+"$"),"");
      let parsed:unknown;try{parsed=JSON.parse(text);}catch{throw new Error("GPT 输出不是有效 JSON，结果未接受");}
      const assessment=assessmentSchema.safeParse(parsed);
      if(!assessment.success)throw new Error("GPT 输出不符合五维评测格式，结果未接受："+assessment.error.issues[0].message);
      if(proof.proof.skill!=="topic-assessment"||proof.proof.version!=="1.0.0"||
        proof.proof.manifest_sha256!==bundle.manifestHash||proof.proof.rubric_sha256!==bundle.rubricHash)
        throw new Error("本机 skill 读取回执与当前文件版本不匹配，结果未接受");
      return {assessment:assessment.data,responseId:latestId,usage,skillReadVerified:true};
    }
    if(step!==0||calls.length!==1)throw new Error("GPT 重复调用 skill 读取工具，结果未接受");
    const call=calls[0],callId=String(call.call_id??"");
    if(!callId)throw new Error("GPT skill 工具调用缺少标识");
    proof=localSkill;
    input=[...input,...(result.response.output??[]),{type:"function_call_output",call_id:callId,output:JSON.stringify(proof)}];
  }
  throw new Error("GPT 未在读取 skill 后给出评测结果");
}
