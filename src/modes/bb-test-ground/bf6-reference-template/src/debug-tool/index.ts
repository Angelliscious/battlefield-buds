import { Logger } from 'bf6-portal-utils/logger/index.ts';
import { UI } from 'bf6-portal-utils/ui/index.ts';
import { UIContainer } from 'bf6-portal-utils/ui/components/container/index.ts';
import { UITextButton } from 'bf6-portal-utils/ui/components/text-button/index.ts';
import { Timers } from 'bf6-portal-utils/timers/index.ts';

export class VehicleLoadoutManager {
    private _player: mod.Player;
    private _debugTool: DebugTool;
    private _loadoutMenu: UIContainer | null = null;
    private _weaponMenu: UIContainer | null = null;
    private _gadgetMenu: UIContainer | null = null;
    private _activeLoadoutSession: {
        vehicle: mod.Vehicle;
        entryTime: number;
        entryPosition: mod.Vector;
        timerId: number | null;
        positionCheckId: number | null;
    } | null = null;

    // Common vehicle weapons and gadgets
    private readonly VEHICLE_WEAPONS = [
        { name: 'M4A1', weapon: mod.Weapons.Carbine_M4A1 },
        { name: 'AK-74M', weapon: mod.Weapons.AssaultRifle_AK4D },
        { name: 'SCAR-H', weapon: mod.Weapons.Carbine_SG_553R },
        { name: 'M240B', weapon: mod.Weapons.LMG_M240L },
        { name: 'PKP Pecheneg', weapon: mod.Weapons.LMG_RPKM },
        { name: 'M416', weapon: mod.Weapons.AssaultRifle_M433 },
    ];

    private readonly VEHICLE_GADGETS = [
        { name: 'Medkit', gadget: mod.Gadgets.Class_Adrenaline_Injector },
        { name: 'Ammo Box', gadget: mod.Gadgets.Class_Supply_Bag },
        { name: 'Repair Tool', gadget: mod.Gadgets.Class_Repair_Tool },
        { name: 'C4', gadget: mod.Gadgets.Misc_Demolition_Charge },
        { name: 'Claymore', gadget: mod.Gadgets.Misc_Anti_Personnel_Mine },
        { name: 'AT Mine', gadget: mod.Gadgets.Misc_Anti_Vehicle_Mine },
    ];

    public constructor(player: mod.Player, debugTool: DebugTool) {
        this._player = player;
        this._debugTool = debugTool;
    }

    public onPlayerEnterVehicle(player: mod.Player, vehicle: mod.Vehicle): void {
        if (player !== this._player) return;

        // Cancel any existing session
        this.cancelLoadoutSession();

        // Start new loadout session
        const entryPosition = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
        const entryTime = mod.GetMatchTimeElapsed();

        this._activeLoadoutSession = {
            vehicle,
            entryTime,
            entryPosition,
            timerId: null,
            positionCheckId: null
        };

        // Show loadout modification menu
        this.showLoadoutMenu();

        // Start 30-second timer
        this._activeLoadoutSession.timerId = Timers.setTimeout(() => {
            this.cancelLoadoutSession();
        }, 30000);

        // Start position monitoring
        this.startPositionMonitoring();

        // Subscribe to weapon fire events (if available)
        this.setupWeaponFireDetection();
    }

    public onPlayerExitVehicle(player: mod.Player, vehicle: mod.Vehicle): void {
        if (player !== this._player) return;
        this.cancelLoadoutSession();
    }

