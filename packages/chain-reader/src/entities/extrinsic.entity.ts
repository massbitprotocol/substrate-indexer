import {Column, Entity, Index, PrimaryColumn} from 'typeorm';

@Entity()
export class Extrinsic {
  constructor(partial: Partial<Extrinsic>) {
    Object.assign(this, partial);
  }

  @PrimaryColumn()
  id!: string;

  @Index()
  @Column()
  module!: string;

  @Index()
  @Column()
  call!: string;

  @Index()
  @Column({type: 'bigint'})
  blockHeight!: number;

  @Column({nullable: true})
  success: boolean | null;

  @Column()
  isSigned!: boolean;
}
