export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class ValidationError extends HttpError {
  constructor(message: string) {
    super(400, message);
  }
}

export const notFound = () => new HttpError(404, "找不到這本書");
export const duplicateIsbn = () => new HttpError(409, "書櫃裡已經有相同 ISBN 的書");
