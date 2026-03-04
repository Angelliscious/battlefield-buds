import { Timers } from 'bf6-portal-utils/timers/index.ts';

/**
 * Detects 5 consecutive reloads within 30 seconds and triggers a callback.
 * Monitors soldier state for reload transitions.
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

    constructor(player: mod.Player, onThresholdReached: () => void) {
        this.player = player;
        this.onThresholdReached = onThresholdReached;
        this.startPollingReloadState();
    }

    private startPollingReloadState(): void {
        this.pollTimerId = Timers.setInterval(() => {
            const isCurrentlyReloading = mod.GetSoldierState(this.player, mod.SoldierStateBool.IsReloading);

            // Detect transition from reloading to not reloading (reload completed)
            if (this.wasReloading && !isCurrentlyReloading) {
                this.onReloadDetected();
            }

            this.wasReloading = isCurrentlyReloading;
        }, this.POLL_INTERVAL_MS);
    }

    private onReloadDetected(): void {
        const currentTime = mod.GetMatchTimeElapsed();

        // Check if reload is within the 30-second window
        if (currentTime - this.lastReloadTime <= this.RELOAD_WINDOW_MS) {
            this.reloadCount++;
        } else {
            // Reset counter if outside the window
            this.reloadCount = 1;
        }

        this.lastReloadTime = currentTime;

        // Clear existing reset timer
        if (this.resetTimerId !== undefined) {
            Timers.clearTimeout(this.resetTimerId);
        }

        // Check if we've reached the threshold
        if (this.reloadCount >= this.TARGET_RELOAD_COUNT) {
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
