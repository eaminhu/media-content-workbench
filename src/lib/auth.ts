import { spawn } from "node:child_process";
import { randomBytes, randomUUID, createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { AppError, type AvailableModel } from "./contracts";

const AUTH_BASE="https://auth.openai.com";
const RESOURCE="https://api.openai.com/v1";
const TOKEN_URL=AUTH_BASE+"/api/accounts/oauth/token";
const credentialPath=()=>join(process.env.LOCALAPPDATA??"", "ContentWorkbench", "oauth.credential");
const hostPath=()=>join(process.env.LOCALAPPDATA??"", "ContentWorkbench", "host-id");
const registrationPath=()=>join(process.env.LOCALAPPDATA??"", "ContentWorkbench", "registration.credential");
type Credential={clientId:string;hostId:string;email:string;subject:string;idToken:string;accessToken:string;refreshToken:string;expiresAt:number;scopes:string[];model:string|null};
type Attempt={state:string;nonce:string;verifier:string;redirectUri:string;clientId:string;isNew:boolean;createdAt:number};
let pending:Attempt|null=null;
let credentialCache:Credential|null|undefined;
const encoder=new TextEncoder();
const b64=(value:string)=>Buffer.from(value,"base64url");
function runPowerShell(script:string,input:string):Promise<string>{
  if(process.platform!=="win32") throw new AppError(501,"授权令牌的本机保护当前仅在 Windows 版本实现");
  return new Promise((resolve,reject)=>{
    // Use the Windows PowerShell module explicitly: inherited module paths may resolve to an incompatible version.
    const bootstrap="$ErrorActionPreference='Stop'; [Console]::InputEncoding=[Text.UTF8Encoding]::new($false); [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop; ";
    const child=spawn("powershell.exe",["-NoProfile","-NonInteractive","-Command",bootstrap+script],{windowsHide:true,stdio:["pipe","pipe","pipe"]});
    let out="",err="";
    child.stdout.setEncoding("utf8").on("data",chunk=>out+=chunk);
    child.stderr.setEncoding("utf8").on("data",chunk=>err+=chunk);
    child.on("error",reject);
    child.on("close",code=>{
      if(code===0&&out.trim()){resolve(out.trim());return;}
      const errorId=err.match(/FullyQualifiedErrorId\s*:\s*([A-Za-z0-9_.]+)/)?.[1]??null;
      console.error(JSON.stringify({event:"oauth_credential_protection_failed",exitCode:code,errorId}));
      reject(new AppError(500,"Windows 本机凭据加密或解密失败，请查看本机服务日志后重新授权"));
    });
    child.stdin.end(input,"utf8");
  });
}
export async function protect(value:string){
  const script="$plain=[Console]::In.ReadToEnd(); $secure=ConvertTo-SecureString -String $plain -AsPlainText -Force; ConvertFrom-SecureString -SecureString $secure";
  return runPowerShell(script,value);
}
export async function unprotect(value:string){
  const script="$cipher=[Console]::In.ReadToEnd(); $secure=ConvertTo-SecureString -String $cipher; [System.Net.NetworkCredential]::new('', $secure).Password";
  return runPowerShell(script,value);
}
async function readCredential():Promise<Credential|null>{
  const path=credentialPath();
  if(!path.startsWith(process.env.LOCALAPPDATA??"")) return null;
  try{
    const encrypted=await readFile(path,"utf8");
    const raw=await unprotect(encrypted);
    return JSON.parse(raw) as Credential;
  }catch(error){
    if((error as NodeJS.ErrnoException).code==="ENOENT"){credentialCache=null;return null;}
    throw new AppError(500,"无法读取本机授权凭据；请在连接设置中重新授权");
  }
}
async function writeCredential(value:Credential){
  const path=credentialPath(),dir=join(process.env.LOCALAPPDATA??"", "ContentWorkbench");
  if(!process.env.LOCALAPPDATA) throw new AppError(500,"Windows 用户凭据目录不可用");
  await mkdir(dir,{recursive:true});
  const encrypted=await protect(JSON.stringify(value));
  const temp=path+"."+randomUUID()+".tmp";
  await writeFile(temp,encrypted,{encoding:"utf8",flag:"wx"});
  await rename(temp,path);
  credentialCache=value;
}
async function readRegistration():Promise<{clientId:string}|null>{
  try{return JSON.parse(await unprotect(await readFile(registrationPath(),"utf8"))) as {clientId:string};}
  catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return null;throw new AppError(500,"无法读取本机 ChatGPT 注册记录");}
}
async function writeRegistration(clientId:string){
  const path=registrationPath(),dir=join(process.env.LOCALAPPDATA??"","ContentWorkbench");
  if(!process.env.LOCALAPPDATA)throw new AppError(500,"Windows 用户凭据目录不可用");
  await mkdir(dir,{recursive:true});
  const encrypted=await protect(JSON.stringify({clientId}));
  const temp=path+"."+randomUUID()+".tmp";
  await writeFile(temp,encrypted,{encoding:"utf8",flag:"wx"});
  await rename(temp,path);
}async function getHostId(){
  if(!process.env.LOCALAPPDATA) throw new AppError(500,"Windows 用户凭据目录不可用");
  const path=hostPath(),dir=join(process.env.LOCALAPPDATA,"ContentWorkbench");
  try{return (await readFile(path,"utf8")).trim();}
  catch(error){
    if((error as NodeJS.ErrnoException).code!=="ENOENT") throw error;
    await mkdir(dir,{recursive:true});
    const id="urn:uuid:"+randomUUID();
    try{await writeFile(path,id,{encoding:"utf8",flag:"wx"});return id;}
    catch(e){if((e as NodeJS.ErrnoException).code==="EEXIST")return (await readFile(path,"utf8")).trim();throw e;}
  }
}
const b64url=(value:Buffer)=>value.toString("base64url");
function encodeForm(values:Record<string,string>){return new URLSearchParams(values).toString();}
async function discoverOpenId(){
  const response=await fetch(AUTH_BASE+"/.well-known/openid-configuration",{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new AppError(502,"无法读取 OpenAI 登录配置");
  const data=await response.json() as {issuer?:string;jwks_uri?:string};
  if(data.issuer!==AUTH_BASE||!data.jwks_uri?.startsWith(AUTH_BASE+"/"))throw new AppError(502,"OpenAI 登录配置未通过校验");
  return data;
}
async function validateIdToken(token:string,clientId:string,nonce:string){
  const parts=token.split(".");
  if(parts.length!==3)throw new AppError(401,"登录回执中的身份令牌格式无效");
  let header:Record<string,string>,claims:Record<string,unknown>;
  try{header=JSON.parse(b64(parts[0]).toString("utf8"));claims=JSON.parse(b64(parts[1]).toString("utf8"));}
  catch{throw new AppError(401,"登录回执中的身份令牌格式无效");}
  if(header.alg!=="RS256"||typeof header.kid!=="string")throw new AppError(401,"身份令牌签名算法无效");
  const discovery=await discoverOpenId();
  const jwksResponse=await fetch(discovery.jwks_uri!,{signal:AbortSignal.timeout(15000)});
  if(!jwksResponse.ok)throw new AppError(502,"无法验证 OpenAI 身份令牌签名");
  const jwks=await jwksResponse.json() as {keys?:Array<Record<string,unknown>>};
  const jwk=jwks.keys?.find(key=>key.kid===header.kid&&key.kty==="RSA");
  if(!jwk)throw new AppError(401,"身份令牌签名密钥未找到");
  const valid=verifySignature("RSA-SHA256",Buffer.from(parts[0]+"."+parts[1]),createPublicKey({key:jwk,format:"jwk"}),b64(parts[2]));
  const audience=claims.aud;
  const hasAudience=audience===clientId||(Array.isArray(audience)&&audience.includes(clientId));
  if(!valid||claims.iss!==discovery.issuer||!hasAudience||claims.nonce!==nonce||typeof claims.sub!=="string"||
    typeof claims.exp!=="number"||claims.exp*1000<Date.now())throw new AppError(401,"身份令牌校验失败，请重新登录");
  return {subject:claims.sub,email:typeof claims.email==="string"?claims.email:"ChatGPT 用户"};
}
export async function beginAuthorization(origin:string){
  const url=new URL(origin);
  if(url.protocol!=="http:"||!["127.0.0.1","localhost","[::1]"].includes(url.hostname))throw new AppError(403,"授权登录只允许本机工作台");
  if(url.hostname!=="127.0.0.1")console.warn(JSON.stringify({event:"oauth_loopback_normalized",hostname:url.hostname}));
  const existing=await readCredential(),registration=await readRegistration(),hostId=await getHostId();
  const state=b64url(randomBytes(32)),nonce=b64url(randomBytes(32)),verifier=b64url(randomBytes(48));
  const challenge=b64url(createHash("sha256").update(verifier).digest());
  const clientId=existing?.clientId??registration?.clientId??"dynamic_agent_client";
  const redirectUri="http://127.0.0.1"+(url.port?":"+url.port:"")+"/api/auth/callback";
  pending={state,nonce,verifier,redirectUri,clientId,isNew:!existing&&!registration,createdAt:Date.now()};
  const params:Record<string,string>={client_id:clientId,response_type:"code",redirect_uri:redirectUri,
    scope:"openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",resource:RESOURCE,
    state,nonce,code_challenge_method:"S256",code_challenge:challenge,ext_agent_host_id:hostId};
  if(!existing)params.agent_name_hint="内容工坊";
  else if(existing.idToken)params.id_token_hint=existing.idToken;
  return AUTH_BASE+"/api/accounts/authorize?"+encodeForm(params);
}
export async function finishAuthorization(url:URL){
  const attempt=pending;pending=null;
  if(!attempt||Date.now()-attempt.createdAt>10*60*1000)throw new AppError(400,"登录请求已过期，请重新开始");
  if(url.searchParams.get("state")!==attempt.state)throw new AppError(400,"登录回执校验失败");
  if(url.searchParams.has("error"))throw new AppError(400,url.searchParams.get("error")==="access_denied"?"你取消了 ChatGPT 授权":"ChatGPT 授权未完成");
  const code=url.searchParams.get("code"),issuedId=url.searchParams.get("client_id");
  if(!code)throw new AppError(400,"登录回执缺少授权码");
  const clientId=attempt.isNew?issuedId:attempt.clientId;
  if(!clientId||clientId==="dynamic_agent_client"||(!attempt.isNew&&issuedId&&issuedId!==attempt.clientId))
    throw new AppError(400,"ChatGPT 客户端注册信息不匹配");
  const response=await fetch(TOKEN_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:encodeForm({grant_type:"authorization_code",client_id:clientId,code,code_verifier:attempt.verifier,redirect_uri:attempt.redirectUri,resource:RESOURCE}),
    signal:AbortSignal.timeout(20000)});
  const payload=await response.json().catch(()=>({})) as Record<string,unknown>;
  if(!response.ok)throw new AppError(502,"授权码兑换失败（HTTP "+response.status+"），请重新登录");
  const accessToken=payload.access_token,refreshToken=payload.refresh_token,idToken=payload.id_token,expires=payload.expires_in;
  if(typeof accessToken!=="string"||typeof refreshToken!=="string"||typeof idToken!=="string"||typeof expires!=="number")
    throw new AppError(502,"ChatGPT 未返回完整授权凭据");
  const scopes=String(payload.scope??url.searchParams.get("scope")??"").split(/\s+/).filter(Boolean);
  if(!scopes.includes("chatgpt.tokens.use.direct")||!scopes.includes("resource.invoke"))
    throw new AppError(403,"登录已完成，但未授予 ChatGPT 计划用量权限");
  const identity=await validateIdToken(idToken,clientId,attempt.nonce);
  const previous=await readCredential();
  if(previous&&previous.clientId===clientId&&previous.subject!==identity.subject)
    throw new AppError(403,"这次登录的 ChatGPT 账户与已保存账户不一致");
  const credential:Credential={clientId,hostId:await getHostId(),email:identity.email,subject:identity.subject,idToken,accessToken,
    refreshToken,expiresAt:Date.now()+expires*1000,scopes,model:previous?.model??null};
  await writeCredential(credential);
  await writeRegistration(clientId);
  return {email:credential.email};
}
async function refresh(credential:Credential):Promise<Credential>{
  if(credential.expiresAt>Date.now()+60000)return credential;
  const response=await fetch(TOKEN_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:encodeForm({grant_type:"refresh_token",client_id:credential.clientId,refresh_token:credential.refreshToken,resource:RESOURCE}),
    signal:AbortSignal.timeout(20000)});
  const payload=await response.json().catch(()=>({})) as Record<string,unknown>;
  if(!response.ok)throw new AppError(401,"ChatGPT 登录已过期，请重新授权");
  const scopes=String(payload.scope??credential.scopes.join(" ")).split(/\s+/).filter(Boolean);
  const next:Credential={...credential,accessToken:String(payload.access_token??""),refreshToken:String(payload.refresh_token??credential.refreshToken),
    expiresAt:Date.now()+Number(payload.expires_in??0)*1000,scopes,
    idToken:typeof payload.id_token==="string"?payload.id_token:credential.idToken};
  if(!next.accessToken||!scopes.includes("chatgpt.tokens.use.direct"))throw new AppError(401,"ChatGPT 订阅用量权限已失效，请重新授权");
  await writeCredential(next);
  return next;
}
export async function getCredential(){const credential=await readCredential();if(!credential)return null;return refresh(credential);}
export async function getAuthStatus(){const credential=await getCredential();return {connected:Boolean(credential),email:credential?.email??null,model:credential?.model??null};}
export async function signOut(){
  const path=credentialPath();
  try{await (await import("node:fs/promises")).unlink(path);}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
  credentialCache=null;
}
const modelCatalogSchema=z.object({models:z.array(z.object({
  slug:z.string().min(1),display_name:z.string().min(1),visibility:z.string(),
}))});
export function parseModelCatalog(body:unknown):AvailableModel[]{
  const result=modelCatalogSchema.safeParse(body);
  if(!result.success){
    console.error(JSON.stringify({event:"oauth_model_catalog_invalid",issues:result.error.issues.map(issue=>({path:issue.path.join("."),code:issue.code}))}));
    throw new AppError(502,"模型目录格式不匹配，请查看本机服务日志");
  }
  const models=result.data.models.filter(item=>item.visibility==="list").map(({slug,display_name})=>({slug,display_name}));
  if(!models.length)console.warn(JSON.stringify({event:"oauth_model_catalog_empty",totalModels:result.data.models.length}));
  return models;
}
export async function listModels(){
  const credential=await getCredential();if(!credential)throw new AppError(401,"请先使用 ChatGPT 授权登录");
  const response=await fetch(RESOURCE+"/models",{headers:{Authorization:"Bearer "+credential.accessToken},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new AppError(response.status===401?401:502,"无法读取当前账户可用模型（HTTP "+response.status+"）");
  return parseModelCatalog(await response.json());
}
export async function chooseModel(model:string){
  const credential=await getCredential();if(!credential)throw new AppError(401,"请先使用 ChatGPT 授权登录");
  const available=await listModels();
  if(!available.some(item=>item.slug===model))throw new AppError(400,"该模型不在当前账户可用列表中，请重新读取模型");
  await writeCredential({...credential,model});
}
export async function credentialForInference(){
  const credential=await getCredential();
  if(!credential)throw new AppError(401,"请先使用 ChatGPT 授权登录");
  if(!credential.model)throw new AppError(400,"请先读取并选择当前账户可用模型");
  return credential;
}
export async function forgetAfterRefreshFailure(){await signOut();}