    private showLoadoutMenu(): void {
        if (this._loadoutMenu) {
            this._loadoutMenu.delete();
        }

        const menuConfig: UIContainer.Params = {
            receiver: this._player,
            width: 250,
            height: 150,
            anchor: mod.UIAnchor.TopRight,
            bgColor: UI.COLORS.BLACK,
            bgFill: mod.UIBgFill.Blur,
            bgAlpha: 0.9,
            visible: true,
            uiInputModeWhenVisible: true,
            childrenParams: [
                {
                    type: UITextButton,
                    y: 0,
                    width: 250,
                    height: 25,
                    anchor: mod.UIAnchor.TopCenter,
                    bgColor: UI.COLORS.GREY_25,
                    baseColor: UI.COLORS.BLACK,
                    message: mod.Message(mod.stringkeys.debugTool.buttons.vehicleLoadout),
                    textSize: 18,
                    textColor: UI.COLORS.BF_BLUE_BRIGHT,
                    onClick: async () => {
                        // This would open weapon/gadget selection
                        this.showWeaponSelection();
                    },
                },
                {
                    type: UITextButton,
                    y: 30,
                    width: 250,
                    height: 20,
                    anchor: mod.UIAnchor.TopCenter,
                    bgColor: UI.COLORS.GREY_25,
                    baseColor: UI.COLORS.BLACK,
                    message: mod.Message(mod.stringkeys.debugTool.buttons.modifyLoadout),
                    textSize: 16,
                    textColor: UI.COLORS.BF_GREEN_BRIGHT,
                    onClick: async () => {
                        this.showLoadoutModificationMenu();
                    },
                },
                {
                    type: UITextButton,
                    y: 55,
                    width: 250,
                    height: 20,
                    anchor: mod.UIAnchor.TopCenter,
                    bgColor: UI.COLORS.GREY_25,
                    baseColor: UI.COLORS.BLACK,
                    message: mod.Message('Close Loadout Menu'),
                    textSize: 16,
                    textColor: UI.COLORS.BF_RED_BRIGHT,
                    onClick: async () => {
                        this.hideLoadoutMenu();
                    },
                },
            ],
        };

        this._loadoutMenu = new UIContainer(menuConfig);
    }

    private showWeaponSelection(): void {
        this.hideLoadoutMenu();
        this.showWeaponMenu();
    }

    private showLoadoutModificationMenu(): void {
        this.hideLoadoutMenu();
        this.showDetailedLoadoutMenu();
    }

    private showWeaponMenu(): void {
        if (this._weaponMenu) {
            this._weaponMenu.delete();
        }

        const menuHeight = 50 + (this.VEHICLE_WEAPONS.length * 25);
        const menuConfig: UIContainer.Params = {
            receiver: this._player,
            width: 300,
            height: menuHeight,
            anchor: mod.UIAnchor.TopRight,
            bgColor: UI.COLORS.BLACK,
            bgFill: mod.UIBgFill.Blur,
            bgAlpha: 0.9,
            visible: true,
            uiInputModeWhenVisible: true,
            childrenParams: [],
        };

        // Add back button
        menuConfig.childrenParams!.push({
            type: UITextButton,
            y: 0,
            width: 300,
            height: 25,
            anchor: mod.UIAnchor.TopCenter,
            bgColor: UI.COLORS.GREY_25,
            baseColor: UI.COLORS.BLACK,
            message: mod.Message('Back to Loadout Menu'),
            textSize: 16,
            textColor: UI.COLORS.BF_RED_BRIGHT,
            onClick: async () => {
                this.hideWeaponMenu();
                this.showLoadoutMenu();
            },
        });

        // Add weapon buttons
        this.VEHICLE_WEAPONS.forEach((weaponInfo, index) => {
            menuConfig.childrenParams!.push({
                type: UITextButton,
                y: 30 + (index * 25),
                width: 300,
                height: 20,
                anchor: mod.UIAnchor.TopCenter,
                bgColor: UI.COLORS.GREY_25,
                baseColor: UI.COLORS.BLACK,
                message: mod.Message(weaponInfo.name),
                textSize: 16,
                textColor: UI.COLORS.BF_GREEN_BRIGHT,
                onClick: async () => {
                    this.equipWeapon(weaponInfo.weapon);
                    this._debugTool.dynamicLog(`Equipped ${weaponInfo.name}`);
                },
            });
        });

        this._weaponMenu = new UIContainer(menuConfig);
    }

