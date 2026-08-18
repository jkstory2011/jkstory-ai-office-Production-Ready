# JKSTORY AI 전산센터 Office — Zero-Install Web Edition

최종 사용자에게 설치파일을 배포하지 않는 웹 전용 운영본입니다.

## 사용자 사용 방식
1. 정식 Office URL 접속
2. 로그인
3. 바로 사용

사용자 PC에는 Node.js, Python, ZIP 압축해제, BAT/PowerShell 실행, localhost 설정이 필요하지 않습니다.

## 운영 구성
- Frontend: 정적 Web UI
- API: Vercel Serverless Functions
- 인증: HttpOnly session + RBAC
- 데이터: Upstash Redis REST
- AI: OpenAI Responses API (server-side)
- 개발관제: GitHub API read-only
- 배포관제: Vercel API read-only
- Cloud Browser: Vercel Preview URL 표시

## Production 필수 환경변수
- OFFICE_SESSION_SECRET
- OFFICE_USERS_JSON
- UPSTASH_REDIS_REST_URL
- UPSTASH_REDIS_REST_TOKEN
- ENABLE_AI_CHAT=true
- OPENAI_API_KEY
- OPENAI_MODEL=gpt-5.6
- GITHUB_REPO
- GITHUB_TOKEN
- VERCEL_TOKEN
- VERCEL_PROJECT_ID
- VERCEL_TEAM_ID

## 배포 후 완료 기준
- 정식 URL 외부 접속
- 로그인 성공
- 작업 생성/수정/재조회
- AI 대화 성공
- GitHub 최근 커밋/Actions 조회
- Vercel 최근 배포 조회
- Cloud Browser Preview 확인
- 관리자 감사로그/백업
- PC/태블릿/모바일 확인

최종 사용자에게는 URL과 계정만 제공합니다.
