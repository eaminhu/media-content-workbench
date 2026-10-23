import { signOut } from "@/lib/auth";
import { guardLocal,json,errorResponse } from "@/lib/http";
export const runtime="nodejs";
export async function POST(request:Request){try{guardLocal(request,true);await signOut();return json({ok:true});}catch(error){return errorResponse(error);}}
