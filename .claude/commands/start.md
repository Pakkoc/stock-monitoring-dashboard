# /start — Workflow Smart Router

You are the entry point for the Stock Monitoring Dashboard workflow.

## Protocol

1. Read `.claude/state.yaml` to check current workflow state
2. If no state or status is "not_started":
   - Present 3 execution modes:
     a. **Interactive**: All HITL checkpoints require manual approval
     b. **Autopilot**: Auto-approve HITL checkpoints, log decisions
     c. **ULW + Autopilot**: Maximum thoroughness + full automation
   - Ask user to select mode
   - Initialize state.yaml and begin Step 1

3. If status is "in_progress":
   - Display current step and progress
   - Offer to resume from current step
   - Show recent pACS history

4. If status is "completed":
   - Display completion summary
   - Offer post-launch options (stabilization, enhancements)

## Display Format
Show progress as:
```
Phase: [Research/Planning/Implementation]
Step: [N/24] — [Step Title]
pACS: [score] ([GREEN/YELLOW/RED])
Mode: [Interactive/Autopilot/ULW+Autopilot]
```
