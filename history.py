"""Local history tracking for HandleCheck.

Every successful lookup is saved as a timestamped snapshot in a small SQLite
database. On each new lookup for an account already seen before, the previous
snapshot is compared against the fresh one and a short, human-readable
summary of what changed (followers, name, bio, and so on) is produced. This
is what powers the "delta" column in the results table and export files.

The database always lives in the same folder as this file (and main.py),
as a single file: handlecheck_history.db. This is deliberately pinned to
the script's own directory rather than the process's current working
directory, so the database always ends up in the same place no matter how
or from where the app is launched.
"""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import threading
from typing import Any, List, Mapping, Optional

DB_FILENAME = "handlecheck_history.db"
DB_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    DB_FILENAME,
)


# Numeric fields worth reporting a change in, with a short label.
NUMERIC_FIELDS = (
    ("followers_count", "Followers"),
    ("following_count", "Following"),
    ("tweet_count", "Posts"),
    ("media_count", "Media"),
    ("favourites_count", "Likes"),
)

# Text fields worth flagging as changed, without printing the full old and
# new value (some, such as the bio, can be long).
TEXT_FIELDS = (
    ("screen_name", "Handle"),
    ("name", "Display name"),
    ("location", "Location"),
    ("description", "Bio"),
    ("url", "Website"),
)

# Boolean-ish fields worth flagging when flipped.
BOOL_FIELDS = (
    ("verified", "Verified"),
    ("is_blue_verified", "Blue verified"),
    ("protected", "Protected"),
)

_local = threading.local()


def _connection() -> sqlite3.Connection:
    """Return a connection private to the current thread.

    sqlite3 connections are not safe to share across threads, and lookups
    happen on a background worker thread, so each thread gets its own lazily
    created connection instead of a single module-level one.
    """
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        _local.conn = conn
    return conn


def init_db() -> None:
    """Create the snapshots table if it does not already exist."""
    conn = _connection()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            checked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            screen_name TEXT,
            name TEXT,
            followers_count INTEGER,
            following_count INTEGER,
            tweet_count INTEGER,
            media_count INTEGER,
            favourites_count INTEGER,
            verified INTEGER,
            is_blue_verified INTEGER,
            protected INTEGER,
            location TEXT,
            description TEXT,
            url TEXT,
            created_at TEXT,
            raw_json TEXT
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_snapshots_user_id "
        "ON snapshots (user_id, checked_at)"
    )
    conn.commit()
    _ensure_columns(conn)


def _ensure_columns(conn: sqlite3.Connection) -> None:
    """Add columns introduced after the initial release, if missing.

    sqlite's CREATE TABLE IF NOT EXISTS leaves an older table untouched, so
    a database created by an earlier version of HandleCheck is migrated in
    place here rather than requiring the user to delete it.
    """
    existing = {
        row[1] for row in conn.execute("PRAGMA table_info(snapshots)")
    }
    if "snapshot_hash" not in existing:
        conn.execute("ALTER TABLE snapshots ADD COLUMN snapshot_hash TEXT")
    conn.commit()


def _latest_snapshot(user_id: str) -> Optional[sqlite3.Row]:
    conn = _connection()
    return conn.execute(
        "SELECT * FROM snapshots WHERE user_id = ? "
        "ORDER BY checked_at DESC, id DESC LIMIT 1",
        (user_id,),
    ).fetchone()


