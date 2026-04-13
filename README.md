# Futurewhiz RoPA MVP

Internal Article 30 GDPR Record of Processing Activities (RoPA) web app for Futurewhiz.

This MVP replaces an Excel-based register with a structured internal workflow tool for legal/privacy and business teams. It is built as a new standalone project and does not modify any other project in the workspace.

## What the MVP includes

- Structured RoPA records backed by SQLite
- Searchable register with filters, sorting, and quick views
- Create and edit forms with controlled vocabularies and validation
- Dedicated, mandatory `Security measures` field in form, detail, dashboard logic, and exports
- Role-based access for `business`, `legal`, and `admin` users
- Trigger-based intake flow that creates drafts or flags records for update
- Review reminders via scheduled review dates and overdue flags
- Field-level audit trail / change log
- Linked compliance references for vendor reviews, DPIAs, LIAs, privacy notices, security reviews, and AI reviews
- File attachments for supporting documents
- Dashboard widgets for key compliance risk views
- Export of the register to CSV and Excel-compatible `.xls`
- Export of a single record to PDF
- Realistic Futurewhiz-style seed data for demos

## Architecture

### Application structure

- `src/server.js`
  - Express application, routes, auth/session logic, workflow logic, reminder scheduling, exports
- `src/db.js`
  - SQLite schema creation and seed/demo data
- `src/constants.js`
  - Controlled vocabulary seeds, statuses, roles, intake triggers, field metadata
- `src/helpers.js`
  - Shared formatting, date helpers, CSV/Excel/PDF export helpers
- `src/views/*`
  - EJS templates for dashboard, register, detail, form, intake, admin, and error states
- `src/public/styles.css`
  - Internal-tool UI styling

### Backend choices

- `Express` for a lightweight internal web server
- `SQLite` for a structured, low-maintenance local database
- `express-session` for simple internal session auth
- `multer` for file attachments

### Why this stack

This MVP prioritises:

- simplicity
- maintainability
- strong data structure
- usability for legal and non-legal users
- auditability

It is intentionally easy to extend later to Supabase, SSO, email/Slack reminders, or external document integrations.

## Data model

Main tables:

- `users`
- `vocabulary_values`
- `activities`
- `activity_change_log`
- `activity_reminders`
- `intake_requests`
- `activity_attachments`

The `activities` table contains the core RoPA fields, including:

- activity name
- short description
- business owner
- legal reviewer
- department
- product / service
- purpose of processing
- categories of data subjects
- categories of personal data
- lawful basis
- categories of recipients
- processors / vendors involved
- international transfers
- transfer mechanism / safeguards
- retention period
- source of personal data
- children’s data
- special category data
- AI involvement
- security measures
- linked compliance references
- status
- last updated metadata
- last review date
- next review date
- comments / notes

## Local setup

### 1. Go to the project

```bash
cd "/Users/valentinronchev/Documents/New project/futurewhiz-ropa-mvp"
```

### 2. Copy env file

```bash
cp .env.example .env
```

### 3. Install dependencies

```bash
npm install
```

### 4. Start the app

```bash
npm run dev
```

Open [http://127.0.0.1:3080](http://127.0.0.1:3080).

## Demo users

Seeded users include:

- `linda.vermeer@futurewhiz.com` - admin
- `maud.jansen@futurewhiz.com` - legal/privacy reviewer
- `tom.devries@futurewhiz.com` - business user
- `sara.khan@futurewhiz.com` - business user
- `eva.bakker@futurewhiz.com` - business user
- `noor.visser@futurewhiz.com` - business user

Any other `@futurewhiz.com` email entered on the login page is auto-created as a business user for local MVP testing.

## Main pages

- `/dashboard` - legal/privacy overview and risk widgets
- `/activities` - searchable register
- `/activities/:id` - record detail, security measures, audit log, attachments
- `/activities/new` - create structured RoPA record
- `/activities/:id/edit` - edit record
- `/intake` - lightweight trigger-based intake flow
- `/admin` - manage users and vocabulary values

## Assumptions

- This is an internal MVP, so authentication is a local session-based internal email gate rather than production SSO.
- The MVP stores multi-select fields as JSON arrays inside SQLite for simplicity.
- Excel export is implemented as Excel-compatible SpreadsheetML `.xls` instead of a full `.xlsx` dependency.
- PDF export is text-first and designed for reliable internal record export without adding a heavy PDF library.
- Intake-created draft records may be incomplete; the full create/edit form enforces the mandatory RoPA fields before a record is ready for review.
- Linked compliance documents are represented by IDs, URLs, and optional uploaded files.

## Extension points

The code is intentionally shaped so it can later support:

- Microsoft or Google SSO
- Slack or email reminder jobs using `activity_reminders`
- Supabase or Postgres as the backing store
- document system integrations for DPIAs, vendor reviews, and security reviews
- richer workflow states or approval assignments
- saved filters per user
- API endpoints for external compliance tooling

## Current limitations

- Attachments are uploaded and listed, but there is no antivirus scanning or document preview in this MVP.
- Reminder delivery is not yet pushed to Slack or email; the scheduling model and overdue logic are in place.
- Fine-grained record-level permissioning is intentionally simple for MVP use.
