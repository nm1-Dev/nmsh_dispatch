local Framework
local calls = {}
local units = {}
local patrolGroups = {}
local tacChannels = {}
local tacJoins = {}
local tacticalItems = {}
local tacticalOverlayVisibility = {}
local heatmapEventsCache = {}
local heatmapDirty = true
local callSequence = 0
local patrolGroupSequence = 0
local tacChannelSequence = 0
local tacticalItemSequence = 0
local shootingAlertCooldowns = {}
local panicCooldowns = {}
local dispatcherSessions = {}
local releaseUnitsFromCall
local fullDispatchViewers = {}
local fullDispatchSyncPending = false
local queueFullDispatchSync
local getPatrolGroupForUnit
local syncPatrolGroup
local clearCallTacChannel
local removeTacTargetFromChannels
local captureCallUnitHistory

local callStatuses = { NEW = true, ACTIVE = true, RESOLVED = true, ARCHIVED = true }
local unitStatuses = {
    AVAILABLE = true,
    ASSIGNED = true,
    RESPONDING = true,
    ON_SCENE = true,
    BUSY = true,
    OUT_OF_SERVICE = true,
}
local detailKeys = {
    name = true, phone = true, incident = true, street = true, gender = true,
    weapon = true, vehicle = true, plate = true, color = true, class = true,
    doors = true, direction = true,
}

local function detectFramework()
    if (Config.Framework == 'qbox' or Config.Framework == 'auto') and GetResourceState('qbx_core') == 'started' then return 'qbox' end
    if (Config.Framework == 'qbcore' or Config.Framework == 'auto') and GetResourceState('qb-core') == 'started' then return 'qbcore' end
end

local function getPlayer(source)
    if Framework == 'qbox' then return exports.qbx_core:GetPlayer(source) end
    if Framework == 'qbcore' then return exports['qb-core']:GetCoreObject().Functions.GetPlayer(source) end
end

local function getJob(source)
    local player = getPlayer(source)
    return player and player.PlayerData and player.PlayerData.job
end

local function isConfiguredJob(source)
    local job = getJob(source)
    return job and Config.Departments[job.name] ~= nil and (not Config.RequireOnDuty or job.onduty == true)
end

local function canJoinDispatcher(source)
    local settings = Config.Dispatcher or {}
    if settings.enabled == false or settings.AllowSelfJoin == false or not isConfiguredJob(source) then return false end
    local job = getJob(source)
    return job and type(settings.allowedJobs) == 'table' and settings.allowedJobs[job.name] == true
end

local function isDispatcher(source)
    return dispatcherSessions[source] == true and canJoinDispatcher(source)
end

local function clearDispatcherSession(source)
    if not dispatcherSessions[source] then return false end
    dispatcherSessions[source] = nil
    local unit
    for _, candidate in pairs(units) do
        if candidate.source == source then unit = candidate break end
    end
    if unit then
        unit.isDispatcher = false
        unit.dispatcherPreviousStatus = nil
    end
    queueFullDispatchSync()
    return true
end

local function getSourceService(source)
    local job = getJob(source)
    return job, job and Config.Departments[job.name] or nil
end

local function trimText(value, maxLength)
    return type(value) == 'string' and value:sub(1, maxLength) or ''
end

local function copyTable(source)
    local copy = {}
    if type(source) ~= 'table' then return copy end
    for key, value in pairs(source) do copy[key] = value end
    return copy
end

local function copyValue(value, depth)
    if type(value) ~= 'table' or depth <= 0 then return value end
    local copy = {}
    for key, item in pairs(value) do copy[key] = copyValue(item, depth - 1) end
    return copy
end

local function sanitizeCoords(coords)
    if not coords then return nil end
    local x = tonumber(coords.x or coords[1])
    local y = tonumber(coords.y or coords[2])
    local z = tonumber(coords.z or coords[3])
    if not x or not y or not z then return nil end
    return { x = x, y = y, z = z }
end

local function sanitizeJobs(jobs)
    if type(jobs) == 'string' and jobs ~= '' then return { [jobs] = true } end
    if type(jobs) ~= 'table' then return copyTable(Config.DefaultRecipientJobs) end

    local sanitized = {}
    for key, value in pairs(jobs) do
        local job = type(key) == 'number' and value or key
        if type(job) == 'string' and value ~= false then sanitized[job] = true end
    end
    return next(sanitized) and sanitized or copyTable(Config.DefaultRecipientJobs)
end

local function sanitizeBlip(blip)
    if type(blip) ~= 'table' then return nil end
    return {
        sprite = tonumber(blip.sprite),
        scale = tonumber(blip.scale),
        colour = tonumber(blip.colour or blip.color),
        flashes = blip.flashes == true,
        text = trimText(blip.text, 80),
        time = math.max(0, math.floor(tonumber(blip.time) or 0)),
    }
end

local function sanitizeDetails(details)
    if type(details) ~= 'table' then return {} end
    local sanitized = {}
    for key, value in pairs(details) do
        if detailKeys[key] and (type(value) == 'string' or type(value) == 'number' or type(value) == 'boolean') then
            sanitized[key] = trimText(tostring(value), 160)
        end
    end
    return sanitized
end

