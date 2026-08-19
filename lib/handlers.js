import {authenticate,signSession,session,role,sameOrigin,json,readJson,headers} from "./security.js";
import {mode,tasks,createTask,updateTask,messages,addMessage,audit,audits,rate,backup} from "./store.js";

export async function login(req,res){
  if(req.method!=="POST")return json(res,405,{error:"METHOD_NOT_ALLOWED"});if(!sameOrigin(req))return json(res,403,{error:"CROSS_ORIGIN_BLOCKED"});
  const ip=String(req.headers["x-forwarded-for"]||req.socket?.remoteAddress||"unknown").split(",")[0].trim();if(!await rate(`login:${ip}`,10,300))return json(res,429,{error:"RATE_LIMITED"});
  let b;try{b=await readJson(req)}catch{return json(res,400,{error:"INVALID_JSON"})}const u=authenticate(String(b.username||"").trim(),String(b.password||""));
  if(!u){await audit("login.failed",String(b.username||"unknown"),{ip});return json(res,401,{error:"INVALID_CREDENTIALS",message:"로그인 정보가 올바르지 않습니다."})}
  const t=signSession(u);if(!t)return json(res,503,{error:"AUTH_NOT_CONFIGURED"});await audit("login.success",u.username,{role:u.role,ip});
  res.setHeader("Set-Cookie",`jkstory_office_session=${t}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200; ${process.env.NODE_ENV==="production"?"Secure;":""}`);return json(res,200,{ok:true,user:u});
}
export async function me(req,res){const s=session(req);return s?json(res,200,{authenticated:true,user:{username:s.sub,role:s.role}}):json(res,401,{authenticated:false})}
export async function logout(req,res){if(req.method!=="POST")return json(res,405,{error:"METHOD_NOT_ALLOWED"});if(!sameOrigin(req))return json(res,403,{error:"CROSS_ORIGIN_BLOCKED"});const s=session(req);if(s)await audit("logout",s.sub,{role:s.role});res.setHeader("Set-Cookie",`jkstory_office_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; ${process.env.NODE_ENV==="production"?"Secure;":""}`);return json(res,200,{ok:true})}
export async function health(req,res){const s=session(req);return json(res,200,{ok:true,authenticated:Boolean(s),role:s?.role||null,aiConfigured:Boolean(process.env.GEMINI_API_KEY||process.env.OPENAI_API_KEY),aiEnabled:process.env.ENABLE_AI_CHAT==="true",storeMode:mode(),githubConfigured:Boolean(process.env.GITHUB_REPO),vercelConfigured:Boolean(process.env.VERCEL_TOKEN&&process.env.VERCEL_PROJECT_ID),model:process.env.GEMINI_API_KEY?(process.env.GEMINI_MODEL||"gemini-3-flash-preview"):(process.env.OPENAI_MODEL||"gpt-5.6")})}
export async function taskApi(req,res){const s=role(req);if(!s)return json(res,401,{error:"UNAUTHORIZED"});try{if(req.method==="GET")return json(res,200,{tasks:await tasks()});if(!["admin","operator"].includes(s.role))return json(res,403,{error:"FORBIDDEN"});if(!sameOrigin(req))return json(res,403,{error:"CROSS_ORIGIN_BLOCKED"});const b=await readJson(req);if(req.method==="POST"){const t=await createTask(b);await audit("task.created",s.sub,{taskId:t.id,title:t.title});return json(res,201,{task:t})}if(req.method==="PATCH"){const t=await updateTask(b.id,b);await audit("task.updated",s.sub,{taskId:t.id,status:t.status});return json(res,200,{task:t})}return json(res,405,{error:"METHOD_NOT_ALLOWED"})}catch(e){return json(res,e.message==="STORE_NOT_CONFIGURED"?503:400,{error:e.message})}}
export async function messageApi(req,res){const s=role(req);if(!s)return json(res,401,{error:"UNAUTHORIZED"});if(req.method!=="GET")return json(res,405,{error:"METHOD_NOT_ALLOWED"});try{return json(res,200,{messages:await messages()})}catch(e){return json(res,503,{error:e.message})}}
export async function auditApi(req,res){const s=role(req,["admin"]);if(!s)return json(res,401,{error:"UNAUTHORIZED"});if(req.method!=="GET")return json(res,405,{error:"METHOD_NOT_ALLOWED"});try{return json(res,200,{audit:await audits()})}catch(e){return json(res,503,{error:e.message})}}
export async function backupApi(req,res){const s=role(req,["admin"]);if(!s)return json(res,401,{error:"UNAUTHORIZED"});try{const d=await backup();await audit("backup.exported",s.sub,{tasks:d.tasks.length,messages:d.messages.length});headers(res);res.statusCode=200;res.setHeader("Content-Type","application/json; charset=utf-8");res.setHeader("Content-Disposition",`attachment; filename="jkstory-office-backup-${Date.now()}.json"`);return res.end(JSON.stringify(d,null,2))}catch(e){return json(res,503,{error:e.message})}}
export async function chatApi(req,res){
  const s=role(req,["admin","operator"]);
  if(!s)return json(res,401,{error:"UNAUTHORIZED"});
  if(req.method!=="POST")return json(res,405,{error:"METHOD_NOT_ALLOWED"});
  if(!sameOrigin(req))return json(res,403,{error:"CROSS_ORIGIN_BLOCKED"});
  if(!await rate(`ai:${s.sub}`,20,60))return json(res,429,{error:"RATE_LIMITED"});

  if(process.env.ENABLE_AI_CHAT!=="true"){
    return json(res,503,{error:"AI_CHAT_DISABLED",message:"AI 채팅이 아직 활성화되지 않았습니다."});
  }

  const hasGemini=Boolean(process.env.GEMINI_API_KEY);
  const hasOpenAI=Boolean(process.env.OPENAI_API_KEY);
  if(!hasGemini&&!hasOpenAI){
    return json(res,503,{error:"AI_API_KEY_MISSING",message:"Gemini 또는 OpenAI API 키가 필요합니다."});
  }

  let b;
  try{b=await readJson(req)}catch{return json(res,400,{error:"INVALID_JSON"})}
  const message=String(b.message||"").trim().slice(0,8000);
  if(!message)return json(res,400,{error:"MESSAGE_REQUIRED"});
  const c=b.context||{};

  const instructions=[
    "당신은 JKSTORY AI 전산센터장이다.",
    "한국어로 간결하고 실행 중심으로 답한다.",
    "확인하지 않은 파일, 테스트, Git 상태, 배포 성공을 만들어내지 않는다.",
    "운영 변경이나 삭제를 실제로 수행했다고 주장하지 않는다.",
    `현재 프로젝트: ${String(c.project||"정산서 작성 프로그램").slice(0,200)}`,
    `현재 단계: ${String(c.stage||"GitHub / Vercel 이전").slice(0,200)}`,
    `현재 Cloud Browser: ${String(c.browserUrl||"미연결").slice(0,1000)}`
  ].join("\n");

  await addMessage("user",message,{username:s.sub,context:c}).catch(()=>null);

  const hist=Array.isArray(b.history)
    ? b.history.slice(-12).map(x=>({
        role:x.role==="assistant"?"model":"user",
        text:String(x.content||"").slice(0,4000)
      }))
    : [];

  // Free-first policy: if a Gemini key exists, use Gemini before OpenAI.
  if(hasGemini){
    try{
      const model=process.env.GEMINI_MODEL||"gemini-3-flash-preview";
      const contents=[
        ...hist.map(x=>({role:x.role,parts:[{text:x.text}]})),
        {role:"user",parts:[{text:message}]}
      ];

      const r=await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method:"POST",
          headers:{
            "x-goog-api-key":process.env.GEMINI_API_KEY,
            "Content-Type":"application/json"
          },
          body:JSON.stringify({
            system_instruction:{parts:[{text:instructions}]},
            contents,
            generationConfig:{
              temperature:0.3,
              maxOutputTokens:2048
            }
          })
        }
      );

      const d=await r.json().catch(()=>({}));
      if(r.ok){
        let text="";
        for(const candidate of d.candidates||[]){
          for(const part of candidate.content?.parts||[]){
            if(typeof part.text==="string")text+=part.text;
          }
          if(text)break;
        }
        text=text||"응답 텍스트가 없습니다.";
        await addMessage("assistant",text,{
          provider:"gemini",
          model,
          responseId:d.responseId||null
        }).catch(()=>null);
        await audit("ai.response",s.sub,{provider:"gemini",model}).catch(()=>null);
        return json(res,200,{text,provider:"gemini",model});
      }

      // If Gemini exists but fails, only fall back to OpenAI when an OpenAI key is also configured.
      if(!hasOpenAI){
        const reason=d.error?.status||d.error?.message||`HTTP_${r.status}`;
        return json(res,502,{error:"GEMINI_REQUEST_FAILED",message:String(reason).slice(0,300)});
      }
    }catch(e){
      if(!hasOpenAI){
        return json(res,502,{error:"GEMINI_REQUEST_FAILED",message:String(e?.message||"Gemini 호출 실패").slice(0,300)});
      }
    }
  }

  if(hasOpenAI){
    try{
      const r=await fetch("https://api.openai.com/v1/responses",{
        method:"POST",
        headers:{
          Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          model:process.env.GEMINI_API_KEY?(process.env.GEMINI_MODEL||"gemini-3-flash-preview"):(process.env.OPENAI_MODEL||"gpt-5.6"),
          instructions,
          input:[
            ...hist.map(x=>({role:x.role==="model"?"assistant":"user",content:x.text})),
            {role:"user",content:message}
          ]
        })
      });
      const d=await r.json().catch(()=>({}));
      if(!r.ok)return json(res,502,{error:"OPENAI_REQUEST_FAILED",message:String(d.error?.message||`HTTP_${r.status}`).slice(0,300)});
      let text="";
      for(const item of d.output||[])for(const part of item.content||[])if(part.type==="output_text")text+=part.text||"";
      text=text||"응답 텍스트가 없습니다.";
      await addMessage("assistant",text,{provider:"openai",responseId:d.id}).catch(()=>null);
      await audit("ai.response",s.sub,{provider:"openai",responseId:d.id}).catch(()=>null);
      return json(res,200,{text,provider:"openai",responseId:d.id});
    }catch(e){
      return json(res,502,{error:"OPENAI_REQUEST_FAILED",message:String(e?.message||"OpenAI 호출 실패").slice(0,300)});
    }
  }
}
export async function githubApi(req,res){
  const s=role(req);if(!s)return json(res,401,{error:"UNAUTHORIZED"});const [owner,repo]=String(process.env.GITHUB_REPO||"").split("/");if(!owner||!repo)return json(res,200,{configured:false,status:null});
  const h={Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2026-03-10","User-Agent":"JKSTORY-AI-Office"};if(process.env.GITHUB_TOKEN)h.Authorization=`Bearer ${process.env.GITHUB_TOKEN}`;const gh=async p=>{const r=await fetch(`https://api.github.com${p}`,{headers:h});if(!r.ok)throw new Error(`GITHUB_HTTP_${r.status}`);return r.json()};
  try{const base=`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,[r,c,w]=await Promise.all([gh(base),gh(`${base}/commits?per_page=5`),gh(`${base}/actions/runs?per_page=5`)]);return json(res,200,{configured:true,status:{repository:{fullName:r.full_name,defaultBranch:r.default_branch,pushedAt:r.pushed_at},commits:c.map(x=>({sha:x.sha,message:x.commit?.message||"",author:x.author?.login||x.commit?.author?.name||"unknown",date:x.commit?.author?.date||null})),workflowRuns:(w.workflow_runs||[]).map(x=>({id:x.id,name:x.name,branch:x.head_branch,status:x.status,conclusion:x.conclusion,createdAt:x.created_at}))}})}catch(e){return json(res,502,{configured:true,error:e.message})}
}
export async function vercelApi(req,res){
  const s=role(req);if(!s)return json(res,401,{error:"UNAUTHORIZED"});const token=process.env.VERCEL_TOKEN,pid=process.env.VERCEL_PROJECT_ID,tid=process.env.VERCEL_TEAM_ID||"";if(!token||!pid)return json(res,200,{configured:false,status:null});const vf=async p=>{const r=await fetch(`https://api.vercel.com${p}`,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw new Error(`VERCEL_HTTP_${r.status}`);return r.json()};
  try{const q=tid?`?teamId=${encodeURIComponent(tid)}`:"",p=await vf(`/v9/projects/${encodeURIComponent(pid)}${q}`),sp=new URLSearchParams({projectId:pid,limit:"10"});if(tid)sp.set("teamId",tid);const d=await vf(`/v6/deployments?${sp}`);return json(res,200,{configured:true,status:{project:{id:p.id,name:p.name,framework:p.framework},deployments:(d.deployments||[]).map(x=>({uid:x.uid,url:x.url?`https://${x.url}`:null,state:x.state||x.readyState||null,target:x.target||null,createdAt:x.createdAt||x.created||null,meta:{githubCommitMessage:x.meta?.githubCommitMessage||null}}))}})}catch(e){return json(res,502,{configured:true,error:e.message})}
}

export async function readinessApi(req,res){
  const s=role(req);if(!s)return json(res,401,{error:"UNAUTHORIZED"});
  const checks={
    auth:Boolean(process.env.OFFICE_SESSION_SECRET&&process.env.OFFICE_SESSION_SECRET.length>=32&&process.env.OFFICE_USERS_JSON),
    storage:Boolean((process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL)&&(process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN)),
    ai:Boolean((process.env.GEMINI_API_KEY||process.env.OPENAI_API_KEY)&&process.env.ENABLE_AI_CHAT==="true"),
    github:Boolean(process.env.GITHUB_REPO),
    vercel:Boolean(process.env.VERCEL_TOKEN&&process.env.VERCEL_PROJECT_ID)
  };
  return json(res,Object.values(checks).every(Boolean)?200:503,{ready:Object.values(checks).every(Boolean),checks});
}
