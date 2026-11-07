#!/usr/bin/env bash
set -euo pipefail
: "${BACKUP_DATABASE_URL:?}" "${BACKUP_S3_BUCKET:?}" "${BACKUP_GPG_PUBLIC_KEY:?}"
umask 077
export GNUPGHOME="$(mktemp -d)"
trap 'rm -rf "$GNUPGHOME"' EXIT
printf '%s' "$BACKUP_GPG_PUBLIC_KEY" | gpg --batch --import
recipient=$(gpg --batch --with-colons --list-keys | awk -F: '$1 == "fpr" {print $10; exit}')
[ -n "$recipient" ]
backup_file="$GNUPGHOME/database.dump.gpg"
docker run --rm -e BACKUP_DATABASE_URL postgres:17 sh -c 'exec pg_dump --no-owner --no-acl --format=custom "$BACKUP_DATABASE_URL"' | gpg --batch --yes --trust-model always --encrypt --recipient "$recipient" --output "$backup_file"
aws s3api put-object --bucket "$BACKUP_S3_BUCKET" --key "nightly/$(date -u +%Y/%m/%dT%H%M%SZ)-${GITHUB_RUN_ID:-manual}.dump.gpg" --body "$backup_file" >/dev/null
