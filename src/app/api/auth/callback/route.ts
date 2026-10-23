import { finishAuthorization } from "@/lib/auth";
import { guardLocal,errorResponse } from "@/lib/http";
export const runtime="nodejs";
export async function GET(request:Request){
  try{guardLocal(request);const url=new URL(request.url);await finishAuthorization(url);const destination=new URL("/",url);destination.searchParams.set("auth","connected");return Response.redirect(destination,303);}
  catch(error){
    const response=errorResponse(error);
    const message=await response.json().catch(()=>({error:"授权失败"}));
    const html="<!doctype html><meta charset=utf-8><title>内容工坊授权</title><main style='font:16px system-ui;margin:12vh auto;max-width:600px;padding:32px'><h1>ChatGPT 授权未完成</h1><p>"+String(message.error).replace(/[<>&"]/g," ")+"</p><a href='/'>返回内容工坊</a></main>";
    return new Response(html,{status:response.status,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}});
  }
}
