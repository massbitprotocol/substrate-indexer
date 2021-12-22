import {ArgumentsHost, Catch, ExceptionFilter, HttpException} from '@nestjs/common';
import {HttpArgumentsHost} from '@nestjs/common/interfaces/features/arguments-host.interface';
// eslint-disable-next-line import/no-extraneous-dependencies
import {Response, Request} from 'express';
import {MassbitException, MassbitInternalServerError} from './exception';

@Catch()
export class GlobalHandleExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx: HttpArgumentsHost = host.switchToHttp();
    const response: Response = ctx.getResponse();
    const request: Request = ctx.getRequest();

    if (exception instanceof MassbitException) {
      GlobalHandleExceptionFilter.sendResponse(request, response, exception);
    } else {
      GlobalHandleExceptionFilter.sendResponse(request, response, new MassbitInternalServerError());
    }
  }

  private static sendResponse(request: Request, response: Response, exception: MassbitException): void {
    response.status(exception.getStatus()).json(exception.prepareResponse());
  }
}
