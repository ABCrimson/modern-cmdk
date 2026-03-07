'use client';

// apps/playground/src/demos/DialogDemo.tsx
// Dialog mode with Ctrl+K trigger, overlay animation

import { useCallback, useEffect, useState } from 'react';
import { Command } from '@crimson_dev/command-react';

export function DialogDemo(): React.ReactNode {
  const [open, setOpen] = useState(false);

  const handleSelect = useCallback((item: string) => {
    console.log(`Selected: ${item}`);
    setOpen(false);
  }, []);

  // Ctrl+K / Cmd+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="demo-container">
      <h2 className="demo-title">Dialog Mode</h2>
      <p className="demo-description">
        Press <kbd>Ctrl+K</kbd> or click the button to open the command palette.
      </p>

      <button
        type="button"
        className="trigger-button"
        data-command-trigger
        onClick={() => setOpen(true)}
      >
        Open Command Palette (Ctrl+K)
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
              Go to Dashboard
            </Command.Item>
            <Command.Item
              value="go to projects"
              forceId="dialog-item-projects"
              onSelect={() => handleSelect('projects')}
            >
              Go to Projects
            </Command.Item>
            <Command.Item
              value="go to settings"
              forceId="dialog-item-settings"
              onSelect={() => handleSelect('settings')}
            >
              Go to Settings
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
                <span>Create Project</span>
                <Command.Shortcut shortcut="Mod+Shift+P" />
              </span>
            </Command.Item>
            <Command.Item
              value="invite member"
              forceId="dialog-item-invite"
              onSelect={() => handleSelect('invite member')}
            >
              Invite Team Member
            </Command.Item>
            <Command.Item
              value="export data"
              forceId="dialog-item-export"
              onSelect={() => handleSelect('export data')}
              disabled
            >
              Export Data (Coming Soon)
            </Command.Item>
          </Command.Group>

          <Command.Separator />

          <Command.Group heading="Account" forceId="dialog-group-account">
            <Command.Item
              value="profile settings"
              forceId="dialog-item-profile"
              onSelect={() => handleSelect('profile settings')}
            >
              Profile Settings
            </Command.Item>
            <Command.Item
              value="sign out"
              forceId="dialog-item-signout"
              onSelect={() => handleSelect('sign out')}
            >
              Sign Out
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command.Dialog>
    </div>
  );
}
