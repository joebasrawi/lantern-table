# Hosted browser playtest

Date: September 5, 2026 (America/New_York), 9:58–10:02 PM.
Application source: 7011e3382183cd91f6986b37603964a351fa42ec (private hosted version 12).
Browser: Codex in-app browser, existing signed-in owner session, default desktop viewport.
Campaign: Browser playtest · Lantern Coast. Character: Rowan Test, Human Wayfinder.

## Observed passes

- Created a named campaign with default AI DM and Quickplay rules; character dialog opened automatically.
- Customized the ready-made character name and joined the adventure.
- Adventure artwork and text rendered without visible overlap in the inspected desktop screenshot.
- Submitted an exploration action about a letter. Resolving status appeared, then a complete AI response and suggested actions; composer cleared.
- Reloaded the page and observed the same character, player action, AI narration, and suggestions.
- Journal showed the generated discovery “A forgotten harbor sigil”; selecting it displayed its description. Map showed the starting location.
- Character sheet displayed the selected identity and initial 20 health / 3 energy.
- Saved Human DM and Tactical rules through Campaign settings. DM Desk became available with the expected controls.
- Published human narration, started one Practice sentinel encounter, and observed the narration and encounter in Adventure.
- Played power, movement, and attack turns. Rolls, misses, damage, enemy responses, rounds, and position updates appeared. Movement to tile 1,4 used a turn. Power consumed energy even on a miss.
- Won the encounter and observed the 25-experience award and return to exploration.
- Submitted an exploration action to the human DM. The player UI showed the saved/waiting message and disabled a second action.
- Selected the pending action in DM Desk, wrote and published its outcome. The queue cleared.
- Returned to the campaign list and reopened the adventure. The human outcome persisted and the composer was available.
- Reopened the character sheet: 8/20 health, 1/3 energy, and 25 experience persisted, consistent with observed combat.
- Browser console inspection returned no captured warnings or errors during the run.

## Limits and follow-up

No blocking issue was observed in these tested paths. This is one owner-session functional smoke test, not exhaustive acceptance testing. A second human account, real multi-device play, mobile layouts, keyboard/screen-reader coverage, uploads, multi-player voting and prolonged AI play remain outside this run. No permission or audience settings were broadened. The test campaign remains available for inspection; no existing player campaigns were modified.

## Narrow viewport follow-up

Requested viewport override: 390×844. The browser reported an effective CSS viewport of 433×938, so this is not evidence of exact 390px behavior. Document scroll width equaled client width (433px), and no inspected element exceeded the viewport right edge. Map navigation worked. The character dialog opened with the saved resources, with bounds approximately x=16..417px inside the viewport.

Resized screenshots exhibited duplicated strips and inconsistent scaling, including after reload. The available evidence does not establish whether this is a capture/compositing issue or rendered-page behavior; do not classify mobile visual fidelity as passed or claim an application fix. Restored the viewport override after checking. Real-device/mobile visual inspection remains pending.

## Pending decision follow-up

In the same hosted test campaign, used Ask the party to create “Where should we investigate next?” with Harbor archive and Old lighthouse options. The unanimous decision displayed 0 of 1 votes. Reloading preserved the question, options, and unresolved count. Selecting Harbor archive resolved the one-member vote, removed the decision card, recorded the chosen outcome in Adventure history, and re-enabled creation of another question. This proves the browser save/reopen/vote path for one member, not agreement or synchronization across multiple accounts.

## Assisted DM follow-up

Switched to Human with AI assistance through Settings. Submitted a new player action, selected it in DM Desk, and entered human text in Narration before requesting a draft. One live AI request returned a separate “AI draft · not shared” preview while preserving the existing editor text. Use draft in editor copied the proposal into Narration and left the pending action unresolved. Replaced the editor content with a shorter human-written Archive Seven clue and published it. The queue cleared and Adventure displayed exactly the edited text, not the original AI draft.

Usability finding: Draft with AI is disabled unless a pending action is selected, but no adjacent explanation tells the host why. Typing narration alone does not enable it. Add guidance for the empty queue and unselected-action states. This is a discoverability issue, not a failure of the assisted publication flow.

## Fresh login follow-up

On the hosted site, used Back to campaigns and Sign out. The site displayed its signed-out “You’re almost in” screen. Continue with ChatGPT navigated to ChatGPT’s Welcome back authentication form. No existing identity-provider session completed the login automatically. Handed the form to the owner; no credentials were entered or new account created. After the owner completed ChatGPT login, returned to the game, selected the existing owner account, and completed the normal basic-profile sign-in consent. The saved campaign reappeared. Reopening it restored the Harbor archive decision, assisted/Tactical settings, and Archive Seven narration. Rowan Test retained 8/20 health, 1/3 energy, and 25 experience. Fresh owner sign-in and campaign recovery passed; a second account remains untested.

The assisted-DM guidance fix was published in version 13 (3ace62c95313fcb45b5f9f026496957571388f5f). Its empty-queue explanation was verified in the hosted browser before the login test.

## Railway owner login and narrow viewport — September 7–8, 2026

The live Railway website accepted the provisioned owner email/password through its browser form, returned to the campaign list, and reopened `Railway verification` with the saved Railway Scout, narration and pending travel vote. No campaign state was changed during this inspection.

At a settled 390×844 viewport, screenshots showed readable Adventure, Journal, Map, DM Desk and the owner character panel. Navigation worked across all four tabs; the character panel opened from both the portrait and Character controls. DOM measurement reported viewport width and document scroll width both 390; the inspected party-member dialog was about 358 pixels wide at x=16 and 777 pixels high at y=34, within the viewport. The character sheet showed the custom uploaded test image, resources and all six attributes.

The first capture after the viewport override reported 433×938 with duplicated image strips, and the first Character click timed out. Subsequent navigation and settled captures rendered correctly at 390×844; no application code change was needed. The browser viewport override was reset afterward. This verifies these specific views at one narrow size, not physical phone behavior, soft-keyboard handling, tactical-grid touch interaction or comprehensive accessibility. Two independent hosted browser sessions remain untested.

## Two isolated local sessions — September 8, 2026

The production Railway build was exercised in two in-app browser tabs with independent host-only cookies: `localhost:3019` for the host and `127.0.0.1:3020` for the player. Each local server used its own configured origin and the same disposable SQLite database. No authentication bypass was enabled. Test accounts, campaign membership and characters were seeded through the normal authenticated HTTP API before browser interaction. This setup verifies independent browser-session interaction against shared persistence; it is not a claim of two physical devices or two browsers on the hosted Railway origin.

Both accounts signed in through the browser form and opened the shared campaign. The host opened DM Desk while the player submitted “I check the lighthouse ledger, then leave for the evening.” The player saw the saved/pending status; the host's open DM Desk received the pending action through polling without a reload. The player then signed out. The host selected that action and published a response naming Captain Orin and the north pier; the pending queue cleared.

The player signed in again, reopened the campaign and saw the saved response, “1 new event since your last visit,” an empty available composer, both characters at 20/20 health, and no DM Desk navigation. This demonstrates the leave/respond/return human-DM loop through independent UI sessions. No AI calls or real-player campaign changes were made. Both test tabs and server processes were closed afterward.

An initial attempt to use Safari was abandoned when the user was actively using that browser. No further Safari actions were taken; the isolated-origin setup avoided interfering with the user's browsing.
