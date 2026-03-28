/**
 * Prisma Seed Script — Stock Monitoring Dashboard
 *
 * Seeds the database with initial data for development:
 * - 2 users (admin + regular)
 * - 20 Korean stocks (real symbols)
 * - 5 themes with stock mappings
 * - 1 watchlist per user with stocks
 * - Sample news articles
 * - Sample AI analysis results
 */

import { PrismaClient, Role, Market, AnalysisType } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simple password hash using Node.js built-in crypto (PBKDF2).
 * In production, the auth module (better-auth) handles hashing.
 * This avoids requiring bcrypt as a dev dependency for seeding.
 */
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

// ---------------------------------------------------------------------------
// Seed Data
// ---------------------------------------------------------------------------

const users = [
  {
    email: 'admin@example.com',
    passwordHash: hashPassword('admin123'),
    name: '관리자',
    role: Role.ADMIN,
    surgeThreshold: 3.0,
  },
  {
    email: 'user@example.com',
    passwordHash: hashPassword('user123'),
    name: '테스트 사용자',
    role: Role.USER,
    surgeThreshold: 5.0,
  },
];

const stocks = [
  // KOSPI — Large Cap
  { symbol: '005930', name: '삼성전자', market: Market.KOSPI, sector: '반도체' },
  { symbol: '000660', name: 'SK하이닉스', market: Market.KOSPI, sector: '반도체' },
  { symbol: '373220', name: 'LG에너지솔루션', market: Market.KOSPI, sector: '2차전지' },
  { symbol: '005380', name: '현대자동차', market: Market.KOSPI, sector: '자동차' },
  { symbol: '000270', name: '기아', market: Market.KOSPI, sector: '자동차' },
  { symbol: '006400', name: '삼성SDI', market: Market.KOSPI, sector: '2차전지' },
  { symbol: '051910', name: 'LG화학', market: Market.KOSPI, sector: '화학' },
  { symbol: '035420', name: 'NAVER', market: Market.KOSPI, sector: 'IT서비스' },
  { symbol: '035720', name: '카카오', market: Market.KOSPI, sector: 'IT서비스' },
  { symbol: '105560', name: 'KB금융', market: Market.KOSPI, sector: '금융' },
  { symbol: '055550', name: '신한지주', market: Market.KOSPI, sector: '금융' },
  { symbol: '086790', name: '하나금융지주', market: Market.KOSPI, sector: '금융' },
  { symbol: '012330', name: '현대모비스', market: Market.KOSPI, sector: '자동차부품' },
  { symbol: '066570', name: 'LG전자', market: Market.KOSPI, sector: '전자' },
  { symbol: '003670', name: '포스코퓨처엠', market: Market.KOSPI, sector: '2차전지' },
  { symbol: '207940', name: '삼성바이오로직스', market: Market.KOSPI, sector: '바이오' },
  { symbol: '068270', name: '셀트리온', market: Market.KOSPI, sector: '바이오' },
  // KOSDAQ
  { symbol: '247540', name: '에코프로비엠', market: Market.KOSDAQ, sector: '2차전지' },
  { symbol: '086520', name: '에코프로', market: Market.KOSDAQ, sector: '2차전지' },
  { symbol: '403870', name: 'HPSP', market: Market.KOSDAQ, sector: '반도체장비' },
];

const themes = [
  {
    name: '반도체',
    description: '반도체 설계, 제조, 장비 관련 종목',
    isSystem: true,
    stockSymbols: ['005930', '000660', '403870'],
  },
  {
    name: '2차전지',
    description: '배터리, 양극재, 전구체 등 2차전지 밸류체인',
    isSystem: true,
    stockSymbols: ['373220', '006400', '051910', '003670', '247540', '086520'],
  },
  {
    name: 'AI/소프트웨어',
    description: 'AI, 클라우드, 플랫폼, 소프트웨어 관련 종목',
    isSystem: true,
    stockSymbols: ['035420', '035720'],
  },
  {
    name: '바이오',
    description: '바이오시밀러, 신약개발, 바이오의약품 관련',
    isSystem: true,
    stockSymbols: ['207940', '068270'],
  },
  {
    name: '금융',
    description: '은행, 증권, 보험 등 금융지주 및 금융업',
    isSystem: true,
    stockSymbols: ['105560', '055550', '086790'],
  },
];

