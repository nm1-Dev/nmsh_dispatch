# NMSH Dispatch

**NMSH Scripts · server-authoritative emergency dispatch for FiveM**

NMSH Dispatch provides a compact alert HUD and a full operations console for Qbox and QBCore servers. Calls, units, assignment, dispatcher sessions, patrol groups, TAC channels, waves, history and tactical overlays are synchronized by the server and kept in memory.

> This resource is branded and maintained by **NMSH Scripts**. Keep the branding and license files with every public or private copy.

## What is included

- Small Dispatch HUD with priority states, response keybind, alert history navigation and saved panel position.
- Full Dispatch workspace with active calls, units, GTA Leaflet map, Call Management, History, TAC/Waves, tactical tools and heatmap.
- Qbox and QBCore framework bridge with on-duty validation.
- Server-authoritative Call Core, Unit Core and Call ↔ Unit assignment flow.
- Dispatcher Mode with configurable allowed jobs and temporary session permissions.
- Patrol Groups with leaders, member management and group assignment.
- Waves 3–10 with optional pma-voice channel movement and safe channel restoration.
- Call history/archive, timeline entries and session heatmap data.
- Per-alert map blips and ready-to-use dispatch exports.
- Browser preview with isolated mock data; FiveM runtime starts empty and waits for Lua state.

## Requirements

### Required

- FiveM server with a current `cerulean` compatible artifact.
- One supported framework: `qbx_core` (Qbox) or `qb-core` (QBCore).
- OneSync is recommended for reliable server-side coordinates and street labels.

### Optional

- `pma-voice` for real radio channel changes when a responding unit joins a call Wave.
- Local Leaflet GTA map assets (included in the resource package).

No database, MDT, inventory or voice resource is required to start NMSH Dispatch.

## Installation

1. Download or clone this repository into your server resources directory.
2. Keep the folder name exactly `nmsh_dispatch`; other resources reference this name in exports.
3. Start the framework before dispatch in `server.cfg`:

```cfg
ensure qbx_core       # Qbox servers
# ensure qb-core      # QBCore servers
ensure nmsh_dispatch
```

4. Open `config.lua` and configure the jobs under `Config.Departments`.
5. Restart the resource or the server.
6. Join a configured job while on duty and open the Full Dispatch console with `F6` (default).

The production NUI is already built under `html/build`. You do not need Node.js on the FiveM server to run the release package.

## Framework configuration

```lua
Config.Framework = 'auto' -- auto, qbox or qbcore
Config.RequireOnDuty = true

Config.Departments = {
    police = {
        department = 'LSPD',
        channel = 'DISPATCH',
        theme = 'LSPD',
    },
    ambulance = {
        department = 'EMS',
        channel = 'MEDICAL',
        theme = 'EMS',
    },
}
```

Only jobs present in `Config.Departments` can register a Unit Core unit or receive a call. `Config.DefaultRecipientJobs` is used when a call does not provide its own recipient list.

## Dispatcher Mode

Dispatcher is a temporary server session role. A player is never made a dispatcher solely because they are police or have a high grade.

```lua
Config.Dispatcher = {
    enabled = true,
    allowedJobs = {
        police = true,
        ambulance = true,
        mechanic = true,
    },
    AllowSelfJoin = true,
    MaxDispatchers = 0, -- 0 = unlimited
    forceUnitStatus = false,
}
```

With `forceUnitStatus = false`, the officer flow remains:

```text
AVAILABLE → ASSIGNED → RESPONDING → ON_SCENE → AVAILABLE
```

Dispatchers can create/edit calls, change priority, assign/unassign units, set waves, add notes, acknowledge panic, resolve/reopen calls and manage tactical overlays. Officers can view the operational data and respond to their own assignment. Dispatcher sessions are cleared on disconnect, off-duty changes and invalid jobs.

## Keybinds and commands

All keybinds use FiveM key mappings, so players can change them in **Settings → Key Bindings → FiveM**.

| Action | Default | Config |
| --- | --- | --- |
| Toggle Small HUD | `K` | `Config.Panel.defaultToggleKey` |
| Open Full Dispatch | `F6` | `Config.FullDispatch.defaultKey` |
| Respond | `G` | `Config.Respond.defaultKey` |
| Cursor/edit mode | `F9` | `Config.Cursor.defaultKey` |
| Panic button | `F10` | `Config.Panic.defaultKey` |
| Open panel command | `/dispatch` | `Config.Commands.open` |
| Close panel command | `/closedispatch` | `Config.Commands.close` |
| Clear local HUD alerts | `/clearalerts` | `Config.Commands.clear` |

The Respond action is one-way for a call. Clearing the call or removing the assignment safely releases the unit.

## Call Core

Every dispatch is normalized into a server-authoritative call:

```lua
{
    id,
    code,
    title,
    description,
    priority,
    department,
    coords,
    street,
    area,
    createdAt,
    status,
    assignedUnits,
    respondingUnits,
    metadata,
}
```

