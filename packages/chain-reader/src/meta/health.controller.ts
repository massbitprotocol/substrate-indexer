import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { getLogger } from '../utils/logger';
import { HealthService } from './health.service';

const logger = getLogger('health');

@Controller('health')
export class HealthController {
  constructor(private healthService: HealthService) {}

  @Get()
  getHealth(): void {
    try {
      this.healthService.getHealth();
    } catch (e) {
      logger.error(e.message);
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: e.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
