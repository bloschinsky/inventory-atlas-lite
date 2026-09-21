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
export const maintenanceGuard = restoreService => (req, res, next) => {
  const writes = req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE';
  if (writes && !req.path.startsWith('/api/restore/') && restoreService.isMaintenance()) {
    return res.status(503).json({ error: 'A backup is being restored. Try again in a moment.' });
  }
  next();
};
