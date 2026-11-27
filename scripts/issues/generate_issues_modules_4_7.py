#!/usr/bin/env python3
"""Generate scripts/issues/create_issues_modules_4_7.sh from docs/course/backlog-module-{4,5,6,7}.md.

Usage (from the repository root):
    python3 -B scripts/issues/generate_issues_modules_4_7.py

The backlog documents are the single source of truth. Edit them, then run this generator again;
never edit the generated shell script by hand.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "scripts" / "issues" / "create_issues_modules_4_7.sh"

MODULES = {
    4: ("Module 4: Foundation and Platform", "Repository foundation, CI and DevSecOps, PostgreSQL and Redis, public API, production hardening."),
    5: ("Module 5: Identity", "Passkeys, OIDC single sign-on, recovery and device sessions, adaptive authentication."),
    6: ("Module 6: Detection and Response", "Threat intelligence and ATT&CK, incident cases, SOAR-lite playbooks, Merkle audit log with a witness."),
    7: ("Module 7: Helpdesk and Data Protection", "Comments and attachments, SLAs, real-time updates, search and reports, GDPR toolkit."),
}

# epic number -> (label slug, colour)
EPIC_LABELS = {
    19: ("epic:repo-foundation", "#4c566a"),
    20: ("epic:devsecops", "#d29922"),
    21: ("epic:postgres", "#336791"),
    22: ("epic:redis", "#c0392b"),
    23: ("epic:public-api", "#0e8a16"),
    24: ("epic:prod-hardening", "#6f42c1"),
    25: ("epic:passkeys", "#0b7285"),
    26: ("epic:oidc-sso", "#5319e7"),
    27: ("epic:recovery-sessions", "#e36209"),
    28: ("epic:adaptive-auth", "#bf3989"),
    29: ("epic:threat-intel", "#8b5a2b"),
    30: ("epic:incidents", "#b60205"),
    31: ("epic:soar", "#1a7f37"),
    32: ("epic:merkle-audit", "#8250df"),
    33: ("epic:comments-attachments", "#0969da"),
    34: ("epic:sla", "#fbca04"),
    35: ("epic:realtime", "#2da44e"),
    36: ("epic:search-reports", "#5a6b8c"),
    37: ("epic:privacy", "#a2eeef"),
}

# extra topical labels per epic (labels that already exist in the repository)
EPIC_EXTRA = {
    25: ["authentication"], 26: ["authentication"], 27: ["authentication"], 28: ["authentication"],
    29: ["monitoring"], 30: ["monitoring"], 31: ["monitoring"], 32: ["monitoring"],
}

PRIORITY_LABEL = {"P0": "high-priority", "P1": "medium-priority", "P2": "low-priority"}
LABEL_MAP = {"docs": "documentation", "repo": "devops"}
TECH_LABELS = {"backend", "frontend", "database", "security", "devops", "testing", "documentation"}
AREA = {"backend": "BE", "frontend": "FE", "database": "DB", "devops": "DevOps", "testing": "QA", "documentation": "Docs"}
SIZE_TEXT = {"S": "up to 1 person-day", "M": "1-2 person-days", "L": "3-5 person-days", "XL": "6-8 person-days"}
PROVENANCE = re.compile(r"\[([A-Z]+)\]")


def sq(text):
    """Single-quote a value for bash so backticks, $ and quotes in titles stay literal."""
    return "'" + text.replace("'", "'\\''") + "'"


def parse():
    tasks = []
    epic_titles = {}
    for module in MODULES:
        path = ROOT / "docs" / "course" / f"backlog-module-{module}.md"
        text = path.read_text(encoding="utf-8")
        for m in re.finditer(r"^\| (\d+) ([A-Za-z][^|]*?)\s+\|", text, re.M):
            epic_titles[int(m.group(1))] = m.group(2).strip()
        blocks = re.split(r"^### SD-(?=\d+ / Task )", text, flags=re.M)[1:]
        for block in blocks:
            head, _, rest = block.partition("\n")
            hm = re.match(r"(\d+) / Task (\d+)\.(\d+) — (.+)$", head)
            if not hm:
                sys.exit(f"cannot parse heading: {head!r}")
            sd, epic, n, title = int(hm.group(1)), int(hm.group(2)), int(hm.group(3)), hm.group(4).strip()
            # the block ends at the next epic heading or horizontal rule section
            body = re.split(r"^(?:---|## )", rest, maxsplit=1, flags=re.M)[0]
            meta = re.search(
                r"\*\*Priority:\*\* (P\d) · \*\*Size:\*\* (\w+) · \*\*Labels:\*\* (.*?) · \*\*Depends on:\*\* (.*)", body
            )
            if not meta:
                sys.exit(f"missing metadata for SD-{sd}")
            obj = re.search(r"\*\*Objective:\*\* (.*?)\n\n", body, re.S)
            chk = re.search(r"\*\*Implementation checklist\*\*\n\n(.*?)\n\n\*\*Acceptance criteria\*\*", body, re.S)
            acc = re.search(r"\*\*Acceptance criteria\*\*\n\n(.*)", body, re.S)
            if not (obj and chk and acc):
                sys.exit(f"missing section for SD-{sd}")
            labels_raw = [x.strip() for x in meta.group(3).split(",")]
            provenance, technical = [], []
            for lab in labels_raw:
                tags = PROVENANCE.findall(lab)
                if tags:
                    provenance += [f"[{t}]" for t in tags]
                    continue
                lab = LABEL_MAP.get(lab, lab)
                if lab not in TECH_LABELS:
                    sys.exit(f"unknown label {lab!r} in SD-{sd}")
                technical.append(lab)
            tasks.append(
                dict(
                    sd=sd, module=int(re.search(r"module-(\d)", str(path)).group(1)), epic=epic, n=n, title=title,
                    priority=meta.group(1), size=meta.group(2), provenance=provenance, technical=technical,
                    depends=meta.group(4).strip(), objective=" ".join(obj.group(1).split()),
                    checklist=chk.group(1).strip("\n"), acceptance=acc.group(1).strip("\n"),
                )
            )
    return tasks, epic_titles


def main():
    tasks, epic_titles = parse()
    tasks.sort(key=lambda t: t["sd"])
    by_sd = {t["sd"]: t for t in tasks}

    def expand(text):
        def sub(m):
            t = by_sd.get(int(m.group(1)))
            return f"Task {t['epic']}.{t['n']} (SD-{t['sd']})" if t else f"SD-{m.group(1)}"
        return re.sub(r"SD-(\d+)", sub, text)

    epics = sorted({t["epic"] for t in tasks})
    assert epics == sorted(EPIC_LABELS), f"epic mismatch: {epics}"
    for e in epics:
        assert e in epic_titles, f"no title for epic {e}"

    lines = []
    w = lines.append
    w("#!/usr/bin/env bash")
    w("# =============================================================================")
    w("# SecureDesk - Modules 4 to 7 (Platform, Identity, Detection and response, Helpdesk and data protection)")
    w(f"# GitHub bootstrap: labels, milestones and {len(tasks)} issues generated from docs/course/backlog-module-{{4,5,6,7}}.md.")
    w("# GENERATED FILE: edit the backlog documents and run scripts/issues/generate_issues_modules_4_7.py again.")
    w("#")
    w("# Usage (from inside a clone of the target repository, or with GH_REPO set):")
    w("#   chmod +x scripts/issues/create_issues_modules_4_7.sh && scripts/issues/create_issues_modules_4_7.sh")
    w("#   GH_REPO=owner/securedesk SD_ASSUME_YES=1 scripts/issues/create_issues_modules_4_7.sh")
    w("#   SD_DRY_RUN=1 scripts/issues/create_issues_modules_4_7.sh      # print what would be created, call nothing")
    w("#   SD_ONLY_MODULE=4 scripts/issues/create_issues_modules_4_7.sh  # create only one module's issues")
    w("#")
    w("# Requirements: GitHub CLI (gh) authenticated with the 'repo' scope.")
    w("# Labels are idempotent (--force). Milestones and issues are created only when missing, so a run that")
    w("# failed half-way can simply be started again (issues are matched by exact title).")
    w("# Epics 19-37 continue the numbering of Modules 1-3 (Epics 1-18); tasks continue at SD-93.")
    w("#")
    w("# Size scale used in every issue:")
    for k, v in SIZE_TEXT.items():
        w(f"#   {k:<2} = {v}")
    w("#")
    w("# Task numbering (Task <epic>.<n>) mapped to the backlog IDs (SD-xx):")
    for t in tasks:
        w(f"#   Task {t['epic']}.{t['n']} = SD-{t['sd']}  {t['title']}")
    w("# =============================================================================")
    w("set -euo pipefail")
    w("trap 'echo \"Script failed at line $LINENO. Fix the cause and run again; existing issues are skipped.\" >&2' ERR")
    w("")
    w('DRY_RUN="${SD_DRY_RUN:-0}"')
    w('ONLY_MODULE="${SD_ONLY_MODULE:-}"')
    w("")
    w('if [ "$DRY_RUN" != "1" ]; then')
    w('  command -v gh >/dev/null 2>&1 || { echo "GitHub CLI (gh) is required: https://cli.github.com" >&2; exit 1; }')
    w('  gh auth status >/dev/null 2>&1 || { echo "Not authenticated. Run: gh auth login" >&2; exit 1; }')
    w('  REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"')
    w("else")
    w('  REPO="(dry run)"')
    w("fi")
    w('echo "Target repository: $REPO"')
    n_labels = len(EPIC_LABELS)
    w(
        'if [ "$DRY_RUN" != "1" ] && [ "${SD_ASSUME_YES:-0}" != "1" ]; then '
        f'read -r -p "Create {n_labels} labels, {len(MODULES)} milestones and up to {len(tasks)} issues in $REPO? [y/N] " ANSWER; '
        'case "$ANSWER" in y|Y) ;; *) echo "Aborted."; exit 1 ;; esac; fi'
    )
    w("")
    w("# ---- helpers ----------------------------------------------------------------")
    w("create_label() { # name colour description")
    w('  if [ "$DRY_RUN" = "1" ]; then echo "[dry-run] label: $1"; return; fi')
    w('  gh label create "$1" --color "$2" --description "$3" --force')
    w("}")
    w("EXISTING_MILESTONES=''")
    w("EXISTING_TITLES=''")
    w('if [ "$DRY_RUN" != "1" ]; then')
    w("  EXISTING_MILESTONES=\"$(gh api 'repos/:owner/:repo/milestones?state=all&per_page=100' --paginate --jq '.[].title')\"")
    w("  EXISTING_TITLES=\"$(gh issue list --state all --limit 2000 --json title -q '.[].title')\"")
    w("fi")
    w("create_milestone() { # title description")
    w('  if [ "$DRY_RUN" = "1" ]; then echo "[dry-run] milestone: $1"; return; fi')
    w('  if grep -Fxq -- "$1" <<<"$EXISTING_MILESTONES"; then echo "milestone exists, skipped: $1"; return; fi')
    w('  gh api repos/:owner/:repo/milestones -f title="$1" -f state="open" -f description="$2" > /dev/null')
    w("}")
    w("CREATED=0; SKIPPED=0")
    w("create_issue() { # module title milestone labels body")
    w('  if [ -n "$ONLY_MODULE" ] && [ "$ONLY_MODULE" != "$1" ]; then return; fi')
    w('  if [ "$DRY_RUN" = "1" ]; then echo "[dry-run] issue: $2  ($3; $4)"; CREATED=$((CREATED+1)); return; fi')
    w('  if grep -Fxq -- "$2" <<<"$EXISTING_TITLES"; then echo "issue exists, skipped: $2"; SKIPPED=$((SKIPPED+1)); return; fi')
    w('  gh issue create --title "$2" --milestone "$3" --label "$4" --body "$5"')
    w("  CREATED=$((CREATED+1))")
    w("  sleep 3")
    w("}")
    w("")
    w("# =============================================================================")
    w("# STEP 1 - Labels (new epic labels; priorities and technical labels already exist)")
    w("# =============================================================================")
    w('echo "STEP 1/3: creating labels..."')
    for e in epics:
        slug, colour = EPIC_LABELS[e]
        w(f"create_label {sq(slug)} {sq(colour)} {sq(f'Epic {e}: {epic_titles[e]}')}")
    w("")
    w("# =============================================================================")
    w("# STEP 2 - Milestones (one per module; epics are labels)")
    w("# =============================================================================")
    w('echo "STEP 2/3: creating milestones..."')
    for m, (title, desc) in MODULES.items():
        w(f"create_milestone {sq(title)} {sq(desc)}")
    w("")
    w("# =============================================================================")
    w("# STEP 3 - Issues (one per task)")
    w("# =============================================================================")
    w('echo "STEP 3/3: creating issues..."')
    current_epic = None
    for t in tasks:
        if t["epic"] != current_epic:
            current_epic = t["epic"]
            w("")
            w(f"# ---- Epic {current_epic}: {epic_titles[current_epic]} ----")
        slug = EPIC_LABELS[t["epic"]][0]
        technical = list(dict.fromkeys(t["technical"] + EPIC_EXTRA.get(t["epic"], [])))
        labels = ",".join(technical + [PRIORITY_LABEL[t["priority"]], slug])
        area = ", ".join(AREA[x] for x in t["technical"] if x in AREA)
        prov = " ".join(t["provenance"])
        body = "\n".join(
            [
                "### 🎯 Objective",
                "",
                t["objective"],
                "",
                "### 🛠️ Technical Implementation Details",
                "",
                f"Section numbers below refer to `docs/course/backlog-module-{t['module']}.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, "
                "Modules 4 to 7 cover tasks 19.1 to 37.7.",
                "",
                t["checklist"],
                "",
                f"📚 Source: backlog SD-{t['sd']} (Epic {t['epic']}) · provenance {prov} · priority {t['priority']}",
                "",
                f"📏 Estimated size of issue: {t['size']} ({SIZE_TEXT[t['size']]}, {area})",
                "",
                "### ✅ Acceptance Criteria",
                "",
                t["acceptance"],
                "",
                "### 🔗 Dependencies",
                "",
                expand(t["depends"]),
            ]
        )
        assert "SDISSUE_EOF" not in body
        milestone = MODULES[t["module"]][0]
        w("IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true")
        w(body)
        w("SDISSUE_EOF")
        issue_title = f"[Task {t['epic']}.{t['n']}] {t['title']}"
        w(f'create_issue {t["module"]} {sq(issue_title)} {sq(milestone)} {sq(labels)} "$BODY"')
    w("")
    w('echo "Done: labels, milestones and issues processed in $REPO (created: $CREATED, skipped: $SKIPPED)."')
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    OUT.chmod(0o755)
    print(f"wrote {OUT.relative_to(ROOT)}: {len(tasks)} issues, {n_labels} labels, {len(MODULES)} milestones")


if __name__ == "__main__":
    main()