    private showDetailedLoadoutMenu(): void {
        // Create a comprehensive loadout modification menu
        const menuConfig: UIContainer.Params = {
            receiver: this._player,
            width: 350,
            height: 200,
            anchor: mod.UIAnchor.TopRight,
            bgColor: UI.COLORS.BLACK,
            bgFill: mod.UIBgFill.Blur,
            bgAlpha: 0.9,
            visible: true,
            uiInputModeWhenVisible: true,
            childrenParams: [
                {
                    type: UITextButton,
                    y: 0,
                    width: 350,
                    height: 25,
                    anchor: mod.UIAnchor.TopCenter,
                    bgColor: UI.COLORS.GREY_25,
                    baseColor: UI.COLORS.BLACK,
                    message: mod.Message('Back to Loadout Menu'),
                    textSize: 16,
                    textColor: UI.COLORS.BF_RED_BRIGHT,
                    onClick: async () => {
                        this.hideDetailedLoadoutMenu();
                        this.showLoadoutMenu();
                    },
                },
                {
                    type: UITextButton,
                    y: 30,
                    width: 350,
                    height: 25,
                    anchor: mod.UIAnchor.TopCenter,
                    bgColor: UI.COLORS.GREY_25,
                    baseColor: UI.COLORS.BLACK,
                    message: mod.Message(mod.stringkeys.debugTool.buttons.weapons),
                    textSize: 18,
                    textColor: UI.COLORS.BF_BLUE_BRIGHT,
                    onClick: async () => {
                        this.hideDetailedLoadoutMenu();
                        this.showWeaponMenu();
                    },
                },
                {
                    type: UITextButton,
                    y: 60,
                    width: 350,
                    height: 25,
                    anchor: mod.UIAnchor.TopCenter,
                    bgColor: UI.COLORS.GREY_25,
                    baseColor: UI.COLORS.BLACK,
                    message: mod.Message(mod.stringkeys.debugTool.buttons.gadgets),
                    textSize: 18,
                    textColor: UI.COLORS.BF_BLUE_BRIGHT,
                    onClick: async () => {
                        this.hideDetailedLoadoutMenu();
                        this.showGadgetMenu();
                    },
                },
                {
                    type: UITextButton,
                    y: 90,
                    width: 350,
                    height: 25,
                    anchor: mod.UIAnchor.TopCenter,
                    bgColor: UI.COLORS.GREY_25,
                    baseColor: UI.COLORS.BLACK,
                    message: mod.Message('Clear All Equipment'),
                    textSize: 16,
                    textColor: UI.COLORS.BF_RED_BRIGHT,
                    onClick: async () => {
                        this.clearAllEquipment();
                        this._debugTool.dynamicLog('Cleared all equipment');
                    },
                },
            ],
        };

        this._loadoutMenu = new UIContainer(menuConfig);
    }

    private showGadgetMenu(): void {
        if (this._gadgetMenu) {
            this._gadgetMenu.delete();
        }

        const menuHeight = 50 + (this.VEHICLE_GADGETS.length * 25);
        const menuConfig: UIContainer.Params = {
            receiver: this._player,
            width: 300,
            height: menuHeight,
            anchor: mod.UIAnchor.TopRight,
            bgColor: UI.COLORS.BLACK,
            bgFill: mod.UIBgFill.Blur,
            bgAlpha: 0.9,
            visible: true,
            uiInputModeWhenVisible: true,
            childrenParams: [],
        };

        // Add back button
        menuConfig.childrenParams!.push({
            type: UITextButton,
            y: 0,
            width: 300,
            height: 25,
            anchor: mod.UIAnchor.TopCenter,
            bgColor: UI.COLORS.GREY_25,
            baseColor: UI.COLORS.BLACK,
            message: mod.Message('Back to Loadout Menu'),
            textSize: 16,
            textColor: UI.COLORS.BF_RED_BRIGHT,
            onClick: async () => {
                this.hideGadgetMenu();
                this.showLoadoutMenu();
            },
        });

        // Add gadget buttons
        this.VEHICLE_GADGETS.forEach((gadgetInfo, index) => {
            menuConfig.childrenParams!.push({
                type: UITextButton,
                y: 30 + (index * 25),
                width: 300,
                height: 20,
                anchor: mod.UIAnchor.TopCenter,
                bgColor: UI.COLORS.GREY_25,
                baseColor: UI.COLORS.BLACK,
                message: mod.Message(gadgetInfo.name),
                textSize: 16,
                textColor: UI.COLORS.BF_GREEN_BRIGHT,
                onClick: async () => {
                    this.equipGadget(gadgetInfo.gadget);
                    this._debugTool.dynamicLog(`Equipped ${gadgetInfo.name}`);
                },
            });
        });

        this._gadgetMenu = new UIContainer(menuConfig);
    }

