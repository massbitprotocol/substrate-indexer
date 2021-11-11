import { Module } from '@nestjs/common';
import {
  makeGaugeProvider,
  PrometheusModule,
} from '@willsoto/nestjs-prometheus';
import { MetricEventListener } from './event.listener';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { MetaController } from './meta.controller';
import { MetaService } from './meta.service';

@Module({
  imports: [PrometheusModule.register()],
  controllers: [MetaController, HealthController],
  providers: [
    MetricEventListener,
    makeGaugeProvider({
      name: 'indexer_api_connected',
      help: 'The indexer api connection status',
    }),
    makeGaugeProvider({
      name: 'indexer_injected_api_connected',
      help: 'The indexer injected api connection status',
    }),
    makeGaugeProvider({
      name: 'indexer_processing_block_height',
      help: 'The current processing block height',
    }),
    makeGaugeProvider({
      name: 'indexer_processed_block_height',
      help: 'The last processed block height',
    }),
    makeGaugeProvider({
      name: 'indexer_target_block_height',
      help: 'The latest finalized block height',
    }),
    makeGaugeProvider({
      name: 'indexer_best_block_height',
      help: 'The latest best block height',
    }),
    makeGaugeProvider({
      name: 'indexer_block_queue_size',
      help: 'The size of fetched block queue',
    }),
    makeGaugeProvider({
      name: 'indexer_blocknumber_queue_size',
      help: 'The size of fetched block number queue',
    }),
    MetaService,
    HealthService,
  ],
})
export class MetaModule {}