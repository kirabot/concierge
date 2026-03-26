const $ = (id) => document.getElementById(id);

const TEMPLATE_URLS = {
  classic: "/static/cv.template.html",
  noir: "/static/cv.noir.template.html",
};
const SAMPLE_PROFILE_URL = "/static/examples/profile.sample.json";
const SAMPLE_JOB_URL = "/static/examples/job.sample.json";

const DEFAULT_CAPS = {
  experience: 3,
  projects: 3,
  achievements: 3,
  skills: 12,
  education: 3,
  certifications: 3,
};

const state = {
  profile: null,
  job: null,
  draft: null,
  templateId: "classic",
  templateHtmlById: {},
  nextSpacerId: 1,
  reviewTabId: null,
};

function syncSelectedItemIds(draft) {
  draft.selected_item_ids = draft.selected_sections.flatMap((section) =>
    section.included && section.type !== "spacer" ? section.items.filter((item) => item.included).map((item) => item.id) : []
  );
}

function normalizeHostLabel(url) {
  const text = String(url || "").trim();
  if (!text) return "";
  try {
    const parsed = new URL(text);
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    return text.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
  }
}

function buildHeaderLinks(profile) {
  const links = [];
  const basicsWebsite = String(profile?.basics?.website || "").trim();
  if (basicsWebsite) {
    links.push({
      label: "Personal Website",
      url: basicsWebsite,
    });
  }

  const linkedIn = (profile?.links || []).find((link) => /linkedin/i.test(String(link.label || "")) || /linkedin\.com/i.test(String(link.url || "")));
  if (linkedIn?.url) {
    links.push({
      label: "LinkedIn Page",
      url: linkedIn.url,
    });
  }

  const showreel = (profile?.links || []).find(
    (link) => /showreel/i.test(String(link.label || "")) || /vimeo\.com/i.test(String(link.url || ""))
  );
  if (showreel?.url) {
    links.push({
      label: "Showreel",
      url: showreel.url,
    });
  }

  return links;
}

function createSpacerSection(heightMm = 14) {
  const spacerId = `spacer_${state.nextSpacerId++}`;
  return {
    id: spacerId,
    type: "spacer",
    title: "Spacer",
    included: true,
    items: [
      {
        id: `${spacerId}_item`,
        title: "Page Spacer",
        included: true,
        height_mm: heightMm,
        score: 0,
        subtitle: "",
        bullets: [],
        scoreMeta: {
          matchedMust: [],
          matchedNice: [],
          matchedKeywords: [],
          focusMatches: [],
          avoidHits: [],
        },
        raw: {},
      },
    ],
  };
}

function ensureActiveReviewTab() {
  const sections = state.draft?.selected_sections || [];
  if (!sections.length) {
    state.reviewTabId = null;
    return;
  }

  if (!sections.some((section) => section.id === state.reviewTabId)) {
    state.reviewTabId = sections[0].id;
  }
}

function reviewTabLabel(section, index) {
  if (section.type === "spacer") {
    const spacerNumber =
      state.draft.selected_sections
        .slice(0, index + 1)
        .filter((entry) => entry.type === "spacer").length;
    return `Spacer ${spacerNumber}`;
  }
  return section.title;
}

function headlineChoicesFromBasics(basics) {
  return [...new Set([basics?.headline, ...(Array.isArray(basics?.headlines) ? basics.headlines : [])].filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

function setStatus(message) {
  $("status").textContent = message;
}

function setError(message = "") {
  const box = $("error");
  if (!message) {
    box.style.display = "none";
    box.textContent = "";
    return;
  }
  box.style.display = "block";
  box.textContent = message;
}

function handleUiError(error) {
  setError(error?.message || String(error));
  setStatus("Something failed while updating the draft preview.");
}

function normalizeToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#/.\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeText(value) {
  const normalized = normalizeToken(value);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length > 1);
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rejectUnknown(obj, allowedKeys, path, errors) {
  if (!isObject(obj)) return;
  Object.keys(obj).forEach((key) => {
    if (!allowedKeys.includes(key)) {
      errors.push(`${path}.${key} is not allowed`);
    }
  });
}

function requireObject(value, path, errors) {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return false;
  }
  return true;
}

function requireArray(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return false;
  }
  return true;
}

function requireString(value, path, errors) {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${path} must be a non-empty string`);
    return false;
  }
  return true;
}

function optionalString(value, path, errors) {
  if (value === undefined) return true;
  if (typeof value !== "string") {
    errors.push(`${path} must be a string`);
    return false;
  }
  return true;
}

function optionalNumber(value, path, errors) {
  if (value === undefined) return true;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${path} must be a number`);
    return false;
  }
  return true;
}

function optionalBoolean(value, path, errors) {
  if (value === undefined) return true;
  if (typeof value !== "boolean") {
    errors.push(`${path} must be a boolean`);
    return false;
  }
  return true;
}

function validateStringArray(value, path, errors, required = false) {
  if (value === undefined) {
    if (required) errors.push(`${path} must be an array of strings`);
    return;
  }
  if (!requireArray(value, path, errors)) return;
  value.forEach((entry, index) => {
    if (typeof entry !== "string" || !entry.trim()) {
      errors.push(`${path}[${index}] must be a non-empty string`);
    }
  });
}

function validateDateRange(value, path, errors, required = true) {
  if (value === undefined) {
    if (required) errors.push(`${path} is required`);
    return;
  }
  if (!requireObject(value, path, errors)) return;
  rejectUnknown(value, ["start", "end"], path, errors);
  requireString(value.start, `${path}.start`, errors);
  if (value.end !== undefined) {
    requireString(value.end, `${path}.end`, errors);
  }
}