    private equipWeapon(weapon: mod.Weapons): void {
        try {
            // Remove existing primary weapon first
            mod.RemoveEquipment(this._player, mod.InventorySlots.PrimaryWeapon);
            // Add new weapon
            mod.AddEquipment(this._player, weapon, mod.InventorySlots.PrimaryWeapon);
        } catch (error) {
            this._debugTool.dynamicLog(`Failed to equip weapon: ${error}`);
        }
    }

    private equipGadget(gadget: mod.Gadgets): void {
        try {
            // Try to add to first available gadget slot
            mod.AddEquipment(this._player, gadget, mod.InventorySlots.GadgetOne);
        } catch (error) {
            try {
                // Try second gadget slot
                mod.AddEquipment(this._player, gadget, mod.InventorySlots.GadgetTwo);
            } catch (secondError) {
                this._debugTool.dynamicLog(`Failed to equip gadget: ${secondError}`);
            }
        }
    }

    private clearAllEquipment(): void {
        try {
            // Clear all inventory slots
            mod.RemoveEquipment(this._player, mod.InventorySlots.PrimaryWeapon);
            mod.RemoveEquipment(this._player, mod.InventorySlots.SecondaryWeapon);
            mod.RemoveEquipment(this._player, mod.InventorySlots.GadgetOne);
            mod.RemoveEquipment(this._player, mod.InventorySlots.GadgetTwo);
            mod.RemoveEquipment(this._player, mod.InventorySlots.Throwable);
        } catch (error) {
            this._debugTool.dynamicLog(`Error clearing equipment: ${error}`);
        }
    }

    private hideLoadoutMenu(): void {
        if (this._loadoutMenu) {
            this._loadoutMenu.hide();
            mod.EnableUIInputMode(false, this._player);
        }
    }

    private hideWeaponMenu(): void {
        if (this._weaponMenu) {
            this._weaponMenu.hide();
            mod.EnableUIInputMode(false, this._player);
        }
    }

    private hideDetailedLoadoutMenu(): void {
        if (this._loadoutMenu) {
            this._loadoutMenu.hide();
            mod.EnableUIInputMode(false, this._player);
        }
    }

    private hideGadgetMenu(): void {
        if (this._gadgetMenu) {
            this._gadgetMenu.hide();
            mod.EnableUIInputMode(false, this._player);
        }
    }

    private startPositionMonitoring(): void {
        this._activeLoadoutSession!.positionCheckId = Timers.setInterval(() => {
            if (!this._activeLoadoutSession) return;

            const currentPosition = mod.GetSoldierState(this._player, mod.SoldierStateVector.GetPosition);
            const distance = this.calculateDistance(this._activeLoadoutSession.entryPosition, currentPosition);

            if (distance > 5.0) { // 5 meters
                this._debugTool.dynamicLog('Loadout modification cancelled: Moved too far from entry position');
                this.cancelLoadoutSession();
            }
        }, 1000); // Check every second
    }

    private setupWeaponFireDetection(): void {
        // Note: BF6 Portal may not have direct weapon fire events for vehicles
        // This would need to be implemented based on available events
        // For now, we'll rely on movement detection as the primary cancellation method
    }

    private calculateDistance(pos1: mod.Vector, pos2: mod.Vector): number {
        const dx = mod.XComponentOf(pos1) - mod.XComponentOf(pos2);
        const dy = mod.YComponentOf(pos1) - mod.YComponentOf(pos2);
        const dz = mod.ZComponentOf(pos1) - mod.ZComponentOf(pos2);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    private cancelLoadoutSession(): void {
        if (this._activeLoadoutSession) {
            // Clear timer
            if (this._activeLoadoutSession.timerId) {
                Timers.clearTimeout(this._activeLoadoutSession.timerId);
            }

            // Clear position monitoring
            if (this._activeLoadoutSession.positionCheckId) {
                Timers.clearInterval(this._activeLoadoutSession.positionCheckId);
            }

            // Hide all menus
            this.hideLoadoutMenu();
            this.hideWeaponMenu();
            this.hideGadgetMenu();

            this._activeLoadoutSession = null;
        }
    }

    public destroy(): void {
        this.cancelLoadoutSession();
        if (this._loadoutMenu) {
            this._loadoutMenu.delete();
            this._loadoutMenu = null;
        }
        if (this._weaponMenu) {
            this._weaponMenu.delete();
            this._weaponMenu = null;
        }
        if (this._gadgetMenu) {
            this._gadgetMenu.delete();
            this._gadgetMenu = null;
        }
    }
}

export class DebugTool {
    private _submenus: Map<string, UIContainer> = new Map();
    private _loadoutManager: VehicleLoadoutManager;

