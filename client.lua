local alerts = {}
local selectedIndex = 1
local Framework
local playerLoaded = false
local currentJob
local cursorActive = false
local dispatchEnabled = false
local manualPanelOpen = false
local panelSuppressedByUser = false
local dismissedAlertIds = {}
local alertBlips = {}
local respondControlHash = joaat('+' .. Config.Respond.command) | 0x80000000
local lastRespondKey
local lastAlertSoundAt = 0
local lastShootingAlertAt = 0

local function detectFramework()
    if (Config.Framework == 'qbox' or Config.Framework == 'auto') and GetResourceState('qbx_core') == 'started' then
        return 'qbox'
    end

    if (Config.Framework == 'qbcore' or Config.Framework == 'auto') and GetResourceState('qb-core') == 'started' then
        return 'qbcore'
    end
end

local function getPlayerJob()
    Framework = Framework or detectFramework()

    if Framework == 'qbox' then
        local playerData = exports.qbx_core:GetPlayerData()
        return playerData and playerData.job
    end

    if Framework == 'qbcore' then
        local core = exports['qb-core']:GetCoreObject()
        local playerData = core.Functions.GetPlayerData()
        return playerData and playerData.job
    end
end

local function isPlayerAlreadyLoaded()
    Framework = Framework or detectFramework()
    if Framework == 'qbox' then
        return LocalPlayer.state.isLoggedIn == true
    end

    if Framework == 'qbcore' then
        local core = exports['qb-core']:GetCoreObject()
        local playerData = core.Functions.GetPlayerData()
        return playerData and playerData.citizenid ~= nil
    end

    return false
end

local function canReceiveAlerts(job)
    return job and Config.Departments[job.name] ~= nil
        and (not Config.RequireOnDuty or job.onduty == true)
end

local function closeCursor()
    if not cursorActive then return end
    cursorActive = false
    SetNuiFocus(false, false)
    SendNUIMessage({ action = 'cursor', active = false })
end

local function removeAlertBlip(alertId)
    local blip = alertBlips[alertId]
    if blip and DoesBlipExist(blip) then RemoveBlip(blip) end
    alertBlips[alertId] = nil
end

local function removeAllAlertBlips()
    for alertId in pairs(alertBlips) do removeAlertBlip(alertId) end
end

local function createAlertBlip(alert)
    local settings = Config.Blips
    if not settings or settings.enabled == false or type(alert) ~= 'table' or type(alert.coords) ~= 'table' then return end

    local alertId = alert.id
    if type(alertId) ~= 'string' or alertId == '' then return end
    removeAlertBlip(alertId)

    local custom = type(alert.blip) == 'table' and alert.blip or {}
    local blip = AddBlipForCoord(alert.coords.x + 0.0, alert.coords.y + 0.0, alert.coords.z + 0.0)
    local sprite = tonumber(custom.sprite) or tonumber(settings.sprite) or 161
    local scale = tonumber(custom.scale) or tonumber(settings.scale) or 0.8
    local color = tonumber(custom.colour or custom.color) or tonumber(settings.colour) or 1
    local flashes = settings.flashes == true
    if type(custom.flashes) == 'boolean' then flashes = custom.flashes end
    local label = type(custom.text) == 'string' and custom.text ~= '' and custom.text
        or ('%s • %s'):format(alert.code or 'DISPATCH', alert.title or 'Alert')

    SetBlipSprite(blip, sprite)
    SetBlipScale(blip, scale)
    SetBlipColour(blip, color)
    SetBlipAsShortRange(blip, false)
    SetBlipFlashes(blip, flashes)
    if flashes and tonumber(custom.time) and tonumber(custom.time) > 0 then
        SetBlipFlashTimer(blip, math.floor(tonumber(custom.time)))
    end
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentString(label)
    EndTextCommandSetBlipName(blip)
    alertBlips[alertId] = blip
end

local function clearAlerts(preservePanel)
    alerts = {}
    selectedIndex = 1
    removeAllAlertBlips()
    if not preservePanel then manualPanelOpen = false end
    SendNUIMessage({ action = 'hide' })
    closeCursor()
end

local function getRespondKey()
    local key = GetControlInstructionalButton(0, respondControlHash, true)
    if type(key) ~= 'string' or key == '' then return Config.Respond.defaultKey end
    return key:sub(3):upper()
end

