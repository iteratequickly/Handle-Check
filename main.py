import csv
import ctypes
import hashlib
import json
import os
import re
import threading
import time
from datetime import datetime, timezone
from tkinter import filedialog
import tkinter as tk

import eel
from dateutil import parser as dateutil_parser
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas as pdf_canvas

from twitter_username import (
    resolve,
    UserNotFound,
    UserUnavailable,
    APIError,
    TwitterUsernameError,
)
import history

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
REQUEST_DELAY_SECONDS = 2.0
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 2.0
WEB_DIR = "web"
WINDOW_WIDTH = 1100
WINDOW_HEIGHT = 700
WINDOW_TITLE = "HandleCheck"
# ---------------------------------------------------------------------------
# Shared application state
# ---------------------------------------------------------------------------
state = {
    "results": [],
    "busy": False,
    "stop_requested": False,
    # Every query already looked up in the current session, across every
    # "Continue" run since the last reset. Used so adding more usernames
    # appends to the existing results instead of restarting the whole batch.
    "processed_queries": set(),
}
state_lock = threading.Lock()
# ---------------------------------------------------------------------------
# Windows window helper
# ---------------------------------------------------------------------------
def _lock_window_size(width=WINDOW_WIDTH, height=WINDOW_HEIGHT):
    """
    Windows-only helper that removes the resize border and maximize button
    from the Eel/Chrome application window.
    """
    if os.name != "nt":
        return
    def lock_window():
        time.sleep(1.5)
        user32 = ctypes.windll.user32
        target_hwnd = None
        EnumWindowsProc = ctypes.WINFUNCTYPE(
            ctypes.c_bool,
            ctypes.c_void_p,
            ctypes.c_void_p,
        )
        def enum_windows_callback(hwnd, lParam):
            nonlocal target_hwnd
            if not user32.IsWindowVisible(hwnd):
                return True
            length = user32.GetWindowTextLengthW(hwnd)
            if length == 0:
                return True
            buffer = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(
                hwnd,
                buffer,
                length + 1,
            )
            if buffer.value == WINDOW_TITLE:
                target_hwnd = hwnd
                return False
            return True
        callback = EnumWindowsProc(enum_windows_callback)
        user32.EnumWindows(callback, 0)
        if not target_hwnd:
            target_hwnd = user32.GetForegroundWindow()
        if not target_hwnd:
            return
        GWL_STYLE = -16
        WS_THICKFRAME = 0x00040000
        WS_MAXIMIZEBOX = 0x00010000
        style = user32.GetWindowLongW(target_hwnd, GWL_STYLE)
        style &= ~WS_THICKFRAME
        style &= ~WS_MAXIMIZEBOX
        user32.SetWindowLongW(target_hwnd, GWL_STYLE, style)
        SWP_NOMOVE = 0x0002
        SWP_NOSIZE = 0x0001
        SWP_NOZORDER = 0x0004
        SWP_FRAMECHANGED = 0x0020
        user32.SetWindowPos(
            target_hwnd, 0, 0, 0, width, height,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED
        )
    threading.Thread(
        target=lock_window,
        daemon=True,
        name="WindowSizeLocker",
    ).start()
def _hidden_tk_root():
    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    return root
def _parse_queries(text):
    lines = [
        line.strip()
        for line in (text or "").splitlines()
    ]
    seen = set()
    queries = []
    for line in lines:
        if not line or line in seen:
            continue
        seen.add(line)
        queries.append(line)
    return queries
def _is_stop_requested():
    with state_lock:
        return state["stop_requested"]
def _set_busy(value):
    with state_lock:
        state["busy"] = value
def _append_result(result):
    with state_lock:
        state["results"].append(result)
def _get_results():
    with state_lock:
        return list(state["results"])
def _call_js_safe(js_func_name, *args):
    try:
        getattr(eel, js_func_name)(*args)
    except Exception:
        pass
@eel.expose
def get_config():
    return {
        "delay": REQUEST_DELAY_SECONDS,
        "max_retries": MAX_RETRIES,
        "history_db_path": history.DB_PATH,
    }
