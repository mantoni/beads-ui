# Changes

## 0.10.0

- feat: add multi-instance CLI management
  >
  > Enable running multiple beads-ui instances simultaneously with CLI tools
  > for process isolation and flexible network configuration.
  >
  > New commands:
  > - `bdui list` - Show all running instances with status
  > - `bdui discover <paths>` - Find all beads projects in directory tree
  > - `bdui stop-all` - Stop all registered instances
  > - `bdui restart-all` - Restart all registered instances
  >
  > Each instance uses project-local runtime in `.beads/.bdui/` with isolated
  > PID file and logs. Central registry at `~/.bdui/instances.json` tracks
  > all running instances for CLI management.
  >
  > Backward compatible: Single-instance mode works unchanged. Opt into
  > multi-instance by using `--port` flag per project.
  >
  > See `docs/adr/003-multi-instance-runtime.md` for architecture details.
  >
- feat: add cosmiconfig-based configuration system
  >
  > User preferences can now be configured via files in addition to
  > environment variables. Supports multiple formats (JSON, YAML, JS)
  > and standard locations (~/.bduirc, ~/.config/bdui/, package.json).
  >
  > Configuration precedence: ENV > config file > defaults
  >
  > New config options:
  > - `discoveryPaths`: Array of paths to search for beads projects
  > - `defaultPortStart`: Starting port for multi-instance mode
  >
  > Environment variables still supported for backward compatibility:
  > - `BDUI_DISCOVERY_PATHS` (colon-separated)
  > - `BDUI_DEFAULT_PORT_START`
  >
- feat: add migration tool for legacy instances
  >
  > `bdui migrate` detects old global instances and guides users through
  > migrating to project-local runtime with configuration instructions.
  >
- feat: add session completion workflow to AGENTS.md
  >
  > Document mandatory workflow for AI agents to ensure work is properly
  > committed and pushed before ending sessions.
  >
- test: comprehensive test suite for multi-instance features
  >
  > Added 142 new tests (240 → 382 total) with 72.89% overall coverage.
  >
  > New test files:
  > - server/cli/config.test.js (21 tests, 100% coverage)
  > - server/cli/registry.test.js (20 tests, 94% coverage)
  > - server/cli/discover.test.js (18 tests, 100% coverage)
  > - server/cli/migrate.test.js (29 tests, unit tests)
  > - server/cli/migrate.integration.test.js (4 tests, real process spawning)
  > - server/cli/commands.multi-instance.test.js (26 tests, 88% coverage)
  > - app/views/workspace-picker.test.js (15 tests, 100% coverage)
  > - app/utils/status-badge.test.js (8 tests, 100% coverage)
  >
  > server/cli coverage: 31.81% → 79.05% (+47.24%)
  >
- fix: board switcher modal UX improvements
  >
  > - Fixed click-outside to close (use classList.contains check)
  > - Added dark mode support (modal text colors)
  > - Improved close button hover states
  >

_Released by [TBD] on TBD._

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
