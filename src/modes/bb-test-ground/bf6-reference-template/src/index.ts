import { Events } from 'bf6-portal-utils/events/index.ts';
import { Timers } from 'bf6-portal-utils/timers/index.ts';
import { MultiClickDetector } from 'bf6-portal-utils/multi-click-detector/index.ts';
import { MapDetector } from 'bf6-portal-utils/map-detector/index.ts';
import { Vectors } from 'bf6-portal-utils/vectors/index.ts';

import { DebugTool } from './debug-tool/index.ts';
import { getPlayerStateVectorString } from './helpers/index.ts';
import { JumpDetector } from './jump-detector/index.ts';


const debugToolsByPlayerId = new Map<number, DebugTool>();
const telemetryIntervalsByPlayerId = new Map<number, number>();
const jumpDetectorsByPlayerId = new Map<number, JumpDetector>();

function getDebugToolForPlayer(player: mod.Player): DebugTool | undefined {
    return debugToolsByPlayerId.get(mod.GetObjId(player));
}

function destroyPlayerDebugState(playerId: number): void {
    const telemetryInterval = telemetryIntervalsByPlayerId.get(playerId);
    if (telemetryInterval !== undefined) {
        Timers.clearInterval(telemetryInterval);
        telemetryIntervalsByPlayerId.delete(playerId);
    }

    const jumpDetector = jumpDetectorsByPlayerId.get(playerId);
    jumpDetector?.destroy();
    jumpDetectorsByPlayerId.delete(playerId);

    const debugTool = debugToolsByPlayerId.get(playerId);
    debugTool?.destroy();
    debugToolsByPlayerId.delete(playerId);
}

async function spawnVehicle(player: mod.Player, vehicleType: mod.VehicleList): Promise<void> {
    const debugTool = getDebugToolForPlayer(player);
    const playerPosition = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
    const playerFacingDirection = mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection);

    // Create position 20 meters in front of player (facing direction).
    const position = mod.CreateVector(
        mod.XComponentOf(playerPosition) + mod.XComponentOf(playerFacingDirection) * 20,
        mod.YComponentOf(playerPosition),
        mod.ZComponentOf(playerPosition) + mod.ZComponentOf(playerFacingDirection) * 20
    );

    debugTool?.dynamicLog(`Spawning vehicle spawner at ${Vectors.getVectorString(position)}`);

    const spawner = mod.SpawnObject(
        mod.RuntimeSpawn_Common.VehicleSpawner,
        position,
        mod.CreateVector(0, 0, 0)
    ) as mod.VehicleSpawner;

    // Need to wait a bit before setting the vehicle spawner settings.
    await mod.Wait(1);

    debugTool?.dynamicLog(`Setting vehicle spawner settings.`);

    mod.SetVehicleSpawnerVehicleType(spawner, vehicleType);
    mod.SetVehicleSpawnerAutoSpawn(spawner, true);
    mod.SetVehicleSpawnerRespawnTime(spawner, 1);

    debugTool?.dynamicLog(`Spawning vehicle in 1 second.`);

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

        debugTool?.dynamicLog(`Vehicle spawned.`);

        // Disable automatic vehicle respawning for the spawner as we're going to unspawn it once the vehicle's destroyed.
        mod.SetVehicleSpawnerAutoSpawn(spawner, false);

        const unsubscribeFromOnVehicleDestroyed = Events.OnVehicleDestroyed.subscribe((destroyedVehicle) => {
            // If the destroyed vehicle is not the specific vehicle we're looking for, ignore it.
            if (mod.GetObjId(destroyedVehicle) !== mod.GetObjId(vehicle)) return;

            // Unsubscribe from the OnVehicleDestroyed event as this context no longer needs to know when the vehicle is destroyed.
            unsubscribeFromOnVehicleDestroyed();

            debugTool?.dynamicLog(`Vehicle destroyed.`);

            // Unspawn the vehicle spawner.
            mod.UnspawnObject(spawner);

            debugTool?.dynamicLog(`Vehicle spawner unspawned.`);
        });
    });
}

