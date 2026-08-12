local Framework
local calls = {}
local callSequence = 0
local shootingAlertCooldowns = {}
local panicCooldowns = {}

local callStatuses = { NEW = true, ACTIVE = true, RESOLVED = true, ARCHIVED = true }
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

local function getDuration(data, isPanic)
    local settings = Config.AlertExpiration
    if not settings or settings.enabled == false then return nil end
    local fallback = isPanic and settings.panicSeconds or settings.defaultSeconds
    local duration = math.floor(tonumber(data.durationSeconds or data.duration) or fallback or 180)
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
    local duration = getDuration(data, isPanic)
    metadata.expiresAt = duration and now + duration or nil
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
        expiresAt = metadata.expiresAt,
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
    if updates.priority ~= nil then call.priority = normalizePriority(updates.priority, updates.panic == true or call.metadata.panic == true) end
    if updates.panic ~= nil then call.metadata.panic = updates.panic == true end

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
        if call.status == 'RESOLVED' then call.resolvedAt = os.time() else call.archivedAt = os.time() end
        removeCallFromHud(call.id)
    else
        broadcastCall(call, 'nmsh_dispatch:client:updateAlert')
    end
    return true, call.id
end

local function resolveCall(callId)
    return updateCall(callId, { status = 'RESOLVED' })
end

local function archiveCall(callId)
    return updateCall(callId, { status = 'ARCHIVED' })
end

local function removeCall(callId)
    if not calls[callId] then return false end
    removeCallFromHud(callId)
    calls[callId] = nil
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

Framework = detectFramework()

CreateThread(function()
    Framework = Framework or detectFramework()
    if not Framework then print('^1[nmsh_dispatch] qbx_core or qb-core must be started before this resource.^0') return end
    print(('[nmsh_dispatch] Using %s bridge.'):format(Framework))
end)

CreateThread(function()
    local settings = Config.AlertExpiration or {}
    local interval = math.max(1000, math.floor(tonumber(settings.checkInterval) or 5000))
    while true do
        Wait(interval)
        if settings.enabled ~= false then
            local now = os.time()
            for callId, call in pairs(calls) do
                if (call.status == 'NEW' or call.status == 'ACTIVE') and call.metadata.expiresAt and call.metadata.expiresAt <= now then
                    archiveCall(callId)
                end
            end
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

RegisterNetEvent('nmsh_dispatch:server:respondToCall', function(callId)
    local call = calls[callId]
    if not call or (call.status ~= 'NEW' and call.status ~= 'ACTIVE') or not canReceiveCall(source, call, getJob(source)) then return end
    for _, unit in ipairs(call.respondingUnits) do if unit.source == source then return end end
    call.respondingUnits[#call.respondingUnits + 1] = { source = source }
    if call.status == 'NEW' then call.status = 'ACTIVE' end
    broadcastCall(call, 'nmsh_dispatch:client:updateAlert')
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
end)

exports('CreateDispatch', createCall)
exports('CreateCall', createCall)
exports('UpdateCall', updateCall)
exports('ResolveCall', resolveCall)
exports('ArchiveCall', archiveCall)
exports('RemoveCall', removeCall)
exports('GetCall', function(callId) return copyValue(calls[callId], 4) end)
exports('GetPlayerData', getPlayerData)
exports('GetPlayerInfo', getPlayerData)

for dispatchName, preset in pairs(Config.PredefinedDispatches or {}) do
    local exportName = type(preset) == 'table' and preset.export or dispatchName
    if type(exportName) == 'string' and exportName ~= '' then
        local dispatchId = dispatchName
        exports(exportName, function(source, overrides) return createPredefinedDispatch(dispatchId, source, overrides) end)
    end
end
