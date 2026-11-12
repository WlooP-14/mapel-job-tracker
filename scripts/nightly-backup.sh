#!/usr/bin/env bash
set -euo pipefail
: "${BACKUP_DATABASE_URL:?}" "${BACKUP_S3_BUCKET:?}" "${BACKUP_GPG_PUBLIC_KEY:?}"
: "${SOURCE_S3_ENDPOINT:?}" "${SOURCE_S3_KEY_ID:?}" "${SOURCE_S3_SECRET:?}" "${SOURCE_S3_REGION:?}"
kind=${BACKUP_KIND:-nightly}
case "$kind" in
  nightly) ;;
  weekly) [ "${WEEKLY_CONFIGURED:-false}" = true ] || { echo 'Configure the independent weekly destination.' >&2; exit 1; } ;;
  *) echo 'Unknown backup destination.' >&2; exit 1 ;;
esac
umask 077
workspace=$(mktemp -d)
trap 'rm -rf -- "$workspace"' EXIT
export GNUPGHOME="$workspace/keys"
mkdir -m 700 "$GNUPGHOME" "$workspace/payload" "$workspace/payload/bom-sources"
printf '%s' "$BACKUP_GPG_PUBLIC_KEY" | gpg --batch --import
recipient=$(gpg --batch --with-colons --list-keys | awk -F: '$1 == "fpr" {print $10; exit}')
[ -n "$recipient" ]
docker run --rm -e BACKUP_DATABASE_URL postgres:17 sh -c 'exec pg_dump --no-owner --no-acl --format=custom "$BACKUP_DATABASE_URL"' > "$workspace/payload/database.dump"
test -s "$workspace/payload/database.dump"
AWS_ACCESS_KEY_ID="$SOURCE_S3_KEY_ID" AWS_SECRET_ACCESS_KEY="$SOURCE_S3_SECRET" AWS_DEFAULT_REGION="$SOURCE_S3_REGION" \
  aws --endpoint-url "$SOURCE_S3_ENDPOINT" s3 sync s3://bom-sources/ "$workspace/payload/bom-sources/" --only-show-errors

backup_file="$workspace/backup.tar.gpg"
tar -C "$workspace/payload" -cf - database.dump bom-sources | gpg --batch --yes --trust-model always --encrypt --recipient "$recipient" --output "$backup_file"
aws s3api put-object --bucket "$BACKUP_S3_BUCKET" --key "$kind/$(date -u +%Y/%m/%dT%H%M%SZ)-${GITHUB_RUN_ID:-manual}-${GITHUB_RUN_ATTEMPT:-1}.tar.gpg" --body "$backup_file" >/dev/null
