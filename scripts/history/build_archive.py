#!/usr/bin/env python3
"""Build a limited, factual 4D archive from committed results.json snapshots.

No network, scraper, prediction, generated numbers or workflow mutation. Default
mode collects HEAD's committed blob before the existing scraper runs. --seed
rebuilds from the selected ref's complete first-parent source history.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone


REPOSITORY = "https://github.com/angelina5665/4dttbwebsite"
SOURCE_PATH = "results.json"
MYT = timezone(timedelta(hours=8))
PROVIDERS = {
    "damacai": "Damacai 4D",
    "magnum": "Magnum 4D",
    "toto": "Toto 4D",
    "singapore": "Singapore 4D",
    "sabah88": "Sabah88 4D",
    "sandakan": "Sandakan 4D",
    "cashsweep": "Cashsweep 4D",
    "gd4d": "Grand Dragon 4D",
}
TOP_PRIZES = ("first", "second", "third")
LIST_PRIZES = ("special", "consolation")
HEX40 = re.compile(r"[0-9a-f]{40}\Z")
NUMBER = re.compile(r"[0-9]{4}\Z")
SOURCE_DATE = re.compile(r"[0-9]{2}-[0-9]{2}-[0-9]{4}\Z")
ISO_DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}\Z")
PLACEHOLDERS = (None, "", "----", "---", "-", "—")


class ArchiveError(ValueError):
    """Invalid source or archive; leave the prior output untouched."""


def git(repo: Path, *arguments: str) -> bytes:
    result = subprocess.run(
        ["git", "-c", f"safe.directory={repo.resolve().as_posix()}", *arguments],
        cwd=repo, capture_output=True, check=False,
    )
    if result.returncode:
        raise ArchiveError(result.stderr.decode("utf-8", "replace").strip())
    return result.stdout


def parse_timestamp(value: str) -> datetime:
    if not isinstance(value, str):
        raise ArchiveError("Source timestamp must be a string")
    try:
        stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ArchiveError("Invalid source timestamp") from error
    if stamp.tzinfo is None:
        raise ArchiveError("Source timestamp must include its timezone")
    return stamp


def source_for(commit: str, blob: str, committed_at: str, updated=None) -> dict:
    if not HEX40.fullmatch(commit) or not HEX40.fullmatch(blob):
        raise ArchiveError("Source commit and blob must be full SHA-1 identifiers")
    stamp = parse_timestamp(committed_at).astimezone(timezone.utc)
    return {
        "commit": commit,
        "blob": blob,
        "url": f"{REPOSITORY}/blob/{commit}/{SOURCE_PATH}",
        "committedAt": stamp.isoformat().replace("+00:00", "Z"),
        "resultsUpdated": updated if isinstance(updated, str) else None,
    }


def snapshot(repo: Path, revision: str) -> tuple[dict, dict]:
    """Read immutable Git objects only; never open working-tree results.json."""
    commit = git(repo, "rev-parse", "--verify", "--end-of-options", f"{revision}^{{commit}}").decode().strip()
    blob = git(repo, "rev-parse", "--verify", f"{commit}:{SOURCE_PATH}").decode().strip()
    stamp = git(repo, "show", "-s", "--format=%cI", commit).decode().strip()
    raw = git(repo, "cat-file", "blob", blob)
    actual_blob = hashlib.sha1(f"blob {len(raw)}\0".encode() + raw).hexdigest()
    if actual_blob != blob:
        raise ArchiveError("Git results blob digest mismatch")
    try:
        payload = json.loads(raw.decode("utf-8-sig"))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ArchiveError(f"Malformed committed results JSON at {commit}") from error
    if not isinstance(payload, dict) or not isinstance(payload.get("providers"), dict):
        raise ArchiveError(f"Missing providers object at {commit}")
    return payload, source_for(commit, blob, stamp, payload.get("updated"))


def draw_date(value, captured_at: str):
    """Never infer missing provider dates from the global draw date."""
    if not isinstance(value, str) or not SOURCE_DATE.fullmatch(value):
        return None
    try:
        parsed = datetime.strptime(value, "%d-%m-%Y").date()
    except ValueError:
        return None
    if parsed > parse_timestamp(captured_at).astimezone(MYT).date():
        return None
    return parsed.isoformat()


def extract(payload: dict, source: dict) -> tuple[list[dict], dict]:
    if not isinstance(payload, dict) or not isinstance(payload.get("providers"), dict):
        raise ArchiveError("Snapshot has no providers object")
    counts = Counter()
    records = []
    for provider_id, provider in payload["providers"].items():
        if provider_id not in PROVIDERS:
            counts["excludedProductOrUnknownProvider"] += 1
            continue
        if not isinstance(provider, dict):
            counts["invalidProviderObject"] += 1
            continue
        name = provider.get("name", "")
        if not isinstance(name, str) or re.search(r"(?:1\+3D|\b[356]D\b)", name, re.I):
            counts["excludedProductOrUnknownProvider"] += 1
            continue
        day = draw_date(provider.get("drawDate"), source["committedAt"])
        if day is None:
            counts["missingInvalidOrFutureProviderDate"] += 1
            continue

        def number(value):
            if isinstance(value, str) and NUMBER.fullmatch(value):
                return value
            counts["placeholder" if value in PLACEHOLDERS else "invalidNumber"] += 1
            return None

        prizes = {category: number(provider.get(category)) for category in TOP_PRIZES}
        for category in LIST_PRIZES:
            values = provider.get(category, [])
            if isinstance(values, list) and len(values) > 30:
                raise ArchiveError(f"{provider_id} {category} exceeds 30 source slots; refusing truncation")
            if not isinstance(values, list):
                counts["invalidPrizeList"] += 1
                values = []
            prizes[category] = [valid for value in values if (valid := number(value)) is not None]
        if not any(prizes.values()):
            counts["emptyProviderDraw"] += 1
            continue
        draw_no = provider.get("drawNo")
        if isinstance(draw_no, str) and len(draw_no) > 60:
            raise ArchiveError(f"{provider_id} drawNo exceeds 60 characters; refusing truncation")
        if draw_no is not None and not isinstance(draw_no, str):
            counts["invalidDrawNumber"] += 1
            draw_no = None
        records.append({
            "providerId": provider_id,
            "date": day,
            "drawNo": draw_no or None,
            "prizes": prizes,
            "source": copy.deepcopy(source),
        })
    return records, dict(sorted(counts.items()))


def coverage(draws: list[dict]) -> dict:
    days = [draw["date"] for draw in draws]
    return {
        "from": min(days) if days else None,
        "to": max(days) if days else None,
        "drawCount": len(draws),
        "providerCount": len({draw["providerId"] for draw in draws}),
        "snapshotCount": len({draw["source"]["blob"] for draw in draws}),
        "limited": True,
    }


def make_archive(draws: list[dict]) -> dict:
    ordered = sorted(draws, key=lambda draw: (draw["date"], draw["providerId"]), reverse=True)
    return {
        "schemaVersion": 1,
        "providers": [{"id": key, "name": name} for key, name in PROVIDERS.items()],
        "coverage": coverage(ordered),
        "draws": ordered,
    }


def validate_archive(value) -> dict:
    if not isinstance(value, dict) or set(value) != {"schemaVersion", "providers", "coverage", "draws"}:
        raise ArchiveError("Invalid archive structure")
    if value["schemaVersion"] != 1 or isinstance(value["schemaVersion"], bool):
        raise ArchiveError("Unsupported archive schema")
    if value["providers"] != make_archive([])["providers"] or not isinstance(value["draws"], list):
        raise ArchiveError("Invalid archive provider catalog or draws")
    keys = set()
    for draw in value["draws"]:
        if not isinstance(draw, dict) or set(draw) != {"providerId", "date", "drawNo", "prizes", "source"}:
            raise ArchiveError("Invalid draw structure")
        provider_id, day, source = draw["providerId"], draw["date"], draw["source"]
        if provider_id not in PROVIDERS or not isinstance(day, str) or not ISO_DATE.fullmatch(day):
            raise ArchiveError("Invalid archived provider/date")
        try:
            parsed = datetime.strptime(day, "%Y-%m-%d").date()
        except ValueError as error:
            raise ArchiveError("Impossible archived date") from error
        if not isinstance(source, dict) or set(source) != {"commit", "blob", "url", "committedAt", "resultsUpdated"}:
            raise ArchiveError("Invalid source structure")
        try:
            expected = source_for(source["commit"], source["blob"], source["committedAt"], source["resultsUpdated"])
        except (TypeError, KeyError) as error:
            raise ArchiveError("Invalid archived source") from error
        if source != expected or parsed > parse_timestamp(source["committedAt"]).astimezone(MYT).date():
            raise ArchiveError("Invalid provenance or future archived draw")
        if draw["drawNo"] is not None and (not isinstance(draw["drawNo"], str) or not draw["drawNo"] or len(draw["drawNo"]) > 60):
            raise ArchiveError("Invalid draw number")
        prizes = draw["prizes"]
        if not isinstance(prizes, dict) or set(prizes) != set(TOP_PRIZES + LIST_PRIZES):
            raise ArchiveError("Invalid prize structure")
        for category in TOP_PRIZES:
            prize = prizes[category]
            if prize is not None and (not isinstance(prize, str) or not NUMBER.fullmatch(prize)):
                raise ArchiveError("Archived prize must be an exact four-digit string")
        for category in LIST_PRIZES:
            if not isinstance(prizes[category], list) or len(prizes[category]) > 30 or any(not isinstance(n, str) or not NUMBER.fullmatch(n) for n in prizes[category]):
                raise ArchiveError("Invalid archived prize list")
        if not any(prizes.values()):
            raise ArchiveError("Empty archived provider draw")
        key = (provider_id, day)
        if key in keys:
            raise ArchiveError("Duplicate provider/date in archive")
        keys.add(key)
    if value != make_archive(value["draws"]):
        raise ArchiveError("Archive coverage, ordering or catalog does not match its records")
    if type(value["coverage"].get("limited")) is not bool or any(
        type(value["coverage"].get(key)) is not int
        for key in ("drawCount", "providerCount", "snapshotCount")
    ):
        raise ArchiveError("Archive coverage has invalid boolean/count types")
    return value


def merge(existing: dict, records: list[dict], *, replace_equal=False) -> tuple[dict, list[dict]]:
    validate_archive(existing)
    keyed = {(draw["providerId"], draw["date"]): copy.deepcopy(draw) for draw in existing["draws"]}
    conflicts = []
    for draw in records:
        key = (draw["providerId"], draw["date"])
        previous = keyed.get(key)
        if previous:
            old_stamp = parse_timestamp(previous["source"]["committedAt"])
            new_stamp = parse_timestamp(draw["source"]["committedAt"])
            if new_stamp < old_stamp:
                continue
            same_data = (previous["prizes"], previous["drawNo"]) == (draw["prizes"], draw["drawNo"])
            if same_data and not replace_equal:
                continue
            if not same_data:
                conflicts.append({
                    "providerId": key[0], "date": key[1],
                    "previousCommit": previous["source"]["commit"],
                    "selectedCommit": draw["source"]["commit"],
                    "changedCategories": [c for c in TOP_PRIZES + LIST_PRIZES if previous["prizes"][c] != draw["prizes"][c]],
                    "drawNumberChanged": previous["drawNo"] != draw["drawNo"],
                })
        keyed[key] = copy.deepcopy(draw)
    result = make_archive(list(keyed.values()))
    validate_archive(result)
    return result, conflicts


def serialize(value: dict) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def write_if_changed(path: Path, content: bytes) -> bool:
    if path.exists() and path.read_bytes() == content:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    owned = False
    try:
        temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
        # Exclusive creation fails immediately on permission errors. In contrast,
        # Windows tempfile may repeatedly mistake sandbox denial for collisions.
        with temporary.open("xb") as handle:
            owned = True
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if owned and temporary is not None and temporary.exists():
            temporary.unlink()
    return True


def build(repo: Path, output: Path, *, seed=False, ref="HEAD") -> tuple[dict, dict]:
    if output.exists():
        try:
            existing = validate_archive(json.loads(output.read_text(encoding="utf-8")))
        except (UnicodeError, json.JSONDecodeError) as error:
            raise ArchiveError("Existing archive is malformed; refusing overwrite") from error
    else:
        existing = make_archive([])
    if seed:
        if git(repo, "rev-parse", "--is-shallow-repository").decode().strip() == "true":
            raise ArchiveError("Seed needs a full clone; refusing misleading shallow-history archive")
        resolved = git(repo, "rev-parse", "--verify", "--end-of-options", f"{ref}^{{commit}}").decode().strip()
        revisions = git(repo, "log", "--first-parent", "--reverse", "--format=%H", resolved, "--", SOURCE_PATH).decode().splitlines()
        result = make_archive([])
    else:
        revisions = [ref]
        result = existing
    report = {"mode": "seed" if seed else "update", "snapshotsRead": 0, "exclusions": {}, "conflicts": []}
    exclusions = Counter()
    for revision in revisions:
        payload, source = snapshot(repo, revision)
        records, skipped = extract(payload, source)
        exclusions.update(skipped)
        result, conflicts = merge(result, records, replace_equal=seed)
        report["conflicts"].extend(conflicts)
        report["snapshotsRead"] += 1
    report["exclusions"] = dict(sorted(exclusions.items()))
    report["coverage"] = result["coverage"]
    report["providerCoverage"] = [
        {"id": provider_id, "from": min(days), "to": max(days), "drawCount": len(days)}
        for provider_id in PROVIDERS
        if (days := [draw["date"] for draw in result["draws"] if draw["providerId"] == provider_id])
    ]
    return result, report


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--output", type=Path, default=Path("history-data.json"))
    parser.add_argument("--seed", action="store_true", help="Rebuild from complete first-parent Git source history")
    parser.add_argument("--ref", default="HEAD", help="Committed revision to ingest, or tip of --seed history")
    parser.add_argument("--report", type=Path, help="Optional detailed review JSON; never part of the website by default")
    parser.add_argument("--check", action="store_true", help="Validate and report without writing output")
    args = parser.parse_args(argv)
    output = args.output if args.output.is_absolute() else args.repo / args.output
    try:
        archive, report = build(args.repo, output, seed=args.seed, ref=args.ref)
        if not archive["draws"]:
            raise ArchiveError("No usable committed 4D records; refusing an empty production archive")
        report["changed"] = not output.exists() or output.read_bytes() != serialize(archive)
        if not args.check:
            write_if_changed(output, serialize(archive))
            if args.report:
                write_if_changed(args.report, serialize(report))
        print(json.dumps({key: value for key, value in report.items() if key != "conflicts"}, ensure_ascii=False))
        print(f"Conflict observations: {len(report['conflicts'])}")
        return 0
    except (ArchiveError, OSError, TypeError, KeyError) as error:
        print(f"Archive not written: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
