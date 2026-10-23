export function readConfig() {
  const maxDailyRuns=Number(process.env.OPENAI_MAX_DAILY_RUNS??"3");
  if(!Number.isSafeInteger(maxDailyRuns)||maxDailyRuns<1||maxDailyRuns>100)throw new Error("OPENAI_MAX_DAILY_RUNS 必须为 1 到 100 的整数");
  return {maxDailyRuns};
}
