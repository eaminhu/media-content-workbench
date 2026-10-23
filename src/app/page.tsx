"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {briefSchema,type AvailableModel,type Brief,type Health,type Run,type Topic} from "@/lib/contracts";
import {Icon} from "@/components/icon";
import {AssessmentPanel} from "@/components/assessment";

const emptyBrief:Brief={title:"",platform:"通用",audience:"",angle:"",materials:"",instructions:""};
const stages=["选题评测","资料研究","正文创作","内容打磨","做图校正","发布复盘"];
const stageNotes=["当前可用：保存选题与五维评测","收集资料，保留事实来源","从大纲生成正文或逐页文案","保留作者意图，逐轮修改","先做样张，支持单页重做","记录真实表现，形成下一轮假设"];
type Workspace={topics:Topic[];runs:Run[];health:Health};
async function api<T>(url:string,options?:RequestInit):Promise<T>{
  const response=await fetch(url,{...options,cache:"no-store"});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error??"请求未完成");
  return data as T;
}
export default function Page(){
 const [topics,setTopics]=useState<Topic[]>([]),[runs,setRuns]=useState<Run[]>([]),[health,setHealth]=useState<Health|null>(null),[models,setModels]=useState<AvailableModel[]>([]);
 const [selectedId,setSelectedId]=useState<string|null>(null),[brief,setBrief]=useState<Brief>(emptyBrief);
 const [baseline,setBaseline]=useState(JSON.stringify(emptyBrief)),[ready,setReady]=useState(false);
 const [action,setAction]=useState(""),[message,setMessage]=useState(""),[networkError,setNetworkError]=useState(""),[retryChecked,setRetryChecked]=useState(false);
 const [view,setView]=useState<"workbench"|"history"|"settings"|"roadmap">("workbench");
 const [versions,setVersions]=useState<{id:string;revision:number;brief:Brief}[]>([]),[showVersions,setShowVersions]=useState(false);
 const first=useRef(true),runKey=useRef<string|null>(null);
 const selected=topics.find(t=>t.id===selectedId);
 const dirty=JSON.stringify(brief)!==baseline;
 const selectedRuns=runs.filter(r=>r.topicId===selectedId);
 const latestRun=selectedRuns[0]??null;
 const currentRun=selectedRuns.find(r=>r.versionId===selected?.versionId);
 const active=runs.filter(r=>r.status==="running"||r.status==="queued");
 const activate=useCallback((topic:Topic|null)=>{
   const original=topic?.brief??emptyBrief;let next=original;
   try{const raw=localStorage.getItem("content-workbench-draft:"+(topic?.id??"new"));
     if(raw){const parsed=briefSchema.safeParse(JSON.parse(raw));if(parsed.success)next=parsed.data;else{const draft=JSON.parse(raw);if(draft&&typeof draft.title==="string"&&typeof draft.angle==="string")next={...original,...draft};}}
   }catch{setMessage("浏览器中的草稿无法读取，已载入正式保存的版本");}
   setSelectedId(topic?.id??null);setBrief(next);setBaseline(JSON.stringify(original));
   setShowVersions(false);setVersions([]);setReady(true);setRetryChecked(false);runKey.current=null;
 },[]);
 const refresh=useCallback(async()=>{
   try{const data=await api<Workspace>("/api/workspace");setTopics(data.topics);setRuns(data.runs);setHealth(data.health);setNetworkError("");
     if(first.current){first.current=false;activate(data.topics[0]??null);}
   }catch(error){setNetworkError(error instanceof Error?error.message:"无法连接服务");}
 },[activate]);
 useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),3000);return()=>clearInterval(timer);},[refresh]);
 useEffect(()=>{const params=new URLSearchParams(window.location.search);if(params.get("auth")==="connected"){setView("settings");setMessage("ChatGPT 授权完成，请读取并选择可用模型");window.history.replaceState(null,"","/");}},[]);
 useEffect(()=>{if(!ready)return;try{localStorage.setItem("content-workbench-draft:"+(selectedId??"new"),JSON.stringify(brief));}catch{setMessage("浏览器草稿保存失败，请点击保存选题");}},[brief,selectedId,ready]);
 function field(key:keyof Brief,value:string){setBrief(old=>({...old,[key]:value}));setMessage("");}
 async function save(){
   const parsed=briefSchema.safeParse(brief);if(!parsed.success){setMessage(parsed.error.issues[0].message);return;}
   setAction("save");setMessage("");
   try{const data=await api<{topic:Topic}>("/api/topics",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topicId:selectedId??undefined,baseVersionId:selected?.versionId,brief:parsed.data})});
     setTopics(old=>[data.topic,...old.filter(t=>t.id!==data.topic.id)]);setSelectedId(data.topic.id);setBrief(data.topic.brief);setBaseline(JSON.stringify(data.topic.brief));setMessage("已保存为第 "+data.topic.revision+" 版");runKey.current=null;
   }catch(error){setMessage(error instanceof Error?error.message:"保存失败");}finally{setAction("");}
 }
 async function run(){
   if(!selected||dirty||!health?.ready)return;
   setAction("run");setMessage("");if(currentRun&&(currentRun.status==="failed"||currentRun.status==="needs_attention"))runKey.current=crypto.randomUUID();else runKey.current??=crypto.randomUUID();
   try{const data=await api<{run:Run}>("/api/runs",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":runKey.current},body:JSON.stringify({topicId:selected.id,versionId:selected.versionId})});
     setRuns(old=>[data.run,...old.filter(r=>r.id!==data.run.id)]);setRetryChecked(false);setMessage("评测任务已完成");await refresh();
   }catch(error){setMessage(error instanceof Error?error.message:"提交失败");}finally{setAction("");}
 }
 async function loadModels(){setAction("models");setMessage("");try{const data=await api<{models:AvailableModel[]}>("/api/auth/models");setModels(data.models);setMessage(data.models.length?"已读取当前账户可用模型":"当前账户未返回可展示模型");}catch(error){setMessage(error instanceof Error?error.message:"读取模型失败");}finally{setAction("");}}
 async function chooseModel(model:string){setAction("model");setMessage("");try{await api("/api/auth/models",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model})});await refresh();setMessage("已选择 "+model);}catch(error){setMessage(error instanceof Error?error.message:"模型选择失败");}finally{setAction("");}}
 async function signOut(){setAction("signout");setMessage("");try{await api("/api/auth/signout",{method:"POST"});setModels([]);await refresh();setMessage("已从本机工作台移除 ChatGPT 授权");}catch(error){setMessage(error instanceof Error?error.message:"退出失败");}finally{setAction("");}} async function loadVersions(){if(!selected)return;setAction("versions");try{const data=await api<{versions:typeof versions}>("/api/topics/"+selected.id+"/versions");setVersions(data.versions);setShowVersions(true);}catch(error){setMessage(String(error));}finally{setAction("");}}
 function download(){if(!selected)return;const blob=new Blob([JSON.stringify({topic:selected,runs:selectedRuns},null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="选题-"+selected.brief.title.slice(0,25)+".json";a.click();URL.revokeObjectURL(url);}
 return <div className="app-shell">
 <aside className="sidebar"><a className="brand" href="/"><span className="brand-mark">文</span><div>内容工坊<small>CONTENT ATELIER</small></div></a><div className="sidebar-caption">创作空间</div>
 <nav aria-label="主导航">{([["workbench","grid","选题工作台"],["roadmap","spark","创作流程"],["history","clock","运行记录"]] as const).map(([key,icon,label])=><button className={"nav-item "+(view===key?"active":"")} key={key} onClick={()=>setView(key)}><Icon name={icon}/>{label}{key==="workbench"&&<span className="nav-count">{topics.length}</span>}</button>)}</nav>
 <div className="sidebar-section-heading"><span>已保存的选题</span><button className="icon-button" aria-label="新建选题" onClick={()=>{activate(null);setView("workbench");setMessage("");}}><Icon name="plus" size={16}/></button></div>
 <div className="saved-topics">{topics.length===0?<p className="sidebar-empty">这里会收好你的想法。<br/>从右侧保存第一个选题。</p>:topics.map(t=><button key={t.id} className={"saved-topic "+(selectedId===t.id?"selected":"")} onClick={()=>{activate(t);setView("workbench");setMessage("");}}><span className="topic-dot"/><div><strong>{t.brief.title}</strong><small>{t.brief.platform} · 第 {t.revision} 版</small></div></button>)}</div>
 <div className="sidebar-bottom"><button className={"nav-item "+(view==="settings"?"active":"")} onClick={()=>setView("settings")}><Icon name="settings"/>连接与使用说明</button><div className="local-status"><span className="status-dot"/><div>本机私人工作台<small>想法与修改，留在自己的空间</small></div></div></div></aside>
 <main className="main-content"><header className="topbar"><span>我的工作空间 <span className="breadcrumb-slash">/</span> {view==="workbench"?"选题工作台":view==="history"?"运行记录":view==="roadmap"?"创作流程":"连接与使用说明"}</span><span className="topbar-tag"><span className={"status-dot "+(health?.ready?"":"muted")}/>{health?.ready?"ChatGPT 已连接":health?.authConnected?"选择模型":"授权待完成"}</span></header>
 {networkError&&<div className="connection-error" role="alert">{networkError} · 正在尝试重新连接，已有内容仍保留在页面。</div>}
 <div className="page-content">
 <div className="page-heading"><div><span className="eyebrow">A GOOD QUESTION COMES FIRST</span><h1>{view==="workbench"?"让好想法，成为好选题。":view==="history"?"每一次推敲，都有迹可循。":view==="roadmap"?"把创作，连成自己的流程。":"连接好工具，专注好内容。"}</h1><p>{view==="workbench"?"先说清读者的问题，再从五个维度打磨内容的起点。":view==="history"?"查看每次运行所依据的输入、状态与结果。":view==="roadmap"?"从一个选题开始，逐步走到可以发布的作品。":"配置只保留在本机后台，网页不接触授权令牌，连接凭据保存在本机用户保护区。"}</p></div>{view==="workbench"&&<button className="button button-light" onClick={()=>{activate(null);setMessage("");}}><Icon name="plus" size={16}/>新建选题</button>}</div>
 <div className="overview-row"><div><span className="stat-number">{String(topics.length).padStart(2,"0")}</span><span>已保存选题</span></div><div><span className="stat-number">{String(runs.filter(r=>r.status==="succeeded").length).padStart(2,"0")}</span><span>已完成评测</span></div><div><span className="stat-number">{String(active.length).padStart(2,"0")}</span><span>正在进行</span></div><p><span className="little-line"/>认真打磨每一个值得讲述的问题</p></div>
 {view==="workbench"?<>
 <div className="stage-strip" aria-label="创作流程">{stages.map((s,i)=><button key={s} className={i===0?"current":""} title={stageNotes[i]} onClick={()=>{if(i>0)setView("roadmap");}}><span>{String(i+1).padStart(2,"0")}</span>{s}{i<stages.length-1&&<b>·</b>}</button>)}</div>
 <div className="workbench-grid"><section className="editor-panel panel"><div className="panel-heading"><div><span className="eyebrow">YOUR IDEA</span><h2>{selected?"继续打磨这个选题":"记下一个新选题"}</h2></div><span className="version-label">{selected?"版本 "+selected.revision:"未保存"}</span></div>
 <form onSubmit={event=>{event.preventDefault();void save();}}><label htmlFor="title">选题标题 <span>必填</span></label><input id="title" value={brief.title} maxLength={120} placeholder="例如：为什么越累，越舍不得睡？" onChange={e=>field("title",e.target.value)}/>
 <div className="form-row"><div><label htmlFor="platform">内容平台</label><select id="platform" value={brief.platform} onChange={e=>field("platform",e.target.value)}><option>通用</option><option>小红书</option><option>微信公众号</option></select></div><div><label htmlFor="audience">写给谁看 <span>必填</span></label><input id="audience" value={brief.audience} maxLength={300} placeholder="尽量具体到一类读者" onChange={e=>field("audience",e.target.value)}/></div></div>
 <label htmlFor="angle">你想回答什么问题？ <span>必填</span></label><textarea id="angle" rows={5} value={brief.angle} maxLength={6000} placeholder="从什么场景切入？读者为什么关心？看完能带走什么？" onChange={e=>field("angle",e.target.value)}/>
 <label htmlFor="materials">已有资料与依据 <span>选填</span></label><textarea id="materials" rows={3} value={brief.materials} maxLength={10000} placeholder="粘贴资料摘要、来源链接或真实案例。没有资料也可以先记下。" onChange={e=>field("materials",e.target.value)}/>
 <label htmlFor="instructions">这次评测特别注意什么？ <span>选填</span></label><textarea id="instructions" rows={2} value={brief.instructions} maxLength={2000} placeholder="例如：保留现在的标题，重点看看内容是否太宽泛。" onChange={e=>field("instructions",e.target.value)}/>
 <div className="draft-status"><span className={"status-dot "+(dirty?"amber":"")}/>{dirty?"有未正式保存的修改":"当前内容已同步"}<span>草稿保存在此浏览器</span></div>
 <div className="form-actions"><button className="button button-light" type="submit" disabled={Boolean(action)}><Icon name="check" size={16}/>{action==="save"?"正在保存…":"保存选题"}</button><button className="button button-primary" type="button" disabled={!selected||dirty||!health?.ready||Boolean(action)||Boolean(currentRun&&(currentRun.status==="queued"||currentRun.status==="running"||currentRun.status==="succeeded"))||Boolean(currentRun?.status==="needs_attention"&&!retryChecked)} onClick={()=>void run()}>{action==="run"?"正在评测…":currentRun?.status==="succeeded"?"此版本已完成评测":currentRun&&(currentRun.status==="failed"||currentRun.status==="needs_attention")?"重新评测":"运行维度评测"}<Icon name="arrow" size={17}/></button></div>{currentRun?.status==="needs_attention"&&<label className="retry-check"><input type="checkbox" checked={retryChecked} onChange={event=>setRetryChecked(event.target.checked)}/>我已核对上次运行记录，了解再次评测可能继续使用订阅用量。</label>}
 {message&&<p className="form-message" role="status">{message}</p>}
 <div className="setup-note"><Icon name="spark" size={15}/><p>{dirty?"保存选题后，就可以针对当前版本进行评测。":health?.message??"正在读取连接状态…"}</p>{!health?.ready&&<button type="button" onClick={()=>setView("settings")}>查看配置</button>}</div>
 </form>
 {selected&&<div className="editor-footer"><button onClick={()=>void loadVersions()}><Icon name="clock" size={14}/>版本记录</button><button onClick={download}><Icon name="download" size={14}/>导出记录</button></div>}
 {showVersions&&<div className="versions"><h3>历史输入版本</h3>{versions.map(v=><div key={v.id}><span>第 {v.revision} 版 · {v.brief.title}</span><button onClick={()=>{setBrief(v.brief);setMessage("已载入旧版内容，保存后会创建新版本");}}>载入编辑</button></div>)}</div>}
 </section><AssessmentPanel run={latestRun} versionId={selected?.versionId}/></div></>:
 view==="history"?<section className="panel history-panel"><div className="panel-heading"><h2>运行记录</h2><span>{runs.length} 条</span></div>{runs.length===0?<div className="history-empty"><Icon name="clock" size={34}/><h3>还没有运行记录</h3><p>完成第一次评测后，输入版本、结果和运行状态都会保存在这里。</p></div>:runs.map(r=><button className="history-row" key={r.id} onClick={()=>{const topic=topics.find(t=>t.id===r.topicId);if(topic)activate(topic);setView("workbench");}}><div><strong>{topics.find(t=>t.id===r.topicId)?.brief.title??"历史选题"}</strong><small>{new Date(r.createdAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})} · {r.model}</small></div><span className={"pill "+r.status}>{({queued:"排队中",running:"评测中",succeeded:"已完成",failed:"失败",needs_attention:"需核对"})[r.status]}</span><Icon name="arrow"/></button>)}</section>:
 view==="roadmap"?<section className="panel roadmap-panel"><div className="panel-heading"><h2>从选题到成品</h2><span className="version-label">分阶段接入</span></div>{stages.map((s,i)=><div className="roadmap-row" key={s}><span className={"roadmap-index "+(i===0?"available":"")}>{String(i+1).padStart(2,"0")}</span><div><h3>{s}</h3><p>{stageNotes[i]}</p></div><span className={"pill "+(i===0?"succeeded":"queued")}>{i===0?"当前可用":"后续接入"}</span></div>)}<p className="roadmap-footnote">完整流程还包含来源记录、确认稿、图片样张、单页校正与导出。发布后的数据复盘与创作前选题评测分别处理。</p></section>:
 <section className="panel settings-panel"><div className="panel-heading"><h2>连接与使用说明</h2><span className="version-label">仅本机</span></div><div className="settings-state"><span className={"status-dot "+(health?.ready?"":"amber")}/><strong>{health?.message??"正在读取状态"}</strong></div><dl className="settings-list"><dt>ChatGPT 账户</dt><dd>{health?.accountName??"未登录"}</dd><dt>模型</dt><dd>{health?.model??"未选择"}</dd><dt>授权范围</dt><dd>{health?.authConnected?"ChatGPT 计划用量":"尚未授权"}</dd><dt>每日评测上限</dt><dd>{health?.maxDailyRuns??"—"} 次（本机 UTC 计数）</dd></dl><div className="setup-instructions"><h3>连接 ChatGPT</h3>{!health?.authConnected?<p><button className="button button-primary" type="button" onClick={()=>window.location.assign("/api/auth/login")}>Continue with ChatGPT</button></p>:<><p>已连接 {health.accountName}。令牌保存在 Windows 当前用户保护的本机凭据文件中。</p><div className="form-row"><button className="button button-light" type="button" disabled={Boolean(action)} onClick={()=>void loadModels()}>{action==="models"?"正在读取…":"读取可用模型"}</button>{models.length>0&&<select aria-label="选择 GPT 模型" value={health.model??""} onChange={event=>void chooseModel(event.target.value)}><option value="">选择模型</option>{models.map(model=><option key={model.slug} value={model.slug}>{model.display_name}</option>)}</select>}</div><button className="text-button" type="button" disabled={Boolean(action)} onClick={()=>void signOut()}>从本机工作台退出</button></>}{message&&<p className="form-message" role="status">{message}</p>}<p>此连接使用你的 ChatGPT 计划用量。OAuth 目前不支持图像生成；图像生成需要另接 OpenAI API Key，且 API 费用与 Plus 分开计算。令牌不会进入浏览器存储。</p><h3>现在可以体验</h3><p>保存选题和版本不需要授权。评测会在 GPT 返回完整结果并核对 Skill 文件回执后才记为成功。</p></div></section>}
 <footer className="page-footer"><span>内容工坊 / 从问题出发</span><span>每一次修改，都值得留下。</span></footer>
 </div></main></div>;
}
