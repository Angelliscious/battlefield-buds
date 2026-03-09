import { Events } from 'bf6-portal-utils/events/index.ts';

type ArmorPickupObject = unknown;
type ArmorInventoryItem = unknown;

export const armorMod = mod as typeof mod & {
    WeaponList: { ArmorPlate: ArmorInventoryItem };
    ObjectType: { Pickup: number };
    PickupType: { ArmorPlate: number; AmmoBox?: number; AmmoCrate?: number };
    ResupplyTypes: { AmmoBox?: number; AmmoCrate?: number };
    SetSoldierArmorLevel(player: mod.Player, level: number): void;
    GiveInventoryItem(player: mod.Player, item: ArmorInventoryItem, count: number): void;
    GetInventoryItemCount(player: mod.Player, item: ArmorInventoryItem): number;
    GetInventoryMagazineAmmo(player: mod.Player, slot: mod.InventorySlots): number;
    SetInventoryAmmo(player: mod.Player, slot: mod.InventorySlots, amount: number): void;
    Resupply(player: mod.Player, type: number): void;
    GetObjectsInRange(position: unknown, range: number): ArmorPickupObject[];
    GetObjectType(objectRef: ArmorPickupObject): number;
    GetPickupType(objectRef: ArmorPickupObject): number;
    PickupObject(player: mod.Player, objectRef: ArmorPickupObject): void;
    DropInventoryItem(player: mod.Player, item: ArmorInventoryItem, position: unknown): void;
    RemoveInventoryItem(player: mod.Player, item: ArmorInventoryItem, count: number): void;
};

export const armorEvents = Events as typeof Events & {
    OnInteractKeyPressed: {
        subscribe(handler: (player: mod.Player) => void): void;
    };
    OnPlayerDeath: {
        subscribe(handler: (player: mod.Player) => void): void;
    };
};
