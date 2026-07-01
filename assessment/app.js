let readiness = null;
let selectedDomainId = null;
const AUTH_USERNAME = "Aegis";
const AUTH_PASSWORD = "Aegis2026!";
const AUTH_SESSION_KEY = "aegis-readiness-authenticated";

const elements = {
  authScreen: document.querySelector("#auth-screen"),
  authForm: document.querySelector("#auth-form"),
  authUsername: document.querySelector("#auth-username"),
  authPassword: document.querySelector("#auth-password"),
  authError: document.querySelector("#auth-error"),
  portalShell: document.querySelector("#portal-shell"),
  oscName: document.querySelector("#osc-name"),
  updatedAt: document.querySelector("#updated-at"),
  scanState: document.querySelector("#scan-state"),
  domainTotal: document.querySelector("#domain-total"),
  readinessTitle: document.querySelector("#readiness-title"),
  readinessCopy: document.querySelector("#readiness-copy"),
  domains: document.querySelector("#metric-domains"),
  total: document.querySelector("#metric-total"),
  search: document.querySelector("#search-input"),
  refresh: document.querySelector("#refresh-button"),
  scan: document.querySelector("#scan-button"),
  logout: document.querySelector("#logout-button"),
  domainView: document.querySelector("#domain-view"),
  requirementView: document.querySelector("#requirement-view"),
  requirementsList: document.querySelector("#requirements-list"),
  back: document.querySelector("#back-button"),
  domainCode: document.querySelector("#domain-code"),
  domainTitle: document.querySelector("#domain-title")
};

function showPortal() {
  document.body.classList.remove("auth-locked");
  elements.authScreen.hidden = true;
  elements.portalShell.hidden = false;
  loadReadiness().catch((error) => {
    console.error("Readiness load failed", error);
    elements.updatedAt.textContent = "Unable to load readiness data";
  });
}

function logout() {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  window.location.href = "../";
}

function handleAuthSubmit(event) {
  event.preventDefault();

  const username = elements.authUsername.value.trim();
  const password = elements.authPassword.value;

  if (username === AUTH_USERNAME && password === AUTH_PASSWORD) {
    sessionStorage.setItem(AUTH_SESSION_KEY, "true");
    elements.authError.textContent = "";
    showPortal();
    return;
  }

  elements.authError.textContent = "Invalid username or password.";
  elements.authPassword.value = "";
  elements.authPassword.focus();
}

function summarizePractices(practices) {
  return {
    totalPractices: practices.length
  };
}

function readinessWithDomains(readinessData, catalogData) {
  const domains = (catalogData.domains || []).map((domain) => {
    const requirements = (domain.requirements || []).map((requirement) => {
      return {
        ...requirement
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
    domainCount: domains.length,
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

function renderSummary(data) {
  const summary = data.summary || {};
  const domainCount = data.domainCount || (data.domains || []).length;
  const totalPractices = summary.totalPractices || 0;

  elements.oscName.textContent = data.oscName || "OSC Body of Evidence";
  elements.updatedAt.textContent = "Updated just now";
  elements.domainTotal.textContent = domainCount;
  elements.readinessTitle.textContent = `${domainCount} domains, ${totalPractices} security requirements`;
  elements.readinessCopy.textContent = "Select a domain to view its CMMC Level 2 security requirements.";
  elements.domains.textContent = domainCount;
  elements.total.textContent = totalPractices;
}

function requirementMatches(requirement, domain, query) {
  if (!query) return true;
  return [
    requirement.id,
    requirement.title,
    domain.id,
    domain.name
  ].join(" ").toLowerCase().includes(query);
}

function visibleRequirements(domain) {
  const query = elements.search.value.trim().toLowerCase();
  return domain.requirements.filter((requirement) => requirementMatches(requirement, domain, query));
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
        <span class="domain-counts">${summary.totalPractices || 0} security requirements</span>
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
    return `
      <article class="requirement-row">
        <div class="requirement-main">
          <div>
            <span class="practice-id">${requirement.id}</span>
            <h3>${requirement.title}</h3>
          </div>
        </div>
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
  const catalogResponse = await fetch("data/cmmc-catalog.json", { cache: "no-store" });

  if (!catalogResponse.ok) {
    throw new Error("Unable to load readiness data");
  }

  const catalogData = await catalogResponse.json();
  readiness = readinessWithDomains({
    oscName: "OSC CMMC Readiness",
    updatedAt: new Date().toISOString()
  }, catalogData);
  try {
    render();
    elements.scanState.textContent = "Data loaded";
  } catch (error) {
    elements.scanState.textContent = `Render failed: ${error.message}`;
    throw error;
  }
}

async function runScan() {
  elements.scan.disabled = true;
  elements.scanState.textContent = "Gemini review started";

  try {
    const response = await fetch("/.netlify/functions/gemini-review", { method: "POST" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "Review could not be started.");

    elements.scanState.textContent = payload.message || "Gemini review started";
  } catch (error) {
    elements.scanState.textContent = "Gemini review started";
  } finally {
    elements.scan.disabled = false;
  }
}

elements.search.addEventListener("input", render);
elements.refresh.addEventListener("click", loadReadiness);
elements.scan.addEventListener("click", runScan);
elements.logout.addEventListener("click", logout);
elements.back.addEventListener("click", () => {
  selectedDomainId = null;
  render();
});

elements.authForm.addEventListener("submit", handleAuthSubmit);

if (sessionStorage.getItem(AUTH_SESSION_KEY) === "true") {
  showPortal();
} else {
  elements.portalShell.hidden = true;
  elements.authUsername.focus();
}
