# Aegis Compliance Solutions Website

Static marketing site for Aegis Compliance Solutions.

The CMMC readiness portal is published from `assessment/` and uses bundled
static JSON files in `assessment/data/`.

## Deploy

The site is configured for Netlify. The publish directory is the repository root.
Production deploys publish from the `main` branch.
GitHub push events trigger Netlify builds through a repository webhook.

## Slack website requests

Slack can send website change requests to the Netlify Function at:

```text
https://www.aegiscompliancesolutions.com/.netlify/functions/website-change
```

Create a Slack slash command such as `/website-change` and point it at that URL.
The function verifies Slack's signing secret and creates a GitHub issue labeled
`website-request` and `needs-preview`.

Required Netlify environment variables:

- `SLACK_SIGNING_SECRET`
- `GITHUB_TOKEN`
- `GITHUB_REPO=jsnyder-cyber/aegis-compliance-solutions-site`

The intended publishing flow is: Slack request, Codex branch, Netlify preview,
Jeff approval, merge or push to `main`, production deploy.