const newsArticles = [
  {
    title: '삼성전자, HBM4 양산 본격화…2분기 출하 개시',
    url: 'https://example.com/news/samsung-hbm4',
    source: '한국경제',
    summary: '삼성전자가 차세대 고대역폭 메모리(HBM4)의 양산을 본격화한다. 2분기부터 주요 AI 반도체 업체에 출하를 시작할 예정이다.',
    publishedAt: new Date('2026-03-26T09:00:00+09:00'),
    relatedSymbols: ['005930', '000660'],
  },
  {
    title: 'SK하이닉스, 1분기 영업이익 7조원 전망…AI 수혜 지속',
    url: 'https://example.com/news/sk-hynix-q1',
    source: '매일경제',
    summary: 'SK하이닉스의 1분기 영업이익이 7조원을 넘길 것으로 전망된다. AI 서버용 HBM 수요가 폭발적으로 증가하면서 실적 호조세가 이어지고 있다.',
    publishedAt: new Date('2026-03-26T10:30:00+09:00'),
    relatedSymbols: ['000660'],
  },
  {
    title: 'LG에너지솔루션, 북미 배터리 공장 가동률 90% 돌파',
    url: 'https://example.com/news/lges-na-factory',
    source: '조선비즈',
    summary: 'LG에너지솔루션의 북미 합작 배터리 공장 가동률이 90%를 넘어섰다. EV 수요 회복과 IRA 보조금 효과가 맞물린 결과다.',
    publishedAt: new Date('2026-03-25T14:00:00+09:00'),
    relatedSymbols: ['373220', '006400'],
  },
  {
    title: 'NAVER, 하이퍼클로바X 기업용 서비스 확대…B2B AI 매출 급증',
    url: 'https://example.com/news/naver-hyperclova',
    source: '디지털타임스',
    summary: '네이버가 하이퍼클로바X 기반 기업용 AI 서비스를 확대하며 B2B AI 매출이 전년 대비 150% 급증했다.',
    publishedAt: new Date('2026-03-25T11:00:00+09:00'),
    relatedSymbols: ['035420'],
  },
  {
    title: '카카오, 모빌리티·핀테크 분할 상장 검토 착수',
    url: 'https://example.com/news/kakao-spinoff',
    source: '서울경제',
    summary: '카카오가 모빌리티와 핀테크 사업부의 분할 상장을 검토하기 시작했다. 기업가치 재평가 전략의 일환이다.',
    publishedAt: new Date('2026-03-24T16:00:00+09:00'),
    relatedSymbols: ['035720'],
  },
  {
    title: 'KB금융, 올해 배당 역대 최대 전망…금융주 강세',
    url: 'https://example.com/news/kb-dividend',
    source: '한국경제',
    summary: 'KB금융지주의 올해 배당금이 역대 최대 수준을 기록할 전망이다. 밸류업 프로그램 효과로 금융주 전반에 강세가 이어지고 있다.',
    publishedAt: new Date('2026-03-24T09:30:00+09:00'),
    relatedSymbols: ['105560', '055550', '086790'],
  },
  {
    title: '에코프로비엠, 하이니켈 양극재 유럽 수출 계약 체결',
    url: 'https://example.com/news/ecoprobm-europe',
    source: '전자신문',
    summary: '에코프로비엠이 유럽 완성차 업체와 하이니켈 양극재 장기 공급 계약을 체결했다. 계약 규모는 약 2조원에 달한다.',
    publishedAt: new Date('2026-03-23T13:00:00+09:00'),
    relatedSymbols: ['247540', '086520'],
  },
  {
    title: '셀트리온, FDA 바이오시밀러 품목 추가 승인…미국 시장 확대',
    url: 'https://example.com/news/celltrion-fda',
    source: '바이오스펙테이터',
    summary: '셀트리온이 FDA로부터 신규 바이오시밀러 품목에 대한 승인을 획득했다. 미국 시장 파이프라인이 한층 강화되었다.',
    publishedAt: new Date('2026-03-22T10:00:00+09:00'),
    relatedSymbols: ['068270', '207940'],
  },
];

