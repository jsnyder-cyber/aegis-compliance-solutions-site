let readiness = null;
let filter = "all";
let selectedDomainId = null;

const elements = {
  oscName: document.querySelector("#osc-name"),
  updatedAt: document.querySelector("#updated-at"),
  scanState: document.querySelector("#scan-state"),
  readyPercent: document.querySelector("#ready-percent"),
  scoreRing: document.querySelector("#score-ring"),
  readinessTitle: document.querySelector("#readiness-title"),
  readinessCopy: document.querySelector("#readiness-copy"),
  total: document.querySelector("#metric-total"),
  sufficient: document.querySelector("#metric-sufficient"),
  review: document.querySelector("#metric-review"),
  gaps: document.querySelector("#metric-gaps"),
  search: document.querySelector("#search-input"),
  refresh: document.querySelector("#refresh-button"),
  scan: document.querySelector("#scan-button"),
  filters: document.querySelectorAll("[data-filter]"),
  domainView: document.querySelector("#domain-view"),
  requirementView: document.querySelector("#requirement-view"),
  requirementsList: document.querySelector("#requirements-list"),
  back: document.querySelector("#back-button"),
  domainCode: document.querySelector("#domain-code"),
  domainTitle: document.querySelector("#domain-title")
};

function statusBucket(status) {
  const normalized = String(status || "").toLowerCase();
  if (["sufficient", "complete", "ready", "accepted"].includes(normalized)) return "sufficient";
  if (["gap", "insufficient", "missing", "needs evidence"].includes(normalized)) return "gaps";
  if (["needs review", "review", "pending review", "assessor review"].includes(normalized)) return "review";
  return "notStarted";
}

function summarizePractices(practices) {
  const counts = practices.reduce(
    (total, practice) => {
      const bucket = statusBucket(practice.status);
      total[bucket] += 1;
      return total;
    },
    { sufficient: 0, review: 0, gaps: 0, notStarted: 0 }
  );

  return {
    totalPractices: practices.length,
    readyPercent: practices.length ? Math.round((counts.sufficient / practices.length) * 100) : 0,
    sufficient: counts.sufficient,
    review: counts.review,
    gaps: counts.gaps,
    notStarted: counts.notStarted
  };
}

function readinessWithDomains(readinessData, catalogData) {
  const reviews = new Map((readinessData.practices || []).map((practice) => [practice.id, practice]));
  const domains = (catalogData.domains || []).map((domain) => {
    const requirements = (domain.requirements || []).map((requirement) => {
      const review = reviews.get(requirement.id) || {};
      const status = review.status || "Not Started";

      return {
        ...requirement,
        status,
        bucket: statusBucket(status),
        evidence: review.evidence || "",
        owner: review.owner || "",
        updated: review.updated || "",
        gap: review.gap || "",
        confidence: review.confidence ?? null
      };
    });

    return {
      ...domain,
      summary: summarizePractices(requirements),
      requirements
    };
  });
  const practices = domains.flatMap((domain) => domain.requirements);

  return {
    oscName: readinessData.oscName || "OSC CMMC Readiness",
    updatedAt: readinessData.updatedAt || new Date().toISOString(),
    summary: summarizePractices(practices),
    domains,
    practices
  };
}

function formatDate(value) {
  if (!value) return "Not recorded";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(year, month - 1, day));
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: value.includes("T") ? "short" : undefined
  }).format(date);
}

function readinessMessage(summary) {
  if ((summary.gaps || 0) > 0) {
    return {
      title: "Evidence gaps remain",
      copy: `${summary.gaps} requirement${summary.gaps === 1 ? " has" : "s have"} evidence gaps that should be resolved before assessment readiness.`
    };
  }

  if ((summary.review || 0) > 0) {
    return {
      title: "Evidence is pending review",
      copy: `${summary.review} requirement${summary.review === 1 ? " needs" : "s need"} assessor review before readiness can be confirmed.`
    };
  }

  if ((summary.notStarted || 0) > 0) {
    return {
      title: "Evidence collection in progress",
      copy: `${summary.notStarted} requirement${summary.notStarted === 1 ? " has" : "s have"} not been mapped to evidence yet.`
    };
  }

  return {
    title: "Ready for assessment scheduling",
    copy: "The tracked requirements have sufficient evidence in the current body of evidence."
  };
}

function renderSummary(data) {
  const summary = data.summary || {};
  const percent = Number(summary.readyPercent || 0);
  const message = readinessMessage(summary);

  elements.oscName.textContent = data.oscName || "OSC Body of Evidence";
  elements.updatedAt.textContent = `Updated ${formatDate(data.updatedAt)}`;
  elements.readyPercent.textContent = `${percent}%`;
  elements.scoreRing.style.setProperty("--score", `${Math.max(0, Math.min(100, percent)) * 3.6}deg`);
  elements.readinessTitle.textContent = message.title;
  elements.readinessCopy.textContent = message.copy;
  elements.total.textContent = summary.totalPractices || 0;
  elements.sufficient.textContent = summary.sufficient || 0;
  elements.review.textContent = summary.review || 0;
  elements.gaps.textContent = summary.gaps || 0;
}