function createAdminDebugTool(player: mod.Player): void {
    // The admin player is player id 0 for non-persistent test servers,
    // so don't do the rest of this unless it's the admin player.
    /* Note: Commented out this 'if' statement to allow non-admin players to see the position and facing
     direction telemetry in the static logger for testing and demonstration purposes, specifically to allow 
     all players in the bb-test-ground map to see their position 
     and facing direction in the static logger without needing to be the admin player. Doing this mainly to allow all players to have the vehicle spawner buttons
     in the debug menu. This is useful for testing and demonstration purposes.
         if (mod.GetObjId(player) != 0) return;
    */
   
    const playerId = mod.GetObjId(player);

    if (debugToolsByPlayerId.has(playerId)) return;

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

    const debugTool = new DebugTool(player, debugToolOptions);
    debugToolsByPlayerId.set(playerId, debugTool);

    // Create a multi-click detector to open the debug menu when the player triple-clicks the interact key.
    new MultiClickDetector(player, () => {
        debugTool.showDebugMenu();
    });

    // Create a jump detector to open the debug menu after 5 jumps within 30 seconds.
    const jumpDetector = new JumpDetector(player, () => {
        debugTool.showDebugMenu();
        debugTool.dynamicLog('Debug menu opened via 5-jump trigger!');
    }, (msg) => {
        debugTool.dynamicLog(`[JumpDetector] ${msg}`);
    });
    jumpDetectorsByPlayerId.set(playerId, jumpDetector);

    // Create submenus
    debugTool.createSubmenu('adminTools', 'Admin Tools');
    debugTool.createSubmenu('spawns', 'Spawns');
    debugTool.createSubmenu('groundVehicles', 'Ground Vehicles');
    debugTool.createSubmenu('aircraft', 'Aircraft');
    debugTool.createSubmenu('helicopters', 'Helicopters');
    debugTool.createSubmenu('boats', 'Boats');

    // Add main menu buttons
    debugTool.addDebugMenuButton(
        mod.Message(mod.stringkeys.debugTool.buttons.adminTools),
        async () => {
            debugTool.hideDebugMenu();
            debugTool.showSubmenu('adminTools', true);
        }
    );

    debugTool.addDebugMenuButton(
        mod.Message(mod.stringkeys.debugTool.buttons.spawns),
        async () => {
            debugTool.hideDebugMenu();
            debugTool.showSubmenu('spawns', true);
        }
    );

    // Add Spawns submenu buttons (vehicle classifications)
    debugTool.addSubmenuButton(
        'spawns',
        mod.Message(mod.stringkeys.debugTool.buttons.groundVehicles),
        async () => {
            debugTool.showSubmenu('spawns', false);
            debugTool.showSubmenu('groundVehicles', true);
        }
    );

    debugTool.addSubmenuButton(
        'spawns',
        mod.Message(mod.stringkeys.debugTool.buttons.aircraft),
        async () => {
            debugTool.showSubmenu('spawns', false);
            debugTool.showSubmenu('aircraft', true);
        }
    );

    debugTool.addSubmenuButton(
        'spawns',
        mod.Message(mod.stringkeys.debugTool.buttons.helicopters),
        async () => {
            debugTool.showSubmenu('spawns', false);
            debugTool.showSubmenu('helicopters', true);
        }
    );

    debugTool.addSubmenuButton(
        'spawns',
        mod.Message(mod.stringkeys.debugTool.buttons.boats),
        async () => {
            debugTool.showSubmenu('spawns', false);
            debugTool.showSubmenu('boats', true);
        }
    );

    // Add Admin Tools submenu buttons
    debugTool.addSubmenuButton(
        'adminTools',
        mod.Message(mod.stringkeys.debugTool.buttons.showStaticLogger),
        async () => {
            debugTool.showStaticLogger();
        }
    );

    debugTool.addSubmenuButton(
        'adminTools',
        mod.Message(mod.stringkeys.debugTool.buttons.showDynamicLogger),
        async () => {
            debugTool.showDynamicLogger();
        }
    );

    debugTool.addSubmenuButton(
        'adminTools',
        mod.Message(mod.stringkeys.debugTool.buttons.hideStaticLogger),
        async () => {
            debugTool.hideStaticLogger();
        }
    );

    debugTool.addSubmenuButton(
        'adminTools',
        mod.Message(mod.stringkeys.debugTool.buttons.hideDynamicLogger),
        async () => {
            debugTool.hideDynamicLogger();
        }
    );

    debugTool.addSubmenuButton(
        'adminTools',
        mod.Message(mod.stringkeys.debugTool.buttons.clearStaticLogger),
        async () => {
            debugTool.clearStaticLogger();
        }
    );

    debugTool.addSubmenuButton(
        'adminTools',
        mod.Message(mod.stringkeys.debugTool.buttons.clearDynamicLogger),
        async () => {
            debugTool.clearDynamicLogger();
        }
    );

    // Add Spawns submenu buttons - removed quick helicopter and golf cart spawns
    // These are now available under faction vehicle menus

    // Add Ground Vehicles (all factions combined)
    debugTool.addSubmenuButton(
        'groundVehicles',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnAbrams),
        async () => await spawnVehicle(player, mod.VehicleList.Abrams)
    );

    debugTool.addSubmenuButton(
        'groundVehicles',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnCheetah),
        async () => await spawnVehicle(player, mod.VehicleList.Cheetah)
    );

    debugTool.addSubmenuButton(
        'groundVehicles',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnCV90),
        async () => await spawnVehicle(player, mod.VehicleList.CV90)
    );

    debugTool.addSubmenuButton(
        'groundVehicles',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnFlyer60),
        async () => await spawnVehicle(player, mod.VehicleList.Flyer60)
    );

    debugTool.addSubmenuButton(
        'groundVehicles',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnGepard),
        async () => await spawnVehicle(player, mod.VehicleList.Gepard)
    );

    debugTool.addSubmenuButton(
        'groundVehicles',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnGolfCart),
        async () => await spawnVehicle(player, mod.VehicleList.GolfCart)
    );

    debugTool.addSubmenuButton(
        'groundVehicles',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnMarauder),
        async () => await spawnVehicle(player, mod.VehicleList.Marauder)
    );

    debugTool.addSubmenuButton(
        'groundVehicles',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnMarauderPax),
        async () => await spawnVehicle(player, mod.VehicleList.Marauder_Pax)
    );

    debugTool.addSubmenuButton(
        'groundVehicles',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnLeopard),
        async () => await spawnVehicle(player, mod.VehicleList.Leopard)
    );

    debugTool.addSubmenuButton(
        'groundVehicles',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnM2Bradley),
        async () => await spawnVehicle(player, mod.VehicleList.M2Bradley)
    );

    debugTool.addSubmenuButton(
        'groundVehicles',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnQuadbike),
        async () => await spawnVehicle(player, mod.VehicleList.Quadbike)
    );

    debugTool.addSubmenuButton(
        'groundVehicles',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnVector),
        async () => await spawnVehicle(player, mod.VehicleList.Vector)
    );

    // Add Aircraft (all factions combined)
    debugTool.addSubmenuButton(
        'aircraft',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnF16),
        async () => await spawnVehicle(player, mod.VehicleList.F16)
    );

    debugTool.addSubmenuButton(
        'aircraft',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnF22),
        async () => await spawnVehicle(player, mod.VehicleList.F22)
    );

    debugTool.addSubmenuButton(
        'aircraft',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnJAS39),
        async () => await spawnVehicle(player, mod.VehicleList.JAS39)
    );

    debugTool.addSubmenuButton(
        'aircraft',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnSU57),
        async () => await spawnVehicle(player, mod.VehicleList.SU57)
    );

    // Add Helicopters (all factions combined)
    debugTool.addSubmenuButton(
        'helicopters',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnAH64),
        async () => await spawnVehicle(player, mod.VehicleList.AH64)
    );

    debugTool.addSubmenuButton(
        'helicopters',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnEurocopter),
        async () => await spawnVehicle(player, mod.VehicleList.Eurocopter)
    );

