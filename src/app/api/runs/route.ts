import { z } from "zod";
import { AppError } from "@/lib/contracts";
import { getStore } from "@/lib/db";
import { getHealth } from "@/lib/health";
import { loadSkill } from "@/lib/skills";
import { assessWithSubscription } from "@/lib/oauth-inference";
import { guardLocal,readJson,json,errorResponse } from "@/lib/http";
export const runtime="nodejs";
export const maxDuration=180;
export async function POST(request:Request){
  let runId:string|undefined;
  try{
    guardLocal(request,true);
    const input=z.object({topicId:z.string().uuid(),versionId:z.string().uuid()}).strict().parse(await readJson(request));
    const key=z.string().uuid().parse(request.headers.get("idempotency-key"));
    const health=await getHealth();if(!health.ready)throw new AppError(503,health.message);
    const store=getStore(),bundle=await loadSkill();
    store.getTopic(input.topicId);const version=store.getVersion(input.versionId);
    const run=store.enqueue({...input,key,model:health.model!,skillHash:bundle.hash,limit:health.maxDailyRuns});
    runId=run.id;
    if(run.status!=="queued")return json({run},200);
    if(!store.startRun(run.id))return json({run:store.getRun(run.id)},200);
    try{
      const timeout=AbortSignal.timeout(120000);
      const result=await assessWithSubscription(version.brief,timeout,id=>store.recordResponseId(run.id,id));
      const updated=store.finishRun(run.id,{status:"succeeded",responseId:result.responseId,result:result.assessment,
        usage:result.usage,readVerified:result.skillReadVerified});
      return json({run:updated},200);
    }catch(error){
      const explicit=error instanceof AppError;
      const message=error instanceof Error?error.message:"评测发生未知错误";
      store.finishRun(run.id,{status:explicit?"failed":"needs_attention",
        error:explicit?message:"请求中断或结果不完整，可能已计入订阅用量。核对运行记录后再发起新评测。"+(message?("（"+message+"）"):"")});
      throw error;
    }
  }catch(error){return errorResponse(error);}
}