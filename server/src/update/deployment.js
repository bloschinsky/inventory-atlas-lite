/*
  How this installation was deployed, and therefore what the update feature may offer. The value is
  configured by the installer that created the deployment; it is never guessed from the filesystem,
  cgroups, or /proc, because a wrong guess here would decide whether a privileged updater may run.
*/
export const DEPLOYMENT_TYPES = ['proxmox-lxc', 'docker', 'manual', 'development'];

// Only the Proxmox/LXC installation ships the privileged updater, so only it may update itself.
const SELF_UPDATING = new Set(['proxmox-lxc']);

export const resolveDeployment = (environment = process.env) => {
  const configured = environment.DEPLOYMENT_TYPE?.trim();
  const fallback = environment.NODE_ENV === 'production' ? 'manual' : 'development';
  if (configured && !DEPLOYMENT_TYPES.includes(configured)) {
    console.warn(`Unknown DEPLOYMENT_TYPE "${configured}"; treating this installation as "${fallback}".`);
  }
  const type = configured && DEPLOYMENT_TYPES.includes(configured) ? configured : fallback;
  return { type, canSelfUpdate: SELF_UPDATING.has(type) };
};
