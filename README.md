# 🔍 HandleCheck

<p align="center">
  <strong>Check Twitter/X handles in bulk, quickly, locally, and effortlessly.</strong>
</p>

A small Windows desktop app for **batch-checking X (Twitter) accounts** (usernames, profile URLs, or numeric user IDs), tracking how they change over time, and exporting the results to CSV, JSON, or a PDF report.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Downloads](https://img.shields.io/github/downloads/iteratequickly/Handle-Check/v1.0/total.svg?label=Downloads)](https://github.com/iteratequickly/Handle-Check/releases/tag/v1.0)
[![GitHub Release](https://img.shields.io/github/v/release/iteratequickly/Handle-Check)](https://github.com/iteratequickly/Handle-Check/releases)
[![Platform](https://img.shields.io/badge/Platform-Windows-blue.svg)](https://github.com/iteratequickly/Handle-Check)
[![Python](https://img.shields.io/badge/Python-3.14-blue.svg)](https://www.python.org/)

<p align="center">
  <img src="https://github.com/iteratequickly/Handle-Check/blob/main/assets/banner.png" alt="HandleCheck Preview" width="800">
</p>

## ⚠️ Disclaimer

HandleCheck relies on the [`twitter-username`](https://pypi.org/project/twitter-username/) package, which resolves accounts through an unofficial, reverse-engineered X endpoint rather than X's official API. A few things follow from that, worth reading before using or relying on this tool:

- **It may break without warning.** X can change or restrict this endpoint at any time, which would stop lookups from working until the underlying package is updated (or indefinitely, if it is not).
- **It sits outside X's official API terms.** Using an unofficial endpoint carries some risk under X's terms of service; use it at your own discretion and judgement.
- **It is intended for legitimate research, verification, and monitoring of one's own or public accounts one has a reasonable interest in** (for example, checking whether a list of handles is still active, or tracking changes to accounts relevant to a piece of research). It is not intended for stalking, harassment, or surveillance of individuals without a legitimate reason, and it should not be used that way.
- **It comes with no warranty.** The project is provided as is, with no guarantee of accuracy, availability, or fitness for any particular purpose. Use of this tool, and any consequences of that use, are the user's own responsibility.

## 💡 Why this exists

If you need to check more than a handful of X accounts, say, verifying a list of usernames still exist, or pulling follower counts for a set of profiles, doing it one by one in a browser is slow and does not give you clean, structured data to work with afterwards.

HandleCheck exists to make that a paste a list and walk away task:

- **Paste many targets at once** (one per line): usernames, full profile URLs, or numeric user IDs, in any mix.
- **Runs them sequentially with built-in pacing and retries**, so a batch does not get hammered through all at once or silently fail on a transient error.
- **Classifies every result**: success, not found (which also covers suspended or deactivated accounts, as X returns the same empty result for all three), unavailable, API error, and so on, instead of just erroring out on the first problem and stopping.
- **Remembers what it saw last time**: every successful lookup is saved locally, so checking the same account again later shows what changed (follower count, display name, bio, and so on) rather than just the current snapshot.
- **Lets a list grow over time**: add more usernames whenever you like and click Continue (the Start Lookup button relabels itself once there are results) to check just the new ones, without losing or re-running what is already collected. A separate Reset clears everything and starts fresh.
- **Lets you manage the saved history from the GUI**: a History panel lists every account ever tracked, with the option to remove a single account's saved history (so a re-check of it starts fresh) or clear everything at once.
- **Offers a Profile Map view**: a fourth tab, alongside All / Success / Failed, that shows the same successful results as clickable profile bubbles instead of a list, a display filter, not a separate tool. Clicking a bubble opens the exact same detail card the list view would show for that account.
- **Gives you the data back** as CSV, JSON, or PDF, ready to drop into a spreadsheet, another tool, or a shareable report, rather than something you would have to re-copy out of a browser tab.

In short, it is a lightweight lookup and monitoring utility for anyone who needs to check X account status or profile data for a *list* of accounts rather than a single one, and wants the result, and any changes over time, as a file instead of a series of manual searches.

## 🚀 Getting Started

### Requirements

* **Windows 10 or Windows 11**
* **Python 3.14** or a compatible Python 3 release
* The dependencies listed in `requirements.txt`

### Installation

1. **Download the latest release**

   * Visit the [Release Page](https://github.com/iteratequickly/Handle-Check/releases/tag/v1.0).
   * Download the `handle-check-v1.0.zip` file.

2. **Extract the ZIP file**

   Extract the contents to a permanent location.

3. **Open a terminal**

   Open Command Prompt, PowerShell, or a terminal inside the extracted folder.

4. **Install the required dependencies**

   ```bash
   pip install -r requirements.txt
   ```

5. **Launch HandleCheck**

   ```bash
   python main.py
   ```

## ⚙️ How it works

- **`main.py`**: the app's backend. It uses [`eel`](https://github.com/python-eel/Eel) to run a local Chrome-based window with an HTML/JS front end, and the [`twitter-username`](https://pypi.org/project/twitter-username/) package to resolve each query (username, URL, or ID) to account data.
- **`history.py`**: handles HandleCheck's local account history using a SQLite database (`handlecheck_history.db`).
  - Keeps a record of every account checked by the application.
  - Stores profile information from each check so previous results can be compared with newer ones.
  - Detects changes between checks (follower/following/post/media/favourites counts, verification and protected status, handle, name, location, bio, website) and reports them as a short delta summary.
  - Shows whether an account is being checked for the first time, has remained unchanged, or has changed since the previous check.
  - Keeps timestamps for when each account was first and most recently checked, and how many times it has been checked.
  - Saves a SHA-256 hash of each captured snapshot, so a specific captured state can be verified later without re-fetching it.
  - Automatically prepares the local database when the application starts, and migrates an older database in place (adding new columns as needed) rather than requiring existing history to be deleted.
  - Stores the database in the same folder as `main.py` and `history.py`, regardless of the directory the app is launched from.
  - Supports removing the history for a single account or clearing the entire local history.
  - History is stored locally only and is never sent anywhere by this component.
- **`web/`**: the front end. `index.html`, `script.js`, and `style.css` render the input box, live progress and status, a results list (Profile Map / All / Success / Failed tabs), a detail pane with a formatted profile card plus the raw JSON, the History panel, and the Export menu. Avatar URLs are upgraded to X's `_400x400` size variant where possible, for sharper images than the default thumbnail size.

### 🧭 Workflow

1. Paste one or more usernames, profile URLs, or user IDs into the input box (duplicates are ignored).
2. Click **Start Lookup**. Each query is resolved one at a time, with a short delay between requests and automatic retries (with backoff) on transient API errors.
3. Watch results populate live, tagged as success or failure with a reason (not found, unavailable, API error, and so on), plus a delta note showing anything that changed since the account was last checked.
4. Click a result to see a formatted profile card or the raw JSON response.
5. Add more usernames to the box at any point and click **Continue** to check just those, on top of the existing results, without re-running anything already done. The box is not cleared after a run, so you can keep adding to it.
6. Click **Profile Map** to browse the same successful results as profile bubbles instead of a list; click back to All, Success, or Failed to return to the list. Clicking a bubble opens the same detail card the list would.
7. Click **Reset** to clear all results and the record of what has already been checked, so the same usernames can be entered again as a fresh list.
8. When done, open the **Export** menu in the header and choose **PDF**, **JSON**, or **CSV**.

You can **Stop** a running batch at any time; already-collected results are kept.

## 🕘 History viewer

Click **History** in the top-right corner at any time to open a near-fullscreen panel listing every account the local database has ever tracked, with every data point from its most recent check: handle, display name, followers, following, posts, media, likes, verified/blue-verified/protected flags, location, bio, website, account creation date, and when it was first and last checked, plus how many times.

From there you can:

- **Remove** a single account, which deletes only its saved snapshots. Looking it up again afterwards starts a brand-new history for it, exactly as if it had never been checked before.
- **Clear all history**, which empties the database entirely (with a confirmation prompt first).

Either action only touches the local `handlecheck_history.db` file; it never affects the current results list on the left, and it never contacts X. The panel's table scrolls horizontally if the window is narrower than all the columns need.

## 🗺️ Profile Map

Profile Map is a display filter, not a popup: it sits to the left of All / Success / Failed in the results header and works the same way they do, swapping what the same results panel shows. Selecting it replaces the list with a grid of profile bubbles, one per successful lookup, sized loosely by follower count, with no lines or edges between them; nothing about relationships between accounts is inferred. Clicking a bubble calls the same selection logic the list view uses, so it opens the identical detail card, not a separate one.

## 📤 Evidence export

Every successful lookup is saved with a **SHA-256 hash of its captured data** (see `history.py`), shown in full in the JSON and PDF exports and truncated in the profile detail view, so the exact state captured at lookup time can be verified later without re-fetching the account.

The **Export** menu in the header contains **PDF**, **JSON**, and **CSV**:

- **PDF** produces a paginated, human-readable report: one entry per lookup, with its profile data, delta since the previous check, and snapshot hash, plus a generation timestamp.
- **JSON** exports the full result list as-is, including the nested profile data object for each account.
- **CSV** exports one flattened row per lookup (see Exported fields below).

## 📦 Requirements

```
eel
twitter-username
python-dateutil
reportlab
```

`history.py` also uses `sqlite3`, `json`, and `hashlib` from the Python standard library, so those need no extra install.

Install the requirements with:

```bash
pip install -r requirements.txt
```

Then run:

```bash
python main.py
```

**Note:** the window-size-locking behaviour (a fixed, non-resizable window, sized at 1100x700) in `main.py` only applies on Windows (`os.name == "nt"`); on other platforms the window uses default Eel/Chrome sizing.

## 📊 Exported fields

CSV exports include one flattened row per lookup: query, status, whether it succeeded, error detail, user ID, screen name, display name, bio/description, location, website URL, account creation date, account age in days, follower/following/tweet/media/favourites counts, verified/blue-verified/protected flags, the delta summary of what changed since the last check, and the SHA-256 snapshot hash.

JSON exports contain the same information, unflattened, as the full result objects (including the nested profile data for each account).

The PDF export covers the same ground in a readable report layout.

## 🗄️ Local history database

`handlecheck_history.db` is created automatically the first time `main.py` runs, always in the same folder as `main.py` and `history.py` themselves, regardless of what directory the app happens to be launched from.

It stores the saved profile snapshots used to build each account's history and compare later checks, along with when each account was first and most recently checked and how many times. It is never sent anywhere.

It can be managed from within the app itself: open the **History** panel to view tracked accounts and remove entries as needed. Removing an account deletes its saved history so the next successful lookup starts a new history for that account. Clearing all history removes the stored snapshots for every account.

Deleting the database file directly has the same practical effect as clearing all history and does not affect the application itself.

## 📄 License

This project is licensed under the [MIT License](LICENSE).
