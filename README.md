# Flat Reality Workspace

Internal workspace MVP for Flat Reality Entertainment Group.

## Local Development

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

Local starter IDs:

```text
FR-1001
FR-ADMIN
```

## What Is Included

- React + TypeScript + TailwindCSS frontend.
- Mobile-friendly workspace layout.
- Employment ID login.
- Dashboard with LevelUp! XP, rewards, and Jump To links.
- Dedicated Rewards page.
- Work Records with account health, timeline entries, strikes, and automatic strike expiry logic.
- Signed Documents, Benefits, and Installs pages.
- Read-only user profile with limited self-editable fields.
- Modular Admin area: HR, Guide Writting, and LevelUp! Configurator.
- HR profile tabs for Profile, Work Records, LevelUp!, Payments, and Documents.
- Admin status controls.
- Admin LevelUp! level and reward configuration.
- Admin-created guide pages with simple text markup.
- Supabase persistence when configured.
- Browser local storage fallback for local testing.
- GitHub Pages custom domain preparation for `workspace.flatreality.eu`.

## Supabase

1. Create a Supabase project.
2. Open Supabase SQL Editor.
3. Run `supabase-schema.sql`.
4. Create `.env.production` from `.env.production.example`.
5. Fill:

```text
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

For the current MVP, the app stores workspace data in `workspace_state` as one JSON document. This keeps the setup simple. Later, it can be migrated into separate normalized tables with real Supabase Authentication and row-level security.

## Deploy

The project includes `.github/workflows/deploy-pages.yml`, so GitHub can publish the site automatically when changes are pushed to `main`.

The `public/CNAME` file configures the custom domain:

```text
workspace.flatreality.eu
```
