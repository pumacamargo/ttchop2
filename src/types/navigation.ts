// Shared navigation types — kept out of App.tsx to avoid a circular import
// between App.tsx and SidePanel.tsx (both need ActiveTab).

export type ActiveTab =
  | 'dashboard'
  | 'products'
  | 'templates'
  | 'create'
  | 'calendar'
  | 'analytics'
  | 'brand'
  | 'reports'
  | 'editor'
  | 'tools'
  | 'sessions'  // internal route, no SidePanel item (Phase 2: moves into Products)
  | 'renders';  // internal route, no SidePanel item (Phase 2: moves into Products)
