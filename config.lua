Config = {}

-- 'auto', 'qbox', or 'qbcore'. Auto prefers qbx_core when both are present.
Config.Framework = 'auto'

Config.MaxAlerts = 0 -- 0 = no automatic limit; use a positive number to cap local alerts
Config.RequireOnDuty = true -- configured jobs only receive alerts while on duty

-- On-duty personnel are represented by lightweight, in-memory units. This is the
-- foundation for the future Dispatch screen; it does not create map markers or UI.
Config.Units = {
    enabled = true,
    syncInterval = 5000, -- milliseconds; client position/vehicle snapshot interval
    cleanupInterval = 30000, -- milliseconds; server duty/job reconciliation interval
    callsignMetadataKey = 'callsign', -- PlayerData.metadata field; falls back to UNIT-<source>
    defaultStatus = 'AVAILABLE',
}

-- Patrol groups are temporary, server-authoritative unit collections managed
-- by configured dispatchers. They remain memory-only, like the Unit Core.
Config.PatrolGroups = {
    minimumMembers = 2,
}

-- Travel behavior for units assigned to a call. The client only checks distance
-- while its own unit is RESPONDING; the server validates every ON_SCENE change.
Config.AutoWaypoint = true
Config.AutoOnScene = true
Config.OnSceneRadius = 40.0 -- GTA units; change to suit your server's call locations
Config.OnSceneCheckInterval = 1000 -- milliseconds

-- This controls only the local Small HUD notification lifetime. It never
-- resolves, archives, or removes the underlying Dispatch call. PANIC calls
-- intentionally do not receive a HUD expiry.
Config.AlertExpiration = {
    enabled = true,
    defaultSeconds = 180,
    minimumSeconds = 30,
    maximumSeconds = 3600,
}

-- Resolved and archived calls remain available to dispatchers for the current
-- resource session only. No database persistence is used yet.
Config.History = {
    maxTimelineEntries = 40,
}

-- Heatmap data is derived from resolved/archived calls in the current session.
Config.Heatmap = {
    enabled = true,
    maxPoints = 500,
}

Config.Panel = {
    showByDefault = true, -- show the empty dispatch panel after player load/resource restart
    toggleCommand = 'nmshDispatchToggle',
    defaultToggleKey = 'K', -- configurable in FiveM Settings > Key Bindings
}

Config.FullDispatch = {
    command = 'nmshFullDispatch',
    defaultKey = 'F6', -- configurable in FiveM Settings > Key Bindings
}

-- Dispatcher Mode is a temporary, server-authoritative session role. It is
-- never granted automatically by job grade and is cleared when a player leaves,
-- goes off duty, or changes to an invalid job.
Config.Dispatcher = {
    enabled = true,
    allowedJobs = { police = true, ambulance = true, mechanic = true },
    AllowSelfJoin = true,
    MaxDispatchers = 0, -- 0 = unlimited
    forceUnitStatus = false,
}

Config.Brand = {
    name = 'nmsh',
    colors = {
        nearBlack = '#0B0D10',
        flatBlack = '#111111',
        white = '#FFFFFF',
        electricBlue = '#009DFF',
        brightBlue = '#20C5FF',
        deepBlue = '#006FE8',
    },
}

-- Only configured jobs can receive alerts or use the built-in test commands.
-- The displayed department/channel can be changed here without editing Lua or NUI files.
Config.Departments = {
    police = {
        department = 'LSPD',
        channel = 'DISPATCH',
        theme = 'LSPD',
        icon = 'assets/departments/nspd.png',
        colors = {
            primary = '#009DFF',
            soft = '#20C5FF',
            secondary = '#006FE8',
        },
    },
    ambulance = {
        department = 'EMS',
        channel = 'MEDICAL',
        theme = 'EMS',
        icon = 'assets/departments/ems.svg',
        colors = {
            primary = '#E5484D',
            soft = '#FFB4B8',
            secondary = '#A51D2A',
        },
    },
    mechanic = {
        department = 'MECHANIC',
        channel = 'SERVICE',
        theme = 'MECHANIC',
        icon = 'assets/departments/mechanic.svg',
        colors = {
            primary = '#F0A429',
            soft = '#FFD58A',
            secondary = '#B86B00',
        },
    },
}

-- Used when an alert does not specify targetJobs.
Config.DefaultRecipientJobs = {
    police = true,
    ambulance = true,
    mechanic = true,
}

-- Prevent players outside Config.Departments from creating alerts through the net event.
Config.RestrictCreateEventToConfiguredJobs = true

Config.Commands = {
    enabled = true,
    open = 'dispatch',       -- always opens the panel, including its empty state
    close = 'closedispatch', -- hides the empty panel until the player opens it again
    clear = 'clearalerts',    -- removes only your local alerts
}

Config.Cursor = {
    command = 'dispatchcursor',
    defaultKey = 'F9',
}

Config.Respond = {
    command = 'policealertsRespond',
    defaultKey = 'G',
}

