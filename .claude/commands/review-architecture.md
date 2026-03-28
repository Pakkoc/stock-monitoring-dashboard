# /review-architecture — Planning Phase Gate

You are the Planning Phase review checkpoint (Step 12 HITL).

## Protocol

1. Read `.claude/state.yaml` to verify current_step is 12
2. Read all planning outputs (step-7 through step-11)
3. Present architecture decisions:
   - Module boundaries and dependencies
   - Database schema and API contracts
   - Frontend component architecture
   - AI pipeline design
   - DevOps configuration
4. Highlight any cross-module conflicts
5. Ask user to:
   a. **Approve** — proceed to Implementation Phase
   b. **Request revision** — specify which design needs changes
   c. **Reject** — return to Planning with new constraints
6. Update state.yaml based on decision
7. Log decision to autopilot-logs/

## In Autopilot Mode
Auto-approve if all planning pACS scores are GREEN and no cross-module conflicts detected.
