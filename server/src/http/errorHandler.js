import multer from 'multer';
import { AppError, errorBody } from '../../../shared/appError.js';

const UPLOAD_CODES = {
  LIMIT_FILE_SIZE: 'UPLOAD_FILE_TOO_LARGE',
  LIMIT_FILE_COUNT: 'UPLOAD_TOO_MANY_FILES',
  LIMIT_UNEXPECTED_FILE: 'UPLOAD_UNEXPECTED_FILE'
};

/*
  Maps any error to the status and body the API answers with. Only application errors keep their
  own code and parameters; a unique-constraint violation, an upload limit, and an unreadable request
  body get their documented codes, and anything else is an unexpected failure whose message, stack,
  and details stay in the server log.
*/
export const errorResponse = error => {
  if (error instanceof AppError) return { status: error.status, body: errorBody(error) };
  if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') return { status: 409, body: { code: 'DUPLICATE_NAME', params: {} } };
  if (error instanceof multer.MulterError) return { status: 400, body: { code: UPLOAD_CODES[error.code] || 'UPLOAD_FAILED', params: {} } };
  if (error?.type === 'entity.parse.failed') return { status: 400, body: { code: 'INVALID_JSON_BODY', params: {} } };
  if (error?.type === 'entity.too.large') return { status: 413, body: { code: 'REQUEST_TOO_LARGE', params: {} } };
  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
  return { status, body: { code: status === 500 ? 'UNEXPECTED_ERROR' : 'INVALID_REQUEST', params: {} } };
};

// The single place that turns an error into an API response: `{ error: { code, params } }`.
export const errorHandler = (error, _req, res, _next) => {
  console.error(error);
  const { status, body } = errorResponse(error);
  res.status(status).json({ error: body });
};

// While the active database is being replaced, nothing may write to the connection being swapped.
// Restore and reset requests pass through so their own service can answer with the exact reason.
export const maintenanceGuard = maintenance => (req, res, next) => {
  const writes = req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE';
  const replacement = req.path.startsWith('/api/restore/') || req.path.startsWith('/api/database/reset/');
  if (writes && !replacement && maintenance.isMaintenance()) {
    return res.status(503).json({ error: { code: 'DATABASE_MAINTENANCE', params: {} } });
  }
  next();
};
