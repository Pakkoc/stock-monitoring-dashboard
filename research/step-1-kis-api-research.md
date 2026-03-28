# Step 1: KIS OpenAPI Research Report

**Researcher**: @stock-api-researcher
**Date**: 2026-03-27
**Scope**: Korea Investment & Securities (KIS) OpenAPI for Stock Monitoring Dashboard

---

## Table of Contents

1. [REST API Authentication](#1-rest-api-authentication)
2. [WebSocket Real-time Subscription](#2-websocket-real-time-subscription)
3. [Available REST Endpoints](#3-available-rest-endpoints)
4. [Rate Limits and Throttling](#4-rate-limits-and-throttling)
5. [Error Handling](#5-error-handling)
6. [Data Format and Response Structures](#6-data-format-and-response-structures)
7. [Reference Implementations](#7-reference-implementations)
8. [Alternative APIs (Fallback Options)](#8-alternative-apis-fallback-options)
9. [TypeScript Implementation Patterns](#9-typescript-implementation-patterns)
10. [Summary and Recommendations](#10-summary-and-recommendations)

---

## 1. REST API Authentication

### 1.1 Overview

KIS OpenAPI uses an OAuth 2.0 `client_credentials` grant flow. Each developer receives an **App Key** and **App Secret** pair upon registering at the KIS Developers portal. Separate credentials are issued for live (production) and paper (simulation) trading environments.

**Source**: [KIS Developers Portal](https://apiportal.koreainvestment.com/apiservice) | [KIS Token Documentation](https://apiportal.koreainvestment.com/provider-doc3)

### 1.2 Base Domain URLs

| Environment | REST Base URL | Purpose |
|-------------|--------------|---------|
| Production (실전투자) | `https://openapi.koreainvestment.com:9443` | Live trading and market data |
| Simulation (모의투자) | `https://openapivts.koreainvestment.com:29443` | Paper trading and testing |

**Source**: [Java REST Integration Guide](https://velog.io/@seon7129/JAVA-%ED%95%9C%EA%B5%AD%ED%88%AC%EC%9E%90%EC%A6%9D%EA%B6%8C-OpenAPI-%EC%82%AC%EC%9A%A9-%EC%A0%95%EB%A6%AC-Rest)

### 1.3 Access Token Acquisition

**Endpoint**: `POST /oauth2/tokenP`

**Request**:
```json
{
  "grant_type": "client_credentials",
  "appkey": "PSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "appsecret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

**Response** (complete JSON structure):
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGci...(~350 chars)",
  "token_type": "Bearer",
  "expires_in": 7776000,
  "access_token_token_expired": "2026-06-25 14:04:07",
  "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGci...(~350 chars)",
  "refresh_token_expires_in": 48000000,
  "refresh_token_token_expired": "2027-10-23 03:24:07"
}
```

**Source**: [KIS Provider Doc3](https://apiportal.koreainvestment.com/provider-doc3)

### 1.4 Token Lifecycle

| Property | Value | Notes |
|----------|-------|-------|
| `expires_in` | 7,776,000 seconds (90 days) | Access token validity duration |
| `access_token_token_expired` | `YYYY-MM-DD HH:MM:SS` format | Exact expiry timestamp |
| Token issuance rate limit | 1 request per minute | Throttled at `/oauth2/tokenP` |
| Refresh cycle | Recommended every 6 hours | Although valid for 90 days, 6-hour refresh is documented |
| Token refresh buffer | 5 minutes before expiry | Recommended by community best practice |
| `refresh_token` validity | Contract-dependent (up to 90 days default) | Tied to advisory/discretionary contract period |

**Important**: When an access token expires, call `/oauth2/tokenP` again with the refresh token. If the refresh token itself expires, the end user must manually re-apply through the KIS Developers portal.

**Source**: [KIS Token Expiry Documentation](https://apiportal.koreainvestment.com/provider-doc4) | [TG Blog Tutorial](https://tgparkk.github.io/stock/2025/03/08/auto-stock-1-init.html)

### 1.5 Hash Key Generation

For POST requests (primarily order operations), a hash key is required for payload integrity verification.

**Endpoint**: `POST /uapi/hashkey`

**Request Headers**:
```
content-Type: application/json
appKey: {APP_KEY}
appSecret: {APP_SECRET}
```

**Request Body**: The JSON payload to be hashed (order parameters).

**Response**: Returns a `HASH` field containing the generated hash key, which must be included in subsequent order request headers as `hashkey`.

**Source**: [Quant Python Notebook](https://github.com/hyunyulhenry/quant_py/blob/main/api_trading.ipynb)

### 1.6 Standard Request Headers

All authenticated API calls require the following headers:

```
Content-Type: application/json
authorization: Bearer {access_token}
appkey: {APP_KEY}
appsecret: {APP_SECRET}
tr_id: {TRANSACTION_ID}
custtype: P
```

For order requests, additionally include:
```
hashkey: {HASH_VALUE}
```

The `custtype` field is `"P"` for individual investors and `"B"` for corporate investors.

**Source**: [Quant Python Notebook](https://github.com/hyunyulhenry/quant_py/blob/main/api_trading.ipynb)

---

## 2. WebSocket Real-time Subscription

### 2.1 WebSocket Domain URLs

| Environment | WebSocket URL |
|-------------|--------------|
| Production (실전투자) | `ws://ops.koreainvestment.com:21000` |
| Simulation (모의투자) | `ws://ops.koreainvestment.com:31000` |

**Note**: The WebSocket connections use the `ws://` protocol (not `wss://`), operating on custom ports separate from the REST API domain.

**Source**: [WikiDocs WebSocket Guide](https://wikidocs.net/170517)

### 2.2 Approval Key Acquisition

WebSocket authentication uses a separate `approval_key` (not the REST access token).

**Endpoint**: `POST https://openapi.koreainvestment.com:9443/oauth2/Approval`

**Request**:
```json
{
  "grant_type": "client_credentials",
  "appkey": "{APP_KEY}",
  "secretkey": "{APP_SECRET}"
}
```

**Response**:
```json
{
  "approval_key": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

**Important distinction**: The REST token endpoint uses `appsecret` as the key name, while the WebSocket approval endpoint uses `secretkey`. This asymmetry is a known source of developer confusion.

**Source**: [WikiDocs WebSocket Guide](https://wikidocs.net/170517) | [Java WebSocket Guide](https://velog.io/@seon7129/JAVA-%ED%95%9C%EA%B5%AD%ED%88%AC%EC%9E%90%EC%A6%9D%EA%B6%8C-OpenAPI-%EC%82%AC%EC%9A%A9-Websocket)

### 2.3 Subscription Message Format

**Subscribe** (`tr_type: "1"`) / **Unsubscribe** (`tr_type: "2"`):

```json
{
  "header": {
    "approval_key": "{APPROVAL_KEY}",
    "custtype": "P",
    "tr_type": "1",
    "content-type": "utf-8"
  },
  "body": {
    "input": {
      "tr_id": "H0STCNT0",
      "tr_key": "005930"
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `approval_key` | WebSocket authentication key from `/oauth2/Approval` |
| `custtype` | `"P"` = individual, `"B"` = corporate |
| `tr_type` | `"1"` = subscribe, `"2"` = unsubscribe |
| `tr_id` | Transaction ID identifying the data type |
| `tr_key` | Stock code (e.g., `"005930"` for Samsung Electronics) |

**Source**: [WikiDocs WebSocket Guide](https://wikidocs.net/170517)

### 2.4 WebSocket TR_ID Codes

| TR_ID | Data Type | Description |
|-------|-----------|-------------|
| `H0STASP0` | Real-time orderbook (호가) | 10-level bid/ask prices and volumes |
| `H0STCNT0` | Real-time execution (체결가) | Trade execution data with 50+ fields |
| `H0STCNI0` | Execution notification (체결통보, 실전) | Order fill notification (production, AES encrypted) |
| `H0STCNI9` | Execution notification (체결통보, 모의) | Order fill notification (simulation, AES encrypted) |

**Source**: [WikiDocs WebSocket Guide](https://wikidocs.net/170517) | [Java WebSocket Guide](https://velog.io/@seon7129/JAVA-%ED%95%9C%EA%B5%AD%ED%88%AC%EC%9E%90%EC%A6%9D%EA%B6%8C-OpenAPI-%EC%82%AC%EC%9A%A9-Websocket)

### 2.5 Response Data Format

WebSocket responses come in two distinct formats:

**Format 1 — JSON** (subscription confirmations and errors):
```json
{
  "header": {
    "tr_id": "H0STASP0",
    "tr_key": "005930",
    "encrypt": "N"
  },
  "body": {
    "rt_cd": "0",
    "msg_cd": "OPSP0000",
    "msg1": "SUBSCRIBE SUCCESS",
    "output": {
      "iv": "...",
      "key": "..."
    }
  }
}
```

Where `rt_cd` is `"0"` for success, `"1"` for error. The `output.iv` and `output.key` are AES256 decryption parameters (only for H0STCNI0/H0STCNI9 encrypted notifications).

**Format 2 — Pipe-delimited** (real-time market data):
```
0|H0STCNT0|001|005930^091500^...field_data...
```

Structure: `{encrypted_flag}|{tr_id}|{data_count}|{payload}`

- `0` = unencrypted, `1` = encrypted
- Payload fields are separated by `^` (caret) delimiter
- Multiple records may be concatenated (indicated by `data_count`)

**Source**: [WikiDocs WebSocket Guide](https://wikidocs.net/170517)

### 2.6 Real-time Price Data Fields (H0STCNT0)

The execution data (H0STCNT0) payload contains 50+ fields separated by `^`. Key fields include:

| Index | Field Name | Description |
|-------|-----------|-------------|
| 0 | `mksc_shrn_iscd` | Stock code (6 digits) |
| 1 | `stck_cntg_hour` | Execution time (HHMMSS) |
| 2 | `stck_prpr` | Current price |
| 3 | `prdy_vrss_sign` | Change direction (1=up, 2=down, 3=unchanged, 4=ceiling, 5=floor) |
| 4 | `prdy_vrss` | Change amount from previous day |
| 5 | `prdy_ctrt` | Change rate (%) |
| 6 | `wghn_avrg_stck_prc` | Weighted average price |
| 7 | `stck_oprc` | Opening price |
| 8 | `stck_hgpr` | High price |
| 9 | `stck_lwpr` | Low price |
| 10 | `askp1` | Best ask price |
| 11 | `bidp1` | Best bid price |
| 12 | `cntg_vol` | Execution volume |
| 13 | `acml_vol` | Accumulated volume |
| 14 | `acml_tr_pbmn` | Accumulated trading value |

**Source**: [Java WebSocket Guide](https://velog.io/@seon7129/JAVA-%ED%95%9C%EA%B5%AD%ED%88%AC%EC%9E%90%EC%A6%9D%EA%B6%8C-OpenAPI-%EC%82%AC%EC%9A%A9-Websocket)

### 2.7 Orderbook Data Fields (H0STASP0)

The orderbook data contains 50+ fields including 10-level bid/ask depth:

| Index Range | Description |
|-------------|-------------|
| 0 | Stock code |
| 1 | Business time |
| 3-12 | Ask prices (levels 1-10) |
| 13-22 | Ask volumes (levels 1-10) |
| 23-32 | Bid prices (levels 1-10) |
| 33-42 | Bid volumes (levels 1-10) |
| 43 | Total ask volume remaining |
| 44 | Total bid volume remaining |
| 47 | Expected execution price |
| 48 | Expected execution volume |
| 53 | Cumulative volume |

**Source**: [WikiDocs WebSocket Guide](https://wikidocs.net/170517)

### 2.8 PINGPONG Heartbeat Mechanism

The KIS WebSocket server sends periodic `PINGPONG` messages. The client must echo the same message back to maintain the connection.

**Detection**:
```
Received JSON with header.tr_id === "PINGPONG"
```

**Handling**: Send the received PINGPONG message back as-is. The client should also configure a `ping_interval` of 60 seconds for its own keep-alive mechanism.

If the server does not receive a PINGPONG response, the connection will be terminated. The client should implement automatic reconnection with re-subscription of all previously active subscriptions.

**Source**: [WikiDocs WebSocket Guide](https://wikidocs.net/170517)

### 2.9 Subscription Limits

| Constraint | Value |
|-----------|-------|
| Maximum real-time subscriptions per session | **41 items** (combined across all products) |
| Scope | Domestic stocks + overseas stocks + domestic derivatives + overseas derivatives = combined 41 |
| Item types counted | Real-time execution (체결가), orderbook (호가), expected execution (예상체결), execution notifications (체결통보) |

**Source**: [KIS Developers Portal](https://apiportal.koreainvestment.com/intro)

### 2.10 AES256 Encryption for Execution Notifications

Execution notification data (H0STCNI0/H0STCNI9) is AES-256-CBC encrypted. The decryption key and IV are provided in the subscription confirmation response (`output.key` and `output.iv`).

**Decryption**: AES-256-CBC with Base64-encoded ciphertext, PKCS7 unpadding.

**Source**: [WikiDocs WebSocket Guide](https://wikidocs.net/170517)

---

## 3. Available REST Endpoints

### 3.1 Authentication Endpoints

| Endpoint | Method | TR_ID | Description |
|----------|--------|-------|-------------|
| `/oauth2/tokenP` | POST | N/A | Access token issuance |
| `/oauth2/Approval` | POST | N/A | WebSocket approval key issuance |
| `/uapi/hashkey` | POST | N/A | Hash key generation for POST requests |

### 3.2 Domestic Stock — Quotation Endpoints (시세 조회)

| Endpoint | Method | TR_ID | Description |
|----------|--------|-------|-------------|
| `/uapi/domestic-stock/v1/quotations/inquire-price` | GET | `FHKST01010100` | Current stock price (현재가 시세) |
| `/uapi/domestic-stock/v1/quotations/inquire-asking-price-exp-ccn` | GET | `FHKST01010200` | Orderbook + expected execution (호가/예상체결) |
| `/uapi/domestic-stock/v1/quotations/inquire-ccnl` | GET | `FHKST01010300` | Recent executions (최근 체결, max 30 records) |
| `/uapi/domestic-stock/v1/quotations/inquire-daily-price` | GET | `FHKST01010400` | Daily/weekly/monthly price (일별 시세, max 30 periods) |
| `/uapi/domestic-stock/v1/quotations/inquire-investor` | GET | `FHKST01010900` | Investor type breakdown (투자자별 매매동향) |
| `/uapi/domestic-stock/v1/quotations/inquire-member` | GET | `FHKST01010600` | Member firm trading activity (회원사 매매동향) |

### 3.3 Domestic Stock — Chart Data Endpoints (차트 데이터)

| Endpoint | Method | TR_ID | Description |
|----------|--------|-------|-------------|
| `/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice` | GET | `FHKST03010100` | Period OHLCV chart (D/W/M/Y, max 100 records) |
| `/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice` | GET | `FHKST03010200` | 1-minute intraday candles (분봉, max 30 records) |
| `/uapi/domestic-stock/v1/quotations/inquire-time-itemconclusion` | GET | `FHPST01060000` | Intraday hourly executions (시간대별 체결) |

### 3.4 Domestic Stock — Ranking & Analysis (순위 분석)

| Endpoint | Method | TR_ID | Description |
|----------|--------|-------|-------------|
| `/uapi/domestic-stock/v1/quotations/volume-rank` | GET | `FHPST01710000` | Trading volume ranking (거래량 순위) |

**Source**: [KIS Developers Portal — Volume Rank](https://apiportal.koreainvestment.com/apiservice-apiservice?%2Fuapi%2Fdomestic-stock%2Fv1%2Fquotations%2Fvolume-rank=)

### 3.5 Domestic Stock — Trading Endpoints (주문)

| Endpoint | Method | TR_ID (Live/Mock) | Description |
|----------|--------|-------------------|-------------|
| `/uapi/domestic-stock/v1/trading/order-cash` | POST | `TTTC0802U`/`VTTC0802U` (buy) | Cash buy order |
| `/uapi/domestic-stock/v1/trading/order-cash` | POST | `TTTC0801U`/`VTTC0801U` (sell) | Cash sell order |
| `/uapi/domestic-stock/v1/trading/order-rvsecncl` | POST | `TTTC0803U`/`VTTC0803U` | Order modify/cancel |
| `/uapi/domestic-stock/v1/trading/inquire-balance` | GET | `TTTC8434R`/`VTTC8434R` | Account balance/positions |
| `/uapi/domestic-stock/v1/trading/inquire-psbl-order` | GET | `TTTC8908R` | Purchasable amount inquiry |
| `/uapi/domestic-stock/v1/trading/inquire-daily-ccld` | GET | `TTTC8001R`/`CTSC9115R` | Daily execution history |

### 3.6 ETF/ETN Endpoints

| Endpoint | Method | TR_ID | Description |
|----------|--------|-------|-------------|
| `/uapi/etfetn/v1/quotations/inquire-price` | GET | `FHPST02400000` | ETF/ETN current price |
| `/uapi/etfetn/v1/quotations/nav-comparison-trend` | GET | `FHPST02440000` | NAV vs market price tracking |

### 3.7 Market Index Data

Market indices (KOSPI, KOSDAQ, KOSPI 200) can be queried using the quotations endpoints with specific index codes:

| Index | Code | Description |
|-------|------|-------------|
| KOSPI | `0001` | KOSPI composite index |
| KOSDAQ | `1001` | KOSDAQ composite index |
| KOSPI 200 | `2001` | KOSPI 200 index |

**Source**: [KIS Developers API Category](https://apiportal.koreainvestment.com/apiservice-category) | [WikiDocs KIS Tutorial](https://wikidocs.net/239581)

### 3.8 Period Division Codes for Chart Data

The `FID_PERIOD_DIV_CODE` parameter for daily chart endpoints:

| Code | Period |
|------|--------|
| `D` | Daily (일봉) |
| `W` | Weekly (주봉) |
| `M` | Monthly (월봉) |
| `Y` | Yearly (년봉) |

### 3.9 Order Type Codes (ORD_DVSN)

| Code | Order Type |
|------|-----------|
| `00` | Limit order (지정가) |
| `01` | Market order (시장가) |
| `02` | Conditional limit (조건부지정가) |
| `03` | Best-effort limit (최유리지정가) |
| `04` | Priority limit (최우선지정가) |

**Source**: [Quant Python Notebook](https://github.com/hyunyulhenry/quant_py/blob/main/api_trading.ipynb)

---

## 4. Rate Limits and Throttling

### 4.1 REST API Rate Limits

| Environment | Rate Limit | Scope |
|-------------|-----------|-------|
| Production (실전투자) | **20 requests/second** per account | Account-level |
| Simulation (모의투자) | **2 requests/second** per account | Account-level |
| Token issuance (`/oauth2/tokenP`) | **1 request/minute** | Global |

### 4.2 Throttling Mechanism

KIS uses a **sliding window** rate limiting algorithm. This means that requests clustered at window boundaries can trigger rate limit violations even if the theoretical throughput is below 20 req/sec. Community testing has found that targeting **15 requests/second** provides optimal reliability.

**Source**: [KIS API Throttling Analysis](https://hky035.github.io/web/kis-api-throttling/)

### 4.3 Rate Limit Error

When the rate limit is exceeded, the API responds with:

| Field | Value |
|-------|-------|
| `msg_cd` | `EGW00201` |
| Description | "초당 거래건수를 초과하였습니다" (Per-second transaction count exceeded) |

### 4.4 WebSocket Subscription Limits

| Constraint | Limit |
|-----------|-------|
| Real-time subscriptions per session | **41 items** combined |
| Subscription scope | All products (domestic + overseas + derivatives) combined |

### 4.5 Recommended Throttling Strategy

Based on community benchmarking:

| Strategy | Rate (req/s) | Completion Time (2,742 stocks) | Notes |
|----------|-------------|-------------------------------|-------|
| No throttling | 20 | Frequent `EGW00201` errors | Unreliable |
| Token bucket @ 15 pps | 15 | ~184 seconds | Optimal balance |
| Token bucket @ 10 pps | 10 | ~274 seconds | Overly conservative |
| Thread.sleep(50ms) | ~20 | ~432 seconds | Naive approach |

**Recommended implementation**: Use a token bucket rate limiter at 15 permits/second with 1-second retry delay on `EGW00201` errors.

**Source**: [KIS API Throttling Analysis](https://hky035.github.io/web/kis-api-throttling/)

---

## 5. Error Handling

### 5.1 Error Response Structure

REST API errors return JSON with the following structure:

```json
{
  "rt_cd": "1",
  "msg_cd": "EGW00201",
  "msg1": "초당 거래건수를 초과하였습니다"
}
```

| Field | Description |
|-------|-------------|
| `rt_cd` | Result code: `"0"` = success, `"1"` = failure |
| `msg_cd` | Message code (error identifier) |
| `msg1` | Human-readable error message |

### 5.2 Known Error Codes

| Error Code | Description | Cause | Resolution |
|-----------|-------------|-------|------------|
| `EGW00201` | Per-second transaction limit exceeded | Too many requests within sliding window | Implement token bucket throttling at 15 pps; retry after 1s |
| Token error | Invalid/expired token | Stale access token | Re-issue via `/oauth2/tokenP` (max 1/min) |
| WebSocket `No close frame received` | WebSocket disconnection | Incorrect HTS ID configuration | Verify HTS ID in `kis_devlp.yaml` |
| `rt_cd: "1"` (WebSocket) | Subscription failure | Invalid TR_ID or stock code | Check TR_ID and stock code validity |

**Source**: [KIS API Throttling Analysis](https://hky035.github.io/web/kis-api-throttling/) | [KIS Developers FAQ](https://apiportal.koreainvestment.com/faq-error-code) | [Official GitHub README](https://github.com/koreainvestment/open-trading-api/blob/main/README.md)

### 5.3 Recommended Retry Strategy

```
1. On EGW00201 (rate limit):
   - Wait 1 second
   - Retry the same request
   - If 3 consecutive failures: back off exponentially (2s, 4s, 8s)

2. On token error:
   - Request new token from /oauth2/tokenP
   - Wait 60 seconds if token issuance also rate-limited
   - Retry original request with new token

3. On WebSocket disconnect:
   - Close existing connection
   - Re-obtain approval_key
   - Reconnect to WebSocket
   - Re-subscribe to all previously active subscriptions
   - Resume PINGPONG heartbeat handling
```

### 5.4 Circuit Breaker Pattern

For production dashboard use, implement a 3-tier circuit breaker:

| State | Condition | Behavior |
|-------|-----------|----------|
| **Closed** (normal) | < 5 errors in 60s | Process requests normally |
| **Open** (tripped) | >= 5 errors in 60s | Reject requests, return cached data |
| **Half-Open** (probing) | After 30s cooldown | Allow 1 test request; if success, close; if fail, re-open |

---

## 6. Data Format and Response Structures

### 6.1 Current Stock Price Response (FHKST01010100)

**Endpoint**: `GET /uapi/domestic-stock/v1/quotations/inquire-price`

**Query Parameters**:
| Parameter | Value | Description |
|-----------|-------|-------------|
| `FID_COND_MRKT_DIV_CODE` | `"J"` | Market code (J=stocks) |
| `FID_INPUT_ISCD` | `"005930"` | Stock code |

**Response JSON** (key fields in `output` object):

```json
{
  "rt_cd": "0",
  "msg_cd": "80000000",
  "msg1": "성공",
  "output": {
    "stck_prpr": "72300",
    "prdy_vrss": "-500",
    "prdy_vrss_sign": "5",
    "prdy_ctrt": "-0.69",
    "stck_oprc": "72800",
    "stck_hgpr": "73000",
    "stck_lwpr": "72100",
    "acml_vol": "12345678",
    "acml_tr_pbmn": "890123456789",
    "stck_mxpr": "94500",
    "stck_llam": "51100",
    "per": "12.34",
    "pbr": "1.56",
    "eps": "5860",
    "bps": "46340",
    "hts_avls": "4316000"
  }
}
```

| Field | Korean | Description |
|-------|--------|-------------|
| `stck_prpr` | 주식현재가 | Current price |
| `prdy_vrss` | 전일대비 | Change from previous day |
| `prdy_vrss_sign` | 전일대비부호 | 1=up, 2=down, 3=same, 4=ceiling, 5=floor |
| `prdy_ctrt` | 전일대비율 | Change rate (%) |
| `stck_oprc` | 시가 | Opening price |
| `stck_hgpr` | 고가 | High price |
| `stck_lwpr` | 저가 | Low price |
| `acml_vol` | 누적거래량 | Accumulated volume |
| `acml_tr_pbmn` | 누적거래대금 | Accumulated trading value |
| `stck_mxpr` | 상한가 | Upper limit price |
| `stck_llam` | 하한가 | Lower limit price |
| `per` | PER | Price-to-Earnings Ratio |
| `pbr` | PBR | Price-to-Book Ratio |
| `eps` | EPS | Earnings Per Share |
| `bps` | BPS | Book Value Per Share |
| `hts_avls` | 시가총액 | Market capitalization (억원) |

**Source**: [KIS Developers Portal](https://apiportal.koreainvestment.com/apiservice-apiservice?%2Fuapi%2Fdomestic-stock%2Fv1%2Fquotations%2Finquire-price=) | [Sonziit Blog](https://sonziit.co.kr/%EA%B0%9C%EB%B0%9C-%EB%85%B8%ED%8A%B8/%EC%8B%A4%EC%8B%9C%EA%B0%84-%EC%A3%BC%EA%B0%80-%EC%97%B0%EB%8F%99%EC%9D%84-%EC%9C%84%ED%95%9C-open-api-%ED%99%9C%EC%9A%A9%ED%95%9C%EA%B5%AD%ED%88%AC%EC%9E%90%EC%A6%9D%EA%B6%8C/)

### 6.2 Period Chart OHLCV Response (FHKST03010100)

**Endpoint**: `GET /uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`

**Query Parameters**:
| Parameter | Example | Description |
|-----------|---------|-------------|
| `FID_COND_MRKT_DIV_CODE` | `"J"` | Market code |
| `FID_INPUT_ISCD` | `"005930"` | Stock code |
| `FID_INPUT_DATE_1` | `"20260101"` | Start date (yyyyMMdd) |
| `FID_INPUT_DATE_2` | `"20260327"` | End date (yyyyMMdd) |
| `FID_PERIOD_DIV_CODE` | `"D"` | Period: D/W/M/Y |
| `FID_ORG_ADJ_PRC` | `"0"` | Adjusted price flag (0=adjusted, 1=unadjusted) |

**Response JSON** (`output2` array, max 100 records):

```json
{
  "output2": [
    {
      "stck_bsop_date": "20260327",
      "stck_oprc": "72800",
      "stck_hgpr": "73000",
      "stck_lwpr": "72100",
      "stck_clpr": "72300",
      "acml_vol": "12345678",
      "acml_tr_pbmn": "890123456789",
      "prdy_vrss": "-500",
      "prdy_vrss_sign": "5",
      "prdy_ctrt": "-0.69"
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `stck_bsop_date` | Trading date (yyyyMMdd) |
| `stck_oprc` | Opening price |
| `stck_hgpr` | High price |
| `stck_lwpr` | Low price |
| `stck_clpr` | Closing price |
| `acml_vol` | Accumulated volume |
| `acml_tr_pbmn` | Accumulated trading value |

**Source**: [Java REST Guide](https://velog.io/@seon7129/JAVA-%ED%95%9C%EA%B5%AD%ED%88%AC%EC%9E%90%EC%A6%9D%EA%B6%8C-OpenAPI-%EC%82%AC%EC%9A%A9-%EC%A0%95%EB%A6%AC-Rest) | [WikiDocs Sample](https://wikidocs.net/239682)

### 6.3 Timestamp Formats

| Context | Format | Example |
|---------|--------|---------|
| Token expiry | `YYYY-MM-DD HH:MM:SS` | `2026-06-25 14:04:07` |
| Date parameters | `yyyyMMdd` | `20260327` |
| Time in execution data | `HHMMSS` | `091530` |
| WebSocket business time | `HHMMSS` | `091530` |

### 6.4 Important Data Quirks

1. **All numeric values are strings**: Prices, volumes, and ratios are returned as string types, not numbers. Client code must parse them.
2. **POST body keys must be uppercase**: As documented exactly in the API specification.
3. **Market codes affect behavior materially**: `"J"` for stocks, `"ETF"` for ETFs, `"NXT"` for NXT Market, `"SOR"` for smart order routing.
4. **Continuation queries**: Balance and history endpoints return paginated data. Use `ctx_area_fk100`/`ctx_area_nk100` context keys for subsequent pages. Maximum per page: 20 (mock) or 50 (production) for balance inquiry.

**Source**: [KIS OpenAPI Skill Gist](https://gist.github.com/cr0sh/bba130593d9d7ccdf9d222fd000fbfb0) | [Quant Python Notebook](https://github.com/hyunyulhenry/quant_py/blob/main/api_trading.ipynb)

---

## 7. Reference Implementations

### 7.1 Official GitHub Repository

**Repository**: [koreainvestment/open-trading-api](https://github.com/koreainvestment/open-trading-api)

**Structure**:
```
open-trading-api/
├── strategy_builder/          # Trading strategy design + signal generation
├── backtester/                # Backtesting engine (QuantConnect Lean)
├── examples_llm/              # Function-level samples for AI agents
│   ├── [function_name].py     # Single API call implementation
│   └── chk_[function_name].py # Test/validation scripts
├── examples_user/             # Integrated examples for real trading
│   ├── [category]_functions.py     # All API functions per product
│   ├── [category]_examples.py      # Usage examples
│   ├── [category]_functions_ws.py  # WebSocket implementations
│   └── [category]_examples_ws.py   # WebSocket usage examples
├── MCP/                       # AI tool integration (Claude/ChatGPT)
├── kis_auth.py                # Core authentication module
├── kis_devlp.yaml             # Configuration template
└── legacy/                    # Archived sample code
```

**Language**: Python 3.11+ with `uv` package manager

**Product Categories**: auth, domestic_stock, domestic_bond, domestic_futureoption, overseas_stock, overseas_futureoption, elw, etfetn

**Source**: [Official GitHub](https://github.com/koreainvestment/open-trading-api)

### 7.2 Community Python Libraries

| Library | GitHub | Description |
|---------|--------|-------------|
| **python-kis** | [Soju06/python-kis](https://github.com/Soju06/python-kis) | Full-featured Python REST wrapper with type annotations |
| **kis-client** | [softyoungha/kis-client](https://github.com/softyoungha/kis-client) | Alternative Python client |
| **kisopenapi** (R) | [seokhoonj/kisopenapi](https://github.com/seokhoonj/kisopenapi) | R language wrapper (CRAN package) |

### 7.3 Node.js / TypeScript Resources

**There is no official TypeScript/Node.js SDK from KIS.** The official samples are Python-only. However, the following resources exist:

1. **krx-stock-api** (npm): [Shin-JaeHeon/krx-stock-api](https://github.com/Shin-JaeHeon/krx-stock-api) — TypeScript library for KRX data (not KIS API, but KRX scraping). MIT license. `npm install krx-stock-api`.

2. **KIS MCP Server**: [KISOpenAPI/kis-code-assistant-mcp](https://smithery.ai/server/@KISOpenAPI/kis-code-assistant-mcp) — MCP-based integration tool from KIS.

3. **OpenAPI codegen tools**: Generic tools like [openapi-typescript-codegen](https://github.com/ferdikoomen/openapi-typescript-codegen) can generate TypeScript clients from OpenAPI specs, but KIS does not publish a standard OpenAPI/Swagger spec file.

**Implication for this project**: A custom TypeScript/Node.js client must be built from scratch based on the REST and WebSocket specifications documented in this report.

### 7.4 KIS Developer Portal Resources

- **Official portal**: [apiportal.koreainvestment.com](https://apiportal.koreainvestment.com/apiservice)
- **API documentation**: Interactive "Try It" documentation with request/response samples
- **Error codes**: [FAQ Error Codes](https://apiportal.koreainvestment.com/faq-error-code) (dynamically loaded)
- **Service announcements**: TLS 1.0/1.1 deprecated after 2025-12-12

**Source**: [KIS Developers Portal](https://apiportal.koreainvestment.com/intro)

---

## 8. Alternative APIs (Fallback Options)

### 8.1 KRX Open API (한국거래소)

| Property | Detail |
|----------|--------|
| **Portal** | [openapi.krx.co.kr](https://openapi.krx.co.kr/) |
| **Data provider** | Korea Exchange (direct) |
| **Authentication** | API key (registration required) |
| **Daily call limit** | **10,000 calls/day** |
| **Data range** | Mainly from 2010 onwards |
| **Data types** | Daily stock prices, company info, investor trends, KOSPI/KOSDAQ/KRX100 indices, bonds, derivatives |
| **Commercial use** | Prohibited |
| **Best for** | Historical market data, index data, institutional flows |
| **Limitation** | No real-time data, no WebSocket, no trading |

**Source**: [KRX Open API](https://openapi.krx.co.kr/) | [KRX API Guide](https://bbangpower-blog.blogspot.com/2025/05/krx-api.html)

### 8.2 PyKRX (KRX Scraping Library)

| Property | Detail |
|----------|--------|
| **Repository** | [sharebook-kr/pykrx](https://github.com/sharebook-kr/pykrx) |
| **Language** | Python 3.10+ |
| **Installation** | `pip install pykrx` |
| **Data source** | Scrapes KRX and Naver Finance |
| **Data types** | OHLCV, market cap, fundamentals (PER, PBR, DIV, BPS, EPS), investor trading by type |
| **Markets** | KOSPI, KOSDAQ, KONEX |
| **Rate limit** | Self-imposed 1 second between requests (recommended) |
| **Commercial use** | Subject to KRX/Naver terms |
| **Best for** | Historical OHLCV data, bulk data collection |
| **Limitation** | Python only, scraping-based (fragile), no real-time, no trading |

**Key methods**:
- `stock.get_market_ohlcv()` — Historical OHLCV data
- `stock.get_market_fundamental()` — DIV, BPS, PER, EPS, PBR
- `stock.get_market_ticker_list()` — All stock codes for a date
- `stock.get_market_trading_value_by_date()` — Trading value by investor type

**Source**: [PyKRX GitHub](https://github.com/sharebook-kr/pykrx) | [PyKRX PyPI](https://pypi.org/project/pykrx/)

### 8.3 DART OpenAPI (전자공시)

| Property | Detail |
|----------|--------|
| **Portal** | [opendart.fss.or.kr](https://opendart.fss.or.kr/) |
| **Operator** | Financial Supervisory Service (FSS) |
| **Authentication** | API key |
| **Data types** | Corporate filings, financial statements (quarterly), company overviews, major shareholder changes |
| **Response format** | JSON and XML |
| **Best for** | Fundamental data, corporate events, financial statements |
| **Limitation** | No real-time price data, no trading |

**Key endpoints**:
- `https://opendart.fss.or.kr/api/company.json` — Company overview
- Financial statements for listed companies (IFRS)
- Disclosure search by type, company, date

**Community tools**: [OpenDartReader](https://github.com/FinanceData/OpenDartReader) (Python wrapper)

**Source**: [DART OpenAPI](https://opendart.fss.or.kr/intro/main.do) | [DART Guide](https://opendart.fss.or.kr/guide/main.do?apiGrpCd=DS001)

### 8.4 krx-stock-api (Node.js)

| Property | Detail |
|----------|--------|
| **Repository** | [Shin-JaeHeon/krx-stock-api](https://github.com/Shin-JaeHeon/krx-stock-api) |
| **Language** | TypeScript (96.8%) |
| **Installation** | `npm install krx-stock-api` |
| **License** | MIT |
| **Data types** | Real-time pricing, OHLCV, 52-week high/low, bid/ask, market indices, institutional activity |
| **Markets** | KOSPI, KOSDAQ, KRX100, KOSPI200 |
| **Best for** | Node.js/TypeScript projects needing KRX data without KIS account |
| **Limitation** | Scraping-based, no WebSocket streaming, no trading, small community (26 stars) |

**Usage**:
```typescript
import krx from 'krx-stock-api';
const stock = await krx.getStock('005930');
console.log(`${stock.name} : ${stock.price}원`);
```

**Source**: [krx-stock-api GitHub](https://github.com/Shin-JaeHeon/krx-stock-api)

### 8.5 Comparison Matrix

| Feature | KIS OpenAPI | KRX Open API | PyKRX | DART | krx-stock-api |
|---------|-------------|--------------|-------|------|---------------|
| Real-time price | WebSocket | No | No | No | Scraping |
| Historical OHLCV | REST | REST | Scraping | No | Scraping |
| Orderbook | WebSocket + REST | No | No | No | REST |
| Trading | REST (POST) | No | No | No | No |
| Fundamentals | Limited | Limited | Yes | Yes | No |
| Index data | Yes | Yes | Yes | No | Yes |
| TypeScript support | None (custom build) | None | Python only | None | Native |
| Rate limit | 20 req/s | 10K/day | ~1 req/s | Unknown | Unknown |
| Account required | Yes (brokerage) | Yes (registration) | No | Yes (API key) | No |

---

## 9. TypeScript Implementation Patterns

Since no official TypeScript SDK exists for KIS, the following patterns are provided for building a custom client.

### 9.1 REST API Authentication

```typescript
// kis-auth.ts
interface KISTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;           // 7776000 (90 days in seconds)
  access_token_token_expired: string; // "YYYY-MM-DD HH:MM:SS"
  refresh_token: string;
  refresh_token_expires_in: number;
  refresh_token_token_expired: string;
}

interface KISConfig {
  appKey: string;
  appSecret: string;
  baseUrl: string;  // "https://openapi.koreainvestment.com:9443" for production
}

class KISAuth {
  private config: KISConfig;
  private token: KISTokenResponse | null = null;
  private tokenExpiresAt: Date | null = null;

  constructor(config: KISConfig) {
    this.config = config;
  }

  async getAccessToken(forceNew = false): Promise<string> {
    if (!forceNew && this.token && this.tokenExpiresAt) {
      const bufferMs = 5 * 60 * 1000; // 5-minute buffer
      if (new Date() < new Date(this.tokenExpiresAt.getTime() - bufferMs)) {
        return this.token.access_token;
      }
    }

    const response = await fetch(`${this.config.baseUrl}/oauth2/tokenP`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey: this.config.appKey,
        appsecret: this.config.appSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token request failed: ${response.status}`);
    }

    this.token = await response.json() as KISTokenResponse;
    this.tokenExpiresAt = new Date(this.token.access_token_token_expired);
    return this.token.access_token;
  }

  getAuthHeaders(trId: string): Record<string, string> {
    if (!this.token) throw new Error('Not authenticated');
    return {
      'Content-Type': 'application/json',
      'authorization': `Bearer ${this.token.access_token}`,
      'appkey': this.config.appKey,
      'appsecret': this.config.appSecret,
      'tr_id': trId,
      'custtype': 'P',
    };
  }
}
```

### 9.2 REST API Stock Price Query

```typescript
// kis-market.ts
interface StockPrice {
  stck_prpr: string;    // Current price
  prdy_vrss: string;    // Change from previous day
  prdy_vrss_sign: string; // Direction: 1=up, 2=down, 3=same
  prdy_ctrt: string;    // Change rate (%)
  stck_oprc: string;    // Open
  stck_hgpr: string;    // High
  stck_lwpr: string;    // Low
  acml_vol: string;     // Accumulated volume
  acml_tr_pbmn: string; // Accumulated trading value
  per: string;          // P/E ratio
  pbr: string;          // P/B ratio
}

interface KISResponse<T> {
  rt_cd: string;   // "0" = success
  msg_cd: string;
  msg1: string;
  output: T;
}

async function getStockPrice(
  auth: KISAuth,
  stockCode: string,
  marketCode = 'J'
): Promise<StockPrice> {
  const baseUrl = 'https://openapi.koreainvestment.com:9443';
  const endpoint = '/uapi/domestic-stock/v1/quotations/inquire-price';
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: marketCode,
    FID_INPUT_ISCD: stockCode,
  });

  const token = await auth.getAccessToken();
  const response = await fetch(`${baseUrl}${endpoint}?${params}`, {
    headers: auth.getAuthHeaders('FHKST01010100'),
  });

  const data = await response.json() as KISResponse<StockPrice>;
  if (data.rt_cd !== '0') {
    throw new Error(`API Error: ${data.msg_cd} - ${data.msg1}`);
  }
  return data.output;
}
```

### 9.3 WebSocket Real-time Subscription

```typescript
// kis-websocket.ts
import WebSocket from 'ws';

interface WSSubscription {
  header: {
    approval_key: string;
    custtype: string;
    tr_type: '1' | '2';  // 1=subscribe, 2=unsubscribe
    'content-type': 'utf-8';
  };
  body: {
    input: {
      tr_id: string;  // e.g., "H0STCNT0", "H0STASP0"
      tr_key: string; // Stock code, e.g., "005930"
    };
  };
}

interface RealTimePrice {
  stockCode: string;
  time: string;
  currentPrice: number;
  changeSign: string;
  change: number;
  changeRate: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  askPrice1: number;
  bidPrice1: number;
  executionVolume: number;
  accumulatedVolume: number;
}

class KISWebSocket {
  private ws: WebSocket | null = null;
  private approvalKey: string;
  private subscriptions: Map<string, string> = new Map(); // tr_key -> tr_id
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(private config: KISConfig) {
    this.approvalKey = '';
  }

  async connect(): Promise<void> {
    // Step 1: Get approval key via REST
    this.approvalKey = await this.getApprovalKey();

    // Step 2: Connect WebSocket
    const wsUrl = 'ws://ops.koreainvestment.com:21000'; // production
    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      // Re-subscribe if reconnecting
      for (const [trKey, trId] of this.subscriptions) {
        this.sendSubscription(trId, trKey, '1');
      }
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      this.handleMessage(data.toString());
    });

    this.ws.on('close', () => {
      console.log('WebSocket closed');
      this.attemptReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('WebSocket error:', err);
    });
  }

  private async getApprovalKey(): Promise<string> {
    const response = await fetch(
      `${this.config.baseUrl}/oauth2/Approval`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          appkey: this.config.appKey,
          secretkey: this.config.appSecret, // Note: "secretkey", not "appsecret"
        }),
      }
    );
    const result = await response.json();
    return result.approval_key;
  }

  subscribe(trId: string, stockCode: string): void {
    this.subscriptions.set(stockCode, trId);
    this.sendSubscription(trId, stockCode, '1');
  }

  unsubscribe(trId: string, stockCode: string): void {
    this.subscriptions.delete(stockCode);
    this.sendSubscription(trId, stockCode, '2');
  }

  private sendSubscription(trId: string, trKey: string, trType: '1' | '2'): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const msg: WSSubscription = {
      header: {
        approval_key: this.approvalKey,
        custtype: 'P',
        tr_type: trType,
        'content-type': 'utf-8',
      },
      body: {
        input: { tr_id: trId, tr_key: trKey },
      },
    };
    this.ws.send(JSON.stringify(msg));
  }

  private handleMessage(data: string): void {
    // Check if JSON (subscription confirmation / error / PINGPONG)
    if (data.startsWith('{')) {
      const json = JSON.parse(data);
      const trId = json.header?.tr_id;

      if (trId === 'PINGPONG') {
        // Echo PINGPONG back to server
        this.ws?.send(data);
        return;
      }

      // Subscription confirmation
      const rtCd = json.body?.rt_cd;
      if (rtCd === '0') {
        console.log(`Subscription success: ${json.body.msg1}`);
      } else {
        console.error(`Subscription error: ${json.body.msg1}`);
      }
      return;
    }

    // Pipe-delimited real-time data: "0|H0STCNT0|001|field1^field2^..."
    const parts = data.split('|');
    if (parts.length >= 4) {
      const encrypted = parts[0]; // "0" = plain, "1" = encrypted
      const trId = parts[1];
      const dataCount = parseInt(parts[2], 10);
      const payload = parts[3];

      if (trId === 'H0STCNT0') {
        const fields = payload.split('^');
        const price: RealTimePrice = {
          stockCode: fields[0],
          time: fields[1],
          currentPrice: parseInt(fields[2], 10),
          changeSign: fields[3],
          change: parseInt(fields[4], 10),
          changeRate: parseFloat(fields[5]),
          openPrice: parseInt(fields[7], 10),
          highPrice: parseInt(fields[8], 10),
          lowPrice: parseInt(fields[9], 10),
          askPrice1: parseInt(fields[10], 10),
          bidPrice1: parseInt(fields[11], 10),
          executionVolume: parseInt(fields[12], 10),
          accumulatedVolume: parseInt(fields[13], 10),
        };
        this.onPrice?.(price);
      }
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }
    const delay = Math.pow(2, this.reconnectAttempts) * 1000; // Exponential backoff
    this.reconnectAttempts++;
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => this.connect(), delay);
  }

  // Event handler (set by consumer)
  onPrice?: (price: RealTimePrice) => void;
}
```

### 9.4 Rate Limiter Implementation

```typescript
// rate-limiter.ts
class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms

  constructor(permitsPerSecond: number) {
    this.maxTokens = permitsPerSecond;
    this.tokens = permitsPerSecond;
    this.refillRate = permitsPerSecond / 1000;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    // Wait until a token is available
    const waitMs = (1 - this.tokens) / this.refillRate;
    await new Promise(resolve => setTimeout(resolve, Math.ceil(waitMs)));
    this.refill();
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

// Usage: 15 permits/second (optimal for KIS API)
const rateLimiter = new TokenBucketRateLimiter(15);

async function rateLimitedFetch(url: string, options: RequestInit): Promise<Response> {
  await rateLimiter.acquire();
  const response = await fetch(url, options);
  const json = await response.json();

  // Retry on rate limit error
  if (json.msg_cd === 'EGW00201') {
    await new Promise(resolve => setTimeout(resolve, 1000));
    return rateLimitedFetch(url, options);
  }

  return response;
}
```

---

## 10. Summary and Recommendations

### 10.1 Architecture Decision for Stock Monitoring Dashboard

| Component | Recommendation | Rationale |
|-----------|---------------|-----------|
| **Primary API** | KIS OpenAPI | Only option with both REST and WebSocket for Korean stocks |
| **Real-time prices** | WebSocket (H0STCNT0) | Sub-second updates, 41 symbols max |
| **Historical OHLCV** | REST (FHKST03010100) | Up to 100 daily records per call |
| **Orderbook** | WebSocket (H0STASP0) | 10-level real-time depth |
| **Volume rankings** | REST (FHPST01710000) | Polling-based (e.g., every 5 seconds) |
| **Index data** | REST with index codes | KOSPI (0001), KOSDAQ (1001) |
| **Fallback (historical)** | krx-stock-api (npm) | TypeScript-native, no account needed |
| **Fallback (fundamentals)** | DART OpenAPI | Financial statements, corporate filings |

### 10.2 Key Technical Risks

1. **No official TypeScript SDK**: All REST and WebSocket client code must be built from scratch. This report provides the necessary TypeScript patterns.
2. **WebSocket uses `ws://` (not `wss://`)**: The production WebSocket connection is unencrypted. Consider whether this is acceptable for the deployment environment.
3. **41-subscription limit**: For a dashboard monitoring many stocks simultaneously, this is the primary constraint. Design must prioritize which stocks get real-time updates vs. polling.
4. **Sliding window rate limiter**: The 20 req/s limit with sliding window means burst traffic patterns can cause unexpected throttling. A 15 req/s token bucket is recommended.
5. **String-typed numeric fields**: All price/volume data arrives as strings. A parsing/normalization layer is essential.
6. **Token issuance rate limit (1/min)**: Token refresh failures require at least 60 seconds before retry.

### 10.3 Prerequisites for Development

1. **KIS brokerage account** with KIS Developers service activated
2. **App Key + App Secret** pair (separate for production and simulation)
3. **HTS ID** configuration (required for WebSocket execution notifications)
4. **TLS 1.2+** support (TLS 1.0/1.1 deprecated after 2025-12-12)

### 10.4 Next Steps for Implementation

1. **Step 2 (Planning)** should define the TypeScript client library structure based on the patterns in Section 9
2. Prioritize implementing: Auth module -> REST market data -> WebSocket real-time -> Rate limiter -> Error handling/circuit breaker
3. Use simulation environment (`openapivts.koreainvestment.com:29443`) for development and testing
4. Design subscription management to work within the 41-symbol WebSocket limit

---

## Sources

### Official Sources
- [KIS Developers Portal](https://apiportal.koreainvestment.com/apiservice)
- [KIS Developers Introduction](https://apiportal.koreainvestment.com/intro)
- [KIS Token Documentation](https://apiportal.koreainvestment.com/provider-doc3)
- [KIS Token Expiry Procedures](https://apiportal.koreainvestment.com/provider-doc4)
- [KIS FAQ Error Codes](https://apiportal.koreainvestment.com/faq-error-code)
- [KIS Volume Rank Endpoint](https://apiportal.koreainvestment.com/apiservice-apiservice?%2Fuapi%2Fdomestic-stock%2Fv1%2Fquotations%2Fvolume-rank=)
- [KIS Official GitHub Repository](https://github.com/koreainvestment/open-trading-api)
- [KIS GitHub README](https://github.com/koreainvestment/open-trading-api/blob/main/README.md)
- [KIS Service Announcement](https://securities.koreainvestment.com/main/customer/systemdown/OpenAPI.jsp)

### Developer Guides and Tutorials
- [Java REST Integration Guide](https://velog.io/@seon7129/JAVA-%ED%95%9C%EA%B5%AD%ED%88%AC%EC%9E%90%EC%A6%9D%EA%B6%8C-OpenAPI-%EC%82%AC%EC%9A%A9-%EC%A0%95%EB%A6%AC-Rest)
- [Java WebSocket Integration Guide](https://velog.io/@seon7129/JAVA-%ED%95%9C%EA%B5%AD%ED%88%AC%EC%9E%90%EC%A6%9D%EA%B6%8C-OpenAPI-%EC%82%AC%EC%9A%A9-Websocket)
- [WikiDocs WebSocket Code Explanation](https://wikidocs.net/170517)
- [WikiDocs KIS Introduction](https://wikidocs.net/159296)
- [WikiDocs Sample File Guide](https://wikidocs.net/239581)
- [WikiDocs Period Chart Guide](https://wikidocs.net/239682)
- [WikiDocs WebSocket Book](https://wikidocs.net/book/7847)
- [Sonziit Real-time Stock Integration](https://sonziit.co.kr/%EA%B0%9C%EB%B0%9C-%EB%85%B8%ED%8A%B8/%EC%8B%A4%EC%8B%9C%EA%B0%84-%EC%A3%BC%EA%B0%80-%EC%97%B0%EB%8F%99%EC%9D%84-%EC%9C%84%ED%95%9C-open-api-%ED%99%9C%EC%9A%A9%ED%95%9C%EA%B5%AD%ED%88%AC%EC%9E%90%EC%A6%9D%EA%B6%8C/)
- [TG Blog Auto-Trading Tutorial](https://tgparkk.github.io/stock/2025/03/08/auto-stock-1-init.html)
- [Access Token Setup Guide](https://velog.io/@5tmdhkfem/Project-%EA%B8%B0%EB%B3%B8%EC%84%B8%ED%8C%85-%EB%B0%8F-Access-Token-%EB%B0%9C%EA%B8%89%EB%B0%9B%EA%B8%B0)
- [Quant Python Notebook](https://github.com/hyunyulhenry/quant_py/blob/main/api_trading.ipynb)

### Technical Analysis
- [KIS API Throttling Deep Dive](https://hky035.github.io/web/kis-api-throttling/)
- [KIS OpenAPI Skill Definition (Gist)](https://gist.github.com/cr0sh/bba130593d9d7ccdf9d222fd000fbfb0)
- [KIS MCP Server (Smithery)](https://smithery.ai/server/@KISOpenAPI/kis-code-assistant-mcp)

### Community Libraries
- [python-kis (Python)](https://github.com/Soju06/python-kis)
- [kisopenapi (R)](https://github.com/seokhoonj/kisopenapi)
- [krx-stock-api (Node.js/TypeScript)](https://github.com/Shin-JaeHeon/krx-stock-api)

### Alternative APIs
- [KRX Open API Portal](https://openapi.krx.co.kr/)
- [KRX Data Marketplace](https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd)
- [PyKRX (GitHub)](https://github.com/sharebook-kr/pykrx)
- [PyKRX (PyPI)](https://pypi.org/project/pykrx/)
- [DART OpenAPI Portal](https://opendart.fss.or.kr/)
- [DART API Guide](https://opendart.fss.or.kr/guide/main.do?apiGrpCd=DS001)
- [OpenDartReader (GitHub)](https://github.com/FinanceData/OpenDartReader)