    public constructor(player: mod.Player, options?: DebugTool.Options) {
        this._player = player;
        this._loadoutManager = new VehicleLoadoutManager(player, this);

        this._staticLogger = new Logger(player, {
            staticRows: true,
            visible: options?.staticLogger?.visible ?? false,
            anchor: options?.staticLogger?.anchor ?? mod.UIAnchor.TopLeft,
            width: options?.staticLogger?.width ?? 500,
            height: options?.staticLogger?.height ?? 500,
            textColor: UI.COLORS.BF_RED_BRIGHT,
            bgAlpha: 0.8,
            bgFill: mod.UIBgFill.Blur,
        });

        this._dynamicLogger = new Logger(player, {
            staticRows: false,
            visible: options?.dynamicLogger?.visible ?? false,
            anchor: options?.dynamicLogger?.anchor ?? mod.UIAnchor.TopRight,
            width: options?.dynamicLogger?.width ?? 500,
            height: options?.dynamicLogger?.height ?? 500,
            textColor: UI.COLORS.BF_GREEN_BRIGHT,
            bgAlpha: 0.8,
            bgFill: mod.UIBgFill.Blur,
        });

        const childrenParams: UIContainer.ChildParams<UITextButton.Params>[] = [
            {
                type: UITextButton,
                y: 0,
                width: 300,
                height: 20,
                anchor: mod.UIAnchor.BottomCenter,
                bgColor: UI.COLORS.GREY_25,
                baseColor: UI.COLORS.BF_RED_DARK,
                message: mod.Message(mod.stringkeys.debugTool.buttons.close),
                textSize: 20,
                textColor: UI.COLORS.BF_RED_BRIGHT,
                onClick: async (player: mod.Player): Promise<void> => {
                    mod.EnableUIInputMode(false, player);
                    this._debugMenu.hide();
                },
            },
        ];

        const debugConfig: UIContainer.Params = {
            receiver: player,
            width: options?.debugMenu?.width ?? 300,
            height: options?.debugMenu?.height ?? 300,
            anchor: mod.UIAnchor.Center,
            bgColor: UI.COLORS.BLACK,
            bgFill: mod.UIBgFill.Blur,
            bgAlpha: 0.8,
            visible: options?.debugMenu?.visible ?? false,
            uiInputModeWhenVisible: true,
            childrenParams,
        };

        this._debugMenu = new UIContainer(debugConfig);
    }

    private _player: mod.Player;

    private _staticLogger: Logger;

    private _dynamicLogger: Logger;

    private _debugMenu: UIContainer;

    public hideStaticLogger(): void {
        this._staticLogger.hide();
    }

    public hideDynamicLogger(): void {
        this._dynamicLogger.hide();
    }

    public showStaticLogger(): void {
        this._staticLogger.show();
    }

    public showDynamicLogger(): void {
        this._dynamicLogger.show();
    }

    public clearStaticLogger(): void {
        this._staticLogger.clear();
    }

    public clearDynamicLogger(): void {
        this._dynamicLogger.clear();
    }

    public hideDebugMenu(): void {
        this._debugMenu.hide();
        mod.EnableUIInputMode(false, this._player);
    }

    public showDebugMenu(): void {
        this._debugMenu.show();
        mod.EnableUIInputMode(true, this._player);
    }

    public staticLog(text: string, row: number): void {
        this._staticLogger.logAsync(text, row);
    }

    public dynamicLog(text: string): void {
        this._dynamicLogger.logAsync(text);
    }

    public destroy(): void {
        this._staticLogger.destroy();
        this._dynamicLogger.destroy();
        this._debugMenu.delete();
        for (const submenu of this._submenus.values()) {
            submenu.delete();
        }
        this._submenus.clear();
        this._loadoutManager.destroy();
    }

