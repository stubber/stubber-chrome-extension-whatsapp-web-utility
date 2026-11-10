const TOGGLE_ID = "stubber-whatsapp-sidebar-toggle";
const HIDDEN_ATTR = "data-stubber-sidebar-hidden";
const PREV_STYLE_ATTR = "data-stubber-prev-style";

// Stable hooks in WhatsApp Web's DOM (verified Nov 2026). Obfuscated class names
// change on every deploy, so we only rely on ids, data-testid and data-* attributes.
const CHAT_LIST_SELECTOR = "#side, #pane-side";
const LEFT_DRAWER_SELECTOR = "[data-testid='drawer-left']";
const NAV_ITEM_SELECTOR = "[data-navbar-item]";
const NAV_PRIMARY_SECTION_SELECTOR = "[data-testid='navbar-primary-section']";

const state = {
  sidebarHidden: false,
  syncScheduled: false,
  toggleItem: null,
};

// The vertical nav rail on the far left (Chats, Calls, Status, ...). It is a
// header[data-testid='chatlist-header'], but so is the "WhatsApp" title bar inside
// the chat list, so identify it by the navbar items it contains.
function findNavRail() {
  const navItem = document.querySelector(NAV_ITEM_SELECTOR);
  const rail = navItem?.closest("header");
  return rail instanceof HTMLElement ? rail : null;
}

// Each nav icon is wrapped as item > span > div > button[data-navbar-item]. Returns
// the elements from the item wrapper (a direct child of the nav list) down to the
// button.
function getNavItemChain(button, buttons) {
  const other = button === buttons[0] ? buttons[1] : buttons[0];
  const chain = [button];
  let item = button;
  while (item.parentElement && !item.parentElement.contains(other)) {
    item = item.parentElement;
    chain.unshift(item);
  }
  return chain;
}

