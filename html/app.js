const isNui = typeof GetParentResourceName === 'function';

function getNuiResourceName() {
  if (typeof GetParentResourceName === 'function') return GetParentResourceName();
  return window.location.hostname.replace(/^cfx-nui-/, '');
}

const serviceThemes = {
  LSPD: {
    primary: '#617F95',
    soft: '#91A8B8',
    secondary: '#466579',
  },
  EMS: {
    primary: '#A45C61',
    soft: '#CF8F93',
    secondary: '#704247',
  },
  MECHANIC: {
    primary: '#A77B43',
    soft: '#D0AA72',
    secondary: '#6D512F',
  },
  DEFAULT: {
    primary: '#668AA3',
    soft: '#91ACBF',
    secondary: '#45677F',
  },
};

function hexToRgb(hex) {
  const value = String(hex || '').replace('#', '');
  if (!/^[\da-f]{6}$/i.test(value)) return null;
  return `${parseInt(value.slice(0, 2), 16)}, ${parseInt(value.slice(2, 4), 16)}, ${parseInt(value.slice(4, 6), 16)}`;
}

let alerts = [];
let alertPosition = 0;
let alertTotal = 0;

const card = document.getElementById('dispatch-card');
const alertCount = document.getElementById('alert-count');
const alertTime = document.getElementById('alert-time');
const priorityBadge = document.getElementById('priority-badge');
const callCode = document.getElementById('call-code');
const callTitle = document.getElementById('call-title');
const callTypeUse = document.getElementById('call-type-use');
const callDescription = document.getElementById('call-description');
const alertDetails = document.getElementById('alert-details');
const respondLabel = document.getElementById('respond-label');
const infoToggle = document.getElementById('info-toggle');
const detailsGrid = document.getElementById('details-grid');
const departmentName = document.getElementById('department-name');
const channelName = document.getElementById('channel-name');
const dispatchHeader = document.querySelector('.dispatch-header');
const editToolbar = document.getElementById('edit-toolbar');
const positionToggle = document.getElementById('position-toggle');
const resetPositionButton = document.getElementById('reset-position');
const unitResponse = document.getElementById('unit-response');
const unitCount = document.getElementById('unit-count');
const previousButton = document.getElementById('previous');
const nextButton = document.getElementById('next');
const respondButton = document.getElementById('respond');
const respondKey = document.getElementById('respond-key');
const clearAlertsButton = document.getElementById('clear-alerts');
const fullDispatchFrame = document.getElementById('full-dispatch-frame');

let selectedIndex = Math.max(0, alerts.length - 1);
let switchTimer;
let timestampTimer;
let arrivalEffectTarget;
let arrivalEffectHandler;
let detailsExpanded = false;
let positionEditing = false;
let positionDirty = false;
let dragState = null;

const positionStorageKey = 'dispatch-alerts-panel-position';
const priorityLabels = { 1: 'HIGH', 2: 'MED', 3: 'LOW' };

const detailFields = [
  { key: 'name', label: 'Name', icon: 'icon-user' },
  { key: 'phone', label: 'Phone', icon: 'icon-phone' },
  { key: 'incident', label: 'Incident', icon: 'icon-alert', wide: true },
  { key: 'street', label: 'Location', icon: 'icon-pin', wide: true },
  { key: 'gender', label: 'Gender', icon: 'icon-user' },
  { key: 'weapon', label: 'Weapon', icon: 'icon-crosshair' },
  { key: 'vehicle', label: 'Vehicle', icon: 'icon-car' },
  { key: 'plate', label: 'Plate', icon: 'icon-plate' },
  { key: 'color', label: 'Color', icon: 'icon-palette' },
  { key: 'class', label: 'Class', icon: 'icon-tag' },
  { key: 'doors', label: 'Doors', icon: 'icon-door' },
  { key: 'direction', label: 'Direction', icon: 'icon-compass' },
];

