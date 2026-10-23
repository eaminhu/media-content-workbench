import { getAuthStatus } from "./auth";
import { readConfig } from "./config";
import type { Health } from "./contracts";
export async function getHealth():Promise<Health>{
  const [auth,config]=await Promise.all([getAuthStatus(),Promise.resolve(readConfig())]);
  const ready=Boolean(auth.connected&&auth.model);
  let message="GPT 已准备就绪，可运行真实选题评测";
  if(!auth.connected)message="请先使用 ChatGPT 授权登录；选题仍可正常保存";
  else if(!auth.model)message="请读取并选择当前账户可用模型";
  return {ready,authConnected:auth.connected,accountName:auth.email,model:auth.model,
    maxDailyRuns:config.maxDailyRuns,message};
}
