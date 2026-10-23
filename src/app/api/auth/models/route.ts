import { z } from "zod";
import { chooseModel,listModels } from "@/lib/auth";
import { AppError } from "@/lib/contracts";
import { guardLocal,readJson,json,errorResponse } from "@/lib/http";
export const runtime="nodejs";
export async function GET(request:Request){try{guardLocal(request);return json({models:await listModels()});}catch(error){return errorResponse(error);}}
export async function POST(request:Request){try{guardLocal(request,true);const input=z.object({model:z.string().min(1).max(200)}).strict().parse(await readJson(request));await chooseModel(input.model);return json({ok:true,model:input.model});}catch(error){return errorResponse(error);}}