const incidentIcons = [
  { matches: ['house robbery', 'home robbery', 'burglary'], icon: 'icon-home' },
  { matches: ['store robbery', 'shop robbery', 'popcat robbery'], icon: 'icon-store' },
  { matches: ['bank robbery'], icon: 'icon-bank' },
  { matches: ['casino robbery', 'casino'], icon: 'icon-dice' },
  { matches: ['stolen vehicle', 'vehicle pursuit', 'carjacking', 'vehicle assistance'], icon: 'icon-car' },
  { matches: ['shots fired', 'shooting', 'armed person'], icon: 'icon-crosshair' },
  { matches: ['illegal activity', 'suspicious activity'], icon: 'icon-alert' },
  { matches: ['fight in progress', 'fight'], icon: 'icon-fight' },
  { matches: ['suspicious person'], icon: 'icon-user' },
  { matches: ['medical emergency', 'unconscious', 'injured'], icon: 'icon-medical' },
  { matches: ['panic button', 'officer panic', 'panic'], icon: 'icon-siren' },
  { matches: ['mechanic', 'roadside assistance'], icon: 'icon-wrench' },
];

function getIncidentIcon(alert) {
  if (alert.panic === true) return 'icon-siren';
  if ((alert.department || '').toUpperCase() === 'EMS') return 'icon-medical';
  if ((alert.department || '').toUpperCase() === 'MECHANIC') return 'icon-wrench';

  const searchable = `${alert.code || ''} ${alert.title || ''} ${alert.description || ''}`.toLowerCase();
  return incidentIcons.find(({ matches }) => matches.some(match => searchable.includes(match)))?.icon || 'icon-radio';
}

