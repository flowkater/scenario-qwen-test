#!/usr/bin/env python3
import subprocess
import os
import json

tcs = ['tc-10','tc-11','tc-12','tc-13','tc-14','tc-15','tc-16','tc-17','tc-18']
paths = ['A', 'B', 'C']

env = os.environ.copy()
env['PATH'] = '/Users/flowkater/.nvm/versions/node/v23.11.1/bin:' + env.get('PATH', '')

results = {}
for tc in tcs:
    for path in paths:
        key = f"{tc}-{path}"
        print(f"=== Running {key} ===", flush=True)
        try:
            r = subprocess.run(
                ['npx', 'tsx', 'src/index.ts', 'judge-v6', tc, path],
                capture_output=True, text=True, cwd='/Users/flowkater/Projects/scenario-qwen-test',
                env=env, timeout=60
            )
            print(r.stdout, flush=True)
            if r.returncode != 0:
                print(f"STDERR: {r.stderr}", flush=True)
                results[key] = 'error'
            else:
                results[key] = 'ok'
        except Exception as e:
            print(f"Exception: {e}", flush=True)
            results[key] = f'exception: {e}'

print("\n=== Summary ===")
for k, v in results.items():
    print(f"{k}: {v}")
