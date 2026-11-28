# Revlet mail storage

Stalwart owns the live Cloudflare R2 blob bucket. Its metadata tracks which stored
bodies, inline images, and attachments are still referenced. Configure blob
cleanup in Stalwart and leave age-based deletion off for live blobs.

Use a separate private R2 bucket for backups. Use a 30-day lifecycle for verified
backup objects under `stalwart/`, subject to the organization's preservation
policy. The Worker does not prune archives during uploads. Measure read requests
and retrieved bytes before transitioning active mail to Infrequent Access.

Set a distinct `BACKUP_UPLOAD_SECRET` on the Worker and backup host. Upload an
encrypted archive with a unique `stalwart-<timestamp-or-id>.tar.gz.enc` name and
its hexadecimal SHA-256 in the `X-Revlet-SHA256` header. Follow the returned
`nextCursor` when listing archives. The backup job should consider only a 201
response with the expected checksum and size a successful upload.

For disaster recovery, take a consistent database backup, capture the blob
store after it, and keep Stalwart blob cleanup out of that interval. Record both
snapshots and the mail server configuration in the backup manifest. Test a
restore in isolation by opening a message and downloading its attachment.

## Deploy the transfer gateway

Create a private R2 bucket called `revlet-mail-upload-tickets` and expire objects
under `used/` after one day. This bucket stores short-lived replay markers.
File content passes through the Worker into Stalwart, which writes it to the
existing private R2 blob bucket. The shared upload key is
`REVLET_MAIL_TRANSFER_SECRET` on the Worker and RevletMail. Set
`REVLET_MAIL_TRANSFER_URL` on RevletMail to the HTTPS origin of the Worker.
The Worker also requires the configured Stalwart transfer credentials and the
canonical `WEBMAIL_URL` for browser CORS.

## Verify mail service after deployment

- Configure `STALWART_AUTH_RESULTS_ID` on RevletMail to the precise auth service
  identifier stamped by the trusted ingress. Configure ingress to discard
  inbound Authentication-Results headers claiming that same identifier.
- Enable the SES event destination for Send, Delivery, DeliveryDelay, Reject,
  Bounce, and Complaint, with original message headers available in the
  notification. Preserve `X-Revlet-Submission` through the SMTP relay. Verify
  the signed webhook against an approved SNS topic with a controlled mailbox.
- Confirm ARC sealing and envelope sender rewriting on Stalwart's external
  forwarding path. Test a formatted message and a DMARC-protected message
  through an approved external member. The app's organization-level
  `mailApprovedForwardingAddresses` list controls external recipients in group
  edits. Existing provider routes need reconciliation when adopting it.
- The 21-day message policy runs against active accounts only in organizations
  explicitly marked `mailRetentionPolicy: EPHEMERAL_21D`. Review the dry-run
  counts and legal-hold behavior before setting
  `REVLET_ENABLE_EPHEMERAL_PURGE=true` on the control plane. Verify R2 cleanup in
  Stalwart after the message metadata is removed.

- For end-to-end inbound monitoring, run an external sender against a dedicated
  probe mailbox every 15 minutes. Configure the mailbox's Stalwart account ID as
  `INBOUND_PROBE_ACCOUNT_ID` and a unique synthetic subject as
  `INBOUND_PROBE_SUBJECT`. The Worker alerts if no message arrives in 30 minutes.
- Apply recursive attachment archive inspection at the trusted Stalwart scanning
  boundary. The app preserves original filenames and formats for its transport
  rules, and uses a conservative size estimate for the encoded message.
