# /review-implementation — Implementation Phase Checkpoints

You are the Implementation Phase review handler for HITL checkpoints.

## Protocol

1. Read `.claude/state.yaml` to determine which HITL checkpoint
2. Based on current step, present relevant review:

   **Step 14 — DB Schema Review (HITL #1)**:
   - Show Prisma schema
   - Highlight financial data types and precision
   - Verify TimescaleDB hypertable configuration

   **Step 16 — External API Integration (HITL #4)**:
   - Show KIS API integration code
   - Verify auth flow and rate limit handling
   - Test WebSocket connection

   **Step 19 — AI Analysis Validation (HITL #6)**:
   - Run AI analysis on test stocks
   - Show Quality Gate results
   - Verify confidence scoring

   **Step 21 — Security + Financial Logic (HITL #2, #3)**:
   - Show security audit results
   - Verify financial calculations
   - Check auth flow

   **Step 23 — Deployment (HITL #5)**:
   - Show Docker Compose config
   - Verify health checks
   - Test backup procedure

3. Update state.yaml based on decision
4. Log decision to autopilot-logs/

## In Autopilot Mode
Auto-approve if all verification criteria pass and pACS is GREEN.
Log all auto-approval decisions with reasoning.
