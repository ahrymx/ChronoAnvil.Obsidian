// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Mobile overlay controls manager.
//
// Provides an unobtrusive floating button on mobile to toggle Obsidian's
// mobile navigation bar and toolbars, giving unobstructed full-height
// viewing for Almanac notes and dashboards.

import { Platform, setIcon } from "obsidian";
import type AlmanacPlugin from "../main";

export const HIDE_MOBILE_OVERLAYS_CLASS = "am-hide-mobile-overlays";
export const MOBILE_TOGGLE_BTN_CLASS = "am-mobile-toggle-btn";

export class MobileControls {
  private buttonEl: HTMLElement | null = null;
  private overlaysHidden = false;

  constructor(private plugin: AlmanacPlugin) {}

  register(): void {
    const isMobile = Platform.isMobile;
    if (!isMobile) return;

    this.overlaysHidden =
      this.plugin.settings.mobile?.hideOverlaysDefault ?? false;
    this.apply();
  }

  /** Re-evaluate settings and refresh floating button state. */
  refresh(): void {
    this.apply();
  }

  /** Toggle the hidden state of mobile overlay controls. */
  toggle(): void {
    this.overlaysHidden = !this.overlaysHidden;
    this.apply();
  }

  /** Get whether mobile overlays are currently hidden. */
  isOverlaysHidden(): boolean {
    return this.overlaysHidden;
  }

  private apply(): void {
    const position = this.plugin.settings.mobile?.overlayTogglePosition ?? "off";

    if (position === "off") {
      this.cleanup();
      return;
    }

    if (this.overlaysHidden) {
      document.body.addClass(HIDE_MOBILE_OVERLAYS_CLASS);
    } else {
      document.body.removeClass(HIDE_MOBILE_OVERLAYS_CLASS);
    }

    if (!this.buttonEl) {
      this.buttonEl = createDiv({ cls: MOBILE_TOGGLE_BTN_CLASS });
      this.buttonEl.setAttr("role", "button");
      this.buttonEl.setAttr("tabindex", "0");
      this.buttonEl.addEventListener("click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        this.toggle();
      });
      document.body.appendChild(this.buttonEl);
    }

    this.buttonEl.toggleClass("am-mobile-toggle-left", position === "left");
    this.buttonEl.toggleClass("am-mobile-toggle-right", position === "right");

    this.buttonEl.empty();
    setIcon(this.buttonEl, this.overlaysHidden ? "eye" : "eye-off");
    const label = this.overlaysHidden
      ? "Show mobile controls"
      : "Hide mobile controls";
    this.buttonEl.setAttr("aria-label", label);
    this.buttonEl.setAttr("title", label);

    this.syncSystemStatusBar();
  }

  private syncSystemStatusBar(forceShow = false): void {
    try {
      const win = window as unknown as {
        Capacitor?: {
          Plugins?: {
            StatusBar?: {
              hide: () => Promise<void>;
              show: () => Promise<void>;
            };
          };
        };
      };
      const statusBar = win.Capacitor?.Plugins?.StatusBar;
      if (statusBar) {
        if (this.overlaysHidden && !forceShow) {
          void statusBar.hide();
        } else {
          void statusBar.show();
        }
      }
    } catch {
      // ignore if not supported by host environment
    }
  }

  private cleanup(): void {
    if (this.buttonEl) {
      this.buttonEl.remove();
      this.buttonEl = null;
    }
    document.body.removeClass(HIDE_MOBILE_OVERLAYS_CLASS);
    this.syncSystemStatusBar(true);
  }

  onunload(): void {
    this.cleanup();
  }
}
