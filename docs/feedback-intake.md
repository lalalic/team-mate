# Feedback intake contract

The public support page posts to `/api/feedback` by default. A deployment may
override the endpoint with the `feedback-endpoint` meta tag, but the endpoint
must accept `multipart/form-data` with:

- `record`: JSON using schema `neo.feedback.v1` and `recordType:
  product_feedback`;
- `screenshot`: optional image attachment (PNG, JPEG, or WebP, at most 5 MiB).

The service must durably write the feedback record and attachment before
responding. A successful response is JSON with `recordId` (preferred), `id`, or
`status: "recorded"` / `status: "accepted"`. The page does not create GitHub
issues or pull requests.

The record contains `source` and `context` provenance, the selected feedback
category, the user's message, optional reply-to email, attachment metadata, and
the explicit `consent.safeToShare` acknowledgement. The intake service should
apply its own abuse protection, retention, access control, and attachment
scanning; the browser must not send credentials, tokens, or meeting content.