local function sanitizeOtherData(otherData)
    if type(otherData) ~= 'table' then return {} end
    local sanitized = {}
    for index = 1, math.min(#otherData, 12) do
        local item = otherData[index]
        if type(item) == 'table' then
            local text = trimText(item.text, 160)
            if text ~= '' then sanitized[#sanitized + 1] = { text = text, icon = trimText(item.icon, 80) } end
        end
    end
    return sanitized
end

local function sanitizeMetadata(metadata)
    if type(metadata) ~= 'table' then return {} end
    local sanitized, count = {}, 0
    for key, value in pairs(metadata) do
        if type(key) == 'string' and #key <= 48 and (type(value) == 'string' or type(value) == 'number' or type(value) == 'boolean') then
            count = count + 1
            if count > 24 then break end
            sanitized[key] = type(value) == 'string' and trimText(value, 160) or value
        end
    end
    return sanitized
end

local function normalizePriority(value, isPanic)
    if isPanic then return 1 end
    if type(value) == 'string' then
        value = ({ high = 1, med = 2, medium = 2, low = 3 })[value:lower()] or value
    end
    local priority = math.floor(tonumber(value) or 2)
    return priority >= 1 and priority <= 3 and priority or 2
end

local function getHudDuration(data, isPanic)
    local settings = Config.AlertExpiration
    if isPanic or not settings or settings.enabled == false then return nil end
    local duration = math.floor(tonumber(data.durationSeconds or data.duration) or settings.defaultSeconds or 180)
    local minimum = math.max(1, math.floor(tonumber(settings.minimumSeconds) or 30))
    local maximum = math.max(minimum, math.floor(tonumber(settings.maximumSeconds) or 3600))
    return math.min(math.max(duration, minimum), maximum)
end

local function nextCallId(now)
    callSequence = callSequence + 1
    return ('%d-%d'):format(now, callSequence)
end

local function normalizeCall(data)
    if type(data) ~= 'table' then return nil end
    local callCode = type(data.callCode) == 'table' and data.callCode or {}
    local coords = sanitizeCoords(data.coords or data.callLocation)
    local code = trimText(data.code or callCode.code, 16)
    local title = trimText(data.title or callCode.snippet, 80)
    local description = trimText(data.description or data.message, 280)
    if not coords or code == '' or title == '' or description == '' then return nil end

    local now = os.time()
    local isPanic = data.panic == true or (type(data.priority) == 'string' and data.priority:lower() == 'panic')
    local metadata = sanitizeMetadata(data.metadata)
    metadata.targetJobs = sanitizeJobs(data.targetJobs or data.jobs or data.job)
    metadata.channel = trimText(data.channel, 32)
    metadata.theme = trimText(data.theme, 32)
    metadata.panic = isPanic
    metadata.details = sanitizeDetails(data.details)
    metadata.flashes = data.flashes == true
    metadata.image = trimText(data.image, 2048)
    metadata.blip = sanitizeBlip(data.blip)
    metadata.otherData = sanitizeOtherData(data.otherData)
    metadata.timeline = { { at = now, text = 'Call created' } }
    local duration = getHudDuration(data, isPanic)
    metadata.hudExpiresAt = duration and now + duration or nil
    local department = trimText(data.department, 32)
    if department == '' then department = 'DISPATCH' end

    return {
        id = nextCallId(now),
        code = code,
        title = title,
        description = description,
        priority = normalizePriority(data.priority, isPanic),
        department = department,
        coords = coords,
        street = trimText(data.street, 80),
        area = trimText(data.area, 80),
        createdAt = now,
        status = 'NEW',
        assignedUnits = {},
        respondingUnits = {},
        metadata = metadata,
    }
end

local function toHudAlert(call, jobName)
    local department = Config.Departments[jobName]
    local metadata = call.metadata or {}
    return {
        id = call.id,
        code = call.code,
        title = call.title,
        description = call.description,
        street = call.street,
        area = call.area,
        coords = call.coords,
        priority = call.priority,
        department = call.department ~= 'DISPATCH' and call.department or department.department,
        channel = metadata.channel ~= '' and metadata.channel or department.channel,
        theme = metadata.theme ~= '' and metadata.theme or department.theme,
        panic = metadata.panic == true,
        details = metadata.details or {},
        targetJobs = metadata.targetJobs,
        flashes = metadata.flashes == true,
        image = metadata.image or '',
        blip = metadata.blip,
        otherData = metadata.otherData or {},
        responders = copyTable(call.respondingUnits),
        status = call.status,
        timestamp = call.createdAt,
        expiresAt = metadata.hudExpiresAt,
        icon = department.icon,
        colors = department.colors,
    }
end

local function canReceiveCall(source, call, job)
    local jobName = job and job.name
    local targetJobs = call.metadata and call.metadata.targetJobs or {}
    return jobName and targetJobs[jobName] and Config.Departments[jobName]
        and (not Config.RequireOnDuty or job.onduty == true)
end

local function addCallTimeline(call, text)
    if not call or type(text) ~= 'string' or text == '' then return end
    local timeline = call.metadata.timeline
    if type(timeline) ~= 'table' then
        timeline = {}
        call.metadata.timeline = timeline
    end
    timeline[#timeline + 1] = { at = os.time(), text = trimText(text, 120) }
    local maximum = math.max(12, math.floor(tonumber((Config.History or {}).maxTimelineEntries) or 40))
    while #timeline > maximum do table.remove(timeline, 1) end
end

local function toFullDispatchCall(call, viewerDepartment)
    local metadata = call.metadata or {}
    return {
        id = call.id,
        code = call.code,
        title = call.title,
        description = call.description,
        priority = metadata.panic == true and 'PANIC' or ({ [1] = 'HIGH', [2] = 'MED', [3] = 'LOW' })[call.priority] or 'MED',
        -- A Full Dispatch view is a single-service workspace. Shared calls are
        -- presented under the receiving service, never as another department.
        department = viewerDepartment,
        coords = copyValue(call.coords, 1),
        street = call.street,
        area = call.area,
        createdAt = call.createdAt,
        status = call.status,
        resolvedAt = call.resolvedAt,
        archivedAt = call.archivedAt,
        closedAt = call.archivedAt or call.resolvedAt,
        assignedUnits = copyValue(call.assignedUnits, 2),
        respondingUnits = copyValue(call.respondingUnits, 2),
        tacChannelId = call.tacChannelId,
        metadata = {
            panic = metadata.panic == true,
            panicAcknowledged = metadata.panicAcknowledged == true,
            wave = tonumber(metadata.wave) or nil,
            notes = copyValue(metadata.notes, 2),
            timeline = copyValue(metadata.timeline, 2),
            unitHistory = copyValue(metadata.unitHistory, 2),
        },
    }
end

local function toFullDispatchUnit(unit)
    return {
        id = unit.id,
        callsign = unit.callsign,
        name = unit.name,
        department = unit.department,
        job = unit.job,
        status = unit.status,
        coords = copyValue(unit.coords, 1),
        heading = unit.heading,
        vehicle = copyValue(unit.vehicle, 1),
        radioChannel = unit.radioChannel,
        currentCallId = unit.currentCallId,
        patrolGroupId = unit.patrolGroupId,
        tacChannelId = unit.tacChannelId,
        isDispatcher = unit.isDispatcher == true,
    }
end

local function toFullDispatchPatrolGroup(group)
    return {
        id = group.id,
        callsign = group.callsign,
        leaderId = group.leaderId,
        memberIds = copyValue(group.memberIds, 1),
        status = group.status,
        coords = copyValue(group.coords, 1),
        heading = group.heading,
        vehicle = copyValue(group.vehicle, 1),
        department = group.department,
        job = group.job,
        radioChannel = group.radioChannel,
        currentCallId = group.currentCallId,
        tacChannelId = group.tacChannelId,
        isGroup = true,
    }
end

local function toFullDispatchTacChannel(channel)
    return {
        id = channel.id,
        name = channel.name,
        label = channel.label,
        department = channel.department,
        status = 'OPEN',
        callId = channel.callId,
        memberIds = copyValue(channel.memberIds, 1),
    }
end

local function toFullDispatchTacticalItem(item)
    return {
        id = item.id,
        type = item.type,
        points = copyValue(item.points, 2),
        createdBy = item.createdBy,
        createdAt = item.createdAt,
        updatedAt = item.updatedAt,
    }
end

local function getHeatmapIncidentType(call)
    local text = ('%s %s %s'):format(call.code or '', call.title or '', call.description or ''):lower()
    if text:find('robbery', 1, true) or text:find('heist', 1, true) or text:find('burglary', 1, true) then return 'ROBBERY' end
    if text:find('medical', 1, true) or text:find('unconscious', 1, true) or text:find('ambulance', 1, true) then return 'MEDICAL' end
    if text:find('vehicle', 1, true) or text:find('carjack', 1, true) or text:find('racing', 1, true) or text:find('boost', 1, true) then return 'VEHICLE' end
    return 'VIOLENCE'
end

local function getHeatmapEvents()
    if (Config.Heatmap or {}).enabled == false then return {} end
    if not heatmapDirty then return heatmapEventsCache end
    local events = {}
    for _, call in pairs(calls) do
        if (call.status == 'RESOLVED' or call.status == 'ARCHIVED') and call.coords then
            local priority = call.metadata and call.metadata.panic == true and 'PANIC' or ({ [1] = 'HIGH', [2] = 'MED', [3] = 'LOW' })[call.priority] or 'MED'
            events[#events + 1] = {
                coords = copyValue(call.coords, 1),
                createdAt = call.createdAt,
                priority = priority,
                type = getHeatmapIncidentType(call),
                weight = ({ LOW = 1, MED = 1.5, HIGH = 2.25, PANIC = 3.5 })[priority],
            }
        end
    end
    table.sort(events, function(a, b) return (b.createdAt or 0) < (a.createdAt or 0) end)
    local maximum = math.max(1, math.floor(tonumber((Config.Heatmap or {}).maxPoints) or 500))
    while #events > maximum do table.remove(events) end
    heatmapEventsCache, heatmapDirty = events, false
    return heatmapEventsCache
end

local function sendFullDispatchState(source)
    local dispatcher = isDispatcher(source)
    if not dispatcher and not isConfiguredJob(source) then
        fullDispatchViewers[source] = nil
        return false
    end

    local job, service = getSourceService(source)
    if not service then
        fullDispatchViewers[source] = nil
        return false
    end

    local viewerDepartment = service.department
    local waveSettings = Config.Waves or {}
    local firstWave = math.max(1, math.floor(tonumber(waveSettings.first) or 3))
    local lastWave = math.max(firstWave, math.floor(tonumber(waveSettings.last) or 10))
    local snapshot = {
        calls = {}, units = {}, patrolGroups = {}, tacChannels = {}, tacticalItems = {}, heatmapEvents = getHeatmapEvents(),
        waves = { first = firstWave, last = lastWave },
        service = { department = viewerDepartment, channel = service.channel, theme = service.theme },
        permissions = { dispatcher = dispatcher, canBecomeDispatcher = canJoinDispatcher(source), history = dispatcher, tactical = dispatcher, heatmap = (Config.Heatmap or {}).enabled ~= false, tacticalOverlaysVisible = tacticalOverlayVisibility[source] ~= false, forceUnitStatus = (Config.Dispatcher or {}).forceUnitStatus == true, joinedTacChannelId = tacJoins[source] },
    }
    for _, call in pairs(calls) do
        if (call.status == 'NEW' or call.status == 'ACTIVE' or (dispatcher and (call.status == 'RESOLVED' or call.status == 'ARCHIVED'))) and canReceiveCall(source, call, job) then
            snapshot.calls[#snapshot.calls + 1] = toFullDispatchCall(call, viewerDepartment)
        end
    end
    for _, unit in pairs(units) do
        if isConfiguredJob(unit.source) and unit.department == viewerDepartment then snapshot.units[#snapshot.units + 1] = toFullDispatchUnit(unit) end
    end
    for _, group in pairs(patrolGroups) do
        if group.department == viewerDepartment then snapshot.patrolGroups[#snapshot.patrolGroups + 1] = toFullDispatchPatrolGroup(group) end
    end
    for _, channel in pairs(tacChannels) do
        if channel.department == viewerDepartment then snapshot.tacChannels[#snapshot.tacChannels + 1] = toFullDispatchTacChannel(channel) end
    end
    for _, item in pairs(tacticalItems) do
        snapshot.tacticalItems[#snapshot.tacticalItems + 1] = toFullDispatchTacticalItem(item)
    end
    table.sort(snapshot.calls, function(a, b) return a.createdAt > b.createdAt end)
    table.sort(snapshot.units, function(a, b) return (a.callsign or a.id) < (b.callsign or b.id) end)
    table.sort(snapshot.patrolGroups, function(a, b) return (a.callsign or a.id) < (b.callsign or b.id) end)
    table.sort(snapshot.tacChannels, function(a, b) return (a.name or a.id) < (b.name or b.id) end)
    table.sort(snapshot.tacticalItems, function(a, b) return (a.createdAt or 0) < (b.createdAt or 0) end)
    TriggerClientEvent('nmsh_dispatch:client:fullDispatchState', source, snapshot)
    return true
end

queueFullDispatchSync = function()
    if fullDispatchSyncPending or not next(fullDispatchViewers) then return end
    fullDispatchSyncPending = true
    CreateThread(function()
        Wait(0)
        fullDispatchSyncPending = false
        for source in pairs(fullDispatchViewers) do sendFullDispatchState(source) end
    end)
end

local function sendCallToPlayer(source, call, eventName)
    local job = getJob(source)
    if not canReceiveCall(source, call, job) then return false end
    TriggerClientEvent(eventName or 'nmsh_dispatch:client:addAlert', source, toHudAlert(call, job.name))
    return true
end

local function broadcastCall(call, eventName)
    for _, playerId in ipairs(GetPlayers()) do
        sendCallToPlayer(tonumber(playerId), call, eventName)
    end
end

local function removeCallFromHud(callId)
    TriggerClientEvent('nmsh_dispatch:client:removeAlert', -1, callId)
end

local function createCall(data)
    local call = normalizeCall(data)
    if not call then
        print('^3[nmsh_dispatch] Rejected an invalid call payload.^0')
        return false
    end
    calls[call.id] = call
    broadcastCall(call, 'nmsh_dispatch:client:addAlert')
    queueFullDispatchSync()
    return true, call.id
end

local function updateCall(callId, updates)
    local call = calls[callId]
    if not call or call.status == 'ARCHIVED' or type(updates) ~= 'table' then return false end

    local allowedText = { code = 16, title = 80, description = 280, department = 32, street = 80, area = 80 }
    for key, maxLength in pairs(allowedText) do
        if updates[key] ~= nil then
            local value = trimText(updates[key], maxLength)
            if value ~= '' then call[key] = value end
        end
    end
    if updates.coords or updates.callLocation then
        local coords = sanitizeCoords(updates.coords or updates.callLocation)
        if coords then call.coords = coords end
    end
    if updates.priority ~= nil then
        local isPanic = type(updates.priority) == 'string' and updates.priority:lower() == 'panic'
        if call.metadata.panic ~= isPanic then call.metadata.panicAcknowledged = nil end
        call.metadata.panic = isPanic
        call.priority = normalizePriority(updates.priority, isPanic)
    end
    if updates.panic ~= nil then
        call.metadata.panic = updates.panic == true
        call.priority = normalizePriority(call.priority, call.metadata.panic)
    end

    local metadata = call.metadata
    if type(updates.metadata) == 'table' then
        for key, value in pairs(sanitizeMetadata(updates.metadata)) do metadata[key] = value end
    end
    if updates.details ~= nil then metadata.details = sanitizeDetails(updates.details) end
    if updates.blip ~= nil then metadata.blip = sanitizeBlip(updates.blip) end
    if updates.targetJobs or updates.jobs or updates.job then metadata.targetJobs = sanitizeJobs(updates.targetJobs or updates.jobs or updates.job) end
    for _, key in ipairs({ 'channel', 'theme', 'image' }) do
        if updates[key] ~= nil then metadata[key] = trimText(updates[key], key == 'image' and 2048 or 32) end
    end
    if updates.flashes ~= nil then metadata.flashes = updates.flashes == true end

    local status = type(updates.status) == 'string' and updates.status:upper() or nil
    if status and callStatuses[status] then call.status = status end
    if call.status == 'RESOLVED' or call.status == 'ARCHIVED' then
        heatmapDirty = true
        if call.status == 'RESOLVED' then call.resolvedAt = os.time() else call.archivedAt = os.time() end
        if clearCallTacChannel then clearCallTacChannel(call.id) end
        if captureCallUnitHistory then captureCallUnitHistory(call) end
        releaseUnitsFromCall(call.id)
        removeCallFromHud(call.id)
    else
        broadcastCall(call, 'nmsh_dispatch:client:updateAlert')
    end
    queueFullDispatchSync()
    return true, call.id
end

local function resolveCall(callId)
    return updateCall(callId, { status = 'RESOLVED' })
end

local function archiveCall(callId)
    return updateCall(callId, { status = 'ARCHIVED' })
end

local function getCallHistory(filters)
    filters = type(filters) == 'table' and filters or {}
    local snapshot = {}
    for _, call in pairs(calls) do
        local historical = call.status == 'RESOLVED' or call.status == 'ARCHIVED'
        if historical and (not filters.status or call.status == filters.status)
            and (not filters.department or call.department == filters.department)
            and (not filters.priority or call.priority == filters.priority) then
            snapshot[#snapshot + 1] = copyValue(call, 4)
        end
    end
    table.sort(snapshot, function(a, b)
        return (a.archivedAt or a.resolvedAt or a.createdAt or 0) > (b.archivedAt or b.resolvedAt or b.createdAt or 0)
    end)
    return snapshot
end

local function removeCall(callId)
    local call = calls[callId]
    if not call or (call.status ~= 'RESOLVED' and call.status ~= 'ARCHIVED') then return false end
    heatmapDirty = true
    if clearCallTacChannel then clearCallTacChannel(callId) end
    releaseUnitsFromCall(callId)
    removeCallFromHud(callId)
    calls[callId] = nil
    queueFullDispatchSync()
    return true
end

local function getSourceCoords(source)
    if type(source) ~= 'number' or source <= 0 then return nil end
    local ped = GetPlayerPed(source)
    if not ped or ped == 0 then return nil end
    local coords = GetEntityCoords(ped)
    return coords and { x = coords.x, y = coords.y, z = coords.z } or nil
end

local function createPredefinedDispatch(dispatchName, source, overrides)
    local preset = Config.PredefinedDispatches and Config.PredefinedDispatches[dispatchName]
    if type(preset) ~= 'table' then return false end
    overrides = type(overrides) == 'table' and overrides or {}
    local data = copyTable(preset)
    for _, key in ipairs({ 'code', 'title', 'description', 'message', 'priority', 'panic', 'department', 'channel', 'theme', 'flashes', 'image', 'blip', 'duration', 'durationSeconds', 'street', 'area', 'metadata' }) do
        if overrides[key] ~= nil then data[key] = overrides[key] end
    end
    data.details = copyTable(preset.details)
    if type(overrides.details) == 'table' then for key, value in pairs(overrides.details) do data.details[key] = value end end
    data.coords = sanitizeCoords(overrides.coords or overrides.callLocation) or getSourceCoords(source)
    return createCall(data)
end

local function mapGender(value)
    if value == 0 or value == '0' or value == 'male' or value == 'Male' then return 'Male' end
    if value == 1 or value == '1' or value == 'female' or value == 'Female' then return 'Female' end
end

local function getPlayerData(source)
    local player = getPlayer(source)
    local playerData = player and player.PlayerData
    if not playerData then return nil end
    local charinfo = type(playerData.charinfo) == 'table' and playerData.charinfo or {}
    local job = type(playerData.job) == 'table' and playerData.job or {}
    local name = (trimText(charinfo.firstname, 40) .. ' ' .. trimText(charinfo.lastname, 40)):gsub('^%s*(.-)%s*$', '%1')
    local info = {
        source = source, citizenid = trimText(playerData.citizenid, 64), name = name ~= '' and name or nil,
        phone = trimText(charinfo.phone, 32), gender = mapGender(charinfo.gender),
        job = { name = trimText(job.name, 32), label = trimText(job.label, 48), onduty = job.onduty == true },
    }
    local coords = getSourceCoords(source)
    if coords then info.coords = coords end
    return info
end

local function getUnitId(source)
    return ('unit:%d'):format(source)
end

local function sanitizeTacticalPoints(points, itemType)
    if itemType ~= 'MARKER' and itemType ~= 'ZONE' and itemType ~= 'ROUTE' then return nil end
    if type(points) ~= 'table' then return nil end
    local minimum = itemType == 'ZONE' and 3 or itemType == 'ROUTE' and 2 or 1
    if #points < minimum or #points > 64 then return nil end
    local sanitized = {}
    for _, point in ipairs(points) do
        local lat = tonumber(type(point) == 'table' and (point.lat or point[1]))
        local lng = tonumber(type(point) == 'table' and (point.lng or point[2]))
        if not lat or not lng or lat ~= lat or lng ~= lng or math.abs(lat) > 100000 or math.abs(lng) > 100000 then return nil end
        sanitized[#sanitized + 1] = { lat, lng }
    end
    return sanitized
end

local function tacticalCreator(source)
    local unit = units[getUnitId(source)]
    if unit and unit.callsign and unit.callsign ~= '' then return unit.callsign end
    local player = getPlayerData(source)
    return player and player.name or ('Dispatch %d'):format(source)
end

local function createTacticalItem(source, data)
    if type(data) ~= 'table' then return false end
    local itemType = trimText(data.type, 12):upper()
    local points = sanitizeTacticalPoints(data.points, itemType)
    if not points then return false end
    tacticalItemSequence = tacticalItemSequence + 1
    local item = {
        id = ('tactical:%d'):format(tacticalItemSequence), type = itemType, points = points,
        createdBy = tacticalCreator(source), createdAt = os.time(),
    }
    tacticalItems[item.id] = item
    queueFullDispatchSync()
    return true, item.id
end

local function updateTacticalItem(itemId, data)
    local item = type(itemId) == 'string' and tacticalItems[itemId]
    if not item or type(data) ~= 'table' then return false end
    local itemType = trimText(data.type or item.type, 12):upper()
    local points = sanitizeTacticalPoints(data.points, itemType)
    if not points then return false end
    item.type, item.points, item.updatedAt = itemType, points, os.time()
    queueFullDispatchSync()
    return true
end

local function deleteTacticalItem(itemId)
    if type(itemId) ~= 'string' or not tacticalItems[itemId] then return false end
    tacticalItems[itemId] = nil
    queueFullDispatchSync()
    return true
end

local function clearTacticalItems()
    if not next(tacticalItems) then return false end
    tacticalItems = {}
    queueFullDispatchSync()
    return true
end

local function sanitizeHeading(value)
    local heading = tonumber(value)
    if not heading then return nil end
    return heading % 360.0
end

local function sanitizeVehicle(vehicle)
    if type(vehicle) ~= 'table' then return nil end
    local sanitized = {
        label = trimText(vehicle.label or vehicle.name, 64),
        plate = trimText(vehicle.plate, 16),
        class = trimText(vehicle.class, 32),
        model = tonumber(vehicle.model),
    }
    if sanitized.label == '' and sanitized.plate == '' and not sanitized.model then return nil end
    return sanitized
end

local function getUnitCallsign(source)
    local player = getPlayer(source)
    local playerData = player and player.PlayerData or {}
    local metadata = type(playerData.metadata) == 'table' and playerData.metadata or {}
    local key = (Config.Units and Config.Units.callsignMetadataKey) or 'callsign'
    local state = Player(source) and Player(source).state or {}
    local candidates = {
        metadata[key], metadata.callsign, metadata.callSign, metadata.call_sign,
        metadata.radioCallsign, metadata.radio_callsign, playerData.callsign,
        playerData.callSign, playerData.job and playerData.job.callsign,
        state.callsign, state.callSign,
    }
    for _, candidate in ipairs(candidates) do
        local callsign = type(candidate) == 'number' and tostring(candidate) or trimText(candidate, 24)
        if callsign ~= '' and callsign:lower() ~= 'no callsign' and callsign:lower() ~= 'none' and callsign:lower() ~= 'n/a' then
            return callsign
        end
    end
    return ('UNIT-%d'):format(source)
end

local function updateUnitSnapshot(unit, snapshot)
    snapshot = type(snapshot) == 'table' and snapshot or {}
    local changed = false
    local coords = sanitizeCoords(snapshot.coords)
    if coords and (not unit.coords or unit.coords.x ~= coords.x or unit.coords.y ~= coords.y or unit.coords.z ~= coords.z) then
        unit.coords = coords
        changed = true
    end

    local heading = sanitizeHeading(snapshot.heading)
    if heading and unit.heading ~= heading then
        unit.heading = heading
        changed = true
    end

    if snapshot.vehicle ~= nil then
        local vehicle = sanitizeVehicle(snapshot.vehicle)
        local current = unit.vehicle or {}
        if not vehicle or current.label ~= vehicle.label or current.plate ~= vehicle.plate or current.class ~= vehicle.class or current.model ~= vehicle.model then
            unit.vehicle = vehicle
            changed = true
        end
    end
    -- A call wave owns the logical channel while the unit is active on it.
    if snapshot.radioChannel ~= nil and not unit.waveCallId then
        local radioChannel = trimText(tostring(snapshot.radioChannel), 32)
        if unit.radioChannel ~= radioChannel then
            unit.radioChannel = radioChannel
            changed = true
        end
    end
    return changed
end

local function registerUnit(source, snapshot)
    if not Config.Units or Config.Units.enabled == false or not isConfiguredJob(source) then return false end

    local player = getPlayerData(source)
    local job = getJob(source)
    local department = job and Config.Departments[job.name]
    if not player or not job or not department then return false end

    local unitId = getUnitId(source)
    local unit = units[unitId]
    local isNew = unit == nil
    if not unit then
        unit = {
            id = unitId,
            source = source,
            status = (Config.Units and Config.Units.defaultStatus) or 'AVAILABLE',
            coords = nil,
            heading = nil,
            vehicle = nil,
            radioChannel = '',
            currentCallId = nil,
        }
        units[unitId] = unit
    end

    local callsign = getUnitCallsign(source)
    local name = player.name or ('Unit %d'):format(source)
    local changed = unit.callsign ~= callsign or unit.name ~= name or unit.department ~= department.department or unit.job ~= job.name
    unit.callsign = callsign
    unit.name = name
    unit.department = department.department
    unit.job = job.name
    unit.isDispatcher = isDispatcher(source)
    changed = updateUnitSnapshot(unit, snapshot) or changed
    if not unit.coords and player.coords then
        unit.coords = player.coords
        changed = true
    end
    local group = getPatrolGroupForUnit(unit)
    if group then syncPatrolGroup(group) end
    if isNew or changed then queueFullDispatchSync() end
    return true, unit
end

local function makeUnitReference(unit)
    return { id = unit.id, source = unit.source, callsign = unit.callsign, name = unit.name, status = unit.status }
end

local function syncUnitState(unit)
    if not unit then return end
    local call = unit.currentCallId and calls[unit.currentCallId] or nil
    TriggerClientEvent('nmsh_dispatch:client:unitState', unit.source, {
        status = unit.status,
        currentCallId = unit.currentCallId,
        callCoords = call and call.coords or nil,
    })
end

local function findUnitInRoster(roster, unitId)
    if type(roster) ~= 'table' then return nil end
    for index, member in ipairs(roster) do
        if member.id == unitId then return index end
    end
end

local function removeUnitFromRoster(roster, unitId)
    local index = findUnitInRoster(roster, unitId)
    if index then table.remove(roster, index) return true end
    return false
end

local function syncUnitReference(call, unit)
    if not call or not unit then return end
    for _, roster in ipairs({ call.assignedUnits, call.respondingUnits }) do
        local index = findUnitInRoster(roster, unit.id)
        if index then roster[index] = makeUnitReference(unit) end
    end
end

local function getPatrolGroup(groupId)
    return type(groupId) == 'string' and patrolGroups[groupId] or nil
end

getPatrolGroupForUnit = function(unit)
    return unit and getPatrolGroup(unit.patrolGroupId) or nil
end

local function getPatrolMembers(group)
    local members = {}
    if not group then return members end
    for _, unitId in ipairs(group.memberIds or {}) do
        local unit = units[unitId]
        if unit then members[#members + 1] = unit end
    end
    return members
end

local function findPatrolMember(group, unitId)
    if not group then return nil end
    for index, memberId in ipairs(group.memberIds or {}) do
        if memberId == unitId then return index end
    end
end

syncPatrolGroup = function(group)
    if not group then return false end
    local members = getPatrolMembers(group)
    if #members == 0 then
        patrolGroups[group.id] = nil
        return false
    end

    local leader = units[group.leaderId]
    if not leader then
        leader = members[1]
        group.leaderId = leader.id
    end
    local statusOrder = { 'OUT_OF_SERVICE', 'BUSY', 'ON_SCENE', 'RESPONDING', 'ASSIGNED', 'AVAILABLE' }
    group.status = 'AVAILABLE'
    for _, status in ipairs(statusOrder) do
        for _, member in ipairs(members) do
            if member.status == status then
                group.status = status
                break
            end
        end
        if group.status == status then break end
    end
    group.coords = copyValue(leader.coords, 1)
    group.heading = leader.heading
    group.vehicle = copyValue(leader.vehicle, 1)
    group.department = leader.department
    group.job = leader.job
    group.radioChannel = leader.radioChannel

    local callId = members[1].currentCallId
    for index = 2, #members do
        if members[index].currentCallId ~= callId then
            callId = nil
            break
        end
    end
    group.currentCallId = callId
    return true
end

local function makePatrolReference(group)
    return { id = group.id, callsign = group.callsign, name = ('%d officer patrol'):format(#getPatrolMembers(group)), status = group.status, isGroup = true }
end

local function syncPatrolReference(call, group)
    if not call or not group then return end
    for _, roster in ipairs({ call.assignedUnits, call.respondingUnits }) do
        local index = findUnitInRoster(roster, group.id)
        if index then roster[index] = makePatrolReference(group) end
    end
end

local function syncPatrolState(group, call)
    if not syncPatrolGroup(group) then return end
    syncPatrolReference(call or (group.currentCallId and calls[group.currentCallId]), group)
end

captureCallUnitHistory = function(call)
    if not call then return end
    call.metadata = call.metadata or {}
    local history, byId = {}, {}
    for _, entry in ipairs(call.metadata.unitHistory or {}) do
        if entry.id then
            byId[entry.id] = copyValue(entry, 2)
            history[#history + 1] = byId[entry.id]
        end
    end
    local function capture(roster, fallback)
        for _, reference in ipairs(roster or {}) do
            local live = getPatrolGroup(reference.id) or units[reference.id]
            local entry = byId[reference.id]
            if not entry then
                entry = { id = reference.id }
                byId[reference.id] = entry
                history[#history + 1] = entry
            end
            entry.callsign = entry.callsign or (live and live.callsign) or reference.callsign
            entry.name = entry.name or (live and live.name) or reference.name
            entry.isGroup = reference.isGroup == true or (live and live.isGroup == true) or nil
            local outcome = (live and live.status) or reference.status or fallback
            if not entry.outcome or outcome ~= 'AVAILABLE' then entry.outcome = outcome end
            if entry.outcome == 'AVAILABLE' then entry.outcome = fallback end
        end
    end
    capture(call.assignedUnits, 'ASSIGNED')
    capture(call.respondingUnits, 'RESPONDING')
    call.metadata.unitHistory = history
end

local function canAssignUnitToCall(unit, call)
    return unit and call and (call.status == 'NEW' or call.status == 'ACTIVE')
        and isConfiguredJob(unit.source) and canReceiveCall(unit.source, call, getJob(unit.source))
end

local function getWaveChannel(wave)
    wave = tonumber(wave)
    local settings = Config.Waves or {}
    local firstWave = math.max(1, math.floor(tonumber(settings.first) or 3))
    local lastWave = math.max(firstWave, math.floor(tonumber(settings.last) or 10))
    if not wave or wave < firstWave or wave > lastWave or wave % 1 ~= 0 then return nil end
    local channels = type(settings.channels) == 'table' and settings.channels or {}
    local channel = trimText(tostring(channels[wave] or ('WAVE-%d'):format(wave)), 32)
    return channel ~= '' and channel or nil
end

local function pmaVoiceRunning()
    return GetResourceState('pma-voice') == 'started'
end

local function getPmaRadioChannel(source)
    if not pmaVoiceRunning() or not source then return nil end
    local player = Player(source)
    local channel = player and player.state and tonumber(player.state.radioChannel) or nil
    return channel and math.floor(channel) or nil
end

local function getWavePmaChannel(wave)
    local settings = Config.Waves or {}
    local channel = type(settings.pmaChannels) == 'table' and tonumber(settings.pmaChannels[tonumber(wave)]) or nil
    return channel and channel >= 0 and math.floor(channel) or nil
end

local function setPmaRadioChannel(unit, channel)
    if not unit or not pmaVoiceRunning() or type(channel) ~= 'number' then return false end
    local current = getPmaRadioChannel(unit.source)
    if current == channel then return true end
    local ok = pcall(function()
        exports['pma-voice']:setPlayerRadio(unit.source, channel)
    end)
    return ok
end

local function getCallWave(call)
    return call and call.metadata and tonumber(call.metadata.wave) or nil
end

local function isWaveTaken(wave, exceptCallId)
    for callId, call in pairs(calls) do
        if callId ~= exceptCallId and (call.status == 'NEW' or call.status == 'ACTIVE') and getCallWave(call) == wave then
            return true
        end
    end
    return false
end

local function moveUnitToCallWave(unit, call)
    local channel = getWaveChannel(getCallWave(call))
    if not unit or not call or not channel then return false end
    call.metadata.waveOriginalChannels = type(call.metadata.waveOriginalChannels) == 'table' and call.metadata.waveOriginalChannels or {}
    call.metadata.waveOriginalRadioChannels = type(call.metadata.waveOriginalRadioChannels) == 'table' and call.metadata.waveOriginalRadioChannels or {}
    if call.metadata.waveOriginalChannels[unit.id] == nil then
        call.metadata.waveOriginalChannels[unit.id] = unit.radioChannel or ''
    end
    local pmaChannel = getWavePmaChannel(getCallWave(call))
    local realChannel = getPmaRadioChannel(unit.source)
    if pmaChannel and call.metadata.waveOriginalRadioChannels[unit.id] == nil then
        call.metadata.waveOriginalRadioChannels[unit.id] = realChannel or 0
    end
    unit.waveCallId = call.id
    unit.waveChannel = channel
    unit.wavePmaChannel = pmaChannel
    unit.radioChannel = tostring(pmaChannel or channel)
    if pmaChannel then setPmaRadioChannel(unit, pmaChannel) end
    syncUnitState(unit)
    return true
end

local function restoreUnitFromCallWave(unit, call)
    if not unit or not call or unit.waveCallId ~= call.id then return false end
    local callChannel = unit.waveChannel or getWaveChannel(getCallWave(call))
    local original = type(call.metadata.waveOriginalChannels) == 'table' and call.metadata.waveOriginalChannels[unit.id] or nil
    local pmaChannel = unit.wavePmaChannel or getWavePmaChannel(getCallWave(call))
    local realChannel = getPmaRadioChannel(unit.source)
    local originalPma = type(call.metadata.waveOriginalRadioChannels) == 'table' and tonumber(call.metadata.waveOriginalRadioChannels[unit.id]) or nil
    -- Never override a channel the player changed after arriving on the Wave.
    if pmaChannel and originalPma and realChannel == pmaChannel then setPmaRadioChannel(unit, originalPma) end
    if pmaChannel and realChannel and realChannel ~= pmaChannel then
        unit.radioChannel = tostring(realChannel)
    elseif type(original) == 'string' and unit.radioChannel == tostring(pmaChannel or callChannel) then
        unit.radioChannel = original
    end
    unit.waveCallId = nil
    unit.waveChannel = nil
    unit.wavePmaChannel = nil
    syncUnitState(unit)
    return true
end

local function moveActiveUnitsToCallWave(call)
    for _, unit in pairs(units) do
        if unit.currentCallId == call.id and (unit.status == 'RESPONDING' or unit.status == 'ON_SCENE') then
            moveUnitToCallWave(unit, call)
        end
    end
end

local function setCallWave(callId, wave)
    local call = calls[callId]
    if not call or (call.status ~= 'NEW' and call.status ~= 'ACTIVE') then return false end
    wave = wave ~= nil and tonumber(wave) or nil
    if wave and not getWaveChannel(wave) then return false end
    if wave and isWaveTaken(wave, call.id) then return false end

    local current = getCallWave(call)
    if current == wave then return false end
    local hasActiveResponders = false
    for _, unit in pairs(units) do
        if unit.currentCallId == call.id and (unit.status == 'RESPONDING' or unit.status == 'ON_SCENE') then
            hasActiveResponders = true
            break
        end
    end
    if not wave and hasActiveResponders then return false end

    call.metadata.wave = wave
    if wave then
        moveActiveUnitsToCallWave(call)
        addCallTimeline(call, ('Wave %d assigned'):format(wave))
    else
        for _, unit in pairs(units) do restoreUnitFromCallWave(unit, call) end
        call.metadata.waveOriginalChannels = nil
        call.metadata.waveOriginalRadioChannels = nil
        addCallTimeline(call, ('Wave %d released'):format(current))
    end
    broadcastCall(call, 'nmsh_dispatch:client:updateAlert')
    queueFullDispatchSync()
    return true
end

local function isUnitWithinOnSceneRadius(unit, call)
    local unitCoords, callCoords = unit and unit.coords, call and call.coords
    if not unitCoords or not callCoords then return false end
    local radius = math.max(1.0, tonumber(Config.OnSceneRadius) or 40.0)
    local x, y, z = unitCoords.x - callCoords.x, unitCoords.y - callCoords.y, unitCoords.z - callCoords.z
    return (x * x) + (y * y) + (z * z) <= radius * radius
end

local function canAssignPatrolGroupToCall(group, call)
    if not group or not canAssignUnitToCall(units[group.leaderId], call) or group.currentCallId then return false end
    local members = getPatrolMembers(group)
    if #members < 2 then return false end
    for _, member in ipairs(members) do
        if member.patrolGroupId ~= group.id or member.status ~= 'AVAILABLE' or member.currentCallId
            or not canAssignUnitToCall(member, call) then
            return false
        end
    end
    return true
end

local function assignPatrolGroupToCall(callId, groupId)
    local call, group = calls[callId], getPatrolGroup(groupId)
    if not canAssignPatrolGroupToCall(group, call) or findUnitInRoster(call.assignedUnits, groupId) then return false end

    for _, member in ipairs(getPatrolMembers(group)) do
        member.currentCallId = callId
        member.status = 'ASSIGNED'
        syncUnitState(member)
    end
    syncPatrolState(group, call)
    call.assignedUnits[#call.assignedUnits + 1] = makePatrolReference(group)
    addCallTimeline(call, ('%s assigned'):format(group.callsign))
    broadcastCall(call, 'nmsh_dispatch:client:updateAlert')
    queueFullDispatchSync()
    return true, callId, groupId
end

local function unassignPatrolGroupFromCall(callId, groupId)
    local call, group = calls[callId], getPatrolGroup(groupId)
    if not call or not group then return false end
    local removed = removeUnitFromRoster(call.assignedUnits, groupId)
    removed = removeUnitFromRoster(call.respondingUnits, groupId) or removed
    if not removed and group.currentCallId ~= callId then return false end

    for _, member in ipairs(getPatrolMembers(group)) do
        if member.currentCallId == callId then
            restoreUnitFromCallWave(member, call)
            member.currentCallId = nil
            if member.status == 'ASSIGNED' or member.status == 'RESPONDING' or member.status == 'ON_SCENE' then
                member.status = 'AVAILABLE'
            end
            syncUnitState(member)
        end
    end
    syncPatrolState(group, call)
    if call.status == 'NEW' or call.status == 'ACTIVE' then
        addCallTimeline(call, ('%s unassigned'):format(group.callsign))
        broadcastCall(call, 'nmsh_dispatch:client:updateAlert')
    end
    queueFullDispatchSync()
    return true, callId, groupId
end

local function createPatrolGroup(data)
    if type(data) ~= 'table' then return false end
    local callsign = trimText(data.callsign, 24)
    if callsign == '' then return false end
    local memberIds, seen = {}, {}
    for _, unitId in ipairs(type(data.memberIds) == 'table' and data.memberIds or {}) do
        if type(unitId) == 'string' and not seen[unitId] then
            seen[unitId] = true
            memberIds[#memberIds + 1] = unitId
        end
    end
    local minimum = math.max(2, math.floor(tonumber((Config.PatrolGroups or {}).minimumMembers) or 2))
    if #memberIds < minimum then return false end
    local leaderId = type(data.leaderId) == 'string' and data.leaderId or memberIds[1]
    if not seen[leaderId] then return false end
    for _, unitId in ipairs(memberIds) do
        local unit = units[unitId]
        if not unit or unit.patrolGroupId or unit.status ~= 'AVAILABLE' or unit.currentCallId or not isConfiguredJob(unit.source) then return false end
    end
    patrolGroupSequence = patrolGroupSequence + 1
    local group = { id = ('patrol:%d'):format(patrolGroupSequence), callsign = callsign, leaderId = leaderId, memberIds = memberIds, status = 'AVAILABLE' }
    patrolGroups[group.id] = group
    for _, unitId in ipairs(memberIds) do units[unitId].patrolGroupId = group.id end
    syncPatrolGroup(group)
    queueFullDispatchSync()
    return true, group.id
end

local function addPatrolGroupMember(groupId, unitId)
    local group, unit = getPatrolGroup(groupId), units[unitId]
    if not group or not unit or group.currentCallId or unit.patrolGroupId or unit.status ~= 'AVAILABLE' or unit.currentCallId then return false end
    group.memberIds[#group.memberIds + 1] = unit.id
    unit.patrolGroupId = group.id
    syncPatrolGroup(group)
    queueFullDispatchSync()
    return true, group.id, unit.id
end

local function disbandPatrolGroup(groupId, reason)
    local group = getPatrolGroup(groupId)
    if not group then return false end
    if group.currentCallId then unassignPatrolGroupFromCall(group.currentCallId, group.id) end
    if removeTacTargetFromChannels then removeTacTargetFromChannels(group.id) end
    for _, member in ipairs(getPatrolMembers(group)) do
        member.patrolGroupId = nil
        if member.currentCallId == nil and (member.status == 'ASSIGNED' or member.status == 'RESPONDING' or member.status == 'ON_SCENE') then
            member.status = 'AVAILABLE'
        end
        syncUnitState(member)
    end
    patrolGroups[group.id] = nil
    queueFullDispatchSync()
    return true, reason
end

local function removePatrolGroupMember(groupId, unitId)
    local group = getPatrolGroup(groupId)
    if not group or not units[unitId] then return false end
    local index = findPatrolMember(group, unitId)
    if not index then return false end
    if group.currentCallId then unassignPatrolGroupFromCall(group.currentCallId, group.id) end
    table.remove(group.memberIds, index)
    local member = units[unitId]
    member.patrolGroupId = nil
    member.tacChannelId = nil
    member.currentCallId = nil
    if member.status == 'ASSIGNED' or member.status == 'RESPONDING' or member.status == 'ON_SCENE' then member.status = 'AVAILABLE' end
    syncUnitState(member)
    if #group.memberIds < math.max(2, math.floor(tonumber((Config.PatrolGroups or {}).minimumMembers) or 2)) then
        return disbandPatrolGroup(group.id, 'minimum_members')
    end
    if group.leaderId == unitId then group.leaderId = group.memberIds[1] end
    syncPatrolGroup(group)
    queueFullDispatchSync()
    return true, group.id, unitId
end

local function setPatrolGroupLeader(groupId, unitId)
    local group = getPatrolGroup(groupId)
    if not group or not findPatrolMember(group, unitId) then return false end
    group.leaderId = unitId
    syncPatrolGroup(group)
    queueFullDispatchSync()
    return true, group.id, unitId
end

local function getTacChannel(channelId)
    return type(channelId) == 'string' and tacChannels[channelId] or nil
end

local function findTacMember(channel, targetId)
    if not channel then return nil end
    for index, memberId in ipairs(channel.memberIds or {}) do
        if memberId == targetId then return index end
    end
end

local function getTacTarget(targetId)
    local group = getPatrolGroup(targetId)
    if group then return group, true end
    local unit = units[targetId]
    if unit then
        group = getPatrolGroupForUnit(unit)
        return group or unit, group ~= nil
    end
end

local function setTacTargetChannel(target, isGroup, channelId)
    if isGroup then
        target.tacChannelId = channelId
        for _, member in ipairs(getPatrolMembers(target)) do member.tacChannelId = channelId end
    else
        target.tacChannelId = channelId
    end
end

removeTacTargetFromChannels = function(targetId)
    local target, isGroup = getTacTarget(targetId)
    if not target then return false end
    local canonicalId = target.id
    local changed = false
    for _, channel in pairs(tacChannels) do
        local index = findTacMember(channel, canonicalId)
        if index then
            table.remove(channel.memberIds, index)
            changed = true
        end
    end
    setTacTargetChannel(target, isGroup, nil)
    return changed
end

clearCallTacChannel = function(callId)
    local call = calls[callId]
    if not call then return false end
    local channel = getTacChannel(call.tacChannelId)
    if channel and channel.callId == callId then channel.callId = nil end
    call.tacChannelId = nil
    queueFullDispatchSync()
    return channel ~= nil
end

local function createTacChannel(data)
    if type(data) ~= 'table' then return false end
    local name = trimText(data.name, 16):upper()
    local label = trimText(data.label, 64)
    local department = trimText(data.department, 32)
    if name == '' or label == '' then return false end
    for _, channel in pairs(tacChannels) do
        if channel.name == name then return false end
    end
    tacChannelSequence = tacChannelSequence + 1
    local channel = { id = ('tac:%d'):format(tacChannelSequence), name = name, label = label, department = department ~= '' and department or 'LSPD', callId = nil, memberIds = {} }
    tacChannels[channel.id] = channel
    queueFullDispatchSync()
    return true, channel.id
end

local function closeTacChannel(channelId)
    local channel = getTacChannel(channelId)
    if not channel then return false end
    if channel.callId then clearCallTacChannel(channel.callId) end
    for _, targetId in ipairs(copyValue(channel.memberIds, 1)) do removeTacTargetFromChannels(targetId) end
    for source, joinedId in pairs(tacJoins) do if joinedId == channel.id then tacJoins[source] = nil end end
    tacChannels[channel.id] = nil
    queueFullDispatchSync()
    return true, channelId
end

local function assignCallToTacChannel(channelId, callId)
    local channel, call = getTacChannel(channelId), calls[callId]
    if not channel or not call or (call.status ~= 'NEW' and call.status ~= 'ACTIVE') then return false end
    if channel.callId == call.id then
        return clearCallTacChannel(call.id)
    end
    if channel.callId then clearCallTacChannel(channel.callId) end
    if call.tacChannelId then clearCallTacChannel(call.id) end
    channel.callId = call.id
    call.tacChannelId = channel.id
    queueFullDispatchSync()
    return true, channel.id, call.id
end

local function assignTacTarget(channelId, targetId)
    local channel = getTacChannel(channelId)
    local target, isGroup = getTacTarget(targetId)
    if not channel or not target then return false end
    local canonicalId = target.id
    if target.tacChannelId == channel.id and findTacMember(channel, canonicalId) then return false end
    removeTacTargetFromChannels(canonicalId)
    channel.memberIds[#channel.memberIds + 1] = canonicalId
    setTacTargetChannel(target, isGroup, channel.id)
    queueFullDispatchSync()
    return true, channel.id, canonicalId
end

local function removeTacTarget(channelId, targetId)
    local channel = getTacChannel(channelId)
    local target, isGroup = getTacTarget(targetId)
    if not channel or not target then return false end
    local index = findTacMember(channel, target.id)
    if not index then return false end
    table.remove(channel.memberIds, index)
    if target.tacChannelId == channel.id then setTacTargetChannel(target, isGroup, nil) end
    queueFullDispatchSync()
    return true, channel.id, target.id
end

local function setTacJoin(source, channelId)
    if channelId ~= nil and not getTacChannel(channelId) then return false end
    tacJoins[source] = channelId
    queueFullDispatchSync()
    return true, channelId
end

local function assignUnitToCall(callId, unitId)
    if getPatrolGroup(unitId) then return assignPatrolGroupToCall(callId, unitId) end
    local call, unit = calls[callId], units[unitId]
    if not canAssignUnitToCall(unit, call) then return false end

    if findUnitInRoster(call.assignedUnits, unitId) then return false end
    if unit.currentCallId and unit.currentCallId ~= callId then return false end
    if unit.status ~= 'AVAILABLE' then return false end

    unit.currentCallId = callId
    unit.status = 'ASSIGNED'
    call.assignedUnits[#call.assignedUnits + 1] = makeUnitReference(unit)
    addCallTimeline(call, ('%s assigned'):format(unit.callsign))
    syncUnitState(unit)
    broadcastCall(call, 'nmsh_dispatch:client:updateAlert')
    queueFullDispatchSync()
    return true, callId, unitId
end

local function unassignUnitFromCall(callId, unitId)
    if getPatrolGroup(unitId) then return unassignPatrolGroupFromCall(callId, unitId) end
    local call, unit = calls[callId], units[unitId]
    if not call or not unit then return false end
    local group = getPatrolGroupForUnit(unit)
    if group and group.currentCallId == callId and findUnitInRoster(call.assignedUnits, group.id) then
        return unassignPatrolGroupFromCall(callId, group.id)
    end

    local removed = removeUnitFromRoster(call.assignedUnits, unitId)
    removed = removeUnitFromRoster(call.respondingUnits, unitId) or removed
    if not removed and unit.currentCallId ~= callId then return false end

    if unit.currentCallId == callId then
        restoreUnitFromCallWave(unit, call)
        unit.currentCallId = nil
        if unit.status == 'ASSIGNED' or unit.status == 'RESPONDING' or unit.status == 'ON_SCENE' then
            unit.status = 'AVAILABLE'
        end
        syncUnitState(unit)
    end
    if call.status == 'NEW' or call.status == 'ACTIVE' then
        addCallTimeline(call, ('%s unassigned'):format(unit.callsign))
        broadcastCall(call, 'nmsh_dispatch:client:updateAlert')
    end
    queueFullDispatchSync()
    return true, callId, unitId
end

local function respondUnitToCall(callId, unitId)
    local call, unit = calls[callId], units[unitId]
    if not canAssignUnitToCall(unit, call) then return false end

    local group = getPatrolGroupForUnit(unit)
    if group and group.currentCallId == callId and findUnitInRoster(call.assignedUnits, group.id) then
        if unit.status ~= 'ASSIGNED' and unit.status ~= 'RESPONDING' then return false end
        unit.status = 'RESPONDING'
        moveUnitToCallWave(unit, call)
        if not findUnitInRoster(call.respondingUnits, group.id) then
            call.respondingUnits[#call.respondingUnits + 1] = makePatrolReference(group)
        end
        addCallTimeline(call, ('%s responding'):format(unit.callsign))
        if call.status == 'NEW' then call.status = 'ACTIVE' end
        syncPatrolState(group, call)
        syncUnitState(unit)
        broadcastCall(call, 'nmsh_dispatch:client:updateAlert')
        queueFullDispatchSync()
        return true, callId, unitId
    end

    if not findUnitInRoster(call.assignedUnits, unitId) then
        local assigned = assignUnitToCall(callId, unitId)
        if not assigned then return false end
    end
    if unit.currentCallId ~= callId or (unit.status ~= 'ASSIGNED' and unit.status ~= 'RESPONDING') then return false end

    if not findUnitInRoster(call.respondingUnits, unitId) then
        call.respondingUnits[#call.respondingUnits + 1] = makeUnitReference(unit)
    end
    unit.status = 'RESPONDING'
    moveUnitToCallWave(unit, call)
    addCallTimeline(call, ('%s responding'):format(unit.callsign))
    syncUnitReference(call, unit)
    if call.status == 'NEW' then call.status = 'ACTIVE' end
    syncUnitState(unit)
    broadcastCall(call, 'nmsh_dispatch:client:updateAlert')
    queueFullDispatchSync()
    return true, callId, unitId
end

local function updateUnitStatus(unitId, status, callId)
    local unit = units[unitId]
    status = type(status) == 'string' and status:upper() or nil
    if not unit or not status or not unitStatuses[status] then return false end

    if status == 'ASSIGNED' then return assignUnitToCall(callId, unitId) end
    if status == 'RESPONDING' then return respondUnitToCall(callId, unitId) end
    if status == 'ON_SCENE' then
        local call = calls[callId or unit.currentCallId]
        if not canAssignUnitToCall(unit, call) or unit.currentCallId ~= call.id or unit.status ~= 'RESPONDING' then return false end
        unit.status = 'ON_SCENE'
        addCallTimeline(call, ('%s on scene'):format(unit.callsign))
        syncUnitReference(call, unit)
        syncPatrolState(getPatrolGroupForUnit(unit), call)
        syncUnitState(unit)
        broadcastCall(call, 'nmsh_dispatch:client:updateAlert')
        queueFullDispatchSync()
        return true, call.id, unitId
    end
    if status == 'AVAILABLE' then
        local group = getPatrolGroupForUnit(unit)
        if group and unit.currentCallId and group.currentCallId == unit.currentCallId then
            return unassignPatrolGroupFromCall(unit.currentCallId, group.id)
        end
        if unit.currentCallId then return unassignUnitFromCall(unit.currentCallId, unitId) end
        unit.status = 'AVAILABLE'
        syncUnitState(unit)
        queueFullDispatchSync()
        return true, unitId
    end
    if status == 'BUSY' or status == 'OUT_OF_SERVICE' then
        if unit.currentCallId then return false end
        unit.status = status
        syncUnitState(unit)
        queueFullDispatchSync()
        return true, unitId
    end
    return false
end

releaseUnitsFromCall = function(callId)
    local call = calls[callId]
    for _, unit in pairs(units) do
        if unit.currentCallId == callId then
            restoreUnitFromCallWave(unit, call)
            unit.currentCallId = nil
            if unit.status == 'ASSIGNED' or unit.status == 'RESPONDING' or unit.status == 'ON_SCENE' then
                unit.status = 'AVAILABLE'
            end
            syncUnitReference(call, unit)
            syncUnitState(unit)
        end
    end
    if call and call.metadata then
        call.metadata.wave = nil
        call.metadata.waveOriginalChannels = nil
        call.metadata.waveOriginalRadioChannels = nil
    end
    for _, group in pairs(patrolGroups) do
        if group.currentCallId == callId then syncPatrolState(group, call) end
    end
    queueFullDispatchSync()
end

local function removeUnit(source)
    local unitId = getUnitId(source)
    local unit = units[unitId]
    if not unit then return false end
    local group = getPatrolGroupForUnit(unit)
    if group then
        removePatrolGroupMember(group.id, unitId)
    elseif removeTacTargetFromChannels then
        removeTacTargetFromChannels(unitId)
    end
    units[unitId] = nil

    for _, call in pairs(calls) do
        local changed = false
        for _, field in ipairs({ 'assignedUnits', 'respondingUnits' }) do
            local roster = call[field]
            for index = #roster, 1, -1 do
                local member = roster[index]
                if member.source == source or member.id == unitId then
                    table.remove(roster, index)
                    changed = true
                end
            end
        end
        if changed and (call.status == 'NEW' or call.status == 'ACTIVE') then
            broadcastCall(call, 'nmsh_dispatch:client:updateAlert')
        end
    end
    queueFullDispatchSync()
    return true
end

local function updateUnit(unitId, updates)
    local unit = units[unitId]
    if not unit or type(updates) ~= 'table' or not isConfiguredJob(unit.source) then return false end

    local changed = updateUnitSnapshot(unit, updates)
    if updates.callsign ~= nil then
        local callsign = trimText(updates.callsign, 24)
        if callsign ~= '' and unit.callsign ~= callsign then
            unit.callsign = callsign
            changed = true
        end
    end
    if updates.status ~= nil then
        return updateUnitStatus(unitId, updates.status, updates.currentCallId)
    end
    if updates.currentCallId ~= nil then
        return updateUnitStatus(unitId, unit.status, updates.currentCallId)
    end
    local group = getPatrolGroupForUnit(unit)
    if group then syncPatrolGroup(group) end
    if changed then queueFullDispatchSync() end
    return true, unitId
end

Framework = detectFramework()

CreateThread(function()
    Framework = Framework or detectFramework()
    if not Framework then print('^1[nmsh_dispatch] qbx_core or qb-core must be started before this resource.^0') return end
    print(('[nmsh_dispatch] Using %s bridge.'):format(Framework))
end)

CreateThread(function()
    local settings = Config.Units or {}
    local interval = math.max(5000, math.floor(tonumber(settings.cleanupInterval) or 30000))
    while true do
        Wait(interval)
        if settings.enabled ~= false then
            for unitId, unit in pairs(units) do
                if not isConfiguredJob(unit.source) then removeUnit(unit.source) end
            end
        end
        for source in pairs(dispatcherSessions) do
            if not canJoinDispatcher(source) then clearDispatcherSession(source) end
        end
    end
end)

RegisterNetEvent('nmsh_dispatch:server:CreateDispatch', function(data)
    if source > 0 and Config.RestrictCreateEventToConfiguredJobs and not isConfiguredJob(source) then
        print(('[nmsh_dispatch] Rejected dispatch call request from source %s.'):format(source))
        return
    end
    createCall(data)
end)

RegisterNetEvent('nmsh_dispatch:server:CreatePredefinedDispatch', function(dispatchName, overrides)
    if source > 0 and Config.RestrictCreateEventToConfiguredJobs and not isConfiguredJob(source) then return end
    createPredefinedDispatch(dispatchName, source, overrides)
end)

RegisterNetEvent('nmsh_dispatch:server:resolveCallLocation', function(callId, street, area)
    local call = type(callId) == 'string' and calls[callId] or nil
    if not call or not canReceiveCall(source, call, getJob(source)) then return end
    local updates = {}
    if call.street == '' then updates.street = trimText(street, 80) end
    if call.area == '' then updates.area = trimText(area, 80) end
    if next(updates) then updateCall(callId, updates) end
end)

RegisterNetEvent('nmsh_dispatch:server:syncUnit', function(snapshot)
    registerUnit(source, snapshot)
end)

RegisterNetEvent('nmsh_dispatch:server:setDispatcherSession', function(enabled)
    if enabled ~= true then
        clearDispatcherSession(source)
        return
    end
    if isDispatcher(source) or not canJoinDispatcher(source) then return end
    local maximum = math.max(0, math.floor(tonumber((Config.Dispatcher or {}).MaxDispatchers) or 0))
    local count = 0
    for viewer in pairs(dispatcherSessions) do if isDispatcher(viewer) then count = count + 1 end end
    if maximum > 0 and count >= maximum then return end
    dispatcherSessions[source] = true
    local registered, unit = registerUnit(source)
    if registered then
        unit.dispatcherPreviousStatus = unit.status
        unit.isDispatcher = true
    end
    queueFullDispatchSync()
end)

RegisterNetEvent('nmsh_dispatch:server:validateDispatcherSession', function()
    if not canJoinDispatcher(source) then clearDispatcherSession(source) end
end)

RegisterNetEvent('nmsh_dispatch:server:updateUnitStatus', function(status, callId)
    local registered, unit = registerUnit(source)
    if registered then updateUnitStatus(unit.id, status, callId) end
end)

RegisterNetEvent('nmsh_dispatch:server:removeUnit', function()
    removeUnit(source)
end)

RegisterNetEvent('nmsh_dispatch:server:requestUnits', function()
    if not isConfiguredJob(source) then return end
    local snapshot = {}
    for unitId, unit in pairs(units) do snapshot[unitId] = copyValue(unit, 3) end
    TriggerClientEvent('nmsh_dispatch:client:unitsSynced', source, snapshot)
end)

RegisterNetEvent('nmsh_dispatch:server:openFullDispatch', function()
    if not isConfiguredJob(source) and not isDispatcher(source) then return end
    fullDispatchViewers[source] = true
    sendFullDispatchState(source)
end)

RegisterNetEvent('nmsh_dispatch:server:closeFullDispatch', function()
    fullDispatchViewers[source] = nil
end)

local function canManageFullDispatchCall(source, callId)
    local call = calls[callId]
    return call and isConfiguredJob(source) and canReceiveCall(source, call, getJob(source))
end

RegisterNetEvent('nmsh_dispatch:server:fullDispatchAssign', function(callId, unitId)
    if type(callId) ~= 'string' or type(unitId) ~= 'string' or not canManageFullDispatchCall(source, callId) then return end
    if getPatrolGroup(unitId) and not isDispatcher(source) then return end
    assignUnitToCall(callId, unitId)
end)

RegisterNetEvent('nmsh_dispatch:server:fullDispatchUnassign', function(callId, unitId)
    if type(callId) ~= 'string' or type(unitId) ~= 'string' or not canManageFullDispatchCall(source, callId) then return end
    if getPatrolGroup(unitId) and not isDispatcher(source) then return end
    unassignUnitFromCall(callId, unitId)
end)

RegisterNetEvent('nmsh_dispatch:server:fullDispatchRespond', function(callId, unitId)
    if isDispatcher(source) or type(callId) ~= 'string' or type(unitId) ~= 'string' or not canManageFullDispatchCall(source, callId) then return end
    local group = getPatrolGroup(unitId)
    if group then
        local member = units[getUnitId(source)]
        if not member or member.patrolGroupId ~= group.id then return end
        respondUnitToCall(callId, member.id)
        return
    end
    respondUnitToCall(callId, unitId)
end)

RegisterNetEvent('nmsh_dispatch:server:dispatcherCreatePatrolGroup', function(data)
    if not isDispatcher(source) then return end
    createPatrolGroup(data)
end)

RegisterNetEvent('nmsh_dispatch:server:dispatcherAddPatrolMember', function(groupId, unitId)
    if not isDispatcher(source) or type(groupId) ~= 'string' or type(unitId) ~= 'string' then return end
    addPatrolGroupMember(groupId, unitId)
end)

RegisterNetEvent('nmsh_dispatch:server:dispatcherRemovePatrolMember', function(groupId, unitId)
    if not isDispatcher(source) or type(groupId) ~= 'string' or type(unitId) ~= 'string' then return end
    removePatrolGroupMember(groupId, unitId)
end)

RegisterNetEvent('nmsh_dispatch:server:dispatcherSetPatrolLeader', function(groupId, unitId)
    if not isDispatcher(source) or type(groupId) ~= 'string' or type(unitId) ~= 'string' then return end
    setPatrolGroupLeader(groupId, unitId)
end)

RegisterNetEvent('nmsh_dispatch:server:dispatcherDisbandPatrolGroup', function(groupId)
    if not isDispatcher(source) or type(groupId) ~= 'string' then return end
    disbandPatrolGroup(groupId, 'dispatcher')
end)

RegisterNetEvent('nmsh_dispatch:server:dispatcherCreateTacChannel', function(data)
    if not isDispatcher(source) then return end
    local _, service = getSourceService(source)
    if not service or type(data) ~= 'table' then return end
    data.department = service.department
    createTacChannel(data)
end)

RegisterNetEvent('nmsh_dispatch:server:dispatcherCloseTacChannel', function(channelId)
    if not isDispatcher(source) or type(channelId) ~= 'string' then return end
    closeTacChannel(channelId)
end)

RegisterNetEvent('nmsh_dispatch:server:dispatcherAssignCallTac', function(channelId, callId)
    if not isDispatcher(source) or type(channelId) ~= 'string' or type(callId) ~= 'string' then return end
    assignCallToTacChannel(channelId, callId)
end)

RegisterNetEvent('nmsh_dispatch:server:dispatcherAssignTacTarget', function(channelId, targetId)
    if not isDispatcher(source) or type(channelId) ~= 'string' or type(targetId) ~= 'string' then return end
    assignTacTarget(channelId, targetId)
end)

RegisterNetEvent('nmsh_dispatch:server:dispatcherRemoveTacTarget', function(channelId, targetId)
    if not isDispatcher(source) or type(channelId) ~= 'string' or type(targetId) ~= 'string' then return end
    removeTacTarget(channelId, targetId)
end)

RegisterNetEvent('nmsh_dispatch:server:joinTacChannel', function(channelId)
    if not isConfiguredJob(source) or type(channelId) ~= 'string' then return end
    setTacJoin(source, channelId)
end)

RegisterNetEvent('nmsh_dispatch:server:leaveTacChannel', function()
    if not isConfiguredJob(source) then return end
    setTacJoin(source, nil)
end)

RegisterNetEvent('nmsh_dispatch:server:setTacticalOverlayVisibility', function(visible)
    if not isConfiguredJob(source) then return end
    tacticalOverlayVisibility[source] = visible ~= false
    sendFullDispatchState(source)
end)

RegisterNetEvent('nmsh_dispatch:server:dispatcherCreateTacticalItem', function(data)
    if not isDispatcher(source) then return end
    createTacticalItem(source, data)
end)

RegisterNetEvent('nmsh_dispatch:server:dispatcherUpdateTacticalItem', function(itemId, data)
    if not isDispatcher(source) or type(itemId) ~= 'string' then return end
    updateTacticalItem(itemId, data)
end)

RegisterNetEvent('nmsh_dispatch:server:dispatcherDeleteTacticalItem', function(itemId)
    if not isDispatcher(source) then return end
    deleteTacticalItem(itemId)
end)

RegisterNetEvent('nmsh_dispatch:server:dispatcherClearTacticalItems', function()
    if not isDispatcher(source) then return end
    clearTacticalItems()
end)

local function dispatcherCall(callId)
    return isDispatcher(source) and type(callId) == 'string' and calls[callId]
        and canReceiveCall(source, calls[callId], getJob(source))
end

RegisterNetEvent('nmsh_dispatch:server:dispatcherCreateCall', function(data)
    if not isDispatcher(source) or type(data) ~= 'table' then return end
    local job = getJob(source)
    local service = job and Config.Departments[job.name]
    if not service then return end
    data.targetJobs = { [job.name] = true }
    data.department = service.department
    local success, callId = createCall(data)
    if success then addCallTimeline(calls[callId], 'Dispatcher created call') end
end)

RegisterNetEvent('nmsh_dispatch:server:dispatcherEditCall', function(callId, updates)
    if not dispatcherCall(callId) or type(updates) ~= 'table' then return end

    -- Dispatcher edits are intentionally limited to the fields exposed by the
    -- Full Dispatch form. Resolving, archiving, recipient routing, and metadata
    -- remain separate server-authoritative actions.
    local safeUpdates = {}
    for _, key in ipairs({ 'code', 'title', 'description', 'priority', 'department', 'coords', 'street', 'area' }) do
        if updates[key] ~= nil then safeUpdates[key] = updates[key] end
    end

    if not updateCall(callId, safeUpdates) then return end
    addCallTimeline(calls[callId], 'Dispatcher updated call')
end)

RegisterNetEvent('nmsh_dispatch:server:dispatcherResolveCall', function(callId)
    if not dispatcherCall(callId) then return end
    addCallTimeline(calls[callId], 'Dispatcher resolved call')
    resolveCall(callId)
end)

RegisterNetEvent('nmsh_dispatch:server:dispatcherSetCallWave', function(callId, wave)
    if not dispatcherCall(callId) then return end
    setCallWave(callId, wave)
end)

RegisterNetEvent('nmsh_dispatch:server:dispatcherResolveCallAs', function(callId, result)
    if not dispatcherCall(callId) then return end
    local labels = { CLEARED = 'Cleared', UNFOUNDED = 'Unfounded', NO_UNITS = 'No Units' }
    result = type(result) == 'string' and result:upper() or nil
    if not labels[result] then return end
    calls[callId].metadata.resolveAs = result
    addCallTimeline(calls[callId], ('Resolved as %s'):format(labels[result]))
    resolveCall(callId)
end)

RegisterNetEvent('nmsh_dispatch:server:dispatcherReopenCall', function(callId)
    if not dispatcherCall(callId) or (calls[callId].status ~= 'RESOLVED' and calls[callId].status ~= 'ARCHIVED') then return end
    local call = calls[callId]
    call.status = 'NEW'
    heatmapDirty = true
    call.resolvedAt = nil
    call.archivedAt = nil
    local duration = getHudDuration({}, call.metadata.panic == true)
    call.metadata.hudExpiresAt = duration and os.time() + duration or nil
    addCallTimeline(call, 'Dispatcher reopened call')
    broadcastCall(call, 'nmsh_dispatch:client:addAlert')
    queueFullDispatchSync()
end)

RegisterNetEvent('nmsh_dispatch:server:dispatcherArchiveCall', function(callId)
    if not dispatcherCall(callId) or calls[callId].status ~= 'RESOLVED' then return end
    addCallTimeline(calls[callId], 'Dispatcher archived call')
    archiveCall(callId)
end)

RegisterNetEvent('nmsh_dispatch:server:dispatcherAddNote', function(callId, note)
    if not dispatcherCall(callId) then return end
    note = trimText(note, 160)
    if note == '' then return end
    calls[callId].metadata.notes = calls[callId].metadata.notes or {}
    calls[callId].metadata.notes[#calls[callId].metadata.notes + 1] = { at = os.time(), text = note }
    while #calls[callId].metadata.notes > 12 do table.remove(calls[callId].metadata.notes, 1) end
    addCallTimeline(calls[callId], ('Note: %s'):format(note))
    broadcastCall(calls[callId], 'nmsh_dispatch:client:updateAlert')
    queueFullDispatchSync()
end)

RegisterNetEvent('nmsh_dispatch:server:dispatcherAcknowledgePanic', function(callId)
    if not dispatcherCall(callId) or calls[callId].metadata.panic ~= true then return end
    calls[callId].metadata.panicAcknowledged = true
    addCallTimeline(calls[callId], 'Dispatcher acknowledged panic')
    broadcastCall(calls[callId], 'nmsh_dispatch:client:updateAlert')
    queueFullDispatchSync()
end)

RegisterNetEvent('nmsh_dispatch:server:assignUnitToCall', function(callId)
    local registered, unit = registerUnit(source)
    if registered then assignUnitToCall(callId, unit.id) end
end)

RegisterNetEvent('nmsh_dispatch:server:unassignUnitFromCall', function(callId)
    local unit = units[getUnitId(source)]
    if unit then unassignUnitFromCall(callId, unit.id) end
end)

RegisterNetEvent('nmsh_dispatch:server:unitOnScene', function(callId)
    if Config.AutoOnScene == false then return end
    local unit = units[getUnitId(source)]
    local call = calls[callId]
    if unit and isUnitWithinOnSceneRadius(unit, call) then updateUnitStatus(unit.id, 'ON_SCENE', callId) end
end)

RegisterNetEvent('nmsh_dispatch:server:respondToCall', function(callId)
    local call = calls[callId]
    if not call or (call.status ~= 'NEW' and call.status ~= 'ACTIVE') or not canReceiveCall(source, call, getJob(source)) then return end
    local registered, unit = registerUnit(source)
    if not registered then return end
    respondUnitToCall(callId, unit.id)
end)

RegisterNetEvent('nmsh_dispatch:server:reportShooting', function()
    local settings = Config.AutomaticAlerts and Config.AutomaticAlerts.shooting
    if not settings or settings.enabled == false then return end
    local job = getJob(source)
    if settings.alertOnDutyPolice ~= true and job and job.name == 'police' and job.onduty == true then return end
    local now, cooldown = GetGameTimer(), math.max(1000, math.floor(tonumber(settings.cooldown) or 60000))
    if shootingAlertCooldowns[source] and now - shootingAlertCooldowns[source] < cooldown then return end
    shootingAlertCooldowns[source] = now
    createPredefinedDispatch('Shooting', source)
end)

RegisterNetEvent('nmsh_dispatch:server:triggerPanic', function()
    local job = getJob(source)
    local jobName = job and job.name
    local settings = Config.Panic or {}
    if settings.enabled == false or not jobName or type(settings.allowedJobs) ~= 'table' or not settings.allowedJobs[jobName]
        or (Config.RequireOnDuty and job.onduty ~= true) then return end
    local now, cooldown = os.time(), math.max(0, math.floor(tonumber(settings.cooldown) or 0))
    if cooldown > 0 and panicCooldowns[source] and now - panicCooldowns[source] < cooldown then return end
    local success = createPredefinedDispatch(settings.dispatch, source)
    if success then panicCooldowns[source] = now end
end)

AddEventHandler('playerDropped', function()
    shootingAlertCooldowns[source], panicCooldowns[source] = nil, nil
    fullDispatchViewers[source] = nil
    tacJoins[source] = nil
    tacticalOverlayVisibility[source] = nil
    dispatcherSessions[source] = nil
    removeUnit(source)
end)

exports('CreateDispatch', createCall)
exports('CreateCall', createCall)
exports('UpdateCall', updateCall)
exports('ResolveCall', resolveCall)
exports('ArchiveCall', archiveCall)
exports('RemoveCall', removeCall)
exports('GetCall', function(callId) return copyValue(calls[callId], 4) end)
exports('GetCallHistory', getCallHistory)
exports('GetTacticalItems', function()
    local snapshot = {}
    for _, item in pairs(tacticalItems) do snapshot[#snapshot + 1] = toFullDispatchTacticalItem(item) end
    table.sort(snapshot, function(a, b) return (a.createdAt or 0) < (b.createdAt or 0) end)
    return snapshot
end)
exports('RegisterUnit', registerUnit)
exports('UpdateUnit', updateUnit)
exports('UpdateUnitStatus', updateUnitStatus)
exports('RemoveUnit', removeUnit)
exports('GetUnit', function(unitId) return copyValue(units[unitId], 3) end)
exports('GetUnitBySource', function(source) return copyValue(units[getUnitId(source)], 3) end)
exports('GetUnits', function()
    local snapshot = {}
    for unitId, unit in pairs(units) do snapshot[unitId] = copyValue(unit, 3) end
    return snapshot
end)
exports('CreatePatrolGroup', createPatrolGroup)
exports('AddPatrolGroupMember', addPatrolGroupMember)
exports('RemovePatrolGroupMember', removePatrolGroupMember)
exports('SetPatrolGroupLeader', setPatrolGroupLeader)
exports('DisbandPatrolGroup', disbandPatrolGroup)
exports('GetPatrolGroup', function(groupId) return copyValue(getPatrolGroup(groupId), 3) end)
exports('GetPatrolGroups', function()
    local snapshot = {}
    for groupId, group in pairs(patrolGroups) do snapshot[groupId] = copyValue(group, 3) end
    return snapshot
end)
exports('CreateTacChannel', createTacChannel)
exports('CloseTacChannel', closeTacChannel)
exports('AssignCallToTacChannel', assignCallToTacChannel)
exports('AssignTacTarget', assignTacTarget)
exports('RemoveTacTarget', removeTacTarget)
exports('GetTacChannel', function(channelId) return copyValue(getTacChannel(channelId), 3) end)
exports('GetTacChannels', function()
    local snapshot = {}
    for channelId, channel in pairs(tacChannels) do snapshot[channelId] = copyValue(channel, 3) end
    return snapshot
end)
exports('AssignUnitToCall', assignUnitToCall)
exports('UnassignUnitFromCall', unassignUnitFromCall)
exports('GetCallUnits', function(callId)
    local call = calls[callId]
    if not call then return nil end
    return {
        assignedUnits = copyValue(call.assignedUnits, 2),
        respondingUnits = copyValue(call.respondingUnits, 2),
    }
end)
exports('GetPlayerData', getPlayerData)
exports('GetPlayerInfo', getPlayerData)

for dispatchName, preset in pairs(Config.PredefinedDispatches or {}) do
    local exportName = type(preset) == 'table' and preset.export or dispatchName
    if type(exportName) == 'string' and exportName ~= '' then
        local dispatchId = dispatchName
        exports(exportName, function(source, overrides) return createPredefinedDispatch(dispatchId, source, overrides) end)
    end
end
