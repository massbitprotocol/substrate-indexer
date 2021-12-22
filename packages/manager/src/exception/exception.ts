import {HttpException, HttpStatus, ValidationError} from '@nestjs/common';

export type MassbitExceptionInformation = {
  statusCode: number;
  message: string;
  data?: unknown;
};

export type MassbitExceptionResponse = MassbitExceptionInformation & {
  traceId?: string;
};

export class MassbitException extends HttpException {
  private readonly customInformation: MassbitExceptionInformation;

  constructor(statusCode: HttpStatus, message: string, data?: unknown) {
    super(message, statusCode);
    this.customInformation = {
      statusCode,
      message,
      data,
    };
  }

  prepareResponse(traceId?: string): MassbitExceptionResponse {
    return {
      ...this.customInformation,
      traceId,
    };
  }
}

type DataError = {
  [key: string]: {[key: string]: string} | null;
};
export class MassbitBadRequestException extends MassbitException {
  constructor(message: string, data?: unknown) {
    super(HttpStatus.BAD_REQUEST, message, data);
  }

  static fromValidationErrors(errors: ValidationError[]): MassbitBadRequestException {
    const data: DataError = {};
    const parseErrors = (errs: ValidationError[], result: DataError, parentProperty?: string): void => {
      errs.forEach((error) => {
        const property = parentProperty ? `${parentProperty}.${error.property}` : error.property;
        if (error.constraints) {
          // eslint-disable-next-line no-param-reassign
          result[property] = error.constraints;
        } else if (error.children?.length) {
          parseErrors(error.children, result, property);
        }
      });
    };
    parseErrors(errors, data);
    return new MassbitBadRequestException('Validation failed', data);
  }
}

export class MassbitUnauthorizedException extends MassbitException {
  constructor(message: string, data?: unknown) {
    super(HttpStatus.UNAUTHORIZED, message, data);
  }
}

export class MassbitForbiddenException extends MassbitException {
  constructor(message: string, data?: unknown) {
    super(HttpStatus.FORBIDDEN, message, data);
  }
}

export class MassbitNotFoundException extends MassbitException {
  constructor(message: string, data?: unknown) {
    super(HttpStatus.NOT_FOUND, message, data);
  }
}

export class MassbitInternalServerError extends MassbitException {
  constructor() {
    super(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal Server Error');
  }
}
