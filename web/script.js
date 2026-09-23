let resultsData = [];
let currentFilter = "all";
let selectedIndex = -1;
let isRunning = false;
let currentDetailTab = "profile";

function callPy(name, ...args) {
  return new Promise((resolve, reject) => {
    if (typeof eel === "undefined") {
      reject(new Error("Eel is not defined. Backend connection unavailable."));
      return;
    }

    try {
      eel[name](...args)(resolve);
    } catch (err) {
      reject(err);
    }
  });
}

function fmtNum(value) {
  if (typeof value === "number") return value.toLocaleString();
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getVerifiedBadge(data) {
  // Checks if user is verified (either blue or legacy verified)
  const isVerified = data.is_blue_verified || data.verified;

  if (!isVerified) return "";

  return `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" data-icon="icon-verified" viewBox="0 0 22 22" width="16px" height="16px" display="inline-block" role="img" aria-hidden="true" style="color: var(--accent); vertical-align: middle; flex-shrink: 0;"><path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"></path></svg>`;
}

function getLockIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="5" y="11" width="14" height="9" rx="1.5" stroke-width="1.6"/><path d="M8 11V7a4 4 0 018 0v4" stroke-width="1.6" stroke-linecap="round"/></svg>`;
}

function getPinIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M12 21s-7-6.1-7-11a7 7 0 1114 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.4" stroke-width="1.6"/></svg>`;
}

function getLinkIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M9.5 14.5l5-5M10.5 8.5l1-1a3 3 0 114 4l-1 1M13.5 15.5l-1 1a3 3 0 01-4-4l1-1"/></svg>`;
}

function getCalendarIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="4" y="5.5" width="16" height="15" rx="1.5" stroke-width="1.6"/><path d="M4 10h16M8 3.5v4M16 3.5v4" stroke-width="1.6" stroke-linecap="round"/></svg>`;
}

function getInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/* =========================================================
   JOINED DATE FORMATTERS
   ========================================================= */

function formatJoinedShort(raw) {
  if (!raw && raw !== 0) return "";

  let d;

  if (typeof raw === "number") {
    d = new Date(raw < 1e12 ? raw * 1000 : raw);
  } else {
    d = new Date(raw);
  }

  if (isNaN(d.getTime())) {
    return typeof raw === "string" ? raw : "";
  }

  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function formatJoinedFull(raw) {
  if (!raw && raw !== 0) return "";

  let d;

  if (typeof raw === "number") {
    d = new Date(raw < 1e12 ? raw * 1000 : raw);
  } else {
    d = new Date(raw);
  }

  if (isNaN(d.getTime())) {
    return typeof raw === "string" ? raw : "";
  }

  return d.toLocaleString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatAccountAge(days) {
  if (days === null || days === undefined || !Number.isFinite(Number(days))) return "";
  const d = Number(days);
  const years = Math.floor(d / 365.2425);
  const months = Math.floor((d - years * 365.2425) / 30.4375);
  if (years > 0) return `${years}y ${Math.max(0, months)}m`;
  if (months > 0) return `${months}m`;
  return `${d}d`;
}

function metaItem(iconSvg, innerHtml) {
  return `<span class="profile-meta-item">${iconSvg}${innerHtml}</span>`;
}



// Prefer the highest practical avatar resolution available from X.
// The API commonly returns profile image URLs ending in _normal/_bigger/etc.
// X's image CDN supports the _400x400 variant, which keeps profile-map
// avatars crisp on high-DPI displays while remaining small enough to load.
function getHighQualityAvatarUrl(url) {
  if (!url) return "";
  return String(url).replace(
    /_(?:mini|normal|bigger|200x200|400x400)(?=\.(?:jpe?g|png|webp)(?:$|\?))/i,
    "_400x400"
  );
}

function renderProfileCard(d, result) {
  const initials = getInitials(d.name || d.screen_name);
  const verifiedSvg = getVerifiedBadge(d);

  const profileUrl = d.screen_name
    ? `https://x.com/${d.screen_name}`
    : null;

  const websiteUrl =
    d.url ||
    d.profile_website_url ||
    null;

  // Full joined date for expanded profile card.
  const joinedStr = formatJoinedFull(
    d.created_at_datetime || d.created_at
  );

  const avatarUrl = getHighQualityAvatarUrl(
    d.profile_image_url ||
    d.avatar_url ||
    ""
  );

  const bannerUrl =
    d.profile_banner_url ||
    d.banner_url ||
    "";

  const avatarHtml = avatarUrl
    ? `<img class="profile-avatar-img" src="${escapeHtml(avatarUrl)}" alt="" loading="lazy" decoding="async" />`
    : `<span class="profile-avatar-initials">${escapeHtml(initials)}</span>`;

  const metaParts = [];

  if (d.location) {
    metaParts.push(
      metaItem(
        getPinIcon(),
        escapeHtml(d.location)
      )
    );
  }

  if (websiteUrl) {
    const label = escapeHtml(
      String(websiteUrl)
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, "")
    );

    metaParts.push(
      metaItem(
        getLinkIcon(),
        `<a href="${escapeHtml(websiteUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${label}</a>`
      )
    );
  }

  if (joinedStr) {
    metaParts.push(
      metaItem(
        getCalendarIcon(),
        `Joined ${escapeHtml(joinedStr)}`
      )
    );
  }

  if (d.account_age_days !== null && d.account_age_days !== undefined) {
    metaParts.push(
      metaItem(
        getCalendarIcon(),
        `Age ${escapeHtml(formatAccountAge(d.account_age_days))}`
      )
    );
  }

  return `
    <div class="profile-banner"${bannerUrl ? ` style="background-image:url('${escapeHtml(bannerUrl)}')"` : ""}>
      <div class="profile-avatar-wrap">
        ${avatarHtml}
      </div>

      ${d.protected
        ? `<span class="profile-lock-badge" title="Protected account">${getLockIcon()}</span>`
        : ""}

    </div>

    <div class="profile-body">

      <div class="profile-name-row">

        <span class="profile-display-name">
          ${escapeHtml(d.name || "—")}
        </span>

        ${verifiedSvg}

      </div>

      <div class="profile-handle-row">

        <span class="profile-handle">
          @${escapeHtml(d.screen_name || "—")}
        </span>

        <span class="status-pill ok">
          ${escapeHtml(result.status || "Success")}
        </span>

      </div>

      ${d.description
        ? `<p class="profile-bio">${escapeHtml(d.description)}</p>`
        : ""}

      ${metaParts.length
        ? `<div class="profile-meta-row">${metaParts.join("")}</div>`
        : ""}

      <div class="profile-stats-row">

        <div class="profile-stat">
          <b>${fmtNum(d.following_count)}</b>
          <span>Following</span>
        </div>

        <div class="profile-stat">
          <b>${fmtNum(d.followers_count)}</b>
          <span>Followers</span>
        </div>

        <div class="profile-stat">
          <b>${fmtNum(d.tweet_count)}</b>
          <span>Posts</span>
        </div>

        <div class="profile-stat">
          <b>${fmtNum(d.favourites_count)}</b>
          <span>Likes</span>
        </div>

        <div class="profile-stat">
          <b>${fmtNum(d.media_count)}</b>
          <span>Media</span>
        </div>

      </div>

      <div class="profile-id-row">

        ID ${escapeHtml(d.id || "—")}

        ${profileUrl
          ? ` · <a href="${profileUrl}" target="_blank" onclick="event.stopPropagation()">View on X ↗</a>`
          : ""}

        ${result.snapshot_hash
          ? ` · <span title="SHA-256 of this captured snapshot: ${escapeHtml(result.snapshot_hash)}">Hash ${escapeHtml(result.snapshot_hash.slice(0, 10))}…</span>`
          : ""}

      </div>

      ${renderDeltaNote(result.delta)}

    </div>
  `;
}

function renderDeltaNote(delta) {
  if (!delta) return "";

  const hasChanges =
    delta !== "No change since last check." &&
    delta !== "First check for this account.";

  return `
    <div class="delta-note${hasChanges ? " has-changes" : ""}">
      ${escapeHtml(delta)}
    </div>
  `;
}

function updateCounts() {
  const ok = resultsData.filter(
    result => result && result.ok
  ).length;

  const fail = resultsData.filter(
    result => result && !result.ok
  ).length;

  document.getElementById("count-all").textContent =
    resultsData.filter(Boolean).length;

  document.getElementById("count-ok").textContent = ok;
  document.getElementById("count-fail").textContent = fail;
}