function validateLinks(items, path, errors) {
  if (!requireArray(items, path, errors)) return;
  items.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!requireObject(item, itemPath, errors)) return;
    rejectUnknown(item, ["id", "label", "url", "kind", "priority", "tags", "keywords"], itemPath, errors);
    requireString(item.id, `${itemPath}.id`, errors);
    requireString(item.label, `${itemPath}.label`, errors);
    requireString(item.url, `${itemPath}.url`, errors);
    optionalString(item.kind, `${itemPath}.kind`, errors);
    optionalNumber(item.priority, `${itemPath}.priority`, errors);
    validateStringArray(item.tags, `${itemPath}.tags`, errors);
    validateStringArray(item.keywords, `${itemPath}.keywords`, errors);
  });
}

function validateRoleLike(item, path, errors, options = {}) {
  if (!requireObject(item, path, errors)) return;
  const labelKey = options.labelKey || "title";
  const allowed = [
    "id",
    labelKey,
    "organization",
    "organization_url",
    "institution",
    "issuer",
    "location",
    "summary",
    "bullets",
    "date_range",
    "tags",
    "skills",
    "keywords",
    "domains",
    "impact",
    "priority",
    "url",
    "credential_id",
    "details",
  ];
  rejectUnknown(item, allowed, path, errors);
  requireString(item.id, `${path}.id`, errors);
  requireString(item[labelKey], `${path}.${labelKey}`, errors);
  validateDateRange(item.date_range, `${path}.date_range`, errors, !options.optionalDateRange);
  validateStringArray(item.bullets, `${path}.bullets`, errors, Boolean(options.requireBullets));
  optionalString(item.organization, `${path}.organization`, errors);
  optionalString(item.organization_url, `${path}.organization_url`, errors);
  optionalString(item.institution, `${path}.institution`, errors);
  optionalString(item.issuer, `${path}.issuer`, errors);
  optionalString(item.location, `${path}.location`, errors);
  optionalString(item.summary, `${path}.summary`, errors);
  optionalString(item.impact, `${path}.impact`, errors);
  optionalNumber(item.priority, `${path}.priority`, errors);
  optionalString(item.url, `${path}.url`, errors);
  optionalString(item.credential_id, `${path}.credential_id`, errors);
  optionalString(item.details, `${path}.details`, errors);
  validateStringArray(item.tags, `${path}.tags`, errors);
  validateStringArray(item.skills, `${path}.skills`, errors);
  validateStringArray(item.keywords, `${path}.keywords`, errors);
  validateStringArray(item.domains, `${path}.domains`, errors);
}

function validateSkills(items, path, errors) {
  if (!requireArray(items, path, errors)) return;
  items.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!requireObject(item, itemPath, errors)) return;
    rejectUnknown(item, ["id", "name", "level", "category", "priority", "tags", "keywords", "domains"], itemPath, errors);
    requireString(item.id, `${itemPath}.id`, errors);
    requireString(item.name, `${itemPath}.name`, errors);
    optionalString(item.level, `${itemPath}.level`, errors);
    optionalString(item.category, `${itemPath}.category`, errors);
    optionalNumber(item.priority, `${itemPath}.priority`, errors);
    validateStringArray(item.tags, `${itemPath}.tags`, errors);
    validateStringArray(item.keywords, `${itemPath}.keywords`, errors);
    validateStringArray(item.domains, `${itemPath}.domains`, errors);
  });
}

function validateProfile(profile) {
  const errors = [];
  const allowedTop = ["basics", "roles", "projects", "achievements", "skills", "education", "certifications", "links"];
  if (!requireObject(profile, "profile", errors)) return errors;
  rejectUnknown(profile, allowedTop, "profile", errors);

  const basics = profile.basics;
  if (requireObject(basics, "profile.basics", errors)) {
    rejectUnknown(basics, ["name", "headline", "headlines", "email", "phone", "location", "summary", "website"], "profile.basics", errors);
    requireString(basics.name, "profile.basics.name", errors);
    requireString(basics.email, "profile.basics.email", errors);
    requireString(basics.location, "profile.basics.location", errors);
    optionalString(basics.headline, "profile.basics.headline", errors);
    validateStringArray(basics.headlines, "profile.basics.headlines", errors);
    optionalString(basics.phone, "profile.basics.phone", errors);
    optionalString(basics.summary, "profile.basics.summary", errors);
    optionalString(basics.website, "profile.basics.website", errors);
    if (!headlineChoicesFromBasics(basics).length) {
      errors.push("profile.basics must include a headline or a non-empty headlines array");
    }
  }

  if (requireArray(profile.roles, "profile.roles", errors)) {
    profile.roles.forEach((item, index) => {
      validateRoleLike(item, `profile.roles[${index}]`, errors, { requireBullets: true, labelKey: "title" });
    });
  }

  if (requireArray(profile.projects, "profile.projects", errors)) {
    profile.projects.forEach((item, index) => {
      validateRoleLike(item, `profile.projects[${index}]`, errors, { requireBullets: true, labelKey: "name" });
    });
  }

  if (requireArray(profile.achievements, "profile.achievements", errors)) {
    profile.achievements.forEach((item, index) => {
      validateRoleLike(item, `profile.achievements[${index}]`, errors, {
        requireBullets: true,
        labelKey: "title",
        optionalDateRange: true,
      });
    });
  }

  validateSkills(profile.skills, "profile.skills", errors);

  if (requireArray(profile.education, "profile.education", errors)) {
    profile.education.forEach((item, index) => {
      validateRoleLike(item, `profile.education[${index}]`, errors, { labelKey: "credential" });
    });
  }

  if (requireArray(profile.certifications, "profile.certifications", errors)) {
    profile.certifications.forEach((item, index) => {
      validateRoleLike(item, `profile.certifications[${index}]`, errors, { labelKey: "name" });
    });
  }

  validateLinks(profile.links, "profile.links", errors);
  return errors;
}

function validateFocus(value, path, errors) {
  if (!requireObject(value, path, errors)) return;
  Object.entries(value).forEach(([key, entry]) => {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      errors.push(`${path}.${key} must be a number`);
    }
  });
}

