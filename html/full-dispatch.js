const isNui = typeof GetParentResourceName === 'function' || window.parent !== window;
const isBrowserPreview = !isNui;
const previewIsDispatcher = isBrowserPreview && new URLSearchParams(window.location.search).get('role') !== 'officer';
const priorityColors = { LOW: '#7f8991', MED: '#B78A4A', HIGH: '#B95D5D', PANIC: '#D06464' };
const $ = id => document.getElementById(id);
const renderIcons = () => window.DispatchIcons?.render();
let calls = [];
let units = [];
let patrolGroups = [];
let tacChannels = [];
const expandedPatrols = new Set();
const expandedTacChannels = new Set();
let selectedCallId = null;
let selectedUnitId = null;
let joinedTacChannelId = null;
let callView = 'ACTIVE';
let tacticalItems = [];
let tacticalOverlaysVisible = true;
let tacticalPermission = isBrowserPreview;
let tacticalMode = null;
let tacticalDraftPoints = [];
let editingTacticalId = null;
let heatmapEvents = [];
let heatmapVisible = false;
let heatmapAvailable = isBrowserPreview;
let heatmapRange = '1H';
let heatmapType = 'ALL';
let heatmapPriority = 'ALL';
let priorityFilter = 'ALL';
let departmentFilter = 'ALL';
let service = { department: 'LSPD', channel: 'DISPATCH' };
let waveRange = { first: 3, last: 10 };
let query = '';
const historyFilters = { query: '', priority: 'ALL', department: 'ALL', status: 'ALL', range: '24H' };
let toastTimer;
let dispatcher = false;
let canBecomeDispatcher = isBrowserPreview;
// Browser preview roles mirror the runtime permission boundary: officers can
// inspect live operations, while only dispatchers get the archive view.
let historyAvailable = previewIsDispatcher;
let editingCallId = null;

if (isNui) document.body.classList.add('is-nui');

