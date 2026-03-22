#!/bin/bash
# v6 Pipeline progress checker
cd /Users/flowkater/Projects/scenario-qwen-test

RESULT=$(python3 << 'PYEOF'
import json, glob

has_plan = 0
no_plan = 0
empty = 0
fails = []
empty_tcs = []

for f in sorted(glob.glob('data/v6/results/tc-*.json')):
    name = f.split('/')[-1].replace('.json','')
    if '-judge' in name: continue
    d = json.load(open(f))
    pr = d.get('pipelineResult',{})
    results = pr.get('results',[])
    fp = pr.get('finalPlan')
    if not results:
        empty += 1
        empty_tcs.append(name)
    elif fp and fp.get('action') == 'generate_plan':
        has_plan += 1
    else:
        no_plan += 1
        fails.append(name)

total_run = has_plan + no_plan
pct = f"{has_plan/total_run*100:.0f}" if total_run else "0"
print(f"✅ {has_plan} plan | ❌ {no_plan} over-ask | ⏳ {empty} pending | run {total_run}/132 ({total_run*100//132}%) | pass {pct}%")
if empty > 0:
    tc_ids = sorted(set(n.rsplit('-',1)[0] for n in empty_tcs))
    print(f"Remaining: {' '.join(tc_ids[:10])}{'...' if len(tc_ids)>10 else ''}")
if fails:
    print(f"Fails: {' '.join(fails[:10])}{'...' if len(fails)>10 else ''}")

# Check running processes
import subprocess
ps = subprocess.run(['pgrep', '-f', 'judge-v6'], capture_output=True, text=True)
procs = len(ps.stdout.strip().split('\n')) if ps.stdout.strip() else 0
print(f"Active processes: {procs}")
PYEOF
)

echo "$RESULT"