function validateConstraints(value, path, errors) {
  if (!requireObject(value, path, errors)) return;
  rejectUnknown(
    value,
    ["prioritize_recent", "max_roles", "max_projects", "max_achievements", "max_skills", "notes", "avoid"],
    path,
    errors
  );
  optionalBoolean(value.prioritize_recent, `${path}.prioritize_recent`, errors);
  optionalNumber(value.max_roles, `${path}.max_roles`, errors);
  optionalNumber(value.max_projects, `${path}.max_projects`, errors);
  optionalNumber(value.max_achievements, `${path}.max_achievements`, errors);
  optionalNumber(value.max_skills, `${path}.max_skills`, errors);
  optionalString(value.notes, `${path}.notes`, errors);
  validateStringArray(value.avoid, `${path}.avoid`, errors);
}

function validateJob(job) {
  const errors = [];
  const allowedTop = ["target_role", "company", "summary", "must_have", "nice_to_have", "keywords", "focus", "constraints"];
  if (!requireObject(job, "job", errors)) return errors;
  rejectUnknown(job, allowedTop, "job", errors);

  if (requireObject(job.target_role, "job.target_role", errors)) {
    rejectUnknown(job.target_role, ["title", "level", "team", "location", "employment_type"], "job.target_role", errors);
    requireString(job.target_role.title, "job.target_role.title", errors);
    optionalString(job.target_role.level, "job.target_role.level", errors);
    optionalString(job.target_role.team, "job.target_role.team", errors);
    optionalString(job.target_role.location, "job.target_role.location", errors);
    optionalString(job.target_role.employment_type, "job.target_role.employment_type", errors);
  }

  if (requireObject(job.company, "job.company", errors)) {
    rejectUnknown(job.company, ["name", "industry", "description"], "job.company", errors);
    requireString(job.company.name, "job.company.name", errors);
    optionalString(job.company.industry, "job.company.industry", errors);
    optionalString(job.company.description, "job.company.description", errors);
  }

  requireString(job.summary, "job.summary", errors);
  validateStringArray(job.must_have, "job.must_have", errors, true);
  validateStringArray(job.nice_to_have, "job.nice_to_have", errors, true);
  validateStringArray(job.keywords, "job.keywords", errors, true);
  validateFocus(job.focus, "job.focus", errors);
  validateConstraints(job.constraints, "job.constraints", errors);
  return errors;
}

function safeParseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function itemDisplayTitle(item, sectionId) {
  if (sectionId === "projects" || sectionId === "skills") return item.name;
  if (sectionId === "education") return item.credential;
  return item.title || item.name;
}

function itemDisplaySubtitle(item, sectionId) {
  if (sectionId === "roles") return [item.organization, item.location].filter(Boolean).join(" • ");
  if (sectionId === "projects") return [item.organization, item.location].filter(Boolean).join(" • ");
  if (sectionId === "achievements") return item.summary || item.impact || "";
  if (sectionId === "education") return [item.institution, item.location].filter(Boolean).join(" • ");
  if (sectionId === "certifications") return [item.issuer, item.credential_id].filter(Boolean).join(" • ");
  if (sectionId === "skills") return [item.category, item.level].filter(Boolean).join(" • ");
  return "";
}

function formatDateRange(dateRange) {
  if (!dateRange || !dateRange.start) return "";
  const monthNames = {
    "01": "Jan",
    "02": "Feb",
    "03": "Mar",
    "04": "Apr",
    "05": "May",
    "06": "Jun",
    "07": "Jul",
    "08": "Aug",
    "09": "Sep",
    "10": "Oct",
    "11": "Nov",
    "12": "Dec",
  };

  const formatPart = (value) => {
    const text = String(value || "").trim();
    if (!text) return "";
    if (/^present$/i.test(text)) return "Present";
    const monthMatch = text.match(/^(\d{4})-(\d{2})$/);
    if (monthMatch) {
      const [, year, month] = monthMatch;
      return `${monthNames[month] || month} ${year}`;
    }
    return text;
  };

  return `${formatPart(dateRange.start)} - ${formatPart(dateRange.end || "Present")}`;
}

