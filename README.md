# Application Link

The deployment can be accessed through this link:

https://nolannachbar.github.io/VektorPub/

# How to build and run this

1.  install Node.js (version 20.0.0 or higher)
2.  Then run the following

- 'npm install' #this installs dependencies
- 'npm run dev' # starts the development server

# Accounts: which user owns the real data

There are two rows in `auth.users`, and mixing them up will send you on a long
debugging detour. Every table is scoped by a `created_by` UUID.

| account | UUID | what it is |
|---|---|---|
| `nvtnachbar@gmail.com` | `169d2f0b-cf5a-44fb-8551-845004725a26` | **The real athlete.** All live data. |
| `athlete@local.test` | `5ec4eebf-ae62-4f3f-9c1d-f44f92716bc8` | Test fixture. Local dev only. |

The engine (`scripts/*.py`, via the `USER_ID` GitHub secret) and the Garmin edge
functions (via the `USER_ID` Supabase secret) both read and write **only** the
real athlete's UUID. The test account holds a frozen snapshot from late June 2026
and nothing writes to it any more.

The trap: `athlete@local.test` has its own copies of some `garmin_activities`
rows, with the same Garmin `activity_id`s as the real account. Query
`garmin_activities` without a `created_by` filter and every one of those looks
like a duplicated workout. It is not — the engine filters by `created_by` and
never sees them, and there are zero true duplicates within the real account.
Always filter by `created_by` before concluding the data is corrupt.

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
 
