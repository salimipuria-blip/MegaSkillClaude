const API='https://api.github.com';
const VER='2026-03-10';
const H={'Content-Type':'application/json','Cache-Control':'no-store'};
const out=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:H});
const tok=()=>Deno.env.get('GITHUB_ADMIN_TOKEN')?.trim()||'';
async function gh(path:string,init:RequestInit={}){
  const token=tok(); if(!token) throw new Error('GITHUB_ADMIN_TOKEN is not configured');
  const r=await fetch(API+path,{...init,headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':VER,'User-Agent':'porya-omni-github-admin',Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(init.headers||{})}});
  const text=await r.text(); let data:any=null; try{data=text?JSON.parse(text):null}catch{data={raw:text.slice(0,2000)}}
  if(!r.ok) throw new Error(`GitHub HTTP ${r.status}: ${data?.message||text.slice(0,700)}`);
  return {status:r.status,data};
}
function reqStr(v:any,n:string){if(typeof v!=='string'||!v.trim())throw new Error(`${n} is required`);return v.trim()}
Deno.serve(async(req)=>{
 try{
  let b:any={}; if(req.method!=='GET'){try{b=await req.json()}catch{}}
  const u=new URL(req.url); const a=b.action||u.searchParams.get('action')||'health';
  if(a==='health') return out({ok:true,service:'github-admin-gateway',version:'1.0.0',token_configured:!!tok(),capabilities:['whoami','list_repos','create_repo','get_repo','update_repo','create_branch','put_file','delete_file']});
  if(a==='whoami'){const r=await gh('/user');return out({ok:true,user:{login:r.data.login,id:r.data.id,name:r.data.name}})}
  if(a==='list_repos'){const r=await gh('/user/repos?per_page=100&affiliation=owner,collaborator,organization_member&sort=updated');return out({ok:true,repositories:(r.data||[]).map((x:any)=>({full_name:x.full_name,private:x.private,permissions:x.permissions,default_branch:x.default_branch}))})}
  if(a==='create_repo'){
    const name=reqStr(b.name,'name'); const body:any={name,private:b.private!==false,auto_init:!!b.auto_init};
    if(typeof b.description==='string')body.description=b.description;
    const p=b.org?`/orgs/${encodeURIComponent(reqStr(b.org,'org'))}/repos`:'/user/repos';
    const r=await gh(p,{method:'POST',body:JSON.stringify(body)});
    return out({ok:true,repository:{full_name:r.data.full_name,html_url:r.data.html_url,private:r.data.private,default_branch:r.data.default_branch}},201)
  }
  const owner=reqStr(b.owner,'owner'), repo=reqStr(b.repo,'repo'); const base=`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  if(a==='get_repo'){const r=await gh(base);return out({ok:true,repository:r.data})}
  if(a==='update_repo'){const patch:any={};for(const k of ['name','description','homepage','private','default_branch','archived'] as const)if(b[k]!==undefined)patch[k]=b[k];const r=await gh(base,{method:'PATCH',body:JSON.stringify(patch)});return out({ok:true,repository:r.data})}
  if(a==='create_branch'){
    const branch=reqStr(b.branch,'branch'); let sha=b.sha;
    if(!sha){const ref=reqStr(b.base_ref||'heads/main','base_ref').replace(/^refs\//,'');const rr=await gh(`${base}/git/ref/${encodeURIComponent(ref)}`);sha=rr.data.object.sha}
    const r=await gh(`${base}/git/refs`,{method:'POST',body:JSON.stringify({ref:`refs/heads/${branch}`,sha})});return out({ok:true,ref:r.data.ref,sha:r.data.object.sha})
  }
  if(a==='put_file'){
    const path=reqStr(b.path,'path'),content=reqStr(b.content,'content'),message=reqStr(b.message||`update ${path}`,'message');
    const body:any={message,content:b.encoding==='base64'?content:btoa(unescape(encodeURIComponent(content)))}; if(b.branch)body.branch=b.branch;if(b.sha)body.sha=b.sha;
    const r=await gh(`${base}/contents/${path.split('/').map(encodeURIComponent).join('/')}`,{method:'PUT',body:JSON.stringify(body)});return out({ok:true,content_sha:r.data.content?.sha,commit_sha:r.data.commit?.sha})
  }
  if(a==='delete_file'){
    const path=reqStr(b.path,'path'),sha=reqStr(b.sha,'sha'),message=reqStr(b.message||`delete ${path}`,'message'); const body:any={message,sha};if(b.branch)body.branch=b.branch;
    const r=await gh(`${base}/contents/${path.split('/').map(encodeURIComponent).join('/')}`,{method:'DELETE',body:JSON.stringify(body)});return out({ok:true,commit_sha:r.data.commit?.sha})
  }
  return out({ok:false,error:`Unknown action: ${a}`},400)
 }catch(e){return out({ok:false,error:e instanceof Error?e.message:String(e)},500)}
});