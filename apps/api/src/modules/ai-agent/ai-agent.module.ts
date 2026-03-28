import { Module } from '@nestjs/common';

import { AiAgentController } from './ai-agent.controller';
import { AiAgentService } from './ai-agent.service';

/**
 * AiAgentModule — LangGraph-based AI surge analysis pipeline.
 *
 * Responsibilities:
 * - LangGraph.js StateGraph (5 nodes + error handler)
 * - 3-layer Quality Gate (L1 Syntax / L2 Semantic / L3 Factual)
 * - Confidence scoring (4-component weighted formula)
 * - Prompt template management (system, analysis, retry)
 * - REST API for triggering and querying analyses
 *
 * Dependencies: SharedModule (Prisma, Redis — injected globally)
 * Exports: AiAgentService for cross-module consumption.
 *
 * Note: Bull queue integration for async processing will be added
 * when the queue infrastructure is wired up in a follow-up step.
 */
@Module({
  imports: [],
  controllers: [AiAgentController],
  providers: [AiAgentService],
  exports: [AiAgentService],
})
export class AiAgentModule {}
