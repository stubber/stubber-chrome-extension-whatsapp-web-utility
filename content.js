const TOGGLE_ID = "stubber-whatsapp-sidebar-toggle";
const TOGGLE_HOST_ID = "stubber-whatsapp-sidebar-toggle-host";
const HIDDEN_ATTR = "data-stubber-sidebar-hidden";
const PREV_STYLE_ATTR = "data-stubber-prev-style";
const KNOWN_SIDEBAR_SELECTOR =
  ".x9f619.x1n2onr6.x5yr21d.x17dzmu4.x1i1dayz.x2ipvbc.xjdofhw.x78zum5.xdt5ytf.x12xzxwr.x1plvlek.xryxfnj.x570efc.x18dvir5.xxljpkc.x18pi947.xck4lzl.x1gluznb.xahwd2o.x10fiusa.x1a0bplq.xc995h1";

const state = {
  sidebarHidden: false,
  syncScheduled: false,
};

function normalizeLabel(value) {
  return (value || "").trim().toLowerCase();
}

function findChatListHeader() {
  const header = document.querySelector("header[data-testid='chatlist-header']");
  return header instanceof HTMLElement ? header : null;
}

function findChatsButton() {
  const header = findChatListHeader();
  const scopedButton = header?.querySelector("button[aria-label='Chats']");
  if (scopedButton instanceof HTMLButtonElement) {
    return scopedButton;
  }

  const exactMatch = document.querySelector("button[aria-label='Chats']");
  if (exactMatch instanceof HTMLButtonElement) {
    return exactMatch;
  }

  return Array.from(document.querySelectorAll("button[aria-label]")).find((element) => {
    const label = normalizeLabel(element.getAttribute("aria-label"));
    return label === "chats" || label === "chat list";
  });
}

function findSecondaryHeaderButton() {
  const header = findChatListHeader();
  const preferredLabels = ["media", "you"];

  for (const label of preferredLabels) {
    const button = Array.from(header?.querySelectorAll("button[aria-label]") || []).find(
      (element) => normalizeLabel(element.getAttribute("aria-label")) === label,
    );

    if (button instanceof HTMLButtonElement) {
      return button;
    }
  }

  return null;
}

function findChatsAnchor() {
  const chatsButton = findChatsButton();
  if (chatsButton) {
    return chatsButton;
  }

  return Array.from(document.querySelectorAll("[aria-label]")).find((element) => {
    const label = normalizeLabel(element.getAttribute("aria-label"));
    return label === "chats" || label === "chat list";
  });
}

function isLikelySidebar(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === "none") {
    return false;
  }

  if (style.position === "fixed" && style.inset === "0px") {
    return false;
  }

  const rect = element.getBoundingClientRect();
  const minWidth = Math.min(240, window.innerWidth * 0.25);
  const maxWidth = window.innerWidth * 0.6;

  return (
    rect.width >= minWidth &&
    rect.width <= maxWidth &&
    rect.height >= window.innerHeight * 0.5 &&
    rect.left <= window.innerWidth * 0.08
  );
}

function findTopmostLikelySidebar(startElement) {
  let current = startElement;
  let candidate = null;

  while (current && current !== document.body) {
    if (isLikelySidebar(current)) {
      candidate = current;
    }
    current = current.parentElement;
  }

  return candidate;
}

function findSidebarFromAnchor() {
  return findTopmostLikelySidebar(findChatsAnchor());
}

function findSidebarFromKnownSelector() {
  return findTopmostLikelySidebar(document.querySelector(KNOWN_SIDEBAR_SELECTOR));
}

function findSidebarFallback() {
  const candidates = Array.from(document.querySelectorAll("div, aside, section")).filter(
    isLikelySidebar,
  );

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => {
    const leftRect = left.getBoundingClientRect();
    const rightRect = right.getBoundingClientRect();
    const leftScore = leftRect.left + Math.abs(leftRect.width - 420);
    const rightScore = rightRect.left + Math.abs(rightRect.width - 420);
    return leftScore - rightScore;
  });

  return candidates[0];
}

function findSidebar() {
  return findSidebarFromAnchor() || findSidebarFromKnownSelector() || findSidebarFallback();
}