function elapsedLabel(receivedAt) {
  let timestamp = Number(receivedAt) || Date.now();
  if (timestamp < 1_000_000_000_000) timestamp *= 1_000;
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  if (elapsedSeconds < 10) return 'a few seconds ago';
  if (elapsedSeconds < 60) return `${elapsedSeconds} seconds ago`;

  const minutes = Math.floor(elapsedSeconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
}

function clearArrivalEffect() {
  if (arrivalEffectTarget && arrivalEffectHandler) {
    arrivalEffectTarget.removeEventListener('animationend', arrivalEffectHandler);
  }

  arrivalEffectTarget = undefined;
  arrivalEffectHandler = undefined;
  card.classList.remove('is-normal-arrival', 'is-panic-arrival');
}

function playArrivalEffect(alert) {
  clearArrivalEffect();

  const isPanic = alert?.panic === true;
  const effectClass = isPanic ? 'is-panic-arrival' : 'is-normal-arrival';
  const animationName = isPanic ? 'panic-alert-pulse' : 'normal-alert-sweep';
  const content = card.querySelector('.alert-content');
  if (!content) return;

  void card.offsetWidth;
  card.classList.add(effectClass);

  arrivalEffectTarget = content;
  arrivalEffectHandler = (event) => {
    if (event.animationName !== animationName) return;
    clearArrivalEffect();
  };
  content.addEventListener('animationend', arrivalEffectHandler);
}

function render(animate = false) {
  const alert = alerts[selectedIndex];
  if (!alert) {
    card.classList.add('is-hidden');
    card.hidden = true;
    return;
  }

  card.hidden = false;
  card.classList.remove('is-hidden');
  card.classList.remove('is-empty');
  previousButton.disabled = alertPosition <= 1;
  nextButton.disabled = alertPosition >= alertTotal;
  respondButton.disabled = false;
  clearAlertsButton.disabled = false;
  const department = alert.department || 'DISPATCH';
  const requestedPriority = Number(alert.priority);
  const priority = alert.panic === true || requestedPriority === 1
    ? 1
    : (requestedPriority === 2 ? 2 : 3);

  card.classList.remove('priority-1', 'priority-2', 'priority-3', 'is-responding', 'has-responders');
  card.classList.add(`priority-${priority}`);
  const isResponding = alert.responding === true;
  const responders = Array.isArray(alert.responders) ? alert.responders : [];
  card.classList.toggle('is-responding', isResponding);
  card.classList.toggle('has-responders', responders.length > 0);
  alertCount.textContent = `${alertPosition}/${alertTotal}`;
  alertTime.textContent = elapsedLabel(alert.receivedAt || alert.timestamp);
  scheduleTimestampRefresh();
  priorityBadge.textContent = alert.panic === true ? 'PANIC' : priorityLabels[priority];
  departmentName.textContent = department;
  channelName.textContent = alert.channel || 'ALERTS';
  callCode.textContent = alert.code;
  callTitle.textContent = alert.title;
  callTypeUse.setAttribute('href', `#${getIncidentIcon(alert)}`);
  callDescription.textContent = alert.description;
  respondLabel.textContent = isResponding ? 'Unit Responding' : 'Respond';
  applyServiceTheme(alert.theme || department, alert.colors);
  renderResponders(responders);
  const detailCount = renderDetails(alert.details);
  if (detailCount === 0) detailsExpanded = false;
  infoToggle.disabled = detailCount === 0;
  card.classList.toggle('is-expanded', detailsExpanded);
  infoToggle.setAttribute('aria-expanded', String(detailsExpanded));
  infoToggle.setAttribute('aria-label', detailsExpanded ? 'Hide alert details' : 'Show alert details');
  infoToggle.title = detailsExpanded ? 'Hide alert details' : 'Show alert details';

  if (animate) {
    clearTimeout(switchTimer);
    card.classList.remove('is-switching');
    void card.offsetWidth;
    card.classList.add('is-switching');
    switchTimer = setTimeout(() => card.classList.remove('is-switching'), 180);
  } else {
    clearTimeout(switchTimer);
    card.classList.remove('is-switching');
  }

  requestAnimationFrame(keepPanelInViewport);
}

function renderEmpty(department = 'DISPATCH', channel = 'ALERTS', theme = department, keyLabel, colors) {
  alerts = [];
  selectedIndex = 0;
  detailsExpanded = false;
  card.hidden = false;
  card.classList.remove('is-hidden', 'priority-1', 'priority-2', 'priority-3', 'is-responding', 'has-responders', 'is-expanded');
  card.classList.add('is-empty');
  previousButton.disabled = true;
  nextButton.disabled = true;
  respondButton.disabled = true;
  infoToggle.disabled = true;
  clearAlertsButton.disabled = true;
  alertCount.textContent = '';
  alertTime.textContent = '';
  stopTimestampRefresh();
  priorityBadge.textContent = '';
  departmentName.textContent = department;
  channelName.textContent = channel;
  callCode.textContent = '';
  callTitle.textContent = 'NO ACTIVE ALERTS';
  callDescription.textContent = 'There are currently no active alerts.';
  respondLabel.textContent = 'Respond';
  respondKey.textContent = keyLabel || respondKey.textContent || '—';
  detailsGrid.replaceChildren();
  renderResponders([]);
  applyServiceTheme(theme || department, colors);
}

function applyServiceTheme(department, configuredColors) {
  const knownTheme = serviceThemes[department];
  const fallback = knownTheme || serviceThemes.DEFAULT;
  const theme = knownTheme || {
    primary: configuredColors?.primary || fallback.primary,
    soft: configuredColors?.soft || fallback.soft,
    secondary: configuredColors?.secondary || fallback.secondary,
  };
  document.documentElement.style.setProperty('--brand-color', theme.primary);
  document.documentElement.style.setProperty('--brand-rgb', hexToRgb(theme.primary) || '0, 157, 255');
  document.documentElement.style.setProperty('--brand-soft', theme.soft);
  document.documentElement.style.setProperty('--brand-secondary', theme.secondary);
  document.documentElement.style.setProperty('--brand-secondary-rgb', hexToRgb(theme.secondary) || '0, 111, 232');
}

function renderResponders(responders) {
  unitCount.textContent = String(responders.length);
  unitResponse.setAttribute('aria-label', `${responders.length} responding unit${responders.length === 1 ? '' : 's'}`);
}

function renderDetails(details = {}) {
  const visibleFields = detailFields
    .filter(({ key }) => {
      const value = details[key];
      if (value === undefined || value === null || value === '') return false;
      if (typeof value !== 'string') return true;
      return !['unknown', 'n/a', 'not provided'].includes(value.trim().toLowerCase());
    });

  detailsGrid.replaceChildren(...visibleFields.map(({ key, label, icon, wide }) => {
      const row = document.createElement('div');
      row.className = `detail-row${wide ? ' is-wide' : ''}`;

      const marker = document.createElement('span');
      marker.className = 'detail-icon';
      marker.setAttribute('aria-hidden', 'true');
      const markerSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const markerUse = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      markerUse.setAttribute('href', `#${icon}`);
      markerSvg.append(markerUse);
      marker.append(markerSvg);

      const term = document.createElement('dt');
      term.textContent = label;

      const value = document.createElement('dd');
      value.textContent = details[key];

      row.append(marker, term, value);
      return row;
    }));

  return visibleFields.length;
}

function toggleDetails() {
  detailsExpanded = !detailsExpanded;
  render(false);
}

function stopTimestampRefresh() {
  clearTimeout(timestampTimer);
  timestampTimer = undefined;
}

function scheduleTimestampRefresh() {
  stopTimestampRefresh();
  if (!alerts[selectedIndex]) return;

  timestampTimer = setTimeout(() => {
    const alert = alerts[selectedIndex];
    if (!alert) return;
    alertTime.textContent = elapsedLabel(alert.receivedAt || alert.timestamp);
    scheduleTimestampRefresh();
  }, 5_000);
}

function clampPosition(left, top) {
  const margin = 8;
  const minimumLeft = margin + editToolbar.offsetWidth + 7;
  return {
    left: Math.min(Math.max(left, minimumLeft), Math.max(minimumLeft, window.innerWidth - card.offsetWidth - margin)),
    top: Math.min(Math.max(top, margin), Math.max(margin, window.innerHeight - card.offsetHeight - margin)),
  };
}

function applyPosition(left, top) {
  const position = clampPosition(left, top);
  card.style.left = `${position.left}px`;
  card.style.top = `${position.top}px`;
  card.style.right = 'auto';
  syncEditToolbarPosition();
  return position;
}

function syncEditToolbarPosition() {
  const rectangle = card.getBoundingClientRect();
  editToolbar.style.left = `${rectangle.left - editToolbar.offsetWidth - 7}px`;
  editToolbar.style.top = `${rectangle.top + 26}px`;
}

function keepPanelInViewport() {
  if (card.hidden) return;
  if (card.style.left && card.style.left !== 'auto') {
    applyPosition(card.offsetLeft, card.offsetTop);
  } else {
    syncEditToolbarPosition();
  }
}

function restoreSavedPosition() {
  try {
    const saved = JSON.parse(localStorage.getItem(positionStorageKey));
    if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) {
      applyPosition(saved.left, saved.top);
    }
  } catch {
    localStorage.removeItem(positionStorageKey);
  }
}