function postNui(action, data = {}) {
  if (!isNui) return;
  fetch(`https://${GetParentResourceName()}/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(data),
  });
}

function renderServiceIdentity() {
  const department = service.department || 'DISPATCH';
  const channel = service.channel || 'DISPATCH';
  $('service-department').textContent = department;
  $('service-channel').textContent = channel === 'MEDICAL' ? 'Los Santos Medical Communications' : `Los Santos ${channel === 'DISPATCH' ? 'Emergency' : channel} Communications`;
  // Full Dispatch is scoped on the server to the viewer's department. There is
  // no cross-department data to filter, so do not present misleading choices.
  departmentFilter = 'ALL';
  historyFilters.department = 'ALL';
  $('department-filters').hidden = true;
  $('history-department-filter').hidden = true;
}

function emit(type, payload = {}) {
  if (isBrowserPreview) {
    if (type === 'action') applyPreviewAction(payload);
    if (type === 'close') document.querySelector('.dispatch-shell').hidden = true;
    return;
  }
  if (window.parent !== window) {
    window.parent.postMessage({ channel: 'nmsh_dispatch:full', type, payload }, '*');
  } else if (type === 'action') {
    postNui('fullDispatchAction', payload);
  } else if (type === 'close') {
    postNui('fullDispatchClose');
  } else if (type === 'ready') {
    postNui('fullDispatchReady');
  }
}

function previewReference(unit) {
  return { id: unit.id, callsign: unit.callsign, name: unit.name, status: unit.status, isGroup: unit.isGroup === true };
}
function groupMemberIds() { return new Set(patrolGroups.flatMap(group => group.memberIds)); }
function groupMembers(group) { return group.memberIds.map(id => units.find(unit => unit.id === id)).filter(Boolean); }
function syncPatrolGroup(group) {
  const members = groupMembers(group);
  const leader = units.find(unit => unit.id === group.leaderId) || members[0];
  const statuses = ['OUT_OF_SERVICE', 'BUSY', 'ON_SCENE', 'RESPONDING', 'ASSIGNED', 'AVAILABLE'];
  group.status = statuses.find(status => members.some(member => member.status === status)) || 'AVAILABLE';
  group.coords = leader?.coords;
  group.heading = leader?.heading;
  group.vehicle = leader?.vehicle;
  group.department = leader?.department || group.department || 'LSPD';
  group.job = leader?.job || group.job || 'police';
  group.radioChannel = leader?.radioChannel || '';
  group.name = `${members.length} officer patrol`;
  group.isGroup = true;
  return group;
}
function selectableUnits() {
  const grouped = groupMemberIds();
  return [...patrolGroups.map(syncPatrolGroup), ...units.filter(unit => !grouped.has(unit.id))];
}
function visibleUnits() {
  const term = query.trim().toLowerCase();
  if (!term) return selectableUnits();
  return selectableUnits().filter(unit => {
    const channel = unitTacChannel(unit);
    return `${unit.callsign || ''} ${unit.name || ''} ${unit.department || ''} ${unit.job || ''} ${unit.status || ''} ${unit.vehicle?.label || ''} ${unit.radioChannel || ''} ${channel?.name || ''}`.toLowerCase().includes(term);
  });
}
function tacChannel(id) { return tacChannels.find(channel => channel.id === id) || null; }
function callTacChannel(call) { return tacChannel(call?.tacChannelId); }
function unitTacChannel(unit) { return tacChannel(unit?.tacChannelId); }
function tacMembers(channel) {
  const roster = selectableUnits();
  return (channel?.memberIds || []).map(id => roster.find(unit => unit.id === id)).filter(Boolean);
}
function setSelectableTac(unit, channelId = null) {
  if (!unit) return;
  unit.tacChannelId = channelId;
  if (unit.isGroup) groupMembers(unit).forEach(member => { member.tacChannelId = channelId; });
}
function assignCallToTac(channelId, callId) {
  if (!dispatcher) return;
  if (!isBrowserPreview) {
    emit('action', { action: 'tacAssignCall', channelId, callId });
    return;
  }
  const channel = tacChannel(channelId);
  const call = calls.find(item => item.id === callId);
  if (!channel || !call) return;
  if (channel.callId === call.id) {
    channel.callId = null;
    call.tacChannelId = null;
    showToast(`${call.code} removed from ${channel.name}`);
    return renderAll();
  }
  const previousCall = calls.find(item => item.id === channel.callId);
  if (previousCall) previousCall.tacChannelId = null;
  tacChannels.forEach(item => { if (item.callId === call.id) item.callId = null; });
  channel.callId = call.id;
  call.tacChannelId = channel.id;
  showToast(`${call.code} assigned to ${channel.name}`);
  renderAll();
}
function assignUnitToTac(channelId, unitId) {
  if (!dispatcher) return;
  if (!isBrowserPreview) {
    emit('action', { action: 'tacAssignTarget', channelId, unitId });
    return;
  }
  const channel = tacChannel(channelId);
  const unit = selectableUnits().find(item => item.id === unitId);
  if (!channel || !unit) return;
  tacChannels.forEach(item => { item.memberIds = (item.memberIds || []).filter(id => id !== unit.id); });
  channel.memberIds ||= [];
  if (!channel.memberIds.includes(unit.id)) channel.memberIds.push(unit.id);
  setSelectableTac(unit, channel.id);
  showToast(`${unitName(unit)} moved to ${channel.name}`);
  renderAll();
}
function removeUnitFromTac(channelId, unitId) {
  if (!dispatcher) return;
  if (!isBrowserPreview) {
    emit('action', { action: 'tacRemoveTarget', channelId, unitId });
    return;
  }
  const channel = tacChannel(channelId);
  const unit = selectableUnits().find(item => item.id === unitId);
  if (!channel || !unit) return;
  channel.memberIds = (channel.memberIds || []).filter(id => id !== unit.id);
  setSelectableTac(unit, null);
  renderAll();
}
function closeTacChannel(channelId) {
  if (!dispatcher) return;
  if (!isBrowserPreview) {
    emit('action', { action: 'tacClose', channelId });
    return;
  }
  const channel = tacChannel(channelId);
  if (!channel) return;
  const call = calls.find(item => item.id === channel.callId);
  if (call) call.tacChannelId = null;
  tacMembers(channel).forEach(unit => setSelectableTac(unit, null));
  tacChannels = tacChannels.filter(item => item.id !== channel.id);
  expandedTacChannels.delete(channel.id);
  if (joinedTacChannelId === channel.id) joinedTacChannelId = null;
  showToast(`${channel.name} closed`);
  renderAll();
}
function setSelectableStatus(unit, status, callId = null) {
    unit.status = status;
    unit.currentCallId = callId;
    if (unit.isGroup) groupMembers(unit).forEach(member => { member.status = status; member.currentCallId = callId; });
}
function previewWaveChannel(call) {
  const wave = Number(call?.metadata?.wave);
  return Number.isInteger(wave) && wave > 0 ? `WAVE-${wave}` : null;
}
function movePreviewUnitToWave(unit, call) {
  const channel = previewWaveChannel(call);
  if (!unit || !channel) return;
  call.metadata ||= {};
  call.metadata.waveOriginalChannels ||= {};
  if (!(unit.id in call.metadata.waveOriginalChannels)) call.metadata.waveOriginalChannels[unit.id] = unit.radioChannel || '';
  unit.waveCallId = call.id;
  unit.waveChannel = channel;
  unit.radioChannel = channel;
}
function restorePreviewUnitFromWave(unit, call) {
  if (!unit || unit.waveCallId !== call?.id) return;
  if (unit.radioChannel === unit.waveChannel && call.metadata?.waveOriginalChannels?.[unit.id] !== undefined) unit.radioChannel = call.metadata.waveOriginalChannels[unit.id];
  delete unit.waveCallId;
  delete unit.waveChannel;
}
function restorePreviewCallWave(call) {
  selectableUnits().forEach(unit => {
    if (unit.isGroup) groupMembers(unit).forEach(member => restorePreviewUnitFromWave(member, call));
    else restorePreviewUnitFromWave(unit, call);
  });
  if (call.metadata) { delete call.metadata.wave; delete call.metadata.waveOriginalChannels; }
}
function addPreviewTimeline(call, text) {
  call.metadata ||= {};
  call.metadata.timeline ||= [];
  call.metadata.timeline.push({ at: Math.floor(Date.now() / 1000), text });
}
function captureUnitHistory(call) {
  const history = new Map((call.metadata?.unitHistory || []).map(item => [item.id, item]));
  for (const reference of call.assignedUnits || []) {
    const live = selectableUnits().find(unit => unit.id === reference.id);
    history.set(reference.id, { ...previewReference(live || reference), outcome: live?.status || reference.status || 'ASSIGNED' });
  }
  for (const reference of call.respondingUnits || []) {
    const live = selectableUnits().find(unit => unit.id === reference.id);
    history.set(reference.id, { ...previewReference(live || reference), outcome: live?.status || reference.status || 'RESPONDING' });
  }
  call.metadata ||= {};
  call.metadata.unitHistory = [...history.values()];
}
function applyPreviewAction(payload) {
  const call = calls.find(item => item.id === payload.callId);
  const unit = selectableUnits().find(item => item.id === payload.unitId);
  if (payload.action === 'assign' && call && unit && unit.status === 'AVAILABLE') {
    call.assignedUnits ||= [];
    if (!call.assignedUnits.some(item => item.id === unit.id)) call.assignedUnits.push(previewReference(unit));
    setSelectableStatus(unit, 'ASSIGNED', call.id);
    addPreviewTimeline(call, `${unit.callsign} assigned`);
  } else if (payload.action === 'unassign' && call && unit) {
    call.assignedUnits = (call.assignedUnits || []).filter(item => item.id !== unit.id);
    call.respondingUnits = (call.respondingUnits || []).filter(item => item.id !== unit.id);
    setSelectableStatus(unit, 'AVAILABLE');
    addPreviewTimeline(call, `${unit.callsign} unassigned`);
  } else if (payload.action === 'respond' && call && unit && call.assignedUnits?.some(item => item.id === unit.id)
    && unit.status === 'ASSIGNED') {
    call.respondingUnits ||= [];
    if (!call.respondingUnits.some(item => item.id === unit.id)) call.respondingUnits.push(previewReference(unit));
    setSelectableStatus(unit, 'RESPONDING', call.id);
    if (unit.isGroup) groupMembers(unit).forEach(member => movePreviewUnitToWave(member, call));
    else movePreviewUnitToWave(unit, call);
    if (call.status === 'NEW') call.status = 'ACTIVE';
    addPreviewTimeline(call, `${unit.callsign} responding`);
  } else if (payload.action === 'gps' && call) {
    showToast(`GPS set for ${call.code}`);
  } else if (payload.action === 'dispatcherCreate' && payload.call) {
    const created = {
      ...payload.call,
      id: `PREVIEW-${Date.now()}`,
      createdAt: Math.floor(Date.now() / 1000),
      status: 'NEW',
      assignedUnits: [],
      respondingUnits: [],
      metadata: { panic: payload.call.priority === 'PANIC', panicAcknowledged: false, notes: [], timeline: [] },
    };
    addPreviewTimeline(created, 'Dispatcher created call');
    calls.unshift(created);
    selectedCallId = created.id;
  } else if (payload.action === 'dispatcherEdit' && call && payload.updates) {
    Object.assign(call, payload.updates);
    call.metadata ||= {};
    call.metadata.panic = call.priority === 'PANIC';
    if (!call.metadata.panic) call.metadata.panicAcknowledged = false;
    addPreviewTimeline(call, 'Dispatcher updated call');
  } else if (payload.action === 'dispatcherResolve' && call) {
    captureUnitHistory(call);
    restorePreviewCallWave(call);
    call.status = 'RESOLVED';
    call.closedAt = Math.floor(Date.now() / 1000);
    for (const reference of call.assignedUnits || []) {
      const assigned = selectableUnits().find(item => item.id === reference.id);
      if (assigned) setSelectableStatus(assigned, 'AVAILABLE');
    }
    call.assignedUnits = [];
    call.respondingUnits = [];
    addPreviewTimeline(call, 'Dispatcher resolved call');
  } else if (payload.action === 'dispatcherReopen' && call) {
    call.status = 'NEW';
    call.reopenedAt = Math.floor(Date.now() / 1000);
    callView = 'ACTIVE';
    addPreviewTimeline(call, 'Dispatcher reopened call');
  } else if (payload.action === 'dispatcherNote' && call && payload.note?.trim()) {
    call.metadata ||= {};
    call.metadata.notes ||= [];
    call.metadata.notes.push({ at: Math.floor(Date.now() / 1000), text: payload.note.trim() });
    addPreviewTimeline(call, `Note: ${payload.note.trim()}`);
  } else if (payload.action === 'dispatcherAcknowledgePanic' && call) {
    call.metadata ||= {};
    call.metadata.panicAcknowledged = true;
    addPreviewTimeline(call, 'Dispatcher acknowledged panic');
  }
  renderAll();
}

function selectedCall() { return calls.find(call => call.id === selectedCallId) || null; }
function selectedUnit() { return selectableUnits().find(unit => unit.id === selectedUnitId) || null; }
function priorityLabel(value) { return priorityColors[value] ? value : 'MED'; }
function unitName(unit) { return unit?.callsign || unit?.name || unit?.id || 'UNIT'; }
function formatAge(createdAt) {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - Number(createdAt || Date.now() / 1000)));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
function formatTime(timestamp) {
  if (!timestamp) return 'NOW';
  return new Date(Number(timestamp) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}
function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 1800);
}
function isHistoricalCall(call) { return call.status === 'RESOLVED' || call.status === 'ARCHIVED'; }
function historyTimestamp(call) { return Number(call.archivedAt || call.closedAt || call.createdAt || 0); }
function visibleCalls() {
  if (callView === 'HISTORY') {
    const term = historyFilters.query.trim().toLowerCase();
    const ranges = { '24H': 86400, '7D': 604800, '30D': 2592000 };
    const maximumAge = ranges[historyFilters.range];
    const now = Math.floor(Date.now() / 1000);
    return calls.filter(call => isHistoricalCall(call)
      && (historyFilters.priority === 'ALL' || call.priority === historyFilters.priority)
      && (historyFilters.department === 'ALL' || call.department === historyFilters.department)
      && (historyFilters.status === 'ALL' || call.status === historyFilters.status)
      && (!maximumAge || now - historyTimestamp(call) <= maximumAge)
      && (!term || `${call.code} ${call.title} ${call.description} ${call.street} ${call.area} ${call.department} ${call.status}`.toLowerCase().includes(term))
    ).sort((a, b) => historyTimestamp(b) - historyTimestamp(a));
  }
  const term = query.trim().toLowerCase();
  return calls.filter(call => !isHistoricalCall(call)
    && (priorityFilter === 'ALL' || call.priority === priorityFilter)
    && (departmentFilter === 'ALL' || call.department === departmentFilter)
    && (!term || `${call.code} ${call.title} ${call.street} ${call.area} ${call.department}`.toLowerCase().includes(term))
  );
}
function availablePatrolCandidates() {
  const grouped = groupMemberIds();
  return units.filter(unit => !grouped.has(unit.id) && unit.status === 'AVAILABLE' && !unit.tacChannelId);
}
function removePatrolMember(groupId, memberId) {
  if (!dispatcher) return;
  if (!isBrowserPreview) {
    emit('action', { action: 'patrolRemoveMember', groupId, unitId: memberId });
    return;
  }
  const group = patrolGroups.find(item => item.id === groupId);
  if (!group || group.memberIds.length <= 2) return showToast('A patrol requires at least two officers');
  const removedMember = units.find(unit => unit.id === memberId);
  group.memberIds = group.memberIds.filter(id => id !== memberId);
  if (group.leaderId === memberId) group.leaderId = group.memberIds[0];
  if (selectedUnitId === memberId) selectedUnitId = group.id;
  if (removedMember && group.tacChannelId) removedMember.tacChannelId = null;
  if (removedMember && removedMember.currentCallId === group.currentCallId && group.currentCallId) {
    setSelectableStatus(removedMember, 'AVAILABLE');
  }
  syncPatrolGroup(group);
  renderAll();
}
function disbandPatrol(groupId) {
  if (!dispatcher) return;
  if (!isBrowserPreview) {
    emit('action', { action: 'patrolDisband', groupId });
    return;
  }
  const group = patrolGroups.find(item => item.id === groupId);
  if (!group) return;
  for (const call of calls) {
    call.assignedUnits = (call.assignedUnits || []).filter(reference => reference.id !== groupId);
    call.respondingUnits = (call.respondingUnits || []).filter(reference => reference.id !== groupId);
  }
  tacChannels.forEach(channel => { channel.memberIds = (channel.memberIds || []).filter(id => id !== groupId); });
  groupMembers(group).forEach(member => { member.tacChannelId = null; });
  groupMembers(group).forEach(member => setSelectableStatus(member, 'AVAILABLE'));
  patrolGroups = patrolGroups.filter(item => item.id !== groupId);
  expandedPatrols.delete(groupId);
  if (selectedUnitId === groupId) selectedUnitId = null;
  renderAll();
}
function keepSelectionValid() {
  if (selectedCallId && !calls.some(call => call.id === selectedCallId)) selectedCallId = null;
  if (selectedUnitId && !selectableUnits().some(unit => unit.id === selectedUnitId)) selectedUnitId = null;
}
function assignedIds(call) { return (call?.assignedUnits || []).map(unit => unit.id); }
function assignedUnit(call, id) { return (call?.assignedUnits || []).find(unit => unit.id === id); }
function historicalUnits(call) {
  if (call?.metadata?.unitHistory?.length) return call.metadata.unitHistory;
  const history = new Map();
  for (const unit of call?.assignedUnits || []) history.set(unit.id, { ...unit, outcome: unit.status || 'ASSIGNED' });
  for (const unit of call?.respondingUnits || []) history.set(unit.id, { ...unit, outcome: unit.status || 'RESPONDING' });
  return [...history.values()];
}

function renderCalls() {
  const visible = visibleCalls();
  const historyCount = calls.filter(isHistoricalCall).length;
  if (!historyAvailable && callView === 'HISTORY') callView = 'ACTIVE';
  $('call-view-tabs').hidden = !historyAvailable;
  $('active-filter-block').hidden = callView !== 'ACTIVE';
  $('history-filter-block').hidden = callView !== 'HISTORY';
  $('calls-panel-title').textContent = callView === 'HISTORY' ? 'Call History' : 'Active Calls';
  $('history-count').textContent = historyCount;
  document.querySelectorAll('[data-call-view]').forEach(button => button.classList.toggle('is-active', button.dataset.callView === callView));
  $('filtered-count').textContent = visible.length;
  $('active-count').textContent = calls.filter(call => call.status !== 'RESOLVED' && call.status !== 'ARCHIVED').length;
  $('call-list').innerHTML = visible.length ? visible.map(call => {
    const priority = priorityLabel(call.priority);
    const history = isHistoricalCall(call);
    const unitCount = history ? (call.metadata?.unitHistory || []).length : assignedIds(call).length;
    return `<button class="call-card ${history ? 'is-history' : ''} ${call.id === selectedCallId ? 'is-selected' : ''}" data-call="${call.id}" data-status="${call.status}" aria-pressed="${call.id === selectedCallId}" style="--priority:${priorityColors[priority]}">
      <div class="call-top"><span class="priority-label">${priority}</span><span class="call-code">${call.code}</span>${history ? `<span class="history-status-pill">${call.status}</span>` : ''}<span class="call-age">${formatAge(history ? historyTimestamp(call) : call.createdAt)}</span><span class="selection-check" aria-hidden="true" style="display:${call.id === selectedCallId ? 'inline-grid' : 'none'};place-items:center;width:17px;height:17px;border:1px solid rgba(116,165,194,.58);border-radius:50%;background:rgba(59,99,126,.18);color:#b8d8e9;font:800 11px/1 Inter,Arial,sans-serif">✓</span></div>
      <h3>${call.title}</h3><p>${[call.street, call.area].filter(Boolean).join(', ') || 'Location unavailable'}</p>
      <div class="call-meta"><i data-lucide="map-pin"></i><span>${call.department || 'DISPATCH'}</span><span class="assigned-count">${unitCount} unit${unitCount === 1 ? '' : 's'}</span></div>
    </button>`;
  }).join('') : `<div class="empty-state">${callView === 'HISTORY' ? 'No archived calls match the selected filters.' : 'No active calls match the selected filters.'}</div>`;
  $('call-list').querySelectorAll('[data-call]').forEach(button => button.onclick = () => {
    const isSelecting = selectedCallId !== button.dataset.call;
    selectedCallId = isSelecting ? button.dataset.call : null;
    const call = selectedCall();
    if (isSelecting && call?.coords) gtaMap?.setView(gtaLatLng(call.coords), 4, { animate: true });
    renderAll();
  });
}

function renderDispatcherRole() {
  const button = $('dispatcher-role-action');
  if (!button) return;
  button.hidden = !dispatcher && !canBecomeDispatcher;
  button.disabled = !dispatcher && !canBecomeDispatcher;
  button.textContent = dispatcher ? 'Leave Dispatch' : 'Become Dispatcher';
  button.classList.toggle('is-active', dispatcher);
}

function renderUnits() {
  const statuses = ['AVAILABLE', 'ASSIGNED', 'RESPONDING', 'ON_SCENE'];
  const roster = visibleUnits();
  const isDispatchUnit = unit => unit.isDispatcher === true || (unit.isGroup && groupMembers(unit).some(member => member.isDispatcher === true));
  const sections = [
    ['DISPATCH', isDispatchUnit],
    ['AVAILABLE', unit => !isDispatchUnit(unit) && unit.status === 'AVAILABLE'],
    ['ASSIGNED', unit => !isDispatchUnit(unit) && (unit.status === 'ASSIGNED' || unit.status === 'BUSY')],
    ['RESPONDING', unit => !isDispatchUnit(unit) && unit.status === 'RESPONDING'],
    ['ON SCENE', unit => !isDispatchUnit(unit) && unit.status === 'ON_SCENE'],
    ['OUT OF SERVICE', unit => !isDispatchUnit(unit) && unit.status === 'OUT_OF_SERVICE'],
  ];
  $('operations-panel-title').textContent = 'Units';
  $('create-patrol-action').hidden = !dispatcher;
  $('units-visible').textContent = roster.length;
  $('unit-count').textContent = units.length;
  $('unit-summary').innerHTML = statuses.map(status => `<div class="summary-item"><b>${units.filter(unit => unit.status === status).length}</b>${status.replace('_', ' ')}</div>`).join('');
  $('unit-list').innerHTML = roster.length ? roster.map(unit => {
    const color = unit.status === 'AVAILABLE' ? '#629A76' : unit.status === 'ON_SCENE' ? '#70AD82' : unit.status === 'RESPONDING' ? '#B78A4A' : '#8b969f';
    const vehicle = unit.vehicle?.label || 'On foot';
    if (unit.isGroup) {
      const members = groupMembers(unit);
      const leader = members.find(member => member.id === unit.leaderId);
      const expanded = expandedPatrols.has(unit.id);
      return `<section class="patrol-group ${expanded ? 'is-expanded' : ''}" data-patrol="${unit.id}" style="--status-color:${color}">
        <div class="unit-card patrol-card ${unit.id === selectedUnitId ? 'is-selected' : ''}" data-unit="${unit.id}" role="button" tabindex="0" aria-pressed="${unit.id === selectedUnitId}">
          <div class="unit-top"><span class="unit-badge patrol-badge">${unitName(unit)}</span><div class="unit-info"><strong>${unit.name}</strong><span>${leader?.name || 'No leader'} <b class="leader-tag">LEADER</b></span></div><span class="status-pill">${unit.status.replace('_', ' ')}</span><span class="selection-check" aria-hidden="true" style="display:${unit.id === selectedUnitId ? 'inline-grid' : 'none'};place-items:center;width:17px;height:17px;margin-left:7px;border:1px solid rgba(116,165,194,.58);border-radius:50%;background:rgba(59,99,126,.18);color:#b8d8e9;font:800 11px/1 Inter,Arial,sans-serif">✓</span><button class="patrol-toggle" type="button" data-toggle-patrol="${unit.id}" aria-label="${expanded ? 'Collapse' : 'Expand'} ${unitName(unit)}" aria-expanded="${expanded}"><span>›</span></button></div>
          <div class="unit-meta"><i data-lucide="users"></i><span>${members.length} officers</span><span>${unit.radioChannel || 'No radio'}</span></div>
        </div>
        <div class="patrol-members" data-group-members="${unit.id}" ${expanded ? '' : 'hidden'}>${members.map(member => `<div class="patrol-member"><div><strong>${unitName(member)} · ${member.name}${member.id === unit.leaderId ? '<b class="leader-tag">LEADER</b>' : ''}</strong><small>${member.status.replace('_', ' ')}</small></div>${dispatcher ? `<button type="button" data-remove-member="${member.id}" data-group="${unit.id}" aria-label="Remove ${member.name} from ${unitName(unit)}">Remove</button>` : ''}</div>`).join('')}${dispatcher ? `<button class="patrol-disband" type="button" data-disband="${unit.id}">Disband patrol</button>` : ''}</div>
      </section>`;
    }
    return `<button class="unit-card ${unit.id === selectedUnitId ? 'is-selected' : ''}" data-unit="${unit.id}" aria-pressed="${unit.id === selectedUnitId}" style="--status-color:${color}">
      <div class="unit-top"><span class="unit-badge">${unitName(unit)}</span><div class="unit-info"><strong>${unit.name || unitName(unit)}</strong><span>${unit.department || unit.job || 'DISPATCH'} &bull; ${unit.radioChannel || 'No radio'}</span></div><span class="status-pill">${(unit.status || 'AVAILABLE').replace('_', ' ')}</span><span class="selection-check" aria-hidden="true" style="display:${unit.id === selectedUnitId ? 'inline-grid' : 'none'};place-items:center;width:17px;height:17px;margin-left:7px;border:1px solid rgba(116,165,194,.58);border-radius:50%;background:rgba(59,99,126,.18);color:#b8d8e9;font:800 11px/1 Inter,Arial,sans-serif">✓</span></div>
      <div class="unit-meta"><i data-lucide="car-front"></i><span>${vehicle}</span></div>
    </button>`;
  }).join('') : '<div class="empty-state">No on-duty units available.</div>';
  if (roster.length) {
    const list = $('unit-list');
    const cards = new Map(Array.from(list.children).map(node => {
      const id = node.dataset.patrol || node.dataset.unit;
      return [id, node];
    }));
    const fragment = document.createDocumentFragment();
    sections.forEach(([label, matches]) => {
      const sectionUnits = roster.filter(matches);
      const section = document.createElement('section');
      section.className = `unit-state-section${sectionUnits.length ? '' : ' is-empty'}`;
      section.innerHTML = `<header><span>${label}</span><b>${sectionUnits.length}</b></header>`;
      sectionUnits.forEach(unit => {
        const card = cards.get(unit.id);
        if (!card) return;
        if (isDispatchUnit(unit)) {
          const status = card.querySelector('.status-pill');
          if (status) status.outerHTML = '<span class="dispatcher-badge">Dispatcher</span>';
        }
        section.append(card);
      });
      fragment.append(section);
    });
    list.replaceChildren(fragment);
  }
  $('unit-list').querySelectorAll('[data-unit]').forEach(button => button.onclick = () => {
    const isSelecting = selectedUnitId !== button.dataset.unit;
    selectedUnitId = isSelecting ? button.dataset.unit : null;
    const unit = selectedUnit();
    if (isSelecting && unit?.coords) gtaMap?.setView(gtaLatLng(unit.coords), 4, { animate: true });
    renderUnits(); renderDetails(); renderIcons();
  });
  $('unit-list').querySelectorAll('[data-toggle-patrol]').forEach(button => button.onclick = event => {
    event.stopPropagation();
    const groupId = button.dataset.togglePatrol;
    if (expandedPatrols.has(groupId)) expandedPatrols.delete(groupId); else expandedPatrols.add(groupId);
    renderUnits(); renderIcons();
  });
  $('unit-list').querySelectorAll('[data-remove-member]').forEach(button => button.onclick = event => {
    event.stopPropagation();
    removePatrolMember(button.dataset.group, button.dataset.removeMember);
  });
  $('unit-list').querySelectorAll('[data-disband]').forEach(button => button.onclick = event => {
    event.stopPropagation();
    disbandPatrol(button.dataset.disband);
  });
}

function renderTacChannels() {
  $('tac-count').textContent = tacChannels.length;
  $('tac-open-count').textContent = tacChannels.length;
  $('tac-list').innerHTML = tacChannels.length ? tacChannels.map(channel => {
    const call = calls.find(item => item.id === channel.callId);
    const members = tacMembers(channel);
    const selectedUnitValue = selectedUnit();
    const selectedCallValue = selectedCall();
    const expanded = expandedTacChannels.has(channel.id);
    const joined = joinedTacChannelId === channel.id;
    const unitAlreadyHere = selectedUnitValue && members.some(unit => unit.id === selectedUnitValue.id);
    const callAlreadyHere = selectedCallValue && channel.callId === selectedCallValue.id;
    return `<section class="tac-channel ${expanded ? 'is-expanded' : ''}" data-tac="${channel.id}">
      <button class="tac-channel-head" type="button" data-toggle-tac="${channel.id}" aria-expanded="${expanded}" aria-label="${expanded ? 'Collapse' : 'Expand'} ${channel.name}">
        <span class="tac-channel-badge">${channel.name}</span><span class="tac-channel-info"><strong>${channel.label}</strong><span>${channel.department} · ${call ? `${call.code} ${call.title}` : 'No assigned call'}</span></span><span class="tac-status">OPEN</span><span class="tac-chevron">›</span>
      </button>
      <div class="tac-channel-body" ${expanded ? '' : 'hidden'}>
        <div class="tac-call-row">${call ? `<b>${call.code}</b><span>${call.title}</span>` : '<span>No call assigned</span>'}</div>
        <div class="tac-member-heading"><span>Channel members</span><b>${members.length}</b></div>
        <div class="tac-members">${members.length ? members.map(unit => `<div class="tac-member"><div><strong>${unitName(unit)}</strong><span>${unit.name}</span></div>${dispatcher ? `<button type="button" data-remove-tac-member="${unit.id}" data-channel="${channel.id}" aria-label="Remove ${unitName(unit)} from ${channel.name}">×</button>` : ''}</div>`).join('') : '<div class="tac-empty">No units in this channel.</div>'}</div>
        <div class="tac-actions"><button type="button" class="${joined ? 'is-joined' : ''}" data-join-tac="${channel.id}">${joined ? 'Leave channel' : 'Join channel'}</button>${dispatcher ? `<button type="button" data-assign-call-tac="${channel.id}" ${selectedCallValue ? '' : 'disabled'}>${callAlreadyHere ? 'Clear selected call' : 'Assign selected call'}</button><button type="button" data-assign-unit-tac="${channel.id}" ${selectedUnitValue && !unitAlreadyHere ? '' : 'disabled'}>${selectedUnitValue?.isGroup ? 'Add patrol' : 'Add selected unit'}</button><button type="button" class="is-danger" data-close-tac="${channel.id}">Close channel</button>` : ''}</div>
      </div>
    </section>`;
  }).join('') : '<div class="empty-state">No open TAC channels.</div>';
  $('tac-list').querySelectorAll('[data-toggle-tac]').forEach(button => button.onclick = () => {
    const id = button.dataset.toggleTac;
    if (expandedTacChannels.has(id)) expandedTacChannels.delete(id); else expandedTacChannels.add(id);
    renderTacChannels();
  });
  $('tac-list').querySelectorAll('[data-join-tac]').forEach(button => button.onclick = () => {
    if (!isBrowserPreview) {
      emit('action', { action: joinedTacChannelId === button.dataset.joinTac ? 'tacLeave' : 'tacJoin', channelId: button.dataset.joinTac });
      return;
    }
    joinedTacChannelId = joinedTacChannelId === button.dataset.joinTac ? null : button.dataset.joinTac;
    showToast(joinedTacChannelId ? `Joined ${tacChannel(joinedTacChannelId)?.name}` : 'Left TAC channel');
    renderTacChannels();
  });
  $('tac-list').querySelectorAll('[data-assign-call-tac]').forEach(button => button.onclick = () => {
    const call = selectedCall();
    if (call) assignCallToTac(button.dataset.assignCallTac, call.id);
  });
  $('tac-list').querySelectorAll('[data-assign-unit-tac]').forEach(button => button.onclick = () => {
    const unit = selectedUnit();
    if (unit) assignUnitToTac(button.dataset.assignUnitTac, unit.id);
  });
  $('tac-list').querySelectorAll('[data-remove-tac-member]').forEach(button => button.onclick = () => removeUnitFromTac(button.dataset.channel, button.dataset.removeTacMember));
  $('tac-list').querySelectorAll('[data-close-tac]').forEach(button => button.onclick = () => closeTacChannel(button.dataset.closeTac));
}

function managementStatus(call) {
  if (call.metadata?.managementStatus) return call.metadata.managementStatus;
  const assigned = call.assignedUnits || [];
  const hasOnScene = assigned.some(reference => {
    const live = selectableUnits().find(unit => unit.id === reference.id);
    return (live?.status || reference.status) === 'ON_SCENE';
  });
  if (hasOnScene) return 'ON_SCENE';
  if (assigned.length) return 'ASSIGNED';
  return 'NEW';
}

function renderWaveGrid(call, history) {
  const currentWave = Number(call.metadata?.wave) || null;
  const firstWave = Math.max(1, Number(waveRange.first) || 3);
  const lastWave = Math.max(firstWave, Number(waveRange.last) || 10);
  const occupied = new Map(calls
    .filter(item => item.id !== call.id && !isHistoricalCall(item) && Number(item.metadata?.wave))
    .map(item => [Number(item.metadata.wave), item]));
  $('selected-wave-label').textContent = currentWave ? `WAVE ${currentWave} · THIS CALL` : 'NO WAVE ASSIGNED';
  $('wave-grid').innerHTML = Array.from({ length: lastWave - firstWave + 1 }, (_, index) => {
    const number = firstWave + index;
    const takenBy = occupied.get(number);
    const state = currentWave === number ? 'is-current' : takenBy ? 'is-taken' : 'is-free';
    const label = currentWave === number ? `Wave ${number}, assigned to this call` : takenBy ? `Wave ${number}, taken by ${takenBy.code}` : `Wave ${number}, free`;
    return `<button type="button" class="${state}" data-wave="${number}" aria-label="${label}" title="${label}" ${history || takenBy || !dispatcher ? 'disabled' : ''}>${number}</button>`;
  }).join('');
  $('wave-grid').querySelectorAll('[data-wave]').forEach(button => button.onclick = () => {
    if (!dispatcher) return;
    const wave = Number(button.dataset.wave);
    if (!isBrowserPreview) {
      emit('action', { action: 'dispatcherSetCallWave', callId: call.id, wave: Number(call.metadata?.wave) === wave ? null : wave });
      return;
    }
    call.metadata ||= {};
    const previousWave = Number(call.metadata.wave) || null;
    const activeUnits = selectableUnits().filter(unit => unit.currentCallId === call.id && ['RESPONDING', 'ON_SCENE'].includes(unit.status));
    if (previousWave === wave && activeUnits.length) {
      showToast('Move active units to another wave before releasing it');
      return;
    }
    call.metadata.wave = previousWave === wave ? null : wave;
    activeUnits.forEach(unit => {
      if (unit.isGroup) groupMembers(unit).forEach(member => movePreviewUnitToWave(member, call));
      else movePreviewUnitToWave(unit, call);
    });
    if (!call.metadata.wave) restorePreviewCallWave(call);
    addPreviewTimeline(call, call.metadata.wave ? `Wave ${wave} assigned` : `Wave ${wave} released`);
    renderAll();
  });
}

function renderDetails() {
  const call = selectedCall();
  const unit = selectedUnit();
  const panel = $('detail-panel');
  const workspace = document.querySelector('.workspace');
  panel.classList.toggle('is-empty', !call);
  workspace?.classList.toggle('has-call-selection', Boolean(call));
  panel.classList.toggle('is-history', Boolean(call && isHistoricalCall(call)));
  if (!call) return;

  const history = isHistoricalCall(call);
  const priority = priorityLabel(call.priority);
  const assigned = history ? historicalUnits(call) : (call.assignedUnits || []);
  const status = history ? call.status : managementStatus(call);
  const departments = Array.isArray(call.dispatchedDepartments) && call.dispatchedDepartments.length
    ? call.dispatchedDepartments : [call.department || service.department || 'DISPATCH'];

  $('management-incident-icon').innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${incidentGlyph(call)}</svg>`;
  $('detail-priority').textContent = priority;
  $('detail-priority').style.cssText = `--priority:${priorityColors[priority]};color:${priorityColors[priority]}`;
  $('detail-code').textContent = call.code;
  $('detail-title').textContent = call.title;
  $('detail-status').textContent = status.replace('_', ' ');
  $('detail-description').textContent = call.description;
  $('detail-street').textContent = call.street || 'Location unavailable';
  $('detail-area').textContent = call.area || '';
  $('detail-time').textContent = history ? `${formatAge(historyTimestamp(call))} ago` : `${formatAge(call.createdAt)} ago`;
  $('detail-departments').textContent = departments.join(' · ');

  document.querySelectorAll('[data-management-status]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.managementStatus === status);
    button.disabled = history || !dispatcher || !isBrowserPreview;
  });
  renderWaveGrid(call, history);

  $('assigned-count-label').textContent = `${assigned.length} UNIT${assigned.length === 1 ? '' : 'S'}`;
  $('assigned-list').innerHTML = assigned.length ? assigned.map(reference => {
    const live = selectableUnits().find(item => item.id === reference.id);
    const unitStatus = String(history ? (reference.outcome || reference.status || 'ASSIGNED') : (live?.status || reference.status || 'ASSIGNED')).replace('_', ' ');
    const remove = !history && dispatcher ? `<button type="button" data-unassign="${reference.id}" aria-label="Unassign ${unitName(reference)}" title="Unassign ${unitName(reference)}"><span aria-hidden="true">&times;</span></button>` : '';
    return `<div class="management-unit-row"><b>${unitName(reference)}</b><span>${reference.name || live?.name || 'Unit'}</span><em>${unitStatus}</em>${remove}</div>`;
  }).join('') : `<div class="management-assigned-empty">${history ? 'No unit history recorded.' : 'No units assigned to this call.'}</div>`;
  $('assigned-list').querySelectorAll('[data-unassign]').forEach(button => button.onclick = () => emit('action', { action: 'unassign', callId: call.id, unitId: button.dataset.unassign }));

  const timeline = call.metadata?.timeline || [];
  $('timeline').innerHTML = timeline.slice().reverse().map(item => `<li><time>${formatTime(item.at)}</time><span>${item.text}</span></li>`).join('');

  const isAssigned = unit && assignedIds(call).includes(unit.id);
  $('assign-action').querySelector('span').textContent = unit?.isGroup ? 'Assign selected patrol' : 'Assign selected unit';
  $('assign-action').disabled = history || !dispatcher || !unit || isAssigned || unit.status !== 'AVAILABLE';
  $('focus-call-action').disabled = !call.coords;
  $('broadcast-call-action').disabled = history || !dispatcher || !isBrowserPreview;
  document.querySelectorAll('[data-resolve-as]').forEach(button => { button.disabled = history || !dispatcher; });

  $('dispatcher-actions').hidden = !dispatcher;
  $('edit-call-action').hidden = history;
  $('resolve-call-action').hidden = true;
  $('reopen-call-action').hidden = !history;
  $('note-call-action').hidden = history;
  $('ack-panic-action').hidden = history || call.priority !== 'PANIC' || call.metadata?.panicAcknowledged === true;
}

