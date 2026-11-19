// The bridge between a sandboxed generated app (iframe, opaque origin) and Kozzi's
// data API. The iframe gets a tiny `kozzi` SDK that postMessages the parent; the
// parent performs the real API call and posts the result back.
import { apiDelete, apiGet, apiPatch, apiPost, errorMessage } from "@/lib/api";
import type { AiOut, EmailOut, RecordOut } from "@/lib/types";

export type RuntimeTarget = { kind: "owner"; projectId: string } | { kind: "public"; slug: string };

const SDK = `<script>(function(){
var pending={},seq=0;
function call(op,args){return new Promise(function(res,rej){var id=++seq;pending[id]={res:res,rej:rej};parent.postMessage({__kozzi:1,id:id,op:op,args:args},"*");});}
window.addEventListener("message",function(e){var d=e.data;if(!d||!d.__kozziRes)return;var p=pending[d.id];if(!p)return;delete pending[d.id];if(d.ok)p.res(d.result);else p.rej(new Error(d.error||"Request failed"));});
window.kozzi={ready:Promise.resolve(true),db:{
list:function(t){return call("list",{table:t});},
get:function(t,id){return call("get",{table:t,id:id});},
insert:function(t,f){return call("insert",{table:t,data:f||{}});},
update:function(t,id,f){return call("update",{table:t,id:id,data:f||{}});},
remove:function(t,id){return call("remove",{table:t,id:id});}},
ai:{ask:function(p,s){return call("ai",{prompt:String(p),system:s?String(s):""});}},
email:{notifyOwner:function(s,m){return call("notify",{subject:String(s||"").slice(0,120),message:String(m||"").slice(0,2000)});},
sendReceipt:function(t,id){return call("receipt",{table:t,id:id});}}};
window.addEventListener("error",function(e){parent.postMessage({__kozziLog:1,message:String(e.message||"Script error")},"*");});
window.addEventListener("unhandledrejection",function(e){parent.postMessage({__kozziLog:1,message:String((e.reason&&e.reason.message)||e.reason||"Unhandled error")},"*");});
})();</script>`;

export function buildSrcDoc(html: string): string {
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}${SDK}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${SDK}</head>`);
  return `${SDK}${html}`;
}

function flat(r: RecordOut) {
  return { ...r.data, id: r.id, created_at: r.created_at, updated_at: r.updated_at };
}

interface Args {
  table?: string;
  id?: string;
  data?: Record<string, unknown>;
  prompt?: string;
  system?: string;
  subject?: string;
  message?: string;
}

const enc = encodeURIComponent;

export async function handleOp(target: RuntimeTarget, op: string, args: Args): Promise<unknown> {
  const base = target.kind === "owner" ? `/projects/${target.projectId}` : `/public/apps/${enc(target.slug)}`;
  const t = `${base}/tables/${enc(args.table ?? "")}/records`;
  switch (op) {
    case "list":
      return (await apiGet<RecordOut[]>(t)).map(flat);
    case "get":
      try {
        return flat(await apiGet<RecordOut>(`${t}/${enc(args.id ?? "")}`));
      } catch {
        return null;
      }
    case "insert":
      return flat(await apiPost<RecordOut>(t, { data: args.data ?? {} }));
    case "update":
      return flat(await apiPatch<RecordOut>(`${t}/${enc(args.id ?? "")}`, { data: args.data ?? {} }));
    case "remove":
      await apiDelete(`${t}/${enc(args.id ?? "")}`);
      return true;
    case "ai":
      return (await apiPost<AiOut>(`${base}/ai`, { prompt: args.prompt, system: args.system ?? "" })).text;
    case "notify":
      return (await apiPost<EmailOut>(`${base}/email/notify`, { subject: args.subject, message: args.message })).ok;
    case "receipt":
      return (await apiPost<EmailOut>(`${base}/email/receipt`, { table: args.table, record_id: args.id })).ok;
    default:
      throw new Error(`Unknown operation ${op}`);
  }
}

export const WRITE_OPS = new Set(["insert", "update", "remove", "notify", "receipt"]);
export { errorMessage };