function setPositionEditing(enabled) {
  if (!enabled && dragState) {
    card.classList.remove('is-dragging');
    dragState = null;
    if (positionDirty) persistPanelPosition();
  }

  positionEditing = enabled;
  card.classList.toggle('is-position-editing', enabled);
  positionToggle.setAttribute('aria-pressed', String(enabled));
  positionToggle.setAttribute('aria-label', enabled ? 'Cancel position editing' : 'Edit panel position');
  positionToggle.title = enabled ? 'Cancel position editing' : 'Edit panel position';
}

function markPositionDirty() {
  positionDirty = true;
}

function persistPanelPosition() {
  const rectangle = card.getBoundingClientRect();
  localStorage.setItem(positionStorageKey, JSON.stringify({ left: rectangle.left, top: rectangle.top }));
  positionDirty = false;
}

function savePanelPosition() {
  persistPanelPosition();
  setPositionEditing(false);
}

function resetPanelPosition() {
  localStorage.removeItem(positionStorageKey);
  card.style.left = 'auto';
  card.style.top = '30px';
  card.style.right = '20px';
  positionDirty = false;
  setPositionEditing(false);
  syncEditToolbarPosition();
}

function beginPanelDrag(event) {
  if (!positionEditing || event.button !== 0 || event.target.closest('button')) return;

  const rectangle = card.getBoundingClientRect();
  dragState = {
    offsetX: event.clientX - rectangle.left,
    offsetY: event.clientY - rectangle.top,
  };

  applyPosition(rectangle.left, rectangle.top);
  card.classList.add('is-dragging');
  event.preventDefault();
}

function movePanel(event) {
  if (!dragState) return;
  applyPosition(event.clientX - dragState.offsetX, event.clientY - dragState.offsetY);
  markPositionDirty();
}

function endPanelDrag() {
  if (!dragState) return;
  card.classList.remove('is-dragging');
  dragState = null;
  if (positionDirty) savePanelPosition();
}

function previousAlert() {
  if (isNui) postNui('previous');
}

function nextAlert() {
  if (isNui) postNui('next');
}

function respondToAlert() {
  if (isNui) postNui('respond');
}

