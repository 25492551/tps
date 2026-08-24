# Job: Profile account section — text visibility

**When (UTC)**: 2026-08-24T163252

## Summary

Improved `/app/me` account block readability: replaced muted `setting-desc` paragraph with a label/value `member-dl` (`profile-account`) using brighter ink for values.

## Changes

- `04_script/apps/web/src/portals/user/pages.tsx` — account fields as `dl.member-dl.profile-account`
- `04_script/apps/web/src/styles.css` — `.member-dl dd` ink; `.profile-account` brighter/larger values
