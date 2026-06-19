# Shared code

`shared/` contains environment-neutral code that is reused by multiple features.

- `lib/`: small, domain-neutral utilities with no React, Next.js, Electron, or feature dependencies.
- `ui/`: reusable UI primitives. Business state and feature policy do not belong here.

Shared code must not import `application/`, `features/`, or Electron main-process modules. The boundary is enforced by `npm run check:boundaries`.