//Removed Marauders, now under ground vehicles

    debugTool.addSubmenuButton(
        'helicopters',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnUH60),
        async () => await spawnVehicle(player, mod.VehicleList.UH60)
    );

    debugTool.addSubmenuButton(
        'helicopters',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnUH60Pax),
        async () => await spawnVehicle(player, mod.VehicleList.UH60_Pax)
    );

    // Add Boats
    debugTool.addSubmenuButton(
        'boats',
        mod.Message(mod.stringkeys.debugTool.buttons.spawnRHIB),
        async () => await spawnVehicle(player, mod.VehicleList.RHIB)
    );

    // Log a message to the static logger.
    debugTool.staticLog(`Triple-click interact key to open debug menu.`, 0);
}

function destroyAdminDebugTool(playerId: number): void {
    destroyPlayerDebugState(playerId);
}

function showTelemetry(player: mod.Player): void {
    if (!getDebugToolForPlayer(player)) {
        createAdminDebugTool(player);
    }

    const playerId = mod.GetObjId(player);
    const debugTool = getDebugToolForPlayer(player);
    if (!debugTool) return;

    // Replace prior interval for this player if one already exists.
    const existingInterval = telemetryIntervalsByPlayerId.get(playerId);
    if (existingInterval !== undefined) {
        Timers.clearInterval(existingInterval);
    }

    const telemetryInterval = Timers.setInterval(() => {
        debugTool.staticLog(
            `Position: ${getPlayerStateVectorString(player, mod.SoldierStateVector.GetPosition)}`,
            1
        );

        debugTool.staticLog(
            `Facing: ${getPlayerStateVectorString(player, mod.SoldierStateVector.GetFacingDirection)}`,
            2
        );
    }, 1000);

    telemetryIntervalsByPlayerId.set(playerId, telemetryInterval);
}

