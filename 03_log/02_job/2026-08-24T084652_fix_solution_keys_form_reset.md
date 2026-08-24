# Fix solution-keys register form reset after await

## Summary

`/admin/solution-keys` [등록] succeeded on the API, then `e.currentTarget.reset()` threw because React nulls `currentTarget` after the event handler yields. Capture the form element before `await` and reset that reference.

## Changes

- `04_script/apps/web/src/portals/admin/SolutionKeysPage.tsx` — `const form = e.currentTarget` before the API call
