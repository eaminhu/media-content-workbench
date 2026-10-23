import assert from "node:assert/strict";
import test from "node:test";
import { parseModelCatalog } from "../src/lib/auth";
import { AppError } from "../src/lib/contracts";

test("OAuth catalog keeps visible models, display names and server ordering without a name-prefix filter",()=>{
  assert.deepEqual(parseModelCatalog({models:[
    {slug:"z-model",display_name:"Preferred Model",visibility:"list",extra:"ignored"},
    {slug:"gpt-hidden",display_name:"Hidden Model",visibility:"hide"},
    {slug:"a-model",display_name:"Another Model",visibility:"list"},
  ]}),[
    {slug:"z-model",display_name:"Preferred Model"},
    {slug:"a-model",display_name:"Another Model"},
  ]);
});

test("API-key catalog format fails explicitly rather than becoming an empty model list",t=>{
  const log=t.mock.method(console,"error",()=>{});
  assert.throws(()=>parseModelCatalog({data:[{id:"gpt-test"}]}),error=>error instanceof AppError&&error.status===502);
  assert.equal(JSON.parse(log.mock.calls[0].arguments[0]).event,"oauth_model_catalog_invalid");
});

test("Malformed OAuth model entries fail explicitly",t=>{
  t.mock.method(console,"error",()=>{});
  assert.throws(()=>parseModelCatalog({models:[{slug:"model",visibility:"list"}]}),error=>error instanceof AppError&&error.status===502);
});

test("Valid catalogs without visible models remain empty and log the empty catalog",t=>{
  const log=t.mock.method(console,"warn",()=>{});
  assert.deepEqual(parseModelCatalog({models:[]}),[]);
  assert.deepEqual(parseModelCatalog({models:[{slug:"hidden",display_name:"Hidden",visibility:"hide"}]}),[]);
  assert.equal(log.mock.calls.length,2);
});
