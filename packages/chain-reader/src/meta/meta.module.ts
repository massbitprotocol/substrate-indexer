import { Module } from '@nestjs/common';
import { IndexerModule } from '../indexer/indexer.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { MetaController } from './meta.controller';
import { MetaService } from './meta.service';

@Module({
  imports: [IndexerModule],
  controllers: [MetaController, HealthController],
  providers: [MetaService, HealthService],
})
export class MetaModule {}