function setFilter(filter) {
  currentFilter = filter;

  ["map", "all", "ok", "fail"].forEach(name => {
    const button =
      document.getElementById(`tab-${name}`);

    if (button) {
      button.classList.toggle(
        "active",
        name === filter
      );
    }
  });

  renderResults();
}

function getFilteredResults() {
  return resultsData
    .map((result, index) => ({
      result,
      index
    }))
    .filter(item => {
      if (!item.result) return false;

      if (currentFilter === "ok") {
        return item.result.ok;
      }

      if (currentFilter === "fail") {
        return !item.result.ok;
      }

      return true;
    });
}

function renderResults() {
  const container =
    document.getElementById("resultsContainer");

  const filtered = getFilteredResults();

  if (currentFilter === "map") {
    renderBubbles(filtered);
    return;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">

        <svg class="empty-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>

        <p>No items match this filter.</p>

      </div>
    `;

    return;
  }

  container.innerHTML = filtered
    .map(({ result, index }) => {

      if (result.ok) {
        const d = result.data || {};

        const profileUrl = d.screen_name
          ? `https://x.com/${d.screen_name}`
          : "—";

        const verifiedSvg =
          getVerifiedBadge(d);

        const avatarUrl =
          d.profile_image_url
            ? escapeHtml(getHighQualityAvatarUrl(d.profile_image_url))
            : "";

        const avatarHtml = avatarUrl
          ? `<img src="${avatarUrl}" alt="" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; flex-shrink: 0; background: rgba(0,0,0,0.05);" />`
          : `<div style="width: 36px; height: 36px; border-radius: 50%; background: rgba(0,0,0,0.1); flex-shrink: 0;"></div>`;

        // Short joined date for the main result card.
        const joinedStr = formatJoinedShort(
          d.created_at_datetime || d.created_at
        );

        return `
          <div
            class="result-card ${selectedIndex === index ? "selected" : ""}"
            data-index="${index}"
            onclick="selectRow(${index})"
          >

            <div class="result-top">

              <div style="display: flex; align-items: center; gap: 10px;">

                ${avatarHtml}

                <div>

                  <div style="display: flex; align-items: center; gap: 6px;">

                    <span class="display-name">
                      ${escapeHtml(d.name || "—")}
                    </span>

                    ${verifiedSvg}

                    <span class="username">
                      @${escapeHtml(d.screen_name || "—")}
                    </span>

                  </div>

                </div>

              </div>

              <div style="display: flex; align-items: center; gap: 8px;">

                <a
                  href="${profileUrl}"
                  target="_blank"
                  onclick="event.stopPropagation()"
                  style="color: var(--accent); font-size: 12px; font-weight: 600; text-decoration: none;"
                  title="Open on X"
                >↗ Profile</a>

                <span class="status-pill ok">
                  ${escapeHtml(result.status || "Success")}
                </span>

              </div>

            </div>

            <div class="bio" style="margin-top: 6px;">
              ${escapeHtml(d.description || "No bio provided.")}
            </div>

            <div class="stats">

              <span>
                <b>Followers:</b>
                ${fmtNum(d.followers_count)}
              </span>

              <span>
                <b>Following:</b>
                ${fmtNum(d.following_count)}
              </span>

              <span>
                <b>Posts:</b>
                ${fmtNum(d.tweet_count)}
              </span>

              <span>
                <b>Likes:</b>
                ${fmtNum(d.favourites_count)}
              </span>

              ${joinedStr
                ? `
                  <span>
                    <b>Joined:</b>
                    ${escapeHtml(joinedStr)}
                  </span>
                `
                : ""}

              <span class="user-id">
                ID: ${escapeHtml(d.id || "—")}
              </span>

            </div>

            ${renderDeltaNote(result.delta)}

          </div>
        `;
      }

      return `
        <div
          class="result-card ${selectedIndex === index ? "selected" : ""}"
          data-index="${index}"
          onclick="selectRow(${index})"
        >

          <div class="result-top">

            <span class="failed-query">
              Query: ${escapeHtml(result.query)}
            </span>

            <span class="status-pill fail">
              ${escapeHtml(result.status || "Failed")}
            </span>

          </div>

          <div class="error-message">
            ${escapeHtml(result.error || "Unknown error")}
          </div>

        </div>
      `;
    })
    .join("");
}

function selectRow(index) {
  selectedIndex = index;

  renderResults();

  const result = resultsData[index];

  if (!result) return;

  renderDetail(result);

  document
    .getElementById("detailPane")
    .classList.add("visible");
}

