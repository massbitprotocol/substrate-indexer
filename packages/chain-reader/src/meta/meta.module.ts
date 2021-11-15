import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { MetaController } from './meta.controller';
import { MetaService } from './meta.service';

@Module({
  imports: [],
  controllers: [MetaController, HealthController],
  providers: [MetaService, HealthService],
})
export class MetaModule {}
