# Child Festival — Team Hub

## Run the app
The production app is served by the Node backend so it can load the uploaded member directory. For local development:

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD=choose-a-private-password npm --prefix server start
```

Open `http://localhost:3000`. The public directory is at `/`. Administrators must manually add `/admin` to the URL, authenticate, and are then taken to the CSV importer. There is no admin or import link on the public site. The root `index.html` remains a portable copy of the page, but CSV data requires the server.

## Import members
Open `/admin`, enter the private credentials stored as the Fly `ADMIN_USERNAME` and `ADMIN_PASSWORD` secrets, and select a UTF-8 CSV file after login. The username defaults to `admin` when `ADMIN_USERNAME` is not set. Authentication creates an HTTP-only, same-site session that expires after eight hours. Five failed login attempts trigger a 15-minute cooldown. A valid import atomically replaces the existing member directory. The file can be up to 5 MB and must include these headers (header matching is case-insensitive):

```csv
Name,Phone,Team,Role description
Jane Doe,96170123456,Registration,Welcome families and manage check-in
```

Names, teams, and role descriptions are required. Phone is optional. When present, it may include common punctuation but must resolve to 7–15 international digits. Quoted fields, commas inside quoted fields, CRLF files, and a UTF-8 byte-order mark are supported.

## Content status
The operational team names come from the request. Registration appeared twice and is intentionally listed once, leaving 10 unique teams. Actual focal names, phone numbers, date, venue, districts, booths and shifts were not supplied: these are marked pending or sample. SOP bullets are draft briefing discussion points for organizer review. Sample booth codes are not verified against the map. The map is now an illustrated interpretation of the supplied photograph. Booth counts, paths and positions must be confirmed against the final operational plan.

## File organization
The file contains metadata, numbered/commented CSS, semantic HTML and numbered/commented JavaScript. Logical classes describe each container's purpose. Sections have stable IDs for navigation.

| Element / class or ID | Responsibility |
| --- | --- |
| `.site-header`, `.header-inner` | Festival identity and planning status; inner div aligns these items. |
| `.navigation`, `.nav-inner` | Accessible Welcome and section tabs; the tab row scrolls horizontally on narrow screens. |
| `#main-content`, `.container` | Accessible main landmark and consistent page width. |
| `.overview` | Introduction; first div groups title, text and event details. |
| `.event-meta` | Wrapping row of date and venue. |
| `.overview-note` | Before-shift reminder and briefing link. |
| `.metrics`, `.metric` | Overview counts and section shortcuts. |
| `.draft-notice` | Identifies information awaiting confirmation. |
| `.tab-stage`, `.dashboard-panel`, `.section`, `.section-heading` | Tab workspace, Welcome dashboard, active section panel and heading layout. Only one panel is shown at a time. |
| `#teams`, `.toolbar`, `.search-field` | Directory and labeled search/filter controls. The second toolbar div groups the category label/select. |
| `#team-results` | Accessible live result count. |
| `#team-grid` | Generated operational team cards. |
| `.card`, `.card-top` | Reusable card and its identifier/category row. |
| `.team-icon`, `.tag` | Short identifier and category label. |
| `.contact`, `.avatar` | Contact row and neutral avatar. Inner div groups focal name and role. |
| `.contact-action`, `.contact-pending` | Valid WhatsApp link or non-clickable pending label. |
| `#activities`, `#activity-grid` | Activity names, sample booth codes and focal contacts. |
| `#event-map`, `.map-layout` | Map section with responsive map and reference columns. |
| `.map-frame`, `#event-map-image` | Embedded illustrated PNG and caption. |
| `.zone-list` | Orientation notes based on visible map labels. |
| `#shifts`, `#shift-grid` | Shift names, times and responsibilities. |
| `#fleet`, `#fleet-grid` | District transport focal cards. |
| `#sops`, `#sop-list` | Native expandable briefing sections and bullets. |
| `.footer-inner` | Footer text and back-to-top link. |
| `#map-dialog`, `.dialog-header` | Enlarged-map dialog and title/control layout. |
| `.dialog-actions` | Groups zoom and close controls. |
| `#map-zoom-scroll` | Scrollable map viewport; `.is-zoomed` enables closer inspection. |

## Edit the content
Search for `const festivalData` near the bottom. Add records to the relevant arrays to extend the page. Team, activity and shift counts update automatically.

