import {Allow, IsString} from 'class-validator';

export class ProjectManifestBaseImpl {
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