function requirementMatches(requirement, domain, query) {
  if (!query) return true;
  return [
    requirement.id,
    requirement.title,
    requirement.status,
    requirement.evidence,
    requirement.owner,
    requirement.gap,
    domain.id,
    domain.name
  ].join(" ").toLowerCase().includes(query);
}

function visibleRequirements(domain) {
  const query = elements.search.value.trim().toLowerCase();
  return domain.requirements.filter((requirement) => {
    const bucket = statusBucket(requirement.status);
    return (filter === "all" || filter === bucket) && requirementMatches(requirement, domain, query);
  });
}

function badge(status) {
  const bucket = statusBucket(status);
  const label = bucket === "notStarted" ? "Not Started" : status || "Not Started";
  return `<span class="status ${bucket}">${label}</span>`;
}

function progressBar(summary) {
  const total = summary.totalPractices || 0;
  const width = total ? Math.round(((summary.sufficient || 0) / total) * 100) : 0;
  return `<div class="domain-progress"><span style="width:${width}%"></span></div>`;
}

function renderDomains() {
  const domains = readiness?.domains || [];
  const query = elements.search.value.trim().toLowerCase();

  const cards = domains.map((domain) => {
    const requirements = visibleRequirements(domain);
    const hasVisible = requirements.length > 0 || !query;
    if (!hasVisible) return "";

    const summary = domain.summary || {};
    return `
      <button class="domain-card" type="button" data-domain="${domain.id}">
        <span class="domain-code">${domain.id}</span>
        <strong>${domain.name}</strong>
        <span>${requirements.length} of ${domain.requirements.length} requirements shown</span>
        ${progressBar(summary)}
        <span class="domain-counts">
          <span>${summary.sufficient || 0} sufficient</span>
          <span>${summary.review || 0} review</span>
          <span>${summary.gaps || 0} gaps</span>
        </span>
      </button>
    `;
  }).join("");

  elements.domainView.innerHTML = cards || `<p class="empty-state">No domains match the current filters.</p>`;
  elements.domainView.querySelectorAll("[data-domain]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDomainId = button.dataset.domain;
      render();
    });
  });
}

function renderRequirementView(domain) {
  elements.domainCode.textContent = domain.id;
  elements.domainTitle.textContent = domain.name;

  const requirements = visibleRequirements(domain);
  if (!requirements.length) {
    elements.requirementsList.innerHTML = `<p class="empty-state">No requirements match the current filters.</p>`;
    return;
  }

  elements.requirementsList.innerHTML = requirements.map((requirement) => {
    const confidence = typeof requirement.confidence === "number"
      ? Math.round(requirement.confidence * 100)
      : null;

    return `
      <article class="requirement-row">
        <div class="requirement-main">
          <div>
            <span class="practice-id">${requirement.id}</span>
            <h3>${requirement.title}</h3>
          </div>
          ${badge(requirement.status)}
        </div>
        <dl class="requirement-detail">
          <div>
            <dt>Evidence</dt>
            <dd>${requirement.evidence || "No evidence mapped yet"}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>${requirement.updated ? formatDate(requirement.updated) : "Not scanned"}</dd>
          </div>
          <div>
            <dt>AI Confidence</dt>
            <dd>${confidence === null ? "N/A" : `${confidence}%`}</dd>
          </div>
          <div>
            <dt>Gap / Follow-up</dt>
            <dd>${requirement.gap || "No open gap recorded"}</dd>
          </div>
        </dl>
      </article>
    `;
  }).join("");
}

function render() {
  if (!readiness) return;
  renderSummary(readiness);

  const domain = (readiness.domains || []).find((item) => item.id === selectedDomainId);
  if (domain) {
    elements.domainView.classList.add("hidden");
    elements.requirementView.classList.remove("hidden");
    renderRequirementView(domain);
  } else {
    elements.requirementView.classList.add("hidden");
    elements.domainView.classList.remove("hidden");
    renderDomains();
  }
}

async function loadReadiness() {
  elements.updatedAt.textContent = "Refreshing...";
  const [readinessResponse, catalogResponse] = await Promise.all([
    fetch("data/readiness.json", { cache: "no-store" }),
    fetch("data/cmmc-catalog.json", { cache: "no-store" })
  ]);

  if (!readinessResponse.ok || !catalogResponse.ok) {
    throw new Error("Unable to load readiness data");
  }

  const readinessData = await readinessResponse.json();
  const catalogData = await catalogResponse.json();
  readiness = readinessWithDomains(readinessData, catalogData);
  elements.scanState.textContent = "Data loaded";
  render();
}

async function runScan() {
  elements.scan.disabled = true;
  elements.scanState.textContent = "Refreshing data...";

  try {
    await loadReadiness();
    elements.scanState.textContent = "Readiness data refreshed";
  } catch (error) {
    elements.scanState.textContent = error.message;
  } finally {
    elements.scan.disabled = false;
  }
}

elements.search.addEventListener("input", render);
elements.refresh.addEventListener("click", loadReadiness);
elements.scan.addEventListener("click", runScan);
elements.back.addEventListener("click", () => {
  selectedDomainId = null;
  render();
});

elements.filters.forEach((button) => {
  button.addEventListener("click", () => {
    filter = button.dataset.filter;
    elements.filters.forEach((item) => item.classList.toggle("active", item === button));
    render();
  });
});

loadReadiness().catch(() => {
  elements.updatedAt.textContent = "Unable to load readiness data";
});
