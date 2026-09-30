# Contacts architecture and operations

## Purpose and data model

Contacts is QuickSiGe's organization-wide directory for project work. It is deliberately not a sales CRM. A person is stored once as a `Contact`; an organization is stored once as a `Company`; `ContactCompanyAffiliation` records employment context; and `ProjectContactAssignment` records project-specific company context and one or more standard or custom roles. Emergency contacts remain project-owned and are not promoted into the directory.

The live `Project.participants` array is a compatibility view only. `resolveProjectParticipants` derives it from canonical contacts, affiliations, companies, assignments, and roles. Project pages, plans, documents, exports, and publication receive this resolved view. Publishing snapshots the resolved values, so later contact changes update live projects and mark current documents stale without rewriting published revisions.

Every local record carries an organization ID. Mutations reject viewer access and mismatched organization IDs. Contacts pages call application use cases rather than mutating stored arrays. Those use cases persist through a focused Contacts repository snapshot covering the directory and the project/output dependencies that must change atomically; the injected repository can be replaced without changing pages or import-domain logic. The hosted schema repeats organization ownership on relationship tables, protects it with composite foreign keys, enables row-level security on every Contacts table, and grants reads to members and mutations to owner/admin/editor roles.

## Local and hosted migrations

Local schema version 32 adds Contacts collections and migrates embedded participants plus the stable `overview-template-participants` section. Matching precedence is normalized non-empty email, normalized non-empty phone, then exact name and company. Duplicate project rows become roles on one assignment. Known participant fields are removed from the live overview after migration; any non-standard populated field keeps the legacy section, detached from the reusable template, so its value is not lost. Existing migration backup and recovery behavior remains active, and repeated migration is idempotent.

Hosted migration `202609290001_contacts_workspace.sql` keeps the original tables intact while adding structured methods, companies, affiliations, assignments/roles, external identities, import batches, constraints, indexes, and RLS. It backfills legacy company/email/phone/participant values before the application switches adapters. Apply it forward; recovery should restore the pre-migration database backup rather than manually deleting populated canonical tables.

## File import

Supported sources:

- UTF-8 vCard 2.1, 3.0, or 4.0 in `.vcf`/`.vcard`, including multiple cards and quoted-printable vCard 2.1 values with declared legacy character sets;
- comma, semicolon, or tab-delimited `.csv`, `.tsv`, or `.txt` with quoted delimiters/newlines;
- `.xlsx` workbooks using cached/displayed cell values; and
- files selected with the picker or exposed as real files by operating-system drag-and-drop.

Limits are 10 MB per file, 64 MB of declared expanded XLSX content, 1,000 XLSX archive entries, 10,000 records, 4,000 characters per field, and 100 provider pages. Legacy `.xls`, macro-enabled workbooks, password-protected workbooks, `.msg`, and Outlook virtual items are not accepted. QuickSiGe checks file content signatures instead of trusting the browser MIME label. Spreadsheet formulas are never executed; cached results are read where present, and formula-only cells without a cached display value produce a visible warning. Delimited parsing and candidate mapping yield in bounded chunks so large previews do not monopolize the browser main thread. CSV export prefixes formula-leading values and quotes every cell.

The wizard keeps parsed candidates in React memory until confirmation. It auto-maps common German, English, and Outlook headings, supports manual mapping and worksheet selection, then proposes create/update/skip decisions. Stable provider identity is strongest; normalized email and phone follow; exact display name is only a review proposal. Import updates fill or add useful values without blanking existing non-empty QuickSiGe values. Imported values render as normal React text, never raw HTML.

Commit is one application transaction covering people, companies, affiliations, external identities, any selected standard/custom project roles, audit metadata, and the import journal. Cancelling before commit writes nothing. Undo removes artifacts created solely by the batch and restores captured records when they have not been edited later. Later project references or newer edits are reported as conflicts and are never erased silently.

To create compatible files:

