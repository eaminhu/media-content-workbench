import assert from "node:assert/strict";
import test from "node:test";
import { readLocalSkill, streamResponse } from "../src/lib/oauth-inference";
import { hashBytes, loadSkill } from "../src/lib/skills";
import { AppError } from "../src/lib/contracts";

function stream(events:unknown[]){
  return new Response(events.map(event=>"data: "+JSON.stringify(event)+"\n\n").join(""),{headers:{"Content-Type":"text/event-stream"}});
}

test("Real local Skill text matches file hashes including Chinese after Python transport",async t=>{
  t.mock.method(console,"info",()=>{});
  const bundle=await loadSkill(),skill=readLocalSkill(bundle);
  assert.equal(skill.manifest,bundle.files[0].bytes.toString("utf8"));
  assert.equal(skill.rubric,bundle.files[1].bytes.toString("utf8"));
  assert.equal(hashBytes(skill.manifest),skill.proof.manifest_sha256);
  assert.equal(hashBytes(skill.rubric),skill.proof.rubric_sha256);
});

test("Changed local Skill fails preflight without a GPT request",async t=>{
  t.mock.method(console,"error",()=>{});
  const fetch=t.mock.method(globalThis,"fetch",async()=>{throw new Error("Network must not be used");});
  const bundle=await loadSkill();
  assert.throws(()=>readLocalSkill({...bundle,manifestHash:"not-the-file-hash"}),error=>error instanceof AppError&&error.status===503);
  assert.equal(fetch.mock.calls.length,0);
});

test("Two streamed phases require the Skill tool first then send verified text for the assessment",async t=>{
  t.mock.method(console,"info",()=>{});
  const requests:Record<string,unknown>[]=[];
  const call={type:"function_call",name:"read_topic_assessment_skill",call_id:"call-test",arguments:"{}"};
  const output={type:"message",content:[{type:"output_text",text:"diagnostic assessment"}]};
  t.mock.method(globalThis,"fetch",async(_url:unknown,init?:RequestInit)=>{
    requests.push(JSON.parse(String(init?.body)));
    const id="resp-test-"+requests.length;
    return stream([
      {type:"response.created",response:{id}},
      {type:"response.output_item.added",output_index:0,item:{...(requests.length===1?call:output),status:"in_progress"}},
      {type:"response.output_item.done",output_index:0,item:requests.length===1?call:output},
      {type:"response.completed",response:{id,status:"completed",output:[]}},
    ]);
  });
  const ids:string[]=[],signal=AbortSignal.timeout(10000);
  const input:unknown[]=[{role:"user",content:"diagnostic-only"}];
  const first=await streamResponse("diagnostic-token","diagnostic-model",input,signal,"read_skill",id=>{ids.push(id);});
  assert.deepEqual(first.response.output,[call]);
  const skill=readLocalSkill(await loadSkill());
  const continuation=[...input,...first.response.output!,{type:"function_call_output",call_id:"call-test",output:JSON.stringify(skill)}];
  const second=await streamResponse("diagnostic-token","diagnostic-model",continuation,signal,"assessment",id=>{ids.push(id);});
  assert.deepEqual(requests[0].tool_choice,{type:"function",name:"read_topic_assessment_skill"});
  assert.equal(requests[1].tool_choice,"none");
  for(const request of requests){
    assert.equal(request.parallel_tool_calls,false);
    assert.equal(request.store,false);
    assert.equal(request.stream,true);
    assert.equal("tools" in request,false);
    const context=(request.input as Array<Record<string,unknown>>)[0];
    assert.equal(context.type,"additional_tools");
    assert.equal(context.role,"developer");
    assert.equal((context.tools as Array<Record<string,unknown>>)[0].name,"read_topic_assessment_skill");
  }
  assert.deepEqual((requests[0].input as unknown[])[0],(requests[1].input as unknown[])[0]);
  assert.deepEqual((requests[1].input as unknown[]).slice(1),continuation);
  assert.deepEqual(ids,["resp-test-1","resp-test-2"]);
  assert.deepEqual(second.response.output,[output]);
});

test("An interrupted stream retains response ID and never counts as completed",async t=>{
  t.mock.method(globalThis,"fetch",async()=>stream([
    {type:"response.created",response:{id:"resp-interrupted"}},
    {type:"response.output_item.done",output_index:0,item:{type:"function_call",call_id:"call",name:"read_topic_assessment_skill",arguments:"{}"}},
  ]));
  const ids:string[]=[];
  await assert.rejects(()=>streamResponse("diagnostic-token","diagnostic-model",[],AbortSignal.timeout(10000),"read_skill",id=>{ids.push(id);}),/response.completed/);
  assert.deepEqual(ids,["resp-interrupted"]);
});

test("Completed output items retain order across fragmented UTF-8 and a terminal event without a final newline",async t=>{
  t.mock.method(console,"info",()=>{});
  const reasoning={type:"reasoning",id:"reason-test",encrypted_content:"diagnostic-only",summary:[]};
  const message={type:"message",id:"message-test",content:[{type:"output_text",text:"中文评测"}]};
  const text=[
    {type:"response.created",response:{id:"resp-fragmented"}},
    {type:"response.output_item.done",output_index:1,item:message},
    {type:"response.output_item.done",output_index:0,item:reasoning},
    {type:"response.completed",response:{id:"resp-fragmented",status:"completed"}},
  ].map(event=>"data: "+JSON.stringify(event)).join("\r\n\r\n");
  t.mock.method(globalThis,"fetch",async()=>{
    const bytes=new TextEncoder().encode(text);
    return new Response(new ReadableStream({start(controller){
      for(let i=0;i<bytes.length;i+=5)controller.enqueue(bytes.slice(i,i+5));
      controller.close();
    }}));
  });
  const result=await streamResponse("diagnostic-token","diagnostic-model",[],AbortSignal.timeout(10000),"assessment");
  assert.deepEqual(result.response.output,[reasoning,message]);
});

test("A provider failure cannot be replaced by previously completed output items",async t=>{
  t.mock.method(globalThis,"fetch",async()=>stream([
    {type:"response.created",response:{id:"resp-failed"}},
    {type:"response.output_item.done",output_index:0,item:{type:"message",content:[]}},
    {type:"response.failed",response:{id:"resp-failed",error:{code:"diagnostic_failure"}}},
  ]));
  await assert.rejects(()=>streamResponse("diagnostic-token","diagnostic-model",[],AbortSignal.timeout(10000),"assessment"),/diagnostic_failure/);
});
