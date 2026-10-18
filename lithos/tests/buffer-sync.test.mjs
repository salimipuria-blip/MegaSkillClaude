import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/buffer-sync.js';

// Stand-ins for Supabase auth, the Buffer GraphQL API and Supabase RPC.
function mockFetch(calls){
  return async(url,o={})=>{
    calls.push({url,body:o.body?JSON.parse(o.body):null,signal:o.signal});
    if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'u1',email:'Owner@Lithos.test'}),{status:200});
    if(url==='https://api.buffer.com')return new Response(JSON.stringify({data:{account:{channels:[{id:'c1',name:'ig',metrics:[{type:'followers',value:'1200.6'},{type:'reach',value:50}]}]}}}),{status:200});
    if(url.includes('/rest/v1/rpc/'))return new Response('42',{status:200});
    throw new Error('unexpected fetch '+url);
  };
}
const res=()=>({statusCode:0,body:null,status(n){this.statusCode=n;return this},json(v){this.body=v;return this}});
const post=(headers={authorization:'Bearer session'})=>({method:'POST',headers});
// Every test runs as the allowlisted owner unless it overrides LITHOS_OWNER_EMAILS itself.
process.env.LITHOS_OWNER_EMAILS='someone@else.test, owner@lithos.test';

test('sync persists through lithos_ingest_buffer_snapshot with integer counts',async t=>{
  const calls=[];t.mock.method(globalThis,'fetch',mockFetch(calls));
  process.env.BUFFER_API_KEY='buffer-test';t.after(()=>{delete process.env.BUFFER_API_KEY});
  const r=res();await handler(post(),r);
  assert.equal(r.statusCode,200);assert.equal(r.body.snapshotId,42);
  const rpc=calls.filter(c=>c.url.includes('/rpc/'));
  assert.deepEqual(rpc.map(c=>c.url.split('/rpc/')[1]),['lithos_ingest_buffer_snapshot']);
  const p=rpc[0].body.p_payload;
  assert.equal(p.followers,1201);assert.equal(p.reach,50);assert.equal(p.channel_id,'c1');assert.equal(p.followers_supported,true);
});

test('missing Buffer key records the error with lithos_set_buffer_sync_state',async t=>{
  const calls=[];t.mock.method(globalThis,'fetch',mockFetch(calls));
  delete process.env.BUFFER_API_KEY;
  const r=res();await handler(post(),r);
  assert.equal(r.statusCode,500);
  const rpc=calls.find(c=>c.url.includes('/rpc/'));
  assert.ok(rpc.url.endsWith('/rpc/lithos_set_buffer_sync_state'));
  assert.equal(rpc.body.p_status,'error');assert.match(rpc.body.p_error,/BUFFER_API_KEY/);
});

test('requests without a session or with the wrong method are refused',async t=>{
  t.mock.method(globalThis,'fetch',mockFetch([]));
  let r=res();await handler(post({}),r);assert.equal(r.statusCode,401);
  r=res();await handler({method:'GET',headers:{}},r);assert.equal(r.statusCode,405);
});

test('an empty Buffer response is refused instead of persisting a zero snapshot',async t=>{
  const calls=[];
  t.mock.method(globalThis,'fetch',async(url,o={})=>{
    calls.push({url,body:o.body?JSON.parse(o.body):null});
    if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'u1',email:'owner@lithos.test'}),{status:200});
    if(url==='https://api.buffer.com')return new Response(JSON.stringify({data:{account:{channels:[]}}}),{status:200});
    if(url.includes('/rest/v1/rpc/'))return new Response('42',{status:200});
    throw new Error('unexpected fetch '+url);
  });
  process.env.BUFFER_API_KEY='buffer-test';t.after(()=>{delete process.env.BUFFER_API_KEY});
  const r=res();await handler(post(),r);
  assert.equal(r.statusCode,502);
  assert.equal(r.body.code,'BUFFER_SHAPE_UNVERIFIED');
  const rpcs=calls.filter(c=>c.url.includes('/rpc/'));
  assert.deepEqual(rpcs.map(c=>c.url.split('/rpc/')[1]),['lithos_set_buffer_sync_state']);
  assert.equal(rpcs[0].body.p_status,'error');
  assert.ok(!calls.some(c=>c.url.includes('lithos_ingest_buffer_snapshot')),'no snapshot may be written');
});

test('a valid session that is not an owner never reaches Buffer or the RPCs',async t=>{
  const calls=[];
  t.mock.method(globalThis,'fetch',async(url,o={})=>{
    calls.push(url);
    if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'u2',email:'intruder@x.test'}),{status:200});
    throw new Error('must not be called: '+url);
  });
  process.env.BUFFER_API_KEY='buffer-test';t.after(()=>{delete process.env.BUFFER_API_KEY});
  const r=res();await handler(post(),r);
  assert.equal(r.statusCode,403);assert.equal(r.body.error,'Not a Lithos owner');
  assert.deepEqual(calls.map(u=>u.split('.co')[1]),['/auth/v1/user']);
});

test('without LITHOS_OWNER_EMAILS the endpoint fails closed',async t=>{
  const calls=[];t.mock.method(globalThis,'fetch',mockFetch(calls));
  const saved=process.env.LITHOS_OWNER_EMAILS;delete process.env.LITHOS_OWNER_EMAILS;
  t.after(()=>{process.env.LITHOS_OWNER_EMAILS=saved});
  const r=res();await handler(post(),r);
  assert.equal(r.statusCode,403);assert.match(r.body.error,/LITHOS_OWNER_EMAILS/);
  assert.ok(!calls.some(c=>c.url==='https://api.buffer.com'||c.url.includes('/rpc/')));
});

test('Supabase auth being unreachable is a 503, not a sign-in-again 401',async t=>{
  t.mock.method(globalThis,'fetch',async()=>{throw new TypeError('fetch failed')});
  const r=res();await handler(post(),r);
  assert.equal(r.statusCode,503);assert.match(r.body.error,/unreachable/);
});

test('every outbound call carries an abort deadline',async t=>{
  const calls=[];t.mock.method(globalThis,'fetch',mockFetch(calls));
  process.env.BUFFER_API_KEY='buffer-test';t.after(()=>{delete process.env.BUFFER_API_KEY});
  const r=res();await handler(post(),r);
  assert.equal(r.statusCode,200);
  assert.equal(calls.length,3);
  for(const c of calls)assert.ok(c.signal instanceof AbortSignal,'no deadline on '+c.url);
});
