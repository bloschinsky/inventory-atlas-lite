import multer from 'multer';

/*
  The single place that turns an error into an API response. Errors carrying a `status` keep it and
  their own message; a unique-constraint violation and an upload error get their documented answer.
*/
export const errorHandler = (error, _req, res, _next) => {
  console.error(error);
  const duplicate = error.code === 'SQLITE_CONSTRAINT_UNIQUE';
  const uploadError = error instanceof multer.MulterError;
  res.status(error.status || (duplicate ? 409 : (uploadError ? 400 : 500)))
    .json({ error: duplicate ? 'A record with this name already exists.' : (error.message || 'Unexpected server error.') });
};

// While the active database is being replaced, nothing may write to the connection being swapped.
// Restore and reset requests pass through so their own service can answer with the exact reason.
export const maintenanceGuard = maintenance => (req, res, next) => {
  const writes = req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE';
  const replacement = req.path.startsWith('/api/restore/') || req.path.startsWith('/api/database/reset/');
  if (writes && !replacement && maintenance.isMaintenance()) {
    return res.status(503).json({ error: 'The database is being restored or reset. Try again in a moment.' });
  }
  next();
};