-- Dispatch waves use their literal radio channel number. For example, WAVE-3
-- is radio channel 3. pma-voice is optional; without it, waves remain logical.
Config.Waves = {
    first = 3,
    last = 10,
    channels = {
        [3] = 'WAVE-3', [4] = 'WAVE-4', [5] = 'WAVE-5', [6] = 'WAVE-6',
        [7] = 'WAVE-7', [8] = 'WAVE-8', [9] = 'WAVE-9', [10] = 'WAVE-10',
    },
    -- Optional pma-voice mapping. Keep these equal to the Wave number unless
    -- your radio plan intentionally uses a different channel number.
    pmaChannels = {
        [3] = 3, [4] = 4, [5] = 5, [6] = 6,
        [7] = 7, [8] = 8, [9] = 9, [10] = 10,
    },
}

Config.Panic = {
    enabled = true,
    command = 'panic',
    defaultKey = 'F10', -- configurable in FiveM Settings > Key Bindings
    cooldown = 60, -- seconds per officer
    allowedJobs = { police = true, ambulance = true },
    dispatch = 'OfficerDown', -- key inside Config.PredefinedDispatches
}

Config.Sounds = {
    enabled = true,
    cooldown = 250, -- milliseconds; avoids a sound burst when several alerts arrive together
    priorities = {
        [1] = { name = 'Beep_Red', set = 'DLC_HEIST_HACKING_SNAKE_SOUNDS' },
        [2] = { name = 'SELECT', set = 'HUD_FRONTEND_DEFAULT_SOUNDSET' },
        [3] = { name = 'NAV_UP_DOWN', set = 'HUD_FRONTEND_DEFAULT_SOUNDSET' },
    },
    panic = {
        name = 'Beep_Red',
        set = 'DLC_HEIST_HACKING_SNAKE_SOUNDS',
        repeatCount = 3,
        interval = 150,
    },
}

-- Built-in automatic alerts. These run entirely from nmsh_dispatch.
Config.AutomaticAlerts = {
    shooting = {
        enabled = true,
        cooldown = 60000, -- milliseconds per player; avoids a dispatch for every shot
        alertOnDutyPolice = true, -- set true if on-duty police gunfire should also create a call
    },
}

-- Every active dispatch alert receives a map blip for eligible recipients.
-- A custom CreateDispatch payload can override these values with its `blip` field.
Config.Blips = {
    enabled = true,
    durationSeconds = 0, -- 0 = stays until the call is resolved; per-call blip.duration overrides this.
    sprite = 161, -- fallback only for custom CreateDispatch calls without a blip table
    scale = 0.8,
    colour = 1,
    flashes = true,
}

