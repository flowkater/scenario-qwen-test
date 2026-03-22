#!/bin/bash
cd /Users/flowkater/Projects/scenario-qwen-test

TCS="tc-01 tc-02 tc-03 tc-04 tc-05 tc-06 tc-07 tc-08 tc-09"
PATHS="A B C"

for tc in $TCS; do
  for path in $PATHS; do
    echo ">>> Running $tc $path..."
    npx tsx src/index.ts judge-v6 $tc $path 2>&1 | grep -E "\[V6 Judge\]|saved|Result|error" || true
    echo "<<< Done $tc $path"
  done
done

echo "=== ALL DONE ==="
