import {z} from "zod";
import {getStore} from "@/lib/db";
import {guardLocal,json,errorResponse} from "@/lib/http";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{topicId:string}>}){
  try{guardLocal(request);const id=z.string().uuid().parse((await context.params).topicId);
    getStore().getTopic(id);return json({versions:getStore().listVersions(id)});
  }catch(error){return errorResponse(error);}
}
