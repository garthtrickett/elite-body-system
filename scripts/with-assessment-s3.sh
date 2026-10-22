#!/usr/bin/env bash
set -euo pipefail

assessment_container=$(docker run --rm -d --memory=768m --cpus=1 \
  --label elite-body-system.test=true -p 127.0.0.1::9090 \
  -e JAVA_TOOL_OPTIONS=-Xmx256m \
  -e COM_ADOBE_TESTING_S3MOCK_STORE_INITIAL_BUCKETS=onboarding-test \
  adobe/s3mock@sha256:ab01a6946750f451ca215a47e91030695b260e4003b8a5a6201d25029b8fca92)
cleanup() { docker stop "$assessment_container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
assessment_mapped=$(docker port "$assessment_container" 9090/tcp)
assessment_port=${assessment_mapped##*:}
export TEST_ASSESSMENT_S3_ENDPOINT="http://127.0.0.1:$assessment_port"
assessment_ready=false
for _ in {1..60}; do
  if curl -fsS "$TEST_ASSESSMENT_S3_ENDPOINT/favicon.ico" >/dev/null 2>&1; then assessment_ready=true; break; fi
  if [[ $(docker inspect "$assessment_container" --format '{{.State.Running}}') != true ]]; then break; fi
  sleep 1
done
if [[ "$assessment_ready" != true ]]; then docker logs --tail 20 "$assessment_container" >&2; exit 1; fi
"$@"
