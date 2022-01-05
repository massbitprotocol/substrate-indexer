import {ArgumentsHost, Catch, ExceptionFilter, HttpException} from '@nestjs/common';
import {HttpArgumentsHost} from '@nestjs/common/interfaces/features/arguments-host.interface';
import {Response} from 'express';
import {MassbitException, MassbitInternalServerError} from './exception';

@Catch()
export class GlobalHandleExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx: HttpArgumentsHost = host.switchToHttp();
    const response: Response = ctx.getResponse();
    if (exception instanceof MassbitException) {
      GlobalHandleExceptionFilter.sendResponse(response, exception);
    } else {
      GlobalHandleExceptionFilter.sendResponse(response, new MassbitInternalServerError());
    }
  }

  private static sendResponse(response: Response, exception: MassbitException): void {
    response.status(exception.getStatus()).json(exception.prepareResponse());
  }
}