@eel.expose
def start_batch(text):
    """Look up every new query in text, on top of any existing results.

    Queries already looked up earlier in this session (since the last
    reset_batch call) are skipped, so calling this again after adding more
    usernames to the box continues the existing list rather than starting
    over. Call reset_batch first to clear everything and begin fresh.
    """
    with state_lock:
        if state["busy"]:
            return {
                "ok": False,
                "error": "A batch is already running.",
            }
    queries = _parse_queries(text)

    if not queries:
        return {
            "ok": False,
            "error": "Enter at least one username, URL, or ID.",
        }
    with state_lock:
        already_done = state["processed_queries"]
        new_queries = [q for q in queries if q not in already_done]
        if not new_queries:
            return {
                "ok": False,
                "error": (
                    "Every username, URL, or ID entered has already been "
                    "checked. Use Reset to start a new list."
                ),
            }
        state["busy"] = True
        state["stop_requested"] = False
        state["processed_queries"].update(new_queries)
        offset = len(state["results"])
    worker = threading.Thread(
        target=_batch_worker,
        args=(new_queries, offset),
        daemon=True,
        name="TwitterLookupWorker",
    )
    worker.start()
    return {
        "ok": True,
        "total": len(new_queries),
    }
@eel.expose
def stop_batch():
    with state_lock:
        if not state["busy"]:
            return {
                "ok": False,
                "error": "No batch is currently running.",
            }
        state["stop_requested"] = True
    return {"ok": True}
@eel.expose
def reset_batch():
    """Clear all results and the record of already-checked queries.

    Refuses while a batch is running, since that would discard results the
    worker thread is still writing to.
    """
    with state_lock:
        if state["busy"]:
            return {
                "ok": False,
                "error": "Cannot reset while a batch is running. Stop it first.",
            }
        state["results"] = []
        state["processed_queries"] = set()
        state["stop_requested"] = False
    return {"ok": True}
def _batch_worker(queries, offset=0):
    total = len(queries)
    overall_total = offset + total
    ok_count = 0
    fail_count = 0
    try:
        for index, query in enumerate(queries, start=1):
            if _is_stop_requested():
                break
            result = _lookup_one(query)
            _append_result(result)
            if result["ok"]:
                ok_count += 1
            else:
                fail_count += 1
            _call_js_safe(
                "onItemDone",
                result,
                offset + index,
                overall_total,
                ok_count,
                fail_count,
            )
            if index < total and not _is_stop_requested():
                time.sleep(REQUEST_DELAY_SECONDS)
    except Exception as exc:
        error_result = {
            "query": "Batch",
            "ok": False,
            "status": "Worker error",
            "error": str(exc),
            "data": None,
            "delta": "",
            "snapshot_hash": "",
        }
        _append_result(error_result)
        fail_count += 1
    finally:
        stopped = _is_stop_requested()
        _set_busy(False)
        _call_js_safe(
            "onBatchFinished",
            ok_count,
            fail_count,
            total,
            stopped,
        )
def _account_age_days(created_raw):
    """Return the age of an account in whole days at lookup time."""
    if not created_raw:
        return None
    try:
        created_dt = dateutil_parser.parse(str(created_raw))
        if created_dt.tzinfo is None:
            created_dt = created_dt.replace(tzinfo=timezone.utc)
        return max(0, (datetime.now(timezone.utc) - created_dt).days)
    except (ValueError, OverflowError, TypeError):
        return None

