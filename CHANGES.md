# Changes

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
