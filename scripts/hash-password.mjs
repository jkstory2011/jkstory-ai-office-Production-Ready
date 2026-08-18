import crypto from "node:crypto";
const p=process.argv[2];if(!p||p.length<12){console.error("12자 이상의 비밀번호 필요");process.exit(1)}
const i=310000,s=crypto.randomBytes(16).toString("hex");
const h=crypto.pbkdf2Sync(p,s,i,32,"sha256").toString("hex");
console.log(`pbkdf2$${i}$${s}$${h}`);
