# Changes

## 0.12.0

- [`8559d4a`](https://github.com/mantoni/beads-ui/commit/8559d4af699555b9943914a2e790965c9e4d8da7)
  feat(cli): auto-increment port when default is in use (#73) (Leon Letto)
- [`527e9a5`](https://github.com/mantoni/beads-ui/commit/527e9a59a01e1b93c1488cb1e2ed26ae346b358c)
  feat(cli): preserve workspaces across bdui restart (#72) (Leon Letto)
- [`5996b39`](https://github.com/mantoni/beads-ui/commit/5996b39499bcf0e460133c27a7ee20b30c677ab5)
  chore: add dev-docs to .prettierignore (Leon Letto)
- [`08f1439`](https://github.com/mantoni/beads-ui/commit/08f1439d13fc5b534de13e1ea94af4407174d76f)
  style: fix prettier formatting in daemon and test files (Leon Letto)
- [`4a0c791`](https://github.com/mantoni/beads-ui/commit/4a0c791300f12e47faae74e8237f823857be7dd9)
  fix: resolve TS18048 type error in restart test (Leon Letto)
- [`c973d86`](https://github.com/mantoni/beads-ui/commit/c973d8693c6cfa3a5f8ad0905134465903e527a2)
  feat(cli): preserve listening port across bdui restart (Leon Letto)

_Released by [Maximilian Antoni](https://github.com/mantoni) on 2026-04-02._

## 0.11.3

- [`47261a7`](https://github.com/mantoni/beads-ui/commit/47261a7a95d5a17b480ae56c4a10b5eeb49d1007)
  feat: show close reason in issue detail view (#63) (Tom Preece)

_Released by [Maximilian Antoni](https://github.com/mantoni) on 2026-03-18._

## 0.11.2

- [`929a15d`](https://github.com/mantoni/beads-ui/commit/929a15da79ead6819044e50580093e3cbe87758b)
  Fix beads setup
- [`b354aa6`](https://github.com/mantoni/beads-ui/commit/b354aa63a7d04abe50b0da74c5c0e62077f44b69)
  fix: apply --port/--host overrides before workspace registration (Ryan Peterson)

_Released by [Maximilian Antoni](https://github.com/mantoni) on 2026-03-11._

## 0.11.1

- [`0fc2df7`](https://github.com/mantoni/beads-ui/commit/0fc2df7cbaeb6f0500900ce2bf87e6b3fa8e8ac0)
  style: fix prettier formatting in list-adapters test (Leon Letto)
- [`e00ddfc`](https://github.com/mantoni/beads-ui/commit/e00ddfc9b9d421dc31b7d7703f4bfbc9790546f8)
  fix: add --tree=false to bd list calls for bd 0.59.0 compat (Leon Letto)

_Released by [Maximilian Antoni](https://github.com/mantoni) on 2026-03-07._

## 0.11.0

- [`fc00b87`](https://github.com/mantoni/beads-ui/commit/fc00b87cfd1b6600a9b9088a9f62c2f6e8fc919e)
  fix(ui): harden daemon restart workspace registration (Leon Letto)
- [`2ea0dd0`](https://github.com/mantoni/beads-ui/commit/2ea0dd08eb71625fa3ae51e64ea6501b4d058154)
  perf(ui): reduce list latency by default sandbox bd calls (Leon Letto)

_Released by [Maximilian Antoni](https://github.com/mantoni) on 2026-03-05._

## 0.10.1

- [`62017f7`](https://github.com/mantoni/beads-ui/commit/62017f74fadb439c7270160ac03866d3554f36a3)
  fix: clipboard copy fallback for non-secure contexts (Rodrigo Blasi)

_Released by [Maximilian Antoni](https://github.com/mantoni) on 2026-03-02._

## 0.10.0

- [`998f256`](https://github.com/mantoni/beads-ui/commit/998f2562b3ad3203c9dd1f627d44b1c2d5ef03a4)
  Do not wrap issue IDs
- [`e3c3345`](https://github.com/mantoni/beads-ui/commit/e3c3345db41cd874db8e33ec79c904cc314e6bf8)
  Improve workspace resolution and fallback db
- [`6de4652`](https://github.com/mantoni/beads-ui/commit/6de4652c336f77c8d8ec9cc13f5a47e9ba1b3857)
  Avoid concurrent DB access to work around dolt panic
- [`011fe9e`](https://github.com/mantoni/beads-ui/commit/011fe9e3dfaa475f744b69ff6b44c3cc23283ad1)
  Support dolt backend
- [`63ed3c3`](https://github.com/mantoni/beads-ui/commit/63ed3c3f3f98aa2c6d621537887d98701289dac6)
  Update beads
- [`cd0a4c5`](https://github.com/mantoni/beads-ui/commit/cd0a4c59fcfe2c9a655ed2079a2a059a242906c5)
  docs: highlight multi-workspace feature in README (#47) (Pablo LION)

_Released by [Maximilian Antoni](https://github.com/mantoni) on 2026-02-25._

## 0.9.3

- [`2e04bc1`](https://github.com/mantoni/beads-ui/commit/2e04bc1eeb5c43e6934d858cd017d80f745a38bb)
  Add -v/—version flag to CLI (#46) (Brent Traut)

_Released by [Maximilian Antoni](https://github.com/mantoni) on 2026-01-23._

## 0.9.2

- [`ffa376c`](https://github.com/mantoni/beads-ui/commit/ffa376cab432b0e321232e8bc0de2caca20a6b17)
  Filter tombstone epics in list adapter (#44) (Brent Traut)

_Released by [Maximilian Antoni](https://github.com/mantoni) on 2026-01-22._

## 0.9.1

- [`bd6f412`](https://github.com/mantoni/beads-ui/commit/bd6f412570a6cb774a683106f9b6efa6ee0e318b)
  Add dependency/dependent counts to issues list view (#35) (Enan Srivastava)
- [`c6391d1`](https://github.com/mantoni/beads-ui/commit/c6391d1b4ea98ae06ea5bc0c251da57123370ef4)
  Fix stuck loading indicator during view switching (#28) (Ofer Shaal)

_Released by [Maximilian Antoni](https://github.com/mantoni) on 2026-01-05._

## 0.9.0

- [`21fdde2`](https://github.com/mantoni/beads-ui/commit/21fdde230713a58001974db29caf288deeedb371)
  Fix eslint warnings
- [`5fa7fea`](https://github.com/mantoni/beads-ui/commit/5fa7fead5359aa8f01d4e12a9432464af7276e33)
  Remove accidental bundle commit
- [`56819d3`](https://github.com/mantoni/beads-ui/commit/56819d321b35a77da690cf028672825752b45544)
  Add drag and drop to boards view (#30) (Brendan O'Leary)
- [`1c52c6f`](https://github.com/mantoni/beads-ui/commit/1c52c6f2a30b7d37439f291b1a3b1d4c26510396)
  Feature/filter toggles v2 (#20) (Frederic Haddad)
- [`b4c7ae6`](https://github.com/mantoni/beads-ui/commit/b4c7ae62fd93d7bbaee936e0f8b659beb774122d)
  fix: add windowsHide to prevent console flash on Windows (#29) (Titusz)
- [`63a269e`](https://github.com/mantoni/beads-ui/commit/63a269ec1f580728bc8977d00b150d69bc1ce535)
  feat: add multi-project workspace switching (#24) (Ofer Shaal)

_Released by [Maximilian Antoni](https://github.com/mantoni) on 2026-01-02._

## 0.8.1

- [`59715e8`](https://github.com/mantoni/beads-ui/commit/59715e8eb7834e6fb6ee8f63f2257da33831d705)
  Fix DB watch loop firing every second

_Released by [Maximilian Antoni](https://github.com/mantoni) on 2025-12-30._

## 0.8.0

- [`2cfcd2d`](https://github.com/mantoni/beads-ui/commit/2cfcd2d4d4aa670b67f7798ecf7dfebaf5d2383c)
  Feature/delete issue from detail (#15) (Frederic Haddad)

_Released by [Maximilian Antoni](https://github.com/mantoni) on 2025-12-22._

## 0.7.0

- [`255845f`](https://github.com/mantoni/beads-ui/commit/255845fd49a1e830dd56404d4d49d71c4f3bd18f)
  feat: add comments to issue detail view (Frederic Haddad)
    >
    > - Add get-comments and add-comment WebSocket handlers
    > - Display comments with author and timestamp in detail view
    > - Add comment input form with Ctrl+Enter submit
    > - Auto-fill author from git config user.name
    > - Fetch comments when loading issue details
    >
    > 🤖 Generated with [Claude Code](https://claude.com/claude-code)
    >
    > Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
    >
- [`a296e98`](https://github.com/mantoni/beads-ui/commit/a296e98dadb59d989cf2acac15666c0d38c635d6)
  Add CHANGES.md to prettier ignore

_Released by [Maximilian Antoni](https://github.com/mantoni) on 2025-12-19._

## 0.6.0

- [`2e25941`](https://github.com/mantoni/beads-ui/commit/2e259418ab24367468daa4449833550f1e9cb297)
  feat(cli): add --host and --port options (cc-vps)
    >
    > Add CLI options to configure the server bind address and port,
    > making it easier to expose the UI on different network interfaces
    > or run multiple instances on different ports.
    >
    > - Add --host <addr> option (default: 127.0.0.1)
    > - Add --port <num> option (default: 3000)
    > - Support HOST and PORT environment variables
    > - Parse --host/--port in server/index.js for dev workflow
    > - Add test coverage for new options
    >
    > Co-authored-by: Christian Catalan <crcatala@gmail.com>
    >
- [`6327f77`](https://github.com/mantoni/beads-ui/commit/6327f779f7b6ad7d274a37168320442bf013b4e0)
  Fix GitHub action commands

_Released by [Maximilian Antoni](https://github.com/mantoni) on 2025-12-17._

## 0.5.0

- [`76964c1`](https://github.com/mantoni/beads-ui/commit/76964c1daf133dded6b8f335cfe9d3184ac96a18)
  Show badge with number of cards per column
- [`155316c`](https://github.com/mantoni/beads-ui/commit/155316c975a93edc806379e769b538c213ee5ed8)
  Add loading indicator
- [`80a837a`](https://github.com/mantoni/beads-ui/commit/80a837a0ef9702fbb7cbbf168526a5a5e3e80d54)
  Show fatal errors in UI
- [`06e8fd9`](https://github.com/mantoni/beads-ui/commit/06e8fd9293b226c88d8b395c7bc28b9c7f4c9610)
  Beads metadata
- [`233c70a`](https://github.com/mantoni/beads-ui/commit/233c70aa9b6ed6e2d7fef487c7b241ffe721cecd)
  npm audit
- [`37b3476`](https://github.com/mantoni/beads-ui/commit/37b3476bc7a0061484de913bee00f285a073ea24)
  Upgrade marked
- [`a1362c9`](https://github.com/mantoni/beads-ui/commit/a1362c97fc770cb18764305453b18f71830bdbef)
  Update express and types
- [`8efc40d`](https://github.com/mantoni/beads-ui/commit/8efc40dadc051a826c64474a1254641294337a81)
  Update vitest, jsdom and esbuild
- [`89cac0f`](https://github.com/mantoni/beads-ui/commit/89cac0ff438a7f1d8b790f339064f2b49ef8ab13)
  Update eslint and plugins
- [`0d7e33e`](https://github.com/mantoni/beads-ui/commit/0d7e33e55259d11c39820c1576db74b7fec26b5e)
  Update prettier and format files
- [`356a201`](https://github.com/mantoni/beads-ui/commit/356a201af8cfce75d82a7f942b5d04698400715c)
  Rename npm scripts for prettier and tsc
- [`31b25d4`](https://github.com/mantoni/beads-ui/commit/31b25d42d23e60c4b30b29281c392179104bf813)
  Upgrade @trivago/prettier-plugin-sort-imports

_Released by [Maximilian Antoni](https://github.com/mantoni) on 2025-12-08._

## 0.4.4

- [`d0f8d1d`](https://github.com/mantoni/beads-ui/commit/d0f8d1d088eda78da14d35ac4fd898cbeb68b534)
  Make labels a separate section in the sidebar
- [`c44fd34`](https://github.com/mantoni/beads-ui/commit/c44fd3484ade8ef7ea56eb608d11bb07ebbf665b)
  Fix flaky board test due to time-sensitive closed filter (Nikolai
  Prokoschenko)

_Released by [Maximilian Antoni](https://github.com/mantoni) on 2025-11-13._

## 0.4.3

- [`4a5b4cd`](https://github.com/mantoni/beads-ui/commit/4a5b4cda8b22437eac2636c0a5556d0b52897f5f)
  Add author (ignore in changes)
- [`a34855e`](https://github.com/mantoni/beads-ui/commit/a34855ea26304554df2056ac6ed5224db25d795a)
  Ignore tsconfig.tsbuildinfo
- [`a7ebbc1`](https://github.com/mantoni/beads-ui/commit/a7ebbc1ba8538107f0ec106638115c4d78c48711)
  Add logging instead of ignoring issues
- [`54c9488`](https://github.com/mantoni/beads-ui/commit/54c94885c28a9bbdaaa60de6eaf8b91eac567bec)
  Mention `npm link` for development
- [`a137db0`](https://github.com/mantoni/beads-ui/commit/a137db02386457b7277f9566b5f6fc0079581bf7)
  Display beads issue ID as is
- [`ee343ee`](https://github.com/mantoni/beads-ui/commit/ee343ee39cc5ef9c7d7ec7df0a4f2b2f0e4b51ba)
  Remove try-catch around localStorage access
- [`619a107`](https://github.com/mantoni/beads-ui/commit/619a107948b47bcfa6c7102ca0e90f3d575ac3a8)
  Upgrade vitest to v4
- [`caed1b5`](https://github.com/mantoni/beads-ui/commit/caed1b5005645c2cf566ac3c3eddc4b5b73a4f74)
  Use vitest restoreMocks config
- [`0a28b5b`](https://github.com/mantoni/beads-ui/commit/0a28b5bf5cc278a6775a051c712ff560dfab2b81)
  Fix: Use BEADS_DB env var instead of --db flag (Nikolai Prokoschenko)

_Released by [Maximilian Antoni](https://github.com/mantoni) on 2025-11-01._

## 0.4.2

- [`66e31ff`](https://github.com/mantoni/beads-ui/commit/66e31ff0e053f3691657ce1175fd9b02155ca699)
  Fix pre-bundled app: Check for bundle instead of NODE_ENV

_Released by [Maximilian Antoni](https://github.com/mantoni) on 2025-10-29._

## 0.4.1

- [`03d3477`](https://github.com/mantoni/beads-ui/commit/03d34774cd35bf03d142d2869633327cbe4902bd)
  Fix missing protocol.js in bundle

_Released by [Maximilian Antoni](https://github.com/mantoni) on 2025-10-29._

## 0.4.0

- [`20a787c`](https://github.com/mantoni/beads-ui/commit/20a787c248225b4959b18b703894daf483f380b6)
  Refine and apply coding standards
- [`aedc73f`](https://github.com/mantoni/beads-ui/commit/aedc73f0c494dd391fcc9ec7ecbf19b01b37e69a)
  Invert CLI option from no_open to open
- [`03a2a4f`](https://github.com/mantoni/beads-ui/commit/03a2a4f0ddb93df717e9f12b0c4600be12b390b5)
  Add debug-based logging across codebase
- [`eed2d5c`](https://github.com/mantoni/beads-ui/commit/eed2d5c71c45131023d1ec047a9f84e84d057fdb)
  Pre-bundle frontend for npm package
- [`d07f743`](https://github.com/mantoni/beads-ui/commit/d07f7437c67bfdbded470c6ccea556a78b3452b3)
  Remove obsolete BDUI_NO_OPEN
- [`1c1a003`](https://github.com/mantoni/beads-ui/commit/1c1a0035fd069d030430d56713e64fbaf0224db8)
  Improve project description

_Released by [Maximilian Antoni](https://github.com/mantoni) on 2025-10-28._

## 0.3.1

- [`3912ae5`](https://github.com/mantoni/beads-ui/commit/3912ae552b1cc97e61fbaaa0815ca77675c542e4)
  Status filter intermittently not applied on Issues screen
- [`a160484`](https://github.com/mantoni/beads-ui/commit/a16048479d1d7d61ed4ad4e53365a5736eb053af)
  Upgrade eslint-plugin-jsdoc and switch config

_Released by [Maximilian Antoni](https://github.com/mantoni) on 2025-10-27._

## 0.3.0

- 🍏 Rewrite data-exchange layer to push-only updates via WebSocket.
- 🐛 Heaps of bug fixes.

## 0.2.0

- 🍏 Add "Blocked" column to board
- 🍏 Support `design` in issue details
- 🍏 Add filter to closed column and improve sorting
- 🍏 Unblock issue description editing
- 🍏 CLI: require --open to launch browser, also on restart
- 🍏 Up/down/left/right keyboard navigation on board
- 🍏 Up/down keyboard navigation on issues list
- 🍏 CLI: require --open to launch browser
- 🍏 Make issue notes editable
- 🍏 Show toast on disconnect/reconnect
- 🍏 Support creating a new issue via "New" dialog
- 🍏 Copy issue IDs to clipboard
- 🍏 Open issue details in dialog
- 🐛 Remove --limit 10 when fetching closed issues
- ✨ Events: coalesce issues-changed to avoid redundant full refresh
- ✨ Update issues
- ✨ Align callback function naming
- 📚 Improve README
- 📚 Add package description, homepage and repo

## 0.1.2

- 📦 Specify files to package

## 0.1.1

- 📚 Make screenshot src absolute and add license

## 0.1.0

- 🥇 Initial release