function shouldHideSibling(element, sidebarRect) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === "none") {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width > 24 || rect.height < sidebarRect.height * 0.8) {
    return false;
  }

  const touchesSidebar =
    Math.abs(rect.left - sidebarRect.right) <= 12 ||
    Math.abs(rect.right - sidebarRect.left) <= 12;

  return touchesSidebar;
}

function collectSidebarTargets() {
  const sidebar = findSidebar();
  if (!sidebar) {
    return [];
  }

  const sidebarRect = sidebar.getBoundingClientRect();
  const targets = [sidebar];

  if (shouldHideSibling(sidebar.previousElementSibling, sidebarRect)) {
    targets.push(sidebar.previousElementSibling);
  }

  if (shouldHideSibling(sidebar.nextElementSibling, sidebarRect)) {
    targets.push(sidebar.nextElementSibling);
  }

  return targets;
}

function hideElement(element) {
  if (!(element instanceof HTMLElement)) {
    return;
  }

  if (!element.hasAttribute(PREV_STYLE_ATTR)) {
    element.setAttribute(PREV_STYLE_ATTR, element.style.cssText);
  }

  element.style.setProperty("display", "none", "important");
  element.style.setProperty("width", "0", "important");
  element.style.setProperty("min-width", "0", "important");
  element.style.setProperty("max-width", "0", "important");
  element.style.setProperty("flex-basis", "0", "important");
  element.style.setProperty("border", "0", "important");
  element.style.setProperty("overflow", "hidden", "important");
  element.setAttribute(HIDDEN_ATTR, "true");
}

function restoreHiddenElements() {
  document.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach((element) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    element.style.cssText = element.getAttribute(PREV_STYLE_ATTR) || "";
    element.removeAttribute(HIDDEN_ATTR);
    element.removeAttribute(PREV_STYLE_ATTR);
  });
}

function applySidebarState() {
  if (!state.sidebarHidden) {
    restoreHiddenElements();
    return;
  }

  collectSidebarTargets().forEach(hideElement);
}

function createToggleButton() {
  const button = document.createElement("button");
  button.id = TOGGLE_ID;
  button.type = "button";
  button.style.display = "inline-flex";
  button.style.alignItems = "center";
  button.style.justifyContent = "center";
  button.style.width = "32px";
  button.style.height = "32px";
  button.style.padding = "0";
  button.style.margin = "0 8px 0 0";
  button.style.border = "none";
  button.style.borderRadius = "999px";
  button.style.background = "transparent";
  button.style.color = "inherit";
  button.style.cursor = "pointer";
  button.style.opacity = "0.8";
  button.style.flex = "0 0 auto";

  button.addEventListener("mouseenter", () => {
    button.style.background = "rgba(255, 255, 255, 0.08)";
    button.style.opacity = "1";
  });

  button.addEventListener("mouseleave", () => {
    button.style.background = "transparent";
    button.style.opacity = state.sidebarHidden ? "1" : "0.8";
  });

  button.addEventListener("click", () => {
    state.sidebarHidden = !state.sidebarHidden;
    updateButtonLabel(button);
    applySidebarState();
  });

  updateButtonLabel(button);
  return button;
}

function createToggleHost() {
  const host = document.createElement("div");
  host.id = TOGGLE_HOST_ID;
  host.style.position = "absolute";
  host.style.top = "50%";
  host.style.transform = "translateY(-50%)";
  host.style.zIndex = "2";
  host.style.display = "flex";
  host.style.alignItems = "center";
  host.style.justifyContent = "center";
  host.style.width = "32px";
  host.style.height = "32px";
  host.style.pointerEvents = "none";
  return host;
}

