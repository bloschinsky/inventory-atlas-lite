/*
  An application error as the API reports it: a stable code with structured parameters, never text.
  The browser turns it into a message in the active language (errors.<code> in the client locales),
  so the server stays locale-agnostic. The shared validators throw it too, which lets the batch
  previews show exactly the refusal the API would answer with.
*/
export class AppError extends Error {
  constructor(code, params = {}, status = 400) {
    // The code doubles as the message, so logs and assertions stay readable without any English text.
    super(code);
    this.name = 'AppError';
    this.code = code;
    this.params = params;
    this.status = status;
  }
}

// The JSON form of an application error: the API body, and a nested reason inside another error.
export const errorBody = error => ({ code: error.code, params: error.params ?? {} });
