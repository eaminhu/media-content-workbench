import {getStore} from "@/lib/db";
import {getHealth} from "@/lib/health";
import {guardLocal,json,errorResponse} from "@/lib/http";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:Request){
  try{guardLocal(request);const store=getStore();store.reconcileInterruptedRuns();return json({topics:store.listTopics(),runs:store.listRuns(),health:await getHealth()});}
  catch(error){return errorResponse(error);}
}
