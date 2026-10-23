import { beginAuthorization } from "@/lib/auth";
import { guardLocal,errorResponse } from "@/lib/http";
export const runtime="nodejs";
export async function GET(request:Request){
  try{guardLocal(request);const url=await beginAuthorization(new URL(request.url).origin);return Response.redirect(url,302);}
  catch(error){return errorResponse(error);}
}
