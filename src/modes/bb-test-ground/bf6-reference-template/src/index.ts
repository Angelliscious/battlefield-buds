import { Events } from 'bf6-portal-utils/events/index.ts';
import { Timers } from 'bf6-portal-utils/timers/index.ts';
import { MultiClickDetector } from 'bf6-portal-utils/multi-click-detector/index.ts';
import { MapDetector } from 'bf6-portal-utils/map-detector/index.ts';
import { Vectors } from 'bf6-portal-utils/vectors/index.ts';

import { DebugTool } from './debug-tool/index.ts';
import { getPlayerStateVectorString } from './helpers/index.ts';
import { JumpDetector } from './jump-detector/index.ts';

let adminDebugTool: DebugTool | undefined;
let telemetryInterval: number | undefined;
let jumpDetector: JumpDetector | undefined;

async function spawnVehicle(player: mod.Player, vehicleType: mod.VehicleList): Promise<void> {
    const playerPosition = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
    const playerFacingDirection = mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection);

    // Create position 20 meters in front of player (facing direction).
    const position = mod.CreateVector(
        mod.XComponentOf(playerPosition) + mod.XComponentOf(playerFacingDirection) * 20,
        mod.YComponentOf(playerPosition),
        mod.ZComponentOf(playerPosition) + mod.ZComponentOf(playerFacingDirection) * 20
    );

    adminDebugTool?.dynamicLog(`Spawning vehicle spawner at ${Vectors.getVectorString(position)}`);

    const spawner = mod.SpawnObject(
        mod.RuntimeSpawn_Common.VehicleSpawner,
        position,
        mod.CreateVector(0, 0, 0)
    ) as mod.VehicleSpawner;

    // Need to wait a bit before setting the vehicle spawner settings.
    await mod.Wait(1);

    adminDebugTool?.dynamicLog(`Setting vehicle spawner settings.`);

    mod.SetVehicleSpawnerVehicleType(spawner, vehicleType);
    mod.SetVehicleSpawnerAutoSpawn(spawner, true);
    mod.SetVehicleSpawnerRespawnTime(spawner, 1);

    adminDebugTool?.dynamicLog(`Spawning vehicle in 1 second.`);

    // We do not want the vehicle spawner to spawn another vehicle after the first one has been destroyed, and if we
    // simply set the auto spawn to false, the vehicle will still exist as an object, which is a waste of resourced.
    // Instead, we subscribe to the OnVehicleSpawned event to know when a vehicle has spawned, determine if it is the
    // vehicle we're looking for (based on its proximity to this spawner), and if it is, we disable automatic vehicle
    // respawning from the vehicle spawner. Then, we subscribe to the OnVehicleDestroyed event to know when a vehicle]
    // has been destroyed, and if it is the vehicle we're looking for (the one we just spawned), we can safely unspawn
    // the spawner. This block shows the power of the `Events` module, and how it can be used to subscribe to and
    // unsubscribe from events dynamically and in a specific context, to isolate and modularize code.
    const unsubscribeFromOnVehicleSpawned = Events.OnVehicleSpawned.subscribe((vehicle) => {
        const vehiclePosition = mod.GetVehicleState(vehicle, mod.VehicleStateVector.VehiclePosition);

        // If the vehicle is not within 10 meters of the spawner, ignore it as it's not the vehicle we're looking for.
        if (mod.DistanceBetween(vehiclePosition, position) > 10) return;

        // Unsubscribe from the OnVehicleSpawned event as this context no longer needs to know when a vehicle has spawned.
        unsubscribeFromOnVehicleSpawned();

        adminDebugTool?.dynamicLog(`Vehicle spawned.`);

        // Disable automatic vehicle respawning for the spawner as we're going to unspawn it once the vehicle's destroyed.
        mod.SetVehicleSpawnerAutoSpawn(spawner, false);

        const unsubscribeFromOnVehicleDestroyed = Events.OnVehicleDestroyed.subscribe((destroyedVehicle) => {
            // If the destroyed vehicle is not the specific vehicle we're looking for, ignore it.
            if (mod.GetObjId(destroyedVehicle) !== mod.GetObjId(vehicle)) return;

            // Unsubscribe from the OnVehicleDestroyed event as this context no longer needs to know when the vehicle is destroyed.
            unsubscribeFromOnVehicleDestroyed();

            adminDebugTool?.dynamicLog(`Vehicle destroyed.`);

            // Unspawn the vehicle spawner.
            mod.UnspawnObject(spawner);

            adminDebugTool?.dynamicLog(`Vehicle spawner unspawned.`);
        });
    });
}