- Outlook: export contacts to CSV, or save/drag contact cards as real `.vcf` files. Classic/New Outlook and browsers can expose drag data differently; if the drop does not contain a real supported file, use **Connect Microsoft Outlook** or export first.
- Google Contacts: use **Export → Google CSV**, **Outlook CSV**, or **vCard**. QuickSiGe imports saved contacts, not Gmail recipients or “Other contacts.”
- iCloud Contacts: select contacts, choose **Export vCard**, and import the resulting `.vcf`.

Direct Outlook drag support must be described as best-effort until this matrix is manually verified on released clients:

| Source | Windows Edge/Chrome | macOS Chrome/Safari | Fallback |
| --- | --- | --- | --- |
| Classic Outlook | Unverified; works only when a real `.vcf` reaches the browser | Not applicable | Save as vCard/CSV or connect Microsoft |
| New Outlook | Unverified; virtual items may not expose a file | Not applicable | Export CSV or connect Microsoft |
| Outlook for Mac | Not applicable | Unverified; requires a real `.vcf` | Export vCard/CSV or connect Microsoft |

## Microsoft connector

1. Register a Microsoft Entra single-page application supporting organizational and personal Microsoft accounts as appropriate for the deployment.
2. Add the exact development, test, and production QuickSiGe origins as SPA redirect URIs. Local default is `http://localhost:4173`.
3. Add delegated Microsoft Graph permissions `User.Read` and `Contacts.Read`; do not add mail, directory, application, shared-mailbox, or write permissions.
4. Put the public application/client ID in `VITE_MICROSOFT_CLIENT_ID`. No client secret belongs in a browser build.

QuickSiGe uses MSAL's authorization-code-with-PKCE browser flow, a `common` authority, and memory-only cache. It always presents account selection, reports denied consent, expired sessions, popup and conditional-access failures without persisting provider diagnostics, and aborts retrieval when the wizard closes. It lists accessible contact folders, loads the default Contacts folder and selected named folders, requests only mapped contact fields, follows Graph pagination, retries bounded throttled/transient responses, and deduplicates the folder result by Graph contact ID before review. It stores only account/contact IDs and `changeKey`, and clears the MSAL cache after success, failure, cancellation, or page teardown. Missing contacts on re-import never cause deletion.

## Google connector

1. Enable Google People API and configure the OAuth consent screen for the deployment's test or production users.
2. Create a Web OAuth client and add the exact QuickSiGe development, test, and production origins. Local default is `http://localhost:4173`.
3. Put the public client ID in `VITE_GOOGLE_CLIENT_ID`; never commit a client secret.

QuickSiGe uses Google Identity Services and requests `openid`, `email`, and `https://www.googleapis.com/auth/contacts.readonly`. It always presents account selection and reports consent, popup, expiry, permission, quota, and network states before persistence. It reads only saved People connections and mapped fields, lists user contact groups, lets the user filter the review by one or more groups, follows pagination with bounded quota/transient retries, stores only the account ID, People resource name, and etag, then revokes the access token after success, failure, cancellation, or page teardown. It does not request Gmail, directory, “Other contacts,” or write scopes.

## Connector environment checklist

Configure each deployment separately; do not reuse a production registration for local development.

| Environment | Microsoft Entra SPA redirect URI | Google authorized JavaScript origin |
| --- | --- | --- |
| Local preview | `http://localhost:4173` | `http://localhost:4173` |
| Test/staging | Exact HTTPS origin of the test deployment | Exact HTTPS origin of the test deployment |
| Production | Exact HTTPS production origin | Exact HTTPS production origin |

For Microsoft, select the account audience needed by the deployment, add only delegated `User.Read` and `Contacts.Read`, and place the application ID in `VITE_MICROSOFT_CLIENT_ID`. For Google, enable People API, configure the consent screen/test-user list, add only the origin used by the browser flow, and place the Web client ID in `VITE_GOOGLE_CLIENT_ID`. Neither browser connector uses a client secret, refresh token, service-account key, or server credential.