function closeDetail() {
  selectedIndex = -1;

  document
    .getElementById("detailPane")
    .classList.remove("visible");

  renderResults();
}

function switchDetailTab(tabName) {
  currentDetailTab = tabName;

  const profileBtn =
    document.getElementById("detailTabProfile");

  const jsonBtn =
    document.getElementById("detailTabJson");

  const profileContent =
    document.getElementById("detailContentProfile");

  const jsonContent =
    document.getElementById("detailContentJson");

  if (tabName === "profile") {

    if (profileBtn) {
      profileBtn.classList.add("active");
    }

    if (jsonBtn) {
      jsonBtn.classList.remove("active");
    }

    if (profileContent) {
      profileContent.style.display = "block";
    }

    if (jsonContent) {
      jsonContent.style.display = "none";
    }

  } else {

    if (jsonBtn) {
      jsonBtn.classList.add("active");
    }

    if (profileBtn) {
      profileBtn.classList.remove("active");
    }

    if (jsonContent) {
      jsonContent.style.display = "block";
    }

    if (profileContent) {
      profileContent.style.display = "none";
    }
  }
}

function renderDetail(result) {
  const profileContent =
    document.getElementById("detailContentProfile");

  const jsonContent =
    document.getElementById("detailContentJson");

  if (!result.ok) {

    if (profileContent) {
      profileContent.innerHTML = `
        <div class="profile-error-state">

          <div class="failed-query">
            Query: ${escapeHtml(result.query)}
          </div>

          <span class="status-pill fail">
            ${escapeHtml(result.status || "Failed")}
          </span>

          <p class="error-message">
            ${escapeHtml(result.error || "Unknown error")}
          </p>

        </div>
      `;
    }

    if (jsonContent) {
      jsonContent.textContent =
        JSON.stringify(result, null, 2);
    }

    return;
  }

  const d = result.data || {};

  if (profileContent) {
    profileContent.innerHTML =
      renderProfileCard(d, result);
  }

  if (jsonContent) {
    jsonContent.textContent = JSON.stringify(
      { ...d, delta: result.delta || "" },
      null,
      2
    );
  }
}

function setStatus(text, color) {
  const element =
    document.getElementById("statusText");

  if (element) {
    element.textContent = text;
    element.style.color =
      color || "var(--accent)";
  }
}

function setProgress(percent) {
  const safe =
    Math.max(0, Math.min(100, percent || 0));

  const el =
    document.getElementById("progressInner");

  if (el) {
    el.style.width = safe + "%";
  }
}

function setRunningState(running) {
  isRunning = running;

  const runBtn =
    document.getElementById("runBtn");

  const stopBtn =
    document.getElementById("stopBtn");

  const queryBox =
    document.getElementById("queryBox");

  if (runBtn) {
    runBtn.disabled = running;
    runBtn.style.opacity =
      running ? "0.5" : "1";
  }

  if (stopBtn) {
    stopBtn.disabled = !running;
  }

  if (queryBox) {
    queryBox.disabled = running;
  }

  updateResetButton();
}

function updateRunButtonLabel() {
  const runBtn = document.getElementById("runBtn");
  if (!runBtn) return;

  const hasResults =
    resultsData.filter(Boolean).length > 0;

  runBtn.textContent =
    hasResults ? "Continue" : "Start Lookup";
}

function updateResetButton() {
  const resetBtn = document.getElementById("resetBtn");
  if (!resetBtn) return;

  const hasResults =
    resultsData.filter(Boolean).length > 0;

  resetBtn.disabled = isRunning || !hasResults;
}

