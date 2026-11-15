#!/usr/bin/env bash
#
# Keep asking Oracle for the free Ampere instance until a host is free.
#
#   ops/oci_launch_retry.sh
#
# WHY THIS EXISTS. Oracle's Always Free A1 capacity in ap-hyderabad-1 is
# usually exhausted, and the console answers "Out of capacity for shape
# VM.Standard.A1.Flex in availability domain AD-1". Capacity reappears for
# seconds at a time when somebody else terminates an instance, so the way
# to get one is to ask repeatedly rather than to click repeatedly. Two
# attempts by hand on 14 Nov 2026 both failed; this is the same request on
# a loop.
#
# It stops the moment a launch succeeds, and it NEVER asks for anything
# outside the Always Free allowance: 1 OCPU, 6 GB, one 100 GB boot volume
# inside the free 200 GB. Raising OCPUS or MEMORY above 4 / 24 would start
# billing, which is why they are constants here and not arguments.
#
# THE 12-HOUR HANG, 15 Nov 2026. Both of the following were true at once
# and together they made a dead loop look like a working one:
#
#   1. The session expired before the refresh was due, and the CLI did not
#      fail -- it ASKED: "Do you want to re-authenticate your CLI session
#      profile? [Y/n]:" and waited. With no tty answering, attempt 7 blocked
#      forever. The loop sat there for 12h50m with a live PID, a quiet log
#      and zero requests sent. Hence </dev/null on the launch call: a
#      prompt that cannot be answered must fail, not wait.
#
#   2. The fatal-error test looked for 'token.*expired'. The CLI says
#      "This CLI session has expired". It did not match, so even once the
#      text arrived it was filed under "unrecognised, retry anyway".
#
# The lesson worth keeping: an unattended loop must treat a QUESTION as an
# error. Anything that can block on stdin will eventually block on stdin.
#
# The CLI session token lasts 60 minutes, so the loop refreshes it every
# REFRESH_EVERY attempts. If the refresh fails -- usually because the
# token expired while the laptop slept -- the script stops and tells you
# to authenticate again, rather than spinning silently on 401s.

set -uo pipefail

PROFILE="${OCI_PROFILE:-messconnect}"
export OCI_CLI_AUTH=security_token

# --- The request. Free-tier bounds; do not raise. -------------------------
OCPUS=1
MEMORY=6           # GB. Oracle's free ratio is 6 GB per OCPU, and the whole
                   # Always Free Ampere allowance is 4 OCPU / 24 GB. Raising
                   # either past that starts billing, so they are constants.
BOOT_GB=100
SHAPE="VM.Standard.A1.Flex"
NAME="messconnect"

# WHERE TO LAUNCH. These four identify YOUR tenancy, network and image.
# They are not credentials -- an OCID grants nothing without a signed
# request -- but they name your account, and this repository is public, so
# they live in a gitignored file beside this script rather than in it:
#
#   ops/.oci-target.env   (not committed; see .gitignore)
#     OCI_COMPARTMENT_ID=ocid1.tenancy.oc1..xxxx
#     OCI_AD=ABCD:AP-HYDERABAD-1-AD-1
#     OCI_SUBNET_ID=ocid1.subnet.oc1.ap-hyderabad-1.xxxx
#     OCI_IMAGE_ID=ocid1.image.oc1.ap-hyderabad-1.xxxx
#
# Environment variables win over the file, so CI or a one-off run can
# override without editing anything.
TARGET_ENV="$(dirname "$0")/.oci-target.env"
# shellcheck disable=SC1090
[ -f "$TARGET_ENV" ] && . "$TARGET_ENV"

COMPARTMENT="${OCI_COMPARTMENT_ID:-}"
AD="${OCI_AD:-}"
SUBNET="${OCI_SUBNET_ID:-}"
IMAGE="${OCI_IMAGE_ID:-}"

for _v in COMPARTMENT AD SUBNET IMAGE; do
    eval "_val=\${$_v}"
    [ -n "$_val" ] || {
        echo "missing $_v. Set it in $TARGET_ENV or the environment." >&2
        echo "See the comment above this check for the four names." >&2
        exit 64
    }
done
SSH_KEY="$HOME/.ssh/id_ed25519_messconnect.pub"

SLEEP="${SLEEP:-300}"         # seconds between attempts. 45s got
                              # rate-limited (429) by attempt 3 on
                              # 15 Nov 2026; 5 min is sustainable.
