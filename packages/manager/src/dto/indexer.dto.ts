export class DeployIndexerDto {
  id: string;
  name: string;
  description: string;
  repository: string;
  imageUrl: string;
}

export class DeployIndexerResponseDto {
  constructor(partial: Partial<DeployIndexerResponseDto>) {
    Object.assign(this, partial);
  }

  id!: string;
}

export class IndexerDto {
  constructor(partial: Partial<IndexerDto>) {
    Object.assign(this, partial);
  }

  id: string;
  name: string;
  description: string;
  repository: string;
  imageUrl: string;
}