function fmtDate(raw) {
  if (!raw) return "—";

  const d = new Date(raw);

  if (isNaN(d.getTime())) return String(raw);

  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function setHistoryStatus(text, color) {
  const el = document.getElementById("historyStatus");
  if (!el) return;
  el.textContent = text || "";
  el.style.color = color || "var(--text-soft)";
}

function fmtBool(value) {
  if (value === null || value === undefined) {
    return `<span class="cell-bool-no">—</span>`;
  }

  return value
    ? `<span class="cell-bool-yes">Yes</span>`
    : `<span class="cell-bool-no">No</span>`;
}

function renderHistoryTable(accounts) {
  const body = document.getElementById("historyTableBody");
  const empty = document.getElementById("historyEmptyState");
  const wrap = document.getElementById("historyTableWrap");

  if (!body) return;

  if (!accounts || accounts.length === 0) {
    body.innerHTML = "";
    if (empty) empty.style.display = "block";
    if (wrap) {
      const table = document.getElementById("historyTable");
      if (table) table.style.display = "none";
    }
    return;
  }

  if (empty) empty.style.display = "none";
  const table = document.getElementById("historyTable");
  if (table) table.style.display = "table";

  body.innerHTML = accounts
    .map(account => {
      const handle = account.screen_name
        ? `@${escapeHtml(account.screen_name)}`
        : `ID ${escapeHtml(account.user_id)}`;

      const displayName = account.name
        ? escapeHtml(account.name)
        : "";

      const bio = account.description || "";
      const website = account.url || "";

      return `
        <tr data-user-id="${escapeHtml(account.user_id)}">
          <td>
            <div style="font-weight: 600;">${handle}</div>
            ${displayName ? `<div style="color: var(--text-soft); font-size: 11px;">${displayName}</div>` : ""}
          </td>
          <td>${fmtNum(account.followers_count)}</td>
          <td>${fmtNum(account.following_count)}</td>
          <td>${fmtNum(account.tweet_count)}</td>
          <td>${fmtNum(account.media_count)}</td>
          <td>${fmtNum(account.favourites_count)}</td>
          <td>${fmtBool(account.verified)}</td>
          <td>${fmtBool(account.is_blue_verified)}</td>
          <td>${fmtBool(account.protected)}</td>
          <td>${account.location ? escapeHtml(account.location) : "—"}</td>
          <td class="cell-bio" title="${escapeHtml(bio)}">${bio ? escapeHtml(bio) : "—"}</td>
          <td class="cell-website" title="${escapeHtml(website)}">${website ? escapeHtml(website) : "—"}</td>
          <td>${fmtDate(account.account_created_at)}</td>
          <td>${fmtDate(account.first_checked_at)}</td>
          <td>${fmtDate(account.last_checked_at)}</td>
          <td>${fmtNum(account.check_count)}</td>
          <td>
            <button class="history-remove-btn" onclick="removeHistoryAccount('${escapeHtml(account.user_id)}')">
              Remove
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function loadHistory() {
  setHistoryStatus("Loading...");

  callPy("get_history")
    .then(res => {
      if (!res || !res.ok) {
        setHistoryStatus(
          res && res.error ? res.error : "Could not load history.",
          "var(--danger)"
        );
        renderHistoryTable([]);
        return;
      }

      const pathEl = document.getElementById("historyDbPath");
      if (pathEl && res.db_path) {
        pathEl.textContent = `Stored in: ${res.db_path}`;
      }

      renderHistoryTable(res.accounts || []);
      setHistoryStatus(
        `${(res.accounts || []).length} account(s) tracked.`
      );
    })
    .catch(err => {
      console.error(err);
      setHistoryStatus("Failed to load history.", "var(--danger)");
      renderHistoryTable([]);
    });
}

function openHistoryModal() {
  const overlay = document.getElementById("historyModalOverlay");
  if (overlay) overlay.classList.add("visible");
  loadHistory();
}

function closeHistoryModal() {
  const overlay = document.getElementById("historyModalOverlay");
  if (overlay) overlay.classList.remove("visible");
}

function removeHistoryAccount(userId) {
  const row = document.querySelector(`#historyTableBody tr[data-user-id="${CSS.escape(userId)}"]`);
  const button = row ? row.querySelector(".history-remove-btn") : null;

  if (button) {
    button.disabled = true;
    button.textContent = "Removing...";
  }

  callPy("delete_history_account", userId)
    .then(res => {
      if (!res || !res.ok) {
        setHistoryStatus(
          res && res.error ? res.error : "Could not remove that account.",
          "var(--danger)"
        );
        if (button) {
          button.disabled = false;
          button.textContent = "Remove";
        }
        return;
      }

      if (row) row.remove();
      setHistoryStatus("Removed from history.", "var(--success)");

      const body = document.getElementById("historyTableBody");
      if (body && body.children.length === 0) {
        renderHistoryTable([]);
      }
    })
    .catch(err => {
      console.error(err);
      setHistoryStatus("Failed to remove that account.", "var(--danger)");
      if (button) {
        button.disabled = false;
        button.textContent = "Remove";
      }
    });
}

function clearAllHistory() {
  const confirmed = window.confirm(
    "Remove all saved lookup history? This cannot be undone."
  );

  if (!confirmed) return;

  callPy("clear_history")
    .then(res => {
      if (!res || !res.ok) {
        setHistoryStatus(
          res && res.error ? res.error : "Could not clear history.",
          "var(--danger)"
        );
        return;
      }

      renderHistoryTable([]);
      setHistoryStatus("All history cleared.", "var(--success)");
    })
    .catch(err => {
      console.error(err);
      setHistoryStatus("Failed to clear history.", "var(--danger)");
    });
}

function exportPdf() {
  callPy("export_pdf")
    .then(res => {
      if (res && res.ok && res.path) {
        setStatus(`Exported PDF to ${res.path}`, "var(--success)");
      } else if (res && res.error) {
        setStatus(res.error, "var(--danger)");
      }
    })
    .catch(err => {
      console.error(err);
      setStatus("Failed to export PDF.", "var(--danger)");
    });
}

function exportJson() {
  callPy("export_json")
    .then(res => {
      if (res && res.ok && res.path) {
        setStatus(`Exported JSON to ${res.path}`, "var(--success)");
      } else if (res && res.error) {
        setStatus(res.error, "var(--danger)");
      }
    })
    .catch(err => {
      console.error(err);
      setStatus("Failed to export JSON.", "var(--danger)");
    });
}

function exportCsv() {
  callPy("export_csv")
    .then(res => {
      if (res && res.ok && res.path) {
        setStatus(`Exported CSV to ${res.path}`, "var(--success)");
      } else if (res && res.error) {
        setStatus(res.error, "var(--danger)");
      }
    })
    .catch(err => {
      console.error(err);
      setStatus("Failed to export CSV.", "var(--danger)");
    });
}

function bubbleSizeFor(followers) {
  const n = Number(followers) || 0;
  // Rough log scale so a handful of huge accounts don't dwarf everything
  // else in the grid; clamped to a sane range of bubble diameters.
  const size = 64 + Math.log10(n + 10) * 22;
  return Math.max(64, Math.min(size, 148));
}

function renderBubbles(filtered) {
  const container = document.getElementById("resultsContainer");

  const ok = filtered.filter(({ result }) => result.ok);

  if (ok.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <p>No successful lookups to show as profile bubbles yet.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="bubble-grid">
      ${ok
        .map(({ result, index }) => {
          const d = result.data || {};
          const size = bubbleSizeFor(d.followers_count);
          const verifiedSvg = getVerifiedBadge(d);

          const avatarHtml = d.profile_image_url
            ? `<img src="${escapeHtml(getHighQualityAvatarUrl(d.profile_image_url))}" alt="" loading="lazy" decoding="async" />`
            : `<span>${escapeHtml(getInitials(d.name || d.screen_name))}</span>`;

          return `
            <button
              type="button"
              class="profile-bubble ${selectedIndex === index ? "selected" : ""}"
              data-index="${index}"
              onclick="selectRow(${index})"
              title="Open @${escapeHtml(d.screen_name || "")}"
            >
              <span class="bubble-avatar" style="width:${size}px;height:${size}px;">
                ${avatarHtml}
              </span>
              <span class="bubble-name">
                ${escapeHtml(d.name || "—")} ${verifiedSvg}
              </span>
              <span class="bubble-handle">@${escapeHtml(d.screen_name || "—")}</span>
              <span class="bubble-followers">${fmtNum(d.followers_count)} followers</span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function updateExportButtons() {
  const hasResults = resultsData.filter(Boolean).length > 0;
  const pdfBtn = document.getElementById("exportPdfBtn");
  const jsonBtn = document.getElementById("exportJsonBtn");
  const csvBtn = document.getElementById("exportCsvBtn");
  if (pdfBtn) pdfBtn.disabled = !hasResults;
  if (jsonBtn) jsonBtn.disabled = !hasResults;
  if (csvBtn) csvBtn.disabled = !hasResults;
}

function onItemDone(
  result,
  index,
  total,
  okCount,
  failCount
) {
  resultsData[index - 1] = result;

  updateCounts();
  renderResults();

  setProgress(
    total > 0
      ? (index / total) * 100
      : 0
  );

  setStatus(
    `Processing: ${index} / ${total}`,
    "var(--warning)"
  );

  const retryStatus =
    document.getElementById("retryStatus");

  const retryText =
    document.getElementById("retryText");

  if (retryStatus) {
    retryStatus.textContent = "";
  }

  if (retryText) {
    retryText.textContent = "";
  }

  updateExportButtons();
  updateRunButtonLabel();
  updateResetButton();

  if (selectedIndex === index - 1) {
    renderDetail(result);
  }
}

function onRetry(
  query,
  attempt,
  maxRetries,
  backoff
) {
  const message =
    `Retrying @${query} (Attempt ${attempt}/${maxRetries}) in ${backoff}s...`;

  const retryStatus =
    document.getElementById("retryStatus");

  const retryText =
    document.getElementById("retryText");

  if (retryStatus) {
    retryStatus.textContent = message;
  }

  if (retryText) {
    retryText.textContent = message;
  }

  setStatus(
    `Retrying ${attempt}/${maxRetries}...`,
    "var(--warning)"
  );
}

function onBatchFinished(
  okCount,
  failCount,
  total,
  stopped
) {
  setRunningState(false);
  setProgress(100);

  const retryStatus =
    document.getElementById("retryStatus");

  const retryText =
    document.getElementById("retryText");

  if (retryStatus) {
    retryStatus.textContent = "";
  }

  if (retryText) {
    retryText.textContent = "";
  }

  if (stopped) {
    setStatus(
      "Batch stopped by user.",
      "var(--warning)"
    );
  } else if (failCount === 0) {
    setStatus(
      "Batch completed.",
      "var(--success)"
    );
  } else {
    setStatus(
      "Batch completed with errors.",
      "var(--warning)"
    );
  }

  updateCounts();
  updateExportButtons();
  updateRunButtonLabel();
  updateResetButton();
  renderResults();
}

function runBatch() {
  // Existing results and the text box are both kept: a second click after
  // adding more usernames re-submits the whole box, but start_batch on the
  // backend skips anything already checked, so only the new lines actually
  // run and get appended to the results. Use resetBatch() to start over.
  const queryBox =
    document.getElementById("queryBox");

  const text =
    queryBox ? queryBox.value : "";

  setProgress(0);
  setRunningState(true);

  const retryStatus =
    document.getElementById("retryStatus");

  const retryText =
    document.getElementById("retryText");

  if (retryStatus) {
    retryStatus.textContent = "";
  }

  if (retryText) {
    retryText.textContent = "";
  }

  setStatus(
    "Starting...",
    "var(--warning)"
  );

  callPy("start_batch", text)
    .then(res => {
      if (!res || !res.ok) {

        setStatus(
          res && res.error
            ? res.error
            : "Could not start batch.",
          "var(--danger)"
        );

        setRunningState(false);
      }
    })
    .catch(err => {
      console.error(err);

      setStatus(
        "Failed to start batch.",
        "var(--danger)"
      );

      setRunningState(false);
    });
}

function resetBatch() {
  if (isRunning) return;

  callPy("reset_batch")
    .then(res => {
      if (!res || !res.ok) {
        setStatus(
          res && res.error
            ? res.error
            : "Could not reset.",
          "var(--danger)"
        );
        return;
      }

      resultsData = [];
      selectedIndex = -1;
      currentFilter = "all";

      const queryBox =
        document.getElementById("queryBox");

      if (queryBox) {
        queryBox.value = "";
      }

      const detailPane =
        document.getElementById("detailPane");

      if (detailPane) {
        detailPane.classList.remove("visible");
      }

      setFilter("all");
      renderResults();
      updateCounts();
      updateExportButtons();
      updateRunButtonLabel();
      updateResetButton();
      setProgress(0);
      setStatus("Ready", "var(--accent)");
    })
    .catch(err => {
      console.error(err);

      setStatus(
        "Failed to reset.",
        "var(--danger)"
      );
    });
}

function stopBatch() {
  callPy("stop_batch")
    .catch(err => console.error(err));

  const stopBtn =
    document.getElementById("stopBtn");

  if (stopBtn) {
    stopBtn.disabled = true;
  }

  setStatus(
    "Stopping after current item...",
    "var(--warning)"
  );
}


// Expose functions for Eel
if (typeof eel !== "undefined" && eel.expose) {
  eel.expose(onItemDone, "onItemDone");
  eel.expose(onRetry, "onRetry");
  eel.expose(onBatchFinished, "onBatchFinished");
}

function initApp() {
  const runBtn =
    document.getElementById("runBtn");

  const stopBtn =
    document.getElementById("stopBtn");

  const resetBtn =
    document.getElementById("resetBtn");

  const historyBtn =
    document.getElementById("historyBtn");

  const historyModalClose =
    document.getElementById("historyModalClose");

  const historyModalOverlay =
    document.getElementById("historyModalOverlay");

  const clearHistoryBtn =
    document.getElementById("clearHistoryBtn");

  const exportPdfBtn =
    document.getElementById("exportPdfBtn");

  const exportJsonBtn =
    document.getElementById("exportJsonBtn");

  const exportCsvBtn =
    document.getElementById("exportCsvBtn");

  const exportMenuBtn =
    document.getElementById("exportMenuBtn");

  const exportMenu =
    document.querySelector(".export-menu");

  const exportMenuDropdown =
    document.getElementById("exportMenuDropdown");

  const detailClose =
    document.getElementById("detailClose");

  const tabMap =
    document.getElementById("tab-map");

  const tabAll =
    document.getElementById("tab-all");

  const tabOk =
    document.getElementById("tab-ok");

  const tabFail =
    document.getElementById("tab-fail");

  if (runBtn) {
    runBtn.addEventListener(
      "click",
      runBatch
    );
  }

  if (stopBtn) {
    stopBtn.addEventListener(
      "click",
      stopBatch
    );
  }

  if (resetBtn) {
    resetBtn.addEventListener(
      "click",
      resetBatch
    );
  }

  if (historyBtn) {
    historyBtn.addEventListener(
      "click",
      openHistoryModal
    );
  }

  if (historyModalClose) {
    historyModalClose.addEventListener(
      "click",
      closeHistoryModal
    );
  }

  if (historyModalOverlay) {
    historyModalOverlay.addEventListener(
      "click",
      event => {
        if (event.target === historyModalOverlay) {
          closeHistoryModal();
        }
      }
    );
  }

  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener(
      "click",
      clearAllHistory
    );
  }

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeHistoryModal();
    }
  });

  if (exportPdfBtn) {
    exportPdfBtn.addEventListener(
      "click",
      exportPdf
    );
  }

  if (exportJsonBtn) {
    exportJsonBtn.addEventListener(
      "click",
      exportJson
    );
  }

  if (exportCsvBtn) {
    exportCsvBtn.addEventListener(
      "click",
      exportCsv
    );
  }


  if (exportMenuBtn && exportMenu) {
    exportMenuBtn.addEventListener("click", event => {
      event.stopPropagation();
      const open = exportMenu.classList.toggle("open");
      exportMenuBtn.setAttribute("aria-expanded", String(open));
    });

    document.addEventListener("click", event => {
      if (!exportMenu.contains(event.target)) {
        exportMenu.classList.remove("open");
        exportMenuBtn.setAttribute("aria-expanded", "false");
      }
    });

    if (exportMenuDropdown) {
      exportMenuDropdown.addEventListener("click", event => {
        const item = event.target.closest(".export-menu-item");
        if (!item || item.disabled) return;
        exportMenu.classList.remove("open");
        exportMenuBtn.setAttribute("aria-expanded", "false");
      });
    }
  }

  if (detailClose) {
    detailClose.addEventListener(
      "click",
      closeDetail
    );
  }

  if (tabMap) {
    tabMap.addEventListener(
      "click",
      () => setFilter("map")
    );
  }

  if (tabAll) {
    tabAll.addEventListener(
      "click",
      () => setFilter("all")
    );
  }

  if (tabOk) {
    tabOk.addEventListener(
      "click",
      () => setFilter("ok")
    );
  }

  if (tabFail) {
    tabFail.addEventListener(
      "click",
      () => setFilter("fail")
    );
  }

  callPy("get_config")
    .then(cfg => {
      if (
        cfg &&
        cfg.delay !== undefined
      ) {
        const delayText =
          document.getElementById("delayText");

        if (delayText) {
          delayText.textContent =
            `Delay: ${cfg.delay}s`;
        }
      }
    })
    .catch(err => {
      console.error(
        "get_config failed:",
        err
      );
    });

  updateCounts();
  updateExportButtons();
  updateRunButtonLabel();
  updateResetButton();
  renderResults();
}

document.addEventListener(
  "DOMContentLoaded",
  initApp
);