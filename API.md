# NMSH Dispatch API

The public API accepts the existing Police Alerts format and the familiar dispatch-call field names used by other FiveM dispatch resources. It does not require any dependency beyond Qbox or QBCore.

## Create a call from a server script

Use the server export when possible. It is authoritative and can be used by any server resource.

```lua
exports['nmsh_dispatch']:CreateDispatch({
    job = { 'police', 'ambulance' },
    callLocation = vector3(441.2, -981.9, 30.7),
    callCode = { code = '10-15', snippet = 'Store Robbery' },
    message = 'A person is robbing a convenience store.',
    priority = 'high', -- low, med, high, or panic
    flashes = true,
    blip = {
        sprite = 156,
        scale = 0.9,
        colour = 1,
        flashes = true,
        text = 'Store Robbery',
        time = 60000,
    },
    details = {
        incident = 'Suspect reported inside the store',
        gender = 'Male',
        weapon = 'Handgun',
    },
})
```

`CreateDispatch(data)` returns `success, alertId`; invalid payloads return `false`.

## Call Core (server only)

Every created dispatch is a server-authoritative call with `id`, `code`, `title`, `description`, `priority`, `department`, `coords`, `street`, `area`, `createdAt`, `status`, `assignedUnits`, `respondingUnits`, and `metadata`.

```lua
local success, callId = exports['nmsh_dispatch']:CreateCall(data)
exports['nmsh_dispatch']:UpdateCall(callId, { status = 'ACTIVE', description = 'Units requested.' })
exports['nmsh_dispatch']:ResolveCall(callId)
exports['nmsh_dispatch']:ArchiveCall(callId)
exports['nmsh_dispatch']:RemoveCall(callId) -- removes resolved/archived history only

local call = exports['nmsh_dispatch']:GetCall(callId)
```

Statuses are `NEW`, `ACTIVE`, `RESOLVED`, and `ARCHIVED`. Resolved and archived calls are removed from the Small HUD; no database persistence is used.

## Unit Core (server only)

On-duty jobs configured in `Config.Departments` automatically register a memory-only unit. The server verifies the Qbox/QBCore job and duty state before accepting every unit sync. A unit contains `id`, `source`, `callsign`, `name`, `department`, `job`, `status`, `coords`, `heading`, `vehicle`, `radioChannel`, and `currentCallId`.

```lua
local ok, unit = exports['nmsh_dispatch']:RegisterUnit(source, {
    radioChannel = '1',
})

exports['nmsh_dispatch']:UpdateUnit(unit.id, {
    status = 'BUSY',
})

local oneUnit = exports['nmsh_dispatch']:GetUnit(unit.id)
local allUnits = exports['nmsh_dispatch']:GetUnits()
exports['nmsh_dispatch']:RemoveUnit(source)
```

Unit statuses are `AVAILABLE`, `ASSIGNED`, `RESPONDING`, `ON_SCENE`, `BUSY`, and `OUT_OF_SERVICE`. Responding from the Small HUD sets that officer's current unit to `RESPONDING` for the call; resolving or archiving the call returns related units to `AVAILABLE`. Units are removed safely when they go off duty, change to an unconfigured job, disconnect, or stop the resource. Use `Config.Units` to adjust the sync interval and callsign metadata field.

## Call Assignment (server only)

Assignments are validated on the server. A unit can have one active call at a time, cannot be assigned twice, and must match the call's eligible jobs. Assigning sets `ASSIGNED`; responding sets `RESPONDING`; `ON_SCENE` is allowed only after responding. Unassigning safely removes the unit from both rosters and returns it to `AVAILABLE` when appropriate.

```lua
local ok = exports['nmsh_dispatch']:AssignUnitToCall(callId, unitId)
exports['nmsh_dispatch']:UpdateUnitStatus(unitId, 'RESPONDING', callId)
exports['nmsh_dispatch']:UpdateUnitStatus(unitId, 'ON_SCENE', callId)
exports['nmsh_dispatch']:UnassignUnitFromCall(callId, unitId)

local rosters = exports['nmsh_dispatch']:GetCallUnits(callId)
```

Client events `nmsh_dispatch:server:assignUnitToCall` and `nmsh_dispatch:server:unassignUnitFromCall` only operate on the sender's own unit. Use server exports for dispatcher-controlled assignments.

## Auto On-Scene

`Config.AutoWaypoint` sets a GPS waypoint when a unit becomes `RESPONDING`. With `Config.AutoOnScene = true`, the client checks only its own responding unit at `Config.OnSceneCheckInterval`; when it enters `Config.OnSceneRadius`, it asks the server to mark the unit `ON_SCENE`. The server verifies the current call, assignment state, and the latest synced unit coordinates before applying the status.

## Create a call from a client script

```lua
local player = exports['nmsh_dispatch']:GetPlayerInfo()
if not player then return end

exports['nmsh_dispatch']:CreateDispatch({
    job = { 'police' },
    callLocation = player.coords,
    callCode = { code = '10-13', snippet = 'Shots Fired' },
    message = ('Shots reported near %s.'):format(player.street_1 or 'the caller'),
    priority = 'high',
    details = {
        street = player.street_1,
        gender = player.sex,
        vehicle = player.vehicle_label,
        plate = player.vehicle_plate,
    },
})
```

The client event below does the same thing:

```lua
TriggerEvent('nmsh_dispatch:client:CreateDispatch', data)
```

For player-originated calls, the server enforces `Config.RestrictCreateEventToConfiguredJobs`.

## Server events

```lua
TriggerEvent('nmsh_dispatch:server:CreateDispatch', data)
```

Use the **server export** for integrations that already have server-side logic: it creates the alert immediately and is the recommended route. Use the **client export/event** only when the call starts on a player's client; it sends the same payload to the server, where it is validated before being delivered.

Calls created from a server resource are allowed. Calls received from a player are checked against the configured departments and duty requirement.

## Ready-to-use dispatch exports

These exports require no payload. When called client-side, the player's current server-side coordinates become the dispatch location:

```lua
exports['nmsh_dispatch']:Shooting()
exports['nmsh_dispatch']:VehicleShooting()
exports['nmsh_dispatch']:OfficerDown()

exports['nmsh_dispatch']:StoreRobbery()
exports['nmsh_dispatch']:FleecaBankRobbery()
exports['nmsh_dispatch']:PaletoBankRobbery()
exports['nmsh_dispatch']:PacificBankRobbery()
exports['nmsh_dispatch']:VangelicoRobbery()
exports['nmsh_dispatch']:HouseRobbery()
exports['nmsh_dispatch']:ArtGalleryRobbery()
exports['nmsh_dispatch']:HumaneRobbery()
exports['nmsh_dispatch']:TrainRobbery()
exports['nmsh_dispatch']:VanRobbery()
exports['nmsh_dispatch']:UndergroundRobbery()
exports['nmsh_dispatch']:DrugBoatRobbery()
exports['nmsh_dispatch']:UnionRobbery()
exports['nmsh_dispatch']:YachtHeist()

exports['nmsh_dispatch']:DrugSale()
exports['nmsh_dispatch']:SuspiciousActivity()
exports['nmsh_dispatch']:CarJacking()
exports['nmsh_dispatch']:VehicleTheft()
exports['nmsh_dispatch']:CarBoosting()
exports['nmsh_dispatch']:IllegalRacing()
exports['nmsh_dispatch']:Kidnapping()

exports['nmsh_dispatch']:PrisonBreak()
exports['nmsh_dispatch']:IllegalFishing()
exports['nmsh_dispatch']:ArmsDeal()
exports['nmsh_dispatch']:CyberAttack()
```

From a server script, provide the source whose location should be used:

```lua
exports['nmsh_dispatch']:StoreRobbery(source)
```

Each preset is editable in `Config.PredefinedDispatches`. To change an individual call without creating a new preset, client exports accept optional override data such as `description`, `priority`, `details`, or `durationSeconds`.

Each ready-to-use dispatch has its own `blip` table directly inside `Config.PredefinedDispatches`. Edit the icon, size, color, and flash behavior for that specific alert:

```lua
blip = { sprite = 161, scale = 0.9, colour = 1, flashes = true },
```

## Panic button

`/panic` triggers the preset selected by `Config.Panic.dispatch`. It is also registered as a FiveM key binding, with `F10` as the default. Players can change it in FiveM Settings > Key Bindings. Configure the allowed jobs, command, default key, selected predefined dispatch, and per-officer `cooldown` (seconds) in `Config.Panic`.

## Player information

Client exports `GetPlayerInfo()` and `GetPlayerData()` return only available data; missing fields are omitted rather than being filled with `Unknown`.

| Field | Description |
| --- | --- |
| `coords` | Current `vector3` position |
| `street_1`, `street_2`, `area` | Current location labels when available |
| `sex` | `Male` or `Female` when framework data is available |
| `vehicle_label`, `vehicle_plate`, `vehicle_class`, `speed` | Current vehicle information when the player is in a vehicle |
| `name`, `phone`, `citizenid` | Character information supplied by Qbox/QBCore |

Server exports `GetPlayerData(source)` and `GetPlayerInfo(source)` return a compact, server-safe player record with character name, phone, gender, job, and coordinates when OneSync exposes the player's ped.

## Accepted call fields

| Field | Required | Notes |
| --- | --- | --- |
| `job` / `jobs` / `targetJobs` | No | String or list of recipient jobs. Defaults to `Config.DefaultRecipientJobs`. |
| `callLocation` / `coords` | Yes | `vector3` or `{ x, y, z }`. Used by the Respond waypoint. |
| `callCode` / `code` | Yes | `callCode = { code, snippet }`; `snippet` maps to the visible title. |
| `message` / `description` | Yes | Visible call description. |
| `priority` | No | `low`, `med`, `high`, `panic`, or numeric `3`, `2`, `1`. |
| `panic` | No | `true` forces PANIC priority and the panic arrival treatment. |
| `details` | No | HUD fields: `name`, `phone`, `incident`, `street`, `gender`, `weapon`, `vehicle`, `plate`, `color`, `class`, `doors`, `direction`. Empty fields are never rendered. |
| `durationSeconds` / `duration` | No | Small HUD lifetime in seconds only; it never expires the Dispatch call. PANIC calls ignore this value. |
| `flashes`, `image`, `blip`, `otherData` | No | `blip` overrides the automatic map blip for recipients. Use `blip.durationSeconds` or `blip.duration` to expire only that blip. `image` and `otherData` are kept for future MDT integrations; `otherData` accepts `{ { text = '...', icon = '...' } }`. |