const aiAnalyses = [
  {
    stockSymbol: '005930',
    analysisType: AnalysisType.SURGE,
    result: {
      summary: '삼성전자 주가 급등 분석: HBM4 양산 뉴스에 따른 단기 상승 모멘텀',
      factors: [
        { factor: 'HBM4 양산 시작', impact: 'positive', weight: 0.45 },
        { factor: 'AI 반도체 수요 증가', impact: 'positive', weight: 0.30 },
        { factor: '기술적 저항선 돌파', impact: 'positive', weight: 0.15 },
        { factor: '원/달러 환율 부담', impact: 'negative', weight: 0.10 },
      ],
      priceTarget: { short: 87000, mid: 95000, reasoning: '기존 대비 PER 13.5배 적용' },
      riskLevel: 'medium',
      recommendation: '단기 모멘텀 긍정적, 분할 매수 권장',
    },
    confidenceScore: 0.8250,
    qgL1Pass: true,
    qgL2Pass: true,
    qgL3Pass: false,
    sourcesJson: [
      { type: 'news', title: '삼성전자, HBM4 양산 본격화', reliability: 0.9 },
      { type: 'price_data', period: '30d', dataPoints: 30 },
      { type: 'technical', indicators: ['RSI', 'MACD', 'Bollinger'] },
    ],
  },
  {
    stockSymbol: '373220',
    analysisType: AnalysisType.DAILY_SUMMARY,
    result: {
      summary: 'LG에너지솔루션 일일 분석 요약',
      marketContext: '2차전지 섹터 전반적 상승세, 북미 IRA 수혜 지속',
      technicalSignals: {
        trend: 'bullish',
        rsi: 62.5,
        macdSignal: 'buy',
        bollingerPosition: 'middle',
      },
      volumeAnalysis: { avgVolume20d: 350000, todayVolume: 420000, volumeRatio: 1.2 },
      sentiment: { overall: 'positive', newsCount: 3, positiveRatio: 0.8 },
    },
    confidenceScore: 0.7800,
    qgL1Pass: true,
    qgL2Pass: true,
    qgL3Pass: false,
    sourcesJson: [
      { type: 'news', title: 'LG에너지솔루션, 북미 배터리 공장 가동률 90% 돌파', reliability: 0.85 },
      { type: 'price_data', period: '60d', dataPoints: 60 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Main Seed Function
// ---------------------------------------------------------------------------

async function main() {
  console.log('🌱 Seeding database...\n');

  // 1. Users
  console.log('👤 Creating users...');
  const createdUsers = [];
  for (const userData of users) {
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: {
        email: userData.email,
        passwordHash: userData.passwordHash,
        name: userData.name,
        role: userData.role,
        surgeThreshold: userData.surgeThreshold,
      },
    });
    createdUsers.push(user);
    console.log(`  ✓ ${user.name} (${user.email}) — role: ${user.role}`);
  }

  // 2. Stocks
  console.log('\n📈 Creating stocks...');
  const createdStocks: Record<string, { id: number; symbol: string; name: string }> = {};
  for (const stockData of stocks) {
    const stock = await prisma.stock.upsert({
      where: { symbol: stockData.symbol },
      update: {},
      create: {
        symbol: stockData.symbol,
        name: stockData.name,
        market: stockData.market,
        sector: stockData.sector,
        isActive: true,
      },
    });
    createdStocks[stock.symbol] = stock;
    console.log(`  ✓ ${stock.name} (${stock.symbol}) — ${stock.market}`);
  }

  // 3. Themes & Theme-Stock Mappings
  console.log('\n🏷️  Creating themes...');
  for (const themeData of themes) {
    const theme = await prisma.theme.upsert({
      where: { name: themeData.name },
      update: {},
      create: {
        name: themeData.name,
        description: themeData.description,
        isSystem: themeData.isSystem,
      },
    });
    console.log(`  ✓ ${theme.name}`);

    // Create theme-stock mappings
    for (const symbol of themeData.stockSymbols) {
      const stock = createdStocks[symbol];
      if (stock) {
        await prisma.themeStock.upsert({
          where: {
            themeId_stockId: {
              themeId: theme.id,
              stockId: stock.id,
            },
          },
          update: {},
          create: {
            themeId: theme.id,
            stockId: stock.id,
          },
        });
        console.log(`    → ${stock.name}`);
      }
    }
  }

  // 4. Watchlists
  console.log('\n📋 Creating watchlists...');
  const adminWatchlistStocks = ['005930', '000660', '373220', '035420', '207940'];
  const userWatchlistStocks = ['005930', '035720', '105560', '247540', '068270'];

  const watchlistConfigs = [
    { user: createdUsers[0], name: '관심종목 1', stockSymbols: adminWatchlistStocks },
    { user: createdUsers[1], name: '내 관심종목', stockSymbols: userWatchlistStocks },
  ];

  for (const config of watchlistConfigs) {
    const watchlist = await prisma.watchlist.create({
      data: {
        userId: config.user.id,
        name: config.name,
      },
    });
    console.log(`  ✓ ${config.user.name}: ${config.name}`);

    for (const symbol of config.stockSymbols) {
      const stock = createdStocks[symbol];
      if (stock) {
        await prisma.watchlistItem.create({
          data: {
            watchlistId: watchlist.id,
            stockId: stock.id,
          },
        });
        console.log(`    → ${stock.name}`);
      }
    }
  }

  // 5. News Articles & News-Stock Mappings
  console.log('\n📰 Creating news articles...');
  for (const article of newsArticles) {
    const news = await prisma.news.upsert({
      where: { url: article.url },
      update: {},
      create: {
        title: article.title,
        url: article.url,
        source: article.source,
        summary: article.summary,
        publishedAt: article.publishedAt,
      },
    });
    console.log(`  ✓ ${news.title.substring(0, 50)}...`);

    // Create news-stock mappings
    for (const symbol of article.relatedSymbols) {
      const stock = createdStocks[symbol];
      if (stock) {
        await prisma.newsStock.upsert({
          where: {
            newsId_stockId: {
              newsId: news.id,
              stockId: stock.id,
            },
          },
          update: {},
          create: {
            newsId: news.id,
            stockId: stock.id,
            relevanceScore: 0.85,
          },
        });
      }
    }
  }

  // 6. AI Analyses
  console.log('\n🤖 Creating AI analyses...');
  for (const analysisData of aiAnalyses) {
    const stock = createdStocks[analysisData.stockSymbol];
    if (stock) {
      await prisma.aiAnalysis.create({
        data: {
          stockId: stock.id,
          analysisType: analysisData.analysisType,
          result: analysisData.result,
          confidenceScore: analysisData.confidenceScore,
          qgL1Pass: analysisData.qgL1Pass,
          qgL2Pass: analysisData.qgL2Pass,
          qgL3Pass: analysisData.qgL3Pass,
          sourcesJson: analysisData.sourcesJson,
        },
      });
      console.log(`  ✓ ${stock.name} — ${analysisData.analysisType}`);
    }
  }

  console.log('\n✅ Seed completed successfully!');
  console.log(`   Users: ${createdUsers.length}`);
  console.log(`   Stocks: ${Object.keys(createdStocks).length}`);
  console.log(`   Themes: ${themes.length}`);
  console.log(`   News: ${newsArticles.length}`);
  console.log(`   AI Analyses: ${aiAnalyses.length}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
