export const parts = [
  '[data-command-dialog]',
  '[data-command-overlay]',
  '[data-command-group-heading]',
  '[data-command-group-items]',
  '[data-command-list-inner]',
] as const;

export const heading = document.querySelector('[data-command-group] [data-command-group-heading]');
