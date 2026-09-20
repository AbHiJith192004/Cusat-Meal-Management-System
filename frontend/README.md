# MessConnect frontend

React 19 + Vite PWA for the CUSAT hostel mess. It is served in production by
the FastAPI backend: the root `Dockerfile` builds this app and copies `dist/`
into the API image, so there is no separate frontend deployment.

## Running it

```bash
npm ci
npm run dev      # http://localhost:3000
```

`VITE_API_BASE_URL` points the app at an API. Copy `.env.example` to `.env` to
set it. With nothing set the app falls back to `http://localhost:8000/api/v1`
on localhost, and to `<current origin>/api/v1` anywhere else — which is what
makes the single-image production deployment work without configuration.

## Checks

```bash
npm run lint     # tsc --noEmit, with strict and the unused-symbol checks on
npm run build
npm audit --audit-level=moderate
```

`npm run lint` is a real gate, not formatting: `strict`, `noUnusedLocals` and
`noUnusedParameters` are enabled in `tsconfig.json`, so a half-finished edit
that leaves a variable behind fails the build.

## Layout

```
src/
├── App.tsx            Shell: role, tab routing, session restore
├── main.tsx           Entry point; also serves /privacy and /terms pre-auth
├── navigation.ts      Single source of truth for the sidebar and bottom bar
├── types.ts           Shared types
├── components/        Header, navigation, modal, login, error boundary
├── views/             One file per screen
├── services/api.ts    The only place that talks to the API
├── utils/             Shared formatting and export helpers
├── data/defaults.ts   Placeholder profile shown before the real one loads
└── assets/food/       Meal illustrations (WebP)
```

The heavier admin screens and the QR scanner are lazy-loaded in `App.tsx`, so a
student never downloads the scanner bundle.