Team fields:
- `name`: team name.
- `code`: short visual identifier, such as RG.
- `area`: Guest services, Operations, or Activities & care. Add an option in `#team-filter` if introducing another category.
- `role`: focal's role.
- `description`: responsibilities.
- `focal`: approved adult focal's display name.
- `phone`: real WhatsApp number in international digits, without +, spaces or a local leading zero. Leave empty until confirmed.

Activities use `code` for booth number, plus `name`, `description`, `role`, `focal` and `phone`. Replace illustrative booths with approved assignments.

Shifts use `name`, `time` and `description`.

Fleet maps six example district names into placeholder records. Replace this mapped array with individual objects for real contacts:

```javascript
fleet: [
  {
    district: 'Confirmed district',
    focal: 'Confirmed adult focal',
    role: 'District fleet focal',
    phone: '',
    description: 'Confirmed pickup and departure instructions.'
  }
],
```

SOPs use `title` and `points` (an array of bullet strings). Replace these with organizer-approved wording.

Edit date and venue in `.event-meta`. Once the plan is approved, update the draft notice/status, section descriptions and sample labels in the rendering functions.

## JavaScript functions
- `element`: creates DOM nodes; textContent safely inserts text.
- `appendContact`: renders contacts and https://wa.me/ links for valid digit strings. Format validation does not verify that the number is registered on WhatsApp.
- `makeCard`: shared team/activity card structure.
- `renderTeams`: combines case-insensitive search and category filter, with a no-results state.
- Initial rendering blocks: populate the other sections and counts.
- Map handlers: open/close the native dialog and toggle zoom. Escape also closes it.

## Replace the map
Replace `festival-map-illustrated.png` while keeping the same filename. If its proportions change, update the image width and height in the map setup script, plus the alternative text and zone notes. The page and enlarged dialog both use this file.

## Design and accessibility
Change `:root` variables for colors and corner radius. The Red Cross-led theme uses a warm festival canvas, playful dashboard tiles, and a different accent for each active section. Grids switch from three to two to one columns. Tabs scroll on phones and support Left/Right/Home/End keyboard navigation. Focus indicators, labels, a skip link, semantic tab panels, native details and a native dialog support keyboard use. Controls are touch-sized. Reduced-motion settings disable entrance and hover animations. System fonts keep the page independent of third-party services.

## Check after editing
1. Open index.html and verify all 10 supplied unique teams.
2. Search security: two teams remain. Choose Guest services: no results. Clear both controls to restore the directory.
3. Add a confirmed phone and inspect its WhatsApp destination without sending a message.
4. Open the map, zoom, fit, close, reopen and press Escape.
5. Switch every tab with click and Left/Right/Home/End keys. Expand briefing sections and navigate with Tab. Check phone/tablet/desktop widths and 200% zoom.
6. Confirm contacts, assignments, counts and sample labels before operational use.

The public `GET /api/members` endpoint supplies the directory. Login uses `POST /api/admin/login`; the protected `POST /api/admin/import` endpoint accepts `text/csv` only from an authenticated admin session. Contacts are public once imported; use approved adult contacts and keep children's personal information out of the app.

## Deploy to Fly.io
The included `Dockerfile` and `fly.toml` deploy both the frontend and backend. The Fly volume `contacts_data` persists `/data/data.json` between machine restarts.

```bash
fly volumes create contacts_data --region cdg --size 1 -a contacts-admin-crisis-2026
fly secrets set ADMIN_USERNAME='admin' ADMIN_PASSWORD='a-long-random-secret' -a contacts-admin-crisis-2026
fly deploy -a contacts-admin-crisis-2026
fly checks list -a contacts-admin-crisis-2026
```

Create the volume only once. Never commit or place the token in `fly.toml`. If the public frontend is hosted on another origin, add it to the comma-separated `ALLOWED_ORIGINS` value before deployment.

## LRC visual update
The header and favicon use a red cross centered in a white circle with a red border. This is a simple custom badge, not a supplied official logo file. The map was redrawn with the built-in imagegen tool and saved as `festival-map-illustrated.png`; the page now loads that exact file so the displayed map cannot drift from the folder reference.

Generation prompt: Redraw the supplied hand-drawn map as a clean Adobe Illustrator-style flat LRC child festival planning illustration, using red/white, neutral paths, legible zone labels, the same major zone arrangement, entrance/exits and a circular red cross badge. Remove photographed paper and handwriting; label the result as a planning illustration requiring final confirmation.
