#!/usr/bin/env bash
j=$1; max=${2:-2700}; stall=${3:-1200}; t=0; last=$(stat -c %Y "$j" 2>/dev/null || echo 0)
while [ $t -lt $max ]; do
  sleep 30; t=$((t+30))
  now=$(stat -c %Y "$j" 2>/dev/null || echo 0)
  if [ "$now" != "$last" ]; then last=$now; fi
  if [ $(( $(date +%s) - last )) -ge $stall ]; then echo "STALL: journal unchanged for ${stall}s"; break; fi
done
echo "elapsed ${t}s"; jq -r '.type' "$j" | sort | uniq -c; jq -r 'select(.type=="started") | .label' "$j" | tail -6 | tr '\n' ' '; echo
