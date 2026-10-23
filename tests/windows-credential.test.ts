import assert from "node:assert/strict";
import test from "node:test";
import { protect, unprotect } from "../src/lib/auth";

test("Windows credential protection preserves credential JSON across separate PowerShell processes",{skip:process.platform!=="win32"},async()=>{
  const values=[
    JSON.stringify({clientId:"diagnostic-client",accessToken:"diagnostic-only"}),
    JSON.stringify({email:"测试用户@example.test",refreshToken:"diagnostic-"+"x".repeat(16000)}),
  ];
  for(const value of values){
    const encrypted=await protect(value);
    assert.notEqual(encrypted,value);
    assert.equal(await unprotect(encrypted),value);
  }
});