// Finds where to put the toggle and which native icons to copy styling from.
// - anchorItem: the last icon in the top group (currently Meta AI); the toggle goes
//   directly beneath it.
// - styleChain: an unselected single-colour icon (Calls, Status, ...). Meta AI is
//   multi-coloured and its button has no icon colour, so it is skipped.
// - activeButtonClass: the selected icon's button classes, used while chats are
//   hidden so the toggle reads as "on".
function findNavReferences() {
  const section = document.querySelector(NAV_PRIMARY_SECTION_SELECTOR);
  const buttons = Array.from(section?.querySelectorAll(NAV_ITEM_SELECTOR) || []);
  if (buttons.length < 2) {
    return null;
  }

  const isSelected = (button) => button.getAttribute("data-navbar-item-selected") === "true";
  const lastButton = buttons[buttons.length - 1];
  const styleButton =
    buttons.find((button) => button !== lastButton && !isSelected(button)) || lastButton;
  const activeButton = buttons.find(isSelected);

  return {
    anchorItem: getNavItemChain(lastButton, buttons)[0],
    styleChain: getNavItemChain(styleButton, buttons),
    activeButtonClass: activeButton?.className || styleButton.className,
  };
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

// Layout: the nav rail, the sidebar column (title header + #side) and the
// conversation pane (#main) are all direct children of one flex root. The sidebar
// column is the root's child that contains #side.
function findSidebarFromStructure() {
  const chatList = document.querySelector(CHAT_LIST_SELECTOR);
  if (!(chatList instanceof HTMLElement)) {
    return null;
  }

  const layoutRoot = findNavRail()?.parentElement;
  if (layoutRoot instanceof HTMLElement && layoutRoot.contains(chatList)) {
    let column = chatList;
    while (column.parentElement && column.parentElement !== layoutRoot) {
      column = column.parentElement;
    }
    return column;
  }

  // Nav rail not found: climb from the chat list to the widest sidebar-shaped
  // ancestor (stops before reaching the full-width layout root).
  return findTopmostLikelySidebar(chatList);
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
  return findSidebarFromStructure() || findSidebarFallback();
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

  // Status, Channels, Settings, etc. render in a separate overlay drawer that sits
  // on top of the sidebar column, so hide it too.
  const leftDrawer = document.querySelector(LEFT_DRAWER_SELECTOR);
  if (leftDrawer instanceof HTMLElement && leftDrawer !== sidebar) {
    targets.push(leftDrawer);
  }

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

// Builds a nav item that mirrors WhatsApp's own wrapper structure and classes
// (item > span > div > button) so it lines up and styles like the native icons.
function createToggleItem({ styleChain, activeButtonClass }) {
  const elements = styleChain.map((reference) => {
    const element = document.createElement(reference.tagName.toLowerCase());
    element.className = reference.className;
    return element;
  });

  for (let index = 1; index < elements.length; index += 1) {
    elements[index - 1].appendChild(elements[index]);
  }

  const button = elements[elements.length - 1];
  button.dataset.stubberIdleClass = button.className;
  button.dataset.stubberActiveClass = activeButtonClass;
  button.id = TOGGLE_ID;
  button.type = "button";
  button.style.display = "flex";
  button.style.alignItems = "center";
  button.style.justifyContent = "center";
  button.style.cursor = "pointer";
  button.innerHTML = TOGGLE_ICON_SVG;

  button.addEventListener("click", () => {
    state.sidebarHidden = !state.sidebarHidden;
    updateButtonLabel(button);
    applySidebarState();
  });

  updateButtonLabel(button);
  return elements[0];
}

// Only touches attributes: rewriting the button's content here would trigger the
// MutationObserver, re-run sync every frame and swallow real mouse clicks.
function updateButtonLabel(button) {
  const label = state.sidebarHidden ? "Show chats" : "Hide chats";
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
  button.setAttribute("aria-pressed", String(state.sidebarHidden));
  const className = state.sidebarHidden
    ? button.dataset.stubberActiveClass
    : button.dataset.stubberIdleClass;
  if (className) {
    button.className = className;
  }
}

const TOGGLE_ICON_SVG = `
    <svg width="22" height="22" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" fill="currentColor" aria-hidden="true">
      <path d="M38.8 5.1C28.4-3.1 13.3-1.2 5.1 9.2S-1.2 34.7 9.2 42.9l592 464c10.4 8.2 25.5 6.3 33.7-4.1s6.3-25.5-4.1-33.7L525.6 386.7c39.6-40.6 66.4-86.1 79.9-118.4c3.3-7.9 3.3-16.7 0-24.6c-14.9-35.7-46.2-87.7-93-131.1C465.5 68.8 400.8 32 320 32c-68.2 0-125 26.3-169.3 60.8L38.8 5.1zm151 118.3C226 97.7 269.5 80 320 80c65.2 0 118.8 29.6 159.9 67.7C518.4 183.5 545 226 558.6 256c-12.6 28-36.6 66.8-70.9 100.9l-53.8-42.2c9.1-17.6 14.2-37.5 14.2-58.7c0-70.7-57.3-128-128-128c-32.2 0-61.7 11.9-84.2 31.5l-46.1-36.1zM394.9 284.2l-81.5-63.9c4.2-8.5 6.6-18.2 6.6-28.3c0-5.5-.7-10.9-2-16c.7 0 1.3 0 2 0c44.2 0 80 35.8 80 80c0 9.9-1.8 19.4-5.1 28.2zm51.3 163.3l-41.9-33C378.8 425.4 350.7 432 320 432c-65.2 0-118.8-29.6-159.9-67.7C121.6 328.5 95 286 81.4 256c8.3-18.4 21.5-41.5 39.4-64.8L83.1 161.5C60.3 191.2 44 220.8 34.5 243.7c-3.3 7.9-3.3 16.7 0 24.6c14.9 35.7 46.2 87.7 93 131.1C174.5 443.2 239.2 480 320 480c47.8 0 89.9-12.9 126.2-32.5zm-88-69.3L302 334c-23.5-5.4-43.1-21.2-53.7-42.3l-56.1-44.2c-.2 2.8-.3 5.6-.3 8.5c0 70.7 57.3 128 128 128c13.3 0 26.1-2 38.2-5.8z"/>
    </svg>
  `;

// Places the toggle directly beneath the last icon in the nav rail's top group
// (Meta AI). Does nothing when it is already in place, so syncs stay cheap.
function ensureToggleButton() {
  const references = findNavReferences();
  if (!references) {
    return;
  }

  if (!state.toggleItem) {
    state.toggleItem = createToggleItem(references);
  }

  if (references.anchorItem.nextElementSibling !== state.toggleItem) {
    references.anchorItem.after(state.toggleItem);
  }
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