local function syncRespondKey(force)
    local key = getRespondKey()
    if force or key ~= lastRespondKey then
        lastRespondKey = key
        SendNUIMessage({ action = 'respondKey', key = key })
    end
    return key
end

local function playAlertSound(alert)
    if not Config.Sounds.enabled then return end

    local now = GetGameTimer()
    if now - lastAlertSoundAt < Config.Sounds.cooldown then return end
    lastAlertSoundAt = now

    local sound = alert.panic and Config.Sounds.panic or Config.Sounds.priorities[alert.priority]
    if type(sound) ~= 'table' or type(sound.name) ~= 'string' or type(sound.set) ~= 'string' then return end

    CreateThread(function()
        local repeatCount = alert.panic and math.max(1, math.floor(tonumber(sound.repeatCount) or 1)) or 1
        local interval = math.max(0, math.floor(tonumber(sound.interval) or 0))
        for index = 1, repeatCount do
            PlaySoundFrontend(-1, sound.name, sound.set, true)
            if index < repeatCount and interval > 0 then Wait(interval) end
        end
    end)
end

local function showEmptyPanel()
    if not dispatchEnabled or not currentJob then return end
    local department = Config.Departments[currentJob.name]
    if not department then return end

    SendNUIMessage({
        action = 'empty',
        department = department.department,
        channel = department.channel,
        theme = department.theme,
        icon = department.icon,
        colors = department.colors,
        respondKey = syncRespondKey(),
    })
end

local function clearAlertQueue(keepPanelOpen)
    for index = 1, #alerts do
        local alertId = alerts[index].id
        if alertId then dismissedAlertIds[alertId] = true end
    end

    alerts = {}
    selectedIndex = 1
    removeAllAlertBlips()
    if keepPanelOpen and dispatchEnabled then
        manualPanelOpen = true
        showEmptyPanel()
    else
        clearAlerts()
    end
end

local function updateDispatchAccess(job, loaded)
    if loaded ~= nil then playerLoaded = loaded end

    local previousJobName = currentJob and currentJob.name
    local previousDuty = currentJob and currentJob.onduty
    local wasEnabled = dispatchEnabled
    currentJob = job
    dispatchEnabled = playerLoaded and canReceiveAlerts(currentJob) or false

    if not dispatchEnabled then
        panelSuppressedByUser = false
        local jobChanged = previousJobName ~= (currentJob and currentJob.name)
        local dutyChanged = previousDuty ~= (currentJob and currentJob.onduty)
        if wasEnabled or jobChanged or dutyChanged or #alerts > 0 or cursorActive then clearAlerts() end
        return
    end

    if not wasEnabled or previousJobName ~= currentJob.name then
        panelSuppressedByUser = false
        manualPanelOpen = Config.Panel.showByDefault == true
        clearAlerts(true)
        if manualPanelOpen then showEmptyPanel() end
    end
end

local function currentAlert()
    return alerts[selectedIndex]
end

local syncUi

local function applyResponderState(alert)
    alert.responders = type(alert.responders) == 'table' and alert.responders or {}
    local localSource = GetPlayerServerId(PlayerId())
    alert.responding = false
    for index = 1, #alert.responders do
        local responder = alert.responders[index]
        if type(responder) == 'table' and responder.source == localSource then
            responder.isLocal = true
            alert.responding = true
        end
    end
end

local function removeAlertById(alertId)
    if type(alertId) ~= 'string' or alertId == '' then return end

    for index = #alerts, 1, -1 do
        if alerts[index].id == alertId then
            removeAlertBlip(alertId)
            table.remove(alerts, index)
            if selectedIndex > #alerts then selectedIndex = #alerts end
            if selectedIndex < 1 then selectedIndex = 1 end
            syncUi('update')
            return
        end
    end
end

syncUi = function(action)
    if panelSuppressedByUser then
        SendNUIMessage({ action = 'hide' })
        return
    end

    local alert = currentAlert()
    if not alert then
        if manualPanelOpen and dispatchEnabled and currentJob then
            showEmptyPanel()
            return
        end

        SendNUIMessage({ action = 'hide' })
        return
    end

    SendNUIMessage({
        action = action or 'update',
        alert = alert,
        index = selectedIndex,
        total = #alerts,
        respondKey = syncRespondKey(),
    })
end

