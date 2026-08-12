Config = {}

-- 'auto', 'qbox', or 'qbcore'. Auto prefers qbx_core when both are present.
Config.Framework = 'auto'

Config.MaxAlerts = 0 -- 0 = no automatic limit; use a positive number to cap local alerts
Config.RequireOnDuty = true -- configured jobs only receive alerts while on duty

-- Alerts are memory-only. They are removed from every recipient when this time passes.
-- Set enabled = false to keep alerts until they are cleared manually.
Config.AlertExpiration = {
    enabled = true,
    defaultSeconds = 180,
    panicSeconds = 300,
    checkInterval = 5000,
    minimumSeconds = 30,
    maximumSeconds = 3600,
}

Config.Panel = {
    showByDefault = true, -- show the empty dispatch panel after player load/resource restart
    toggleCommand = 'nmshDispatchToggle',
    defaultToggleKey = 'K', -- configurable in FiveM Settings > Key Bindings
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