function updateButtonLabel(button) {
  const label = state.sidebarHidden ? "Show chats" : "Hide chats";
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
  button.style.opacity = state.sidebarHidden ? "1" : "0.8";
  button.innerHTML = `
    <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" fill="currentColor" aria-hidden="true">
      <path d="M38.8 5.1C28.4-3.1 13.3-1.2 5.1 9.2S-1.2 34.7 9.2 42.9l592 464c10.4 8.2 25.5 6.3 33.7-4.1s6.3-25.5-4.1-33.7L525.6 386.7c39.6-40.6 66.4-86.1 79.9-118.4c3.3-7.9 3.3-16.7 0-24.6c-14.9-35.7-46.2-87.7-93-131.1C465.5 68.8 400.8 32 320 32c-68.2 0-125 26.3-169.3 60.8L38.8 5.1zm151 118.3C226 97.7 269.5 80 320 80c65.2 0 118.8 29.6 159.9 67.7C518.4 183.5 545 226 558.6 256c-12.6 28-36.6 66.8-70.9 100.9l-53.8-42.2c9.1-17.6 14.2-37.5 14.2-58.7c0-70.7-57.3-128-128-128c-32.2 0-61.7 11.9-84.2 31.5l-46.1-36.1zM394.9 284.2l-81.5-63.9c4.2-8.5 6.6-18.2 6.6-28.3c0-5.5-.7-10.9-2-16c.7 0 1.3 0 2 0c44.2 0 80 35.8 80 80c0 9.9-1.8 19.4-5.1 28.2zm51.3 163.3l-41.9-33C378.8 425.4 350.7 432 320 432c-65.2 0-118.8-29.6-159.9-67.7C121.6 328.5 95 286 81.4 256c8.3-18.4 21.5-41.5 39.4-64.8L83.1 161.5C60.3 191.2 44 220.8 34.5 243.7c-3.3 7.9-3.3 16.7 0 24.6c14.9 35.7 46.2 87.7 93 131.1C174.5 443.2 239.2 480 320 480c47.8 0 89.9-12.9 126.2-32.5zm-88-69.3L302 334c-23.5-5.4-43.1-21.2-53.7-42.3l-56.1-44.2c-.2 2.8-.3 5.6-.3 8.5c0 70.7 57.3 128 128 128c13.3 0 26.1-2 38.2-5.8z"/>
    </svg>
  `;
}

function syncToggleButtonPresentation(button, referenceButton) {
  if (referenceButton instanceof HTMLButtonElement && referenceButton.className) {
    button.className = referenceButton.className;
  }

  button.removeAttribute("data-navbar-item");
  button.removeAttribute("data-navbar-item-index");
  button.removeAttribute("data-navbar-item-selected");
  button.style.display = "inline-flex";
  button.style.alignItems = "center";
  button.style.justifyContent = "center";
  button.style.width = "32px";
  button.style.height = "32px";
  button.style.padding = "0";
  button.style.margin = "0 8px 0 0";
  button.style.border = "none";
  button.style.borderRadius = "999px";
  button.style.background = "transparent";
  button.style.color = "inherit";
  button.style.cursor = "pointer";
  button.style.flex = "0 0 auto";
  button.style.pointerEvents = "auto";
}

function ensureToggleButton() {
  const header = findChatListHeader();
  const referenceButton = findSecondaryHeaderButton() || findChatsButton();
  if (!(header instanceof HTMLElement) || !(referenceButton instanceof HTMLButtonElement)) {
    return;
  }

  if (window.getComputedStyle(header).position === "static") {
    header.style.position = "relative";
  }

  let host = document.getElementById(TOGGLE_HOST_ID);
  if (!(host instanceof HTMLDivElement)) {
    host = createToggleHost();
  }

  let button = document.getElementById(TOGGLE_ID);
  if (!(button instanceof HTMLButtonElement)) {
    button = createToggleButton();
  }

  syncToggleButtonPresentation(button, referenceButton);
  updateButtonLabel(button);

  if (button.parentElement !== host) {
    host.replaceChildren(button);
  }

  if (host.parentElement !== header) {
    header.appendChild(host);
  }

  const headerRect = header.getBoundingClientRect();
  const referenceRect = referenceButton.getBoundingClientRect();
  const preferredLeft = referenceRect.left - headerRect.left - 40;
  const minLeft = 8;
  const maxLeft = Math.max(minLeft, headerRect.width - 40);
  const clampedLeft = Math.min(Math.max(preferredLeft, minLeft), maxLeft);
  host.style.left = `${clampedLeft}px`;
}

function sync() {
  state.syncScheduled = false;
  if (!document.body) {
    return;
  }

  ensureToggleButton();
  applySidebarState();
}

function scheduleSync() {
  if (state.syncScheduled) {
    return;
  }

  state.syncScheduled = true;
  window.requestAnimationFrame(sync);
}

function init() {
  scheduleSync();

  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  window.addEventListener("resize", scheduleSync);
}

init();