function createAdminDebugTool(player: mod.Player): void {
    // The admin player is player id 0 for non-persistent test servers,
    // so don't do the rest of this unless it's the admin player.
    if (mod.GetObjId(player) != 0) return;

    // Create a debug tool with a static logger visible by default.
    const debugToolOptions: DebugTool.Options = {
        staticLogger: {
            visible: true,
        },
        dynamicLogger: {
            visible: false,
        },
        debugMenu: {
            visible: false,
        },
    };

    adminDebugTool = new DebugTool(player, debugToolOptions);

    // Subscribe to vehicle events for loadout management
    Events.OnPlayerEnterVehicle.subscribe((eventPlayer, vehicle) => {
        adminDebugTool?.onPlayerEnterVehicle(eventPlayer, vehicle);
    });

    Events.OnPlayerExitVehicle.subscribe((eventPlayer, vehicle) => {
        adminDebugTool?.onPlayerExitVehicle(eventPlayer, vehicle);
    });

    // Create a multi-click detector to open the debug menu when the player triple-clicks the interact key.
    new MultiClickDetector(player, () => {
        adminDebugTool?.showDebugMenu();
    });

    // Create a jump detector to open the debug menu after 5 jumps within 30 seconds.
    jumpDetector = new JumpDetector(player, () => {
        adminDebugTool?.showDebugMenu();
        adminDebugTool?.dynamicLog('Debug menu opened via 5-jump trigger!');
    }, (msg) => {
        adminDebugTool?.dynamicLog(`[JumpDetector] ${msg}`);
    });

    // Create submenus
    adminDebugTool?.createSubmenu('adminTools', 'Admin Tools');
    adminDebugTool?.createSubmenu('spawns', 'Spawns');
    adminDebugTool?.createSubmenu('groundVehicles', 'Ground Vehicles');
    adminDebugTool?.createSubmenu('aircraft', 'Aircraft');
    adminDebugTool?.createSubmenu('helicopters', 'Helicopters');
    adminDebugTool?.createSubmenu('boats', 'Boats');

    // Add main menu buttons
    adminDebugTool?.addDebugMenuButton(
        mod.Message(mod.stringkeys.debugTool.buttons.adminTools),
        async () => {
            adminDebugTool?.hideDebugMenu();
            adminDebugTool?.showSubmenu('adminTools', true);
        }
    );

    adminDebugTool?.addDebugMenuButton(
        mod.Message(mod.stringkeys.debugTool.buttons.spawns),
        async () => {
            adminDebugTool?.hideDebugMenu();
            adminDebugTool?.showSubmenu('spawns', true);
        }
    );

    // Add Spawns submenu buttons (vehicle classifications)
    adminDebugTool?.addSubmenuButton(
        'spawns',
        mod.Message(mod.stringkeys.debugTool.buttons.groundVehicles),
        async () => {
            adminDebugTool?.showSubmenu('spawns', false);
            adminDebugTool?.showSubmenu('groundVehicles', true);
        }
    );

    adminDebugTool?.addSubmenuButton(
        'spawns',
        mod.Message(mod.stringkeys.debugTool.buttons.aircraft),
        async () => {
            adminDebugTool?.showSubmenu('spawns', false);
            adminDebugTool?.showSubmenu('aircraft', true);
        }
    );

    adminDebugTool?.addSubmenuButton(
        'spawns',
        mod.Message(mod.stringkeys.debugTool.buttons.helicopters),
        async () => {
            adminDebugTool?.showSubmenu('spawns', false);
            adminDebugTool?.showSubmenu('helicopters', true);
        }
    );

    adminDebugTool?.addSubmenuButton(
        'spawns',
        mod.Message(mod.stringkeys.debugTool.buttons.boats),
        async () => {
            adminDebugTool?.showSubmenu('spawns', false);
            adminDebugTool?.showSubmenu('boats', true);
        }
    );

    // Add Admin Tools submenu buttons
    adminDebugTool?.addSubmenuButton(
        'adminTools',
        mod.Message(mod.stringkeys.debugTool.buttons.showStaticLogger),
        async () => {
            adminDebugTool?.showStaticLogger();
        }
    );

    adminDebugTool?.addSubmenuButton(
        'adminTools',
        mod.Message(mod.stringkeys.debugTool.buttons.showDynamicLogger),
        async () => {
            adminDebugTool?.showDynamicLogger();
        }
    );

    adminDebugTool?.addSubmenuButton(
        'adminTools',
        mod.Message(mod.stringkeys.debugTool.buttons.hideStaticLogger),
        async () => {
            adminDebugTool?.hideStaticLogger();
        }
    );

    adminDebugTool?.addSubmenuButton(
        'adminTools',
        mod.Message(mod.stringkeys.debugTool.buttons.hideDynamicLogger),
        async () => {
            adminDebugTool?.hideDynamicLogger();
        }
    );

    adminDebugTool?.addSubmenuButton(
        'adminTools',
        mod.Message(mod.stringkeys.debugTool.buttons.clearStaticLogger),
        async () => {
            adminDebugTool?.clearStaticLogger();
        }
    );

    adminDebugTool?.addSubmenuButton(
        'adminTools',
        mod.Message(mod.stringkeys.debugTool.buttons.clearDynamicLogger),
        async () => {
            adminDebugTool?.clearDynamicLogger();
        }
    );

    // Add Spawns submenu buttons - removed quick helicopter and golf cart spawns
    // These are now available under faction vehicle menus

    // Add Ground Vehicles (all factions combined)
    adminDebugTool?.addSubmenuButton(
        'groundVehicles',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnAbrams),
        async () => await spawnVehicle(player, mod.VehicleList.Abrams)
    );

    adminDebugTool?.addSubmenuButton(
        'groundVehicles',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnCheetah),
        async () => await spawnVehicle(player, mod.VehicleList.Cheetah)
    );

    adminDebugTool?.addSubmenuButton(
        'groundVehicles',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnCV90),
        async () => await spawnVehicle(player, mod.VehicleList.CV90)
    );

    adminDebugTool?.addSubmenuButton(
        'groundVehicles',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnFlyer60),
        async () => await spawnVehicle(player, mod.VehicleList.Flyer60)
    );

    adminDebugTool?.addSubmenuButton(
        'groundVehicles',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnGepard),
        async () => await spawnVehicle(player, mod.VehicleList.Gepard)
    );

    adminDebugTool?.addSubmenuButton(
        'groundVehicles',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnGolfCart),
        async () => await spawnVehicle(player, mod.VehicleList.GolfCart)
    );

        adminDebugTool?.addSubmenuButton(
        'groundVehicles',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnMarauder),
        async () => await spawnVehicle(player, mod.VehicleList.Marauder)
    );

    adminDebugTool?.addSubmenuButton(
        'groundVehicles',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnMarauderPax),
        async () => await spawnVehicle(player, mod.VehicleList.Marauder_Pax)
    );

    adminDebugTool?.addSubmenuButton(
        'groundVehicles',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnLeopard),
        async () => await spawnVehicle(player, mod.VehicleList.Leopard)
    );

    adminDebugTool?.addSubmenuButton(
        'groundVehicles',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnM2Bradley),
        async () => await spawnVehicle(player, mod.VehicleList.M2Bradley)
    );

    adminDebugTool?.addSubmenuButton(
        'groundVehicles',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnQuadbike),
        async () => await spawnVehicle(player, mod.VehicleList.Quadbike)
    );

    adminDebugTool?.addSubmenuButton(
        'groundVehicles',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnVector),
        async () => await spawnVehicle(player, mod.VehicleList.Vector)
    );

    // Add Aircraft (all factions combined)
    adminDebugTool?.addSubmenuButton(
        'aircraft',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnF16),
        async () => await spawnVehicle(player, mod.VehicleList.F16)
    );

    adminDebugTool?.addSubmenuButton(
        'aircraft',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnF22),
        async () => await spawnVehicle(player, mod.VehicleList.F22)
    );

    adminDebugTool?.addSubmenuButton(
        'aircraft',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnJAS39),
        async () => await spawnVehicle(player, mod.VehicleList.JAS39)
    );

    adminDebugTool?.addSubmenuButton(
        'aircraft',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnSU57),
        async () => await spawnVehicle(player, mod.VehicleList.SU57)
    );

    // Add Helicopters (all factions combined)
    adminDebugTool?.addSubmenuButton(
        'helicopters',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnAH64),
        async () => await spawnVehicle(player, mod.VehicleList.AH64)
    );

    adminDebugTool?.addSubmenuButton(
        'helicopters',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnEurocopter),
        async () => await spawnVehicle(player, mod.VehicleList.Eurocopter)
    );

