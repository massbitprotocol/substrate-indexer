import {IsNotEmpty, IsString, MaxLength} from 'class-validator';

export class CreateIndexerDto {
  constructor(partial: Partial<CreateIndexerDto>) {
    Object.assign(this, partial);
  }

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  @MaxLength(255)
  description: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  repository: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
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
