# VANGUARD Final Demo Script (90-120 seconds)

## Pre-Demo Setup (Silent)
- Server running: `node server.js`
- UI open: http://localhost:3000
- All signals at baseline (Port: 42%, Supplier: 0.89, Weather: 18%)
- System state: MONITORING

## Demo Flow

### Phase 1: Continuous Monitoring (0-15s)
**Narration**: "VANGUARD uses a Sentinel agent that continuously monitors supply chain signals. No button clicks needed - the system watches autonomously."

**Action**: Point to Sentinel Monitor panel
- Show aggregate risk below threshold
- Status: "Monitoring... Normal"

### Phase 2: Signal Breach (15-30s)
**Narration**: "I'm adjusting port congestion from 42% to 75%. Watch what happens."

**Action**: 
- Change Port Congestion to 75
- Click "Set"
- Within 3 seconds, Sentinel detects breach
- Status turns red: "THRESHOLD BREACH DETECTED | Aggregate Risk: 68% | Trigger: 65%"

**Key Point**: "The system triggered itself. No human clicked 'execute'."

### Phase 3: Autonomous Reasoning (30-60s)
**Narration**: "Now watch the agents reason through this autonomously."

**Action**: Point to System State panel
- States progress: AT_RISK → ANALYZING → GENERATING_OPTIONS → DECISION_PENDING → NEGOTIATING
- Show "Active Agent" changing in real-time

**Narration**: "Notice the Negotiating phase - two attempts. First fails, second succeeds. The system retries automatically."

### Phase 4: Financial Decision (60-75s)
**Action**: Decision Log appears

**Narration**: "Here's the autonomous decision trace. Look at three critical things:"

**Point to**: 
1. **Negotiation Summary**: "Three options evaluated. Two rejected - one for budget, one for SLA risk. One selected."
2. **Financial Guardrails**: "Recovery budget ceiling limit. Spent less. The agent had authority but didn't overspend."
3. **Decision Confidence**: "82% confidence. 6% residual risk. The system knows it's not perfect."

### Phase 5: Execution Proof (75-90s)
**Action**: Point to updated panels

**Narration**: "Three things changed without human approval:"
1. **Shipment Status**: "Supplier changed. Status: REROUTED."
2. **Financial Status**: "Emergency reserve decreased. Transaction logged."
3. **Post-Execution Monitoring**: "System is now monitoring if the action actually worked."

### Phase 6: NO ACTION Demo (90-110s)
**Narration**: "Let me show you something unique. Sometimes the smartest decision is no action."

**Action**:
- Reset Port Congestion to 50%
- Trigger small ETA drift (12 hours)
- Wait for system to process

**Result**: Decision log shows NO ACTION
- "Cost of intervention exceeds projected loss"
- "System continues monitoring without intervention"

**Narration**: "The agent decided spending money wasn't justified. That's real autonomy - knowing when NOT to act."

### Closing (110-120s)
**Narration**: "To summarize what you saw:"
- "Continuous monitoring without button clicks"
- "Progressive reasoning with visible failures and retries"
- "Financial authority with explicit guardrails"
- "Uncertainty awareness - confidence and risk metrics"
- "Autonomous NO ACTION decisions"

**Final Point**: "Zero human interventions. The system detected, reasoned, failed, retried, decided, spent money, and justified itself - all autonomously."

## Judge Questions - Strong Answers

**Q: "How do I know this isn't scripted?"**
**A**: "Change any signal value. Change the delay hours. The Negotiator will select different options based on the financial constraints. It's reasoning, not following a tree."

**Q: "What if the agent makes a bad decision?"**
**A**: "Two safeguards: Recovery budget ceiling limits spending. Post-execution monitoring tracks if the decision worked. In production, bad outcomes feed back to agent prompt refinement."

**Q: "Why is this better than human decision-making?"**
**A**: "Speed. This took 8 seconds. A human approval chain takes hours or days. By then, the SLA is breached and the customer is lost."

**Q: "What about the NO ACTION feature?"**
**A**: "That's what separates real autonomy from automation. The agent understands opportunity cost. It's not trigger-happy - it acts only when financially justified."