//Removed Marauders, now under ground vehicles

    adminDebugTool?.addSubmenuButton(
        'helicopters',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnUH60),
        async () => await spawnVehicle(player, mod.VehicleList.UH60)
    );

    adminDebugTool?.addSubmenuButton(
        'helicopters',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnUH60Pax),
        async () => await spawnVehicle(player, mod.VehicleList.UH60_Pax)
    );

    // Add Boats
    adminDebugTool?.addSubmenuButton(
        'boats',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnRHIB),
        async () => await spawnVehicle(player, mod.VehicleList.RHIB)
    );

    // Log a message to the static logger.
    adminDebugTool?.staticLog(`Triple-click interact key to open debug menu.`, 0);
}

function destroyAdminDebugTool(playerId: number): void {
    // If the player is not the admin player, then we know the admin is still in the game, so we can exit this function.
    if (playerId !== 0) return;

    // Clear the telemetry interval so it doesn't continue to log the admin's position and facing direction,
    // destroy the jump detector, and destroy the debug tool.
    Timers.clearInterval(telemetryInterval);
    jumpDetector?.destroy();
    adminDebugTool?.destroy();
    telemetryInterval = undefined;
    jumpDetector = undefined;
    adminDebugTool = undefined;
}

function showTelemetry(player: mod.Player): void {
    // The admin player is player id 0 for non-persistent test servers,
    // so don't do the rest of this unless it's the admin player.
    if (mod.GetObjId(player) != 0) return;

    // Log the admin's position and facing direction to the static logger, in rows 1 and 2, every second.
    telemetryInterval = Timers.setInterval(() => {
        adminDebugTool?.staticLog(
            `Position: ${getPlayerStateVectorString(player, mod.SoldierStateVector.GetPosition)}`,
            1
        );

        adminDebugTool?.staticLog(
            `Facing: ${getPlayerStateVectorString(player, mod.SoldierStateVector.GetFacingDirection)}`,
            2
        );
    }, 1000);
}

