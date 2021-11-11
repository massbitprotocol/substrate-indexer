import {Allow, IsString} from 'class-validator';

export class BaseManifest {
  @IsString()
  name: string;
  @Allow()
  definitions: object;
  @IsString()
  description: string;
  @IsString()
  repository: string;
  @IsString()
  specVersion: string;
}