THROTTLE_WAIT="${THROTTLE_WAIT:-900}"  # longer pause after a 429
REFRESH_EVERY="${REFRESH_EVERY:-6}"    # refresh the token every N attempts.
                              # Sessions die at 60 min; at SLEEP=300 that
                              # is 10 attempts, so refresh before then.
LOG="$(dirname "$0")/backups/oci-launch-retry.log"

mkdir -p "$(dirname "$LOG")"
[ -f "$SSH_KEY" ] || { echo "missing $SSH_KEY" >&2; exit 1; }

say() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG"; }

say "starting: $SHAPE ${OCPUS} OCPU / ${MEMORY} GB / ${BOOT_GB} GB boot, every ${SLEEP}s"
say "stop with Ctrl-C; progress is appended to $LOG"

n=0
while :; do
    n=$((n + 1))

    OUT="$(oci compute instance launch \
        --profile "$PROFILE" \
        --compartment-id "$COMPARTMENT" \
        --availability-domain "$AD" \
        --subnet-id "$SUBNET" \
        --image-id "$IMAGE" \
        --shape "$SHAPE" \
        --shape-config "{\"ocpus\":${OCPUS},\"memoryInGBs\":${MEMORY}}" \
        --boot-volume-size-in-gbs "$BOOT_GB" \
        --display-name "$NAME" \
        --assign-public-ip true \
        --ssh-authorized-keys-file "$SSH_KEY" \
        --wait-for-state RUNNING \
        </dev/null 2>&1)"   # </dev/null: see THE 12-HOUR HANG below
    STATUS=$?

    if [ "$STATUS" -eq 0 ]; then
        say "LAUNCHED after $n attempts"
        printf '%s\n' "$OUT" >> "$LOG"
        IP="$(oci compute instance list-vnics --profile "$PROFILE" \
              --instance-id "$(printf '%s' "$OUT" | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["id"])' 2>/dev/null)" \
              --query 'data[0]."public-ip"' --raw-output 2>/dev/null)"
        say "public IP: ${IP:-check the console}"
        printf '\a'
        exit 0
    fi

    # RETRY BY DEFAULT; EXIT ONLY ON AUTH. The first two versions of this
    # listed what to retry and exited on everything else, and both died on
    # the first attempt because Oracle's normal responses did not look the
    # way I guessed:
    #   capacity  -> HTTP 500, code "InternalError", message "Out of host
    #                capacity."   (not a capacity code, and the console's
    #                wording "out of capacity" does not match it)
    #   throttle  -> HTTP 429, code "TooManyRequests"
    # Neither is fatal, and a loop that exits on them is worse than no loop
    # because it looks like it is working. So the only fatal case is one we
    # cannot retry our way out of: an expired session.
    if printf '%s' "$OUT" | grep -qiE 'NotAuthenticated|401|InvalidToken|token.*expired|session has expired|re-authenticate'; then
        say ""
        say "session expired after $n attempts. Run this, then start again:"
        say "  oci session authenticate --region ap-hyderabad-1 --profile-name $PROFILE"
        exit 1
    fi

    WAIT="$SLEEP"
    if printf '%s' "$OUT" | grep -qiE 'out of host capacity|out of capacity|outofhostcapacity'; then
        printf '\r%s  attempt %d: out of capacity        ' "$(date '+%H:%M:%S')" "$n"
    elif printf '%s' "$OUT" | grep -qiE 'TooManyRequests|429|rate.?limit'; then
        # Being throttled means we asked too fast. Backing off is not just
        # politeness: while throttled, attempts are rejected before Oracle
        # even looks for capacity, so hammering REDUCES the chance of
        # catching a free host.
        WAIT="$THROTTLE_WAIT"
        say ""
        say "attempt $n: rate-limited by Oracle, backing off ${WAIT}s"
    else
        # Unknown. Log it in full so it is diagnosable, but keep going --
        # an unrecognised transient must not end the run.
        say ""
        say "attempt $n: unrecognised response, retrying anyway. Full text:"
        printf '%s\n' "$OUT" | tail -20 >> "$LOG"
    fi

    if [ $((n % REFRESH_EVERY)) -eq 0 ]; then
        oci session refresh --profile "$PROFILE" >/dev/null 2>&1 \
            && say "" && say "token refreshed at attempt $n" \
            || { say ""; say "token refresh failed -- re-authenticate and restart"; exit 1; }
    fi

    sleep "$WAIT"
done