local function openDispatchPanel()
    if not dispatchEnabled then return end
    panelSuppressedByUser = false
    manualPanelOpen = true
    syncUi(#alerts > 0 and 'update' or 'empty')
end

local function closeDispatchPanel()
    panelSuppressedByUser = true
    manualPanelOpen = false
    SendNUIMessage({ action = 'hide' })
    closeCursor()
end

local function toggleDispatchPanel()
    local isOpen = not panelSuppressedByUser and (manualPanelOpen or #alerts > 0)
    if isOpen then
        closeDispatchPanel()
    else
        openDispatchPanel()
    end
end

local function previousAlert()
    if #alerts == 0 or selectedIndex <= 1 then return end
    selectedIndex = selectedIndex - 1
    syncUi('switch')
end

local function nextAlert()
    if #alerts == 0 or selectedIndex >= #alerts then return end
    selectedIndex = selectedIndex + 1
    syncUi('switch')
end

local function respondToAlert()
    local alert = currentAlert()
    if not alert or alert.responding then return end

    alert.responding = true
    alert.responders = alert.responders or {}
    alert.responders[#alert.responders + 1] = { source = GetPlayerServerId(PlayerId()), isLocal = true }
    SetNewWaypoint(alert.coords.x + 0.0, alert.coords.y + 0.0)
    TriggerServerEvent('nmsh_dispatch:server:respondToCall', alert.id)
    syncUi('respond')
end

local function getLocation(coords)
    local streetHash, crossingHash = GetStreetNameAtCoord(coords.x, coords.y, coords.z)
    local street = streetHash ~= 0 and GetStreetNameFromHashKey(streetHash) or ''
    local crossing = crossingHash ~= 0 and GetStreetNameFromHashKey(crossingHash) or ''
    local area = GetLabelText(GetNameOfZone(coords.x, coords.y, coords.z))
    return street, area == 'NULL' and '' or area, crossing
end

local vehicleClasses = {
    [0] = 'Compacts', [1] = 'Sedans', [2] = 'SUVs', [3] = 'Coupes', [4] = 'Muscle',
    [5] = 'Sports Classics', [6] = 'Sports', [7] = 'Super', [8] = 'Motorcycles',
    [9] = 'Off-road', [10] = 'Industrial', [11] = 'Utility', [12] = 'Vans',
    [13] = 'Cycles', [14] = 'Boats', [15] = 'Helicopters', [16] = 'Planes',
    [17] = 'Service', [18] = 'Emergency', [19] = 'Military', [20] = 'Commercial',
    [21] = 'Trains', [22] = 'Open Wheel',
}

local function getPlayerInfo()
    Framework = Framework or detectFramework()
    local playerData
    if Framework == 'qbox' then
        playerData = exports.qbx_core:GetPlayerData()
    elseif Framework == 'qbcore' then
        local core = exports['qb-core']:GetCoreObject()
        playerData = core.Functions.GetPlayerData()
    end

    if type(playerData) ~= 'table' then return nil end

    local ped = PlayerPedId()
    local coords = GetEntityCoords(ped)
    local street, area, crossing = getLocation(coords)
    local charinfo = type(playerData.charinfo) == 'table' and playerData.charinfo or {}
    local firstName = type(charinfo.firstname) == 'string' and charinfo.firstname or ''
    local lastName = type(charinfo.lastname) == 'string' and charinfo.lastname or ''
    local gender = charinfo.gender == 0 and 'Male' or charinfo.gender == 1 and 'Female' or nil
    local fullName = (firstName .. ' ' .. lastName):gsub('^%s*(.-)%s*$', '%1')
    local info = {
        source = GetPlayerServerId(PlayerId()),
        citizenid = playerData.citizenid,
        name = fullName ~= '' and fullName or nil,
        phone = charinfo.phone,
        sex = gender,
        coords = coords,
        street_1 = street ~= '' and street or nil,
        street_2 = crossing ~= '' and crossing or nil,
        area = area ~= '' and area or nil,
    }

    local vehicle = GetVehiclePedIsIn(ped, false)
    if vehicle ~= 0 then
        local displayName = GetDisplayNameFromVehicleModel(GetEntityModel(vehicle))
        local label = GetLabelText(displayName)
        info.vehicle_label = label ~= 'NULL' and label or displayName
        info.vehicle_plate = GetVehicleNumberPlateText(vehicle):gsub('^%s*(.-)%s*$', '%1')
        info.vehicle_class = vehicleClasses[GetVehicleClass(vehicle)]
        info.speed = math.floor(GetEntitySpeed(vehicle) * 3.6 + 0.5)
    end

    return info
end

RegisterNetEvent('nmsh_dispatch:client:CreateDispatch', function(data)
    TriggerServerEvent('nmsh_dispatch:server:CreateDispatch', data)
end)

RegisterNetEvent('nmsh_dispatch:client:addAlert', function(alert)
    if type(alert) ~= 'table' or type(alert.coords) ~= 'table' then return end
    if not dispatchEnabled then return end

    local job = currentJob or getPlayerJob()
    if not canReceiveAlerts(job) or (alert.targetJobs and not alert.targetJobs[job.name]) then
        clearAlerts()
        return
    end

    if alert.id and dismissedAlertIds[alert.id] then return end

    applyResponderState(alert)
    playAlertSound(alert)

    for index = 1, #alerts do
        if alerts[index].id == alert.id then
            createAlertBlip(alert)
            alerts[index] = alert
            selectedIndex = index
            syncUi('update')
            return
        end
    end

    table.insert(alerts, alert)
    while Config.MaxAlerts > 0 and #alerts > Config.MaxAlerts do
        local removed = table.remove(alerts, 1)
        if removed and removed.id then removeAlertBlip(removed.id) end
    end

    createAlertBlip(alert)
    selectedIndex = #alerts
    syncUi('show')
end)

RegisterNetEvent('nmsh_dispatch:client:updateAlert', function(alert)
    if type(alert) ~= 'table' or type(alert.id) ~= 'string' then return end

    for index = 1, #alerts do
        if alerts[index].id == alert.id then
            applyResponderState(alert)
            alerts[index] = alert
            createAlertBlip(alert)
            syncUi('update')
            return
        end
    end
end)

RegisterNetEvent('nmsh_dispatch:client:removeAlert', function(alertId)
    removeAlertById(alertId)
end)

RegisterNetEvent('QBCore:Client:OnPlayerLoaded', function()
    playerLoaded = true
    CreateThread(function()
        Wait(100)
        updateDispatchAccess(getPlayerJob(), true)
    end)
end)

RegisterNetEvent('QBCore:Client:OnJobUpdate', function(job)
    updateDispatchAccess(job)
end)

RegisterNetEvent('QBCore:Client:SetDuty', function(onDuty)
    currentJob = currentJob or getPlayerJob()
    if currentJob then currentJob.onduty = onDuty == true end
    updateDispatchAccess(currentJob)
end)

RegisterNetEvent('QBCore:Player:SetPlayerData', function(playerData)
    if type(playerData) ~= 'table' then return end
    if playerLoaded then
        updateDispatchAccess(playerData.job)
    else
        currentJob = playerData.job
    end
end)

RegisterNetEvent('QBCore:Client:OnPlayerUnload', function()
    updateDispatchAccess(nil, false)
end)

RegisterNUICallback('previous', function(_, cb)
    previousAlert()
    cb({ ok = true })
end)

RegisterNUICallback('next', function(_, cb)
    nextAlert()
    cb({ ok = true })
end)

RegisterNUICallback('respond', function(_, cb)
    respondToAlert()
    cb({ ok = true })
end)

RegisterNUICallback('closeFocus', function(_, cb)
    closeCursor()
    cb({ ok = true })
end)

RegisterNUICallback('clearAlerts', function(_, cb)
    clearAlertQueue(true)
    cb({ ok = true })
end)

CreateThread(function()
    SetNuiFocus(false, false)
    clearAlerts()

    if isPlayerAlreadyLoaded() then
        updateDispatchAccess(getPlayerJob(), true)
    end

    while true do
        if #alerts == 0 then
            Wait(400)
        else
            Wait(0)
            if not IsPauseMenuActive() then
                if IsControlJustReleased(0, 174) then
                    previousAlert()
                elseif IsControlJustReleased(0, 175) then
                    nextAlert()
                end
            end
        end
    end
end)

CreateThread(function()
    while true do
        Wait(1500)
        local loaded = isPlayerAlreadyLoaded()
        if not loaded then
            if playerLoaded then updateDispatchAccess(nil, false) end
        else
            local job = getPlayerJob()
            local jobChanged = (currentJob and currentJob.name) ~= (job and job.name)
            local dutyChanged = (currentJob and currentJob.onduty) ~= (job and job.onduty)
            if not playerLoaded or jobChanged or dutyChanged then updateDispatchAccess(job, true) end
            if dispatchEnabled and Config.Panel.showByDefault and not manualPanelOpen
                and not panelSuppressedByUser and #alerts == 0 then
                manualPanelOpen = true
                showEmptyPanel()
            end
        end
    end
end)


RegisterCommand(Config.Cursor.command, function()
    if cursorActive then
        closeCursor()
        return
    end

    currentJob = getPlayerJob()
    if not dispatchEnabled or (#alerts == 0 and not manualPanelOpen) then return end

    cursorActive = true
    SetNuiFocus(true, true)
    SendNUIMessage({ action = 'cursor', active = true })
end, false)

RegisterKeyMapping(Config.Cursor.command, 'Dispatch: enable cursor and move the alert panel', 'keyboard', Config.Cursor.defaultKey)

RegisterCommand('+' .. Config.Respond.command, function()
    if dispatchEnabled and not IsPauseMenuActive() then respondToAlert() end
end, false)

RegisterCommand('-' .. Config.Respond.command, function() end, false)
RegisterKeyMapping('+' .. Config.Respond.command, 'Dispatch: Respond to current alert', 'keyboard', Config.Respond.defaultKey)

RegisterCommand('+' .. Config.Panel.toggleCommand, function()
    if not IsPauseMenuActive() then toggleDispatchPanel() end
end, false)

RegisterCommand('-' .. Config.Panel.toggleCommand, function() end, false)
RegisterKeyMapping('+' .. Config.Panel.toggleCommand, 'Dispatch: toggle Small Dispatch panel', 'keyboard', Config.Panel.defaultToggleKey)

RegisterCommand(Config.Panic.command, function()
    if Config.Panic.enabled ~= false and not IsPauseMenuActive() then
        TriggerServerEvent('nmsh_dispatch:server:triggerPanic')
    end
end, false)

RegisterCommand('+' .. Config.Panic.command, function()
    if Config.Panic.enabled ~= false and not IsPauseMenuActive() then
        TriggerServerEvent('nmsh_dispatch:server:triggerPanic')
    end
end, false)

RegisterCommand('-' .. Config.Panic.command, function() end, false)
RegisterKeyMapping('+' .. Config.Panic.command, 'Dispatch: activate panic button', 'keyboard', Config.Panic.defaultKey)

AddEventHandler('onResourceStop', function(resourceName)
    if resourceName == GetCurrentResourceName() then
        removeAllAlertBlips()
        SetNuiFocus(false, false)
    end
end)

CreateThread(function()
    while true do
        Wait(1000)
        if #alerts > 0 or manualPanelOpen then syncRespondKey() end
    end
end)

if Config.Commands.enabled then
    RegisterCommand(Config.Commands.open, function()
        openDispatchPanel()
    end, false)

    RegisterCommand(Config.Commands.close, function()
        closeDispatchPanel()
    end, false)

    RegisterCommand(Config.Commands.clear, function()
        clearAlertQueue(false)
    end, false)
end

exports('CreateDispatch', function(data)
    TriggerServerEvent('nmsh_dispatch:server:CreateDispatch', data)
end)

CreateThread(function()
    while true do
        local settings = Config.AutomaticAlerts and Config.AutomaticAlerts.shooting
        if not settings or settings.enabled == false then
            Wait(1000)
        elseif IsPedShooting(PlayerPedId()) then
            local job = getPlayerJob()
            local isOnDutyPolice = job and job.name == 'police' and job.onduty == true
            local cooldown = math.max(1000, math.floor(tonumber(settings.cooldown) or 60000))
            local now = GetGameTimer()

            if (settings.alertOnDutyPolice == true or not isOnDutyPolice) and now - lastShootingAlertAt >= cooldown then
                lastShootingAlertAt = now
                TriggerServerEvent('nmsh_dispatch:server:reportShooting')
            end
            Wait(250)
        else
            Wait(100)
        end
    end
end)

for dispatchName, preset in pairs(Config.PredefinedDispatches or {}) do
    local exportName = type(preset) == 'table' and preset.export or dispatchName
    if type(exportName) == 'string' and exportName ~= '' then
        local dispatchId = dispatchName
        exports(exportName, function(overrides)
            TriggerServerEvent('nmsh_dispatch:server:CreatePredefinedDispatch', dispatchId, overrides)
        end)
    end
end

exports('GetPlayerInfo', getPlayerInfo)
exports('GetPlayerData', getPlayerInfo)