    public addDebugMenuButton(text: mod.Message, onClick: (player: mod.Player) => Promise<void>): void {
        // Count only the top-anchored buttons (not the close button which is bottom-anchored)
        const topButtonsCount = this._debugMenu.children.filter(child => child.anchor === mod.UIAnchor.TopCenter).length;

        const requiredHeight = (topButtonsCount + 1) * 20; // If we include the new button.

        if (requiredHeight > this._debugMenu.height) {
            this._debugMenu.height = requiredHeight;
        }

        new UITextButton({
            x: 0,
            y: topButtonsCount * 20, // Place at the next available top position
            width: 300,
            height: 20,
            anchor: mod.UIAnchor.TopCenter,
            bgColor: UI.COLORS.GREY_25,
            baseColor: UI.COLORS.BLACK,
            message: text,
            textSize: 20,
            textColor: UI.COLORS.BF_GREEN_BRIGHT,
            onClick,
            parent: this._debugMenu,
            receiver: this._player,
        });
    }

    public createSubmenu(name: string, title: string): void {
        const submenuConfig: UIContainer.Params = {
            receiver: this._player,
            width: 300,
            height: 200,
            anchor: mod.UIAnchor.Center,
            bgColor: UI.COLORS.BLACK,
            bgFill: mod.UIBgFill.Blur,
            bgAlpha: 0.8,
            visible: false,
            uiInputModeWhenVisible: true,
            childrenParams: [
                {
                    type: UITextButton,
                    y: 0,
                    width: 300,
                    height: 20,
                    anchor: mod.UIAnchor.BottomCenter,
                    bgColor: UI.COLORS.GREY_25,
                    baseColor: UI.COLORS.BLACK,
                    message: mod.Message(mod.stringkeys.debugTool.buttons.backToMainMenu),
                    textSize: 20,
                    textColor: UI.COLORS.BF_RED_BRIGHT,
                    onClick: async (player: mod.Player): Promise<void> => {
                        this.showSubmenu(name, false);
                        this.showDebugMenu();
                    },
                },
            ],
        };

        const submenu = new UIContainer(submenuConfig);
        this._submenus.set(name, submenu);
    }

    public addSubmenuButton(submenuName: string, text: mod.Message, onClick: (player: mod.Player) => Promise<void>): void {
        const submenu = this._submenus.get(submenuName);
        if (!submenu) return;

        // Count only the top-anchored buttons (not the back button which is bottom-anchored)
        const topButtonsCount = submenu.children.filter(child => child.anchor === mod.UIAnchor.TopCenter).length;

        const requiredHeight = (topButtonsCount + 1) * 20 + 20; // +20 for back button

        if (requiredHeight > submenu.height) {
            submenu.height = requiredHeight;
        }

        new UITextButton({
            x: 0,
            y: topButtonsCount * 20,
            width: 300,
            height: 20,
            anchor: mod.UIAnchor.TopCenter,
            bgColor: UI.COLORS.GREY_25,
            baseColor: UI.COLORS.BLACK,
            message: text,
            textSize: 20,
            textColor: UI.COLORS.BF_GREEN_BRIGHT,
            onClick,
            parent: submenu,
            receiver: this._player,
        });
    }

    public showSubmenu(name: string, show: boolean): void {
        const submenu = this._submenus.get(name);
        if (!submenu) return;

        if (show) {
            submenu.show();
            mod.EnableUIInputMode(true, this._player);
        } else {
            submenu.hide();
            mod.EnableUIInputMode(false, this._player);
        }
    }

    public onPlayerEnterVehicle(player: mod.Player, vehicle: mod.Vehicle): void {
        this._loadoutManager.onPlayerEnterVehicle(player, vehicle);
    }

    public onPlayerExitVehicle(player: mod.Player, vehicle: mod.Vehicle): void {
        this._loadoutManager.onPlayerExitVehicle(player, vehicle);
    }
}

export namespace DebugTool {
    export interface Options {
        staticLogger?: {
            visible?: boolean;
            anchor?: mod.UIAnchor;
            width?: number;
            height?: number;
        };
        dynamicLogger?: {
            visible?: boolean;
            anchor?: mod.UIAnchor;
            width?: number;
            height?: number;
        };
        debugMenu?: {
            visible?: boolean;
            width?: number;
            height?: number;
        };
    }
}
