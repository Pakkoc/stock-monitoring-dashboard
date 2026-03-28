# Stock Monitoring Dashboard - 배포 가이드

> **아키텍처**: 프론트엔드(Vercel Free) + 백엔드/DB/Redis(미니PC + Cloudflare Tunnel)
>
> 프론트엔드는 Vercel의 글로벌 CDN에서 서빙되고, API 요청은 Cloudflare Tunnel을 통해
> 자택 미니PC의 NestJS 백엔드로 전달됩니다.

```
┌─────────────────┐         ┌────────────────────┐         ┌─────────────────────────────┐
│   사용자 브라우저  │ ──────▶ │   Vercel (CDN)      │         │  미니PC (자택)               │
│                 │         │   Next.js Frontend  │         │  ┌───────────────────────┐  │
│                 │         └────────────────────┘         │  │ Docker Compose        │  │
│                 │                                        │  │  ├─ api (NestJS:3001)  │  │
│                 │         ┌────────────────────┐         │  │  ├─ postgres (5432)    │  │
│                 │ ──────▶ │  Cloudflare Tunnel  │ ──────▶ │  │  ├─ redis (6379)      │  │
│   (API/WS)     │         │  (무료)              │         │  │  └─ cloudflared       │  │
└─────────────────┘         └────────────────────┘         │  └───────────────────────┘  │
                                                           └─────────────────────────────┘
```

---

## 목차

