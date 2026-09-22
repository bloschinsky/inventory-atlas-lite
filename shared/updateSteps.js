/*
  The detailed steps the privileged updater reports inside its coarse states, in the order it runs
  them. The server accepts only these identifiers from the status file, and the About dialog turns
  them into its progress display. Each step belongs to one of the five phases the dialog shows, and
  a long step carries a few hints that rotate while it runs; every hint describes what really
  happens during that step, only in a lighter voice.
*/
export const UPDATE_PHASES = ['Download', 'Build', 'Back up', 'Install', 'Verify'];

export const UPDATE_STEPS = [
  { id: 'resolving_release', phase: 'Download', label: 'Asking GitHub for the latest release' },
  { id: 'downloading_archive', phase: 'Download', label: 'Downloading the release archive' },
  { id: 'verifying_checksum', phase: 'Download', label: 'Checking the SHA-256 checksum' },
  { id: 'unpacking', phase: 'Download', label: 'Unpacking the tarball' },
  {
    id: 'installing_dependencies',
    phase: 'Build',
    label: 'Installing dependencies with npm ci',
    hints: [
      'Resolving every package pinned in package-lock.json',
      'Unpacking a few hundred packages into node_modules',
      'Politely declining the CUDA and TensorRT binaries',
      'Fetching prebuilt better-sqlite3 and sharp binaries',
      'Running the install scripts of native modules'
    ]
  },
  {
    id: 'building_client',
    phase: 'Build',
    label: 'Compiling the Vue client with Vite',
    hints: [
      'Compiling single-file components',
      'Tree-shaking the code nobody imports',
      'Rollup is splitting the bundle into chunks',
      'Minifying JavaScript and CSS',
      'Fingerprinting asset filenames for the cache'
    ]
  },
  { id: 'pruning_dependencies', phase: 'Build', label: 'Pruning development dependencies' },
  { id: 'staging_code', phase: 'Build', label: 'Staging the new code next to the running one' },
  { id: 'backing_up_database', phase: 'Back up', label: 'Snapshotting the SQLite database' },
  { id: 'stopping_service', phase: 'Install', label: 'Stopping the application' },
  { id: 'swapping_code', phase: 'Install', label: 'Swapping in the new code' },
  { id: 'reloading_units', phase: 'Install', label: 'Reloading the systemd units' },
  { id: 'starting_service', phase: 'Install', label: 'Starting Node.js' },
  { id: 'checking_health', phase: 'Verify', label: 'Waiting for the health check to report the new version' },
  { id: 'rolling_back', phase: 'Install', label: 'Rolling back to the previous version' }
];

export const UPDATE_STEP_IDS = new Set(UPDATE_STEPS.map(step => step.id));
