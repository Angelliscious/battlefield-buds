import { Timers } from 'bf6-portal-utils/timers/index.ts';

/**
 * Detects 5 consecutive jump actions within 30 seconds and triggers a callback.
 * Monitors soldier jump state for leap transitions.
 */
export class ReloadDetector {
    private player: mod.Player;
    private actionCount: number = 0;
    private lastActionTime: number = -Infinity;
    private resetTimerId: number | undefined;
    private pollTimerId: number | undefined;
    private wasJumping: boolean = false;
    private readonly ACTION_WINDOW_MS = 30000; // 30 seconds
    private readonly TARGET_ACTION_COUNT = 5;
    private readonly POLL_INTERVAL_MS = 50; // Poll every 50ms for faster jump detection
    private onThresholdReached: () => void;
    private debugCallback: ((msg: string) => void) | undefined;

    constructor(player: mod.Player, onThresholdReached: () => void, debugCallback?: (msg: string) => void) {
        this.player = player;
        this.onThresholdReached = onThresholdReached;
        this.debugCallback = debugCallback;
        this.debugCallback?.('JumpDetector initialized');
        this.startPollingJumpState();
    }

    private startPollingJumpState(): void {
        this.pollTimerId = Timers.setInterval(() => {
            let isCurrentlyJumping = false;
            
            // Try to get jump state
            try {
                isCurrentlyJumping = mod.GetSoldierState(this.player, mod.SoldierStateBool.IsJumping);
            } catch (e) {
                // If that fails, silently continue - player might not be deployed
                return;
            }

            // Detect transition from not jumping to jumping (jump initiation)
            if (!this.wasJumping && isCurrentlyJumping) {
                this.onActionDetected();
            }

            this.wasJumping = isCurrentlyJumping;
        }, this.POLL_INTERVAL_MS);
    }

    private onActionDetected(): void {
        const currentTime = mod.GetMatchTimeElapsed();

        // Check if action is within the 30-second window
        if (currentTime - this.lastActionTime <= this.ACTION_WINDOW_MS) {
            this.actionCount++;
        } else {
            // Reset counter if outside the window
            this.actionCount = 1;
        }

        this.lastActionTime = currentTime;

        this.debugCallback?.(`Jump detected! Count: ${this.actionCount}/${this.TARGET_ACTION_COUNT}`);

        // Clear existing reset timer
        if (this.resetTimerId !== undefined) {
            Timers.clearTimeout(this.resetTimerId);
        }

        // Check if we've reached the threshold
        if (this.actionCount >= this.TARGET_ACTION_COUNT) {
            this.debugCallback?.('5-jump threshold reached! Opening debug menu.');
            this.onThresholdReached();
            this.resetCounter();
            return;
        }

        // Set a timer to reset the counter if no jump happens in 30 seconds
        this.resetTimerId = Timers.setTimeout(() => {
            this.resetCounter();
        }, this.ACTION_WINDOW_MS);
    }

    private resetCounter(): void {
        this.actionCount = 0;
        this.lastActionTime = -Infinity;
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
