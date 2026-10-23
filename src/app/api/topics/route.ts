import {z} from "zod";
import {briefSchema} from "@/lib/contracts";
import {getStore} from "@/lib/db";
import {guardLocal,readJson,json,errorResponse} from "@/lib/http";
export const runtime="nodejs";
const inputSchema=z.object({topicId:z.string().uuid().optional(),baseVersionId:z.string().uuid().optional(),brief:briefSchema}).strict();
export async function POST(request:Request){
  try{guardLocal(request,true);const input=inputSchema.parse(await readJson(request));
    return json({topic:getStore().saveTopic(input.brief,input.topicId,input.baseVersionId)},201);
  }catch(error){return errorResponse(error);}
}
