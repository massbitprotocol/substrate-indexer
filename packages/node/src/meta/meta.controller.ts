import { Controller, Get } from '@nestjs/common';
import { MetaService } from './meta.service';

@Controller('meta')
export class MetaController {
  constructor(private metaService: MetaService) {}

  @Get()
  getMeta() {
    return this.metaService.getMeta();
  }
}