function parseYear(value) {
  const match = String(value || "").match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

function recencyBonus(item, prioritizeRecent) {
  const year = parseYear(item.date_range?.end || item.date_range?.start);
  if (!year) return 0;
  const currentYear = new Date().getFullYear();
  const age = currentYear - year;
  let bonus = 0;
  if (age <= 1) bonus = 6;
  else if (age <= 3) bonus = 4;
  else if (age <= 6) bonus = 2;
  return prioritizeRecent ? bonus * 1.2 : bonus;
}

function impactBonus(item) {
  const impact = String(item.impact || "");
  if (!impact) return 0;
  return /\d/.test(impact) ? 4 : 2;
}

function numericPriority(item) {
  return Number(item.priority || 0);
}

function buildJobSignal(job) {
  return {
    mustHave: unique(job.must_have.map(normalizeToken)),
    niceToHave: unique(job.nice_to_have.map(normalizeToken)),
    keywords: unique(job.keywords.map(normalizeToken)),
    focus: job.focus || {},
    avoid: unique(arrayOfStrings(job.constraints?.avoid).map(normalizeToken)),
    titleTokens: tokenizeText(job.target_role?.title),
    companyTokens: tokenizeText([job.company?.name, job.company?.industry, job.company?.description].filter(Boolean).join(" ")),
  };
}

function itemTokenMap(item, sectionId) {
  const title = itemDisplayTitle(item, sectionId);
  const subtitle = itemDisplaySubtitle(item, sectionId);
  const text = [
    title,
    subtitle,
    item.summary,
    item.details,
    item.impact,
    ...(item.bullets || []),
    ...(item.skills || []),
    ...(item.tags || []),
    ...(item.keywords || []),
    ...(item.domains || []),
  ]
    .filter(Boolean)
    .join(" ");
  const tokens = unique(tokenizeText(text));
  const phrases = unique(
    [
      ...(item.skills || []),
      ...(item.tags || []),
      ...(item.keywords || []),
      ...(item.domains || []),
      title,
      subtitle,
    ]
      .filter(Boolean)
      .map(normalizeToken)
  );
  return { tokens, phrases };
}

function matchesSignal(itemTokens, signalEntries) {
  return signalEntries.filter((entry) => {
    const entryTokens = tokenizeText(entry);
    if (!entryTokens.length) return false;
    return entryTokens.every((token) => itemTokens.tokens.includes(token)) || itemTokens.phrases.includes(entry);
  });
}

function sectionFingerprint(item, sectionId) {
  return [
    sectionId,
    itemDisplayTitle(item, sectionId),
    item.organization,
    item.institution,
    item.issuer,
    (item.bullets || [])[0],
  ]
    .filter(Boolean)
    .map(normalizeToken)
    .join("|");
}

function scoreItem(item, sectionId, jobSignal, job) {
  const itemTokens = itemTokenMap(item, sectionId);
  const matchedMust = matchesSignal(itemTokens, jobSignal.mustHave);
  const matchedNice = matchesSignal(itemTokens, jobSignal.niceToHave);
  const matchedKeywords = matchesSignal(itemTokens, jobSignal.keywords);
  const titleOverlap = jobSignal.titleTokens.filter((token) => itemTokens.tokens.includes(token));
  const companyOverlap = jobSignal.companyTokens.filter((token) => itemTokens.tokens.includes(token));
  const avoidHits = jobSignal.avoid.filter((entry) => itemTokens.tokens.includes(entry) || itemTokens.phrases.includes(entry));

  let focusScore = 0;
  const focusMatches = [];
  Object.entries(jobSignal.focus).forEach(([focusKey, weight]) => {
    const normalized = normalizeToken(focusKey);
    if (!normalized) return;
    if (itemTokens.tokens.includes(normalized) || itemTokens.phrases.includes(normalized)) {
      focusScore += Number(weight || 0) * 2;
      focusMatches.push(focusKey);
    }
  });

  let score = 0;
  score += matchedMust.length * 9;
  score += matchedNice.length * 4;
  score += matchedKeywords.length * 2;
  score += titleOverlap.length * 1.5;
  score += companyOverlap.length;
  score += focusScore;
  score += recencyBonus(item, job.constraints?.prioritize_recent);
  score += impactBonus(item);
  score += numericPriority(item);
  score -= avoidHits.length * 8;
  if (sectionId === "roles") score += 2;
  if (sectionId === "projects") score += 1;

  return {
    score,
    matchedMust,
    matchedNice,
    matchedKeywords,
    focusMatches,
    avoidHits,
  };
}

function buildSummary(profile, job, selectedSections) {
  return String(profile.basics.summary || "").trim();
}

function applyCaps(job, sections) {
  const caps = {
    experience: Number(job.constraints?.max_roles || DEFAULT_CAPS.experience),
    projects: Number(job.constraints?.max_projects || DEFAULT_CAPS.projects),
    achievements: Number(job.constraints?.max_achievements || DEFAULT_CAPS.achievements),
    skills: Number(job.constraints?.max_skills || DEFAULT_CAPS.skills),
    education: DEFAULT_CAPS.education,
    certifications: DEFAULT_CAPS.certifications,
  };
  return sections.map((section) => {
    const cap = caps[section.id] || section.items.length;
    let selectedCount = 0;
    const items = section.items.map((item) => {
      const shouldSelect = item.included && selectedCount < cap;
      if (shouldSelect) selectedCount += 1;
      return { ...item, included: shouldSelect };
    });

    return {
      ...section,
      included: items.some((item) => item.included),
      items,
    };
  });
}

function buildDraft(profile, job) {
  const jobSignal = buildJobSignal(job);
  const seenFingerprints = new Set();
  const sectionSources = [
    ["experience", profile.roles || [], "roles"],
    ["projects", profile.projects || [], "projects"],
    ["achievements", profile.achievements || [], "achievements"],
    ["education", profile.education || [], "education"],
    ["certifications", profile.certifications || [], "certifications"],
  ];

  let selectedSections = sectionSources.map(([draftId, items, sourceId]) => {
    const ranked = items
      .map((item) => {
        const scoreMeta = scoreItem(item, sourceId, jobSignal, job);
        return {
          id: item.id,
          included: scoreMeta.score > 0 || draftId === "education",
          title: itemDisplayTitle(item, sourceId),
          subtitle: itemDisplaySubtitle(item, sourceId),
          dateLabel: formatDateRange(item.date_range),
          summary: item.summary || item.details || item.impact || "",
          bullets: (item.bullets || []).slice(0, 4),
          score: Number(scoreMeta.score.toFixed(1)),
          scoreMeta,
          raw: item,
          sourceId,
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((entry) => {
        const fingerprint = sectionFingerprint(entry.raw, sourceId);
        if (!fingerprint) return entry;
        if (!entry.included) return entry;
        if (seenFingerprints.has(fingerprint)) {
          return { ...entry, included: false };
        }
        seenFingerprints.add(fingerprint);
        return entry;
      });

    return {
      id: draftId,
      title: draftId === "experience" ? "Experience" : draftId.charAt(0).toUpperCase() + draftId.slice(1),
      included: ranked.some((entry) => entry.included),
      items: ranked,
    };
  });

  const scoredSkills = (profile.skills || [])
    .map((item) => {
      const scoreMeta = scoreItem(item, "skills", jobSignal, job);
      return {
        id: item.id,
        included: scoreMeta.score > 0,
        title: item.name,
        subtitle: [item.category, item.level].filter(Boolean).join(" • "),
        dateLabel: "",
        summary: "",
        bullets: [],
        score: Number(scoreMeta.score.toFixed(1)),
        scoreMeta,
        raw: item,
        sourceId: "skills",
      };
    })
    .sort((a, b) => b.score - a.score);

  if (scoredSkills.length) {
    selectedSections.splice(3, 0, {
      id: "skills",
      title: "Skills",
      included: scoredSkills.some((item) => item.included),
      items: scoredSkills,
    });
  }

  selectedSections = applyCaps(job, selectedSections).filter((section) => section.items.length > 0);

  return {
    header: {
      name: profile.basics.name,
      headline: headlineChoicesFromBasics(profile.basics)[0],
      headline_options: headlineChoicesFromBasics(profile.basics),
      location: profile.basics.location || "",
      target_line: `${job.target_role.title} target for ${job.company.name}`,
      contact: [profile.basics.email, profile.basics.phone].filter(Boolean),
      links: buildHeaderLinks(profile),
    },
    summary: buildSummary(profile, job, selectedSections),
    selected_sections: selectedSections,
    selected_item_ids: selectedSections.flatMap((section) => section.items.filter((item) => item.included).map((item) => item.id)),
    generated_from: {
      role: job.target_role.title,
      company: job.company.name,
    },
  };
}

async function loadTemplate(templateId) {
  if (state.templateHtmlById[templateId]) return state.templateHtmlById[templateId];
  const response = await fetch(TEMPLATE_URLS[templateId]);
  if (!response.ok) throw new Error(`Unable to load template (${response.status})`);
  state.templateHtmlById[templateId] = await response.text();
  return state.templateHtmlById[templateId];
}

function setField(root, field, value) {
  const node = root.querySelector(`[data-field="${field}"]`);
  if (node) node.textContent = value || "";
}

function fitHeadline(root) {
  const headline = root.querySelector(".cvHeadline");
  const block = root.querySelector(".headlineBlock");
  const name = root.querySelector(".cvName");
  if (!headline || !block) return;

  const text = String(headline.textContent || "").trim();
  if (!text) return;

  const blockWidth = block.clientWidth;
  const nameWidth = name ? name.getBoundingClientRect().width : 0;
  const maxWidth = Math.min(blockWidth, nameWidth || blockWidth);
  if (!maxWidth) return;

  const steps = [
    { fontSize: 17, letterSpacing: 0.18, font: '700 17px "Inter", "Segoe UI", sans-serif' },
    { fontSize: 16, letterSpacing: 0.17, font: '700 16px "Inter", "Segoe UI", sans-serif' },
    { fontSize: 15, letterSpacing: 0.16, font: '700 15px "Inter", "Segoe UI", sans-serif' },
    { fontSize: 14, letterSpacing: 0.15, font: '700 14px "Inter", "Segoe UI", sans-serif' },
    { fontSize: 13, letterSpacing: 0.14, font: '700 13px "Inter", "Segoe UI", sans-serif' },
    { fontSize: 12, letterSpacing: 0.13, font: '700 12px "Inter", "Segoe UI", sans-serif' },
  ];

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let chosen = steps[steps.length - 1];
  headline.style.maxWidth = `${Math.floor(maxWidth)}px`;

  for (const step of steps) {
    ctx.font = step.font;
    const measured = ctx.measureText(text).width;
    const trackingWidth = step.fontSize * step.letterSpacing * Math.max(text.replace(/\s+/g, "").length - 1, 0);
    if (measured + trackingWidth <= maxWidth || step === steps[steps.length - 1]) {
      chosen = step;
      break;
    }
  }

  headline.style.fontSize = `${chosen.fontSize}px`;
  headline.style.letterSpacing = `${chosen.letterSpacing}em`;
}

function fitName(root) {
  const name = root.querySelector(".cvName");
  const block = root.querySelector(".nameBlock");
  if (!name || !block) return;

  const text = String(name.textContent || "").trim();
  if (!text) return;

  const maxWidth = block.clientWidth;
  if (!maxWidth) return;

  const steps = [
    { fontSize: 60, font: '700 60px "Canela", "Playfair Display", Georgia, serif' },
    { fontSize: 58, font: '700 58px "Canela", "Playfair Display", Georgia, serif' },
    { fontSize: 56, font: '700 56px "Canela", "Playfair Display", Georgia, serif' },
    { fontSize: 54, font: '700 54px "Canela", "Playfair Display", Georgia, serif' },
    { fontSize: 52, font: '700 52px "Canela", "Playfair Display", Georgia, serif' },
    { fontSize: 50, font: '700 50px "Canela", "Playfair Display", Georgia, serif' },
    { fontSize: 48, font: '700 48px "Canela", "Playfair Display", Georgia, serif' },
    { fontSize: 46, font: '700 46px "Canela", "Playfair Display", Georgia, serif' },
  ];

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let chosen = steps[steps.length - 1];
  for (const step of steps) {
    ctx.font = step.font;
    if (ctx.measureText(text).width <= maxWidth || step === steps[steps.length - 1]) {
      chosen = step;
      break;
    }
  }

  name.style.fontSize = `${chosen.fontSize}px`;
}

function renderLinks(root, links) {
  const container = root.querySelector('[data-slot="links"]');
  if (!container) return;
  container.innerHTML = "";
  links.forEach((link) => {
    const a = document.createElement("a");
    a.href = link.url;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.className = "contactChip";
    a.textContent = link.label;
    container.appendChild(a);
  });
}

function renderContact(root, contactLines) {
  const container = root.querySelector('[data-slot="contact"]');
  if (!container) return;
  container.innerHTML = "";
  contactLines.forEach((line) => {
    const text = String(line || "").trim();
    const isEmail = text.includes("@");
    const isPhone = /^\+?[0-9()\-\s]+$/.test(text) && /\d/.test(text);
    const isUrl = /^https?:\/\//i.test(text);

    if (isEmail || isPhone || isUrl) {
      const link = document.createElement("a");
      link.href = isEmail ? `mailto:${text}` : isPhone ? `tel:${text.replace(/\s+/g, "")}` : text;
      link.textContent = text;
      link.className = "contactChip";
      if (isUrl) {
        link.target = "_blank";
        link.rel = "noreferrer";
      }
      container.appendChild(link);
    } else {
      const chip = document.createElement("div");
      chip.className = "contactChip";
      chip.textContent = text;
      container.appendChild(chip);
    }
  });
}

function buildEntry(sectionId, item) {
  if (sectionId === "skills") {
    const skill = document.createElement("span");
    skill.className = "skillPill";
    skill.textContent = item.subtitle ? `${item.title} • ${item.subtitle}` : item.title;
    return skill;
  }

  const entry = document.createElement("article");
  entry.className = "entry";

  const top = document.createElement("div");
  top.className = "entryTop";
  const left = document.createElement("div");
  const title = document.createElement("h4");
  title.className = "entryTitle";
  if (item.raw?.url) {
    const link = document.createElement("a");
    link.href = item.raw.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = item.title;
    title.appendChild(link);
  } else {
    title.textContent = item.title;
  }
  left.appendChild(title);

  const organizationName = item.raw?.organization;
  const organizationUrl = item.raw?.organization_url;
  const location = item.raw?.location;

  if (organizationName || item.subtitle) {
    const subtitle = document.createElement("div");
    subtitle.className = "entrySubtitle";
    if (organizationName) {
      if (organizationUrl) {
        const orgLink = document.createElement("a");
        orgLink.href = organizationUrl;
        orgLink.target = "_blank";
        orgLink.rel = "noreferrer";
        orgLink.textContent = organizationName;
        subtitle.appendChild(orgLink);
      } else {
        subtitle.appendChild(document.createTextNode(organizationName));
      }

      if (location) {
        subtitle.appendChild(document.createTextNode(` • ${location}`));
      }
    } else {
      subtitle.textContent = item.subtitle;
    }
    left.appendChild(subtitle);
  }
  top.appendChild(left);

  if (item.dateLabel) {
    const meta = document.createElement("div");
    meta.className = "entryMeta";
    meta.textContent = item.dateLabel;
    top.appendChild(meta);
  }
  entry.appendChild(top);

  if (item.summary) {
    const summary = document.createElement("p");
    summary.className = "entrySummary";
    summary.textContent = item.summary;
    entry.appendChild(summary);
  }

  if (item.bullets.length) {
    const list = document.createElement("ul");
    list.className = "bulletList";
    item.bullets.forEach((bullet) => {
      const li = document.createElement("li");
      li.textContent = bullet;
      list.appendChild(li);
    });
    entry.appendChild(list);
  }

  return entry;
}

function renderSections(root, draft) {
  const container = root.querySelector('[data-slot="sections"]');
  if (!container) return;
  container.innerHTML = "";
  draft.selected_sections
    .filter((section) => section.included && section.items.some((item) => item.included))
    .forEach((section) => {
      if (section.type === "spacer") {
        const spacer = document.createElement("div");
        spacer.className = "pageSpacer";
        spacer.dataset.label = `Spacer ${section.items[0].height_mm}mm`;
        spacer.style.height = `${section.items[0].height_mm}mm`;
        container.appendChild(spacer);
        return;
      }

      const sectionNode = document.createElement("section");
      sectionNode.className = "cvSection";

      const heading = document.createElement("h3");
      heading.className = "sectionHeading";
      heading.textContent = section.title;
      sectionNode.appendChild(heading);

      const list = document.createElement("div");
      list.className = section.id === "skills" ? "skillGrid" : "itemList";
      section.items
        .filter((item) => item.included)
        .forEach((item) => list.appendChild(buildEntry(section.id, item)));

      sectionNode.appendChild(list);
      container.appendChild(sectionNode);
    });
}

function syncNoirPageHeight(root) {
  if (!root) return;

  if (state.templateId !== "noir") {
    root.style.removeProperty("min-height");
    return;
  }

  root.style.removeProperty("min-height");

  const sheet = $("sheet");
  const sheetWidth = sheet?.clientWidth || root.clientWidth;
  if (!sheetWidth) return;

  const pageHeightPx = sheetWidth * (297 / 210);
  const naturalHeightPx = Math.max(root.scrollHeight, pageHeightPx);
  const pageCount = Math.max(1, Math.ceil((naturalHeightPx - 1) / pageHeightPx));
  const paddedHeightPx = pageCount * pageHeightPx;

  root.style.minHeight = `${Math.ceil(paddedHeightPx)}px`;
}

async function renderDraft(draft) {
  const sheet = $("sheet");
  sheet.classList.toggle("sheet-noir", state.templateId === "noir");
  document.body.classList.toggle("print-noir", state.templateId === "noir");
  sheet.innerHTML = await loadTemplate(state.templateId);
  const root = sheet.firstElementChild || sheet;

  setField(root, "header.name", draft.header.name);
  setField(root, "header.headline", draft.header.headline);
  setField(root, "header.location", draft.header.location);
  setField(root, "header.target_line", draft.header.target_line);
  setField(root, "summary", draft.summary);
  renderLinks(root, draft.header.links);
  renderContact(root, draft.header.contact);
  renderSections(root, draft);
  fitName(root);
  fitHeadline(root);
  syncNoirPageHeight(root);

  $("previewMeta").textContent = `${draft.selected_item_ids.length} items selected for ${draft.generated_from.role} at ${draft.generated_from.company}.`;
}

function syncHeadlineSelect(currentHeadline, headlineOptions) {
  const select = $("headlineSelect");
  const options = [...new Set([currentHeadline, ...(headlineOptions || [])].filter(Boolean))];
  select.innerHTML = "";
  options.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
  select.disabled = options.length <= 1;
  select.value = currentHeadline || options[0] || "";
}

function updateReviewEditors(draft) {
  syncHeadlineSelect(draft.header.headline, draft.header.headline_options);
  $("headlineInput").value = draft.header.headline;
  $("summaryInput").value = draft.summary;
}

function itemMatchSummary(item) {
  const parts = [];
  if (item.scoreMeta.matchedMust.length) parts.push(`must: ${item.scoreMeta.matchedMust.join(", ")}`);
  if (item.scoreMeta.matchedNice.length) parts.push(`nice: ${item.scoreMeta.matchedNice.join(", ")}`);
  if (item.scoreMeta.matchedKeywords.length) parts.push(`keywords: ${item.scoreMeta.matchedKeywords.join(", ")}`);
  if (item.scoreMeta.focusMatches.length) parts.push(`focus: ${item.scoreMeta.focusMatches.join(", ")}`);
  if (item.scoreMeta.avoidHits.length) parts.push(`avoid: ${item.scoreMeta.avoidHits.join(", ")}`);
  return parts.join(" | ") || "Selected by general relevance.";
}

function moveSection(sectionIndex, delta) {
  const nextIndex = sectionIndex + delta;
  if (nextIndex < 0 || nextIndex >= state.draft.selected_sections.length) return;
  const updated = [...state.draft.selected_sections];
  const [section] = updated.splice(sectionIndex, 1);
  updated.splice(nextIndex, 0, section);
  state.draft.selected_sections = updated;
  renderReview();
  renderDraft(state.draft).catch(handleUiError);
}

function removeSection(sectionId) {
  state.draft.selected_sections = state.draft.selected_sections.filter((section) => section.id !== sectionId);
  syncSelectedItemIds(state.draft);
  ensureActiveReviewTab();
  renderReview();
  renderDraft(state.draft).catch(handleUiError);
}

function addSpacerSection() {
  if (!state.draft) return;
  const spacer = createSpacerSection();
  state.draft.selected_sections.unshift(spacer);
  state.reviewTabId = spacer.id;
  renderReview();
  renderDraft(state.draft).catch(handleUiError);
}

function renderReview() {
  const panel = $("reviewPanel");
  const tabs = $("reviewTabs");
  const container = $("reviewSections");
  tabs.innerHTML = "";
  container.innerHTML = "";
  panel.style.display = "block";
  ensureActiveReviewTab();

  state.draft.selected_sections.forEach((section, sectionIndex) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `tabButton ${section.id === state.reviewTabId ? "active" : ""} ${section.included ? "" : "inactiveSection"}`.trim();
    tab.textContent = reviewTabLabel(section, sectionIndex);
    tab.addEventListener("click", () => {
      state.reviewTabId = section.id;
      renderReview();
    });
    tabs.appendChild(tab);
  });

  state.draft.selected_sections.forEach((section, sectionIndex) => {
    if (section.id !== state.reviewTabId) return;

    const sectionCard = document.createElement("div");
    sectionCard.className = "sectionCard";

    const headerRow = document.createElement("div");
    headerRow.className = "sectionHeaderRow";

    const headerLeft = document.createElement("div");
    const toggleLabel = document.createElement("label");
    toggleLabel.className = "toggleLabel";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = section.included;
    checkbox.addEventListener("change", () => {
      section.included = checkbox.checked;
      syncSelectedItemIds(state.draft);
      renderReview();
      $("previewMeta").textContent = `${state.draft.selected_item_ids.length} items selected for ${state.draft.generated_from.role} at ${state.draft.generated_from.company}.`;
      renderDraft(state.draft).catch(handleUiError);
    });
    const title = document.createElement("span");
    title.className = "sectionTitle";
    title.textContent = section.title;
    toggleLabel.appendChild(checkbox);
    toggleLabel.appendChild(title);
    headerLeft.appendChild(toggleLabel);

    const meta = document.createElement("div");
    meta.className = "sectionMeta";
    meta.textContent = `${section.items.filter((item) => item.included).length}/${section.items.length} shown`;
    headerLeft.appendChild(meta);
    headerRow.appendChild(headerLeft);

    const headerActions = document.createElement("div");
    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "ghost";
    upBtn.textContent = "Move up";
    upBtn.disabled = sectionIndex === 0;
    upBtn.addEventListener("click", () => moveSection(sectionIndex, -1));
    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "ghost";
    downBtn.textContent = "Move down";
    downBtn.disabled = sectionIndex === state.draft.selected_sections.length - 1;
    downBtn.addEventListener("click", () => moveSection(sectionIndex, 1));
    headerActions.appendChild(upBtn);
    headerActions.appendChild(downBtn);
    if (section.type === "spacer") {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "ghost";
      deleteBtn.textContent = "Remove";
      deleteBtn.addEventListener("click", () => removeSection(section.id));
      headerActions.appendChild(deleteBtn);
    }
    headerRow.appendChild(headerActions);

    sectionCard.appendChild(headerRow);

    const itemList = document.createElement("div");
    itemList.className = "itemList";

    if (section.type === "spacer") {
      const spacerItem = section.items[0];
      const spacerCard = document.createElement("div");
      spacerCard.className = "itemCard";

      const sizeLabel = document.createElement("label");
      sizeLabel.className = "fieldLabel";
      sizeLabel.textContent = "Height (mm)";
      const sizeInput = document.createElement("input");
      sizeInput.type = "text";
      sizeInput.value = String(spacerItem.height_mm);
      sizeInput.addEventListener("change", () => {
        const parsed = Number(sizeInput.value);
        spacerItem.height_mm = Number.isFinite(parsed) ? Math.max(2, Math.min(parsed, 120)) : spacerItem.height_mm;
        sizeInput.value = String(spacerItem.height_mm);
        renderDraft(state.draft).catch(handleUiError);
      });
      spacerCard.appendChild(sizeLabel);
      spacerCard.appendChild(sizeInput);
      itemList.appendChild(spacerCard);
      sectionCard.appendChild(itemList);
      container.appendChild(sectionCard);
      return;
    }

    section.items.forEach((item) => {
      const itemCard = document.createElement("div");
      itemCard.className = "itemCard";

      const itemRow = document.createElement("div");
      itemRow.className = "itemRow";

      const itemLeft = document.createElement("div");
      const itemToggle = document.createElement("label");
      itemToggle.className = "toggleLabel";
      const itemCheckbox = document.createElement("input");
      itemCheckbox.type = "checkbox";
      itemCheckbox.checked = item.included;
      itemCheckbox.addEventListener("change", () => {
        item.included = itemCheckbox.checked;
        if (item.included) {
          section.included = true;
        } else if (!section.items.some((sectionItem) => sectionItem.included)) {
          section.included = false;
        }
        syncSelectedItemIds(state.draft);
        renderReview();
        renderDraft(state.draft).catch(handleUiError);
      });
      const itemTitle = document.createElement("span");
      itemTitle.textContent = item.title;
      itemToggle.appendChild(itemCheckbox);
      itemToggle.appendChild(itemTitle);
      itemLeft.appendChild(itemToggle);

      if (item.subtitle) {
        const subtitle = document.createElement("div");
        subtitle.className = "itemMeta";
        subtitle.textContent = item.subtitle;
        itemLeft.appendChild(subtitle);
      }
      itemRow.appendChild(itemLeft);

      const itemMeta = document.createElement("div");
      itemMeta.className = "itemMeta";
      itemMeta.textContent = `Score ${item.score}${item.dateLabel ? ` • ${item.dateLabel}` : ""}`;
      itemRow.appendChild(itemMeta);
      itemCard.appendChild(itemRow);

      const matches = document.createElement("div");
      matches.className = "itemMeta";
      matches.style.marginTop = "6px";
      matches.textContent = itemMatchSummary(item);
      itemCard.appendChild(matches);

      if (item.bullets.length) {
        const chipRow = document.createElement("div");
        chipRow.className = "chipRow";
        item.bullets.slice(0, 2).forEach((bullet) => {
          const chip = document.createElement("span");
          chip.className = "chip";
          chip.textContent = bullet;
          chipRow.appendChild(chip);
        });
        itemCard.appendChild(chipRow);
      }

      itemList.appendChild(itemCard);
    });

    sectionCard.appendChild(itemList);
    container.appendChild(sectionCard);
  });
}

function syncEditableHeader() {
  if (!state.draft) return;
  state.draft.header.headline = $("headlineInput").value.trim();
  state.draft.summary = $("summaryInput").value.trim();
  syncHeadlineSelect(state.draft.header.headline, state.draft.header.headline_options);
  renderDraft(state.draft).catch(handleUiError);
}

async function buildFromInputs() {
  setError();
  const profile = safeParseJson($("profileJson").value, "Profile JSON");
  const job = safeParseJson($("jobJson").value, "Job JSON");
  const errors = [...validateProfile(profile), ...validateJob(job)];
  if (errors.length) throw new Error(errors.join("\n"));

  state.profile = profile;
  state.job = job;
  state.nextSpacerId = 1;
  state.draft = buildDraft(profile, job);
  state.reviewTabId = state.draft.selected_sections[0]?.id || null;
  updateReviewEditors(state.draft);
  renderReview();
  await renderDraft(state.draft);
  $("printBtn").disabled = false;
  setStatus(`Draft built with ${state.draft.selected_item_ids.length} selected items.`);
}

async function loadSamples() {
  setError();
  const [profileResponse, jobResponse] = await Promise.all([fetch(SAMPLE_PROFILE_URL), fetch(SAMPLE_JOB_URL)]);
  if (!profileResponse.ok || !jobResponse.ok) {
    throw new Error("Unable to load bundled sample JSON.");
  }
  const [profileText, jobText] = await Promise.all([profileResponse.text(), jobResponse.text()]);
  $("profileJson").value = profileText;
  $("jobJson").value = jobText;
  setStatus("Sample profile and job JSON loaded.");
  await buildFromInputs();
}

async function handleJsonFile(input, targetTextarea) {
  const file = input.files?.[0];
  if (!file) return;
  targetTextarea.value = await file.text();
  setStatus(`Loaded ${file.name}.`);
}

function bindEvents() {
  $("sampleBtn").addEventListener("click", async () => {
    try {
      await loadSamples();
    } catch (error) {
      setError(error.message || String(error));
    }
  });

  $("buildBtn").addEventListener("click", async () => {
    try {
      await buildFromInputs();
    } catch (error) {
      setError(error.message || String(error));
      setStatus("Fix validation errors and rebuild the draft.");
    }
  });

  $("printBtn").addEventListener("click", async () => {
    if (!state.draft) return;
    await renderDraft(state.draft);
    window.print();
  });

  $("profileFile").addEventListener("change", async (event) => {
    try {
      await handleJsonFile(event.target, $("profileJson"));
    } catch (error) {
      setError(`Could not read profile file: ${error.message || error}`);
    }
  });

  $("jobFile").addEventListener("change", async (event) => {
    try {
      await handleJsonFile(event.target, $("jobJson"));
    } catch (error) {
      setError(`Could not read job file: ${error.message || error}`);
    }
  });

  $("headlineInput").addEventListener("input", syncEditableHeader);
  $("summaryInput").addEventListener("input", syncEditableHeader);
  $("addSpacerBtn").addEventListener("click", addSpacerSection);
  $("headlineSelect").addEventListener("change", () => {
    if (!state.draft) return;
    const value = $("headlineSelect").value;
    state.draft.header.headline = value;
    $("headlineInput").value = value;
    renderDraft(state.draft).catch(handleUiError);
  });
  $("templateSelect").addEventListener("change", () => {
    state.templateId = $("templateSelect").value;
    if (state.draft) {
      renderDraft(state.draft).catch(handleUiError);
    }
  });
}

bindEvents();

window.CVBuilder = {
  buildDraft,
  validateProfile,
  validateJob,
};
