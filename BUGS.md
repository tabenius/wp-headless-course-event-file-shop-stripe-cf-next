# protocol
remember to tick off these as they are finished: [x] BUG: there is a TDZ bug around media / asset library

remember that Those named FUTURE you should all know about.
remember that Those named FUTURE you will ask if we are going to develop a plan or spec now and give advice and options in the case and ask follow up questions.
remember that Those named FEATURE you should all know about.
remember that Those named FEATURE you will ask if we are going to develop now and give advice and options in the case.
remember that Those named BUG you should all know about and suggest ways to fix, with impact and prio stated clearly.
remember to annotate the below entries with priorities and impact
remember to commit after each implementation, fix or addition to this document
remember to update asana mcp tools for these tasks as well and keep them updated as we go on

#list

[x] BUG: style tab: "{count} sparade versioner" in the style history, should in this case be 0 saved versions
[x] BUG: WordPress runtime posture: does not detect the plugin and it is ugly, verbose and I want it to be green or red and all other details should be in integration control
[x] BUG: Integration contol: "ragbaz: WordPress-läge är inte aktiverat.", even though the lights are green for those two: ragbaz and ragbazWpRuntime
[x] BUG: environment variables: graphql availability logging says CF_KV_NAMESPACE_ID is not defined even though it is
[x] BUG: environment variables: page performance also tell us about CF_KV_NAMESPACE_ID and also "Failed to load: e.json is not a function"
[x] BUG: RAGBAZ Bridge-plugin, names not up to date. is the file link correct?
[x] BUG: main menu bar, status: the status color shows partial connection and tell us that even though all lights are green in the integration control
[ ] FEATURE: /admin, add a small like thumbs up button in greater ui fields to signal that this gui is adequate, heart for good and thumbs down for needs improvement, for the admin user tobias they are read only but shown whereas when sofia interacts with the gui she may set these. Store them in KV.
[x] FEATURE: The sun and moon theme icon I do not want that thick outline in hover, please turn it down to 1-2px tops
[ ] FEATURE: if we change the advanced setting for wordpress url we may query that wordpress instead but the default is still xtas.nu
[ ] FEATURE: Add a yellow sepia / umbra colored theme and call it earth, therefore there are now three steps in the sun moon cycle and there will be a globe as an icon
[ ] FEATURE: Add a pink ceris purple colored theme and call it lollipop, therefore there are now four steps in the sun moon earth cycle and there will be a star as an icon
[x] BUG: /, buttons for theme, sun and moon icons, are not visible in the purple button. Head icon for login is not visible either.
[x] BUG: /, dark theme have dark text initially, change to white text if there is a dark theme.
[x] BUG: /admin/docs/readme-sv have no generated mermaid diagrams, they are all source code.
[x] BUG: /admin/docs/ have a lot of not generated mermaid diagrams, they are source code only.
[ ] FEATURE: Split /shop into static catalog shell + user ownership enrichment API. Expected gain: major TTFB reduction for anonymous traffic. Tradeoff: additional client-side state path; ownership badges become async.
[ ] FEATURE: All environment variable in the admin ui under storage should be able to toggle visible and also fill in those that are not shown at all, put them under a new tab called secret and make the admin user to write in her password again as confirmation.
[ ] FEATURE: review the knob and ui style of the font laboratory ../type-laboratory.html, of draft-font-editor* as inspiration and add variants as an advanced setting: vintage font style and synchronize the two font selectors range of possibilites.
[ ] FEATURE: to the font choosers show css with google fonts url and typeface declarations and everything.
[ ] FEATURE: welcome impress slides, go to fullscreen automatically and then allow a not fullscreen button to be present lower right corner (high contrast).
[ ] FEATURE: welcome impress slide flow diagram: increase contrast and size of texts, boxes and flows, use more space.
[ ] FEATURE: I want the ragbaz wp plugin be instructive in how to change her wordpress url in a shared hosting setting where subdirectories are becoming subdomains such that wp.xtas.nu could be created by either moving the current directory in to that subdirectory or create a symlink to the same.
[ ] FEATURE: add a telegram bot that tells about actions such as login, payments, products bought, media library asset uploaded, logout, change of keys of any sort.
[ ] FEATURE: Build a ChatWoot integration that send to this account id: 155812, webhook for us will be something like /api/chatwoot/event for read and send
[ ] FEATURE: sales trends, a diagram, small, in the payments section over the last year, marked Q1, Q2 ... a smooth line diagram with MA20 and MA200 and a minimal awesome oscillator below based on rsi 75, 25% or standard values.
[ ] FEATURE: Enforce image pipeline defaults (WebP by default, AVIF where practical, size variants). Expected gain: better LCP and lower transfer. Tradeoff: extra storage + processing + variant bookkeeping.
