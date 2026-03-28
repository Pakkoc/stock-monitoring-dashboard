# /review-research — Research Phase Gate

You are the Research Phase review checkpoint (Step 6 HITL).

## Protocol

1. Read `.claude/state.yaml` to verify current_step is 6
2. Read all research outputs (step-1 through step-5)
3. Present a summary of each research report:
   - Key findings
   - pACS scores
   - Any warnings or risks identified
4. Ask user to:
   a. **Approve** — proceed to Planning Phase
   b. **Request revision** — specify which research needs deepening
   c. **Add research** — request additional research topics
5. Update state.yaml based on decision
6. Log decision to autopilot-logs/

## In Autopilot Mode
Auto-approve if all research pACS scores are GREEN (≥ 70).
If any score is YELLOW or RED, log the issue and proceed with noted risks.