function postNui(action, data = {}) {
  fetch(`https://${getNuiResourceName()}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(data),
  });
}

previousButton.addEventListener('click', previousAlert);
nextButton.addEventListener('click', nextAlert);
respondButton.addEventListener('click', respondToAlert);
clearAlertsButton.addEventListener('click', () => {
  if (isNui) postNui('clearAlerts');
});
infoToggle.addEventListener('click', toggleDetails);
positionToggle.addEventListener('click', () => setPositionEditing(!positionEditing));
resetPositionButton.addEventListener('click', resetPanelPosition);
dispatchHeader.addEventListener('mousedown', beginPanelDrag);
card.addEventListener('animationend', (event) => {
  if (event.animationName === 'alert-enter') syncEditToolbarPosition();
});
alertDetails.addEventListener('transitionend', (event) => {
  if (event.propertyName === 'max-height') keepPanelInViewport();
});
window.addEventListener('mousemove', movePanel);
window.addEventListener('mouseup', endPanelDrag);

window.addEventListener('resize', () => {
  if (card.style.left && card.style.left !== 'auto') {
    const rectangle = card.getBoundingClientRect();
    applyPosition(rectangle.left, rectangle.top);
  }
  syncEditToolbarPosition();
});

window.addEventListener('keydown', (event) => {
  if (isNui && event.key === 'Escape') {
    event.preventDefault();
    postNui('closeFocus');
  }
});

function postFullDispatchState(state) {
  fullDispatchFrame.contentWindow?.postMessage({ channel: 'nmsh_dispatch:full', type: 'state', state }, '*');
}

window.addEventListener('message', (event) => {
  const message = event.data || {};
  if (event.source !== fullDispatchFrame.contentWindow || message.channel !== 'nmsh_dispatch:full') return;
  if (message.type === 'ready') {
    if (isNui) postNui('fullDispatchReady');
    return;
  }
  if (message.type === 'close' && isNui) {
    postNui('fullDispatchClose');
    return;
  }
  if (message.type === 'action' && isNui) postNui('fullDispatchAction', message.payload || {});
});

window.addEventListener('message', (event) => {
  if (!isNui) return;

  const message = event.data || {};
  if (message.action === 'fullDispatch') {
    fullDispatchFrame.hidden = message.open !== true;
    if (message.open === true) {
      fullDispatchFrame.contentWindow?.postMessage({ channel: 'nmsh_dispatch:full', type: 'resetSelection' }, '*');
    }
    if (message.open === true && message.state) postFullDispatchState(message.state);
    return;
  }

  if (message.action === 'fullDispatchState') {
    postFullDispatchState(message.state || { calls: [], units: [] });
    return;
  }

  if (message.action === 'hide') {
    clearArrivalEffect();
    detailsExpanded = false;
    card.classList.remove('is-expanded', 'is-cursor-active');
    editToolbar.setAttribute('aria-hidden', 'true');
    setPositionEditing(false);
    alerts = [];
    selectedIndex = 0;
    alertPosition = 0;
    alertTotal = 0;
    stopTimestampRefresh();
    render();
    return;
  }

  if (message.action === 'empty') {
    clearArrivalEffect();
    alertPosition = 0;
    alertTotal = 0;
    renderEmpty(message.department, message.channel, message.theme, message.respondKey, message.colors);
    return;
  }

  if (message.action === 'cursor') {
    const cursorEnabled = message.active === true;
    card.classList.toggle('is-cursor-active', cursorEnabled);
    editToolbar.setAttribute('aria-hidden', String(!cursorEnabled));
    if (cursorEnabled) syncEditToolbarPosition();
    if (!cursorEnabled) setPositionEditing(false);
    return;
  }

  if (message.action === 'respondKey') {
    respondKey.textContent = message.key || '—';
    return;
  }

  if (!message.alert) return;
  if (message.action === 'switch') clearArrivalEffect();
  alerts = [message.alert];
  selectedIndex = 0;
  alertPosition = Math.max(1, Number(message.index) || 1);
  alertTotal = Math.max(alertPosition, Number(message.total) || 1);
  respondKey.textContent = message.respondKey || respondKey.textContent;
  render(message.action === 'switch');
  if (message.action === 'show') playArrivalEffect(message.alert);
});

restoreSavedPosition();
if (isNui) document.body.classList.add('is-nui-ready');
render();
