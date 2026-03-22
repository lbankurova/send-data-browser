# Code Conventions

## TypeScript Configuration

- **Strict mode** enabled with `noUnusedLocals` and `noUnusedParameters`
- **`verbatimModuleSyntax: true`** — always use `import type { Foo }` for type-only imports
- **Path alias**: `@/*` maps to `src/*`
- **Target**: ES2022

## React Patterns

### Component Structure
- Functional components only (no class components)
- Props destructured in function signature
- Components in PascalCase files matching component name
- View wrappers use lazy loading via `React.lazy()` in `App.tsx`

### Hooks
- Custom hooks prefixed with `use` (e.g., `useStudies`, `useDomainData`)
- TanStack React Query for all server state (5 min stale time)
- Query keys follow `[resource, ...params]` pattern
- Hooks return typed objects, not tuples

### Context Usage
- 10 contexts for UI state (selection, filters, rail mode, settings)
- Server state managed by TanStack Query, NOT duplicated in contexts
- Context providers composed in `App.tsx` or `Layout.tsx`

### State Management Hierarchy
1. TanStack React Query — server/fetched data (primary)
2. React Context — shared UI state (selection, filters)
3. `useState` — local component state
4. Derived/computed — calculated in hooks or lib utilities

## Python Conventions

### Type Hints
- Type hints on all function signatures
- Pydantic models for API request/response schemas (`backend/models/`)
- `Optional[T]` for nullable fields

### FastAPI Patterns
- Routers use `APIRouter(prefix="/api")` with full paths in decorators
- Lifespan context manager for startup initialization
- HTTPException for error responses
- Dependency injection for shared services

### Error Handling
- Backend: `try/except` with specific exceptions where possible
- XPT parsing: encoding fallback chain (UTF-8 → cp1252 → iso-8859-1)
- Frontend: TanStack Query error boundaries + `isError` checks

## Import Organization

### TypeScript
```typescript
// 1. React/framework imports
import { useState, useEffect } from 'react'
import type { FC } from 'react'

// 2. Third-party libraries
import { useQuery } from '@tanstack/react-query'

// 3. Internal imports (using @/ alias)
import { fetchStudies } from '@/lib/api'
import type { Study } from '@/types'

// 4. Relative imports
import { SubComponent } from './SubComponent'
```

### Python
```python
# 1. Standard library
from typing import Optional, List

# 2. Third-party
from fastapi import APIRouter, HTTPException
import pandas as pd

# 3. Internal
from services.xpt_processor import read_xpt
from models.schemas import StudyResponse
```

## UI Component Patterns

### shadcn/ui (Radix + CVA)
- Components in `frontend/src/components/ui/`
- Use CVA (class-variance-authority) for variant styling
- Radix primitives for accessibility
- TailwindCSS for all styling (no CSS modules)

### Design System Rules (from CLAUDE.md)
- **Domain labels**: neutral text only, never color-coded
- **No colored badges for categorical identity** — color encodes signal strength only
- **Categorical badges**: neutral gray (`bg-gray-100 text-gray-600 border-gray-200`)
- **Color budget**: ≤10% saturated pixels at rest
- **Sex ordering**: F precedes M always (alphabetical)
- **Dose groups**: always use `DoseHeader`/`DoseLabel` components
- **Table columns**: content-hugging with one absorber column
- **Heatmaps**: neutral grayscale via `getNeutralHeatColor()`

### Tab Bar Pattern
- Active: `h-0.5 bg-primary` underline, `text-foreground`
- Inactive: `text-muted-foreground`
- Text: `text-xs font-medium`, padding: `px-4 py-1.5`

## Data Casing
- Organ system names: `titleCase()`
- All other data labels: raw values (preserves abbreviations like ALT, AST)

## Naming Conventions Summary

| Item | Convention | Example |
|------|-----------|---------|
| React components | PascalCase | `FindingsViewWrapper` |
| Hooks | camelCase with `use` | `useStudyMetadata` |
| Lib utilities | kebab-case files | `cross-domain-syndromes.ts` |
| Python modules | snake_case | `study_discovery.py` |
| Python functions | snake_case | `extract_full_ts_metadata()` |
| Constants | UPPER_SNAKE | `ALLOWED_STUDIES` |
| Types/Interfaces | PascalCase | `StudyMetadata` |
| CSS classes | TailwindCSS utilities | `text-xs font-semibold` |
| API routes | kebab-case | `/api/studies/:id/dose-response` |