Statuses are `NEW`, `ACTIVE`, `RESOLVED` and `ARCHIVED`. Active calls never auto-expire. Small HUD notifications and map blips may expire visually without deleting the call. Resolved calls move to the in-memory History/Archive view.

## Create a custom dispatch

Use the server export whenever the source resource already has server-side context:

```lua
local success, callId = exports['nmsh_dispatch']:CreateDispatch({
    job = { 'police', 'ambulance' },
    callLocation = vector3(441.2, -981.9, 30.7),
    callCode = { code = '10-15', snippet = 'Store Robbery' },
    message = 'A person is robbing a convenience store.',
    priority = 'high', -- low, med, high or panic
    details = {
        incident = 'Suspect reported inside the store',
        gender = 'Male',
        weapon = 'Handgun',
    },
    blip = {
        sprite = 52,
        scale = 0.85,
        colour = 5,
        flashes = true,
    },
})
```

Accepted aliases include `job` / `jobs` / `targetJobs`, `callLocation` / `coords`, `callCode` / `code` and `message` / `description`. Empty detail fields are omitted from the HUD instead of being rendered as `Unknown`.

### Client-originated call

```lua
local player = exports['nmsh_dispatch']:GetPlayerInfo()
if player then
    exports['nmsh_dispatch']:CreateDispatch({
        job = { 'police' },
        callLocation = player.coords,
        callCode = { code = '10-13', snippet = 'Shots Fired' },
        message = ('Shots reported near %s.'):format(player.street_1 or 'the caller'),
        priority = 'high',
        details = {
            street = player.street_1,
            gender = player.sex,
            weapon = player.weapon,
        },
    })
end
```

Client-created calls are validated against the configured job/duty policy on the server. The client event alias is `nmsh_dispatch:client:CreateDispatch`.

## Ready-to-use dispatch exports

Each preset reads its own entry from `Config.PredefinedDispatches`, including its own blip icon, size, color and flash behavior.

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

From a server script, pass the source whose location should be used:

```lua
exports['nmsh_dispatch']:StoreRobbery(source)
```

## Panic button

`/panic` and the configured Panic key trigger `Config.Panic.dispatch`.

```lua
Config.Panic = {
    enabled = true,
    command = 'panic',
    defaultKey = 'F10',
    cooldown = 60, -- seconds per officer
    allowedJobs = { police = true, ambulance = true },
    dispatch = 'OfficerDown',
}
```

PANIC calls receive the stronger arrival treatment and never receive a HUD expiry.

## Units and assignment

On-duty units contain:

```lua
{
    id, source, callsign, name, department, job,
    status, coords, heading, vehicle, radioChannel, currentCallId,
}
```

The Full Dispatch Units panel groups units by `DISPATCH`, `AVAILABLE`, `ASSIGNED`, `RESPONDING`, `ON SCENE` and `OUT OF SERVICE`. Movement type is displayed as `ON FOOT`, `VEHICLE`, `MOTORCYCLE`, `HELICOPTER`, `AIRCRAFT`, `BOAT` or `TANK`.

## Waves and pma-voice

Waves are limited to channels 3–10:

```lua
Config.Waves = {
    first = 3,
    last = 10,
    channels = {
        [3] = 'WAVE-3', [4] = 'WAVE-4', [5] = 'WAVE-5', [6] = 'WAVE-6',
        [7] = 'WAVE-7', [8] = 'WAVE-8', [9] = 'WAVE-9', [10] = 'WAVE-10',
    },
}
```

When pma-voice is running, a responding unit saves its original channel and moves to the call wave. Changing or resolving the call restores the original channel only when the unit is still on that call wave. Without pma-voice, the internal wave state continues to work without errors.

## Patrol Groups

Patrol groups are temporary collections of Unit Core members. Dispatchers can create a callsign, add/remove members, set a leader, assign the group to a call or disband it. If a leader leaves, the server promotes the next valid member. Each member remains individually synchronized for assignment, wave and channel restoration.

## TAC Channels

TAC channels are an operational overview, not a voice implementation. Dispatchers can create/close channels, assign a call, assign units or patrol groups, and join/leave the mock state. Voice transmission remains the responsibility of pma-voice.

## History, tactical tools and heatmap

- Resolved calls keep timeline entries and assigned/responding unit history in memory.
- Dispatchers can reopen archived calls.
- Heatmap points are derived from resolved history for `30m`, `1h`, `6h` and `24h` filters.
- Tactical tools support shared markers, search perimeters and roadblock routes.
- Officers can view overlays; dispatcher-only permissions control create/edit/delete/clear.

All of these states are memory-only until a persistence phase is added. Restarting the resource clears active session history, groups, TAC channels and tactical drawings.

## Public server exports

### Call Core

