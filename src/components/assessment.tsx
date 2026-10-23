import {dimensionDefinitions,type Run} from "@/lib/contracts";
import {Icon} from "./icon";
const statuses={queued:"排队中",running:"评测中",succeeded:"已完成",failed:"运行失败",needs_attention:"需要核对"};
export function AssessmentPanel({run,versionId}:{run:Run|null;versionId?:string}){
const result=run?.result;
return <section className="result-panel panel">
<div className="panel-heading"><div><span className="eyebrow">EDITORIAL REVIEW</span><h2>换一个角度，看清选题</h2></div><span className="small-icon"><Icon name="spark" size={21}/></span></div>
{!run?<div className="empty-review"><div className="abstract-chart">{[36,68,46,86,59].map((h,i)=><span key={i} style={{height:h+"px"}}/>)}</div><h3>好选题，值得仔细推敲</h3><p>先使用 ChatGPT 授权登录并保存选题，再运行维度评测。<br/>每一项判断，都附上理由和可执行的建议。</p><div className="dimension-preview">{dimensionDefinitions.map((d,i)=><div key={d.id}><span className="dimension-number">0{i+1}</span><div><strong>{d.label}</strong><small>{d.description}</small></div><span className="empty-dot"/></div>)}</div><div className="review-note">评分帮助发现短板，不代表流量预测。</div></div>:
<div className="assessment-content">
<div className="run-banner"><span className={"pill "+run.status}>{statuses[run.status]}</span><span>{new Date(run.createdAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</span></div>
{versionId!==run.versionId&&<p className="notice">这份评测基于旧版选题，请结合当前稿件复核。</p>}
{run.error&&<div className="error-box" role="alert">{run.error}</div>}
{["queued","running"].includes(run.status)&&<div className="processing"><div className="loading-ring"/><h3>正在从五个维度阅读你的选题</h3><p>可以继续浏览，任务记录会保留。</p></div>}
{result&&<><h3 className="verdict">{result.verdict}</h3><p className="summary">{result.summary}</p><div className="score-list">{dimensionDefinitions.map(d=>{const item=result.dimensions.find(x=>x.id===d.id);if(!item)return null;return <div className="score-item" key={d.id}><div className="score-title"><strong>{d.label}</strong><span><b>{item.score}</b> / 5</span></div><div className="score-track"><span style={{width:(item.score*20)+"%"}}/></div><p>{item.reason}</p><div className="action-note">{item.action}</div></div>;})}</div>
{[["值得保留",result.strengths],["需要留意",result.risks],["还需补充",result.missingEvidence]].map(([title,items])=><div className="result-section" key={title as string}><h4>{title as string}</h4><ul>{(items as string[]).map((s,i)=><li key={i}>{s}</li>)}</ul></div>)}<div className="next-step"><strong>下一步</strong><p>{result.nextStep}</p></div></>}
<details className="run-details"><summary>运行记录</summary><dl><dt>模型</dt><dd>{run.model}</dd><dt>输入版本</dt><dd>{run.versionId}</dd><dt>Skill 版本指纹</dt><dd>{run.skillHash.slice(0,16)}</dd><dt>读取证据</dt><dd>{run.skillReadVerified?"已核对文件读取回执":"尚未验证"}</dd><dt>GPT 响应</dt><dd>{run.responseId??"尚未创建"}</dd></dl></details>
</div>}
</section>;
}
