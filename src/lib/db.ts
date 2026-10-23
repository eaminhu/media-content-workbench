import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { AppError, type Assessment, type Brief, type Run, type RunStatus, type Topic } from "./contracts";

type Row = Record<string, unknown>;
export function createStore(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY, current_version_id TEXT, revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS content_versions (
      id TEXT PRIMARY KEY, topic_id TEXT NOT NULL REFERENCES topics(id),
      parent_id TEXT REFERENCES content_versions(id), revision INTEGER NOT NULL,
      brief_json TEXT NOT NULL, brief_hash TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(topic_id, revision)
    );
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY, topic_id TEXT NOT NULL REFERENCES topics(id),
      version_id TEXT NOT NULL REFERENCES content_versions(id),
      idempotency_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed','needs_attention')),
      model TEXT NOT NULL, skill_hash TEXT NOT NULL, result_json TEXT, error TEXT,
      response_id TEXT, usage_json TEXT, read_verified INTEGER NOT NULL DEFAULT 0,
      submission_started INTEGER NOT NULL DEFAULT 0, lease_owner TEXT, lease_until INTEGER,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS runs_claim ON runs(status, lease_until, created_at);
    CREATE TABLE IF NOT EXISTS skill_uploads (
      hash TEXT PRIMARY KEY, skill_id TEXT NOT NULL, version TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workers (id TEXT PRIMARY KEY, heartbeat INTEGER NOT NULL);
  `);
  function tx<T>(fn: () => T): T {
    db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  function topicRow(row: Row): Topic {
    return { id: String(row.id), versionId: String(row.current_version_id), revision: Number(row.revision),
      brief: JSON.parse(String(row.brief_json)) as Brief, updatedAt: String(row.updated_at) };
  }
  function runRow(row: Row): Run {
    return {
      id: String(row.id), topicId: String(row.topic_id), versionId: String(row.version_id),
      status: row.status as RunStatus, model: String(row.model), skillHash: String(row.skill_hash),
      result: row.result_json ? JSON.parse(String(row.result_json)) as Assessment : null,
      error: row.error ? String(row.error) : null, responseId: row.response_id ? String(row.response_id) : null,
      usage: row.usage_json ? JSON.parse(String(row.usage_json)) : null,
      skillReadVerified: row.read_verified === 1, createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    };
  }
  const api = {
    close: () => db.close(),
    listTopics: () => (db.prepare(`SELECT t.*, v.brief_json FROM topics t JOIN content_versions v
      ON v.id=t.current_version_id ORDER BY t.updated_at DESC`).all() as Row[]).map(topicRow),
    getTopic(id: string) {
      const row = db.prepare(`SELECT t.*,v.brief_json FROM topics t JOIN content_versions v
        ON v.id=t.current_version_id WHERE t.id=?`).get(id) as Row | undefined;
      if (!row) throw new AppError(404, "选题不存在");
      return topicRow(row);
    },
    saveTopic(brief: Brief, id?: string, baseVersionId?: string): Topic {
      return tx(() => {
        const now = new Date().toISOString(), topicId = id ?? randomUUID();
        const old = id ? api.getTopic(id) : null;
        if (old && old.versionId !== baseVersionId) throw new AppError(409, "该选题已更新，请重新载入后再保存");
        const json = JSON.stringify(brief), hash = createHash("sha256").update(json).digest("hex");
        if (old && JSON.stringify(old.brief) === json) return old;
        if (!old) db.prepare("INSERT INTO topics(id,updated_at) VALUES (?,?)").run(topicId, now);
        const versionId = randomUUID(), revision = (old?.revision ?? 0) + 1;
        db.prepare(`INSERT INTO content_versions(id,topic_id,parent_id,revision,brief_json,brief_hash,created_at)
          VALUES (?,?,?,?,?,?,?)`).run(versionId, topicId, old?.versionId ?? null, revision, json, hash, now);
        db.prepare("UPDATE topics SET current_version_id=?,revision=?,updated_at=? WHERE id=?")
          .run(versionId, revision, now, topicId);
        return api.getTopic(topicId);
      });
    },
    getVersion(versionId: string): { brief: Brief; revision: number } {
      const row = db.prepare("SELECT brief_json,revision FROM content_versions WHERE id=?").get(versionId) as Row | undefined;
      if (!row) throw new AppError(404, "输入版本不存在");
      return { brief: JSON.parse(String(row.brief_json)), revision: Number(row.revision) };
    },
    listVersions(topicId: string) {
      return (db.prepare("SELECT id,revision,created_at,brief_json FROM content_versions WHERE topic_id=? ORDER BY revision DESC")
        .all(topicId) as Row[]).map(r => ({ id: String(r.id), revision: Number(r.revision), createdAt: String(r.created_at),
          brief: JSON.parse(String(r.brief_json)) as Brief }));
    },
    reconcileInterruptedRuns(maxAgeMs=180000) {
      const threshold=new Date(Date.now()-maxAgeMs).toISOString();
      const now=new Date().toISOString();
      db.prepare("UPDATE runs SET status='needs_attention',error=?,updated_at=? WHERE status='running' AND updated_at<?")
        .run("网页服务在流式评测期间中断，结果状态未知。已保留 response ID，请核对后再发起新评测。",now,threshold);
    },    listRuns() { return (db.prepare("SELECT * FROM runs ORDER BY created_at DESC LIMIT 100").all() as Row[]).map(runRow); },
    getRun(id: string) {
      const row = db.prepare("SELECT * FROM runs WHERE id=?").get(id) as Row | undefined;
      if (!row) throw new AppError(404, "运行记录不存在");
      return runRow(row);
    },
    enqueue(input: { topicId: string; versionId: string; key: string; model: string; skillHash: string; limit: number }) {
      return tx(() => {
        const existing = db.prepare("SELECT * FROM runs WHERE idempotency_key=?").get(input.key) as Row | undefined;
        if (existing) {
          if (existing.topic_id !== input.topicId || existing.version_id !== input.versionId)
            throw new AppError(409, "重复请求标识与原输入不一致");
          return runRow(existing);
        }
        const topic = api.getTopic(input.topicId);
        if (topic.versionId !== input.versionId) throw new AppError(409, "选题已修改，请使用最新保存的版本");
        const active = db.prepare("SELECT id FROM runs WHERE topic_id=? AND version_id=? AND status IN ('queued','running')")
          .get(input.topicId, input.versionId);
        if (active) throw new AppError(409, "该版本已有评测任务，请等待结果");
        const startOfDay = new Date().toISOString().slice(0, 10);
        const count = db.prepare("SELECT COUNT(*) AS n FROM runs WHERE created_at >= ?").get(startOfDay) as Row;
        if (Number(count.n) >= input.limit) throw new AppError(429, "已达到当天的评测次数上限（UTC 日界线）");
        const id = randomUUID(), now = new Date().toISOString();
        db.prepare(`INSERT INTO runs(id,topic_id,version_id,idempotency_key,status,model,skill_hash,created_at,updated_at)
          VALUES (?,?,?,?,'queued',?,?,?,?)`).run(id,input.topicId,input.versionId,input.key,input.model,input.skillHash,now,now);
        return api.getRun(id);
      });
    },
    startRun(id: string) {
      const now=new Date().toISOString(),owner=randomUUID();
      const changed=db.prepare("UPDATE runs SET status='running',lease_owner=?,lease_until=?,updated_at=? WHERE id=? AND status='queued'")
        .run(owner,Date.now()+120000,now,id);
      return changed.changes===1;
    },
    recordResponseId(id: string, responseId: string) {
      const result=db.prepare("UPDATE runs SET response_id=?,updated_at=? WHERE id=? AND status='running'")
        .run(responseId,new Date().toISOString(),id);
      if(result.changes!==1)throw new Error("评测任务状态已变化，停止写入");
    },    finishRun(id: string, patch: {status: RunStatus; error?: string; responseId?: string | null; result?: Assessment; usage?: unknown; readVerified?: boolean}) {
      const entries: [string,string|number|null][]=[["status",patch.status]];
      if(patch.error!==undefined)entries.push(["error",patch.error]);
      if(patch.responseId!==undefined)entries.push(["response_id",patch.responseId]);
      if(patch.result!==undefined)entries.push(["result_json",JSON.stringify(patch.result)]);
      if(patch.usage!==undefined)entries.push(["usage_json",JSON.stringify(patch.usage)]);
      if(patch.readVerified!==undefined)entries.push(["read_verified",patch.readVerified?1:0]);
      entries.push(["updated_at",new Date().toISOString()]);
      const result=db.prepare("UPDATE runs SET "+entries.map(([key])=>key+"=?").join(",")+" WHERE id=? AND status='running'")
        .run(...entries.map(([,value])=>value),id);
      if(result.changes!==1)throw new Error("评测任务状态已变化，停止写入");
      return api.getRun(id);
    },    heartbeat(id: string) {
      db.prepare("INSERT INTO workers(id,heartbeat) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET heartbeat=excluded.heartbeat")
        .run(id,Date.now());
    },
    workerConnected() {
      return Boolean(db.prepare("SELECT id FROM workers WHERE heartbeat>? LIMIT 1").get(Date.now()-20000));
    },
    claim(owner: string, now=Date.now()): Run | null {
      return tx(() => {
        db.prepare(`UPDATE runs SET status='needs_attention',error=?,updated_at=?
          WHERE status='running' AND lease_until<? AND submission_started=1 AND response_id IS NULL`)
          .run("提交后失去连接，无法确认是否产生费用。请先在供应商端核对，勿直接重试。",new Date().toISOString(),now);
        const row=db.prepare(`SELECT * FROM runs WHERE status='queued' OR
          (status='running' AND lease_until<? AND (response_id IS NOT NULL OR submission_started=0))
          ORDER BY created_at LIMIT 1`).get(now) as Row | undefined;
        if(!row) return null;
        db.prepare("UPDATE runs SET status='running',lease_owner=?,lease_until=?,updated_at=? WHERE id=?")
          .run(owner,now+60000,new Date().toISOString(),String(row.id));
        return api.getRun(String(row.id));
      });
    },
    updateOwned(id: string, owner: string, patch: {
      status?: RunStatus; error?: string; responseId?: string; result?: Assessment; usage?: unknown;
      readVerified?: boolean; submissionStarted?: boolean;
    }) {
      const entries: [string, string | number | null][] = [];
      if(patch.status) entries.push(["status",patch.status]);
      if(patch.error !== undefined) entries.push(["error",patch.error]);
      if(patch.responseId) entries.push(["response_id",patch.responseId]);
      if(patch.result) entries.push(["result_json",JSON.stringify(patch.result)]);
      if(patch.usage !== undefined) entries.push(["usage_json",JSON.stringify(patch.usage)]);
      if(patch.readVerified !== undefined) entries.push(["read_verified",patch.readVerified?1:0]);
      if(patch.submissionStarted !== undefined) entries.push(["submission_started",patch.submissionStarted?1:0]);
      entries.push(["updated_at",new Date().toISOString()],["lease_until",Date.now()+60000]);
      const result=db.prepare("UPDATE runs SET "+entries.map(([key])=>key+"=?").join(",")+" WHERE id=? AND lease_owner=? AND status='running'")
        .run(...entries.map(([,value])=>value),id,owner);
      if(result.changes!==1) throw new Error("任务租约已转移，停止写入");
    },
    renew(id: string, owner: string) {
      const r=db.prepare("UPDATE runs SET lease_until=? WHERE id=? AND lease_owner=? AND status='running'")
        .run(Date.now()+60000,id,owner);
      return r.changes===1;
    },
    skillUpload(hash: string) {
      const row=db.prepare("SELECT skill_id,version FROM skill_uploads WHERE hash=?").get(hash) as Row|undefined;
      return row ? {id:String(row.skill_id),version:String(row.version)} : null;
    },
    cacheSkill(hash: string,id: string,version: string) {
      db.prepare("INSERT INTO skill_uploads(hash,skill_id,version) VALUES (?,?,?) ON CONFLICT(hash) DO NOTHING").run(hash,id,version);
    },
  };
  return api;
}
export type Store = ReturnType<typeof createStore>;
let singleton: Store | undefined;
export function getStore() { return singleton ??= createStore(join(process.cwd(),"data","workbench.sqlite")); }
