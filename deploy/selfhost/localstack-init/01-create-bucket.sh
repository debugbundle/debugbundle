#!/bin/sh
set -eu

awslocal s3api head-bucket --bucket "${S3_BUCKET:-debugbundle-raw-events}" >/dev/null 2>&1 || \
  awslocal s3 mb "s3://${S3_BUCKET:-debugbundle-raw-events}"