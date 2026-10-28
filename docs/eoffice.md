# eOffice preparation

Work lives on feature/eoffice. Do not deploy backend changes or merge into main
until the document templates and actual signing flow have been reviewed.

## Current UI

eOffice is available in Workspace navigation. Quick Actions are Sick Leave,
Schedule a Pause and Mental Health Days; these buttons intentionally have no
actions. Pending documents use the existing member document list. A purple
navigation dot indicates unsigned documents. The signature journal lists signed
document titles without document links; Signed Documents remains the archive.

The modal shows the document, optional required input fields, and the existing
blue Entra button. Actual submission is disabled until templates and the server
signing endpoint are connected. No signatures or success events are fabricated.

## Zero-subscription engine

Use pdf-lib 1.17.1 (MIT) in Supabase Edge Functions, with existing Entra identity
verification and a server audit trail. There is no additional SaaS subscription
or separate server. Existing Supabase free-tier quotas still apply; no paid
services are provisioned. This is a custom identity-attestation signing flow,
not a deployed third-party e-sign platform or a certificate-based PDF signature.

`_shared/eoffice-pdf.ts` prepares a PDF: validates configured required fields,
fills AcroForm text fields, flattens them, and stamps a small hashID in the lower
left corner of every page. The hashID is a stable random document identifier;
the final bytes have a separate SHA-256 integrity hash to avoid a self-referential
file hash. Stamp coordinates must be verified against the actual templates,
including page rotation, margins and any existing signatures. Non-AcroForm PDFs
need explicit per-template field coordinates. Do not rewrite already signed PDFs.

## Next delivery after PDF templates

1. Version NDA/GDPR templates and map fields, signers and visual signature regions.
2. Add service-owned document requests, recipients and append-only events in
   separate tables; do not use client-editable member flags as signature evidence.
3. Generate one immutable prepared version with its hashID; display that exact
   version to the signer before confirmation. Record its SHA-256 and template version.
4. Start a fresh Entra authorization confirmation using state/nonce and a single-use,
   short-lived signing intent bound to the member, request and prepared PDF hash.
   Validate identity server-side, require explicit consent, validate required fields,
   reject duplicate submissions, and record the identity and document version.
5. Commit the signature event before showing the success animation. Route to the
   company's countersigner and approval queue; never auto-sign for an employee.
6. Retrieve request counts and the journal from the server, connect onboarding
   completion only to verified signature/approval events, and preserve Signed
   Documents as the existing permanent-link destination.

Automatic company signing requires a separately configured document-type rule.
No OneDrive upload, automatic deletion or retention timer is enabled in this branch.