def _save_snapshot(
    user_id: str,
    data: Mapping[str, Any],
    snapshot_hash: str,
) -> None:
    conn = _connection()
    conn.execute(
        """
        INSERT INTO snapshots (
            user_id, screen_name, name, followers_count, following_count,
            tweet_count, media_count, favourites_count, verified,
            is_blue_verified, protected, location, description, url,
            created_at, raw_json, snapshot_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            data.get("screen_name"),
            data.get("name"),
            data.get("followers_count"),
            data.get("following_count"),
            data.get("tweet_count"),
            data.get("media_count"),
            data.get("favourites_count"),
            int(bool(data.get("verified"))) if data.get("verified") is not None else None,
            int(bool(data.get("is_blue_verified"))) if data.get("is_blue_verified") is not None else None,
            int(bool(data.get("protected"))) if data.get("protected") is not None else None,
            data.get("location"),
            data.get("description"),
            data.get("url") or data.get("profile_website_url"),
            data.get("created_at"),
            json.dumps(data, ensure_ascii=False, default=str),
            snapshot_hash,
        ),
    )
    conn.commit()


def _describe_changes(old: sqlite3.Row, new: Mapping[str, Any]) -> list:
    changes = []

    for field, label in NUMERIC_FIELDS:
        old_val = old[field]
        new_val = new.get(field)
        if old_val is None or new_val is None:
            continue
        if old_val == new_val:
            continue
        diff = new_val - old_val
        sign = "+" if diff > 0 else ""
        changes.append(f"{label} {old_val:,} \u2192 {new_val:,} ({sign}{diff:,})")

    for field, label in TEXT_FIELDS:
        old_val = old[field]
        new_val = new.get(field)
        if not old_val or not new_val:
            continue
        if old_val != new_val:
            changes.append(f"{label} changed")

    for field, label in BOOL_FIELDS:
        old_val = old[field]
        new_val = new.get(field)
        if old_val is None or new_val is None:
            continue
        if bool(old_val) != bool(new_val):
            changes.append(f"{label}: {bool(old_val)} \u2192 {bool(new_val)}")

    return changes


def record_and_diff(
    user_id: Any,
    data: Mapping[str, Any],
) -> dict:
    """Save a new snapshot for user_id and report what changed.

    Called once per successful lookup. Compares the new data against the
    most recent snapshot on file for the same account (if any), saves the
    new snapshot (hashed for an evidentiary trail), and returns a dict with:

    - "delta": a short human-readable summary of what changed. "First
      check for this account." the first time an account is seen, "No
      change since last check." on an identical repeat, or a list of the
      specific fields that changed otherwise.
    - "hash": the SHA-256 hex digest of this snapshot's data, so the exact
      captured state can be verified later without re-fetching it.
    """
    if user_id is None:
        return {"delta": "", "hash": ""}

    user_id = str(user_id)
    previous = _latest_snapshot(user_id)

    snapshot_hash = hashlib.sha256(
        json.dumps(data, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")
    ).hexdigest()

    _save_snapshot(user_id, data, snapshot_hash)

    if previous is None:
        delta = "First check for this account."
    else:
        changes = _describe_changes(previous, data)
        delta = " \u00b7 ".join(changes) if changes else "No change since last check."

    return {"delta": delta, "hash": snapshot_hash}


def list_tracked_accounts() -> List[dict]:
    """Return one full summary row per distinct account the database has seen.

    Each row carries every data point saved for the account's most recent
    snapshot (all profile fields, not just followers), plus how many times
    it has been checked and when it was first and last seen, so the GUI's
    history viewer can display the complete picture and let the user remove
    an account's history.
    """
    conn = _connection()
    rows = conn.execute(
        """
        SELECT
            s.user_id,
            s.screen_name,
            s.name,
            s.followers_count,
            s.following_count,
            s.tweet_count,
            s.media_count,
            s.favourites_count,
            s.verified,
            s.is_blue_verified,
            s.protected,
            s.location,
            s.description,
            s.url,
            s.created_at AS account_created_at,
            s.checked_at AS last_checked_at,
            s.snapshot_hash,
            (SELECT checked_at FROM snapshots f
             WHERE f.user_id = s.user_id
             ORDER BY checked_at ASC, id ASC LIMIT 1) AS first_checked_at,
            (SELECT COUNT(*) FROM snapshots c
             WHERE c.user_id = s.user_id) AS check_count
        FROM snapshots s
        WHERE s.id = (
            SELECT id FROM snapshots latest
            WHERE latest.user_id = s.user_id
            ORDER BY checked_at DESC, id DESC
            LIMIT 1
        )
        ORDER BY s.checked_at DESC
        """
    ).fetchall()
    return [dict(row) for row in rows]


def delete_account_history(user_id: Any) -> int:
    """Delete every stored snapshot for one account.

    Returns the number of rows removed. This only clears the local change
    history for that account; it does not affect X in any way, and the
    account can be looked up again afterwards as if it were new.
    """
    if user_id is None:
        return 0
    conn = _connection()
    cursor = conn.execute(
        "DELETE FROM snapshots WHERE user_id = ?",
        (str(user_id),),
    )
    conn.commit()
    return cursor.rowcount


def clear_all_history() -> int:
    """Delete every stored snapshot for every account. Returns rows removed."""
    conn = _connection()
    cursor = conn.execute("DELETE FROM snapshots")
    conn.commit()
    return cursor.rowcount
