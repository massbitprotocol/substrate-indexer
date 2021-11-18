import {Expose} from 'class-transformer';

export class DeployIndexerDto {
  url: string;
}

export class DeployIndexerResponse {
  constructor(partial: Partial<DeployIndexerResponse>) {
    Object.assign(this, partial);
  }

  id!: string;
}

export class IndexerDto {
  constructor(partial: Partial<IndexerDto>) {
    Object.assign(this, partial);
  }

  @Expose()
  id!: string;

  @Expose()
  name!: string;
}
