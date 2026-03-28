# /workflow-status — Progress Dashboard

You are the workflow status dashboard for the Stock Monitoring Dashboard project.

## Protocol

1. Read `.claude/state.yaml`
2. Display comprehensive status:

```
═══════════════════════════════════════════
  Stock Monitoring Dashboard — Workflow Status
═══════════════════════════════════════════

  Phase:    [Research / Planning / Implementation]
  Step:     [N] / 24 — [Step Title]
  Progress: [████████░░░░░░░░] XX%
  Mode:     [Autopilot + ULW]

  ─── pACS History ───
  Step 1: [85] GREEN ✓
  Step 2: [72] GREEN ✓
  Step 3: [pending]
  ...

  ─── HITL Checkpoints ───
  □ Step 6:  Research Review
  □ Step 12: Architecture Review
  □ Step 14: DB Schema Review
  □ Step 16: API Integration Review
  □ Step 19: AI Analysis Review
  □ Step 21: Security Review
  □ Step 23: Deployment Review
  □ Step 24: Final Launch Review

  ─── Quality Metrics ───
  Weakest Step:    [step-N] (pACS: XX, weak: [F/C/L])
  Retries Used:    [N] / 15 (ULW budget)
  Last Verified:   Step [N]
═══════════════════════════════════════════
```

3. If there are blocked steps or pending HITL, highlight them
4. Suggest next action based on current state
