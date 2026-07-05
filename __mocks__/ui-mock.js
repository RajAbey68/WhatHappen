const React = require('react')

const el = (tag, testId) => ({ children, ...props }) => React.createElement(tag, { 'data-testid': testId, ...props }, children)

module.exports = {
  // Cards
  Card: el('div', 'card'),
  CardHeader: el('div', 'card-header'),
  CardContent: el('div', 'card-content'),
  CardTitle: el('h3', 'card-title'),

  // Buttons and inputs
  Button: ({ children, ...props }) => React.createElement('button', props, children),
  Input: (props) => React.createElement('input', props),
  Textarea: (props) => React.createElement('textarea', props),

  // Scroll area
  ScrollArea: ({ children, ...props }) => React.createElement('div', props, children),
  ScrollBar: el('div', 'scrollbar'),

  // Dialogs
  Dialog: el('div', 'dialog'),
  DialogTrigger: el('button', 'dialog-trigger'),
  DialogContent: el('div', 'dialog-content'),
  DialogHeader: el('div', 'dialog-header'),
  DialogTitle: el('h3', 'dialog-title'),
  DialogDescription: el('p', 'dialog-description'),
  DialogPortal: el('div', 'dialog-portal'),
  DialogOverlay: el('div', 'dialog-overlay'),
  DialogClose: el('button', 'dialog-close'),

  // Bottom sheet
  BottomSheet: el('div', 'bottom-sheet'),
  BottomSheetContent: el('div', 'bottom-sheet-content'),
  BottomSheetHeader: el('div', 'bottom-sheet-header'),
  BottomSheetFooter: el('div', 'bottom-sheet-footer'),
  BottomSheetTitle: el('h3', 'bottom-sheet-title'),
  BottomSheetDescription: el('p', 'bottom-sheet-description'),
  BottomSheetClose: el('button', 'bottom-sheet-close'),
  BottomSheetTrigger: el('button', 'bottom-sheet-trigger'),

  // Tabs
  Tabs: el('div', 'tabs'),
  TabsList: el('div', 'tabs-list'),
  TabsTrigger: el('button', 'tab-trigger'),
  TabsContent: el('div', 'tab-content'),

  // Badge, Avatar, etc.
  Badge: el('span', 'badge'),
  Avatar: el('div', 'avatar'),
  AvatarFallback: el('div', 'avatar-fallback'),
  AvatarImage: el('img', 'avatar-image'),

  // Generic UI exports as passthrough
  Label: el('label', 'label'),
  Separator: el('div', 'separator'),
  Switch: el('input', 'switch'),
  Checkbox: el('input', 'checkbox'),
  Select: el('select', 'select'),
  Option: el('option', 'option'),
  Table: el('table', 'table'),
  Tbody: el('tbody', 'tbody'),
  Td: el('td', 'td'),
  Th: el('th', 'th'),
  Tr: el('tr', 'tr'),
  // and a catch-all proxy for unknown exports
}
