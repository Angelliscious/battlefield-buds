import { Timers } from 'bf6-portal-utils/timers/index.ts';

/**
 * Detects 5 consecutive reload button presses within 30 seconds and triggers a callback.
 * Monitors soldier reload state for button press transitions.
 */
export class ReloadDetector {
    private player: mod.Player;
    private reloadCount: number = 0;
    private lastReloadTime: number = -Infinity;
    private resetTimerId: number | undefined;
    private pollTimerId: number | undefined;
    private wasReloading: boolean = false;
    private readonly RELOAD_WINDOW_MS = 30000; // 30 seconds
    private readonly TARGET_RELOAD_COUNT = 5;
    private readonly POLL_INTERVAL_MS = 100; // Poll every 100ms
    private onThresholdReached: () => void;
    private debugCallback: ((msg: string) => void) | undefined;

    constructor(player: mod.Player, onThresholdReached: () => void, debugCallback?: (msg: string) => void) {
        this.player = player;
        this.onThresholdReached = onThresholdReached;
        this.debugCallback = debugCallback;
        this.debugCallback?.('ReloadDetector initialized');
        this.startPollingReloadState();
    }

    private startPollingReloadState(): void {
        this.pollTimerId = Timers.setInterval(() => {
            let isCurrentlyReloading = false;
            
            // Try to get reload state - handle different API possibilities
            try {
                isCurrentlyReloading = mod.GetSoldierState(this.player, mod.SoldierStateBool.IsReloading);
            } catch (e) {
                // If that fails, silently continue - player might not be deployed
                return;
            }

            // Detect transition from not reloading to reloading (reload button press)
            if (!this.wasReloading && isCurrentlyReloading) {
                this.onReloadButtonPressed();
            }

            this.wasReloading = isCurrentlyReloading;
        }, this.POLL_INTERVAL_MS);
    }

    private onReloadButtonPressed(): void {
        const currentTime = mod.GetMatchTimeElapsed();

        // Check if reload is within the 30-second window
        if (currentTime - this.lastReloadTime <= this.RELOAD_WINDOW_MS) {
            this.reloadCount++;
        } else {
            // Reset counter if outside the window
            this.reloadCount = 1;
        }

        this.lastReloadTime = currentTime;

        this.debugCallback?.(`Reload press detected! Count: ${this.reloadCount}/${this.TARGET_RELOAD_COUNT}`);

        // Clear existing reset timer
        if (this.resetTimerId !== undefined) {
            Timers.clearTimeout(this.resetTimerId);
        }

        // Check if we've reached the threshold
        if (this.reloadCount >= this.TARGET_RELOAD_COUNT) {
            this.debugCallback?.('5-reload threshold reached! Opening debug menu.');
            this.onThresholdReached();
            this.resetCounter();
            return;
        }

        // Set a timer to reset the counter if no reload happens in 30 seconds
        this.resetTimerId = Timers.setTimeout(() => {
            this.resetCounter();
        }, this.RELOAD_WINDOW_MS);
    }

    private resetCounter(): void {
        this.reloadCount = 0;
        this.lastReloadTime = -Infinity;
        if (this.resetTimerId !== undefined) {
            Timers.clearTimeout(this.resetTimerId);
            this.resetTimerId = undefined;
        }
    }

    public destroy(): void {
        if (this.pollTimerId !== undefined) {
            Timers.clearInterval(this.pollTimerId);
        }
        if (this.resetTimerId !== undefined) {
            Timers.clearTimeout(this.resetTimerId);
        }
    }
}