function stopTelemetry(player: mod.Player): void {
    const playerId = mod.GetObjId(player);
    const telemetryInterval = telemetryIntervalsByPlayerId.get(playerId);
    if (telemetryInterval !== undefined) {
        Timers.clearInterval(telemetryInterval);
        telemetryIntervalsByPlayerId.delete(playerId);
    }
}

function handlePlayerDeployed(player: mod.Player): void {
    if (!getDebugToolForPlayer(player)) {
        createAdminDebugTool(player);
    }

    // Log a message to this player's dynamic logger that they have deployed.
    getDebugToolForPlayer(player)?.dynamicLog(`Player ${mod.GetObjId(player)} deployed.`);

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

function applyStartingArmor(player: mod.Player): void {
    // Apply one level of armor.
    mod.AddEquipment(player, mod.ArmorTypes.CeramicArmor);

    // Give one armor plate in inventory.
    mod.SetInventoryAmmo(player, mod.InventorySlots.MiscGadget, 1);
}

/*   Armor Section Needs to be completed
mod.SetInventoryMagazineAmmo(player, mod.InventorySlots.PrimaryWeapon, 150);
mod.SetInventoryMagazineAmmo(player, mod.InventorySlots.SecondaryWeapon, 30);

applyStartingArmor(player);
*/



// Event subscriptions for the admin debug tool.
Events.OnPlayerJoinGame.subscribe(createAdminDebugTool);
Events.OngoingPlayer.subscribe((player) => {
    // Fallback initializer for script hot-reload/server edge cases.
    if (!getDebugToolForPlayer(player)) {
        createAdminDebugTool(player);
    }
});
Events.OnPlayerDeployed.subscribe(showTelemetry);
Events.OnPlayerUndeploy.subscribe(stopTelemetry);
Events.OnPlayerLeaveGame.subscribe(destroyAdminDebugTool);

// Event subscriptions for notifying players of their name and the current map.
Events.OnPlayerDeployed.subscribe(handlePlayerDeployed);    