def _lookup_one(query):
    attempt = 0
    while True:
        attempt += 1
        try:
            if query.lstrip("-").isdigit():
                user = resolve(user_id=int(query))
            else:
                user = resolve(query)
            data = user.to_dict(include_raw=False)
            delta = ""
            snapshot_hash = ""
            try:
                # The resolved account ID is the stable key used by the
                # history database. Do not silently discard a failed write.
                record = history.record_and_diff(data.get("id"), data)
                delta = record.get("delta", "")
                snapshot_hash = record.get("hash", "")
            except Exception as history_exc:
                # A history write must not make an otherwise valid lookup
                # fail, but surface the problem in the result so it is
                # diagnosable instead of appearing as if history succeeded.
                delta = f"History save failed: {history_exc}"
                snapshot_hash = ""
            data["account_age_days"] = _account_age_days(data.get("created_at"))
            return {
                "query": query,
                "ok": True,
                "status": "OK",
                "error": "",
                "data": data,
                "delta": delta,
                "snapshot_hash": snapshot_hash,
                }
        except UserNotFound:
            return {
                "query": query,
                "ok": False,
                "status": "Not found",
                "error": "Account not found (or suspended/deactivated).",
                "data": None,
                "delta": "",
                "snapshot_hash": "",
                }
        except UserUnavailable as exc:
            return {
                "query": query,
                "ok": False,
                "status": "Unavailable",
                "error": f"Account unavailable: {exc}",
                "data": None,
                "delta": "",
                "snapshot_hash": "",
                }
        except APIError as exc:
            if attempt <= MAX_RETRIES:
                backoff = RETRY_BACKOFF_BASE * (2 ** (attempt - 1))
                _call_js_safe("onRetry", query, attempt, MAX_RETRIES, backoff)
                if _is_stop_requested():
                    return {
                        "query": query,
                        "ok": False,
                        "status": "Stopped",
                        "error": "Lookup stopped before retrying.",
                        "data": None,
                        "delta": "",
                        "snapshot_hash": "",
                                }
                time.sleep(backoff)
                continue
            return {
                "query": query,
                "ok": False,
                "status": "API error",
                "error": f"X returned an API error after {MAX_RETRIES} retries: {exc}",
                "data": None,
                "delta": "",
                "snapshot_hash": "",
                }
        except TwitterUsernameError as exc:
            return {
                "query": query,
                "ok": False,
                "status": "Package error",
                "error": f"twitter-username error: {exc}",
                "data": None,
                "delta": "",
                "snapshot_hash": "",
                }
        except Exception as exc:
            return {
                "query": query,
                "ok": False,
                "status": "Error",
                "error": f"Network or unexpected error: {exc}",
                "data": None,
                "delta": "",
                "snapshot_hash": "",
                }
def _export_path(title, extension, filetypes, initialfile):
    root = _hidden_tk_root()
    try:
        return filedialog.asksaveasfilename(
            parent=root,
            title=title,
            defaultextension=extension,
            filetypes=filetypes,
            initialfile=initialfile,
        )
    finally:
        root.destroy()


def _flatten_export_row(result):
    data = result.get("data") or {}
    return {
        "query": result.get("query", ""),
        "status": result.get("status", ""),
        "ok": bool(result.get("ok")),
        "error": result.get("error", ""),
        "id": data.get("id", ""),
        "screen_name": data.get("screen_name", ""),
        "name": data.get("name", ""),
        "description": data.get("description", ""),
        "location": data.get("location", ""),
        "url": data.get("url", ""),
        "created_at": data.get("created_at", ""),
        "account_age_days": data.get("account_age_days", ""),
        "followers_count": data.get("followers_count", ""),
        "following_count": data.get("following_count", ""),
        "tweet_count": data.get("tweet_count", ""),
        "media_count": data.get("media_count", ""),
        "favourites_count": data.get("favourites_count", ""),
        "verified": data.get("verified", ""),
        "is_blue_verified": data.get("is_blue_verified", ""),
        "protected": data.get("protected", ""),
        "delta": result.get("delta", ""),
        "snapshot_hash": result.get("snapshot_hash", ""),
    }


@eel.expose
def export_json():
    """Export the current lookup results as JSON."""
    results = _get_results()
    if not results:
        return {"ok": False, "error": "No results to export yet."}
    path = _export_path(
        "Export lookup results as JSON",
        ".json",
        [("JSON files", "*.json")],
        "handlecheck_results.json",
    )
    if not path:
        return {"ok": False}
    try:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(results, fh, indent=2, ensure_ascii=False, default=str)
        return {"ok": True, "path": path}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@eel.expose
