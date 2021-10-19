import {Allow, IsString} from 'class-validator';

export class ProjectManifestBaseImpl {
  @Allow()
  definitions: object;
  @IsString()
  description: string;
  @IsString()
  repository: string;
  @IsString()
  specVersion: string;
}
