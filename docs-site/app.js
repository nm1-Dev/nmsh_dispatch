const code = (value) => `<div class="code-block"><button class="copy-code" type="button">Copy</button><code>${value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></div>`;
const badge = (label, tone = 'blue') => `<span class="badge ${tone}">${label}</span>`;
const table = (headers, rows) => `<div class="table-wrap"><table class="docs-table"><thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const steps = (items) => `<div class="steps">${items.map((item, index) => `<div class="step"><span class="step-number">${index + 1}</span><div><h4>${item[0]}</h4><div class="step-copy">${item[1]}</div></div></div>`).join('')}</div>`;
const callout = (title, body, tone = '') => `<div class="callout ${tone}"><div><strong>${title}</strong><br>${body}</div></div>`;

const pages = {
  overview: {
    group: 'Start here', label: 'Overview', title: 'Dispatch, with a clear signal.',
    intro: 'NMSH Dispatch is a server-authoritative emergency communications layer for FiveM. It keeps the Small HUD fast during a scene, while Full Dispatch gives supervisors a shared operational view.',
    render: () => `
      <div class="hero-eyebrow">NMSH / DISPATCH DOCUMENTATION</div>
      <h1>Every call.<br><span style="color:var(--blue-soft)">One source of truth.</span></h1>
      <p class="lead">A compact alert HUD and a full operations console for Qbox and QBCore servers. Calls, units, assignments, waves and history stay synchronized on the server.</p>
      <div class="hero-actions"><a class="button primary" href="#/getting-started">Get started <span>→</span></a><a class="button ghost" href="#/integration">Open API reference <span>↗</span></a></div>
      <div class="stats-row"><div class="stat-card"><span class="stat-value">Qbox</span><span class="stat-label">Native bridge</span></div><div class="stat-card"><span class="stat-value">QBCore</span><span class="stat-label">Compatible</span></div><div class="stat-card"><span class="stat-value">0 DB</span><span class="stat-label">Memory-first core</span></div></div>
      <div class="feature-grid">
        <a class="feature-card" href="#/small-hud"><span class="feature-icon">◈</span><h3>Small HUD</h3><p>One alert at a time, keyboard-first navigation, response waypoint and a saved position.</p></a>
        <a class="feature-card" href="#/full-dispatch"><span class="feature-icon">⌁</span><h3>Full Dispatch</h3><p>A shared calls, units and map workspace for officers and temporary dispatchers.</p></a>
        <a class="feature-card" href="#/calls"><span class="feature-icon">!</span><h3>Call Core</h3><p>NEW, ACTIVE, RESOLVED and ARCHIVED calls with timelines and unit history.</p></a>
        <a class="feature-card" href="#/integration"><span class="feature-icon">&lt;/&gt;</span><h3>Simple integration</h3><p>One CreateDispatch export for ready-to-use alerts, plus a canonical server API.</p></a>
      </div>
      ${callout('Built for real servers.', 'The browser preview uses isolated mock data. FiveM starts empty and waits for authoritative state from Lua.', 'warning')}
      <h2 id="principles">Design principles</h2><div class="prose"><p><strong>Signal over noise.</strong> The HUD stays compact. Details only appear when the call or edit mode needs them.</p><p><strong>Server decides.</strong> Assignment, permissions, status transitions and cleanup are validated by the server.</p><p><strong>Extend without rewrites.</strong> A dispatch from any resource can use the same payload shape and the same predefined presets.</p></div>`
  },
  'getting-started': {
    group: 'Start here', label: 'Getting started', title: 'Install in a few deliberate steps.',
    intro: 'Keep the resource below your framework, configure the departments you want to receive alerts, then start with the browser preview before testing in FiveM.',
    render: () => `
      <div class="hero-eyebrow">START HERE</div><h1>Getting started</h1><p class="lede">NMSH Dispatch is a standalone resource folder. It does not require a database, pma-voice or an MDT to boot.</p>
      <h2 id="requirements">Requirements</h2>${table(['Requirement','Notes'],[['FiveM artifact','Use a current artifact that supports Cfx NUI and the framework events you run.'],['Qbox or QBCore','Set <code>Config.Framework = \'auto\'</code> to prefer Qbox when both are available.'],['Optional: pma-voice','Wave state works internally without it; pma-voice adds real channel changes.'],['OneSync','Recommended when you want server-side player coordinates and street labels.']])}
      <h2 id="install">Install</h2>${steps([['Copy the resource','Place <code>nmsh_dispatch</code> under your resources folder. Keep the folder name unchanged so exports resolve.'],['Start the framework first','In <code>server.cfg</code>, start Qbox or QBCore before the dispatch resource.'],['Ensure the resource',`Add ${code('ensure qbx_core\nensure nmsh_dispatch')} to your server configuration.`],['Configure departments','Edit <code>Config.Departments</code> and keep only the jobs your server uses.'],['Restart and validate','Use the browser preview for UI checks, then join on duty. The resource should begin with no mock calls or units.']])}
      ${callout('Load order matters.', 'Framework data is read during player load and job updates. Starting dispatch before the framework can leave a unit unregistered until the next lifecycle event.')}
      <h2 id="preview">Browser preview</h2><p class="prose">From the resource folder, install dependencies and run the Vite preview. The query string selects a safe mock role:</p>${code('npm install\nnpm run dev\n\n# browser preview examples\nhttp://127.0.0.1:5173/frontend/index.html\nhttp://127.0.0.1:5173/frontend/full-dispatch.html?role=dispatcher\nhttp://127.0.0.1:5173/frontend/full-dispatch.html?role=officer')}`
  },
  configuration: {
    group: 'Configure', label: 'Configuration', title: 'Make the important decisions in config.lua.',
    intro: 'The resource keeps server policy in one place: recipients, dispatcher sessions, response behavior, waves, sounds, map blips and predefined calls.',
    render: () => `
      <div class="hero-eyebrow">CONFIGURE</div><h1>Configuration</h1><p class="lede">Edit the shared config, restart the resource, and keep per-call changes in the predefined dispatch table where possible.</p>
      <h2 id="framework">Framework and delivery</h2>${code("Config.Framework = 'auto'\nConfig.RequireOnDuty = true\nConfig.DefaultRecipientJobs = {\n    police = true,\n    ambulance = true,\n    mechanic = true,\n}")}${table(['Key','What it controls'],[['<code>Config.Framework</code>','<code>auto</code>, <code>qbox</code> or <code>qbcore</code>. Auto prefers qbx_core when available.'],['<code>Config.RequireOnDuty</code>','Only on-duty configured jobs register as units and receive alerts.'],['<code>Config.Departments</code>','Maps a job to the visible department, channel, theme, icon and colors.'],['<code>Config.DefaultRecipientJobs</code>','Recipients used when a call does not declare <code>job</code>, <code>jobs</code> or <code>targetJobs</code>.']])}
      <h2 id="dispatcher">Dispatcher sessions</h2>${code("Config.Dispatcher = {\n    enabled = true,\n    allowedJobs = { police = true, ambulance = true, mechanic = true },\n    AllowSelfJoin = true,\n    MaxDispatchers = 0, -- 0 = unlimited\n    forceUnitStatus = false,\n}")}${callout('Temporary by design.', 'Dispatcher is a server-authoritative session role. It is not granted by grade and is cleared on disconnect, off-duty or an invalid job.')}
      <h2 id="behavior">Panel, response and waves</h2>${code("Config.Panel = { showByDefault = true, toggleCommand = 'nmshDispatchToggle', defaultToggleKey = 'K' }\nConfig.FullDispatch = { command = 'nmshFullDispatch', defaultKey = 'F6' }\nConfig.Cursor = { command = 'dispatchcursor', defaultKey = 'F9' }\nConfig.Respond = { command = 'policealertsRespond', defaultKey = 'G' }\n\nConfig.AutoWaypoint = true\nConfig.AutoOnScene = true\nConfig.OnSceneRadius = 40.0\n\nConfig.Waves = { first = 3, last = 10 }")}
      <h2 id="alerts">Alert lifetime, sound and blips</h2><p class="prose">Call Core never auto-expires an active call. The following controls affect only the local HUD notification or its map blip.</p>${code("Config.AlertExpiration = { enabled = true, defaultSeconds = 180, minimumSeconds = 30, maximumSeconds = 3600 }\nConfig.Blips = { enabled = true, durationSeconds = 0, sprite = 161, scale = 0.8, colour = 1, flashes = true }\nConfig.Sounds = { enabled = true, cooldown = 250, priorities = {...}, panic = {...} }")}`
  },
  calls: {
    group: 'Core systems', label: 'Calls & Call Management', title: 'Calls stay active until someone resolves them.',
    intro: 'Every alert becomes a canonical server call. The Small HUD and Full Dispatch read the same state, so the response story never forks between interfaces.',
    render: () => `
      <div class="hero-eyebrow">CORE SYSTEMS</div><h1>Calls &amp; Call Management</h1><p class="lede">Create a call from any resource, assign units, move it through the lifecycle, and preserve its timeline in memory for the current session.</p>
      <h2 id="shape">Canonical call shape</h2>${code("{\n  id, code, title, description, priority, department,\n  coords, street, area, createdAt, status,\n  assignedUnits, respondingUnits, metadata\n}")}${table(['Field','Accepted values'],[['<code>status</code>','<code>NEW</code>, <code>ACTIVE</code>, <code>RESOLVED</code>, <code>ARCHIVED</code>.'],['<code>priority</code>','<code>low</code>, <code>med</code>, <code>high</code>, <code>panic</code> (numeric 1–3 is normalized).'],['<code>coords</code>','A GTA <code>vector3</code> or an object with <code>x</code>, <code>y</code>, <code>z</code>.'],['<code>metadata</code>','Details, timeline, wave, TAC and integration payloads that do not belong in the title.']])}
      <h2 id="lifecycle">Lifecycle</h2>${steps([['NEW','The call is created and delivered to eligible on-duty departments.'],['ACTIVE','Units can be assigned and responding; Full Dispatch may set management status.'],['RESOLVED','Cleared, Unfounded or No Units records the outcome and moves the call toward History.'],['ARCHIVED','The call is retained in in-memory history for dispatchers and heatmap data.']])}
      ${callout('No automatic deletion.', 'HUD notification expiry and blip expiry are visual conveniences only. They never remove the underlying call or its history.')}
      <h2 id="management">Call Management actions</h2><p class="prose">Dispatchers can edit details, change priority, assign or unassign units, add notes, acknowledge panic, choose a wave, resolve outcomes and reopen an archived call. Officers can respond to their own assignment; dispatchers do not force <code>RESPONDING</code> or <code>ON_SCENE</code> when <code>forceUnitStatus = false</code>.</p>`
  },
  units: {
    group: 'Core systems', label: 'Units & assignment', title: 'A live roster for people who can act.',
    intro: 'Unit Core registers only eligible on-duty personnel. It keeps status, location, callsign, rank and movement type lightweight and synchronized.',
    render: () => `
      <div class="hero-eyebrow">CORE SYSTEMS</div><h1>Units &amp; assignment</h1><p class="lede">Unit state is server-authoritative and memory-only. Disconnects, off-duty changes and invalid jobs clean up safely.</p>
      <h2 id="unit-shape">Unit shape</h2>${code("{\n  id, source, callsign, name, department, job,\n  status, coords, heading, vehicle, radioChannel, currentCallId\n}")}${table(['Status','Meaning'],[['<code>AVAILABLE</code>','On duty and ready for a call.'],['<code>ASSIGNED</code>','Linked to a call, but not yet responding.'],['<code>RESPONDING</code>','Officer pressed Respond; waypoint and optional wave are active.'],['<code>ON_SCENE</code>','Auto-on-scene confirmed inside the configured radius.'],['<code>BUSY</code>','Unavailable for ordinary assignment.'],['<code>OUT_OF_SERVICE</code>','Visible to dispatch but not assignable.']])}
      <h2 id="flow">Assignment flow</h2>${code('AVAILABLE → ASSIGNED → RESPONDING → ON_SCENE → AVAILABLE')}${callout('One call at a time.', 'A unit cannot be assigned twice and a new assignment is rejected while its current call link is active.')}
      <h2 id="movement">Movement and rank</h2><p class="prose">The Full Dispatch roster displays the live movement type (on foot, vehicle, motorcycle, helicopter, aircraft, boat or tank), not a vehicle model. Rank/callsign is read from Qbox/QBCore data when available, with a safe fallback only when the framework does not provide it.</p>`
  },
  dispatcher: {
    group: 'Operations', label: 'Dispatcher Mode', title: 'A temporary seat at the console.',
    intro: 'Any configured on-duty emergency job can opt into Dispatcher Mode when self-join is enabled. The server decides who gets management controls.',
    render: () => `
      <div class="hero-eyebrow">OPERATIONS</div><h1>Dispatcher Mode</h1><p class="lede">Use <strong>BECOME DISPATCHER</strong> to open the management seat. Leave it to restore the previous valid unit state.</p>
      <h2 id="permissions">Permissions</h2>${table(['Capability','Dispatcher','Officer'],[['View eligible calls and units','Yes','Yes'],['Create/edit calls','Yes','No'],['Assign/unassign','Yes','Own assignment / server rules'],['Resolve, reopen, add notes','Yes','No'],['Force RESPONDING / ON_SCENE','Only if config allows','No'],['Tactical create/edit/delete','Yes','View only']])}
      <h2 id="workflow">Session workflow</h2>${steps([['Join','The server checks allowed job, duty state and MaxDispatchers.'],['Operate','The Units panel groups DISPATCH, AVAILABLE, ASSIGNED, RESPONDING, ON SCENE and OUT OF SERVICE.'],['Leave','The previous valid unit status is restored and the dispatcher badge disappears.'],['Cleanup','Disconnect, off-duty or job changes invalidate the session automatically.']])}
      ${callout('Keep this configurable.', '<code>forceUnitStatus = false</code> preserves the officer-led response flow. Dispatchers assign; officers respond; auto-on-scene confirms arrival.')}`
  },
  patrols: {
    group: 'Operations', label: 'Patrol Groups', title: 'Move a team as one operational unit.',
    intro: 'Patrol Groups are temporary server-side collections of Unit Core members. A leader and callsign make multi-officer response readable without duplicating unit cards.',
    render: () => `
      <div class="hero-eyebrow">OPERATIONS</div><h1>Patrol Groups</h1><p class="lede">Dispatchers can create a group, add or remove members, choose a leader, assign the group to a call, and disband it safely.</p>
      <h2 id="group-fields">Group fields</h2>${table(['Field','Behavior'],[['<code>id</code>','Unique in-memory group id.'],['<code>callsign</code>','Shown as the group identity in the Units panel.'],['<code>leader</code>','If a leader leaves, the server promotes the next valid member.'],['<code>members</code>','Unit ids; each member keeps an individual currentCallId and status.'],['<code>status</code>','Derived from the member states for compact display.']])}
      <h2 id="actions">Actions</h2>${code("exports['nmsh_dispatch']:CreatePatrolGroup(data)\nexports['nmsh_dispatch']:AddPatrolGroupMember(groupId, unitId)\nexports['nmsh_dispatch']:RemovePatrolGroupMember(groupId, unitId)\nexports['nmsh_dispatch']:SetPatrolGroupLeader(groupId, unitId)\nexports['nmsh_dispatch']:DisbandPatrolGroup(groupId)")}
      <p class="prose">Assigning a group updates each member through the same validation as individual assignment. Patrol members follow wave/channel restoration independently.</p>`
  },
  tac: {
    group: 'Operations', label: 'TAC & Waves', title: 'Keep a call’s working channel clear.',
    intro: 'Waves are literal channels 3 through 10. TAC is an overview layer for channel membership and call context; voice transmission remains owned by pma-voice.',
    render: () => `
      <div class="hero-eyebrow">OPERATIONS</div><h1>TAC &amp; Waves</h1><p class="lede">Dispatchers can assign a free wave to a call. Responding and on-scene units move to it while preserving their original radio channel.</p>
      <h2 id="waves">Waves 3–10</h2>${table(['Wave','pma-voice channel'],[['<code>WAVE-3</code>','3'],['<code>WAVE-4</code>','4'],['<code>WAVE-5</code>','5'],['<code>WAVE-6</code>','6'],['<code>WAVE-7</code>','7'],['<code>WAVE-8</code>','8'],['<code>WAVE-9</code>','9'],['<code>WAVE-10</code>','10']])}
      <h2 id="flow">Wave flow</h2>${steps([['Free → Taken','A dispatcher selects a free wave for a call.'],['Respond','The unit’s original channel is saved and the active unit moves to the call wave.'],['Change wave','Responding/on-scene members follow the new call wave without losing the saved channel.'],['Resolve','The original channel is restored only when the unit is still on the call wave; the wave becomes free.']])}
      <h2 id="tac-channels">TAC channels</h2><p class="prose">TAC channels can be created/closed and joined/left in Full Dispatch. Dispatchers manage call and unit targets; officers see the current overview. There is no voice implementation or pma-voice UI here.</p>`
  },
  'full-dispatch': {
    group: 'Interface', label: 'Full Dispatch', title: 'The operational workspace.',
    intro: 'Full Dispatch is the larger command surface: active calls, live units, the local GTA map, Call Management, history, tactical overlays and heatmap controls.',
    render: () => `
      <div class="hero-eyebrow">INTERFACE</div><h1>Full Dispatch</h1><p class="lede">Open with <kbd>F6</kbd> or the configured command. Press <kbd>Esc</kbd> to close immediately; selection begins empty until you choose a call or unit.</p>
      <h2 id="workspace">Workspace map</h2>${table(['Area','Purpose'],[['Calls','Filter by priority/department, search and select a live call.'],['Map','Pan/zoom local Leaflet GTA tiles, focus calls/units and view markers.'],['Units','Grouped by dispatcher and status; click a card to select.'],['Call Management','Status, wave, assigned units, actions, outcome and activity for the selected call.']])}
      <h2 id="states">Empty and permission states</h2><p class="prose">No selected call means the Call Management panel collapses instead of showing placeholder controls. Non-dispatchers retain officer actions and view-only tactical/heatmap access; dispatcher controls are gated by server state.</p>
      ${callout('Runtime boundary.', 'React mock data is available only in browser preview. The FiveM NUI boot path starts empty and waits for Lua snapshots.')}
      <h2 id="controls">Useful controls</h2>${table(['Control','Default'],[['Open Full Dispatch','F6'],['Toggle Small HUD','K'],['Respond','G'],['Cursor / move panel','F9'],['Panic','F10']])}`
  },
  'small-hud': {
    group: 'Interface', label: 'Small HUD', title: 'Compact when seconds matter.',
    intro: 'The Small HUD surfaces one alert at a time in the top-right of the game. It is intentionally dense, keyboard-first and independent from Full Dispatch layout.',
    render: () => `
      <div class="hero-eyebrow">INTERFACE</div><h1>Small HUD</h1><p class="lede">The panel shows the alert counter, department/channel, elapsed time, priority, incident title, description and response controls without pretending to be a dashboard.</p>
      <h2 id="navigation">Navigation</h2>${table(['Input','Action'],[['Left Arrow','Previous alert; stops at the oldest alert.'],['Right Arrow','Next alert; stops at the newest alert.'],['G','Respond to the current alert once; sets the officer’s waypoint.'],['F9','Enable cursor/edit mode and reveal the floating details/move/reset toolbar.'],['K','Toggle the panel using the registered FiveM key mapping.']])}
      <h2 id="arrival">Arrival behavior</h2><p class="prose">Normal alerts use a subtle one-shot sweep. PANIC uses a short red/blue pulse. The visual notification may expire locally, but the Call Core remains active until resolved.</p>
      <h2 id="details">Details without unknown clutter</h2><p class="prose">Only fields supplied by the alert payload are rendered. Empty gender, vehicle, weapon or location values are omitted instead of being printed as <code>Unknown</code>.</p>`
  },
  integration: {
    group: 'Integrate', label: 'CreateDispatch API', title: 'One payload, many resources.',
    intro: 'Use the server export whenever the source resource already has authoritative context. Use the client export only when the call starts on a player client.',
    render: () => `
      <div class="hero-eyebrow">INTEGRATE</div><h1>CreateDispatch</h1><p class="lede">The public integration surface is deliberately small. Predefined exports cover common incidents; custom calls use the same normalized payload.</p>
      <h2 id="server">Server export</h2>${code("local success, callId = exports['nmsh_dispatch']:CreateDispatch({\n    job = { 'police', 'ambulance' },\n    callLocation = vector3(441.2, -981.9, 30.7),\n    callCode = { code = '10-15', snippet = 'Store Robbery' },\n    message = 'A person is robbing a convenience store.',\n    priority = 'high',\n    details = {\n        incident = 'Suspect reported inside the store',\n        gender = 'Male',\n        weapon = 'Handgun',\n    },\n})")}
      <h2 id="payload">Accepted payload</h2>${table(['Field','Required','Notes'],[['<code>job</code> / <code>jobs</code> / <code>targetJobs</code>','No','String or list; defaults to configured recipients.'],['<code>callLocation</code> / <code>coords</code>','Yes','GTA vector3 or x/y/z table.'],['<code>callCode</code> / <code>code</code>','Yes','Code and visible snippet/title.'],['<code>message</code> / <code>description</code>','Yes','Visible call description.'],['<code>priority</code>','No','low, med, high or panic. <code>panic = true</code> forces panic.'],['<code>details</code>','No','Only non-empty HUD fields are shown.'],['<code>blip</code>','No','Per-call sprite, scale, colour, flashes and optional duration.']])}
      <h2 id="client">Client export</h2>${code("local player = exports['nmsh_dispatch']:GetPlayerInfo()\nif player then\n    exports['nmsh_dispatch']:CreateDispatch({\n        job = { 'police' },\n        callLocation = player.coords,\n        callCode = { code = '10-13', snippet = 'Shots Fired' },\n        message = ('Shots near %s'):format(player.street_1 or 'the caller'),\n        priority = 'high',\n    })\nend")}
      <p class="prose">The client event alias is <code>nmsh_dispatch:client:CreateDispatch</code>. Player-created calls are checked against configured jobs and duty on the server.</p>`
  },
  presets: {
    group: 'Integrate', label: 'Predefined dispatches', title: 'Ready-made incident vocabulary.',
    intro: 'Every preset is configured once in Config.PredefinedDispatches and exposed as a no-argument export. Each preset owns its own map blip definition.',
    render: () => `
      <div class="hero-eyebrow">INTEGRATE</div><h1>Predefined dispatches</h1><p class="lede">Call an incident directly from another resource. Pass optional overrides when you need a one-off description, priority or detail.</p>
      <h2 id="exports">Available exports</h2>${table(['Group','Exports'],[['Emergency','<code>Shooting()</code>, <code>VehicleShooting()</code>, <code>OfficerDown()</code>'],['Robbery','<code>StoreRobbery()</code>, <code>FleecaBankRobbery()</code>, <code>PaletoBankRobbery()</code>, <code>PacificBankRobbery()</code>, <code>VangelicoRobbery()</code>, <code>HouseRobbery()</code>, <code>ArtGalleryRobbery()</code>, <code>HumaneRobbery()</code>, <code>TrainRobbery()</code>, <code>VanRobbery()</code>, <code>UndergroundRobbery()</code>, <code>DrugBoatRobbery()</code>, <code>UnionRobbery()</code>, <code>YachtHeist()</code>'],['Crime','<code>DrugSale()</code>, <code>SuspiciousActivity()</code>, <code>CarJacking()</code>, <code>VehicleTheft()</code>, <code>CarBoosting()</code>, <code>IllegalRacing()</code>, <code>Kidnapping()</code>'],['Misc','<code>PrisonBreak()</code>, <code>IllegalFishing()</code>, <code>ArmsDeal()</code>, <code>CyberAttack()</code>']])}
      <h2 id="usage">Usage</h2>${code("-- client-side: use current player coordinates\nexports['nmsh_dispatch']:StoreRobbery()\n\n-- server-side: pass the source whose location should be used\nexports['nmsh_dispatch']:StoreRobbery(source)\n\n-- optional client override\nexports['nmsh_dispatch']:StoreRobbery({\n    priority = 'high',\n    details = { incident = 'Alarm active' },\n})")}
      <h2 id="blips">Per-alert blips</h2><p class="prose">Edit the <code>blip</code> table on the individual preset, not a global priority palette:</p>${code("StoreRobbery = {\n    code = '10-15', title = 'Store Robbery',\n    priority = 'med', jobs = { 'police' },\n    blip = { sprite = 52, scale = 0.85, colour = 5, flashes = true },\n}")}`
  },
  exports: {
    group: 'Integrate', label: 'Server exports & events', title: 'The complete reference surface.',
    intro: 'These are the public server exports and event names currently implemented by nmsh_dispatch. Prefer exports for resource-to-resource calls.',
    render: () => `
      <div class="hero-eyebrow">INTEGRATE</div><h1>Exports &amp; events</h1>
      <h2 id="calls">Call Core</h2>${code("CreateDispatch(data)\nCreateCall(data)\nUpdateCall(callId, updates)\nResolveCall(callId)\nArchiveCall(callId)\nRemoveCall(callId)\nGetCall(callId)\nGetCallHistory()")}
      <h2 id="units">Unit Core</h2>${code("RegisterUnit(source, snapshot)\nUpdateUnit(unitId, updates)\nUpdateUnitStatus(unitId, status, callId)\nRemoveUnit(source)\nGetUnit(unitId)\nGetUnitBySource(source)\nGetUnits()")}
      <h2 id="groups">Patrols, TAC and assignment</h2>${code("CreatePatrolGroup(data)\nAddPatrolGroupMember(groupId, unitId)\nRemovePatrolGroupMember(groupId, unitId)\nSetPatrolGroupLeader(groupId, unitId)\nDisbandPatrolGroup(groupId)\nGetPatrolGroup(groupId)\nGetPatrolGroups()\n\nCreateTacChannel(data)\nCloseTacChannel(channelId)\nAssignCallToTacChannel(channelId, callId)\nAssignTacTarget(channelId, targetId)\nRemoveTacTarget(channelId, targetId)\nGetTacChannel(channelId)\nGetTacChannels()\n\nAssignUnitToCall(callId, unitId)\nUnassignUnitFromCall(callId, unitId)\nGetCallUnits(callId)")}
      <h2 id="events">Key server events</h2>${table(['Event','Use'],[['<code>nmsh_dispatch:server:CreateDispatch</code>','Validated player-originated call.'],['<code>nmsh_dispatch:server:respondToCall</code>','Officer responds to the current alert.'],['<code>nmsh_dispatch:server:unitOnScene</code>','Auto-on-scene request, revalidated on server.'],['<code>nmsh_dispatch:server:setDispatcherSession</code>','Join or leave temporary Dispatcher Mode.'],['<code>nmsh_dispatch:server:dispatcher*</code>','Permission-checked management actions from Full Dispatch.']])}`
  },
  history: {
    group: 'Operations', label: 'History & Heatmap', title: 'Keep the story after the sirens.',
    intro: 'Resolved calls remain in the current session’s archive with timeline entries and unit history. Heatmap points are derived from that same history.',
    render: () => `
      <div class="hero-eyebrow">OPERATIONS</div><h1>History &amp; Heatmap</h1><p class="lede">No database is required for the current phase. The archive is in memory, intentionally bounded by the timeline and heatmap config.</p>
      <h2 id="archive">Archive workflow</h2>${steps([['Resolve','A dispatcher selects Cleared, Unfounded or No Units.'],['Archive','The call leaves Active Calls but keeps timeline and unit history.'],['Search','History can filter by priority, department, status and time range.'],['Reopen','A dispatcher can reopen a resolved/archived call into the active workflow.']])}
      <h2 id="heatmap">Heatmap inputs</h2>${table(['Control','Values'],[['Time range','30m, 1h, 6h or 24h.'],['Incident filter','Incident type/title from resolved calls.'],['Priority filter','LOW, MED, HIGH or PANIC.'],['Intensity','Weighted points sent to the Leaflet renderer only when filters/range change.']])}
      ${callout('Memory-only boundary.', 'Restarting the resource clears history, tactical items, patrols and TAC state. Persistence is intentionally not part of this release.')}`
  },
  tactical: {
    group: 'Operations', label: 'Tactical tools', title: 'Draw the plan, keep it shared.',
    intro: 'Dispatchers can place shared markers and draw search perimeters or roadblock routes. Officers see the same overlays but remain view-only.',
    render: () => `
      <div class="hero-eyebrow">OPERATIONS</div><h1>Tactical tools</h1><p class="lede">Lightweight Leaflet primitives keep the shared plan readable without a second mapping stack.</p>
      <h2 id="items">Overlay types</h2>${table(['Item','Purpose'],[['Shared marker','A named point with creator attribution.'],['Search perimeter','A polygon for a search or containment area.'],['Roadblock route','A line for a route, closure or staging corridor.']])}
      <h2 id="permissions">Permissions and lifecycle</h2><p class="prose">Dispatcher-only create, update, delete and clear actions are validated server-side. Every viewer receives the current in-memory snapshot. Overlay visibility is a viewer preference; deleting an item removes it for everyone.</p>
      <h2 id="api">Public lookup</h2>${code("exports['nmsh_dispatch']:GetTacticalItems()\n\n-- NUI events (dispatcher actions)\nnmsh_dispatch:server:dispatcherCreateTacticalItem\nnmsh_dispatch:server:dispatcherUpdateTacticalItem\nnmsh_dispatch:server:dispatcherDeleteTacticalItem\nnmsh_dispatch:server:dispatcherClearTacticalItems")}`
  },
  troubleshooting: {
    group: 'Reference', label: 'Troubleshooting', title: 'A calm path through the common issues.',
    intro: 'Start with the console error, then verify load order, job/duty state and the exact resource name before changing code.',
    render: () => `
      <div class="hero-eyebrow">REFERENCE</div><h1>Troubleshooting</h1>
      <h2 id="no-calls">No calls arrive</h2><p class="prose">Confirm the player is on duty, the job exists in <code>Config.Departments</code>, and the call’s recipient list includes that job. Dispatcher mode does not automatically make every officer a dispatcher.</p>
      <h2 id="no-ui">HUD or Full Dispatch does not open</h2><p class="prose">Check that <code>ui_page</code> points to <code>html/index.html</code>, the Vite build exists under <code>html/build</code>, and the resource was restarted after a production build. Use F8/FiveM key bindings to inspect remapped keys.</p>
      <h2 id="lua">Lua errors</h2>${table(['Symptom','First check'],[['<code>attempt to index a nil value</code>','Check framework resource state and wait for player loaded/job update.'],['No street/area','Use OneSync and verify the call has valid GTA coords; labels are filled by FiveM natives when available.'],['Radio does not move','Internal wave state still works. Verify pma-voice is started before dispatch and uses the configured channel numbers.'],['Stale browser UI','Hard refresh the preview; FiveM NUI uses the built production assets, not the Vite dev server.']])}
      ${callout('Keep logs useful.', 'Reproduce with one action at a time, capture the first error line, and avoid masking a nil framework value with a UI fallback.')}`
  }
};

const navGroups = [
  ['Start here', ['overview', 'getting-started']],
  ['Configure', ['configuration']],
  ['Core systems', ['calls', 'units']],
  ['Operations', ['dispatcher', 'patrols', 'tac', 'history', 'tactical']],
  ['Interface', ['small-hud', 'full-dispatch']],
  ['Integrate', ['integration', 'presets', 'exports']],
  ['Reference', ['troubleshooting']],
];

const state = { current: 'overview', searchResults: [], searchIndex: 0 };
const sideNav = document.querySelector('#side-nav');
const pageContent = document.querySelector('#page-content');
const breadcrumbs = document.querySelector('#breadcrumbs');
const toc = document.querySelector('#toc');
const footer = document.querySelector('#page-footer');
const sidebar = document.querySelector('#sidebar');
const scrim = document.querySelector('#mobile-scrim');

function renderNav() {
  sideNav.innerHTML = navGroups.map(([group, ids]) => `<div class="side-section"><div class="side-section-title">${group}</div>${ids.map((id) => `<a class="side-link ${state.current === id ? 'active' : ''}" href="#/${id}" data-page="${id}"><span>${pages[id].label}</span>${id === 'overview' ? '<span class="count">01</span>' : ''}</a>`).join('')}</div>`).join('');
}

function renderToc() {
  const headings = [...pageContent.querySelectorAll('h2[id], h3[id]')];
  toc.innerHTML = headings.length ? `<div class="toc-title">On this page</div>${headings.map((heading) => `<a href="#${heading.id}">${heading.textContent}</a>`).join('')}` : '';
  toc.querySelectorAll('a').forEach((link) => link.addEventListener('click', (event) => {
    event.preventDefault(); document.getElementById(link.getAttribute('href').slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

function renderFooter() {
  const order = navGroups.flatMap(([, ids]) => ids);
  const index = order.indexOf(state.current);
  const previous = order[index - 1]; const next = order[index + 1];
  footer.innerHTML = `${previous ? `<a class="page-nav" href="#/${previous}"><span class="page-nav-label">← Previous</span><span class="page-nav-title">${pages[previous].label}</span></a>` : '<span></span>'}${next ? `<a class="page-nav next" href="#/${next}"><span class="page-nav-label">Next →</span><span class="page-nav-title">${pages[next].label}</span></a>` : '<span></span>'}`;
}

function bindPageInteractions() {
  document.querySelectorAll('.copy-code').forEach((button) => button.addEventListener('click', async () => {
    const text = button.nextElementSibling.textContent;
    try { await navigator.clipboard.writeText(text); button.textContent = 'Copied'; setTimeout(() => { button.textContent = 'Copy'; }, 1200); } catch { button.textContent = 'Select'; }
  }));
  document.querySelectorAll('.tabs').forEach((tabs) => tabs.querySelectorAll('.tab-button').forEach((button) => button.addEventListener('click', () => {
    tabs.querySelectorAll('.tab-button').forEach((item) => item.classList.remove('active')); tabs.querySelectorAll('.tab-panel').forEach((item) => item.classList.remove('active'));
    button.classList.add('active'); tabs.parentElement.querySelector(`#${button.dataset.tab}`)?.classList.add('active');
  })));
}

