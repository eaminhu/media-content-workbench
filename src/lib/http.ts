import { ZodError } from "zod";
import { AppError } from "./contracts";
export function guardLocal(request: Request, write=false) {
  const url=new URL(request.url);
  if(!["127.0.0.1","localhost","[::1]"].includes(url.hostname)) throw new AppError(403,"当前版本仅允许本机访问");
  if(write && request.headers.get("origin")!==url.origin) throw new AppError(403,"请求来源不匹配，请在本机工作台操作");
}
export async function readJson(request: Request) {
  if(!request.headers.get("content-type")?.startsWith("application/json")) throw new AppError(415,"需要 JSON 数据");
  const reader=request.body?.getReader();
  if(!reader) throw new AppError(400,"请求体为空");
  let total=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;
    if(total>64000){await reader.cancel();throw new AppError(413,"输入过长，请控制在 64 KB 内");}chunks.push(value);}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new AppError(400,"JSON 格式无效");}
}
export function json(data:unknown,status=200){return Response.json(data,{status,headers:{"Cache-Control":"no-store"}});}
export function errorResponse(error:unknown){
  if(error instanceof AppError) return json({error:error.message},error.status);
  if(error instanceof ZodError) return json({error:error.issues.slice(0,2).map(i=>i.message).join("；")},400);
  console.error(JSON.stringify({event:"api_error",message:error instanceof Error?error.message:"unknown"}));
  return json({error:"服务暂时无法完成操作，请查看本机服务日志"},500);
}
