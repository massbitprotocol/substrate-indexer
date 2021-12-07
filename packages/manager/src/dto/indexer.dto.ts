export class CreateIndexerDto {
  name: string;
  description: string;
  repository: string;
  imageUrl: string;
}

export class CreateIndexerResponseDto {
  constructor(partial: Partial<CreateIndexerResponseDto>) {
    Object.assign(this, partial);
  }

  id: string;
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
  status: string;
}