1. [사전 준비](#1-사전-준비)
2. [미니PC 설정 (백엔드)](#2-미니pc-설정-백엔드)
3. [Vercel 배포 (프론트엔드)](#3-vercel-배포-프론트엔드)
4. [위시켓 제출](#4-위시켓-제출)
5. [운영 관리](#5-운영-관리)
6. [문제 해결](#6-문제-해결)
7. [비용 요약](#7-비용-요약)

---

## 1. 사전 준비

### 계정 생성 (모두 무료)

| 서비스 | URL | 용도 |
|--------|-----|------|
| Cloudflare | https://dash.cloudflare.com/sign-up | Tunnel (백엔드 노출) |
| Vercel | https://vercel.com/signup | 프론트엔드 호스팅 |
| GitHub | https://github.com | 코드 저장소 (Vercel 연동) |

### API 키 준비

| API | 발급처 | 환경변수 |
|-----|--------|----------|
| KIS (한국투자증권) | https://apiportal.koreainvestment.com | `KIS_APP_KEY`, `KIS_APP_SECRET` |
| Naver Search | https://developers.naver.com | `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` |
| DART (전자공시) | https://opendart.fss.or.kr | `DART_API_KEY` |
| Anthropic (Claude) | https://console.anthropic.com | `ANTHROPIC_API_KEY` |

### 미니PC 최소 사양

- CPU: 4코어 이상 (Intel N100 급 이상 권장)
- RAM: 8GB 이상 (16GB 권장)
- 저장소: SSD 128GB 이상
- OS: Ubuntu 22.04 LTS 또는 24.04 LTS
- 네트워크: 유선 인터넷 연결 (상시 켜두어야 함)

---

## 2. 미니PC 설정 (백엔드)

### 2.1 Docker 설치

```bash
# Ubuntu/Debian 기준
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 재로그인 후 확인
docker --version
docker compose version
```

### 2.2 프로젝트 클론

```bash
git clone <your-repo-url> stock-dashboard
cd stock-dashboard
```

### 2.3 환경변수 설정

```bash
cp .env.example .env
nano .env
```

`.env` 파일에서 반드시 수정해야 할 항목:

```env
# 보안: 반드시 변경
NODE_ENV=production
POSTGRES_PASSWORD=<강력한_비밀번호_입력>
JWT_SECRET=<32자_이상_랜덤_문자열>
SESSION_SECRET=<32자_이상_랜덤_문자열>

# API 키: 각 서비스에서 발급받은 값 입력
KIS_APP_KEY=<발급받은_키>
KIS_APP_SECRET=<발급받은_시크릿>
KIS_BASE_URL=https://openapi.koreainvestment.com:9443     # 실전
KIS_WS_URL=ws://ops.koreainvestment.com:21000              # 실전
KIS_ACCOUNT_NUMBER=<계좌번호>
NAVER_CLIENT_ID=<발급받은_ID>
NAVER_CLIENT_SECRET=<발급받은_시크릿>
DART_API_KEY=<발급받은_키>
ANTHROPIC_API_KEY=<발급받은_키>

# Vercel 프론트엔드 URL (CORS 허용)
FRONTEND_URL=https://stock-monitoring-dashboard.vercel.app

# Cloudflare Tunnel (다음 단계에서 생성 후 입력)
CLOUDFLARE_TUNNEL_TOKEN=<터널_토큰>
```

> **팁**: 랜덤 문자열 생성 - `openssl rand -hex 32`

### 2.4 Cloudflare Tunnel 생성

1. [Cloudflare Zero Trust 대시보드](https://one.dash.cloudflare.com/) 접속
2. 좌측 메뉴 **Networks** > **Tunnels** 클릭
3. **Create a tunnel** 클릭
4. Tunnel 이름 입력: `stock-dashboard-api`
5. **Cloudflared** 탭에서 토큰 복사
6. `.env` 파일의 `CLOUDFLARE_TUNNEL_TOKEN`에 붙여넣기

**Public hostname 설정** (Tunnel 생성 마법사에서 또는 생성 후 Configure에서):

| 항목 | 값 |
|------|-----|
| Subdomain | `api` (또는 원하는 이름) |
| Domain | Cloudflare에 등록된 도메인, 또는 `cfargotunnel.com` 자동 생성 |
| Type | HTTP |
| URL | `api:3001` |

> **참고**: 자체 도메인이 없어도 Cloudflare가 `<tunnel-id>.cfargotunnel.com` 형태의
> URL을 자동 생성합니다. 이 URL을 Vercel 환경변수에 입력하면 됩니다.

### 2.5 백엔드 시작

```bash
# 빌드 및 실행
docker compose -f docker-compose.minipc.yml up -d

# 로그 확인
docker compose -f docker-compose.minipc.yml logs -f

# 서비스 상태 확인
docker compose -f docker-compose.minipc.yml ps
```

### 2.6 DB 마이그레이션 및 시드

```bash
# Prisma 마이그레이션 적용
docker compose -f docker-compose.minipc.yml exec api npx prisma migrate deploy

# 시드 데이터 삽입 (종목 마스터, 테스트 계정 등)
docker compose -f docker-compose.minipc.yml exec api npx prisma db seed
```

### 2.7 동작 확인

```bash
# 로컬 헬스체크
curl http://localhost:3001/api/health

# Cloudflare Tunnel 통해 외부 접근 확인
curl https://<your-tunnel-url>/api/health
```

정상 응답 예시:
```json
{"status":"ok","timestamp":"2026-03-27T..."}
```

---

## 3. Vercel 배포 (프론트엔드)

### 3.1 GitHub 저장소 준비

프로젝트가 GitHub에 push 되어 있어야 합니다:

```bash
git remote add origin https://github.com/<your-username>/stock-monitoring-dashboard.git
git push -u origin main
```

### 3.2 Vercel 프로젝트 생성

1. [vercel.com](https://vercel.com) 접속 후 GitHub 계정으로 로그인
2. **Add New...** > **Project** 클릭
3. **Import Git Repository** 에서 `stock-monitoring-dashboard` 선택
4. 설정 화면에서:

| 항목 | 값 |
|------|-----|
| Framework Preset | Next.js |
| Root Directory | `apps/web` |
| Build Command | (자동 감지 - vercel.json 사용) |
| Install Command | (자동 감지 - vercel.json 사용) |

5. **Environment Variables** 설정:

| 변수 | 값 |
|------|-----|
| `NEXT_PUBLIC_API_URL` | `https://<your-tunnel-url>` |
| `NEXT_PUBLIC_WS_URL` | `https://<your-tunnel-url>` |

6. **Deploy** 클릭

### 3.3 배포 확인

배포 완료 후 Vercel이 제공하는 URL로 접속:
- 프로덕션: `https://stock-monitoring-dashboard.vercel.app`
- 프리뷰 (PR마다): `https://stock-monitoring-dashboard-<hash>.vercel.app`

### 3.4 커스텀 도메인 (선택사항)

Vercel 대시보드 > Settings > Domains 에서 자체 도메인 연결 가능.
자체 도메인 사용 시 미니PC `.env`의 `FRONTEND_URL`도 업데이트하세요.

---

## 4. 위시켓 제출

포트폴리오 등록 시 아래 정보를 사용합니다:

```
포트폴리오 URL: https://stock-monitoring-dashboard.vercel.app
기술 스택: Next.js 15, NestJS, TimescaleDB, Redis, Socket.IO, Cloudflare Tunnel
인프라: Vercel (프론트엔드) + Self-hosted Mini-PC (백엔드)
```

---

## 5. 운영 관리

### 서비스 재시작

```bash
# 전체 재시작
docker compose -f docker-compose.minipc.yml restart

# 특정 서비스만 재시작
docker compose -f docker-compose.minipc.yml restart api
```

### 업데이트 배포

```bash
cd stock-dashboard

# 코드 업데이트
git pull origin main

# API 서비스만 재빌드 및 재시작
docker compose -f docker-compose.minipc.yml up -d --build api

# 프론트엔드는 git push 시 Vercel이 자동 배포
```

### 로그 확인

```bash
# 전체 로그
docker compose -f docker-compose.minipc.yml logs -f

# API 로그만
docker compose -f docker-compose.minipc.yml logs -f api

# 최근 100줄
docker compose -f docker-compose.minipc.yml logs --tail 100 api
```

### DB 백업

```bash
# 수동 백업
docker compose -f docker-compose.minipc.yml exec postgres \
  pg_dump -U postgres stock_dashboard > backup_$(date +%Y%m%d).sql

# 복원
docker compose -f docker-compose.minipc.yml exec -T postgres \
  psql -U postgres stock_dashboard < backup_20260327.sql
```

### 시스템 자동 시작 (재부팅 시)

Docker의 `restart: always` 정책으로 인해 시스템 재부팅 시 자동 시작됩니다.
Docker 데몬 자체의 자동 시작은 아래와 같이 설정합니다:

```bash
sudo systemctl enable docker
```

---

## 6. 문제 해결

### API가 응답하지 않음

```bash
# 1. 서비스 상태 확인
docker compose -f docker-compose.minipc.yml ps

# 2. API 로그 확인
docker compose -f docker-compose.minipc.yml logs --tail 50 api

# 3. 헬스체크
curl -v http://localhost:3001/api/health

# 4. 서비스 재시작
docker compose -f docker-compose.minipc.yml restart api
```

### Cloudflare Tunnel 연결 안 됨

```bash
# cloudflared 로그 확인
docker compose -f docker-compose.minipc.yml logs cloudflared

# 흔한 원인:
# - CLOUDFLARE_TUNNEL_TOKEN이 잘못됨 → .env 확인
# - API 서비스가 아직 시작 안 됨 → depends_on + healthcheck가 처리
# - 인터넷 연결 끊김 → 네트워크 확인
```

### Vercel 빌드 실패

```
# 흔한 원인:
# 1. Root Directory가 apps/web으로 설정되지 않음
# 2. pnpm workspace 의존성 문제 → vercel.json의 installCommand 확인
# 3. 환경변수 미설정 → Vercel 대시보드에서 NEXT_PUBLIC_API_URL 확인
```

### CORS 오류 (브라우저 콘솔)

```
Access to fetch at 'https://...' from origin 'https://...' has been blocked by CORS
```

해결:
1. 미니PC의 `.env`에서 `FRONTEND_URL`이 Vercel 도메인과 일치하는지 확인
2. API 재시작: `docker compose -f docker-compose.minipc.yml restart api`

### WebSocket 연결 실패

```
# WebSocket은 Cloudflare Tunnel을 통해 정상 동작합니다.
# 다만 Vercel의 NEXT_PUBLIC_WS_URL이 올바른 Tunnel URL인지 확인하세요.
# Cloudflare Tunnel 대시보드에서 WebSocket이 활성화되어 있는지 확인하세요.
```

### DB 연결 오류

```bash
# postgres 컨테이너 상태 확인
docker compose -f docker-compose.minipc.yml logs postgres

# 수동 접속 테스트
docker compose -f docker-compose.minipc.yml exec postgres \
  psql -U postgres -d stock_dashboard -c "SELECT 1;"
```

---

## 7. 비용 요약

| 항목 | 월 비용 | 비고 |
|------|---------|------|
| Vercel (Hobby) | **₩0** | 무료 플랜, 월 100GB 대역폭 |
| Cloudflare Tunnel | **₩0** | Zero Trust 무료 플랜 포함 |
| 미니PC 전기세 | **~₩5,000** | 10~15W 급 미니PC 24시간 가동 기준 |
| 도메인 | **₩0** | `*.vercel.app` 서브도메인 사용 시 |
| TimescaleDB | **₩0** | Self-hosted (Docker) |
| Redis | **₩0** | Self-hosted (Docker) |
| **합계** | **~₩5,000/월** | |

> 자체 도메인을 사용하려면 연 ₩10,000~₩20,000 추가 (Cloudflare Registrar 기준).