def export_csv():
    """Export the current lookup results as a flat CSV."""
    results = _get_results()
    if not results:
        return {"ok": False, "error": "No results to export yet."}
    path = _export_path(
        "Export lookup results as CSV",
        ".csv",
        [("CSV files", "*.csv")],
        "handlecheck_results.csv",
    )
    if not path:
        return {"ok": False}
    try:
        rows = [_flatten_export_row(result) for result in results]
        fieldnames = list(rows[0].keys()) if rows else []
        with open(path, "w", newline="", encoding="utf-8-sig") as fh:
            writer = csv.DictWriter(fh, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
        return {"ok": True, "path": path}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@eel.expose
def export_pdf():
    """Export the current results as a readable evidence-style PDF report."""
    results = _get_results()
    if not results:
        return {"ok": False, "error": "No results to export yet."}
    root = _hidden_tk_root()
    try:
        path = filedialog.asksaveasfilename(
            parent=root,
            title="Export lookup results as PDF",
            defaultextension=".pdf",
            filetypes=[("PDF files", "*.pdf")],
            initialfile="handlecheck_report.pdf",
        )
    finally:
        root.destroy()
    if not path:
        return {"ok": False}
    try:
        page_width, page_height = letter
        margin = 0.75 * inch
        line_height = 14
        c = pdf_canvas.Canvas(path, pagesize=letter)
        y = page_height - margin

        def new_page():
            nonlocal y
            c.showPage()
            y = page_height - margin

        def write_line(text, font="Helvetica", size=9, indent=0, gap=line_height):
            nonlocal y
            if y < margin + gap:
                new_page()
            c.setFont(font, size)
            c.drawString(margin + indent, y, str(text)[:180])
            y -= gap

        c.setFont("Helvetica-Bold", 16)
        c.drawString(margin, y, "HandleCheck Lookup Report")
        y -= 22
        write_line(f"Generated: {datetime.now(timezone.utc).isoformat()}Z", size=9)
        write_line(f"Total entries: {len(results)}", size=9)
        y -= 8

        for i, result in enumerate(results, start=1):
            if y < margin + 110:
                new_page()
            write_line(f"{i}. {result.get('query')}", font="Helvetica-Bold", size=11)
            write_line(f"Status: {result.get('status')}", indent=12)
            if result.get("ok"):
                data = result.get("data") or {}
                write_line(
                    f"@{data.get('screen_name', '—')}  ({data.get('name', '—')})  ID {data.get('id', '—')}",
                    indent=12,
                )
                write_line(
                    f"Followers {data.get('followers_count', '—')}  |  Following {data.get('following_count', '—')}  |  "
                    f"Posts {data.get('tweet_count', '—')}",
                    indent=12,
                )
                write_line(
                    f"Verified {bool(data.get('verified'))}  |  Blue verified {bool(data.get('is_blue_verified'))}  |  "
                    f"Protected {bool(data.get('protected'))}",
                    indent=12,
                )
                if data.get("location"):
                    write_line(f"Location: {data.get('location')}", indent=12)
                if data.get("url"):
                    write_line(f"Website: {data.get('url')}", indent=12)
                if data.get("created_at"):
                    write_line(f"Account created: {data.get('created_at')}", indent=12)
                age_days = data.get("account_age_days")
                if age_days is not None:
                    write_line(f"Account age: {age_days:,} days", indent=12)
                if data.get("description"):
                    write_line(f"Bio: {data.get('description')}", indent=12, size=8, gap=12)
                if result.get("delta"):
                    write_line(f"Change since last check: {result.get('delta')}", indent=12, size=8)
                if result.get("snapshot_hash"):
                    write_line(
                        f"Snapshot hash (SHA-256): {result.get('snapshot_hash')}",
                        indent=12,
                        size=7.5,
                    )
            else:
                write_line(f"Error: {result.get('error', '')}", indent=12)
            y -= 6

        c.save()
        return {"ok": True, "path": path}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

@eel.expose
def get_history():
    """Return a summary row per account the local history database has seen.

    Powers the History viewer in the GUI, which lets the user inspect and
    remove entries from handlecheck_history.db without leaving the app.
    """
    try:
        return {
            "ok": True,
            "accounts": history.list_tracked_accounts(),
            "db_path": history.DB_PATH,
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
@eel.expose
def delete_history_account(user_id):
    """Remove every stored snapshot for one account from the history database.

    This only clears the local change-tracking history for that account; it
    does not touch X, and does not remove it from the current results list.
    The account is treated as never-before-seen the next time it is looked
    up, so the next lookup starts a fresh history for it.
    """
    try:
        removed = history.delete_account_history(user_id)
        if removed == 0:
            return {"ok": False, "error": "No history found for that account."}
        return {"ok": True, "removed": removed}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
@eel.expose
def clear_history():
    """Remove every stored snapshot for every account from the history database."""
    try:
        removed = history.clear_all_history()
        return {"ok": True, "removed": removed}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
# Initialise the history database before Eel starts as well as when the
# application is launched directly. This makes history functions safe to
# call from tests, embedders, and future entry points.
history.init_db()

if __name__ == "__main__":
    if not os.path.exists(WEB_DIR):
        os.makedirs(WEB_DIR, exist_ok=True)
    eel.init(WEB_DIR)
    _lock_window_size(WINDOW_WIDTH, WINDOW_HEIGHT)
    eel.start(
        "index.html",
        size=(WINDOW_WIDTH, WINDOW_HEIGHT),
        mode="chrome",
        cmdline_args=["--disable-features=TranslateUI"],
    )