Use dedicated provider test accounts containing synthetic contacts for local/staging verification. The Microsoft fixture should include the default folder, a named folder, a duplicate external identity, international names/methods, and a later edit for re-import. The Google fixture should include at least two user groups, a contact in both groups, a duplicate external identity, international values, and a later edit. After setting the client ID and restarting QuickSiGe:

1. Open **Contacts → Import contacts**, select the provider, and confirm the provider consent screen shows only the documented read-only scopes.
2. Switch accounts once, select more than one folder/group, and verify the unique preview count.
3. Import into a project with two roles, re-import the changed provider contact, and verify that one QuickSiGe person is updated rather than duplicated.
4. Cancel a second import, inspect Local Storage, IndexedDB, the URL, the downloaded workspace backup, and recent audit details, and confirm no access token or raw provider response is present.
5. Revoke QuickSiGe in the provider account, retry once, and verify the actionable expired/denied state leaves the database unchanged.

Public client-ID rotation is a deployment configuration change: create or select the replacement registration, reproduce the reviewed origins/redirects and least-privilege scopes, update the corresponding `VITE_*_CLIENT_ID`, rebuild, execute the checklist above, then disable/delete the old provider registration. Removing a connector requires clearing its environment value, rebuilding, and revoking/deleting the provider registration. QuickSiGe has no stored refresh token or client secret to migrate or erase.

## Privacy, permissions, and recovery

Imported business fields are limited to names, organizations, roles/titles, email addresses, phone numbers, business-relevant addresses, notes, and tags/groups. Photos, birthdays, gender, keys, audio, interests, mail, and provider directory profiles are ignored. OAuth access/refresh tokens and raw provider payloads are never written to local storage, IndexedDB, import journals, audits, backups, or URLs by QuickSiGe.

Local backups intentionally include canonical contact data and compact import undo records because they are workspace data. Treat those backups as personal data. Provider tokens are transient and excluded. Normal removal uses archive/restore; project unassignment never deletes the contact. Before a lifecycle or deletion action, QuickSiGe shows the related company, project, provider-identity, and import references. An archived person or company can be hard-deleted only through an explicit confirmation when no affiliation, assignment, external identity, import journal, or revision protects it; the operation is audited. CSV and vCard serve interoperable address-book exports. The audited JSON portability export includes selected people or companies plus their affiliations, project roles, and provider identities for authorized data-subject or organization requests, and never contains OAuth credentials.

Threat controls include bounded files/records/fields/pages, pre-decompression XLSX central-directory and macro inspection, browser-native text escaping, formula-safe CSV export, non-executing XLSX reads, OAuth SDK state/PKCE handling, in-memory tokens, organization checks in use cases, composite tenant foreign keys, RLS, explicit duplicate decisions, atomic commits, and conflict-aware undo. Residual risks requiring deployment QA are provider throttling/conditional-access variants and client-specific Outlook drag formats.

## Troubleshooting

- **Connector not configured:** set the corresponding public client ID and restart the Vite/build process.
- **Popup blocked or consent denied:** allow the popup and retry; no data has been written.
- **Redirect/origin error:** register the exact scheme, host, and port shown in the browser.
- **Microsoft conditional access / Google test-user restriction:** authorize the test account in the provider console or ask the tenant administrator.
- **Expired/revoked token or throttling:** transient failures are retried up to three times. If the actionable error remains, reconnect after the provider's retry window. The uncommitted preview is disposable and no contact changes have been committed.
- **Malformed/unsupported file:** re-export as UTF-8 CSV, vCard, or `.xlsx`; do not rename `.xls`, `.msg`, or macro files.
- **Unexpected duplicate:** choose Skip or the correct existing contact in review, then use deliberate merge from Contacts if needed.
- **Undo conflict:** remove later project references or keep the newer data; QuickSiGe will not erase it automatically.
