# Give new Atomic Server profiles their own API port

- **Context.** Atomic Chat and Atomic Server both requested 1337. The start order could leave one API down or send a loopback client to the other product on macOS.
- **Decision.** New profiles use 1339 for the API and 1338 for the admin. Config migration 5 → 6 materializes the previous default of 1337 and preserves explicit ports, including 0. For a profile without a config, an existing server log or keyring identifies a previous server. The server and terminal UI create an empty `atc/profile-v6` marker in fresh profiles before writing either artifact. Reading settings alone creates no files.
- **Terminal clients.** An empty endpoint follows the local server. Earlier configs stored the default URL on every edit. Migration translates that exact old URL into the follow-server setting and preserves other saved targets, including an explicit URL on 1339. Environment overrides still select their exact URL.
- **Consequences.** Existing clients retain their address across upgrades. A profile whose settings, keyring, and logs were all removed is indistinguishable from an unused profile. The configured port remains strict when occupied, so scripts keep a predictable address.
- **Owner.** team
