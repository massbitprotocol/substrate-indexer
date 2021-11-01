import {Column, Entity, PrimaryColumn} from 'typeorm';

@Entity()
export class SpecVersion {
  constructor(partial: Partial<SpecVersion>) {
    Object.assign(this, partial);
  }

  @PrimaryColumn()
  id!: string;

  @Column({type: 'bigint'})
  blockHeight!: number;
}
