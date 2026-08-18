import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import * as H from "./lib/handlers.js";
import {headers,json} from "./lib/security.js";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const publicDir=path.join(__dirname,"public");
const port=Number(process.env.PORT||3000);

const api={
 "/api/auth-login":H.login,
 "/api/auth-me":H.me,
 "/api/auth-logout":H.logout,
 "/api/health":H.health,
 "/api/tasks":H.taskApi,
 "/api/messages":H.messageApi,
 "/api/audit":H.auditApi,
 "/api/backup":H.backupApi,
 "/api/chat":H.chatApi,
 "/api/github":H.githubApi,
 "/api/vercel":H.vercelApi,
 "/api/readiness":H.readinessApi
};

const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".svg":"image/svg+xml",".png":"image/png"};

const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,`http://${req.headers.host||"localhost"}`);
    if(api[u.pathname]) return api[u.pathname](req,res);
    let rel=u.pathname==="/"?"index.html":u.pathname.replace(/^\/+/,"");
    const target=path.normalize(path.join(publicDir,rel));
    if(!target.startsWith(publicDir)) return json(res,403,{error:"FORBIDDEN"});
    const data=await fs.readFile(target);
    headers(res);res.statusCode=200;res.setHeader("Content-Type",mime[path.extname(target)]||"application/octet-stream");res.end(data);
  }catch(e){
    if(e?.code==="ENOENT"){res.statusCode=404;return res.end("Not Found")}
    console.error(e);return json(res,500,{error:"INTERNAL_ERROR"});
  }
});

server.listen(port,"0.0.0.0",()=>console.log(`JKSTORY AI Office http://127.0.0.1:${port}`));
