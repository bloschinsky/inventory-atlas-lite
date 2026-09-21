import fs from 'node:fs';

/*
  The whole privilege boundary of the update feature. The application, which runs unprivileged and
  with NoNewPrivileges=true, cannot start a systemd unit itself and is deliberately not given sudo.
  Instead it creates one marker file in its own data directory; a systemd path unit watches for that
  file and starts the dedicated oneshot updater as root. The marker carries no command, no version,
  no URL, and no arguments, so nothing a request could contain ever reaches the privileged side.
*/
export class SystemdUpdateTrigger {
  constructor({ requestFile, pathUnitFile }) {
    this.requestFile = requestFile;
    this.pathUnitFile = pathUnitFile;
  }

  // A deployment that was installed before the updater unit existed cannot be triggered this way.
  isInstalled() {
    return fs.existsSync(this.pathUnitFile);
  }

  start() {
    fs.writeFileSync(this.requestFile, `${new Date().toISOString()}\n`);
  }
}