-- Ready-to-use client/server exports. Each call automatically uses the calling player's
-- current server-side coordinates. Each dispatch owns its map blip; edit its `blip` table directly.
Config.PredefinedDispatches = {
    Shooting = { code = '10-13', title = 'Shots Fired', description = 'Multiple gunshots have been reported near your location.', priority = 'high', jobs = { 'police' }, blip = { sprite = 110, scale = 0.9, colour = 1, flashes = true } },
    VehicleShooting = { code = '10-13', title = 'Vehicle Shooting', description = 'Shots have been fired from a vehicle near your location.', priority = 'high', jobs = { 'police' }, blip = { sprite = 110, scale = 0.9, colour = 1, flashes = true } },
    OfficerDown = { code = '10-99', title = 'Officer Down', description = 'An officer has requested immediate emergency assistance.', priority = 'panic', panic = true, jobs = { 'police', 'ambulance' }, blip = { sprite = 161, scale = 1.0, colour = 1, flashes = true } },

    StoreRobbery = { code = '10-15', title = 'Store Robbery', description = 'A person is robbing a convenience store.', priority = 'med', jobs = { 'police' }, blip = { sprite = 52, scale = 0.85, colour = 5, flashes = true } },
    FleecaBankRobbery = { code = '10-90', title = 'Fleeca Bank Robbery', description = 'A robbery has been reported at Fleeca Bank.', priority = 'high', jobs = { 'police' }, blip = { sprite = 108, scale = 0.95, colour = 1, flashes = true } },
    PaletoBankRobbery = { code = '10-90', title = 'Paleto Bank Robbery', description = 'A robbery has been reported at Blaine County Savings Bank.', priority = 'high', jobs = { 'police' }, blip = { sprite = 108, scale = 0.95, colour = 1, flashes = true } },
    PacificBankRobbery = { code = '10-90', title = 'Pacific Bank Robbery', description = 'A robbery has been reported at Pacific Standard Bank.', priority = 'high', jobs = { 'police' }, blip = { sprite = 108, scale = 1.0, colour = 1, flashes = true } },
    VangelicoRobbery = { code = '10-90', title = 'Vangelico Robbery', description = 'A robbery has been reported at Vangelico Fine Jewelry.', priority = 'high', jobs = { 'police' }, blip = { sprite = 617, scale = 0.9, colour = 1, flashes = true } },
    HouseRobbery = { code = '10-15', title = 'House Robbery', description = 'A residential burglary has been reported.', priority = 'med', jobs = { 'police' }, blip = { sprite = 40, scale = 0.85, colour = 5, flashes = true } },
    ArtGalleryRobbery = { code = '10-90', title = 'Art Gallery Robbery', description = 'A robbery has been reported at an art gallery.', priority = 'high', jobs = { 'police' }, blip = { sprite = 136, scale = 0.9, colour = 1, flashes = true } },
    HumaneRobbery = { code = '10-90', title = 'Humane Labs Robbery', description = 'A robbery has been reported at Humane Labs.', priority = 'high', jobs = { 'police' }, blip = { sprite = 499, scale = 0.9, colour = 1, flashes = true } },
    TrainRobbery = { code = '10-90', title = 'Train Robbery', description = 'A train robbery has been reported.', priority = 'high', jobs = { 'police' }, blip = { sprite = 795, scale = 0.9, colour = 1, flashes = true } },
    VanRobbery = { code = '10-15', title = 'Van Robbery', description = 'An armored van robbery has been reported.', priority = 'high', jobs = { 'police' }, blip = { sprite = 67, scale = 0.9, colour = 1, flashes = true } },
    UndergroundRobbery = { code = '10-90', title = 'Underground Robbery', description = 'An underground facility robbery has been reported.', priority = 'high', jobs = { 'police' }, blip = { sprite = 161, scale = 0.9, colour = 1, flashes = true } },
    DrugBoatRobbery = { code = '10-90', title = 'Drug Boat Robbery', description = 'A drug boat robbery has been reported.', priority = 'high', jobs = { 'police' }, blip = { sprite = 427, scale = 0.9, colour = 1, flashes = true } },
    UnionRobbery = { code = '10-90', title = 'Union Depository Robbery', description = 'A robbery has been reported at the Union Depository.', priority = 'high', jobs = { 'police' }, blip = { sprite = 108, scale = 1.0, colour = 1, flashes = true } },
    YachtHeist = { code = '10-90', title = 'Yacht Heist', description = 'A heist has been reported on a yacht.', priority = 'high', jobs = { 'police' }, blip = { sprite = 410, scale = 0.9, colour = 1, flashes = true } },

    DrugSale = { code = '10-66', title = 'Drug Sale', description = 'A possible drug sale has been reported.', priority = 'med', jobs = { 'police' }, blip = { sprite = 51, scale = 0.8, colour = 5, flashes = true } },
    SuspiciousActivity = { code = '10-35', title = 'Suspicious Activity', description = 'Suspicious activity has been reported near your location.', priority = 'low', jobs = { 'police' }, blip = { sprite = 280, scale = 0.8, colour = 3, flashes = false } },
    CarJacking = { code = '10-31', title = 'Carjacking', description = 'A vehicle has been taken by force.', priority = 'high', jobs = { 'police' }, blip = { sprite = 225, scale = 0.9, colour = 1, flashes = true } },
    VehicleTheft = { code = '10-11', title = 'Vehicle Theft', description = 'A vehicle theft has been reported.', priority = 'med', jobs = { 'police' }, blip = { sprite = 225, scale = 0.85, colour = 5, flashes = true } },
    CarBoosting = { code = '10-11', title = 'Vehicle Boosting', description = 'An illegal vehicle boosting operation has been reported.', priority = 'med', jobs = { 'police' }, blip = { sprite = 225, scale = 0.85, colour = 5, flashes = true } },
    IllegalRacing = { code = '10-31', title = 'Illegal Racing', description = 'An illegal street race has been reported.', priority = 'med', jobs = { 'police' }, blip = { sprite = 315, scale = 0.85, colour = 5, flashes = true } },
    Kidnapping = { code = '10-64', title = 'Kidnapping', description = 'A possible kidnapping has been reported.', priority = 'high', jobs = { 'police' }, blip = { sprite = 303, scale = 0.9, colour = 1, flashes = true } },

    PrisonBreak = { code = '10-98', title = 'Prison Break', description = 'A prison break has been reported.', priority = 'high', jobs = { 'police' }, blip = { sprite = 188, scale = 0.95, colour = 1, flashes = true } },
    IllegalFishing = { code = '10-66', title = 'Illegal Fishing', description = 'Illegal fishing activity has been reported.', priority = 'low', jobs = { 'police' }, blip = { sprite = 68, scale = 0.8, colour = 3, flashes = false } },
    ArmsDeal = { code = '10-66', title = 'Arms Deal', description = 'An illegal arms deal has been reported.', priority = 'high', jobs = { 'police' }, blip = { sprite = 110, scale = 0.9, colour = 1, flashes = true } },
    CyberAttack = { code = '10-66', title = 'Cyber Attack', description = 'A suspected cyber attack has been reported.', priority = 'med', jobs = { 'police' }, blip = { sprite = 521, scale = 0.85, colour = 5, flashes = true } },
}
