const U='https://aupkeramhsufnmhkbihl.supabase.co';
const K='sb_publishable_iGffpPBxQqUNzNn-dVANOQ_NxXJebC-';

async function gql(key,query,variables={}) {
  const r=await fetch('https://api.buffer.com',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({query,variables})});
  const p=await r.json().catch(()=>({}));
  if(!r.ok||p.errors?.length) throw new Error(p.errors?.[0]?.message||('Buffer API '+r.status));
  return p.data;
}
async function rpc(name,args,token){
  const r=await fetch(U+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:K,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(args||{})});
  const t=await r.text();
  if(!r.ok){let m=t;try{m=JSON.parse(t)?.message||t}catch{}throw new Error(m||('Supabase RPC '+r.status))}
  if(!t)return null;try{return JSON.parse(t)}catch{return t}
}
async function validate(token){
  const r=await fetch(U+'/auth/v1/user',{headers:{apikey:K,Authorization:'Bearer '+token}});
  if(!r.ok) throw new Error('Lithos session expired. Sign in again.');
}
const val=(m,t)=>Number((m||[]).find(x=>x.type===t)?.value??0);

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'POST only'});
  const h=req.headers.authorization||'',token=h.startsWith('Bearer ')?h.slice(7):'';
  if(!token) return res.status(401).json({error:'Missing Lithos session'});
  try{await validate(token)}catch(e){return res.status(401).json({error:e.message||'Lithos session invalid'})}

  // ============================================================================
  // RECONSTRUCTED TAIL — the original body past this point was lost during source
  // recovery. Persistence uses the RPCs that exist in the Lithos Supabase project:
  //   lithos_ingest_buffer_snapshot(p_payload jsonb)  -> inserts the snapshot (the whole
  //     payload is kept as `metadata`) and marks the buffer source 'connected'
  //   lithos_set_buffer_sync_state(p_status text, p_error text)
  // Still UNVERIFIED: the Buffer GraphQL query and metric `type` keys below.
  // ============================================================================
  const markError=async message=>{try{await rpc('lithos_set_buffer_sync_state',{p_status:'error',p_error:String(message).slice(0,500)},token)}catch{}};
  const bufferKey=process.env.BUFFER_API_KEY;
  if(!bufferKey){
    await markError('BUFFER_API_KEY not configured');
    return res.status(500).json({error:'BUFFER_API_KEY not configured'});
  }
  try{
    // TODO(verify): exact Buffer GraphQL query and response shape.
    const data=await gql(bufferKey,'query { account { channels { id name metrics { type value } } } }');
    const channel=data?.account?.channels?.[0]||{};
    const metrics=Array.isArray(channel.metrics)?channel.metrics:[];
    // A generated dashboard must never show invented numbers. When the (still unverified) query
    // returns no channel or no metrics, writing the snapshot would store zeros and mark the source
    // 'connected' - indistinguishable from a real drop to zero. Refuse and keep the error visible.
    if(!channel.id||!metrics.length){
      const detail='Buffer returned no channel metrics; the GraphQL query or token scope is unverified';
      await markError(detail);
      return res.status(502).json({error:detail,code:'BUFFER_SHAPE_UNVERIFIED',received:{channels:Array.isArray(data?.account?.channels)?data.account.channels.length:0}});
    }
    const payload={
      captured_at:new Date().toISOString(),
      channel_id:channel.id??null,
      channel_name:channel.name??null,
      // Count columns are integer in Postgres; a fractional value would fail the insert.
      followers:Math.round(val(metrics,'followers')),
      reach:Math.round(val(metrics,'reach')),
      impressions:Math.round(val(metrics,'impressions')),
      saves:Math.round(val(metrics,'saves')),
      shares:Math.round(val(metrics,'shares')),
      comments:Math.round(val(metrics,'comments')),
      engagement_rate:val(metrics,'engagement_rate'),
      avg_watch_time_seconds:val(metrics,'avg_watch_time_seconds'),
      // The dashboard hides the follower count when Buffer does not report it.
      followers_supported:metrics.some(x=>x.type==='followers')
    };
    const snapshotId=await rpc('lithos_ingest_buffer_snapshot',{p_payload:payload},token);
    return res.status(200).json({ok:true,snapshotId,snapshot:payload});
  }catch(e){
    await markError(e.message||'Buffer sync failed');
    return res.status(502).json({error:e.message||'Buffer sync failed'});
  }
}
