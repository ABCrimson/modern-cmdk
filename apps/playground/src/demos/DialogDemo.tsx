'use client';

// apps/playground/src/demos/DialogDemo.tsx
// Dialog mode with Ctrl+K trigger, overlay animation
// React 19: useId, useCallback, useTransition

import { Command } from 'modern-cmdk/react';
import { useCallback, useEffect, useId, useState, useTransition } from 'react';

export function DialogDemo(): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const headingId = useId();

  const handleSelect = useCallback((_item: string) => {
    startTransition(() => {
      setOpen(false);
    });
  }, []);

  // Ctrl+K / Cmd+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="demo-container" role="region" aria-labelledby={headingId}>
      <h2 className="demo-title" id={headingId}>
        Dialog Mode
      </h2>
      <p className="demo-description">
        Press <kbd>Ctrl+K</kbd> (or <kbd>Cmd+K</kbd> on macOS) or click the button below to open the
        command palette in a modal dialog with backdrop blur.
      </p>

      <button
        type="button"
        className="trigger-button"
        data-command-trigger
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span aria-hidden="true">{'\u2318'}</span>
        Open Command Palette
        <kbd>Ctrl+K</kbd>
      </button>

      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        className="command-dialog"
        overlayClassName="command-overlay"
        contentClassName="command-dialog-content"
        label="Command palette dialog"
      >
        <Command.Input placeholder="What do you need?" />
        <Command.List>
          <Command.Empty>No results found.</Command.Empty>

          <Command.Group heading="Navigation" forceId="dialog-group-nav">
            <Command.Item
              value="go to dashboard"
              forceId="dialog-item-dashboard"
              onSelect={() => handleSelect('dashboard')}
            >
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\uD83D\uDCCA'}
                </span>
                <span className="item-label">Go to Dashboard</span>
              </span>
            </Command.Item>
            <Command.Item
              value="go to projects"
              forceId="dialog-item-projects"
              onSelect={() => handleSelect('projects')}
            >
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\uD83D\uDCC1'}
                </span>
                <span className="item-label">Go to Projects</span>
              </span>
            </Command.Item>
            <Command.Item
              value="go to settings"
              forceId="dialog-item-settings"
              onSelect={() => handleSelect('settings')}
            >
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\u2699'}
                </span>
                <span className="item-label">Go to Settings</span>
              </span>
            </Command.Item>
          </Command.Group>

          <Command.Separator />

          <Command.Group heading="Actions" forceId="dialog-group-actions">
            <Command.Item
              value="create project"
              forceId="dialog-item-create-project"
              onSelect={() => handleSelect('create project')}
              shortcut="Mod+Shift+P"
            >
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\u2795'}
                </span>
                <span className="item-label">Create Project</span>
                <Command.Shortcut shortcut="Mod+Shift+P" />
              </span>
            </Command.Item>
            <Command.Item
              value="invite member"
              forceId="dialog-item-invite"
              onSelect={() => handleSelect('invite member')}
            >
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\uD83D\uDC65'}
                </span>
                <span className="item-label">Invite Team Member</span>
              </span>
            </Command.Item>
            <Command.Item
              value="export data"
              forceId="dialog-item-export"
              onSelect={() => handleSelect('export data')}
              disabled
            >
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\uD83D\uDCE4'}
                </span>
                <span className="item-label">Export Data (Coming Soon)</span>
              </span>
            </Command.Item>
          </Command.Group>

          <Command.Separator />

          <Command.Group heading="Account" forceId="dialog-group-account">
            <Command.Item
              value="profile settings"
              forceId="dialog-item-profile"
              onSelect={() => handleSelect('profile settings')}
            >
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\uD83D\uDC64'}
                </span>
                <span className="item-label">Profile Settings</span>
              </span>
            </Command.Item>
            <Command.Item
              value="sign out"
              forceId="dialog-item-signout"
              onSelect={() => handleSelect('sign out')}
            >
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\uD83D\uDEAA'}
                </span>
                <span className="item-label">Sign Out</span>
              </span>
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command.Dialog>
    </div>
  );
}