function stopTelemetry(player: mod.Player): void {
    // The admin player is player id 0 for non-persistent test servers,
    // so don't do the rest of this unless it's the admin player.
    if (mod.GetObjId(player) != 0) return;

    // Clear the telemetry interval so it doesn't continue to log the admin's position and facing direction.
    Timers.clearInterval(telemetryInterval);
}

function handlePlayerDeployed(player: mod.Player): void {
    // Log a message to the dynamic logger that the player has deployed.
    adminDebugTool?.dynamicLog(`Player ${mod.GetObjId(player)} deployed.`);

    // Get the current map (Can be undefined if the map cannot be determined).
    const map = MapDetector.currentMap();

    if (map) {
        mod.DisplayNotificationMessage(
            mod.Message(mod.stringkeys.template.notifications.deployedOnMap, player, mod.stringkeys.template.maps[map]),
            player
        );
    } else {
        mod.DisplayNotificationMessage(mod.Message(mod.stringkeys.template.notifications.deployed, player), player);
    }
}

// Event subscriptions for the admin debug tool.
Events.OnPlayerJoinGame.subscribe(createAdminDebugTool);
Events.OnPlayerDeployed.subscribe(showTelemetry);
Events.OnPlayerUndeploy.subscribe(stopTelemetry);
Events.OnPlayerLeaveGame.subscribe(destroyAdminDebugTool);

// Event subscriptions for notifying players of their name and the current map.
Events.OnPlayerDeployed.subscribe(handlePlayerDeployed);