const gtaCrs = Object.assign({}, L.CRS.Simple, {
  projection: L.Projection.LonLat,
  scale: zoom => Math.pow(2, zoom),
  zoom: scale => Math.log(scale) / Math.LN2,
  distance: (a, b) => Math.hypot(b.lng - a.lng, b.lat - a.lat),
  transformation: new L.Transformation(.02072, 117.3, -.0205, 172.8),
  infinite: true,
});
const gtaLatLng = coords => L.latLng(coords.y, coords.x);
// Tile 0/0/0 covers the complete GTA map. Keep Leaflet inside that world so
// zooming out or dragging never exposes the empty canvas outside the tiles.
const gtaWorldBounds = L.latLngBounds([ -4058, -5659 ], [ 8429, 6682 ]);
let gtaMap;
let callLayer;
let unitLayer;
let tacticalLayer;
let tacticalDraftLayer;
let heatLayer;
let heatRenderer;
const tacticalStyles = {
  MARKER: { color: '#e4bc65', label: 'Shared marker', icon: 'map-pin' },
  ZONE: { color: '#c56d73', label: 'Search perimeter', icon: 'crosshair' },
  ROUTE: { color: '#7ca4bf', label: 'Roadblock route', icon: 'navigation' },
};
const incidentGlyphs = {
  radio: '<path d="M5 9a10 10 0 0 1 14 0M8 12a6 6 0 0 1 8 0M11 15a2 2 0 0 1 2 0"/><circle cx="12" cy="18" r="1"/>',
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/>',
  store: '<path d="M4 10v10h16V10M3 4h18l-1 6a3 3 0 0 1-4 2 3 3 0 0 1-4 0 3 3 0 0 1-4 0 3 3 0 0 1-4-2Z"/><path d="M9 20v-5h6v5"/>',
  bank: '<path d="m3 9 9-5 9 5M5 10h14M6 10v8M10 10v8M14 10v8M18 10v8M4 18h16M3 21h18"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r=".8"/><circle cx="15" cy="9" r=".8"/><circle cx="12" cy="12" r=".8"/><circle cx="9" cy="15" r=".8"/><circle cx="15" cy="15" r=".8"/>',
  siren: '<path d="M7 17v-6a5 5 0 0 1 10 0v6M5 17h14v3H5ZM12 2v2M3 8l3 1M21 8l-3 1M5 3l2 3M19 3l-2 3"/>',
  medical: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z"/>',
  wrench: '<path d="M14.7 6.3a5 5 0 0 0-6.4 6.4L3 18l3 3 5.3-5.3a5 5 0 0 0 6.4-6.4l-3.2 3.2-3-3Z"/>',
  fight: '<path d="m8 9 3 3-5 5-3-3ZM16 9l-3 3 5 5 3-3M8 9l2-5 3 2M16 9l-2-5-3 2"/>',
  alert: '<path d="M10.3 4.3 2.7 18a2 2 0 0 0 1.8 3h15a2 2 0 0 0 1.8-3L13.7 4.3a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
  crosshair: '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  car: '<path d="m5 16-1.5-1.5V11l2-5h13l2 5v3.5L19 16M5 16h14v3H5Z"/><circle cx="7.5" cy="12.5" r="1"/><circle cx="16.5" cy="12.5" r="1"/>',
};
function incidentGlyph(call) {
  if (call?.metadata?.panic === true || call?.priority === 'PANIC') return incidentGlyphs.siren;
  if ((call?.department || '').toUpperCase() === 'EMS') return incidentGlyphs.medical;
  if ((call?.department || '').toUpperCase() === 'MECHANIC') return incidentGlyphs.wrench;
  const text = `${call?.code || ''} ${call?.title || ''} ${call?.description || ''}`.toLowerCase();
  if (/house robbery|home robbery|burglary/.test(text)) return incidentGlyphs.home;
  if (/store robbery|shop robbery|popcat robbery/.test(text)) return incidentGlyphs.store;
  if (/bank robbery/.test(text)) return incidentGlyphs.bank;
  if (/casino robbery|casino/.test(text)) return incidentGlyphs.dice;
  if (/stolen vehicle|vehicle pursuit|carjacking|vehicle assistance/.test(text)) return incidentGlyphs.car;
  if (/shots fired|shooting|armed person/.test(text)) return incidentGlyphs.crosshair;
  if (/fight in progress|fight/.test(text)) return incidentGlyphs.fight;
  if (/suspicious person/.test(text)) return incidentGlyphs.user;
  if (/medical emergency|unconscious|injured/.test(text)) return incidentGlyphs.medical;
  if (/illegal activity|suspicious activity/.test(text)) return incidentGlyphs.alert;
  return incidentGlyphs.radio;
}
function markerIcon(kind, color, label = '') {
  return L.divIcon({ className: 'dispatch-leaflet-icon', html: `<span class="${kind}" style="--marker:${color}">${label}</span>`, iconSize: kind === 'leaflet-call-marker' ? [30, 30] : [14, 14], iconAnchor: kind === 'leaflet-call-marker' ? [15, 15] : [7, 7] });
}
function incidentMarkerIcon(call, color) {
  return L.divIcon({ className: 'dispatch-leaflet-icon', html: `<span class="leaflet-call-marker" style="--marker:${color}"><svg viewBox="0 0 24 24" aria-hidden="true">${incidentGlyph(call)}</svg></span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
}
function initializeGtaMap() {
  const stage = $('map-stage');
  stage.querySelector('.city-map')?.remove();
  stage.querySelector('#map-markers')?.remove();
  const container = document.createElement('div');
  container.id = 'leaflet-map';
  stage.prepend(container);
  gtaMap = L.map(container, { crs: gtaCrs, center: gtaLatLng({ x: 0, y: 0 }), zoom: 3, minZoom: 3, maxZoom: 5, maxBounds: gtaWorldBounds, zoomControl: false, attributionControl: false, preferCanvas: true, zoomSnap: 1, zoomDelta: 1, maxBoundsViscosity: 1 });
  L.tileLayer('assets/maps/styleAtlas/{z}/{x}/{y}.jpg', { minZoom: 0, maxZoom: 5, noWrap: true, keepBuffer: 1, updateWhenIdle: true }).addTo(gtaMap);
  gtaMap.createPane('heatPane');
  gtaMap.getPane('heatPane').style.zIndex = 250;
  gtaMap.getPane('heatPane').style.pointerEvents = 'none';
  heatRenderer = L.canvas({ pane: 'heatPane', padding: .4 });
  heatLayer = L.layerGroup().addTo(gtaMap);
  callLayer = L.layerGroup().addTo(gtaMap);
  unitLayer = L.layerGroup().addTo(gtaMap);
  tacticalLayer = L.layerGroup().addTo(gtaMap);
  tacticalDraftLayer = L.layerGroup().addTo(gtaMap);
  gtaMap.on('click', event => handleTacticalMapClick(event.latlng));
}
function filteredHeatmapEvents() {
  const secondsByRange = { '30M': 1800, '1H': 3600, '6H': 21600, '24H': 86400 };
  const threshold = Math.floor(Date.now() / 1000) - secondsByRange[heatmapRange];
  return heatmapEvents.filter(event => event.createdAt >= threshold
    && (heatmapType === 'ALL' || event.type === heatmapType)
    && (heatmapPriority === 'ALL' || event.priority === heatmapPriority));
}
function heatmapClusters(events) {
  const buckets = new Map();
  const weights = { LOW: 1, MED: 1.5, HIGH: 2.25, PANIC: 3.5 };
  events.forEach(event => {
    const key = `${Math.round(event.coords.x / 360)}:${Math.round(event.coords.y / 360)}`;
    const bucket = buckets.get(key) || { x: 0, y: 0, count: 0, weight: 0 };
    bucket.x += event.coords.x;
    bucket.y += event.coords.y;
    bucket.count += 1;
    bucket.weight += Number(event.weight) || weights[event.priority] || 1;
    buckets.set(key, bucket);
  });
  const clusters = [...buckets.values()].map(bucket => ({ ...bucket, x: bucket.x / bucket.count, y: bucket.y / bucket.count }));
  const maximum = Math.max(1, ...clusters.map(cluster => cluster.weight));
  return clusters.map(cluster => ({ ...cluster, intensity: cluster.weight / maximum }));
}
function renderHeatmap() {
  if (!heatLayer) return;
  heatLayer.clearLayers();
  $('map-stage').classList.toggle('is-heatmap-active', heatmapVisible);
  const events = filteredHeatmapEvents();
  $('heatmap-event-count').textContent = events.length;
  if (!heatmapVisible) return;
  heatmapClusters(events).forEach(cluster => {
    const center = gtaLatLng(cluster);
    const color = cluster.intensity > .72 ? '#e34b54' : cluster.intensity > .4 ? '#dea94d' : '#4d96c4';
    L.circle(center, { pane: 'heatPane', renderer: heatRenderer, radius: 260 + cluster.intensity * 460, stroke: false, fillColor: color, fillOpacity: .055 + cluster.intensity * .07, interactive: false }).addTo(heatLayer);
    L.circle(center, { pane: 'heatPane', renderer: heatRenderer, radius: 100 + cluster.intensity * 220, stroke: false, fillColor: cluster.intensity > .55 ? '#f0bd58' : color, fillOpacity: .09 + cluster.intensity * .09, interactive: false }).addTo(heatLayer);
  });
}
function renderHeatmapControls() {
  $('heatmap-toggle').hidden = !heatmapAvailable;
  $('heatmap-control').hidden = !heatmapAvailable || !heatmapVisible;
  $('heatmap-toggle').classList.toggle('is-active', heatmapVisible);
  $('heatmap-toggle').setAttribute('aria-pressed', String(heatmapVisible));
  document.querySelectorAll('[data-heat-range]').forEach(button => button.classList.toggle('is-active', button.dataset.heatRange === heatmapRange));
}
function tacticalTooltip(item) {
  const style = tacticalStyles[item.type];
  return `<b>${style.label}</b><br>${item.createdBy}`;
}
function tacticalMarkerIcon() {
  return L.divIcon({ className: 'dispatch-leaflet-icon', html: '<span class="tactical-leaflet-marker"><span>+</span></span>', iconSize: [24, 24], iconAnchor: [7, 21] });
}
function renderTacticalMap() {
  if (!tacticalLayer || !tacticalDraftLayer) return;
  tacticalLayer.clearLayers();
  tacticalDraftLayer.clearLayers();
  if (tacticalOverlaysVisible) tacticalItems.forEach(item => {
    const style = tacticalStyles[item.type];
    let layer;
    if (item.type === 'MARKER') layer = L.marker(item.points[0], { icon: tacticalMarkerIcon() });
    else if (item.type === 'ZONE') layer = L.polygon(item.points, { color: style.color, weight: 2, opacity: .9, fillColor: style.color, fillOpacity: .12, interactive: true });
    else layer = L.polyline(item.points, { color: style.color, weight: 4, opacity: .85, dashArray: '9 7', interactive: true });
    layer.bindTooltip(tacticalTooltip(item), { className: 'tactical-tooltip', direction: 'top' }).addTo(tacticalLayer);
  });
  if (tacticalMode && tacticalDraftPoints.length) {
    const style = tacticalStyles[tacticalMode];
    tacticalDraftPoints.forEach(point => L.circleMarker(point, { radius: 3, color: style.color, weight: 1, fillColor: style.color, fillOpacity: 1, interactive: false }).addTo(tacticalDraftLayer));
    if (tacticalMode === 'ZONE' && tacticalDraftPoints.length > 1) L.polygon(tacticalDraftPoints, { color: style.color, weight: 2, dashArray: '5 5', fillOpacity: .06, interactive: false }).addTo(tacticalDraftLayer);
    if (tacticalMode === 'ROUTE' && tacticalDraftPoints.length > 1) L.polyline(tacticalDraftPoints, { color: style.color, weight: 3, dashArray: '7 6', interactive: false }).addTo(tacticalDraftLayer);
  }
}
function tacticalPointMinimum(type) { return type === 'ZONE' ? 3 : type === 'ROUTE' ? 2 : 1; }
function updateTacticalControls() {
  const drawing = Boolean(tacticalMode);
  $('map-stage').classList.toggle('is-tactical-drawing', drawing);
  document.querySelectorAll('[data-tactical-tool]').forEach(button => button.classList.toggle('is-active', button.dataset.tacticalTool === tacticalMode));
  $('tactical-finish').disabled = !drawing || tacticalDraftPoints.length < tacticalPointMinimum(tacticalMode);
  $('tactical-cancel').disabled = !drawing;
  $('tactical-draw-state').textContent = drawing ? `${editingTacticalId ? 'Redraw' : 'Drawing'} ${tacticalStyles[tacticalMode].label}` : 'Select a tool';
}
function beginTacticalDraw(type, itemId = null) {
  if (!dispatcher || !tacticalPermission || !tacticalStyles[type]) return;
  tacticalMode = type;
  editingTacticalId = itemId;
  tacticalDraftPoints = [];
  updateTacticalControls();
  renderTacticalMap();
  showToast(type === 'MARKER' ? 'Click the map to place the marker' : 'Click the map to add points');
}
function handleTacticalMapClick(latlng) {
  if (!tacticalMode || !dispatcher || !tacticalPermission) return;
  tacticalDraftPoints.push([latlng.lat, latlng.lng]);
  if (tacticalMode === 'MARKER') finishTacticalDraw();
  else { updateTacticalControls(); renderTacticalMap(); }
}
function finishTacticalDraw() {
  if (!tacticalMode || tacticalDraftPoints.length < tacticalPointMinimum(tacticalMode)) return;
  const existing = tacticalItems.find(item => item.id === editingTacticalId);
  if (!isBrowserPreview) {
    emit('action', {
      action: existing ? 'tacticalUpdate' : 'tacticalCreate',
      itemId: existing?.id,
      item: { type: tacticalMode, points: tacticalDraftPoints.map(point => [...point]) },
    });
    cancelTacticalDraw();
    return;
  }
  const item = existing || { id: `tactical-${Date.now()}`, type: tacticalMode, createdBy: 'DISPATCH 01', createdAt: Math.floor(Date.now() / 1000) };
  item.type = tacticalMode;
  item.points = tacticalDraftPoints.map(point => [...point]);
  if (!existing) tacticalItems.push(item);
  cancelTacticalDraw(false);
  showToast(`${tacticalStyles[item.type].label} ${existing ? 'updated' : 'shared'}`);
  renderTacticalItems();
  renderTacticalMap();
}
function cancelTacticalDraw(redraw = true) {
  tacticalMode = null;
  tacticalDraftPoints = [];
  editingTacticalId = null;
  updateTacticalControls();
  if (redraw) renderTacticalMap();
}
function deleteTacticalItem(id) {
  if (!dispatcher || !tacticalPermission) return;
  if (!isBrowserPreview) {
    emit('action', { action: 'tacticalDelete', itemId: id });
    if (editingTacticalId === id) cancelTacticalDraw(false);
    return;
  }
  tacticalItems = tacticalItems.filter(item => item.id !== id);
  if (editingTacticalId === id) cancelTacticalDraw(false);
  renderTacticalItems(); renderTacticalMap();
}
function renderTacticalItems() {
  $('tactical-overlays-toggle').hidden = false;
  $('tactical-tools-toggle').hidden = !(dispatcher && tacticalPermission);
  if (!dispatcher || !tacticalPermission) $('tactical-toolbar').hidden = true;
  $('tactical-count').textContent = tacticalItems.length;
  $('tactical-items').hidden = false;
  $('tactical-items').classList.toggle('is-hidden-overlays', !tacticalOverlaysVisible);
  $('tactical-item-list').innerHTML = tacticalItems.length ? tacticalItems.map(item => {
    const style = tacticalStyles[item.type];
    return `<div class="tactical-item" data-tactical-item="${item.id}" style="--tactical:${style.color}"><span class="tactical-item-icon"><i data-lucide="${style.icon}"></i></span><div class="tactical-item-info"><strong>${style.label}</strong><span>Created by ${item.createdBy}</span></div>${dispatcher ? `<div class="tactical-item-actions"><button type="button" data-edit-tactical="${item.id}" aria-label="Edit ${style.label}">↻</button><button type="button" data-delete-tactical="${item.id}" aria-label="Delete ${style.label}">×</button></div>` : ''}</div>`;
  }).join('') : '<div class="tactical-empty">No tactical overlays shared.</div>';
  $('tactical-item-list').querySelectorAll('[data-edit-tactical]').forEach(button => button.onclick = () => {
    const item = tacticalItems.find(entry => entry.id === button.dataset.editTactical);
    if (item) beginTacticalDraw(item.type, item.id);
  });
  $('tactical-item-list').querySelectorAll('[data-delete-tactical]').forEach(button => button.onclick = () => deleteTacticalItem(button.dataset.deleteTactical));
  renderIcons();
}
function renderMap() {
  if (!gtaMap) return;
  callLayer.clearLayers();
  unitLayer.clearLayers();
  renderHeatmap();
  visibleCalls().forEach(call => {
    if (!call.coords) return;
    const priority = priorityLabel(call.priority);
    const marker = L.marker(gtaLatLng(call.coords), { icon: incidentMarkerIcon(call, priorityColors[priority]) });
    marker.on('click', () => {
      selectedCallId = call.id;
      gtaMap.setView(gtaLatLng(call.coords), 4, { animate: true });
      renderAll();
    });
    if (call.id === selectedCallId) marker.setZIndexOffset(1000);
    marker.addTo(callLayer);
  });
  visibleUnits().forEach(unit => {
    if (!unit.coords) return;
    const marker = L.marker(gtaLatLng(unit.coords), { icon: markerIcon('leaflet-unit-marker', '#91a8b8') });
    marker.on('click', () => {
      selectedUnitId = unit.id;
      gtaMap.setView(gtaLatLng(unit.coords), 4, { animate: true });
      renderUnits(); renderDetails(); renderIcons();
    });
    marker.addTo(unitLayer);
  });
  renderTacticalMap();
}
function renderAll() { keepSelectionValid(); renderCalls(); renderUnits(); renderMap(); renderHeatmapControls(); renderTacticalItems(); renderDetails(); renderIcons(); }

document.querySelectorAll('[data-call-view]').forEach(button => button.onclick = () => {
  callView = button.dataset.callView;
  selectedCallId = null;
  renderAll();
});
$('history-search').oninput = event => { historyFilters.query = event.target.value; selectedCallId = null; renderAll(); };
$('history-priority').onchange = event => { historyFilters.priority = event.target.value; selectedCallId = null; renderAll(); };
$('history-department').onchange = event => { historyFilters.department = event.target.value; selectedCallId = null; renderAll(); };
$('history-status').onchange = event => { historyFilters.status = event.target.value; selectedCallId = null; renderAll(); };
$('history-range').onchange = event => { historyFilters.range = event.target.value; selectedCallId = null; renderAll(); };

document.querySelectorAll('#priority-filters [data-priority]').forEach(button => button.onclick = () => {
  priorityFilter = button.dataset.priority;
  document.querySelectorAll('#priority-filters .filter').forEach(item => item.classList.toggle('is-active', item === button));
  renderAll();
});
document.querySelectorAll('#department-filters [data-department]').forEach(button => button.onclick = () => {
  departmentFilter = button.dataset.department;
  document.querySelectorAll('#department-filters .filter').forEach(item => item.classList.toggle('is-active', item === button));
  renderAll();
});
$('search').oninput = event => { query = event.target.value; renderAll(); };
window.addEventListener('keydown', event => {
  if (event.key === '/' && document.activeElement !== $('search')) { event.preventDefault(); $('search').focus(); }
  if (event.key === 'Escape') {
    event.preventDefault();
    if (!$('patrol-modal').hidden) closePatrolForm();
    else if (!$('dispatcher-note-modal').hidden) closeNoteForm();
    else if (!$('dispatcher-modal').hidden) closeCallForm();
    else if (tacticalMode) cancelTacticalDraw();
    else if (!$('tactical-toolbar').hidden) {
      $('tactical-toolbar').hidden = true;
      $('tactical-tools-toggle').classList.remove('is-active');
      $('tactical-tools-toggle').setAttribute('aria-expanded', 'false');
    }
    else emit('close');
  }
});
$('assign-action').onclick = () => {
  const call = selectedCall(); const unit = selectedUnit();
  if (call && unit) emit('action', { action: 'assign', callId: call.id, unitId: unit.id });
};
$('focus-call-action').onclick = () => {
  const call = selectedCall();
  if (call?.coords) {
    gtaMap.setView(gtaLatLng(call.coords), 4, { animate: true });
    showToast(`Focused ${call.code}`);
  }
};
$('broadcast-call-action').onclick = () => {
  const call = selectedCall();
  if (isBrowserPreview && dispatcher && call) showToast(`${call.code} broadcast to ${call.department || service.department}`);
};
function setPreviewManagementStatus(statusButton) {
  const call = selectedCall();
  if (!isBrowserPreview || !dispatcher || !call || isHistoricalCall(call)) return;
  call.metadata ||= {};
  call.metadata.managementStatus = statusButton.dataset.managementStatus;
  addPreviewTimeline(call, `Call status changed to ${statusButton.textContent.trim()}`);
  renderAll();
}
function resolvePreviewCall(resolveButton) {
  const call = selectedCall();
  if (!dispatcher || !call || isHistoricalCall(call)) return;
  if (!isBrowserPreview) {
    emit('action', { action: 'dispatcherResolveAs', callId: call.id, result: resolveButton.dataset.resolveAs });
    return;
  }
  captureUnitHistory(call);
  restorePreviewCallWave(call);
  call.metadata ||= {};
  call.metadata.resolveAs = resolveButton.dataset.resolveAs;
  call.status = 'RESOLVED';
  call.closedAt = Math.floor(Date.now() / 1000);
  for (const reference of call.assignedUnits || []) {
    const assigned = selectableUnits().find(item => item.id === reference.id);
    if (assigned) setSelectableStatus(assigned, 'AVAILABLE');
  }
  call.assignedUnits = [];
  call.respondingUnits = [];
  addPreviewTimeline(call, `Resolved as ${resolveButton.textContent.trim()}`);
  callView = 'HISTORY';
  renderAll();
}
['status-new-action', 'status-assigned-action', 'status-on-scene-action', 'status-hold-action']
  .forEach(id => { $(id).onclick = () => setPreviewManagementStatus($(id)); });
['resolve-cleared-action', 'resolve-unfounded-action', 'resolve-no-units-action']
  .forEach(id => { $(id).onclick = () => resolvePreviewCall($(id)); });
function openPatrolForm() {
  if (!dispatcher) return;
  const candidates = availablePatrolCandidates();
  const form = $('patrol-form');
  form.reset();
  $('patrol-leader').innerHTML = candidates.map(unit => `<option value="${unit.id}">${unitName(unit)} · ${unit.name}</option>`).join('');
  $('patrol-member-options').innerHTML = candidates.map(unit => `<label class="patrol-member-option"><input type="checkbox" name="memberIds" value="${unit.id}"><b>${unitName(unit)}</b><span>${unit.name}</span></label>`).join('');
  $('patrol-form-hint').classList.remove('is-error');
  $('patrol-form-hint').textContent = candidates.length >= 2 ? 'Select at least two officers. The leader is included automatically.' : 'At least two available ungrouped officers are required.';
  form.querySelector('button[type="submit"]').disabled = candidates.length < 2;
  $('patrol-modal').hidden = false;
  syncPatrolLeaderSelection();
}
function closePatrolForm() { $('patrol-modal').hidden = true; }
function syncPatrolLeaderSelection() {
  const leaderId = $('patrol-leader').value;
  $('patrol-member-options').querySelectorAll('input').forEach(input => {
    input.disabled = input.value === leaderId;
    if (input.disabled) input.checked = true;
  });
}
function createPatrolFromForm(form) {
  const data = new FormData(form);
  const leaderId = String(data.get('leaderId') || '');
  const memberIds = [...new Set([leaderId, ...data.getAll('memberIds').map(String)])].filter(Boolean);
  const hint = $('patrol-form-hint');
  if (memberIds.length < 2) {
    hint.textContent = 'Select at least two officers.';
    hint.classList.add('is-error');
    return false;
  }
  const callsign = String(data.get('callsign') || '').trim();
  if (!callsign) {
    hint.textContent = 'Enter a patrol callsign.';
    hint.classList.add('is-error');
    return false;
  }
  if (!isBrowserPreview) {
    emit('action', { action: 'patrolCreate', patrol: { callsign, leaderId, memberIds } });
    closePatrolForm();
    return true;
  }
  patrolGroups.push(syncPatrolGroup({ id: `patrol-${Date.now()}`, callsign, leaderId, memberIds, status: 'AVAILABLE', currentCallId: null, isGroup: true }));
  closePatrolForm();
  renderAll();
  return true;
}
$('create-patrol-action').onclick = openPatrolForm;
$('patrol-form-close').onclick = closePatrolForm;
$('patrol-form-cancel').onclick = closePatrolForm;
$('patrol-leader').onchange = syncPatrolLeaderSelection;
$('patrol-form').onsubmit = event => { event.preventDefault(); createPatrolFromForm(event.currentTarget); };
function openCallForm(call = null) {
  editingCallId = call?.id || null;
  const form = $('dispatcher-form');
  form.reset();
  $('dispatcher-form-title').textContent = call ? 'Edit call' : 'Create call';
  if (call) {
    for (const name of ['code', 'title', 'description', 'priority', 'department', 'street', 'area']) form.elements[name].value = call[name] || '';
    form.elements.x.value = call.coords?.x ?? '';
    form.elements.y.value = call.coords?.y ?? '';
    form.elements.z.value = call.coords?.z ?? '';
  } else form.elements.department.value = service.department || '';
  $('dispatcher-modal').hidden = false;
  form.elements.code.focus();
}
function closeCallForm() { $('dispatcher-modal').hidden = true; editingCallId = null; }
$('create-call-action').onclick = () => openCallForm();
$('full-dispatch-close').onclick = () => emit('close');
document.querySelector('.workspace')?.addEventListener('transitionend', event => {
  if (event.propertyName === 'grid-template-rows') gtaMap?.invalidateSize(false);
});
$('dispatcher-role-action').onclick = () => {
  if (!dispatcher && !canBecomeDispatcher) return;
  const joining = !dispatcher;
  if (!isBrowserPreview) {
    emit('action', { action: 'setDispatcherSession', enabled: joining });
    return;
  }
  dispatcher = joining;
  historyAvailable = joining;
  const self = units.find(unit => unit.id === 'unit-101');
  if (self) self.isDispatcher = joining;
  $('create-call-action').hidden = !dispatcher;
  renderDispatcherRole();
  renderAll();
};
$('edit-call-action').onclick = () => { const call = selectedCall(); if (call) openCallForm(call); };
$('resolve-call-action').onclick = () => { const call = selectedCall(); if (call) emit('action', { action: 'dispatcherResolve', callId: call.id }); };
$('reopen-call-action').onclick = () => { const call = selectedCall(); if (call) emit('action', { action: 'dispatcherReopen', callId: call.id }); };
$('note-call-action').onclick = () => {
  if (!selectedCall()) return;
  $('dispatcher-note-form').reset();
  $('dispatcher-note-modal').hidden = false;
  $('dispatcher-note-form').elements.note.focus();
};
$('ack-panic-action').onclick = () => { const call = selectedCall(); if (call) emit('action', { action: 'dispatcherAcknowledgePanic', callId: call.id }); };
$('dispatcher-form-close').onclick = closeCallForm;
$('dispatcher-form-cancel').onclick = closeCallForm;
$('dispatcher-note-close').onclick = closeNoteForm;
$('dispatcher-note-cancel').onclick = closeNoteForm;
function closeNoteForm() { $('dispatcher-note-modal').hidden = true; }
$('dispatcher-note-form').onsubmit = event => {
  event.preventDefault();
  const call = selectedCall();
  const note = event.currentTarget.elements.note.value.trim();
  if (call && note) emit('action', { action: 'dispatcherNote', callId: call.id, note });
  closeNoteForm();
};
$('dispatcher-form').onsubmit = event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const payload = { ...values, coords: { x: Number(values.x), y: Number(values.y), z: Number(values.z) } };
  delete payload.x; delete payload.y; delete payload.z;
  emit('action', editingCallId ? { action: 'dispatcherEdit', callId: editingCallId, updates: payload } : { action: 'dispatcherCreate', call: payload });
  closeCallForm();
};
$('center-map-action').onclick = () => {
  const call = selectedCall();
  if (call?.coords) { gtaMap.setView(gtaLatLng(call.coords), 4, { animate: true }); showToast(`Centered on ${call.code}`); }
};
$('heatmap-toggle').onclick = () => {
  if (!heatmapAvailable) return;
  heatmapVisible = !heatmapVisible;
  renderHeatmapControls(); renderHeatmap();
  showToast(`Activity heatmap ${heatmapVisible ? 'enabled' : 'disabled'}`);
};
document.querySelectorAll('[data-heat-range]').forEach(button => button.onclick = () => {
  heatmapRange = button.dataset.heatRange;
  renderHeatmapControls(); renderHeatmap();
});
$('heatmap-type').onchange = event => { heatmapType = event.target.value; renderHeatmap(); };
$('heatmap-priority').onchange = event => { heatmapPriority = event.target.value; renderHeatmap(); };
$('tactical-overlays-toggle').onclick = () => {
  tacticalOverlaysVisible = !tacticalOverlaysVisible;
  if (!isBrowserPreview) emit('action', { action: 'tacticalVisibility', visible: tacticalOverlaysVisible });
  $('tactical-overlays-toggle').classList.toggle('is-active', tacticalOverlaysVisible);
  $('tactical-overlays-toggle').setAttribute('aria-pressed', String(tacticalOverlaysVisible));
  renderTacticalItems(); renderTacticalMap();
  showToast(`Tactical overlays ${tacticalOverlaysVisible ? 'visible' : 'hidden'}`);
};
$('tactical-tools-toggle').onclick = () => {
  if (!dispatcher || !tacticalPermission) return;
  const opening = $('tactical-toolbar').hidden;
  $('tactical-toolbar').hidden = !opening;
  $('tactical-tools-toggle').classList.toggle('is-active', opening);
  $('tactical-tools-toggle').setAttribute('aria-expanded', String(opening));
  if (!opening) cancelTacticalDraw();
};
document.querySelectorAll('[data-tactical-tool]').forEach(button => button.onclick = () => beginTacticalDraw(button.dataset.tacticalTool));
$('tactical-finish').onclick = finishTacticalDraw;
$('tactical-cancel').onclick = () => cancelTacticalDraw();
$('tactical-clear').onclick = () => {
  if (!dispatcher || !tacticalPermission || !tacticalItems.length) return;
  if (!isBrowserPreview) {
    emit('action', { action: 'tacticalClear' });
    cancelTacticalDraw(false);
    return;
  }
  tacticalItems = [];
  cancelTacticalDraw(false);
  renderTacticalItems(); renderTacticalMap();
  showToast('Tactical drawings cleared');
};
window.addEventListener('message', event => {
  const message = event.data || {};
  if (message.channel !== 'nmsh_dispatch:full') return;
  if (message.type === 'resetSelection') {
    selectedCallId = null;
    selectedUnitId = null;
    renderAll();
    return;
  }
  if (message.type !== 'state') return;
  calls = Array.isArray(message.state?.calls) ? message.state.calls : [];
  units = Array.isArray(message.state?.units) ? message.state.units : [];
  patrolGroups = Array.isArray(message.state?.patrolGroups) ? message.state.patrolGroups : [];
  tacChannels = Array.isArray(message.state?.tacChannels) ? message.state.tacChannels : [];
  tacticalItems = Array.isArray(message.state?.tacticalItems) ? message.state.tacticalItems : [];
  heatmapEvents = Array.isArray(message.state?.heatmapEvents) ? message.state.heatmapEvents : [];
  service = typeof message.state?.service === 'object' && message.state.service ? { ...service, ...message.state.service } : service;
  waveRange = typeof message.state?.waves === 'object' && message.state.waves ? { ...waveRange, ...message.state.waves } : waveRange;
  dispatcher = message.state?.permissions?.dispatcher === true;
  canBecomeDispatcher = message.state?.permissions?.canBecomeDispatcher === true;
  heatmapAvailable = message.state?.permissions?.heatmap === true;
  tacticalPermission = message.state?.permissions?.tactical === true;
  tacticalOverlaysVisible = message.state?.permissions?.tacticalOverlaysVisible !== false;
  historyAvailable = message.state?.permissions?.history === true;
  joinedTacChannelId = message.state?.permissions?.joinedTacChannelId || null;
  $('create-call-action').hidden = !dispatcher;
  renderDispatcherRole();
  renderServiceIdentity();
  requestAnimationFrame(() => gtaMap?.invalidateSize(false));
  renderAll();
});

if (isBrowserPreview) {
  const now = Math.floor(Date.now() / 1000);
  dispatcher = previewIsDispatcher;
  canBecomeDispatcher = true;
  units = [
    { id: 'unit-101', callsign: '101', name: 'Nmsh Dev', department: 'LSPD', job: 'police', status: 'AVAILABLE', isDispatcher: dispatcher, coords: { x: 425.1, y: -979.5, z: 30.7 }, heading: 88, vehicle: { label: 'Police Cruiser' }, radioChannel: '1', currentCallId: null },
    { id: 'unit-102', callsign: '102', name: 'James Carter', department: 'LSPD', job: 'police', status: 'ASSIGNED', coords: { x: 188.2, y: -1019.4, z: 29.3 }, heading: 180, vehicle: { label: 'Police Buffalo' }, radioChannel: '1', currentCallId: 'call-store' },
    { id: 'unit-103', callsign: '103', name: 'Mason Cole', department: 'LSPD', job: 'police', status: 'AVAILABLE', coords: { x: 439.7, y: -987.1, z: 30.7 }, heading: 92, vehicle: { label: 'Police Cruiser' }, radioChannel: '1', currentCallId: null },
    { id: 'unit-104', callsign: '104', name: 'Nora Hayes', department: 'LSPD', job: 'police', status: 'AVAILABLE', coords: { x: 375.4, y: -1612.2, z: 29.3 }, heading: 12, vehicle: { label: 'Police Scout' }, radioChannel: '1', currentCallId: null },
    { id: 'unit-105', callsign: '105', name: 'Eli Brooks', department: 'LSPD', job: 'police', status: 'AVAILABLE', coords: { x: -553.8, y: -174.2, z: 38.2 }, heading: 278, vehicle: { label: 'Police Cruiser' }, radioChannel: '1', currentCallId: null },
    { id: 'unit-106', callsign: '106', name: 'Olivia Hart', department: 'LSPD', job: 'police', status: 'AVAILABLE', coords: { x: -304.6, y: -829.4, z: 32.4 }, heading: 162, vehicle: { label: 'Police Cruiser' }, radioChannel: '1', currentCallId: null },
    { id: 'unit-201', callsign: 'MED-2', name: 'Sarah Reed', department: 'EMS', job: 'ambulance', status: 'RESPONDING', coords: { x: 303.8, y: -1438.7, z: 29.8 }, heading: 14, vehicle: { label: 'Ambulance' }, radioChannel: '2', currentCallId: 'call-medical' },
    { id: 'unit-301', callsign: 'AIR-1', name: 'Alex Stone', department: 'LSPD', job: 'police', status: 'ON_SCENE', coords: { x: -1608.4, y: -1045.3, z: 13.0 }, heading: 270, vehicle: { label: 'Police Maverick' }, radioChannel: '1', currentCallId: 'call-panic' },
  ];
  calls = [
    { id: 'call-panic', code: '10-99', title: 'Officer Panic', description: 'Emergency activation received from an officer near Del Perro Pier.', priority: 'PANIC', department: 'LSPD', coords: { x: -1608.4, y: -1045.3, z: 13.0 }, street: 'Red Desert Ave', area: 'Del Perro', createdAt: now - 18, status: 'ACTIVE', assignedUnits: [{ id: 'unit-301', callsign: 'AIR-1', name: 'Alex Stone', status: 'ON_SCENE' }], respondingUnits: [{ id: 'unit-301', callsign: 'AIR-1', name: 'Alex Stone', status: 'ON_SCENE' }], metadata: { panic: true, panicAcknowledged: false, notes: [], timeline: [{ at: now - 18, text: 'Panic alert received' }, { at: now - 8, text: 'AIR-1 on scene' }] } },
    { id: 'call-store', code: '10-15', title: 'Store Robbery', description: 'A person is robbing a convenience store and may be armed.', priority: 'HIGH', department: 'LSPD', coords: { x: 24.5, y: -1346.7, z: 29.5 }, street: 'Innocence Blvd', area: 'Strawberry', createdAt: now - 74, status: 'NEW', assignedUnits: [{ id: 'unit-102', callsign: '102', name: 'James Carter', status: 'ASSIGNED' }], respondingUnits: [], metadata: { panic: false, notes: [], timeline: [{ at: now - 74, text: 'Call created' }, { at: now - 42, text: '102 assigned' }] } },
    { id: 'call-medical', code: '10-52', title: 'Medical Emergency', description: 'A person is unconscious near the main entrance. Bystanders are providing aid.', priority: 'MED', department: 'EMS', coords: { x: 307.3, y: -595.2, z: 43.3 }, street: 'Elgin Ave', area: 'Pillbox Hill', createdAt: now - 132, status: 'ACTIVE', assignedUnits: [{ id: 'unit-201', callsign: 'MED-2', name: 'Sarah Reed', status: 'RESPONDING' }], respondingUnits: [{ id: 'unit-201', callsign: 'MED-2', name: 'Sarah Reed', status: 'RESPONDING' }], metadata: { panic: false, notes: [], timeline: [{ at: now - 132, text: 'Call created' }, { at: now - 39, text: 'MED-2 responding' }] } },
    { id: 'call-vehicle', code: '10-11', title: 'Stolen Vehicle', description: 'A stolen vehicle has been reported near Vespucci Boulevard.', priority: 'LOW', department: 'LSPD', coords: { x: -1154.4, y: -739.4, z: 19.9 }, street: 'Vespucci Blvd', area: 'Vespucci', createdAt: now - 305, status: 'NEW', assignedUnits: [], respondingUnits: [], metadata: { panic: false, notes: [], timeline: [{ at: now - 305, text: 'Call created' }] } },
    { id: 'call-resolved', code: '10-10', title: 'Suspicious Activity', description: 'Previous suspicious activity report; scene was checked and cleared.', priority: 'LOW', department: 'LSPD', coords: { x: 1152.6, y: -1527.4, z: 34.8 }, street: 'Capital Blvd', area: 'La Mesa', createdAt: now - 620, closedAt: now - 480, status: 'RESOLVED', assignedUnits: [], respondingUnits: [], metadata: { panic: false, notes: [{ at: now - 500, text: 'No suspect located' }], unitHistory: [{ id: 'unit-104', callsign: '104', name: 'Nora Hayes', outcome: 'ON_SCENE' }], timeline: [{ at: now - 620, text: 'Call created' }, { at: now - 570, text: '104 assigned' }, { at: now - 525, text: '104 responding' }, { at: now - 500, text: '104 on scene' }, { at: now - 480, text: 'Dispatcher resolved call' }] } },
    { id: 'history-bank', code: '10-90', title: 'Bank Robbery', description: 'Alarm activation at Fleeca Bank. Suspects fled before units secured the building.', priority: 'HIGH', department: 'LSPD', coords: { x: 149.8, y: -1040.5, z: 29.4 }, street: 'Vespucci Blvd', area: 'Legion Square', createdAt: now - 12600, closedAt: now - 10800, archivedAt: now - 10200, status: 'ARCHIVED', assignedUnits: [], respondingUnits: [], metadata: { panic: false, notes: [{ at: now - 11000, text: 'Scene transferred to investigations' }], unitHistory: [{ id: 'patrol-adam-1', callsign: 'ADAM-1', name: '2 officer patrol', outcome: 'ON_SCENE', isGroup: true }, { id: 'unit-301', callsign: 'AIR-1', name: 'Alex Stone', outcome: 'RESPONDING' }], timeline: [{ at: now - 12600, text: 'Silent alarm received' }, { at: now - 12520, text: 'ADAM-1 assigned' }, { at: now - 12380, text: 'AIR-1 responding' }, { at: now - 11800, text: 'ADAM-1 on scene' }, { at: now - 10800, text: 'Call resolved' }, { at: now - 10200, text: 'Call archived' }] } },
    { id: 'history-medical', code: '10-52', title: 'Medical Emergency', description: 'Patient treated after a traffic collision and transported to Pillbox Medical.', priority: 'MED', department: 'EMS', coords: { x: -525.2, y: -264.4, z: 35.4 }, street: 'San Andreas Ave', area: 'Little Seoul', createdAt: now - 183600, closedAt: now - 181200, status: 'RESOLVED', assignedUnits: [], respondingUnits: [], metadata: { panic: false, notes: [], unitHistory: [{ id: 'unit-201', callsign: 'MED-2', name: 'Sarah Reed', outcome: 'ON_SCENE' }], timeline: [{ at: now - 183600, text: 'Medical call received' }, { at: now - 183510, text: 'MED-2 responding' }, { at: now - 182900, text: 'MED-2 on scene' }, { at: now - 181200, text: 'Patient transported; call resolved' }] } },
    { id: 'history-panic', code: '10-99', title: 'Officer Panic', description: 'Officer panic activation during a vehicle stop. Additional units secured the scene.', priority: 'PANIC', department: 'LSPD', coords: { x: 824.6, y: -1290.8, z: 28.2 }, street: 'Popular St', area: 'La Mesa', createdAt: now - 891000, closedAt: now - 888900, archivedAt: now - 864000, status: 'ARCHIVED', assignedUnits: [], respondingUnits: [], metadata: { panic: true, panicAcknowledged: true, notes: [], unitHistory: [{ id: 'unit-102', callsign: '102', name: 'James Carter', outcome: 'ON_SCENE' }, { id: 'unit-301', callsign: 'AIR-1', name: 'Alex Stone', outcome: 'ON_SCENE' }], timeline: [{ at: now - 891000, text: 'Panic alert received' }, { at: now - 890940, text: 'Dispatcher acknowledged panic' }, { at: now - 890760, text: '102 and AIR-1 responding' }, { at: now - 889800, text: 'Scene secure' }, { at: now - 888900, text: 'Call resolved' }, { at: now - 864000, text: 'Call archived' }] } },
  ];
  calls.find(call => call.id === 'call-panic').metadata.wave = 3;
  calls.find(call => call.id === 'call-store').metadata.wave = 4;
  calls.find(call => call.id === 'call-medical').metadata.wave = 6;
  const incidentType = call => /medical/i.test(call.title) ? 'MEDICAL' : /robbery/i.test(call.title) ? 'ROBBERY' : /vehicle/i.test(call.title) ? 'VEHICLE' : 'VIOLENCE';
  heatmapEvents = [
    ...calls.filter(call => call.coords && now - call.createdAt <= 86400).map(call => ({ coords: call.coords, createdAt: call.createdAt, priority: priorityLabel(call.priority), type: incidentType(call) })),
    { coords: { x: 80, y: -1065 }, createdAt: now - 240, priority: 'HIGH', type: 'ROBBERY' },
    { coords: { x: 135, y: -1110 }, createdAt: now - 420, priority: 'MED', type: 'ROBBERY' },
    { coords: { x: -35, y: -995 }, createdAt: now - 690, priority: 'PANIC', type: 'VIOLENCE' },
    { coords: { x: 245, y: -1180 }, createdAt: now - 920, priority: 'HIGH', type: 'VIOLENCE' },
    { coords: { x: -490, y: -310 }, createdAt: now - 1180, priority: 'MED', type: 'MEDICAL' },
    { coords: { x: -620, y: -210 }, createdAt: now - 1580, priority: 'LOW', type: 'VEHICLE' },
    { coords: { x: 880, y: -1320 }, createdAt: now - 2200, priority: 'HIGH', type: 'VIOLENCE' },
    { coords: { x: 720, y: -1210 }, createdAt: now - 3100, priority: 'MED', type: 'VEHICLE' },
    { coords: { x: -1180, y: -720 }, createdAt: now - 5100, priority: 'LOW', type: 'VEHICLE' },
    { coords: { x: -1250, y: -620 }, createdAt: now - 7300, priority: 'MED', type: 'ROBBERY' },
    { coords: { x: 1180, y: -1510 }, createdAt: now - 9800, priority: 'HIGH', type: 'ROBBERY' },
    { coords: { x: 1090, y: -1430 }, createdAt: now - 12600, priority: 'MED', type: 'VIOLENCE' },
    { coords: { x: 305, y: -590 }, createdAt: now - 17200, priority: 'MED', type: 'MEDICAL' },
    { coords: { x: -330, y: -1450 }, createdAt: now - 24800, priority: 'LOW', type: 'VEHICLE' },
    { coords: { x: -1080, y: -1650 }, createdAt: now - 36400, priority: 'HIGH', type: 'ROBBERY' },
    { coords: { x: 1280, y: -1710 }, createdAt: now - 62800, priority: 'PANIC', type: 'VIOLENCE' },
  ];
  patrolGroups = [syncPatrolGroup({ id: 'patrol-adam-1', callsign: 'ADAM-1', leaderId: 'unit-101', memberIds: ['unit-101', 'unit-103'], status: 'AVAILABLE', currentCallId: null, isGroup: true })];
  tacChannels = [
    { id: 'tac-1', name: 'TAC-1', label: 'Priority Operations', department: 'LSPD', status: 'OPEN', callId: 'call-store', memberIds: ['patrol-adam-1', 'unit-102'] },
    { id: 'tac-2', name: 'TAC-2', label: 'Citywide Coordination', department: 'JOINT', status: 'OPEN', callId: null, memberIds: [] },
  ];
  calls.find(call => call.id === 'call-store').tacChannelId = 'tac-1';
  setSelectableTac(selectableUnits().find(unit => unit.id === 'patrol-adam-1'), 'tac-1');
  setSelectableTac(selectableUnits().find(unit => unit.id === 'unit-102'), 'tac-1');
  expandedTacChannels.add('tac-1');
  tacticalItems = [
    { id: 'tactical-command', type: 'MARKER', points: [[-1040.5, 149.8]], createdBy: 'DISPATCH 01', createdAt: now - 320 },
    { id: 'tactical-perimeter', type: 'ZONE', points: [[-1017, 100], [-1018, 205], [-1083, 225], [-1102, 116]], createdBy: 'ADAM-1', createdAt: now - 240 },
    { id: 'tactical-roadblock', type: 'ROUTE', points: [[-1125, 32], [-1168, 125], [-1196, 238]], createdBy: 'DISPATCH 01', createdAt: now - 110 },
  ];
  $('create-call-action').hidden = !dispatcher;
}

initializeGtaMap();
renderServiceIdentity();
renderDispatcherRole();
renderAll();
emit('ready');