```lua
exports['nmsh_dispatch']:CreateDispatch(data)
exports['nmsh_dispatch']:CreateCall(data)
exports['nmsh_dispatch']:UpdateCall(callId, updates)
exports['nmsh_dispatch']:ResolveCall(callId)
exports['nmsh_dispatch']:ArchiveCall(callId)
exports['nmsh_dispatch']:RemoveCall(callId)
exports['nmsh_dispatch']:GetCall(callId)
exports['nmsh_dispatch']:GetCallHistory()
```

### Unit Core

```lua
exports['nmsh_dispatch']:RegisterUnit(source, snapshot)
exports['nmsh_dispatch']:UpdateUnit(unitId, updates)
exports['nmsh_dispatch']:UpdateUnitStatus(unitId, status, callId)
exports['nmsh_dispatch']:RemoveUnit(source)
exports['nmsh_dispatch']:GetUnit(unitId)
exports['nmsh_dispatch']:GetUnitBySource(source)
exports['nmsh_dispatch']:GetUnits()
```

### Assignment, patrols, TAC and tactical state

```lua
exports['nmsh_dispatch']:AssignUnitToCall(callId, unitId)
exports['nmsh_dispatch']:UnassignUnitFromCall(callId, unitId)
exports['nmsh_dispatch']:GetCallUnits(callId)

exports['nmsh_dispatch']:CreatePatrolGroup(data)
exports['nmsh_dispatch']:AddPatrolGroupMember(groupId, unitId)
exports['nmsh_dispatch']:RemovePatrolGroupMember(groupId, unitId)
exports['nmsh_dispatch']:SetPatrolGroupLeader(groupId, unitId)
exports['nmsh_dispatch']:DisbandPatrolGroup(groupId)
exports['nmsh_dispatch']:GetPatrolGroup(groupId)
exports['nmsh_dispatch']:GetPatrolGroups()

exports['nmsh_dispatch']:CreateTacChannel(data)
exports['nmsh_dispatch']:CloseTacChannel(channelId)
exports['nmsh_dispatch']:AssignCallToTacChannel(channelId, callId)
exports['nmsh_dispatch']:AssignTacTarget(channelId, targetId)
exports['nmsh_dispatch']:RemoveTacTarget(channelId, targetId)
exports['nmsh_dispatch']:GetTacChannel(channelId)
exports['nmsh_dispatch']:GetTacChannels()

exports['nmsh_dispatch']:GetTacticalItems()
```

## Important server events

The resource registers the following integration events:

```text
nmsh_dispatch:server:CreateDispatch
nmsh_dispatch:server:CreatePredefinedDispatch
nmsh_dispatch:server:respondToCall
nmsh_dispatch:server:assignUnitToCall
nmsh_dispatch:server:unassignUnitFromCall
nmsh_dispatch:server:unitOnScene
nmsh_dispatch:server:triggerPanic
nmsh_dispatch:server:setDispatcherSession
nmsh_dispatch:server:dispatcherCreateCall
nmsh_dispatch:server:dispatcherEditCall
nmsh_dispatch:server:dispatcherResolveCall
nmsh_dispatch:server:dispatcherReopenCall
nmsh_dispatch:server:dispatcherAddNote
nmsh_dispatch:server:dispatcherAcknowledgePanic
```

Management events are permission-checked by the server. Prefer the exports for other resources because they return validation results directly.

## Browser preview and frontend development

The browser preview uses mock data only. It never feeds mock calls or units into FiveM runtime.

```powershell
npm install
npm run dev
```

Useful preview URLs:

```text
http://127.0.0.1:5173/frontend/index.html
http://127.0.0.1:5173/frontend/full-dispatch.html?role=dispatcher
http://127.0.0.1:5173/frontend/full-dispatch.html?role=officer
```

Production checks:

```powershell
npm run typecheck
npm run build
```

The build writes the FiveM-ready NUI to `html/build`. Do not point a live server at the Vite development server.

## Troubleshooting

### No alerts

Verify the player is on duty and their job exists in `Config.Departments`. Check that the call recipient list includes the matching job name.

### NUI does not open

Confirm the resource is named `nmsh_dispatch`, `ui_page` points to `html/index.html`, and `html/build` exists. Restart the resource after building.

### Radio channel does not change

Wave state remains internal without pma-voice. If pma-voice is installed, start it before `nmsh_dispatch` and keep the configured wave channel numbers aligned.

### Street or area is unavailable

Use OneSync and provide valid GTA coordinates. Labels are resolved with FiveM natives when the location is available.

### Lua nil errors

Start the framework first, wait for player-loaded/job-update events, and verify `Config.Framework` matches the server setup. Capture the first error line from the client/server console before changing code.

## Credits and branding

Created and maintained by **NMSH Scripts**.

- Product: `nmsh_dispatch`
- Frameworks: Qbox and QBCore
- UI: React, TypeScript, Vite, Leaflet, Lucide React, Motion, Zustand and the existing local NUI assets
- Branding: NMSH Scripts

## License

This repository is public for inspection and distribution of the official NMSH Dispatch release. It is not a resale license. See [LICENSE.md](LICENSE.md) for the terms.