function renderPage() {
  const page = pages[state.current] || pages.overview;
  pageContent.innerHTML = page.render();
  breadcrumbs.innerHTML = `<span>NMSH Dispatch</span><i>/</i><strong>${page.label}</strong>`;
  renderNav(); renderToc(); renderFooter(); bindPageInteractions();
  window.scrollTo({ top: 0, behavior: 'instant' });
  sidebar.classList.remove('open'); scrim.classList.remove('show');
}

function route() {
  const key = location.hash.replace(/^#\//, '') || 'overview';
  state.current = pages[key] ? key : 'overview'; renderPage();
}

const searchable = Object.entries(pages).map(([id, page]) => ({ id, label: page.label, group: page.group, text: `${page.label} ${page.title} ${page.intro}`.toLowerCase() }));
const searchLayer = document.querySelector('#search-layer'); const searchInput = document.querySelector('#search-input'); const searchResults = document.querySelector('#search-results');
function openSearch() { searchLayer.hidden = false; searchInput.value = ''; state.searchResults = []; state.searchIndex = 0; searchResults.innerHTML = '<div class="search-empty">Type to search the docs.</div>'; setTimeout(() => searchInput.focus(), 0); }
function closeSearch() { searchLayer.hidden = true; }
function updateSearch() {
  const query = searchInput.value.trim().toLowerCase(); state.searchResults = query ? searchable.filter((item) => item.text.includes(query)) : []; state.searchIndex = 0;
  searchResults.innerHTML = state.searchResults.length ? state.searchResults.map((item, index) => `<a class="search-result ${index === 0 ? 'selected' : ''}" href="#/${item.id}" data-result="${index}"><span class="search-result-title">${item.label}</span><span class="search-result-meta">${item.group} · ${pages[item.id].title}</span></a>`).join('') : `<div class="search-empty">${query ? 'No matching pages.' : 'Type to search the docs.'}</div>`;
  searchResults.querySelectorAll('.search-result').forEach((result) => result.addEventListener('click', closeSearch));
}
function moveSearch(delta) { if (!state.searchResults.length) return; state.searchIndex = (state.searchIndex + delta + state.searchResults.length) % state.searchResults.length; searchResults.querySelectorAll('.search-result').forEach((item, index) => item.classList.toggle('selected', index === state.searchIndex)); }

document.querySelector('#search-trigger').addEventListener('click', openSearch); document.querySelector('#search-close').addEventListener('click', closeSearch); searchInput.addEventListener('input', updateSearch);
document.querySelector('#sidebar-search-input').addEventListener('focus', openSearch);
document.querySelector('#menu-button').addEventListener('click', () => { sidebar.classList.add('open'); scrim.classList.add('show'); }); document.querySelector('#sidebar-close').addEventListener('click', () => { sidebar.classList.remove('open'); scrim.classList.remove('show'); }); scrim.addEventListener('click', () => { sidebar.classList.remove('open'); scrim.classList.remove('show'); });
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
  if (event.key === 'Escape') closeSearch();
  if (!searchLayer.hidden && event.key === 'ArrowDown') { event.preventDefault(); moveSearch(1); }
  if (!searchLayer.hidden && event.key === 'ArrowUp') { event.preventDefault(); moveSearch(-1); }
  if (!searchLayer.hidden && event.key === 'Enter' && state.searchResults[state.searchIndex]) { location.hash = `#/${state.searchResults[state.searchIndex].id}`; closeSearch(); }
});
window.addEventListener('hashchange', route); route();
