import { getAuthStatus } from "@/lib/auth";
import { guardLocal,json,errorResponse } from "@/lib/http";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:Request){try{guardLocal(request);return json(await getAuthStatus());}catch(error){return errorResponse(error);}}
