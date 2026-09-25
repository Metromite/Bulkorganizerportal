# DispatchOPS Department Entry Portal

Standalone Cloudflare-ready React/Vite portal for Pharma/Medical and Consumer production entries.

## Accounts
- Pharma / 0000 — Pharma workspace (Medical uses this workspace)
- Consumer / 0000 — Consumer workspace

## Flow
- Only tomorrow or later can be selected as dispatch date.
- New submissions are blocked at 16:30 Dubai time.
- Status: Ready / Handed over to Dispatch.
- Store/location is sourced from the existing Bulk Organizer monthly defaults.
- Pallet count + Big/Small pallet size are captured.

## Supabase
The app is configured for the existing DispatchOPS Supabase project via VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.
Run `supabase/department_portal.sql` against that same project before deployment. The SQL creates the portal submission/session tables and pallet-size capacity columns without replacing existing DispatchOPS tables.

The current Bulk Organizer remains the operational planner; the next integration step is to consume `department_portal_submissions` into its waiting/scheduled invoice lists.
