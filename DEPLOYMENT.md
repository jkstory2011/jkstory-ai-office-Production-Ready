# Zero-Install 운영 배포

이 버전은 사용자 PC에서 실행하는 프로그램이 아닙니다.
Vercel에 한 번 배포한 뒤 URL로만 사용합니다.

## 최종 사용자
설치 없음 / 다운로드 없음 / localhost 없음

## 운영자
Vercel 프로젝트에 환경변수를 1회 설정하고 Production 배포합니다.

## 배포 후
예: https://office.example.com
이 주소 하나만 사용자에게 전달합니다.

## 운영 변경 안전경계
GitHub/Vercel 연동은 조회 전용입니다.
push, 배포 생성/취소, 환경변수 변경은 자동 실행하지 않습니다.
