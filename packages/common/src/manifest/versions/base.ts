import {Allow, IsString} from 'class-validator';

export class ManifestBase {
  @IsString()
  name: string;

  @Allow()
  // eslint-disable-next-line @typescript-eslint/ban-types
  definitions: object;

  @IsString()
  description: string;

  @IsString()
  repository: string;

  @IsString()
  specVersion: string;
}
