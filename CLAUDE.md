# Hallmark Reference Archive

React/Vite web app for the London Assay Office. Browse hallmark reference images stored in Cloudinary with structured metadata, gated by Supabase-backed authentication and role-based access.

## Tech Stack
- **Frontend**: React 18 + Vite 5 (inline styles, no CSS framework)
- **Auth**: Supabase Auth + `profiles` table for role-based access
- **Images / Metadata**: Cloudinary (`dc0dq2fem`), folder `hallmarks/`, 8-field metadata schema (plus `mark_type_2` for combined marks)
- **Deployment**: Netlify — https://hallmark-archive-lao.netlify.app
- **Repo**: https://github.com/will8422-oss/imageviewer (private)

## Cloudinary
- Cloud name: `dc0dq2fem`, API key name: `imageviewer`
- Metadata: `collection`, `object_name`, `mark_type`, `mark_type_2`, `year_range`, `year`, `image_type`, `group_id`, `sponsor`
- Tags per asset: `[year_start, century, slug(mark_type), slug(collection), image_type]`
- Search expression: `public_id:hallmarks/*` (assets have no `asset_folder`); leading wildcards unsupported — filter client-side
- 933 assets uploaded across 9 collections

## Supabase
- `public.profiles`: id (→ auth.users), email, role (pending/viewer/researcher/admin/rejected), full_name, approved_at, approved_by
- RLS: self-read own profile; admins read/update all; service role bypasses RLS
- `get_my_role()` security definer fn for policy checks
- `handle_new_user()` trigger inserts profile row on signup
- First admin must be set manually in dashboard → profiles table → `role = 'admin'`

## Netlify
- Site ID: `60fc7efe-4ddf-412b-8f7d-9540fc9e5103`
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_CLOUDINARY_*`
- **Free-tier Supabase pauses after ~7 days of inactivity** — restore manually from the Supabase dashboard if login throws "Failed to fetch"

## Key Files
- `src/App.jsx` — Supabase auth wrapper, profile fetch with retries, ignores `SIGNED_IN` re-fires on tab focus
- `src/lib/supabase.js` — singleton anon client
- `src/components/LoginScreen.jsx` — email/password + register form
- `src/components/AdminPanel.jsx` — pending/active/rejected user management
- `src/components/OverviewPage.jsx` — dark landing page: stat cards, heatmap, mark type / decade / gaps panels
- `src/components/TimelineHeatmap.jsx` — decade×year heatmap + century bar chart (ResizeObserver-driven)
- `src/components/RecordModal.jsx` — OpenSeadragon viewer with custom controls, thumbnail strip
- `src/components/RecordCard.jsx` — thumbnail card with year badge and dim indicator
- `hallmark-archive.jsx` — main archive: view switcher (overview/browse/admin), filters, search (matches object_name, group_id, sponsor, year_range, mark_type, mark_type_2)
- `netlify/functions/search-images.js` — JWT-gated Cloudinary proxy, paginates full asset list
- `netlify/functions/manage-user.js` — admin-only role / approval actions via service role

## Scripts
```bash
node scripts/parse-inventory.js          # filename → inventory.csv
node scripts/upload-hallmarks.js         # inventory.csv → Cloudinary
node scripts/normalise-mark-types.js     # rewrites legacy mark_type values
node scripts/export-sponsor-marks.js     # exports sponsor groups for manual fill-in
node scripts/update-sponsor-field.js     # writes filled sponsor names back
node scripts/generate-gap-report.js      # coverage gaps for acquisition
```

## Deploy
```bash
# Push (PAT needed — no credential helper in WSL)
git remote set-url origin https://GITHUB_PAT@github.com/will8422-oss/imageviewer.git
git push
git remote set-url origin https://github.com/will8422-oss/imageviewer.git

netlify deploy --build --prod
```

## Design
- Dark palette throughout: background `#12100d`, surfaces `#1a1610` / `#19160f`, borders `#3a3020`, gold accent `#d4a843`, text `#c8b88a`
- Cormorant Garamond for headings (loaded via Google Fonts in `index.html`); system-ui body
- No router — single-page with view state (overview/browse/admin) in `hallmark-archive.jsx`
